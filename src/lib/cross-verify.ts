// PHALANX 5-anchor cross-verifier (live-evidence workstream C).
//
// Deterministic, pure, no LLM, no network. Checks whether a merchant-
// uploaded exhibit actually anchors to the PayPal dispute record, across
// up to 4 anchors: dispute/transaction ID, amount, timeline, and file
// metadata (magic bytes + PDF dates).
//
// What this does NOT prove: SHA-256 (handled separately, post-upload
// immutability only) proves a file was not altered AFTER upload — it
// says nothing about whether the uploaded invoice / POD / log matches
// the dispute. That match is what this module checks.
//
// DROPPED sub-check (by design): "delivery must not predate the
// transaction creation date" is NOT implemented — the dispute detail
// carries no transaction creation date, and inventing one would be a
// fabrication. Only the filing date (dispute.created_at) is used.
//
// Status rules:
// - CONTRADICTION if AMOUNT_CONTRADICTION or TIMELINE_CONTRADICTION.
// - Else UNVERIFIED if the magic-bytes cap applies (mismatched magic
//   bytes can never be VERIFIED) or not every applicable check passed.
// - Else VERIFIED if every applicable (non-null) check is true and at
//   least one check is applicable.
// - A METADATA_WARNING (e.g. PDF /ModDate after filing on an INVOICE)
//   is a warning only: it blocks VERIFIED but never forces CONTRADICTION.
// - A mere miss is never a contradiction: checks that cannot be evaluated
//   return null (not applicable), not false.

import type { Dispute, EvidenceType } from "./types";

export type CrossVerifyStatus = "VERIFIED" | "UNVERIFIED" | "CONTRADICTION";

export interface CrossVerifyResult {
  status: CrossVerifyStatus;
  anchorsMatched: number;
  anchorsTotal: number;
  flags: string[];
  checks: {
    idAnchor: boolean | null;
    amountAnchor: boolean | null;
    timelineOk: boolean | null;
    metadataOk: boolean | null;
  };
}

export interface VerifyAttachmentInput {
  fileName: string;
  mimeType: string;
  bytes: Buffer | Uint8Array;
  evidenceType: EvidenceType;
  referenceId?: string;
  documentDate?: string;
  notes?: string;
  dispute: Dispute;
}

// Receipt-like types for which a dollar amount in the text is an anchor.
const AMOUNT_ANCHOR_TYPES: EvidenceType[] = [
  "INVOICE",
  "TRACKING_RECEIPT",
  "EMAIL_CONFIRMATION",
];

// Types for which a date AFTER the filing date is a contradiction.
const TIMELINE_AFTER_FILING_TYPES: EvidenceType[] = [
  "INVOICE",
  "TRACKING_RECEIPT",
  "CARRIER_POD",
  "MERCHANT_LOG",
];

const AMOUNT_RE = /\$?\d[\d,]*\.\d{2}/g;
const DATE_RE = /\d{4}-\d{2}-\d{2}/g;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Invoice / order / carrier reference tokens, e.g. INV-88412, PP-D-12345.
const INVOICE_ID_RE = /\b(?:INV|ORDER|TRACK|FEDEX|UPS|USPS|PP-D)-[A-Z0-9-]+\b/gi;

const TEXT_EXT_RE = /\.(txt|json|csv|pdf)$/i;

function isTextBased(fileName: string, mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    TEXT_EXT_RE.test(fileName)
  );
}

function isPdf(fileName: string, mimeType: string): boolean {
  return mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
}

function isPng(fileName: string, mimeType: string): boolean {
  return mimeType === "image/png" || fileName.toLowerCase().endsWith(".png");
}

function isJpeg(fileName: string, mimeType: string): boolean {
  return (
    mimeType === "image/jpeg" ||
    mimeType === "image/jpg" ||
    fileName.toLowerCase().endsWith(".jpg") ||
    fileName.toLowerCase().endsWith(".jpeg")
  );
}

