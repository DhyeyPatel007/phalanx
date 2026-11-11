import { createHash } from "crypto";
import type {
  AttachedEvidence,
  CanonicalGapCode,
  ChecklistItem,
  Dispute,
  EvidenceQuality,
  EvidenceType,
  Verdict,
} from "./types";
import { evDisplay, verdictForScore } from "./scorer";

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB per file
export const MAX_ATTACHMENTS_PER_DISPUTE = 10;

export const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".txt",
  ".json",
  ".csv",
];

export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "text/plain",
  "application/json",
  "text/csv",
]);

export interface AttachmentMetadata {
  referenceId?: string;
  documentDate?: string;
  notes?: string;
}

export function computeSha256(buffer: Buffer | Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Deterministically classify the evidence quality:
 * - STRONG: Valid format + at least 2 verifiable anchors (identifier, date/amount)
 * - WEAK: Valid format, but lacks verifiable anchors
 * - INVALID: Empty, corrupt, or unsupported
 */
export function classifyEvidenceQuality(
  evidenceType: EvidenceType,
  fileName: string,
  mimeType: string,
  bytes: Buffer | Uint8Array,
  metadata?: AttachmentMetadata,
  dispute?: Dispute,
): {
  quality: EvidenceQuality;
  scoreDelta: number;
  reason: string;
} {
  const size = bytes.length;
  if (size === 0 || size > MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      quality: "INVALID",
      scoreDelta: 0,
      reason: size === 0 ? "File is empty" : "File exceeds 5 MB limit",
    };
  }

  // Check magic bytes / header
  const isPdf =
    (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) &&
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46; // %PDF

  const isPng =
    (mimeType === "image/png" || fileName.toLowerCase().endsWith(".png")) &&
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47; // \x89PNG

  const isJpg =
    (mimeType === "image/jpeg" ||
      mimeType === "image/jpg" ||
      fileName.toLowerCase().endsWith(".jpg") ||
      fileName.toLowerCase().endsWith(".jpeg")) &&
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff; // JPEG SOI

  const isTextBased =
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    /\.(txt|json|csv)$/i.test(fileName);

  const isValidFormat = isPdf || isPng || isJpg || isTextBased;
  if (!isValidFormat) {
    return {
      quality: "INVALID",
      scoreDelta: 0,
      reason: "Unsupported or corrupt file format",
    };
  }

  // Count verifiable anchors
  let anchors = 0;

  // Anchor 1: Reference ID or valid identifier pattern
  const refId = metadata?.referenceId?.trim() || "";
  if (refId && /^[A-Z0-9_-]{4,}$/i.test(refId)) {
    anchors += 1;
  }

  // Anchor 2: Date or amount
  const docDate = metadata?.documentDate?.trim() || "";
  if (docDate && /^\d{4}-\d{2}-\d{2}$/.test(docDate)) {
    anchors += 1;
  }

  // If text or PDF, inspect content stream for anchors
  if (isTextBased || isPdf) {
    try {
      const textPreview = Buffer.from(bytes.slice(0, Math.min(bytes.length, 8192))).toString("utf-8");
      if (anchors < 2) {
        if (!refId && /\b(?:INV|ORDER|TRACK|FEDEX|UPS|USPS|PP-D)-[A-Z0-9-]+\b/i.test(textPreview)) {
          anchors += 1;
        }
      }
      if (anchors < 2) {
        if (!docDate && /\b\d{4}-\d{2}-\d{2}\b/.test(textPreview)) {
          anchors += 1;
        } else if (
          dispute &&
          new RegExp(`\\$?\\s*${parseFloat(dispute.amount.value).toFixed(2)}`).test(textPreview)
        ) {
          anchors += 1;
        }
      }
    } catch {
      // Content scan fallback
    }
  } else if ((isPng || isJpg) && bytes.length >= 1024) {
    // For images, an image with clear reference metadata or valid dimension contributes an anchor
    if (refId || docDate) {
      anchors += 1;
    }
  }

  const isStrong = anchors >= 2 || (bytes.length >= 64 && anchors >= 1 && (refId !== "" || docDate !== ""));
  const quality: EvidenceQuality = isStrong ? "STRONG" : "WEAK";

  // Base delta by evidence type
  const deltaTable: Record<EvidenceType, { strong: number; weak: number }> = {
    CARRIER_POD: { strong: 25, weak: 10 },
    MERCHANT_LOG: { strong: 25, weak: 10 },
    TRACKING_RECEIPT: { strong: 20, weak: 8 },
    INVOICE: { strong: 15, weak: 6 },
    DELIVERY_PHOTO: { strong: 15, weak: 6 },
    EMAIL_CONFIRMATION: { strong: 10, weak: 4 },
    OTHER: { strong: 5, weak: 2 },
  };

  const scoreDelta = quality === "STRONG" ? deltaTable[evidenceType].strong : deltaTable[evidenceType].weak;

  return {
    quality,
    scoreDelta,
    reason: isStrong
      ? `Strong evidentiary proof (${anchors} verifiable anchors verified)`
      : `Weak evidentiary proof (lacks full verifiable anchors, awarded 0.4x partial credit)`,
  };
}

