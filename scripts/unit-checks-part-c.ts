// PHALANX unit checks — workstream C: 5-anchor cross-verifier
// (src/lib/cross-verify.ts). Pure-function tests, no server, no live
// PayPal calls. Wired into scripts/unit-checks.ts by the coordinator;
// run standalone via a temporary runner (e.g. /tmp/run-part-c.ts).
//
// Fixture dispute: $480.00, filed 2026-11-11 (created_at
// 2026-11-11T02:00:00.000Z), seller_transaction_id 2LX90748BA432971S.

import { verifyAttachmentAgainstDispute } from "../src/lib/cross-verify";
import type { Dispute, EvidenceType } from "../src/lib/types";

export type PartCCheck = (
  name: string,
  expected: unknown,
  actual: unknown,
) => void;

function makeDispute(): Dispute {
  return {
    id: "PP-D-TEST-001",
    source: "sandbox",
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    amount: { currency_code: "USD", value: "480.00" },
    status: "WAITING_FOR_SELLER_RESPONSE",
    dispute_life_cycle_stage: "INQUIRY",
    dispute_state: "WAITING_FOR_SELLER_RESPONSE",
    allowed_actions: ["PROVIDE_EVIDENCE"],
    raw_paypal_detail: {
      disputed_transactions: [
        { seller_transaction_id: "2LX90748BA432971S" },
      ],
    },
    created_at: "2026-11-11T02:00:00.000Z",
  };
}

function txt(s: string): Buffer {
  return Buffer.from(s, "utf-8");
}

