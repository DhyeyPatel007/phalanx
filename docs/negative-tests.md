# PHALANX — Negative tests (brief §10.5)

Run: 2026-10-30T12:32:32.378Z against a fresh production build (`npm run build` + `next start`).
Script: `scripts/negative-tests.mjs` (`PHALANX_BASE_URL=http://localhost:3100 node scripts/negative-tests.mjs`).
Result: **60/60 passed**.

No live PayPal calls are made in any test. Seeded disputes only.

| Test | Expected | Actual | Result |
|---|---|---|---|
| T1 execute without approval → 403 | 403 | 403 (APPROVAL_REQUIRED) | PASS |
| T1 error code is APPROVAL_REQUIRED | APPROVAL_REQUIRED | APPROVAL_REQUIRED | PASS |
| T2 setup run A → 200 | 200 | 200 | PASS |
| T2 approve disallowed action → 409 | 409 | 409 (action escalate is not allowed on this dispute) | PASS |
| T2 response shows allowed_actions list | true | true (provide-evidence,make-offer,accept-claim,send-message) | PASS |
| T2 suggests a downgrade action | provide-evidence | provide-evidence | PASS |
| T2b approve before any run → 409 | 409 | 409 (no swarm run yet — run the swarm before approving) | PASS |
| T3 swarm run A → 200 | 200 | 200 | PASS |
| T3 A has 2 iterations | 2 | 2 | PASS |
| T3 A v1 rejected | false | false | PASS |
| T3 A v2 accepted | true | true | PASS |
| T3 A final score 85 | 85 | 85 | PASS |
| T3 A verdict CONTEST_HARD_PROOF | CONTEST_HARD_PROOF | CONTEST_HARD_PROOF | PASS |
| T4 approve A provide-evidence → 200 | 200 | 200 | PASS |
| T4 approved action | provide-evidence | provide-evidence | PASS |
| T5 execute A (seeded, approved) → 409 | 409 | 409 (LIVE_EXECUTION_NOT_ENABLED) | PASS |
| T5 error is LIVE_EXECUTION_NOT_ENABLED | LIVE_EXECUTION_NOT_ENABLED | LIVE_EXECUTION_NOT_ENABLED | PASS |
| T5 idempotency key recorded | true | true (PP-D-88412:provide-evidence:appr-PP-D-88412-1793363551767) | PASS |
| T6 re-run A → 200 | 200 | 200 | PASS |
| T6 execute with stale approval → 409 | 409 | 409 (STALE_APPROVAL) | PASS |
| T6 error is STALE_APPROVAL | STALE_APPROVAL | STALE_APPROVAL | PASS |
| T7 run B → 200 | 200 | 200 | PASS |
| T7 B verdict DE_ESCALATE_OFFER | DE_ESCALATE_OFFER | DE_ESCALATE_OFFER | PASS |
| T7 B score 60 | 60 | 60 | PASS |
| T7 approve B make-offer → 200 | 200 | 200 | PASS |
| T7 default offer is 40% = $84.00 | 84.00 | 84.00 | PASS |
| T7 execute B → 409 LIVE_EXECUTION_NOT_ENABLED | 409 | 409 (LIVE_EXECUTION_NOT_ENABLED) | PASS |
| T7 approved action recorded as make-offer | make-offer | make-offer | PASS |
| T7b offer above dispute amount → 400 | 400 | 400 (offer_amount must be > 0 and <= dispute amount $210.00) | PASS |
| T8 run C → 200 | 200 | 200 | PASS |
| T8 C verdict CONCEDE_FAST_SETTLE | CONCEDE_FAST_SETTLE | CONCEDE_FAST_SETTLE | PASS |
| T8 C score 0 | 0 | 0 | PASS |
| T8 approve C accept-claim → 200 | 200 | 200 | PASS |
| T8 execute C → 409 LIVE_EXECUTION_NOT_ENABLED | 409 | 409 (LIVE_EXECUTION_NOT_ENABLED) | PASS |
| T8 approved action recorded as accept-claim | accept-claim | accept-claim | PASS |
| T9 first replay → 200 | 200 | 200 | PASS |
| T9 second replay → 200 (answered, not executed) | 200 | 200 | PASS |
| T9 second replay ignored as duplicate | duplicate | duplicate | PASS |
| T9 webhook log records DUPLICATE_IGNORED | true | true | PASS |
| T10 fake webhook → 200 (answered, not executed) | 200 | 200 | PASS |
| T10 fake webhook ignored | true | true (unverified — webhook not configured) | PASS |
| T10 webhook log records the fake event | true | true | PASS |
| T11 PDF PP-D-88412 → 200 | 200 | 200 | PASS |
| T11 PDF PP-D-88412 content-type | application/pdf | application/pdf | PASS |
| T11 PDF PP-D-88412 under 10 MB | true | true (7743 bytes) | PASS |
| T11 PDF PP-D-88412 has SHA-256 header | true | true | PASS |
| T11 PDF PP-D-88412 contains SIMULATED watermark | true | true | PASS |
| T11 PDF PP-D-88412 has all 5 sections | true | true | PASS |
| T11 PDF PP-D-88413 → 200 | 200 | 200 | PASS |
| T11 PDF PP-D-88413 content-type | application/pdf | application/pdf | PASS |
| T11 PDF PP-D-88413 under 10 MB | true | true (7569 bytes) | PASS |
| T11 PDF PP-D-88413 has SHA-256 header | true | true | PASS |
| T11 PDF PP-D-88413 contains SIMULATED watermark | true | true | PASS |
| T11 PDF PP-D-88413 has all 5 sections | true | true | PASS |
| T11 PDF PP-D-88414 → 200 | 200 | 200 | PASS |
| T11 PDF PP-D-88414 content-type | application/pdf | application/pdf | PASS |
| T11 PDF PP-D-88414 under 10 MB | true | true (7330 bytes) | PASS |
| T11 PDF PP-D-88414 has SHA-256 header | true | true | PASS |
| T11 PDF PP-D-88414 contains SIMULATED watermark | true | true | PASS |
| T11 PDF PP-D-88414 has all 5 sections | true | true | PASS |