/**
 * Slot-based scoring for attached merchant evidence.
 *
 * Attachments fill the actual checklist slots — they never add flat
 * points on top of a slot the base already passes. Each slot is awarded
 * once, to the best attachment that fills it (STRONG = full slot value,
 * WEAK = 40% of it). An attachment that fills several slots contributes
 * each one it wins. `itemDeltas` records the points actually awarded per
 * attachment id, so a losing attachment records nothing.
 *
 * Slot values (STRONG): tracking_delivered 30, delivery_verifiable 15,
 * signature_confirmation 15, merchant_log_post_delivery_use 25,
 * invoice_terms_consistent 15. WEAK = 40% (12 / 6 / 6 / 10 / 6).
 * OTHER keeps its old flat general-support delta (+5 STRONG / +2 WEAK).
 *
 * Text conditions are read from a UTF-8 preview of the first 8192 bytes
 * of `base64Data` (same approach classifyEvidenceQuality uses). PNG/JPG
 * attachments carry no text — for them only type + quality count.
 *
 * An attachment flagged CONTRADICTION by cross-verification contributes
 * 0 and fills no slot (structural check only — the cross-verify module
 * does not exist yet; the typed field is added by a parallel workstream).
 */
const SLOT_POINTS: Record<string, number> = {
  tracking_delivered: 30,
  delivery_verifiable: 15,
  signature_confirmation: 15,
  merchant_log_post_delivery_use: 25,
  invoice_terms_consistent: 15,
};

const OTHER_DELTA: Record<Exclude<EvidenceQuality, "INVALID">, number> = {
  STRONG: 5,
  WEAK: 2,
};

const CARRIER_RE = /\b(FEDEX|UPS|USPS|DHL)\b/i;
const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}/;
const ISO_TIMESTAMP_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/;
const TRACKING_NUMBER_RE =
  /(?:1Z[0-9A-Z]{16}|9400\d{18}|\b\d{12,22}\b|FBA[0-9A-Z]{6,}|\b(?:FEDEX|UPS|USPS|DHL)\b[^0-9]{0,30}\d{6,})/i;
const SIGNATURE_PROOF_RE = /signed by:|signature_confirmed|signature\s*:|signed\s*:/i;

/** DELIVERED with the same negation guard scoreDispute uses: "NOT /
 *  NEVER / UN-DELIVERED" must never count as delivered. */
function textShowsDelivered(text: string): boolean {
  return (
    /\bDELIVERED\b/i.test(text) &&
    !/\b(NOT|NEVER|UN)[\s-]*DELIVERED\b/i.test(text)
  );
}

function attachmentText(att: AttachedEvidence): string {
  if (!att.base64Data) return "";
  try {
    const buf = Buffer.from(att.base64Data, "base64");
    return buf.subarray(0, 8192).toString("utf-8");
  } catch {
    return "";
  }
}