export async function runPartCChecks(check: PartCCheck): Promise<void> {
  const dispute = makeDispute();

  // ---- Check 1: ID anchor ----
  // Text contains the dispute id -> true.
  const idMatch = verifyAttachmentAgainstDispute({
    fileName: "invoice.txt",
    mimeType: "text/plain",
    bytes: txt(
      "Invoice PP-D-TEST-001 for order. Total $480.00. Date 2026-11-10.",
    ),
    evidenceType: "INVOICE",
    dispute,
  });
  check("cross-verify: id anchor matches dispute id in text", true, idMatch.checks.idAnchor);

  // No id anywhere -> null (not applicable, not a failure).
  const idMiss = verifyAttachmentAgainstDispute({
    fileName: "invoice.txt",
    mimeType: "text/plain",
    bytes: txt("Invoice for goods sold. Total $480.00."),
    evidenceType: "INVOICE",
    dispute,
  });
  check("cross-verify: id anchor miss is null, not false", null, idMiss.checks.idAnchor);

  // Text contains the seller_transaction_id -> true.
  const txMatch = verifyAttachmentAgainstDispute({
    fileName: "receipt.txt",
    mimeType: "text/plain",
    bytes: txt("PayPal transaction 2LX90748BA432971S confirmed."),
    evidenceType: "TRACKING_RECEIPT",
    dispute,
  });
  check("cross-verify: id anchor matches seller_transaction_id", true, txMatch.checks.idAnchor);

  // Merchant-supplied referenceId corroborated by the file text -> true.
  const refMatch = verifyAttachmentAgainstDispute({
    fileName: "invoice.txt",
    mimeType: "text/plain",
    bytes: txt("Invoice INV-88412. Total $480.00. Date 2026-11-10."),
    evidenceType: "INVOICE",
    referenceId: "INV-88412",
    dispute,
  });
  check("cross-verify: id anchor matches referenceId in file text", true, refMatch.checks.idAnchor);

  // ---- Check 2: amount anchor ----
  // $480.00 invoice text on a $480 dispute -> true.
  const amountMatch = verifyAttachmentAgainstDispute({
    fileName: "invoice.txt",
    mimeType: "text/plain",
    bytes: txt("Invoice PP-D-TEST-001. Total due $480.00. Date 2026-11-10."),
    evidenceType: "INVOICE",
    dispute,
  });
  check("cross-verify: amount anchor matches dispute amount", true, amountMatch.checks.amountAnchor);

  // $19.99 on a $480 dispute -> false + AMOUNT_CONTRADICTION + CONTRADICTION.
  const amountContra = verifyAttachmentAgainstDispute({
    fileName: "invoice.txt",
    mimeType: "text/plain",
    bytes: txt("Invoice PP-D-TEST-001. Total due $19.99. Date 2026-11-10."),
    evidenceType: "INVOICE",
    dispute,
  });
  check("cross-verify: amount mismatch is false", false, amountContra.checks.amountAnchor);
  check(
    "cross-verify: amount mismatch flags AMOUNT_CONTRADICTION",
    true,
    amountContra.flags.includes("AMOUNT_CONTRADICTION"),
  );
  check("cross-verify: amount mismatch status is CONTRADICTION", "CONTRADICTION", amountContra.status);

  // ---- Check 3: timeline ----
  // INVOICE documentDate after the filing date -> contradiction.
  const invoiceLate = verifyAttachmentAgainstDispute({
    fileName: "invoice.txt",
    mimeType: "text/plain",
    bytes: txt("Invoice for goods sold."),
    evidenceType: "INVOICE",
    documentDate: "2026-11-12",
    dispute,
  });
  check("cross-verify: invoice dated after filing is timeline false", false, invoiceLate.checks.timelineOk);
  check(
    "cross-verify: invoice dated after filing flags TIMELINE_CONTRADICTION",
    true,
    invoiceLate.flags.includes("TIMELINE_CONTRADICTION"),
  );
  check("cross-verify: invoice dated after filing is CONTRADICTION", "CONTRADICTION", invoiceLate.status);

  // Delivery date after the filing date on a TRACKING_RECEIPT -> contradiction.
  const deliveryLate = verifyAttachmentAgainstDispute({
    fileName: "tracking.txt",
    mimeType: "text/plain",
    bytes: txt("Delivered 2026-11-12. Tracking 1Z999AA10123456784."),
    evidenceType: "TRACKING_RECEIPT",
    dispute,
  });
  check("cross-verify: delivery after filing is timeline false", false, deliveryLate.checks.timelineOk);
  check(
    "cross-verify: delivery after filing flags TIMELINE_CONTRADICTION",
    true,
    deliveryLate.flags.includes("TIMELINE_CONTRADICTION"),
  );
  check("cross-verify: delivery after filing is CONTRADICTION", "CONTRADICTION", deliveryLate.status);

  // Dates before the filing date -> true.
  const datesBefore = verifyAttachmentAgainstDispute({
    fileName: "tracking.txt",
    mimeType: "text/plain",
    bytes: txt("Delivered 2026-11-10. Tracking 1Z999AA10123456784."),
    evidenceType: "TRACKING_RECEIPT",
    dispute,
  });
  check("cross-verify: dates before filing are timeline true", true, datesBefore.checks.timelineOk);

  // ---- Check 4: metadata ----
  // PDF /ModDate after filing on an INVOICE -> METADATA_WARNING, status
  // NOT CONTRADICTION (warning only, blocks VERIFIED).
  const pdfLateMod = verifyAttachmentAgainstDispute({
    fileName: "invoice.pdf",
    mimeType: "application/pdf",
    bytes: txt(
      "%PDF-1.4\n/ModDate (D:20261112000000Z)\nInvoice PP-D-TEST-001 Total $480.00 Date 2026-11-10\n",
    ),
    evidenceType: "INVOICE",
    dispute,
  });
  check(
    "cross-verify: late PDF ModDate flags METADATA_WARNING",
    true,
    pdfLateMod.flags.includes("METADATA_WARNING"),
  );
  check("cross-verify: late PDF ModDate status is UNVERIFIED, not CONTRADICTION", "UNVERIFIED", pdfLateMod.status);

  // Magic-bytes mismatch: a .pdf that does not start with %PDF -> capped
  // at UNVERIFIED even though the other anchors pass.
  const magicMismatch = verifyAttachmentAgainstDispute({
    fileName: "invoice.pdf",
    mimeType: "application/pdf",
    bytes: txt("Invoice PP-D-TEST-001 Total $480.00"),
    evidenceType: "INVOICE",
    dispute,
  });
  check("cross-verify: magic mismatch is metadata false", false, magicMismatch.checks.metadataOk);
  check(
    "cross-verify: magic mismatch flags MAGIC_BYTES_MISMATCH",
    true,
    magicMismatch.flags.includes("MAGIC_BYTES_MISMATCH"),
  );
  check("cross-verify: magic mismatch status is UNVERIFIED (capped)", "UNVERIFIED", magicMismatch.status);

  // PNG with valid magic bytes: metadata anchor comes from the file, and
  // the ID anchor from the merchant-supplied referenceId.
  const pngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
  ]);
  const pngOk = verifyAttachmentAgainstDispute({
    fileName: "delivery.png",
    mimeType: "image/png",
    bytes: pngBytes,
    evidenceType: "DELIVERY_PHOTO",
    referenceId: "PP-D-TEST-001",
    dispute,
  });
  check("cross-verify: valid PNG magic is metadata true", true, pngOk.checks.metadataOk);
  check("cross-verify: PNG id anchor from referenceId is true", true, pngOk.checks.idAnchor);

  // ---- Status / badge states ----
  // All applicable anchors pass -> VERIFIED with correct counts
  // (id + amount + timeline true; txt has no magic check -> 3/3).
  check("cross-verify: all anchors pass status is VERIFIED", "VERIFIED", idMatch.status);
  check("cross-verify: all anchors pass anchorsMatched is 3", 3, idMatch.anchorsMatched);
  check("cross-verify: all anchors pass anchorsTotal is 3", 3, idMatch.anchorsTotal);

  // A POD with no checkable anchors at all -> UNVERIFIED (0/0).
  const podBare = verifyAttachmentAgainstDispute({
    fileName: "pod.txt",
    mimeType: "text/plain",
    bytes: txt("Signed delivery confirmation."),
    evidenceType: "CARRIER_POD",
    dispute,
  });
  check("cross-verify: bare POD status is UNVERIFIED", "UNVERIFIED", podBare.status);
  check("cross-verify: bare POD anchorsMatched is 0", 0, podBare.anchorsMatched);
  check("cross-verify: bare POD anchorsTotal is 0", 0, podBare.anchorsTotal);

  // Contradiction input -> CONTRADICTION (badge state).
  check("cross-verify: contradiction input status is CONTRADICTION", "CONTRADICTION", amountContra.status);
}
