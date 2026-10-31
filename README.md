# PHALANX — PayPal dispute-defense swarm

Adversarial dispute-defense workbench for a small PayPal merchant. Built for the **PayPal AI Hackathon** (Devpost: "Build What's Next with PayPal and AI").

**Deadline:** Nov 12, 2026, 12:00 PM PST = Nov 13, 2026, 1:30 AM IST.

When PayPal sends a `CUSTOMER.DISPUTE.CREATED` webhook, PHALANX pulls the dispute + original transaction, assembles the merchant's own evidence, runs a deterministic checklist, drafts a rebuttal, attacks it with a second adversarial pass (max 3 iterations), and — only after a human approves — executes exactly one PayPal action: `provide-evidence` OR `make-offer` OR `accept-claim`.

> Status (Oct 31, 2026): **basics + steps 5–7 (no-live part) done and pushed, plus a Gemini audit refine (13 fixes).** Phase 0, skeleton, webhook, scorer/swarm, PDF dossier, offer/accept paths, negative tests (84/84), telemetry, README. Still no live Sandbox execution — that needs Dhyey's Sandbox accounts.

## Live demo

**Seeded demo: deployment BLOCKED (Oct 30) — no demo URL exists yet, none is claimed here.** The Vercel connection used here has no grant for Dhyey's Vercel team (`dhyey-patels-projects-80ed463b`): both `create_git_project` and `create_project` return 403, and there is no logged-in Vercel CLI on this machine (`vercel login` is interactive). To unblock — one Dhyey action: grant the Vercel connection access to the team (Vercel dashboard team access/consent), or from a logged-in machine run `vercel login` then `vercel --scope dhyey-patels-projects-80ed463b project add phalanx`. After that, linking repo `DhyeyPatel007/phalanx` will auto-deploy on every push. The app is deploy-ready: `npm run build` passes, and the seeded demo needs no environment variables.

## What it does
- Webhook ingest + signature verification + idempotent dispute creation
- Dispute list + detail from the live Disputes API (Sandbox), merged with seeded merchant evidence
- Deterministic evidence checklist + score (0–100), Prosecutor draft, Red-Team adversarial pass, full debate transcript
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
- **LLM: none called in this build.** The Prosecutor drafts from a fixed template + artifacts only. The Prosecutor / Red-Team prompt text lives in the project files for audit; wiring Gemini (Dhyey's existing Google AI Pro access) is future work, and the LLM would draft wording only — never score, never execute.
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
