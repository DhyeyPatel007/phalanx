import type {
  AttachedEvidence,
  CanonicalGapCode,
  ChecklistItem,
  Dispute,
  EvidenceType,
  NamedGap,
  Verdict,
} from "./types";

export interface CanonicalGapMetadata {
  code: CanonicalGapCode;
  title: string;
  defaultSummary: string;
  scoreImpactPts: number;
  recommendedEvidenceType: EvidenceType;
  resolvingEvidenceTypes: EvidenceType[];
  resolvingChecklistKeys: string[];
}

export const CANONICAL_GAPS: Record<CanonicalGapCode, CanonicalGapMetadata> = {
  MISSING_TRACKING: {
    code: "MISSING_TRACKING",
    title: "Missing Carrier Tracking",
    defaultSummary: "No carrier tracking number or carrier name provided in merchant records.",
    scoreImpactPts: 30,
    recommendedEvidenceType: "TRACKING_RECEIPT",
    resolvingEvidenceTypes: ["TRACKING_RECEIPT", "CARRIER_POD"],
    resolvingChecklistKeys: ["tracking_delivered"],
  },
  MISSING_DELIVERY_PROOF: {
    code: "MISSING_DELIVERY_PROOF",
    title: "Missing Delivery Proof / POD",
    defaultSummary: "Tracking exists but lacks confirmed DELIVERED status or carrier proof-of-delivery.",
    scoreImpactPts: 25,
    recommendedEvidenceType: "CARRIER_POD",
    resolvingEvidenceTypes: ["CARRIER_POD", "DELIVERY_PHOTO"],
    resolvingChecklistKeys: ["tracking_delivered", "delivery_verifiable"],
  },
  MISSING_SIGNATURE_HIGH_VALUE: {
    code: "MISSING_SIGNATURE_HIGH_VALUE",
    title: "No Signature Confirmation on File",
    defaultSummary: "No signed courier receipt or recipient signature captured for transaction verification.",
    scoreImpactPts: 15,
    recommendedEvidenceType: "CARRIER_POD",
    resolvingEvidenceTypes: ["CARRIER_POD"],
    resolvingChecklistKeys: ["signature_confirmation"],
  },
  ADDRESS_MISMATCH: {
    code: "ADDRESS_MISMATCH",
    title: "Delivery Address / ZIP Mismatch",
    defaultSummary: "Carrier delivery record does not match the buyer shipping address on PayPal transaction.",
    scoreImpactPts: 20,
    recommendedEvidenceType: "TRACKING_RECEIPT",
    resolvingEvidenceTypes: ["TRACKING_RECEIPT", "CARRIER_POD"],
    resolvingChecklistKeys: ["tracking_delivered"],
  },
  CARRIER_MISMATCH_DIGITAL: {
    code: "CARRIER_MISMATCH_DIGITAL",
    title: "Physical Carrier for Intangible Good",
    defaultSummary: "Physical carrier tracking cited for digital/intangible goods, or vice versa.",
    scoreImpactPts: 15,
    recommendedEvidenceType: "MERCHANT_LOG",
    resolvingEvidenceTypes: ["MERCHANT_LOG", "EMAIL_CONFIRMATION"],
    resolvingChecklistKeys: ["merchant_log_post_delivery_use"],
  },
  MISSING_MERCHANT_LOG: {
    code: "MISSING_MERCHANT_LOG",
    title: "Missing Merchant Fulfillment Log",
    defaultSummary: "No internal system access, license activation, or fulfillment log tying buyer to product use.",
    scoreImpactPts: 25,
    recommendedEvidenceType: "MERCHANT_LOG",
    resolvingEvidenceTypes: ["MERCHANT_LOG"],
    resolvingChecklistKeys: ["merchant_log_post_delivery_use"],
  },
  MISSING_TIMESTAMP_ALIGNMENT: {
    code: "MISSING_TIMESTAMP_ALIGNMENT",
    title: "Fulfillment Timestamp Discrepancy",
    defaultSummary: "Fulfillment or delivery timestamp is absent or misaligned with the transaction timeline.",
    scoreImpactPts: 15,
    recommendedEvidenceType: "MERCHANT_LOG",
    resolvingEvidenceTypes: ["MERCHANT_LOG", "INVOICE"],
    resolvingChecklistKeys: ["delivery_verifiable", "invoice_terms_consistent"],
  },
  MISSING_INVOICE_ITEMIZATION: {
    code: "MISSING_INVOICE_ITEMIZATION",
    title: "Missing Itemized Invoice / Bill",
    defaultSummary: "No itemized order receipt or invoice matching the disputed amount and line items.",
    scoreImpactPts: 15,
    recommendedEvidenceType: "INVOICE",
    resolvingEvidenceTypes: ["INVOICE"],
    resolvingChecklistKeys: ["invoice_terms_consistent"],
  },
  SPEC_MISMATCH_NAD: {
    code: "SPEC_MISMATCH_NAD",
    title: "Unsubstantiated Item Condition Proof",
    defaultSummary: "Lacks pre-shipment QA inspection or condition photo countering 'Not as Described' claim.",
    scoreImpactPts: 15,
    recommendedEvidenceType: "DELIVERY_PHOTO",
    resolvingEvidenceTypes: ["DELIVERY_PHOTO", "INVOICE"],
    resolvingChecklistKeys: ["invoice_terms_consistent"],
  },
  OTHER_GAP: {
    code: "OTHER_GAP",
    title: "Supporting Evidence Advisory",
    defaultSummary: "Additional supporting documentation recommended to reinforce merchant defense position.",
    scoreImpactPts: 5,
    recommendedEvidenceType: "OTHER",
    resolvingEvidenceTypes: ["OTHER", "EMAIL_CONFIRMATION"],
    resolvingChecklistKeys: [],
  },
};