/** Defensively read disputed_transactions[0].seller_transaction_id. */
function sellerTransactionId(dispute: Dispute): string | null {
  try {
    const detail = dispute.raw_paypal_detail as Record<string, unknown> | null;
    const txs = detail?.disputed_transactions as
      | Array<Record<string, unknown>>
      | undefined;
    const first = Array.isArray(txs) ? txs[0] : undefined;
    const id = first?.seller_transaction_id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

function parseAmounts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    const n = parseFloat(m[0].replace(/[$,]/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function parseTextDates(text: string): string[] {
  return text.match(DATE_RE) ?? [];
}

/** Parse a PDF D:YYYYMMDDHHmmSS date marker to a YYYY-MM-DD string. */
function parsePdfDate(raw: string): string | null {
  const m = /^D:(\d{4})(\d{2})(\d{2})/.exec(raw);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function verifyAttachmentAgainstDispute(
  input: VerifyAttachmentInput,
): CrossVerifyResult {
  const { fileName, mimeType, bytes, evidenceType, dispute } = input;
  const referenceId = (input.referenceId ?? "").trim();
  const documentDate = (input.documentDate ?? "").trim();

  const flags: string[] = [];

  // Extracted text: text-based files only (txt/json/csv/pdf-as-text),
  // first 8192 bytes as UTF-8 — same approach classifyEvidenceQuality uses.
  // PNG/JPG carry no text: their anchors come from metadata only.
  const text = isTextBased(fileName, mimeType)
    ? Buffer.from(bytes.slice(0, Math.min(bytes.length, 8192))).toString("utf-8")
    : "";

  // Filing date = dispute filing date (dispute.created_at, date part).
  const filingDate = (dispute.created_at ?? "").slice(0, 10);
  const filingValid = ISO_DATE_RE.test(filingDate);

  // ---- Check 1: ID anchor ----
  // True if the extracted text or referenceId contains the dispute id, or
  // the seller_transaction_id, or an invoice_id pattern equal to referenceId.
  // A mere miss is null, never a contradiction.
  let idAnchor: boolean | null = null;
  const sellerTxId = sellerTransactionId(dispute);
  const idCandidates = [dispute.id, sellerTxId].filter(
    (c): c is string => typeof c === "string" && c.length > 0,
  );
  const haystacks = [text, referenceId];
  if (
    idCandidates.some((c) => haystacks.some((h) => h.includes(c)))
  ) {
    idAnchor = true;
  } else if (referenceId.length > 0 && text.includes(referenceId)) {
    // The merchant-supplied reference appears verbatim in the file.
    idAnchor = true;
  } else if (referenceId.length > 0) {
    const tokens = text.match(INVOICE_ID_RE) ?? [];
    if (
      tokens.some((t) => t.toLowerCase() === referenceId.toLowerCase())
    ) {
      idAnchor = true;
    }
  }

  // ---- Check 2: amount anchor ----
  // Applicable ONLY when the text contains dollar figures AND the type is
  // receipt-like. Any parsed amount equal to the dispute amount (within
  // $0.01) passes; amounts present but none equal -> contradiction.
  let amountAnchor: boolean | null = null;
  if (AMOUNT_ANCHOR_TYPES.includes(evidenceType)) {
    const amounts = parseAmounts(text);
    if (amounts.length > 0) {
      const disputeAmount = parseFloat(dispute.amount.value);
      const matched = amounts.some(
        (a) => Math.abs(a - disputeAmount) <= 0.01,
      );
      if (matched) {
        amountAnchor = true;
      } else {
        amountAnchor = false;
        flags.push("AMOUNT_CONTRADICTION");
      }
    }
  }

  // ---- Check 3: timeline ----
  // Dates: documentDate (must be YYYY-MM-DD) plus all YYYY-MM-DD dates in
  // the text. INVOICE / TRACKING_RECEIPT / CARRIER_POD / MERCHANT_LOG with
  // any date AFTER the filing date -> contradiction. No dates -> null.
  // Otherwise true. (The "delivery must not predate the transaction
  // creation date" sub-check is dropped: no transaction creation date
  // exists on the dispute detail.)
  let timelineOk: boolean | null = null;
  const parsedDates: string[] = [];
  if (ISO_DATE_RE.test(documentDate)) parsedDates.push(documentDate);
  parsedDates.push(...parseTextDates(text));
  if (parsedDates.length > 0) {
    if (
      filingValid &&
      TIMELINE_AFTER_FILING_TYPES.includes(evidenceType) &&
      parsedDates.some((d) => d > filingDate)
    ) {
      timelineOk = false;
      flags.push("TIMELINE_CONTRADICTION");
    } else {
      timelineOk = true;
    }
  }

  // ---- Check 4: metadata ----
  // True magic bytes: PDF %PDF, PNG \x89PNG, JPEG \xFF\xD8\xFF — same
  // magic-byte logic classifyEvidenceQuality uses. txt/json/csv have no
  // magic check -> null. Magic mismatch -> false + cap at UNVERIFIED.
  // For PDFs, scan raw bytes for /CreationDate and /ModDate
  // (D:YYYYMMDDHHmmSS) and for /Creator or /Producer naming known image
  // editors (Photoshop, GIMP, Canva). Only the specified rule flags:
  // /ModDate later than the filing date on an INVOICE -> METADATA_WARNING
  // (warning only, never a contradiction).
  let metadataOk: boolean | null = null;
  let magicMismatch = false;
  if (isPdf(fileName, mimeType)) {
    const magicOk =
      bytes.length >= 4 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46; // %PDF
    if (!magicOk) {
      magicMismatch = true;
      flags.push("MAGIC_BYTES_MISMATCH");
      metadataOk = false;
    } else {
      let warning = false;
      // Raw-byte scan: PDF metadata markers are ASCII even in binary PDFs.
      const raw = Buffer.from(
        bytes.slice(0, Math.min(bytes.length, 8192)),
      ).toString("latin1");
      const modMatch = /\/ModDate\s*\((D:\d{14}[^)]*)\)/.exec(raw);
      const modDate = modMatch ? parsePdfDate(modMatch[1]) : null;
      // /CreationDate and /Creator / /Producer are scanned per spec (a
      // PDF authored by an image editor is a fabrication signal worth
      // recording); only the /ModDate rule below produces a flag, per spec.
      const creationMatch = /\/CreationDate\s*\((D:\d{14}[^)]*)\)/.exec(raw);
      const creatorMatch = /\/(?:Creator|Producer)\s*\(([^)]*)\)/i.exec(raw);
      const _creationDate = creationMatch
        ? parsePdfDate(creationMatch[1])
        : null;
      const _creatorOrProducer = creatorMatch ? creatorMatch[1] : null;
      if (
        modDate !== null &&
        filingValid &&
        evidenceType === "INVOICE" &&
        modDate > filingDate
      ) {
        flags.push("METADATA_WARNING");
        warning = true;
      }
      metadataOk = !warning;
    }
  } else if (isPng(fileName, mimeType)) {
    const magicOk =
      bytes.length >= 4 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47; // \x89PNG
    if (!magicOk) {
      magicMismatch = true;
      flags.push("MAGIC_BYTES_MISMATCH");
      metadataOk = false;
    } else {
      metadataOk = true;
    }
  } else if (isJpeg(fileName, mimeType)) {
    const magicOk =
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff; // JPEG SOI
    if (!magicOk) {
      magicMismatch = true;
      flags.push("MAGIC_BYTES_MISMATCH");
      metadataOk = false;
    } else {
      metadataOk = true;
    }
  } else {
    // .txt / .json / .csv: no magic check -> not applicable.
    metadataOk = null;
  }

  // ---- Status resolution ----
  const checks = { idAnchor, amountAnchor, timelineOk, metadataOk };
  const values = [idAnchor, amountAnchor, timelineOk, metadataOk];
  const anchorsTotal = values.filter((v) => v !== null).length;
  const anchorsMatched = values.filter((v) => v === true).length;

  let status: CrossVerifyStatus;
  if (
    flags.includes("AMOUNT_CONTRADICTION") ||
    flags.includes("TIMELINE_CONTRADICTION")
  ) {
    status = "CONTRADICTION";
  } else if (magicMismatch) {
    status = "UNVERIFIED";
  } else if (anchorsTotal > 0 && anchorsMatched === anchorsTotal) {
    status = "VERIFIED";
  } else {
    status = "UNVERIFIED";
  }

  return { status, anchorsMatched, anchorsTotal, flags, checks };
}
