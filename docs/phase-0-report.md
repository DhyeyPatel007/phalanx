# PHALANX — Phase 0 Report

**Date:** 2026-10-30 (checked against live PayPal Developer docs, crawled same day)
**Method:** Every row below was checked against the live PayPal Developer documentation (integration guide last updated Oct 14, 2026; Disputes v1 API reference; Webhooks Management v1; lifecycle reference) and the official Devpost rules page. **No live Sandbox response was available in this run** — no Sandbox app/accounts exist yet — so anything marked "live response pending" must be confirmed from a real Sandbox dispute before execution is wired up (brief §10).

## Results

### Row 1 — Action endpoints exist under `/v1/customer/disputes/{id}/…`
**VERIFIED.** Disputes v1 reference lists 3 dispute endpoints (`GET /v1/customer/disputes`, `GET /v1/customer/disputes/{id}`, `PATCH`) and **12 action endpoints**, including `provide-evidence`, `make-offer`, `accept-claim`, `send-message`, `escalate`, `appeal`, `accept-offer`, `deny-offer`, `acknowledge-return-item`, `provide-supporting-info`, plus sandbox-only `adjudicate` and `require-evidence`.
- Source: https://developer.paypal.com/api/customer-disputes/v1

### Row 2 — `provide-evidence` is multipart, not one JSON call
**VERIFIED (brief was already correct).** The integration guide's cURL example sends `Content-Type: multipart/form-data` with an `input` JSON part (`evidences[]` with `evidence_type` + `evidence_info.tracking_info`) and a `file1` file part (`file1=@NewDoc.pdf;type=application/pdf`). Notes max 2000 chars. File rules from the same guide: **up to 50 MB per request, individual files < 10 MB, formats JPG/JPEG/GIF/PNG/PDF.** Only evidence types with `evidences.source = REQUESTED_FROM_SELLER` should be sent.
- Source: https://developer.paypal.com/limited-release/commerce-platform/manage-risks-liabilities/disputes-chargebacks/integration-guide/ (provide-evidence section + "rules apply to document file types and sizes" at the end)

### Row 3 — Evidence types incl. `PROOF_OF_FULFILLMENT` + `PROOF_OF_REFUND`
**VERIFIED, with a correction.** The guide's per-reason tables list only three evidence types: `PROOF_OF_FULFILLMENT` (requires `tracking_info` with `tracking_number` + `carrier_name`, or note/document), `PROOF_OF_REFUND` (requires `refund_ids`), and `OTHER` (note or document). The extra types named in the brief (`PROOF_OF_RETURN`, `PROOF_OF_DELIVERY_SIGNATURE`, `PROOF_OF_RECEIPT_COPY`, `BILLING_AGREEMENT`, `AFFIDAVIT`) **do not appear in the current guide's per-reason tables** — do not send them unless a live dispute detail response requests them. The full allowed list must be read from the live `evidences` array on each dispute.
- Source: same integration guide, "information required" tables per reason.

