// PHALANX unit checks — workstream A (live-evidence fix).
// Slot-based attached-evidence scoring + PayPal Tracking API probe.
// Run via a TEMPORARY runner (e.g. /tmp/run-part-a.ts) that imports
// runPartAChecks and provides a counting `check` (strict ===, like the
// main runner). Do NOT wire into scripts/unit-checks.ts here — the
// coordinator does that. No server, no live PayPal calls: the tracking
// probe is exercised on its unconfigured fail-soft path (this VM has
// no PayPal credentials) plus pure derivation from fake records.

import { artifactsFromDetail, trackingArtifactFromRecord } from "../src/lib/ingest";
import { getTrackingForTransaction, paypalConfigured } from "../src/lib/paypal";
import { scoreDispute } from "../src/lib/scorer";
import { computeAttachedEvidenceDelta } from "../src/lib/evidence-scorer";
import type {
  AttachedEvidence,
  ChecklistItem,
  Dispute,
  EvidenceArtifact,
} from "../src/lib/types";

type Check = (name: string, expected: unknown, actual: unknown) => void;

function dispute(partial: Partial<Dispute> & { id: string }): Dispute {
  return {
    source: "seeded",
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    amount: { currency_code: "USD", value: "100.00" },
    status: "WAITING_FOR_SELLER_RESPONSE",
    dispute_life_cycle_stage: "INQUIRY",
    dispute_state: "REQUIRED_ACTION",
    allowed_actions: ["provide-evidence", "accept-claim", "send-message"],
    allowed_response_options: {
      accept_claim: { accept_claim_types: ["REFUND"] },
    },
    raw_paypal_detail: null,
    created_at: new Date().toISOString(),
    ...partial,
  };
}

function b64(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64");
}

function attached(
  id: string,
  evidenceType: AttachedEvidence["evidenceType"],
  quality: AttachedEvidence["quality"],
  text: string,
  disputeId = "PP-D-LIVE-1",
  mimeType = "text/plain",
): AttachedEvidence {
  return {
    id,
    disputeId,
    fileName: `${id}.txt`,
    mimeType,
    evidenceType,
    sizeBytes: text.length,
    sha256: `test-sha-${id}`,
    quality,
    scoreDelta: 0,
    base64Data: b64(text),
    createdAt: new Date().toISOString(),
  };
}