/**
 * Classify any free-text gap from jurors / red-team into a CanonicalGapCode.
 */
export function classifyGapCode(rawText: string): CanonicalGapCode {
  const t = rawText.toLowerCase();

  // Digital carrier mismatch
  if (/fedex.*digital|digital.*carrier|intangible.*shipping|physical carrier.*digital/i.test(t)) {
    return "CARRIER_MISMATCH_DIGITAL";
  }

  // Signature
  if (/signed|signature/i.test(t)) {
    return "MISSING_SIGNATURE_HIGH_VALUE";
  }

  // Tracking (check tracking keywords before generic receipts)
  if (/tracking|waybill|carrier name|no tracking|missing tracking/i.test(t)) {
    if (/status.*(delivered|delivery)|not delivered|undelivered|no delivery proof|pod/i.test(t)) {
      return "MISSING_DELIVERY_PROOF";
    }
    return "MISSING_TRACKING";
  }

  // Delivery Proof / POD
  if (/deliver|pod|proof of delivery|drop-?off|photo|courier proof/i.test(t)) {
    return "MISSING_DELIVERY_PROOF";
  }

  // Merchant fulfillment / access logs
  if (/merchant.?log|access.?log|server.?log|fulfillment.?log|pre-shipment qa|download log/i.test(t)) {
    return "MISSING_MERCHANT_LOG";
  }

  // Address mismatch
  if (/address|zip|postal|destination/i.test(t)) {
    return "ADDRESS_MISMATCH";
  }

  // Timestamp alignment
  if (/timestamp|date.*mismatch|time.*log|predates/i.test(t)) {
    return "MISSING_TIMESTAMP_ALIGNMENT";
  }

  // Item Not as Described / Spec mismatch
  if (/not as described|description|color|spec|condition|defect|quality|mismatch|wrong item/i.test(t)) {
    return "SPEC_MISMATCH_NAD";
  }

  // Invoice / billing itemization
  if (/invoice|bill|receipt|itemiz|sku/i.test(t)) {
    return "MISSING_INVOICE_ITEMIZATION";
  }

  return "OTHER_GAP";
}

/**
 * Extract source persona tags from raw text if present.
 */
function extractPersonas(rawText: string): string[] {
  const personas: string[] = [];
  const t = rawText.toLowerCase();
  if (/evidence|auditor/i.test(t)) personas.push("evidence");
  if (/policy|stickler/i.test(t)) personas.push("policy");
  if (/buyer|advocate|consumer/i.test(t)) personas.push("buyer_sympathy");
  if (/red-?team|adversary/i.test(t)) personas.push("red_team");

  return personas.length > 0 ? personas : ["red_team"];
}