### Row 4 — Actions depend on stage; HATEOAS / `allowed_response_options` govern
**VERIFIED in principle; live response is the only authority.** The guide states the dispute-detail response contains HATEOAS `links` listing "all the applicable actions merchants can complete" and that `allowed_response_options` (incl. `make_offer.offer_types`, `accept_claim.accept_claim_types`) governs offers/accepts. The lifecycle reference's stage table shows seller actions varying by status (e.g. `WAITING_FOR_SELLER_RESPONSE` seller actions: `provide-evidence`, `accept-claim`, `acknowledge-return-item`; `OPEN` in INQUIRY: `send-message`, `make-offer`, `accept-claim`, `escalate`, `partial-update`). PayPal's own tables disagree with each other across versions (e.g. whether `accept-claim` is available in INQUIRY — the lifecycle table says yes for OPEN, the guide's claim-stage text implies claim-stage only). **Rule stands: trust the live response, never a table. Gate every button on the live `links`/`allowed_response_options` and log the raw response.**
- Sources: integration guide; https://developer.paypal.com/docs/disputes/disputes-reference

### Row 5 — Webhook `CUSTOMER.DISPUTE.CREATED` fires on dispute creation
**VERIFIED from docs; live payload pending.** Webhook signature verification endpoint confirmed: `POST /v1/notifications/verify-webhook-signature` (Webhooks Management v1). The webhooks integration guide (last updated June 18, 2026) documents verification two ways: self-verification (RSA-SHA256 over `transmissionId|timeStamp|webhookId|crc32` of the raw body, cert from `PAYPAL-CERT-URL`) or posting back to the verify endpoint with the 7 fields (`auth_algo`, `cert_url`, `transmission_id`, `transmission_sig`, `transmission_time`, `webhook_id`, `webhook_event`). Listener must answer HTTP 2xx or PayPal retries up to 25 times over 3 days. The dispute test-workflows docs confirm disputes can be created in INQUIRY and CLAIM stages in Sandbox. **Exact live `CUSTOMER.DISPUTE.CREATED` payload shape and webhook-ID handling must still be confirmed from a real Sandbox event — no Sandbox account exists in this run, so that part is BLOCKED until Dhyey creates one.**
- Sources: https://developer.paypal.com/api/webhooks/v1 ; https://developer.paypal.com/api/rest/webhooks/rest

### Row 6 — Sandbox-only helpers exist to create/move disputes
**VERIFIED, with a major correction to the plan.** `adjudicate` (settle) and `require-evidence` (update status) are confirmed sandbox-only in the API reference. But **creating a dispute in Sandbox is NOT a simple endpoint call**: the guide requires (1) the REST app to have the `DISPUTE_CREATE` scope (`https://uri.paypal.com/services/disputes/create`) — "Contact your PayPal account manager to enable this setting", (2) buyer permission via a Log in with PayPal flow + consent, (3) an unsigned JWT (`PayPal-Auth-Assertion`) built from the merchant client ID + buyer email, (4) a real buyer→seller Sandbox transaction first. There is also a separate chargeback-simulation endpoint `POST /v2/customer-support/process-chargeback`. **Plan change: the primary Sandbox test path is the manual flow (buyer opens the case in the Sandbox Resolution Center), not the API create endpoint.** The API create path is a stretch goal only if the scope can be enabled.
- Source: integration guide, "To test disputes on the sandbox" section.

### Row 7 — PayPal MCP Server tool names (`get_dispute_details`, `list_transactions`)
**CORRECTED — those names do not exist.** The PayPal Agent Toolkit (npm `@paypal/agent-toolkit`, PyPI `paypal-agent-toolkit`) lists exactly three dispute tools: `list_disputes`, `get_dispute`, `accept_dispute_claim`. No `provide-evidence` / `make-offer` tool exists in it. **Decision stands: direct PayPal REST for ALL execution. MCP/Toolkit is not used at all in this build.**
- Sources: https://pypi.org/project/paypal-agent-toolkit/1.4.0/ ; https://npm.io/package/@paypal/agent-toolkit

### Row 8 — "Seller Protection Rule 4.2"
**NOT FOUND — do not cite it, ever.** No such rule exists in PayPal docs. The real citable rule (US, PayPal Seller Protection policy last updated **Jan 26, 2026**): signature confirmation was **required for orders over $750 USD** for transactions processed **before Jan 26, 2026**; for transactions **after that date it is recommended, not required** (US guidance only — other markets differ). Seller Protection covers only Unauthorized Transaction and Item Not Received claims filed in PayPal's hosted environment; SNAD is not covered. **Plan change: the checklist's signature check (15 pts) is now labelled "bonus evidence, recommended not required for post-Jan-2026 US sales" and must quote the transaction date when cited.**
- Sources: PayPal Seller Protection policy (last updated Jan 26, 2026) via https://www.chargeflow.io/blog/what-is-paypal-seller-protection ; https://redo.com/articles/chargebacks/paypal-seller-protection

### Row 9 — Fees "$15–$20 non-refundable per incident"
**VERIFIED, with corrections.** Current US figures (PayPal merchant fee schedule, last updated **Oct 1, 2026**): **Standard Dispute Fee $15**, **High-Volume Dispute Fee $30** (applies at >100 sales in prior 3 months + dispute ratio ≥1.5%), **Chargeback Fee $20** (card payments processed outside a PayPal account / guest checkout). Waiver rules: the $15 standard fee is **not charged on disputes decided in the seller's favour** or resolved directly with the buyer; the $30 high-volume fee still applies; the $20 chargeback fee is waived only when Seller Protection requirements are met. The brief's "non-refundable even if you accept the loss" was loose — the fee treatment depends on route and outcome. **EV math in the app must use $15 (standard, PayPal-account route) as the default, show the fee basis, and label waivers as checked per the Oct 1, 2026 schedule.**
- Sources: PayPal US merchant fee page (last updated Oct 1, 2026) via https://www.chargeflow.io/blog/paypal-chargeback-fees ; https://www.sorquil.com/blog/how-to-respond-paypal-dispute-damaged-item

### Row 10 — "$100B+ a year", "merchants lose 78%", "3 hours manual vs 6 seconds"
**UNSOURCED — dropped.** No citable source found; none of these figures appear anywhere in the app, README, video, or Devpost text. The pitch stands on the demo only.

### Row 11 — AG Grid "$10,000 prize track"
**CORRECTED.** Official Devpost rules page (https://paypalaihackathon.devpost.com) lists: **Best Use of AG Grid — 1st $5,000, 2nd $2,000, 3rd $1,000 × 3 winners.** Total pool on Devpost: **$69,750** ($67,500 cash + $2,250 Render credits). There is no $10,000 AG Grid track. AG Grid Community is used in the app; no Enterprise features.
- Source: https://paypalaihackathon.devpost.com (official rules/prizes); also https://developer.paypal.com/community/blog/PayPal_AI_Hackathon/

### Row 12 — Carrier GPS drop-off photo + buyer checkout IP from PayPal / carrier scraping
**CONFIRMED OUT OF SCOPE.** The Disputes API `show dispute details` response fields are: dispute id, reason, status, state, lifecycle stage, channel, amounts, disputed transactions (buyer/seller transaction ids, status, gross amount), buyer name/email, merchant id/email, evidences, messages, `allowed_response_options`, HATEOAS links. **No buyer IP address, no device fingerprint, no carrier delivery photo field exists anywhere in the Disputes API spec.** Carrier portals require login and block scraping. The Hound uses only PayPal dispute + transaction data, merchant-supplied tracking, and the merchant's own logs (seeded/simulated in the demo, labelled SIMULATED).
- Source: https://developer.paypal.com/api/customer-disputes/v1 ; Postman PayPal API Network "Show dispute details" example response.

## What I changed in the plan because of Phase 0

1. **Sandbox test path is manual-first.** Creating a dispute via API needs a `DISPUTE_CREATE` scope that only a PayPal account manager can enable, plus a buyer-consent Log-in-with-PayPal flow and an unsigned JWT — not a call the app can just make. The demo's Sandbox path is now: buyer opens the case in the Sandbox Resolution Center; the app ingests it via webhook + Disputes API. The API create endpoint is a stretch goal, not the plan.
2. **Signature check relabelled.** The 15-point signature checklist item is bonus evidence, "recommended, not required" for US sales after Jan 26, 2026 — the app and README must quote the date, never present $750 as a hard requirement.
3. **Evidence types narrowed.** Only `PROOF_OF_FULFILLMENT`, `PROOF_OF_REFUND`, and `OTHER` are in the current per-reason tables; the other types the brief listed must not be sent unless a live dispute requests them. The app reads the requested types from the live dispute detail, never from a hardcoded list.
4. **Fee basis pinned.** EV math uses the $15 standard dispute fee by default (Oct 1, 2026 US schedule), with the $30/$20 routes shown and waiver rules labelled as checked, not assumed.
5. **AG Grid prize corrected** to $5,000 / $2,000 / $1,000×3 (Devpost official); total pool $69,750.
6. **No MCP/Toolkit at all.** REST only, for every action.
7. **Nothing is "verified live" yet.** Every row above is docs-verified only. A live Sandbox response is still required before any execution step (brief §10) — that needs Dhyey's Sandbox accounts, which do not exist yet in this run.

## Addendum — Gemini Chat Steps 1–4 package (Oct 30, 2026)

Dhyey pasted a Gemini Chat package (`gemini-basics-package.md`) covering the same steps 1–4. It was treated as **unverified input, not proof**: it gives only relative doc paths, no full URLs, and no live Sandbox response. The 12 rows above stand. Reconciliation outcome:

- **Consistent, no change needed:** OAuth token endpoint, list/detail endpoints, multipart `provide-evidence` (50 MB / 10 MB), `make-offer` / `accept-claim` shapes, webhook verify endpoint + 7 fields, no buyer IP / no carrier photo, MCP/Toolkit has no evidence/offer tools, direct REST for all execution.
- **Adopted (verified against the live guide, which I re-checked):**
  - Offer-type check: `allowed_response_options.make_offer.offer_types` must include `REFUND` before approving a make-offer; same for `accept_claim.accept_claim_types`. Now enforced in `POST /api/disputes/{id}/approve` when the dispute carries that data (seeded rows now carry it).
  - `cache: "no-store"` on PayPal fetches (avoids stale Next.js fetch cache).
  - Execution-gate details: action-mismatch refusal and duplicate-execution (idempotency-key) refusal in `POST /api/disputes/{id}/execute`.
  - Seed detail folded in (SIMULATED labels kept): delivery dates (A 2026-10-25, B 2026-10-24), invoice IDs (INV-SIM-2026-480 / -210), C carrier + tracking (USPS SIM-USPS-1109482, stalled 9 days), A merchant-log detail (license activation + 3 builds exported).
- **Rejected, with reasons:**
  - Gemini's Scenario A pass 1 scores **75 yet is "REJECTED"** — contradicts its own ≥75 → CONTEST rule. Kept the repo's literal-artifact scorer + gap-driven rejection (A v1 = 60, rejected on the named merchant-log gap; v2 = 85, accepted).
  - Gemini row 11 ("make-offer restricted to INQUIRY; CHARGEBACK only provide-evidence/accept-claim") — a table claim; PayPal's own tables disagree (row 4 above), so the live response stays the only authority. Not adopted as fact.
  - Gemini row 12 (Sandbox dispute creation) — a weaker subset of row 6 above (DISPUTE_CREATE scope + buyer consent + JWT). Kept the repo's version.
  - `GEMINI_MODEL=gemini-2.5-flash` — unverified model ID; AI Studio evidence says Gemini 3.8 Flash is the default. Model left unset in `.env.example`.
  - Gemini's seed format (top-level array, PayPal API shape) — not adopted; the repo's brief §7 format (`store.ts`) stays canonical.
  - Gemini's webhook returning 401/500 on bad signatures — rejected; the brief requires answering 200 quickly (PayPal retries non-2xx up to 25× over 3 days) and logging + ignoring unverified events.
  - Gemini's dispute-level dedupe (second event for the same dispute ignored) — rejected; event-level dedupe only, so legitimate follow-up events (e.g. DISPUTE.UPDATED) are not suppressed.
  - Gemini's hardcoded dispute-ID branches in `swarm.ts` — rejected; the repo's loop is generic over any dispute.
  - Gemini's Shipment Tracking API (`POST /v1/shipping/trackers-batch`) — optional enrichment, not adopted for basics; tracking goes in `provide-evidence` directly.
  - Gemini's Phase 0 omits fees, Seller Protection, AG Grid prize, and the $100B/78% items entirely — those rows above stand unchanged.
- Scores after reconciliation (re-smoke-tested): A 60→85 CONTEST_HARD_PROOF, B 60 DE_ESCALATE_OFFER, C 0 CONCEDE_FAST_SETTLE — unchanged.