function sellerTransactionId(dispute: Dispute): string | undefined {
  const detail = dispute.raw_paypal_detail as {
    disputed_transactions?: Array<{ seller_transaction_id?: unknown }>;
  } | null;
  const txs = detail?.disputed_transactions;
  if (Array.isArray(txs) && txs.length > 0) {
    const id = txs[0]?.seller_transaction_id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return undefined;
}

/** True when the text names this dispute: its id, or the seller
 *  transaction id from the PayPal detail's disputed_transactions. */
function textHasTxnId(text: string, dispute: Dispute): boolean {
  if (dispute.id && text.includes(dispute.id)) return true;
  const sellerTx = sellerTransactionId(dispute);
  return Boolean(sellerTx && text.includes(sellerTx));
}

/** True when the text carries the dispute amount (exact "480.00" form,
 *  or a "$480" shorthand). */
function textHasAmount(text: string, dispute: Dispute): boolean {
  const value = dispute.amount?.value;
  if (!value) return false;
  if (text.includes(value)) return true;
  const amt = parseFloat(value);
  if (!Number.isFinite(amt)) return false;
  return text.includes(`$${amt}`) || text.includes(`$ ${amt}`);
}

function slotPoints(slot: string, quality: EvidenceQuality): number {
  const strong = SLOT_POINTS[slot] ?? 0;
  return quality === "WEAK" ? Math.round(strong * 0.4) : strong;
}

interface SlotAward {
  slot: string;
  points: number;
  attId: string;
}

/**
 * Deterministically compute the score delta from attached evidence without modifying
 * the zero-attachment baseline.
 */
export function computeAttachedEvidenceDelta(
  attached: AttachedEvidence[],
  baseItems: ChecklistItem[],
  dispute: Dispute,
  baseScore: number,
): {
  delta: number;
  finalScore: number;
  itemDeltas: Record<string, number>;
  resolvedGaps: Set<CanonicalGapCode>;
  verdict: Verdict;
} {
  if (attached.length === 0) {
    return {
      delta: 0,
      finalScore: baseScore,
      itemDeltas: {},
      resolvedGaps: new Set(),
      verdict: verdictForScore(baseScore),
    };
  }

  const passedKeys = new Set(baseItems.filter((i) => i.passed).map((i) => i.key));
  const itemDeltas: Record<string, number> = {};
  const resolvedGaps = new Set<CanonicalGapCode>();

  // Candidate slot awards per attachment, in attachment order.
  const candidates: SlotAward[] = [];
  // Best OTHER flat award (not a slot): at most one OTHER contributes.
  let bestOther: { points: number; attId: string } | null = null;

  const addAward = (slot: string, att: AttachedEvidence) => {
    if (passedKeys.has(slot)) return; // never double-count a passed slot
    const points = slotPoints(slot, att.quality);
    if (points > 0) candidates.push({ slot, points, attId: att.id });
  };

  for (const att of attached) {
    if (att.quality === "INVALID") continue;
    // CONTRADICTION skip: contributes 0, fills no slot, resolves no gap.
    // Structural check only — the cross-verify module does not exist yet;
    // the typed `crossVerify` field is added by a parallel workstream.
    const crossVerify = (att as unknown as { crossVerify?: { status?: string } }).crossVerify;
    if (crossVerify?.status === "CONTRADICTION") continue;

    const text = attachmentText(att);

    if (att.evidenceType === "TRACKING_RECEIPT" || att.evidenceType === "CARRIER_POD") {
      resolvedGaps.add("MISSING_TRACKING");
      if (att.evidenceType === "CARRIER_POD") {
        resolvedGaps.add("MISSING_DELIVERY_PROOF");
        resolvedGaps.add("MISSING_SIGNATURE_HIGH_VALUE");
      }
      const delivered = textShowsDelivered(text) && TRACKING_NUMBER_RE.test(text);
      if (delivered) {
        addAward("tracking_delivered", att);
        if (CARRIER_RE.test(text) && ISO_DATE_RE.test(text)) {
          addAward("delivery_verifiable", att);
        }
      }
      if (att.evidenceType === "CARRIER_POD" && SIGNATURE_PROOF_RE.test(text)) {
        addAward("signature_confirmation", att);
      }
    } else if (att.evidenceType === "MERCHANT_LOG") {
      resolvedGaps.add("MISSING_MERCHANT_LOG");
      resolvedGaps.add("MISSING_TIMESTAMP_ALIGNMENT");
      if (ISO_TIMESTAMP_RE.test(text) && textHasTxnId(text, dispute)) {
        addAward("merchant_log_post_delivery_use", att);
      }
    } else if (att.evidenceType === "INVOICE") {
      resolvedGaps.add("MISSING_INVOICE_ITEMIZATION");
      if (textHasAmount(text, dispute) && textHasTxnId(text, dispute)) {
        addAward("invoice_terms_consistent", att);
      }
    } else if (att.evidenceType === "DELIVERY_PHOTO") {
      resolvedGaps.add("SPEC_MISMATCH_NAD");
      resolvedGaps.add("MISSING_DELIVERY_PROOF");
      // Type + quality only: a photo carries no readable text.
      addAward("delivery_verifiable", att);
    } else if (att.evidenceType === "EMAIL_CONFIRMATION") {
      resolvedGaps.add("OTHER_GAP");
      addAward("invoice_terms_consistent", att);
    } else if (att.evidenceType === "OTHER") {
      resolvedGaps.add("OTHER_GAP");
      const points = OTHER_DELTA[att.quality as Exclude<EvidenceQuality, "INVALID">];
      if (!bestOther || points > bestOther.points) {
        bestOther = { points, attId: att.id };
      }
    }
  }

  // Best per slot wins across attachments (first wins on a tie).
  const bestBySlot = new Map<string, SlotAward>();
  for (const award of candidates) {
    const cur = bestBySlot.get(award.slot);
    if (!cur || award.points > cur.points) bestBySlot.set(award.slot, award);
  }

  let totalDelta = 0;
  for (const award of bestBySlot.values()) {
    itemDeltas[award.attId] = (itemDeltas[award.attId] ?? 0) + award.points;
    totalDelta += award.points;
  }
  if (bestOther) {
    itemDeltas[bestOther.attId] = (itemDeltas[bestOther.attId] ?? 0) + bestOther.points;
    totalDelta += bestOther.points;
  }

  const finalScore = Math.min(100, baseScore + totalDelta);
  const verdict = verdictForScore(finalScore);

  return {
    delta: totalDelta,
    finalScore,
    itemDeltas,
    resolvedGaps,
    verdict,
  };
}