/** 1x1 PNG (no readable text — type + quality only), as in unit-checks. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function photoAttached(id: string, quality: AttachedEvidence["quality"], disputeId = "PP-D-LIVE-1"): AttachedEvidence {
  return {
    id,
    disputeId,
    fileName: `${id}.png`,
    mimeType: "image/png",
    evidenceType: "DELIVERY_PHOTO",
    sizeBytes: 1024,
    sha256: `test-sha-${id}`,
    quality,
    scoreDelta: 0,
    base64Data: PNG_1X1,
    createdAt: new Date().toISOString(),
  };
}

function withContradiction(att: AttachedEvidence): AttachedEvidence {
  return {
    ...att,
    crossVerify: { status: "CONTRADICTION" },
  } as AttachedEvidence;
}

function itemsFor(passing: string[]): ChecklistItem[] {
  const defs: Array<{ key: string; label: string; points: number }> = [
    { key: "tracking_delivered", label: "Tracking shows DELIVERED", points: 30 },
    { key: "delivery_verifiable", label: "Delivery verifiable", points: 15 },
    { key: "signature_confirmation", label: "Signature confirmation", points: 15 },
    { key: "merchant_log_post_delivery_use", label: "Merchant log post-delivery use", points: 25 },
    { key: "invoice_terms_consistent", label: "Invoice consistent", points: 15 },
  ];
  return defs.map((d) => ({ ...d, passed: passing.includes(d.key) }));
}

// ---- Fixture texts (all carry the anchors the slot rules require) ----
const TRACKING_TEXT =
  "FEDEX tracking 1Z999AA10123456784 DELIVERED to buyer address on 2026-10-25";
const POD_TEXT =
  "CARRIER PROOF OF DELIVERY\nFEDEX 1Z999AA10123456784 DELIVERED 2026-10-25\nSigned by: J. DOE\nSIGNATURE_CONFIRMED";
const POD_NO_SIG_TEXT =
  "CARRIER PROOF OF DELIVERY\nFEDEX 1Z999AA10123456784 DELIVERED 2026-10-25";
const LOG_TEXT =
  "2026-10-25T10:00:00Z buyer PP-D-LIVE-1 activated license key\n2026-10-26T09:30:00Z order PP-D-LIVE-1 exported 3 builds";
const LOG_SELLER_TX_TEXT =
  "2026-10-25T10:00:00Z transaction TXN-LIVE-1 license activated, 3 builds exported";
const LOG_NO_TXN_TEXT =
  "2026-10-25T10:00:00Z buyer activated license key, 3 builds exported";
const LOG_NO_TS_TEXT =
  "buyer PP-D-LIVE-1 activated license key on 2026-10-25, 3 builds exported";
const INVOICE_TEXT =
  "INVOICE INV-2026-480 amount 480.00 USD transaction TXN-LIVE-1 paid via PayPal";
const INVOICE_NO_AMT_TEXT = "INVOICE INV-2026-480 transaction TXN-LIVE-1 paid via PayPal";
const NOT_DELIVERED_TEXT =
  "FEDEX 1Z999AA10123456784 NOT DELIVERED — still in transit";
const UNDELIVERED_TEXT =
  "FEDEX 1Z999AA10123456784 package UNDELIVERED, returned to sender";
const NEVER_DELIVERED_TEXT = "FEDEX 1Z999AA10123456784 NEVER DELIVERED";
const IN_TRANSIT_TEXT =
  "FEDEX 1Z999AA10123456784 in transit, expected 2026-10-26";
const DELIVERED_NO_NUMBER_TEXT = "FEDEX package DELIVERED on 2026-10-25";
const DELIVERED_NUMBER_ONLY_TEXT =
  "Shipment 9400111899561234567890 DELIVERED to buyer";

export async function runPartAChecks(check: Check): Promise<void> {
  // ---- Live bare dispute: base 15 via the real scorer + detail ----
  const liveDetail = {
    disputed_transactions: [
      {
        seller_transaction_id: "TXN-LIVE-1",
        buyer_transaction_id: "TXN-LIVE-1",
        transaction_status: "COMPLETED",
        gross_amount: { currency_code: "USD", value: "480.00" },
      },
    ],
  };
  const liveDispute = dispute({
    id: "PP-D-LIVE-1",
    amount: { currency_code: "USD", value: "480.00" },
    raw_paypal_detail: liveDetail as unknown as Dispute["raw_paypal_detail"],
  });
  const liveBase = scoreDispute(
    liveDispute,
    artifactsFromDetail("PP-D-LIVE-1", liveDetail),
  );
  const liveItems = liveBase.items;
  check("A live bare dispute scores 15 via scoreDispute", 15, liveBase.score);
  check(
    "A live bare dispute passes only invoice_terms_consistent",
    "invoice_terms_consistent",
    liveBase.items.filter((i) => i.passed).map((i) => i.key).join(","),
  );

  const seedAItems = itemsFor([
    "tracking_delivered",
    "delivery_verifiable",
    "merchant_log_post_delivery_use",
    "invoice_terms_consistent",
  ]);
  const seedBItems = itemsFor([
    "tracking_delivered",
    "delivery_verifiable",
    "invoice_terms_consistent",
  ]);
  const emptyItems = itemsFor([]);
  const seedADispute = dispute({ id: "PP-D-88412", amount: { currency_code: "USD", value: "480.00" } });
  const seedBDispute = dispute({ id: "PP-D-88413", amount: { currency_code: "USD", value: "210.00" } });
  const emptyDispute = dispute({ id: "PP-D-EMPTY-1", amount: { currency_code: "USD", value: "100.00" } });

  const trackingStrong = () =>
    attached("att-tracking-strong", "TRACKING_RECEIPT", "STRONG", TRACKING_TEXT);
  const logStrong = () =>
    attached("att-log-strong", "MERCHANT_LOG", "STRONG", LOG_TEXT);
  const podStrong = () =>
    attached("att-pod-strong", "CARRIER_POD", "STRONG", POD_TEXT);

  // ---- Target math ----
  {
    const r = computeAttachedEvidenceDelta(
      [trackingStrong(), logStrong()],
      liveItems,
      liveDispute,
      15,
    );
    check("A live bare + TRACKING + LOG = 85", 85, r.finalScore);
    check("A live bare + TRACKING + LOG delta is 70", 70, r.delta);
    check("A live bare + TRACKING + LOG verdict is CONTEST", "CONTEST_HARD_PROOF", r.verdict);
  }
  {
    const r = computeAttachedEvidenceDelta([trackingStrong()], liveItems, liveDispute, 15);
    check("A live bare + TRACKING only = 60", 60, r.finalScore);
    check("A live bare + TRACKING only delta is 45", 45, r.delta);
    check("A live bare + TRACKING only verdict is OFFER", "DE_ESCALATE_OFFER", r.verdict);
  }
  {
    const r = computeAttachedEvidenceDelta([], liveItems, liveDispute, 15);
    check("A live bare + nothing = 15", 15, r.finalScore);
    check("A live bare + nothing delta is 0", 0, r.delta);
    check("A live bare + nothing verdict is CONCEDE", "CONCEDE_FAST_SETTLE", r.verdict);
  }
  {
    const r = computeAttachedEvidenceDelta([podStrong()], liveItems, liveDispute, 15);
    check("A live bare + CARRIER_POD with signature alone = 75", 75, r.finalScore);
    check("A live bare + CARRIER_POD with signature delta is 60", 60, r.delta);
    check("A live bare + CARRIER_POD verdict is CONTEST", "CONTEST_HARD_PROOF", r.verdict);
    check("A CARRIER_POD awards all 60 to its own id", 60, r.itemDeltas["att-pod-strong"]);
  }
  {
    const r = computeAttachedEvidenceDelta([], seedAItems, seedADispute, 85);
    check("A seeded A with no attachments stays 85", 85, r.finalScore);
    check("A seeded A with no attachments verdict stays CONTEST", "CONTEST_HARD_PROOF", r.verdict);
  }
  {
    // Seeded A invariant via the real scorer (85 = 30 + 15 + 25 + 15).
    const seedArts: EvidenceArtifact[] = [
      { id: "s-t", dispute_id: "PP-D-88412", kind: "tracking", source: "merchant-seed", summary: "FEDEX 774829104829, DELIVERED to PayPal transaction address, delivered 2026-10-25", simulated: true },
      { id: "s-l", dispute_id: "PP-D-88412", kind: "merchant_log", source: "merchant-seed", summary: "Buyer account used product post-delivery (order/buyer ID match): license key activated and 3 production builds exported 2026-10-25 to 2026-10-28", simulated: true },
      { id: "s-i", dispute_id: "PP-D-88412", kind: "invoice", source: "merchant-seed", summary: "Invoice INV-SIM-2026-480 + order record + terms timestamp consistent", simulated: true },
    ];
    check("A seeded A base via scoreDispute is 85", 85, scoreDispute(seedADispute, seedArts).score);
  }

  // ---- Slot fills ----
  {
    const r = computeAttachedEvidenceDelta([trackingStrong()], liveItems, liveDispute, 15);
    check("A TRACKING_RECEIPT STRONG awards 45 to its id", 45, r.itemDeltas["att-tracking-strong"]);
    check("A TRACKING_RECEIPT resolves MISSING_TRACKING", true, r.resolvedGaps.has("MISSING_TRACKING"));
  }
  {
    const podNoSig = attached("att-pod-nosig", "CARRIER_POD", "STRONG", POD_NO_SIG_TEXT);
    const r = computeAttachedEvidenceDelta([podNoSig], liveItems, liveDispute, 15);
    check("A CARRIER_POD without signature text = 45 (no signature slot)", 45, r.delta);
  }
  {
    const r = computeAttachedEvidenceDelta([logStrong()], liveItems, liveDispute, 15);
    check("A MERCHANT_LOG STRONG (dispute id) awards 25", 25, r.delta);
    check("A MERCHANT_LOG resolves MISSING_MERCHANT_LOG", true, r.resolvedGaps.has("MISSING_MERCHANT_LOG"));
  }
  {
    const logTx = attached("att-log-tx", "MERCHANT_LOG", "STRONG", LOG_SELLER_TX_TEXT);
    const r = computeAttachedEvidenceDelta([logTx], liveItems, liveDispute, 15);
    check("A MERCHANT_LOG STRONG (seller tx id) awards 25", 25, r.delta);
  }
  {
    const r = computeAttachedEvidenceDelta(
      [attached("att-log-notxn", "MERCHANT_LOG", "STRONG", LOG_NO_TXN_TEXT)],
      liveItems,
      liveDispute,
      15,
    );
    check("A MERCHANT_LOG without txn id awards 0", 0, r.delta);
  }
  {
    const r = computeAttachedEvidenceDelta(
      [attached("att-log-nots", "MERCHANT_LOG", "STRONG", LOG_NO_TS_TEXT)],
      liveItems,
      liveDispute,
      15,
    );
    check("A MERCHANT_LOG without ISO timestamp awards 0", 0, r.delta);
  }
  {
    const inv = attached(
      "att-inv",
      "INVOICE",
      "STRONG",
      "INVOICE INV-100 amount 100.00 USD order PP-D-EMPTY-1 paid",
      "PP-D-EMPTY-1",
    );
    const r = computeAttachedEvidenceDelta([inv], emptyItems, emptyDispute, 0);
    check("A INVOICE STRONG (amount + txn id) awards 15 on empty base", 15, r.delta);
    check("A INVOICE STRONG fills invoice slot to 15", 15, r.finalScore);
  }
  {
    const r = computeAttachedEvidenceDelta(
      [attached("att-inv-noamt", "INVOICE", "STRONG", INVOICE_NO_AMT_TEXT)],
      liveItems,
      liveDispute,
      15,
    );
    check("A INVOICE without matching amount awards 0", 0, r.delta);
  }
  {
    const r = computeAttachedEvidenceDelta(
      [attached("att-inv-live", "INVOICE", "STRONG", INVOICE_TEXT)],
      liveItems,
      liveDispute,
      15,
    );
    check("A INVOICE STRONG on live bare (invoice already passes) awards 0", 0, r.delta);
  }
  {
    const email = attached("att-email", "EMAIL_CONFIRMATION", "STRONG", "Order confirmed", "PP-D-EMPTY-1");
    const r = computeAttachedEvidenceDelta([email], emptyItems, emptyDispute, 0);
    check("A EMAIL_CONFIRMATION STRONG awards 15 on empty base", 15, r.delta);
  }
  {
    const email = attached("att-email-live", "EMAIL_CONFIRMATION", "STRONG", "Order confirmed");
    const r = computeAttachedEvidenceDelta([email], liveItems, liveDispute, 15);
    check("A EMAIL_CONFIRMATION STRONG on live bare (invoice passes) awards 0", 0, r.delta);
  }
  {
    const r = computeAttachedEvidenceDelta(
      [photoAttached("att-photo", "STRONG", "PP-D-EMPTY-1")],
      emptyItems,
      emptyDispute,
      0,
    );
    check("A DELIVERY_PHOTO STRONG awards 15 on empty base", 15, r.delta);
  }
  {
    const r = computeAttachedEvidenceDelta([photoAttached("att-photo-live", "STRONG")], liveItems, liveDispute, 15);
    check("A DELIVERY_PHOTO STRONG on live bare = 30", 30, r.finalScore);
  }
  {
    const r = computeAttachedEvidenceDelta(
      [photoAttached("att-photo-b", "STRONG", "PP-D-88413")],
      seedBItems,
      seedBDispute,
      60,
    );
    check("A DELIVERY_PHOTO STRONG on seeded B (verifiable passes) awards 0", 0, r.delta);
  }
  {
    const other = attached("att-other", "OTHER", "STRONG", "misc note");
    const r = computeAttachedEvidenceDelta([other], liveItems, liveDispute, 15);
    check("A OTHER STRONG awards flat 5", 5, r.delta);
  }
  {
    const other = attached("att-other-w", "OTHER", "WEAK", "misc note");
    const r = computeAttachedEvidenceDelta([other], liveItems, liveDispute, 15);
    check("A OTHER WEAK awards flat 2", 2, r.delta);
  }

  // ---- WEAK = 40% of STRONG slot values ----
  {
    const r = computeAttachedEvidenceDelta(
      [attached("att-tracking-w", "TRACKING_RECEIPT", "WEAK", TRACKING_TEXT)],
      liveItems,
      liveDispute,
      15,
    );
    check("A TRACKING_RECEIPT WEAK awards 18 (12 + 6)", 18, r.delta);
    check("A TRACKING_RECEIPT WEAK final is 33", 33, r.finalScore);
    check("A TRACKING_RECEIPT WEAK verdict stays CONCEDE", "CONCEDE_FAST_SETTLE", r.verdict);
  }
  {
    const r = computeAttachedEvidenceDelta(
      [attached("att-log-w", "MERCHANT_LOG", "WEAK", LOG_TEXT)],
      liveItems,
      liveDispute,
      15,
    );
    check("A MERCHANT_LOG WEAK awards 10", 10, r.delta);
  }
  {
    const r = computeAttachedEvidenceDelta(
      [attached("att-pod-w", "CARRIER_POD", "WEAK", POD_TEXT)],
      liveItems,
      liveDispute,
      15,
    );
    check("A CARRIER_POD WEAK with signature awards 24 (12 + 6 + 6)", 24, r.delta);
  }
  {
    const inv = attached("att-inv-w", "INVOICE", "WEAK", "INVOICE INV-100 amount 100.00 USD order PP-D-EMPTY-1 paid", "PP-D-EMPTY-1");
    const r = computeAttachedEvidenceDelta([inv], emptyItems, emptyDispute, 0);
    check("A INVOICE WEAK awards 6", 6, r.delta);
  }
  {
    const r = computeAttachedEvidenceDelta(
      [photoAttached("att-photo-w", "WEAK", "PP-D-EMPTY-1")],
      emptyItems,
      emptyDispute,
      0,
    );
    check("A DELIVERY_PHOTO WEAK awards 6", 6, r.delta);
  }
  {
    const email = attached("att-email-w", "EMAIL_CONFIRMATION", "WEAK", "Order confirmed", "PP-D-EMPTY-1");
    const r = computeAttachedEvidenceDelta([email], emptyItems, emptyDispute, 0);
    check("A EMAIL_CONFIRMATION WEAK awards 6", 6, r.delta);
  }

  // ---- No double-counting ----
  {
    const r = computeAttachedEvidenceDelta([trackingStrong()], seedAItems, seedADispute, 85);
    check("A TRACKING_RECEIPT on seeded A (tracking + verifiable pass) awards 0", 0, r.delta);
  }
  {
    const r = computeAttachedEvidenceDelta([logStrong()], seedAItems, seedADispute, 85);
    check("A MERCHANT_LOG on seeded A (log passes) awards 0", 0, r.delta);
  }
  {
    const t1 = trackingStrong();
    const t2 = attached("att-tracking-strong-2", "TRACKING_RECEIPT", "STRONG", TRACKING_TEXT);
    const r = computeAttachedEvidenceDelta([t1, t2], liveItems, liveDispute, 15);
    check("A two TRACKING_RECEIPT STRONGs award 45 once, not 90", 45, r.delta);
    check("A second same-slot attachment records no itemDelta", undefined, r.itemDeltas["att-tracking-strong-2"]);
    check("A first same-slot attachment keeps its 45", 45, r.itemDeltas["att-tracking-strong"]);
  }
  {
    const weak = attached("att-tracking-w2", "TRACKING_RECEIPT", "WEAK", TRACKING_TEXT);
    const strong = trackingStrong();
    const r = computeAttachedEvidenceDelta([weak, strong], liveItems, liveDispute, 15);
    check("A WEAK + STRONG tracking: best wins, delta 45", 45, r.delta);
    check("A losing WEAK tracking records no itemDelta", undefined, r.itemDeltas["att-tracking-w2"]);
  }
  {
    const weak = attached("att-tracking-w3", "TRACKING_RECEIPT", "WEAK", TRACKING_TEXT);
    const pod = podStrong();
    const r = computeAttachedEvidenceDelta([weak, pod], liveItems, liveDispute, 15);
    check("A WEAK tracking + STRONG POD: POD wins every shared slot, delta 60", 60, r.delta);
    check("A losing WEAK tracking vs POD records no itemDelta", undefined, r.itemDeltas["att-tracking-w3"]);
    check("A winning POD records all 60", 60, r.itemDeltas["att-pod-strong"]);
  }
  {
    const l1 = logStrong();
    const l2 = attached("att-log-strong-2", "MERCHANT_LOG", "STRONG", LOG_TEXT);
    const r = computeAttachedEvidenceDelta([l1, l2], liveItems, liveDispute, 15);
    check("A two MERCHANT_LOG STRONGs award 25 once", 25, r.delta);
  }
  {
    const inv = attached("att-inv-e", "INVOICE", "STRONG", "INVOICE INV-100 amount 100.00 USD order PP-D-EMPTY-1 paid", "PP-D-EMPTY-1");
    const email = attached("att-email-e", "EMAIL_CONFIRMATION", "STRONG", "Order confirmed", "PP-D-EMPTY-1");
    const r = computeAttachedEvidenceDelta([inv, email], emptyItems, emptyDispute, 0);
    check("A INVOICE + EMAIL on one empty invoice slot award 15 once", 15, r.delta);
    check("A second invoice-slot claimant records no itemDelta", undefined, r.itemDeltas["att-email-e"]);
  }

  // ---- 100 cap ----
  {
    // Fixture texts name PP-D-LIVE-1 / TXN-LIVE-1, so the cap case runs
    // on the live dispute (invoice slot already passing is irrelevant —
    // neither attachment targets it).
    const r = computeAttachedEvidenceDelta(
      [trackingStrong(), logStrong()],
      liveItems,
      liveDispute,
      90,
    );
    check("A cap: delta stays raw 70 above the cap", 70, r.delta);
    check("A cap: finalScore clamps to 100", 100, r.finalScore);
    check("A cap: verdict is CONTEST", "CONTEST_HARD_PROOF", r.verdict);
  }
  {
    const r = computeAttachedEvidenceDelta([podStrong()], emptyItems, emptyDispute, 95);
    check("A cap: POD 60 on base 95 clamps to 100", 100, r.finalScore);
  }

  // ---- CONTRADICTION skip ----
  {
    const bad = withContradiction(trackingStrong());
    const r = computeAttachedEvidenceDelta([bad], liveItems, liveDispute, 15);
    check("A CONTRADICTION tracking receipt contributes 0", 0, r.delta);
    check("A CONTRADICTION tracking receipt leaves score 15", 15, r.finalScore);
    check("A CONTRADICTION attachment resolves no gap", 0, r.resolvedGaps.size);
  }
  {
    const bad = withContradiction(trackingStrong());
    const r = computeAttachedEvidenceDelta([bad, logStrong()], liveItems, liveDispute, 15);
    check("A CONTRADICTION + good LOG counts only the LOG (25)", 25, r.delta);
    check("A CONTRADICTION does not resolve MISSING_TRACKING", false, r.resolvedGaps.has("MISSING_TRACKING"));
    check("A good LOG still resolves MISSING_MERCHANT_LOG", true, r.resolvedGaps.has("MISSING_MERCHANT_LOG"));
  }

  // ---- Negation / missing-anchor guards ----
  {
    const r = computeAttachedEvidenceDelta(
      [attached("att-notdel", "TRACKING_RECEIPT", "STRONG", NOT_DELIVERED_TEXT)],
      liveItems,
      liveDispute,
      15,
    );
    check("A NOT DELIVERED tracking receipt awards 0", 0, r.delta);
  }
  {
    const r = computeAttachedEvidenceDelta(
      [attached("att-undel", "TRACKING_RECEIPT", "STRONG", UNDELIVERED_TEXT)],
      liveItems,
      liveDispute,
      15,
    );
    check("A UNDELIVERED tracking receipt awards 0", 0, r.delta);
  }
  {
    const r = computeAttachedEvidenceDelta(
      [attached("att-neverdel", "TRACKING_RECEIPT", "STRONG", NEVER_DELIVERED_TEXT)],
      liveItems,
      liveDispute,
      15,
    );
    check("A NEVER DELIVERED tracking receipt awards 0", 0, r.delta);
  }
  {
    const r = computeAttachedEvidenceDelta(
      [attached("att-intransit", "TRACKING_RECEIPT", "STRONG", IN_TRANSIT_TEXT)],
      liveItems,
      liveDispute,
      15,
    );
    check("A tracking receipt without DELIVERED awards 0", 0, r.delta);
  }
  {
    const r = computeAttachedEvidenceDelta(
      [attached("att-del-nonum", "TRACKING_RECEIPT", "STRONG", DELIVERED_NO_NUMBER_TEXT)],
      liveItems,
      liveDispute,
      15,
    );
    check("A DELIVERED receipt without a tracking number awards 0", 0, r.delta);
  }
  {
    const r = computeAttachedEvidenceDelta(
      [attached("att-del-numonly", "TRACKING_RECEIPT", "STRONG", DELIVERED_NUMBER_ONLY_TEXT)],
      liveItems,
      liveDispute,
      15,
    );
    check("A DELIVERED + number without carrier/date awards tracking only (30)", 30, r.delta);
  }
  {
    const r = computeAttachedEvidenceDelta(
      [attached("att-invalid", "TRACKING_RECEIPT", "INVALID", TRACKING_TEXT)],
      liveItems,
      liveDispute,
      15,
    );
    check("A INVALID attachment awards 0", 0, r.delta);
  }

  // ---- PayPal Tracking API probe: derivation from a fake record ----
  {
    const art = trackingArtifactFromRecord("PP-D-LIVE-1", {
      status: "DELIVERED",
      carrier: "FEDEX",
      trackingNumber: "1Z999AA10123456784",
      deliveryDate: "2026-10-25",
    });
    check("A DELIVERED record derives an artifact", true, art !== null);
    check("A tracking artifact id is dispute + -tracking-paypal", "PP-D-LIVE-1-tracking-paypal", art?.id);
    check("A tracking artifact kind is tracking", "tracking", art?.kind);
    check("A tracking artifact source is paypal-tracking", "paypal-tracking", art?.source);
    check("A tracking artifact is not simulated", false, art?.simulated);
    check("A tracking artifact summary names the carrier", true, art?.summary.includes("FEDEX") ?? false);
    check("A tracking artifact summary names the tracking number", true, art?.summary.includes("1Z999AA10123456784") ?? false);
    check("A tracking artifact summary states DELIVERED", true, art?.summary.includes("DELIVERED") ?? false);
    check("A tracking artifact summary carries the delivery date", true, art?.summary.includes("2026-10-25") ?? false);
  }
  {
    const art = trackingArtifactFromRecord("PP-D-LIVE-1", {
      status: "delivered",
      carrier: "UPS",
      trackingNumber: "1Z999AA10123456784",
    });
    check("A lowercase delivered status still derives an artifact", true, art !== null);
    check("A DELIVERED record without a date omits the date clause", "Carrier UPS tracking 1Z999AA10123456784 — DELIVERED", art?.summary);
  }
  check(
    "A non-DELIVERED record derives no artifact",
    null,
    trackingArtifactFromRecord("PP-D-LIVE-1", { status: "IN_TRANSIT", carrier: "FEDEX", trackingNumber: "1Z999AA10123456784" }),
  );
  check(
    "A DELIVERED record without a carrier derives no artifact",
    null,
    trackingArtifactFromRecord("PP-D-LIVE-1", { status: "DELIVERED", trackingNumber: "1Z999AA10123456784" }),
  );
  check(
    "A DELIVERED record without a tracking number derives no artifact",
    null,
    trackingArtifactFromRecord("PP-D-LIVE-1", { status: "DELIVERED", carrier: "FEDEX" }),
  );
  check("A null tracking record derives no artifact", null, trackingArtifactFromRecord("PP-D-LIVE-1", null));

  // ---- Probe fail-soft: unconfigured credentials return null, never throw ----
  check("A PayPal is unconfigured on this VM (probe precondition)", false, paypalConfigured());
  check(
    "A getTrackingForTransaction unconfigured returns null",
    null,
    await getTrackingForTransaction("TXN-LIVE-1"),
  );
  check(
    "A getTrackingForTransaction with an empty id returns null",
    null,
    await getTrackingForTransaction(""),
  );

  // ---- Integration: scoreDelta sync (coordinator fix) ----
  // computeAttachedEvidenceDelta writes the ACTUAL slot award back onto
  // each attachment's scoreDelta, so the Vault, PDF, swarm prompt and
  // practical reasons show the true contribution, not the classifier's
  // nominal value at upload time.
  {
    const att = trackingStrong();
    att.scoreDelta = 20; // classifier nominal at upload time
    computeAttachedEvidenceDelta([att], liveItems, liveDispute, 15);
    check("A tracking receipt scoreDelta syncs from nominal 20 to actual 45", 45, att.scoreDelta);
  }
  {
    const bad = withContradiction(
      attached("att-bad-invoice", "INVOICE", "STRONG", "INVOICE #INV-9\nTotal: $19.99 USD"),
    );
    bad.scoreDelta = 15; // classifier nominal at upload time
    const r = computeAttachedEvidenceDelta([bad], liveItems, liveDispute, 15);
    check("A CONTRADICTION invoice contributes 0", 15, r.finalScore);
    check("A CONTRADICTION invoice scoreDelta syncs to 0", 0, bad.scoreDelta);
  }
  {
    const strong = trackingStrong();
    const weak = attached("att-tracking-weak", "TRACKING_RECEIPT", "WEAK", TRACKING_TEXT);
    strong.scoreDelta = 20;
    weak.scoreDelta = 8;
    computeAttachedEvidenceDelta([strong, weak], liveItems, liveDispute, 15);
    check("A winning STRONG tracking receipt keeps 45", 45, strong.scoreDelta);
    check("A losing WEAK tracking receipt scoreDelta syncs to 0", 0, weak.scoreDelta);
  }
}