## What each test proves
- **T1** — Execute without approval refuses (403 APPROVAL_REQUIRED). The human gate is real.
- **T2/T2b** — A disallowed action refuses WITH the live allowed list shown + a downgrade suggestion; approving before any swarm run refuses.
- **T3–T6** — Scenario A: v1 rejected on the named merchant-log gap, v2 passes at 85/CONTEST; approved execution on a seeded dispute refuses (409 LIVE_EXECUTION_NOT_ENABLED) with the idempotency key recorded; a newer run makes the old approval stale (409 STALE_APPROVAL).
- **T7/T7b** — make-offer path: B scores 60/DE_ESCALATE_OFFER, default offer is 40% ($84.00); an offer above the dispute amount refuses (400).
- **T8** — accept-claim path: C scores 0/CONCEDE_FAST_SETTLE; execution refuses (409 LIVE_EXECUTION_NOT_ENABLED).
- **T9** — Duplicate webhook event dedupes: second replay is ignored, no second run; the webhook log records DUPLICATE_IGNORED.
- **T10** — Fake webhook (bad signature / no config) is answered 200, ignored, and logged — never executed.
- **T11** — Evidence PDFs generate for all 3 scenarios: 200, application/pdf, under 10 MB, SHA-256 header present, SIMULATED watermark + all 5 sections present.

## Not covered here (needs Dhyey)
- Live Sandbox execution (provide-evidence / make-offer / accept-claim against PayPal) — deliberately refused in this run; needs his Sandbox accounts + webhook.
- The live-check fill-in report (brief §10.6): dispute ID seen in Sandbox, PDF visible in the dispute, offer/accept reflected on re-fetch.
