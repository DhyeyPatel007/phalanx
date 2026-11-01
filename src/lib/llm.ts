// LLM Provider System — brief §7, phase 1.
// General API layer supporting OpenAI-compatible chat completions.
// Supported: gemini (via OpenAI endpoint), openai, grok, deepseek, kimi, groq, nvidia, custom.
// Hard invariants:
// - draft() returns string | null; returns null immediately when no key is configured.
// - 60s default timeout for reasoning models (e.g. GLM-5.3-Flash, DeepSeek-R1).
// - Up to 3 attempts on network/5xx errors (1s, 2s backoff); 4xx fails immediately.
// - Strips <think>...</think> blocks from output before returning.
// - Any failure returns null; NEVER throws into the swarm.
// - Never log or leak API keys, tokens, or raw buyer contact details.

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  defaultModel: string;
  cheapModel: string;
  envKey: string;
}

export const PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
  gemini: {
    name: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.8-flash",
    // NOTE: In Google's Gemini 3.8 line, gemini-3.8-flash-lite is a TTS model
    // (gemini-3.8-flash-lite-tts). For text chat, gemini-3.8-flash is the verified model.
    cheapModel: "gemini-3.8-flash",
    envKey: "GEMINI_API_KEY",
  },
  openai: {
    name: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    cheapModel: "gpt-4o-mini",
    envKey: "OPENAI_API_KEY",
  },
  grok: {
    name: "grok",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-4",
    cheapModel: "grok-4",
    envKey: "XAI_API_KEY",
  },
  deepseek: {
    name: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    cheapModel: "deepseek-chat",
    envKey: "DEEPSEEK_API_KEY",
  },
  kimi: {
    name: "kimi",
    baseUrl: "https://api.moonshot.ai/v1",
    defaultModel: "kimi-k2.5",
    cheapModel: "kimi-k2.5",
    envKey: "MOONSHOT_API_KEY",
  },
  groq: {
    name: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    cheapModel: "llama-3.1-8b-instant",
    envKey: "GROQ_API_KEY",
  },
  nvidia: {
    name: "nvidia",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    defaultModel: "nvidia/llama-3.1-nemotron-70b-instruct",
    cheapModel: "meta/llama-3.1-8b-instruct",
    envKey: "NVIDIA_API_KEY",
  },
  custom: {
    name: "custom",
    baseUrl: process.env.LLM_BASE_URL || "",
    defaultModel: process.env.LLM_MODEL || "",
    cheapModel: process.env.LLM_MODEL || "",
    envKey: "LLM_API_KEY",
  },
};

export function getProviderConfig(name?: string): ProviderConfig | undefined {
  const key = (name || process.env.LLM_PROVIDER || "gemini").toLowerCase().trim();
  return PROVIDER_REGISTRY[key];
}

export function resolveKey(provider: ProviderConfig): string | null {
  // Allow LLM_API_KEY as a universal override or custom key
  const override = process.env.LLM_API_KEY?.trim();
  if (override) return override;
  const specific = process.env[provider.envKey]?.trim();
  return specific || null;
}

export function isLLMConfigured(): boolean {
  const provider = getProviderConfig();
  if (!provider) return false;
  return Boolean(resolveKey(provider));
}

/**
 * Strip <think>...</think> reasoning blocks from model output.
 * Ensures reasoning model deliberation never leaks into rebuttals or Judge summaries.
 */
export function stripThinking(text: string): string {
  if (!text) return "";
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export interface DraftOptions {
  model?: string;
  cheap?: boolean;
  system?: string;
  timeoutMs?: number;
}

/**
 * Execute a chat completion draft against the configured provider.
 * Returns null if no key is configured or if the request fails (after 3 attempts with backoff).
 * Never throws.
 */
export async function draft(
  prompt: string,
  opts: DraftOptions = {},
): Promise<string | null> {
  const providerName = (process.env.LLM_PROVIDER || "gemini").toLowerCase().trim();
  const provider = PROVIDER_REGISTRY[providerName] || PROVIDER_REGISTRY.custom;
  if (!provider) return null;

  const apiKey = resolveKey(provider);
  if (!apiKey) return null;

  const baseUrl = (provider.name === "custom" ? process.env.LLM_BASE_URL : provider.baseUrl) || provider.baseUrl;
  if (!baseUrl) return null;

  const model =
    opts.model ||
    process.env.LLM_MODEL?.trim() ||
    (opts.cheap ? provider.cheapModel : provider.defaultModel);

  if (!model) return null;

  // MiroFish learning: slow reasoning models (e.g. GLM-5.3-Flash, DeepSeek-R1) easily
  // exceed 10s. Default is raised to 60s to prevent premature client timeouts.
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) {
    messages.push({ role: "system", content: opts.system });
  }
  messages.push({ role: "user", content: prompt });

  const body = JSON.stringify({
    model,
    messages,
    temperature: 0.2,
  });

  // Bounded attempt budget (Decision #8): per-call timeout 60s.
  // Do NOT retry on timeout (AbortError); only retry once on fast (<4000ms) network/5xx drops.
  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const attemptStart = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const rawText = json.choices?.[0]?.message?.content?.trim();
        if (!rawText) return null;
        // Strip <think>...</think> blocks from reasoning output
        const cleaned = stripThinking(rawText);
        return cleaned || null;
      }

      // 4xx errors (client/auth/validation errors) fail immediately without retry
      if (res.status >= 400 && res.status < 500) {
        return null;
      }

      // 5xx errors: only retry once if failure was immediate (< 4000ms)
      const elapsed = Date.now() - attemptStart;
      if (attempt === 1 && elapsed < 4000) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      return null;
    } catch (err) {
      clearTimeout(timer);
      const elapsed = Date.now() - attemptStart;
      const isAbort = (err as { name?: string })?.name === "AbortError";
      // Fast-fail on timeout or slow abort
      if (isAbort || elapsed >= 4000) {
        return null;
      }
      if (attempt === 1) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      return null;
    }
  }

  return null;
}
