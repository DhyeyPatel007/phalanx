# PHALANX — PayPal dispute-defense swarm

Adversarial dispute-defense workbench for a small PayPal merchant. Built for the **PayPal AI Hackathon** (Devpost: "Build What's Next with PayPal and AI").

**Deadline:** Nov 12, 2026, 12:00 PM PST = Nov 13, 2026, 1:30 AM IST.

When PayPal sends a `CUSTOMER.DISPUTE.CREATED` webhook, PHALANX pulls the dispute + original transaction, assembles the merchant's own evidence, runs a deterministic checklist, drafts a rebuttal, attacks it with a second adversarial pass (max 3 iterations), and — only after a human approves — executes exactly one PayPal action: `provide-evidence` OR `make-offer` OR `accept-claim`.

> Status (Oct 31, 2026): **basics + steps 5–7 + Phase 1 LLM wiring (multi-provider system, 3-juror layer, Judge framing, Vercel deploy button).** Negative tests (84/84), unit checks, telemetry, deterministic fallback preserved. Still no live Sandbox execution — that needs Dhyey's Sandbox accounts.

## Deploy your own copy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDhyeyPatel007%2Fphalanx)

1. Click **Deploy with Vercel** above to clone and deploy to your Vercel account.
2. (Optional) Set `GEMINI_API_KEY` (or your preferred AI provider key) in your Vercel project environment variables.
3. Deploy! The seeded demo runs immediately with zero configuration.
4. For live PayPal Sandbox testing, add `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_WEBHOOK_ID`.

## Live demo

**Seeded demo: deployment BLOCKED (Oct 30) — no demo URL exists yet, none is claimed here.** The Vercel connection used here has no grant for Dhyey's Vercel team (`dhyey-patels-projects-80ed463b`): both `create_git_project` and `create_project` return 403, and there is no logged-in Vercel CLI on this machine (`vercel login` is interactive). To unblock — one Dhyey action: grant the Vercel connection access to the team (Vercel dashboard team access/consent), or from a logged-in machine run `vercel login` then `vercel --scope dhyey-patels-projects-80ed463b project add phalanx`. After that, linking repo `DhyeyPatel007/phalanx` will auto-deploy on every push. The app is deploy-ready: `npm run build` passes, and the seeded demo needs no environment variables.

## What it does
- Webhook ingest + signature verification + idempotent dispute creation
- Dispute list + detail from the live Disputes API (Sandbox), merged with seeded merchant evidence
- Deterministic evidence checklist + score (0–100), Prosecutor draft, 3-juror adversarial pass, full debate transcript
- Human approval gate, then exactly one executed PayPal action per approved dispute
- PDF evidence dossier (only evidence PayPal requested) — 5 pages: cover, invoice/order, tracking proof, merchant-log correlation, evidence manifest with SHA-256
- Offer/accept paths with stage gating, offer/accept type checks, downgrade resolution, and an 84-test negative suite (`scripts/negative-tests.mjs`)
- SOC war-room UI: server-side telemetry bar, AG Grid dispute ledger, debate drawer

## What it does NOT do
- No carrier scraping, no buyer IP/device fingerprinting, no carrier delivery photo (PayPal does not return these).
- No automatic filing of carrier insurance claims (shown as a manual next step only).
- No bank/card-issuer chargeback handling, arbitration, or appeals.
- No real-money / production PayPal. Sandbox only.
- Checklist scores are an internal heuristic, NOT a win probability. PHALANX does not know how PayPal or a card issuer will decide a case.
- Seeded data is simulated for the demo. A production version would need the merchant's real order, shipping, and support systems — that integration is not built here.

## AI providers (general API system)

PHALANX supports multiple OpenAI-compatible LLM providers through a unified interface (`src/lib/llm.ts`). The LLM drafts rebuttal wording (Prosecutor), evaluates gaps via 3 parallel jurors (Evidence, Policy, Buyer-Sympathy), and generates issue framing and verdict reasoning (Judge). The checklist score, verdict routing, and approval gates remain 100% deterministic code.

### Supported providers
- **Gemini** (default): `LLM_PROVIDER=gemini`, default model `gemini-3.8-flash`, env `GEMINI_API_KEY`. Connects via Google's OpenAI-compatible endpoint. *Free-tier note:* Google AI Studio provides a free tier verified at $0.
- **OpenAI**: `LLM_PROVIDER=openai`, default model `gpt-4o-mini`, env `OPENAI_API_KEY`.
- **xAI Grok**: `LLM_PROVIDER=grok`, default model `grok-4`, env `XAI_API_KEY`.
- **DeepSeek**: `LLM_PROVIDER=deepseek`, default model `deepseek-chat`, env `DEEPSEEK_API_KEY`.
- **Moonshot Kimi**: `LLM_PROVIDER=kimi`, default model `kimi-k2.5`, env `MOONSHOT_API_KEY`.
- **Groq**: `LLM_PROVIDER=groq`, default model `llama-3.3-70b-versatile`, env `GROQ_API_KEY`.
- **NVIDIA NIM**: `LLM_PROVIDER=nvidia`, default model `nvidia/llama-3.1-nemotron-70b-instruct`, env `NVIDIA_API_KEY` (starts with `nvapi-`). *Terms note:* NVIDIA's free tier is trial/testing-only under its terms (not for production use) — Gemini remains the recommended free path for end users.
- **Custom**: `LLM_PROVIDER=custom`, base URL `LLM_BASE_URL`, model `LLM_MODEL`, key `LLM_API_KEY`.

