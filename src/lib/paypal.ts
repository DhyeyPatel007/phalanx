// PayPal client — server only. OAuth2 client-credentials token, cached until
// expiry, Sandbox base https://api-m.sandbox.paypal.com. Refresh on 401 once,
// then fail loudly. No tokens, secrets, or buyer PII in logs (brief §6).
// Phase 0: endpoints verified against live Disputes v1 reference, Oct 30 2026.
// NOTE: no live Sandbox execution in this run — this client is used for
// list/detail + webhook verification only until Dhyey confirms Sandbox accounts.

const BASE = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";

let cachedToken: { token: string; expiresAt: number } | null = null;

export function paypalConfigured(): boolean {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET,
  );
}

export function webhookConfigured(): boolean {
  return Boolean(process.env.PAYPAL_WEBHOOK_ID);
}

async function fetchToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) {
    return cachedToken.token;
  }
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
        ).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`PayPal token request failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return cachedToken.token;
}

async function paypalFetch(
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<Response> {
  if (!paypalConfigured()) {
    throw new Error(
      "PayPal credentials not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET). Seeded demo works without them.",
    );
  }
  const token = await fetchToken();
  // Content-Type: only force application/json for non-FormData bodies.
  // A FormData body (provide-evidence multipart, Phase 0 row 2) must let
  // fetch auto-generate `multipart/form-data; boundary=...` — forcing
  // application/json here would corrupt the upload (400/415 from PayPal).
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${token}`,
  };
  if (!isFormData && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers,
  });
  if (res.status === 401 && !retried) {
    cachedToken = null;
    return paypalFetch(path, init, true);
  }
  return res;
}

/** GET /v1/customer/disputes — list disputes for the merchant account. */
export async function listPayPalDisputes(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const res = await paypalFetch(`/v1/customer/disputes${qs}`);
  if (!res.ok) {
    throw new Error(
      `PayPal list disputes failed: HTTP ${res.status} (debug id: ${res.headers.get("paypal-debug-id") ?? "n/a"})`,
    );
  }
  return res.json();
}

/** GET /v1/customer/disputes/{id} — full detail incl. HATEOAS links +
 *  allowed_response_options. The live response is the only authority on
 *  which actions are allowed (Phase 0 row 4). */
export async function getPayPalDispute(id: string) {
  const res = await paypalFetch(`/v1/customer/disputes/${encodeURIComponent(id)}`);
  if (!res.ok) {
    throw new Error(
      `PayPal show dispute failed: HTTP ${res.status} (debug id: ${res.headers.get("paypal-debug-id") ?? "n/a"})`,
    );
  }
  return res.json();
}

export interface WebhookVerificationInput {
  auth_algo: string;
  cert_url: string;
  transmission_id: string;
  transmission_sig: string;
  transmission_time: string;
  webhook_event: unknown;
}

/**
 * POST /v1/notifications/verify-webhook-signature — PayPal verifies the
 * signature for us (Phase 0 row 5). Returns true only when PayPal says
 * verification_status === "SUCCESS". Mock/simulator events are not
 * supported by this endpoint — they must use the demo replay path instead.
 */
export async function verifyWebhookSignature(
  input: WebhookVerificationInput,
): Promise<boolean> {
  if (!webhookConfigured()) {
    throw new Error(
      "PAYPAL_WEBHOOK_ID not configured — cannot verify webhook signature.",
    );
  }
  const res = await paypalFetch("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: JSON.stringify({ ...input, webhook_id: process.env.PAYPAL_WEBHOOK_ID }),
  });
  if (!res.ok) {
    throw new Error(
      `PayPal verify-webhook-signature failed: HTTP ${res.status}`,
    );
  }
  const body = (await res.json()) as { verification_status?: string };
  return body.verification_status === "SUCCESS";
}
