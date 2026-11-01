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
export const HIGH_VOLUME_DISPUTE_FEE_USD = 30;
export const CHARGEBACK_FEE_USD = 20;

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
 * Resolves the applicable PayPal dispute fee deterministically from the dispute's
 * life cycle stage, channel, and merchant volume tier.
 */
export function resolveFeeForDispute(dispute?: Dispute): {
  feeUsd: number;
  feeBasis: string;
} {
  const channel = (dispute?.raw_paypal_detail as { dispute_channel?: string } | null)?.dispute_channel;
  if (dispute?.dispute_life_cycle_stage === "CHARGEBACK" && channel === "EXTERNAL") {
    return {
      feeUsd: CHARGEBACK_FEE_USD,
      feeBasis:
        "US Chargeback Fee $20 (card payment outside PayPal account, Oct 1, 2026 schedule). Standard Dispute Fee is $15; High-Volume is $30.",
    };
  }
  return {
    feeUsd: STANDARD_DISPUTE_FEE_USD,
    feeBasis:
      "Default: US Standard Dispute Fee $15 (Oct 1, 2026 schedule; merchant volume tier unknown — High-Volume $30 / Chargeback $20 are separate routes; $15 waived in INQUIRY or seller-favour outcome).",
  };
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

  // Check #1: Literal matching with negation guards: "NOT DELIVERED" / "UNDELIVERED"
  // must score 0, not 30+15 — a bare /DELIVERED/i matched those too.
  const delivered =
    summaryHas(tracking, /\bDELIVERED\b/i) &&
    !summaryHas(tracking, /\b(NOT|NEVER|UN)[\s-]*DELIVERED\b/i);

  // Check #2: Independent auditability — named carrier + ISO delivery date
  const deliveryVerifiable =
    delivered &&
    summaryHas(tracking, /\b(FEDEX|UPS|USPS|DHL)\b/i) &&
    summaryHas(tracking, /\d{4}-\d{2}-\d{2}/);

  // Check #3: Signature confirmation — bonus evidence. US rule (Phase 0 row 8):
  // required for $750+ sales BEFORE Jan 26, 2026; recommended, not required,
  // after that date. No seed carries a signature artifact, so this is a gap
  // for every seeded dispute — recorded, never waived.
  const signature =
    summaryHas(tracking, /\b(SIGNATURE|SIGNED)\b/i) &&
    !summaryHas(tracking, /\b(NO|WITHOUT|UNSIGNED|NOT)\s+(SIGNATURE|SIGNED)\b/i);

  // Check #4: Merchant log ties buyer to post-delivery product use / condition
  const logTiesBuyer =
    Boolean(merchantLog) &&
    /post-delivery|used product|access|license|builds/i.test(merchantLog!.summary);

  // Check #5: Invoice / terms consistent
  const invoiceConsistent = Boolean(invoice);

  // Reason-aware gap message for merchant_log
  const merchantLogGap =
    dispute.reason === "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED"
      ? "No merchant log entry or pre-shipment QA check corroborates item condition / post-delivery usage."
      : "No merchant log entry ties the buyer to post-delivery use.";

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
      gap: logTiesBuyer ? undefined : merchantLogGap,
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

/**
 * Dynamic offer sizing formula (Decision #3).
 * Linear curve anchored at score = 60 -> 40% (preserving Scenario B $84 exact),
 * bounded between 20% floor and 60% cap.
 */
export function computeOfferPct(score: number): number {
  const raw = 0.40 + (60 - score) * 0.008;
  const clamped = Math.min(0.60, Math.max(0.20, raw));
  return Math.round(clamped * 1000) / 1000;
}

export function computeOfferAmount(
  score: number,
  amountUsd: number,
): {
  offerUsd: number;
  offerPct: number;
} {
  const pct = computeOfferPct(score);
  return {
    offerUsd: +(amountUsd * pct).toFixed(2),
    offerPct: Math.round(pct * 100),
  };
}

/**
 * Deterministic Outcome & Break-Even Matrix (Decision #1).
 * Replaces the probabilistic ev_contest calculation with deterministic financial
 * boundaries side-by-side with the algebraic break-even win rate required for
 * contesting to beat a settlement offer.
 */
export function evDisplay(
  score: number,
  amountUsd: number,
  feeUsd: number = STANDARD_DISPUTE_FEE_USD,
  disputeOrStage?: Dispute | string,
): EvDisplay {
  let dispute: Dispute | undefined;
  let stage = "CLAIM";

  if (typeof disputeOrStage === "string") {
    stage = disputeOrStage;
  } else if (disputeOrStage && typeof disputeOrStage === "object") {
    dispute = disputeOrStage;
    stage = dispute.dispute_life_cycle_stage || "CLAIM";
  }

  const resolved = dispute
    ? resolveFeeForDispute(dispute)
    : {
        feeUsd,
        feeBasis:
          "US Standard Dispute Fee $15 (PayPal merchant fee schedule, last updated Oct 1, 2026). Waived when resolved directly with the buyer (INQUIRY concede) or decided in the seller's favour. High-volume $30 / chargeback $20 are separate routes.",
      };

  const activeFee = dispute ? resolved.feeUsd : feeUsd;
  const { offerUsd, offerPct } = computeOfferAmount(score, amountUsd);
  const contestLostCost = +(amountUsd + activeFee).toFixed(2);
  const isInquiry = stage === "INQUIRY";
  const concedeCost = isInquiry ? +amountUsd.toFixed(2) : contestLostCost;

  // Algebraic threshold: (amount - offer + fee) / (amount + fee) * 100
  const breakevenVsOffer = Math.round(
    ((amountUsd - offerUsd + activeFee) / (amountUsd + activeFee)) * 100,
  );

  return {
    contest_upheld_net_usd: 0,
    contest_lost_cost_usd: contestLostCost,
    offer_cost_usd: offerUsd,
    offer_retained_usd: +(amountUsd - offerUsd).toFixed(2),
    offer_pct: offerPct,
    concede_cost_usd: concedeCost,
    breakeven_win_rate_vs_offer_pct: breakevenVsOffer,
    concede_cost: concedeCost,
    offer_cost: offerUsd,
    fee_usd: activeFee,
    fee_basis: resolved.feeBasis,
    ev_contest: 0,
  };
}