/**
 * Clean raw text from markdown and quorum tags.
 */
function cleanGapText(rawText: string): string {
  return rawText
    .replace(/^\[(QUORUM 2\/3\+|ADVISORY 1\/3|JURY)\]\s*/i, "")
    .replace(/^[-*•]\s*/, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .trim();
}

/**
 * Deduplicate dozens of free-text juror gaps into canonical NamedGap buckets.
 */
export function deduplicateGaps(
  rawGaps: string[],
  checklistItems: ChecklistItem[] = [],
  attachedEvidence: AttachedEvidence[] = [],
  dispute?: Dispute,
): NamedGap[] {
  const buckets = new Map<
    CanonicalGapCode,
    {
      code: CanonicalGapCode;
      rawTexts: string[];
      citedBySet: Set<string>;
    }
  >();

  // Populate from checklist gaps first (ground truth)
  for (const item of checklistItems) {
    if (!item.passed && item.gap) {
      const code = classifyGapCode(item.gap);
      if (!buckets.has(code)) {
        buckets.set(code, {
          code,
          rawTexts: [item.gap],
          citedBySet: new Set(["checklist", "red_team"]),
        });
      }
    }
  }

  // Group all raw juror / red-team gap strings
  for (const raw of rawGaps) {
    const cleaned = cleanGapText(raw);
    if (!cleaned) continue;

    const code = classifyGapCode(cleaned);
    const personas = extractPersonas(raw);

    if (!buckets.has(code)) {
      buckets.set(code, {
        code,
        rawTexts: [],
        citedBySet: new Set(),
      });
    }

    const b = buckets.get(code)!;
    b.rawTexts.push(cleaned);
    for (const p of personas) {
      b.citedBySet.add(p);
    }
  }

  // Check what attached evidence or checklist passes resolve
  const passedKeys = new Set(
    checklistItems.filter((i) => i.passed).map((i) => i.key),
  );
  const attachedTypes = new Set(attachedEvidence.map((a) => a.evidenceType));

  const namedGaps: NamedGap[] = [];

  for (const [code, b] of buckets.entries()) {
    const meta = CANONICAL_GAPS[code];
    const isResolvedByChecklist = meta.resolvingChecklistKeys.some((k) =>
      passedKeys.has(k),
    );
    const isResolvedByAttached = meta.resolvingEvidenceTypes.some((t) =>
      attachedTypes.has(t),
    );
    const resolved = isResolvedByChecklist || isResolvedByAttached;

    // Pick the most concrete, shortest non-empty description
    const sortedTexts = [...b.rawTexts].sort((x, y) => x.length - y.length);
    const summary = sortedTexts[0] || meta.defaultSummary;

    // Ensure citedBy includes personas or sensible default
    const citedBy = Array.from(b.citedBySet);
    if (citedBy.length === 0) citedBy.push("evidence", "policy");

    namedGaps.push({
      code,
      title: meta.title,
      summary,
      citedBy,
      rawCount: b.rawTexts.length || 1,
      scoreImpactPts: meta.scoreImpactPts,
      recommendedEvidenceType: meta.recommendedEvidenceType,
      resolved,
    });
  }

  // Sort: unresolved first, then scoreImpactPts DESC, then rawCount DESC, then enum order
  const enumOrder: Record<CanonicalGapCode, number> = {
    MISSING_TRACKING: 1,
    MISSING_DELIVERY_PROOF: 2,
    MISSING_MERCHANT_LOG: 3,
    MISSING_SIGNATURE_HIGH_VALUE: 4,
    SPEC_MISMATCH_NAD: 5,
    MISSING_INVOICE_ITEMIZATION: 6,
    ADDRESS_MISMATCH: 7,
    CARRIER_MISMATCH_DIGITAL: 8,
    MISSING_TIMESTAMP_ALIGNMENT: 9,
    OTHER_GAP: 10,
  };

  namedGaps.sort((a, b) => {
    if (a.resolved !== b.resolved) {
      return a.resolved ? 1 : -1; // Unresolved first
    }
    if (b.scoreImpactPts !== a.scoreImpactPts) {
      return b.scoreImpactPts - a.scoreImpactPts;
    }
    if (b.citedBy.length !== a.citedBy.length) {
      return b.citedBy.length - a.citedBy.length;
    }
    return enumOrder[a.code] - enumOrder[b.code];
  });

  return namedGaps;
}

/**
 * Generate 2–3 practical reasons from deterministic checklist facts.
 */
export function buildPracticalReasons(
  checklistItems: ChecklistItem[] = [],
  verdict: Verdict,
  score: number,
  attachedEvidence: AttachedEvidence[] = [],
  dispute?: Dispute,
): string[] {
  const reasons: string[] = [];
  const trackingPassed = checklistItems.some(
    (i) => i.key === "tracking_delivered" && i.passed,
  );
  const deliveryVerifiable = checklistItems.some(
    (i) => i.key === "delivery_verifiable" && i.passed,
  );
  const logPassed = checklistItems.some(
    (i) => i.key === "merchant_log_post_delivery_use" && i.passed,
  );
  const invoicePassed = checklistItems.some(
    (i) => i.key === "invoice_terms_consistent" && i.passed,
  );
  const sigPassed = checklistItems.some(
    (i) => i.key === "signature_confirmation" && i.passed,
  );

  const amountStr = dispute ? `$${parseFloat(dispute.amount.value).toFixed(2)} USD` : "";

  // 1. High score / CONTEST route
  if (score >= 75 || verdict === "CONTEST_HARD_PROOF") {
    if (trackingPassed && deliveryVerifiable) {
      reasons.push(
        "[+45 pts] Carrier tracking shows DELIVERED with audit-verifiable carrier timestamp.",
      );
    } else if (trackingPassed) {
      reasons.push("[+30 pts] Carrier tracking confirms delivery to transaction address.");
    }

    if (logPassed) {
      reasons.push(
        "[+25 pts] Merchant internal fulfillment log ties buyer identity to post-delivery product use.",
      );
    }

    if (invoicePassed) {
      reasons.push(
        `[+15 pts] Itemized invoice & terms timestamps align with disputed ${amountStr || "transaction"} amount.`,
      );
    } else if (attachedEvidence.length > 0) {
      // scoreDelta is the ACTUAL slot award by the time this runs
      // (computeAttachedEvidenceDelta syncs it): pick the biggest
      // contributor, and say nothing if nothing actually contributed
      // (e.g. every attachment was a CONTRADICTION at 0 pts).
      const best = attachedEvidence.reduce((a, b) =>
        b.scoreDelta > a.scoreDelta ? b : a,
      );
      if (best.scoreDelta > 0) {
        reasons.push(
          `[+${best.scoreDelta} pts] Verified merchant attachment (${best.evidenceType}) satisfies evidentiary burden.`,
        );
      }
    } else if (sigPassed) {
      reasons.push("[+15 pts] Recipient signature confirmation on file.");
    }
  }
  // 2. Medium score / DE_ESCALATE_OFFER route
  else if (score >= 35 || verdict === "DE_ESCALATE_OFFER") {
    if (trackingPassed) {
      reasons.push(
        `[+${deliveryVerifiable ? 45 : 30} pts] Delivery tracking confirmed, satisfying primary PayPal seller protection baseline.`,
      );
    }
    if (invoicePassed) {
      reasons.push(
        `[+15 pts] Itemized invoice confirms transaction validity for ${amountStr || "dispute"}.`,
      );
    }
    if (!logPassed) {
      reasons.push(
        dispute?.reason === "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED"
          ? "[-25 pts] Lacks pre-shipment condition proof / inspection log to refute description claim."
          : "[-25 pts] Lacks merchant system log confirming buyer post-delivery access or activity.",
      );
    }
  }
  // 3. Low score / CONCEDE_FAST_SETTLE route
  else {
    reasons.push("[0 pts] No carrier tracking or delivery confirmation in merchant records.");
    reasons.push(
      "[0 pts] No merchant fulfillment logs or itemized order proofs on file.",
    );
    reasons.push(
      `Fast settlement routes to accept-claim${amountStr ? ` (${amountStr})` : ""}; avoids PayPal dispute fees.`,
    );
  }

  // Ensure 2–3 reasons returned
  if (reasons.length < 2) {
    reasons.push("Checklist score determines routing policy strictly under PayPal Seller Protection.");
  }
  return reasons.slice(0, 3);
}
