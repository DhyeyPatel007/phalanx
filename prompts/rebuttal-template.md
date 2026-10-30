# Rebuttal template (fixed — the LLM / template draft fills ONLY these slots)

```
Rebuttal {version} — Dispute {dispute_id} ({reason}, ${amount} {currency}).
Merchant position: the claim is disputed on the evidence below. No fact is
asserted that is not in an artifact.
- [{kind}] {summary} (SIMULATED if seeded)
Requested action: {action} — see routing policy, not a prediction.
```

Slots:
- `{version}` — draft version, v1/v2/v3.
- `{dispute_id}`, `{reason}`, `{amount}`, `{currency}` — from the dispute.
- One line per artifact, in the form `[{kind}] {summary}`. Nothing else
  may be added. If an artifact is missing, the gap is listed separately —
  never filled in with invented text.
- `{action}` — from the verdict routing policy:
  CONTEST_HARD_PROOF → provide-evidence; DE_ESCALATE_OFFER → make-offer;
  CONCEDE_FAST_SETTLE → accept-claim.

Hard rules (brief §9):
- The draft may not add any fact not present in an artifact.
- The score is a checklist score, never a win probability.
- Evidence submitted to PayPal must be only the types PayPal requested
  (`evidences.source = REQUESTED_FROM_SELLER`), within the file limits
  (50 MB per request, <10 MB per file, JPG/JPEG/GIF/PNG/PDF — Phase 0 row 2).