### Deterministic fallback
If no API key is configured or if a provider call fails, PHALANX silently and reliably falls back to deterministic template rebuttal drafting, single deterministic Red-Team review, and standard score breakdown. The app never crashes or stalls when an LLM is unavailable.

## Demo scenarios (seeded, labelled SIMULATED)
| ID | Reason | Amount | Expected outcome |
|---|---|---|---|
| PP-D-88412 | MERCHANDISE_OR_SERVICE_NOT_RECEIVED | $480 | Contest — `provide-evidence` (PROOF_OF_FULFILLMENT) |
| PP-D-88413 | MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED | $210 | Offer — `make-offer`, 40% partial refund |
| PP-D-88414 | MERCHANDISE_OR_SERVICE_NOT_RECEIVED | $95 | Concede — `accept-claim` |

## Setup (seeded demo)
```bash
cp .env.example .env.local
npm install
npm run dev
```
Seeded demo works without Sandbox credentials. Live Sandbox needs a PayPal Developer REST app + webhook — see the Sandbox setup runbook in the project files.

### Run the 3 scenarios
1. Open the app, click **Load seeded demo**.
2. Click a row, click **Run swarm** — Scenario A shows Draft v1 rejected on the named merchant-log gap, then Draft v2 passing (60 → 85, CONTEST_HARD_PROOF). B scores 60 (DE_ESCALATE_OFFER), C scores 0 (CONCEDE_FAST_SETTLE).
3. Click **Download evidence dossier (PDF)** for the 5-page dossier (SIMULATED watermark on seeded rows).
4. Click **Approve**, then **Execute** — Execute refuses with `LIVE_EXECUTION_NOT_ENABLED` (by design: no Sandbox execution until Dhyey confirms Sandbox accounts). Execute without approval refuses with `APPROVAL_REQUIRED`.

### Negative tests
```bash
npm run build
PORT=3100 npx next start -p 3100
PHALANX_BASE_URL=http://localhost:3100 node scripts/negative-tests.mjs
```
84 checks (brief §10.5): no-approval refusal, disallowed action + allowed list, stale approval, offer default/validation, duplicate webhook dedupe, fake webhook ignored + logged, PDFs for all 3 scenarios. Results print to the console; the report is written to `test-results/negative-tests.md` (local only, not committed).

## Tools used (honest list)
- **PayPal Disputes API (Sandbox)** — list/detail, webhook verification; execution calls are wired through the approval gate but refuse live calls until Sandbox is connected.
- **AG Grid Community** — the dispute ledger (sorting, filtering, quick filter, pagination). No Enterprise features.
- **pdf-lib** — server-side evidence dossier generation.
- **LLM: Multi-provider support via OpenAI-compatible API (`src/lib/llm.ts`).** Supports Gemini (default), OpenAI, Grok, DeepSeek, Kimi, Groq, NVIDIA NIM, and custom endpoints. The LLM drafts rebuttal wording (Prosecutor), runs a 3-agent jury audit (Evidence, Policy, Buyer-Sympathy), and provides issue framing (Judge). The verdict, score, and PayPal execution gates remain 100% deterministic code. With no key, PHALANX falls back seamlessly to deterministic templates.
- **Next.js 16 (App Router) + TypeScript**, in-memory/JSON evidence store. No database, no queue, no extra services.

## Known limits
- Live Sandbox execution is not enabled yet (needs Dhyey's Sandbox REST app, business + buyer accounts, webhook ID, and his live check). Seeded execution always refuses with `LIVE_EXECUTION_NOT_ENABLED`.
- The seeded demo is simulated data: no real buyer, transaction, or delivery. A production version would need the merchant's real order, shipping, and support systems connected — that integration is not built here.
- Checklist scores are an internal heuristic. PHALANX does not know, and must not claim, how PayPal or a card issuer will decide a case.
- Webhook dedupe + approvals live in memory; a server restart resets demo state. Persistence beyond the demo session is explicitly not required.
- No video or Devpost submission yet — Devpost About draft is in the project files (draft only, not submitted).

## Full spec
See `phalanx-build-brief.md` in the goal workspace. Master prompt: `phalanx-master-prompt.md`.

## License
MIT — Copyright (c) 2026 Dhyey Patel
