# PHALANX — PayPal dispute-defense swarm

Adversarial dispute-defense workbench for a small PayPal merchant. Built for the **PayPal AI Hackathon** (Devpost: "Build What's Next with PayPal and AI").

**Deadline:** Nov 12, 2026, 12:00 PM PST = Nov 13, 2026, 1:30 AM IST.

When PayPal sends a `CUSTOMER.DISPUTE.CREATED` webhook, PHALANX pulls the dispute + original transaction, assembles the merchant's own evidence, runs a deterministic checklist, drafts a rebuttal, attacks it with a second adversarial pass (max 3 iterations), and — only after a human approves — executes exactly one PayPal action: `provide-evidence` OR `make-offer` OR `accept-claim`.

> Status (Oct 30, 2026): **basics in progress.** Phase 0 verification + skeleton first. No live Sandbox execution yet.

## What it does
- Webhook ingest + signature verification + idempotent dispute creation
- Dispute list + detail from the live Disputes API (Sandbox), merged with seeded merchant evidence
- Deterministic evidence checklist + score (0–100), Prosecutor draft, Red-Team adversarial pass, full debate transcript
- Human approval gate, then exactly one executed PayPal action per approved dispute
- PDF evidence dossier (only evidence PayPal requested)
- SOC war-room UI: telemetry bar, AG Grid dispute ledger, debate drawer

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
Seeded demo works without Sandbox credentials. Live Sandbox needs a PayPal Developer REST app + webhook — see `docs/phase-0-report.md` (Phase 0 first) and the build brief.

## Full spec
See `phalanx-build-brief.md` in the goal workspace (and `docs/phase-0-report.md` once Phase 0 lands). Master prompt: `phalanx-master-prompt.md`.

## License
MIT — Copyright (c) 2026 Dhyey Patel
