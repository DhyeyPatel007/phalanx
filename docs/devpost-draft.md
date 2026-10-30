# PHALANX — Devpost draft (DRAFT ONLY — NOT SUBMITTED)

> Status: draft written Oct 30, 2026. Do NOT submit until the live Sandbox
> execution (§10) passes and the <3 min video is recorded. The Devpost draft
> already on file is "Untitled" (ID 1270247) — rename it to PHALANX when
> submitting.

## Title
PHALANX — Adversarial Dispute Defense for PayPal Merchants

## Tagline
Battle-test your chargeback evidence before PayPal ever sees it. The swarm fights the fights with evidence — and concedes the ones without it.

## About (paste into Devpost — honest labels kept)
PHALANX is a dispute-defense workbench for a small merchant who sells through PayPal. When PayPal sends a `CUSTOMER.DISPUTE.CREATED` webhook, PHALANX pulls the dispute and the original transaction, assembles the merchant's own evidence (tracking, invoice, the merchant's own order and support logs), runs a deterministic evidence checklist, drafts a rebuttal, attacks that draft with a second adversarial pass, and — only after a human approves — executes exactly one PayPal action: submit evidence, make an offer, or accept the claim.

The honest core is the argument, not the automation. The Prosecutor drafts from the merchant's artifacts only. The Red-Team Adjudicator checks that draft against a fixed checklist and rejects it with named gaps — on the $480 friendly-fraud case, Draft v1 is rejected because the merchant's post-delivery usage log is missing; the Hound fetches it, the checklist score rises from 60 to 85, and Draft v2 passes. On the $95 lost-in-transit case, the score is 0 and PHALANX recommends conceding fast instead of paying to lose slowly. A human approves every action; nothing executes from a webhook, and nothing executes without approval.

What the numbers mean: the score is a deterministic checklist score (0–100), an internal heuristic — not a prediction of how PayPal or a card issuer will decide a case. The expected-value display is labelled "illustrative" and shows its fee basis. The demo runs on seeded data labelled SIMULATED and on PayPal Sandbox test disputes; nothing moves real money or decides a real case.

Built with: PayPal Disputes API (Sandbox) + AG Grid Community + pdf-lib + Next.js. The LLM role in this build is a fixed-template draft plus auditable prompts in `prompts/`; no model call is on the critical path for scoring or execution.

What PHALANX does NOT do: no carrier scraping, no buyer tracking or fingerprinting (PayPal does not return a buyer IP or a carrier photo), no automatic carrier insurance claims, no bank chargeback handling, no real-money PayPal.

## Built With
- PayPal Disputes API (Sandbox)
- AG Grid Community
- pdf-lib
- Next.js 16 + TypeScript

## Links (fill at submit time)
- Repo: https://github.com/DhyeyPatel007/phalanx
- Live demo: _add the Vercel URL once deployed_
- Video (< 3 min): _not recorded yet — record only after the Sandbox test plan (§10) passes_

## Submission checklist (brief §11)
- [x] Public GitHub repo, MIT licence
- [x] README: what it does / does NOT do, setup, seeded vs live, 3 scenarios, tools used honestly, known limits
- [x] `.env.example`, no secrets committed (secret scan clean before every push)
- [ ] Deployed demo URL + seeded demo works without Sandbox credentials (BLOCKED Oct 30: Vercel team access grant needed — see README "Live demo")
- [ ] Demo video < 3 minutes (script in brief §12 — record after §10 passes)
- [ ] Devpost submit (this draft)
- [x] No unsourced statistics, no "Rule 4.2", no win-probability language (repo grep clean except the Phase 0 report's own debunks and "never a win probability" labels)
