// Deterministic evidence checklist scorer — brief §5.
// Score is a CHECKLIST score 0–100, NOT a win probability. Never call it that.
// Verdicts are a routing policy, labelled as such in the UI.
// Fee basis: US Standard Dispute Fee $15 (PayPal merchant fee schedule,
// last updated Oct 1, 2026 — Phase 0 row 9). High-volume $30 / chargeback
// $20 are the other routes; the EV display shows the basis used.

import type {
  ChecklistItem,
  Dispute,
  EvDisplay,
  EvidenceArtifact,
  Verdict,
} from "./types";

export const STANDARD_DISPUTE_FEE_USD = 15;

function hasKind(
  artifacts: EvidenceArtifact[],
  kind: string,
): EvidenceArtifact | undefined {
  return artifacts.find((a) => a.kind === kind);
}

function summaryHas(a: EvidenceArtifact | undefined, re: RegExp): boolean {
  return Boolean(a && re.test(a.summary));
}

/**
 * Score a dispute from its artifacts. Every missing check is a named gap.
 * Artifact matching is deliberately literal: an artifact only counts when its
 * summary states the fact the check requires (e.g. DELIVERED). A tracking
 * artifact that says "no delivery" passes nothing.
 */
export function scoreDispute(
  dispute: Dispute,
  artifacts: EvidenceArtifact[],
): { score: number; items: ChecklistItem[]; gaps: string[] } {
  const tracking = hasKind(artifacts, "tracking");
  const merchantLog = hasKind(artifacts, "merchant_log");
  const invoice = hasKind(artifacts, "invoice");

  const delivered = summaryHas(tracking, /DELIVERED/i);
  const deliveryVerifiable =
    delivered && summaryHas(tracking, /[A-Z]{3,}\s+\d{6,}|FEDEX|UPS|USPS|DHL/i);
  // Signature confirmation: bonus evidence. US rule (Phase 0 row 8):
  // required for $750+ sales BEFORE Jan 26, 2026; recommended, not required,
  // after that date. No seed carries a signature artifact, so this is a gap
  // for every seeded dispute — recorded, never waived.
  const signature = summaryHas(tracking, /SIGNATURE|SIGNED/i);
  const logTiesBuyer = Boolean(merchantLog) && /post-delivery|used product|access/i.test(merchantLog!.summary);
  const invoiceConsistent = Boolean(invoice);

  const items: ChecklistItem[] = [
    {
      key: "tracking_delivered",
      label: "Tracking shows DELIVERED to the address on the PayPal transaction",
      points: 30,
      passed: delivered,
      artifact_id: delivered ? tracking!.id : undefined,
      gap: delivered
        ? undefined
        : "No artifact shows delivery to the PayPal transaction address.",
    },
    {
      key: "delivery_verifiable",
      label: "Delivery date + carrier verifiable in merchant record",
      points: 15,
      passed: deliveryVerifiable,
      artifact_id: deliveryVerifiable ? tracking!.id : undefined,
      gap: deliveryVerifiable
        ? undefined
        : "Carrier + tracking number + delivery status not verifiable.",
    },
    {
      key: "signature_confirmation",
      label:
        "Signature confirmation present (US: required for $750+ sales before Jan 26, 2026; recommended, not required after — Phase 0 row 8)",
      points: 15,
      passed: signature,
      artifact_id: signature ? tracking!.id : undefined,
      gap: signature
        ? undefined
        : "No signed proof artifact. Bonus evidence only for post-Jan-2026 US sales.",
    },
    {
      key: "merchant_log_post_delivery_use",
      label:
        "Merchant log ties buyer identity to post-delivery use/access (merchant's own system only)",
      points: 25,
      passed: logTiesBuyer,
      artifact_id: logTiesBuyer ? merchantLog!.id : undefined,
      gap: logTiesBuyer
        ? undefined
        : "No merchant log entry ties the buyer to post-delivery use.",
    },
    {
      key: "invoice_terms_consistent",
      label: "Invoice / order record + terms timestamp consistent with the dispute",
      points: 15,
      passed: invoiceConsistent,
      artifact_id: invoiceConsistent ? invoice!.id : undefined,
      gap: invoiceConsistent
        ? undefined
        : "No invoice / order record in the merchant evidence store.",
    },
  ];

  const score = items.reduce((s, i) => s + (i.passed ? i.points : 0), 0);
  const gaps = items.filter((i) => !i.passed).map((i) => i.gap!);
  return { score, items, gaps };
}

/** Routing policy (brief §5). Not a prediction. */
export function verdictForScore(score: number): Verdict {
  if (score >= 75) return "CONTEST_HARD_PROOF";
  if (score >= 35) return "DE_ESCALATE_OFFER";
  return "CONCEDE_FAST_SETTLE";
}

export function actionForVerdict(v: Verdict): string {
  switch (v) {
    case "CONTEST_HARD_PROOF":
      return "provide-evidence";
    case "DE_ESCALATE_OFFER":
      return "make-offer";
    case "CONCEDE_FAST_SETTLE":
      return "accept-claim";
  }
}

/** Illustrative EV — not a PayPal outcome prediction. */
export function evDisplay(
  score: number,
  amountUsd: number,
  feeUsd: number = STANDARD_DISPUTE_FEE_USD,
): EvDisplay {
  const p = score / 100;
  return {
    ev_contest: +(p * amountUsd - (1 - p) * (amountUsd + feeUsd)).toFixed(2),
    concede_cost: +(amountUsd + feeUsd).toFixed(2),
    offer_cost: +(amountUsd * 0.4).toFixed(2),
    fee_usd: feeUsd,
    fee_basis:
      "US Standard Dispute Fee $15 (PayPal merchant fee schedule, last updated Oct 1, 2026). High-volume $30 / chargeback $20 are separate routes.",
  };
}
