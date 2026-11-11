// seed-and-verify-live-sandbox.ts — PHALANX live-evidence runner (Part D).
//
// Seeds REAL PayPal Sandbox disputes with generated evidence, verifies the
// deterministic checklist score + verdict, and (only with --execute) runs the
// swarm, records the human approval, executes against PayPal Sandbox, and
// fetches the PDF dossier.
//
// SAFETY (hard rules, do not relax):
//  - This script NEVER creates a PayPal dispute. Dispute IDs come from the
//    --plan file; the operator creates them (e.g. via the PayPal Sandbox UI).
//  - It NEVER approves/executes on a seeded dispute: the dispute's `source`
//    is checked after the first GET and re-checked immediately before any
//    approve/execute. source !== "sandbox" aborts the case.
//  - It NEVER approves/executes without --execute (dry-run mode only
//    attaches evidence and verifies scores).
//  - Every approval and execution is logged with dispute ID, action, and
//    timestamp.
//
// Contracts it codes against (Parts A–C, merged before the parent runs it):
//  - GET  /api/disputes/{id}            -> { dispute, base_score, final_score,
//    run, approval, execution, evidenceHoldWarning?, missingChecklistPoints?,
//    emptySlots? }. Score asserted = final_score. Verdict derived from
//    final_score with the LOCKED 35/75 thresholds (>=75 CONTEST_HARD_PROOF,
//    >=35 DE_ESCALATE_OFFER, else CONCEDE_FAST_SETTLE), cross-checked against
//    the verdict in the run/evidence response when present.
//  - POST /api/disputes/{id}/evidence   -> multipart FormData (file,
//    evidenceType, referenceId, documentDate, notes); stored attachment
//    carries quality, scoreDelta and crossVerify.
//  - POST /api/disputes/{id}/run        -> { run: { score, verdict, ... } }.
//  - POST /api/disputes/{id}/approve    -> JSON { action, approved_by:
//    "merchant", offer_amount?, confirmed_no_evidence? }. A bare-concede
//    (score < 35, 0 attachments, action accept-claim) requires
//    confirmed_no_evidence: true or the server returns 400.
//  - POST /api/disputes/{id}/execute    -> { paypal_status, ... }.
//  - GET  /api/disputes/{id}/evidence.pdf -> PDF dossier (status + bytes
//    recorded, never parsed).
//
// Usage:
//   npx tsx scripts/seed-and-verify-live-sandbox.ts --base-url <url> --plan <plan.json> [--execute] [--report <path>]
//   npx tsx scripts/seed-and-verify-live-sandbox.ts --help
//
// Node built-ins + global fetch/FormData/Blob only. No new dependencies.
// No secrets in this file.

import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Verdict = "CONTEST_HARD_PROOF" | "DE_ESCALATE_OFFER" | "CONCEDE_FAST_SETTLE";

type EvidenceType =
  | "INVOICE"
  | "TRACKING_RECEIPT"
  | "DELIVERY_PHOTO"
  | "CARRIER_POD"
  | "MERCHANT_LOG"
  | "EMAIL_CONFIRMATION"
  | "OTHER";

type TemplateName =
  | "tracking_receipt"
  | "carrier_pod"
  | "merchant_log"
  | "invoice"
  | "delivery_photo"
  | "email_confirmation";

interface PlanEvidenceEntry {
  type: EvidenceType;
  fileName?: string;
  referenceId?: string;
  documentDate?: string;
  notes?: string;
  template?: TemplateName;
  carrier?: string;
  trackingNumber?: string;
  deliveryDate?: string;
  buyerName?: string;
  itemDescription?: string;
}

interface PlanCase {
  disputeId: string;
  transactionId?: string;
  reason?: string;
  targetScore: number;
  targetVerdict: Verdict;
  targetAction: string;
  confirmNoEvidence?: boolean;
  /** Optional offer amount (USD) for make-offer actions; server defaults otherwise. */
  offerAmount?: number;
  evidence?: PlanEvidenceEntry[];
}

interface PlanFile {
  cases: PlanCase[];
}

interface EvidenceAttachedReport {
  type: string;
  quality: string | null;
  scoreDelta: number | null;
  crossVerifyStatus: string | null;
}

interface CaseReport {
  disputeId: string;
  source: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  verdictBefore: Verdict | null;
  verdictAfter: Verdict | null;
  targetScore: number;
  targetVerdict: Verdict;
  action: string;
  approved: boolean;
  paypalStatus: string | null;
  pdfStatus: number | null;
  pdfBytes: number | null;
  evidenceAttached: EvidenceAttachedReport[];
  passed: boolean;
  error?: string;
}

interface DisputeDetail {
  dispute: {
    id: string;
    source: string;
    reason?: string;
    amount: { currency_code: string; value: string };
    created_at?: string;
    [key: string]: unknown;
  };
  base_score?: number;
  final_score?: number;
  run?: { score?: number; verdict?: Verdict; [key: string]: unknown } | null;
  approval?: unknown;
  execution?: unknown;
  evidenceHoldWarning?: unknown;
  missingChecklistPoints?: unknown;
  emptySlots?: unknown;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Constants + small helpers
// ---------------------------------------------------------------------------

const CONTEST_THRESHOLD = 75;
const CONCEDE_THRESHOLD = 35;
const DEFAULT_BASE_URL = "https://phalanx.krynex.in";
const APPROVED_BY = "merchant";

function verdictForScore(score: number): Verdict {
  if (score >= CONTEST_THRESHOLD) return "CONTEST_HARD_PROOF";
  if (score >= CONCEDE_THRESHOLD) return "DE_ESCALATE_OFFER";
  return "CONCEDE_FAST_SETTLE";
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Date `days` before the given ISO date string (YYYY-MM-DD out). */
function daysBefore(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() - days);
  return fmtDate(d);
}

function money(value: string): string {
  return parseFloat(value).toFixed(2);
}

function dollarsToCents(value: string): number {
  return Math.round(parseFloat(value) * 100);
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function usage(): string {
  return [
    "seed-and-verify-live-sandbox.ts — seed Sandbox disputes with evidence and verify scores",
    "",
    "Usage:",
    "  npx tsx scripts/seed-and-verify-live-sandbox.ts --base-url <url> --plan <plan.json> [--execute] [--report <path>]",
    "  npx tsx scripts/seed-and-verify-live-sandbox.ts --help",
    "",
    "Options:",
    "  --base-url <url>   PHALANX base URL (default: https://phalanx.krynex.in)",
    "  --plan <path>      REQUIRED. JSON plan file: { \"cases\": [ { disputeId,",
    "                     transactionId, reason, targetScore, targetVerdict,",
    "                     targetAction, confirmNoEvidence, evidence: [...] } ] }",
    "  --execute          REQUIRED to approve/execute anything. Without it the",
    "                     script only attaches evidence and verifies scores",
    "                     (DRY RUN — no approval/execution performed).",
    "  --report <path>    Report JSON path (default: ./live-sandbox-report-<timestamp>.json)",
    "  --help             Print this usage and exit 0.",
    "",
    "Safety:",
    "  - Never creates a PayPal dispute (IDs come from the plan file).",
    "  - Never approves/executes on a seeded dispute (source is checked",
    "    after the first GET and re-checked immediately before approve/execute).",
    "  - Never approves/executes without --execute.",
    "",
    "Exit code 0 only if every case passed; non-zero otherwise.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

interface CliOptions {
  baseUrl: string;
  planPath: string | null;
  execute: boolean;
  reportPath: string | null;
  help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    baseUrl: DEFAULT_BASE_URL,
    planPath: null,
    execute: false,
    reportPath: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--execute") {
      opts.execute = true;
    } else if (arg === "--base-url") {
      const v = argv[++i];
      if (!v) throw new Error("--base-url requires a value");
      opts.baseUrl = v.replace(/\/$/, "");
    } else if (arg === "--plan") {
      const v = argv[++i];
      if (!v) throw new Error("--plan requires a value");
      opts.planPath = v;
    } else if (arg === "--report") {
      const v = argv[++i];
      if (!v) throw new Error("--report requires a value");
      opts.reportPath = v;
    } else if (arg.startsWith("--base-url=")) {
      opts.baseUrl = arg.slice("--base-url=".length).replace(/\/$/, "");
    } else if (arg.startsWith("--plan=")) {
      opts.planPath = arg.slice("--plan=".length);
    } else if (arg.startsWith("--report=")) {
      opts.reportPath = arg.slice("--report=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function fetchJson(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { _raw: text.slice(0, 500) };
    }
  }
  return { status: res.status, body };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

async function getDetail(baseUrl: string, disputeId: string): Promise<DisputeDetail> {
  const { status, body } = await fetchJson(
    `${baseUrl}/api/disputes/${encodeURIComponent(disputeId)}`,
  );
  if (status !== 200) {
    throw new Error(`GET /api/disputes/${disputeId} returned HTTP ${status}: ${JSON.stringify(body)?.slice(0, 500)}`);
  }
  const rec = asRecord(body);
  if (!rec || !asRecord(rec.dispute)) {
    throw new Error(`GET /api/disputes/${disputeId} returned an unexpected body`);
  }
  return body as DisputeDetail;
}

// ---------------------------------------------------------------------------
// Evidence file generation (from template + live dispute data)
// ---------------------------------------------------------------------------

interface GeneratedFile {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}

function defaultFileName(entry: PlanEvidenceEntry): string {
  if (entry.fileName) return entry.fileName;
  switch (entry.template ?? "tracking_receipt") {
    case "tracking_receipt":
      return "tracking-receipt.txt";
    case "carrier_pod":
      return "carrier-pod.txt";
    case "merchant_log":
      return "merchant-log.csv";
    case "invoice":
      return "invoice.txt";
    case "delivery_photo":
      return "delivery-photo.png";
    case "email_confirmation":
      return "order-confirmation.txt";
    default:
      return "evidence.txt";
  }
}

function mimeFor(fileName: string): string {
  if (/\.png$/i.test(fileName)) return "image/png";
  if (/\.csv$/i.test(fileName)) return "text/csv";
  if (/\.json$/i.test(fileName)) return "application/json";
  return "text/plain";
}

// CRC-32 (IEEE) for PNG chunks.
const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/**
 * Generate a valid PNG of at least 1024 bytes, fully in code (no embedded
 * binary blob). A solid colour compresses too small, so the pixels carry a
 * deterministic gradient + LCG noise: still a plain delivery-photo stand-in,
 * but large enough to pass the >=1024-byte image-anchor rule.
 */
function generatePng(minBytes = 1024): Buffer {
  let size = 64;
  for (;;) {
    const width = size;
    const height = size;
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // colour type: RGB
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace

    // Deterministic pseudo-random pixels (LCG) over a vertical gradient.
    let seed = 0x12345678;
    const next = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed & 0xff;
    };
    const raw = Buffer.alloc(height * (1 + width * 3));
    for (let y = 0; y < height; y++) {
      const rowStart = y * (1 + width * 3);
      raw[rowStart] = 0; // filter: none
      for (let x = 0; x < width; x++) {
        const o = rowStart + 1 + x * 3;
        raw[o] = (x * 255) / width + next() % 32 | 0; // R: horizontal ramp + noise
        raw[o + 1] = (y * 255) / height + next() % 32 | 0; // G: vertical ramp + noise
        raw[o + 2] = 128 + (next() % 64); // B: mid-tone + noise
      }
    }
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", deflateSync(raw)),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
    if (png.length >= minBytes) return png;
    size *= 2;
    if (size > 1024) throw new Error("could not generate a PNG of >= 1024 bytes");
  }
}

interface EvidenceContext {
  disputeId: string;
  transactionId: string;
  reason: string;
  amountValue: string;
  currencyCode: string;
  /** Dispute filing date (created_at), YYYY-MM-DD. */
  filedDate: string;
}

function generateEvidenceFile(entry: PlanEvidenceEntry, ctx: EvidenceContext): GeneratedFile {
  const template: TemplateName = entry.template ?? "tracking_receipt";
  const fileName = defaultFileName(entry);
  const amount = money(ctx.amountValue);
  const carrier = entry.carrier ?? "UPS";
  const trackingNumber = entry.trackingNumber ?? entry.referenceId ?? "1Z999AA10123456784";
  const deliveryDate = entry.deliveryDate ?? entry.documentDate ?? ctx.filedDate;
  const referenceId = entry.referenceId ?? trackingNumber;
  void referenceId; // metadata is sent as form fields, not embedded here
  const item = entry.itemDescription ?? "Widget Pro (1 unit)";
  const buyerName = entry.buyerName ?? "PayPal Buyer";
  // Invoice / email dates must precede the dispute filing date.
  const docDate = daysBefore(ctx.filedDate, 2);
  const text = (s: string): GeneratedFile => ({
    fileName,
    mimeType: mimeFor(fileName),
    bytes: Buffer.from(s, "utf-8"),
  });

  switch (template) {
    case "tracking_receipt": {
      return text(
        [
          "CARRIER TRACKING RECEIPT",
          `Carrier: ${carrier}`,
          `Tracking number: ${trackingNumber}`,
          "Status: DELIVERED",
          `Delivery date: ${deliveryDate}`,
          `Amount: ${ctx.currencyCode} ${amount}`,
          `Transaction ID: ${ctx.transactionId}`,
          `Dispute ID: ${ctx.disputeId}`,
          `Delivered to the address on the PayPal transaction for ${ctx.transactionId}.`,
          "",
        ].join("\n"),
      );
    }
    case "carrier_pod": {
      return text(
        [
          "CARRIER PROOF OF DELIVERY",
          `Carrier: ${carrier}`,
          `Tracking number: ${trackingNumber}`,
          "Status: DELIVERED",
          `Delivery date: ${deliveryDate}`,
          `Signed by: ${buyerName}`,
          "SIGNATURE_CONFIRMED",
          `Amount: ${ctx.currencyCode} ${amount}`,
          `Transaction ID: ${ctx.transactionId}`,
          `Dispute ID: ${ctx.disputeId}`,
          "",
        ].join("\n"),
      );
    }
    case "merchant_log": {
      const received = `${daysBefore(deliveryDate, 3)}T09:12:00Z`;
      const dispatched = `${daysBefore(deliveryDate, 1)}T14:30:00Z`;
      const delivered = `${deliveryDate}T11:05:00Z`;
      return text(
        [
          "timestamp,event,transaction_id,dispute_id,detail",
          `${received},order_received,${ctx.transactionId},${ctx.disputeId},Order placed for ${item}`,
          `${dispatched},order_dispatched,${ctx.transactionId},${ctx.disputeId},Shipped via ${carrier} ${trackingNumber}`,
          `${delivered},order_delivered,${ctx.transactionId},${ctx.disputeId},Delivered; buyer account used product post-delivery (license activated)`,
          "",
        ].join("\n"),
      );
    }
    case "invoice": {
      // Itemised lines must sum EXACTLY to the dispute amount (integer cents).
      const totalCents = dollarsToCents(ctx.amountValue);
      const shippingCents = Math.min(1500, totalCents);
      const itemCents = totalCents - shippingCents;
      return text(
        [
          `INVOICE INV-${ctx.disputeId.replace(/[^A-Z0-9]/gi, "")}`,
          `Invoice date: ${docDate}`,
          `Transaction ID: ${ctx.transactionId}`,
          `Dispute ID: ${ctx.disputeId}`,
          `Reason: ${ctx.reason}`,
          "",
          "Itemised lines:",
          `- ${item} — ${ctx.currencyCode} ${centsToDollars(itemCents)}`,
          `- Shipping & handling — ${ctx.currencyCode} ${centsToDollars(shippingCents)}`,
          `Total: ${ctx.currencyCode} ${centsToDollars(totalCents)}`,
          "",
        ].join("\n"),
      );
    }
    case "delivery_photo": {
      return { fileName, mimeType: "image/png", bytes: generatePng(1024) };
    }
    case "email_confirmation": {
      return text(
        [
          `Subject: Your order confirmation — ${ctx.transactionId}`,
          `Date: ${docDate}`,
          "",
          "Thank you for your order.",
          "",
          `Order / Transaction ID: ${ctx.transactionId}`,
          `Item: ${item}`,
          `Amount charged: ${ctx.currencyCode} ${amount}`,
          `Dispute ID (for merchant reference): ${ctx.disputeId}`,
          "Your order has been confirmed and shipped. Tracking details follow in a separate email.",
          "",
        ].join("\n"),
      );
    }
    default: {
      return text(
        [
          "MERCHANT EVIDENCE",
          `Transaction ID: ${ctx.transactionId}`,
          `Dispute ID: ${ctx.disputeId}`,
          `Amount: ${ctx.currencyCode} ${amount}`,
          "",
        ].join("\n"),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Per-case flow
// ---------------------------------------------------------------------------

async function runCase(
  planCase: PlanCase,
  baseUrl: string,
  execute: boolean,
): Promise<CaseReport> {
  const { disputeId } = planCase;
  const report: CaseReport = {
    disputeId,
    source: null,
    scoreBefore: null,
    scoreAfter: null,
    verdictBefore: null,
    verdictAfter: null,
    targetScore: planCase.targetScore,
    targetVerdict: planCase.targetVerdict,
    action: planCase.targetAction,
    approved: false,
    paypalStatus: null,
    pdfStatus: null,
    pdfBytes: null,
    evidenceAttached: [],
    passed: false,
  };

  try {
    // ---- (1) GET detail -------------------------------------------------
    log(`[${disputeId}] (1) GET detail`);
    const before = await getDetail(baseUrl, disputeId);
    report.source = before.dispute.source;
    report.scoreBefore =
      typeof before.final_score === "number" ? before.final_score : null;
    if (report.scoreBefore === null) {
      throw new Error("GET detail returned no final_score");
    }
    report.verdictBefore = verdictForScore(report.scoreBefore);
    // Cross-check the verdict the server reports, when it reports one.
    const serverVerdictBefore =
      before.run?.verdict ?? (asRecord(before) as { verdict?: Verdict } | null)?.verdict;
    if (serverVerdictBefore && serverVerdictBefore !== report.verdictBefore) {
      log(
        `[${disputeId}] WARNING: server verdict ${serverVerdictBefore} != derived verdict ${report.verdictBefore} for score ${report.scoreBefore}`,
      );
    }
    log(
      `[${disputeId}] scoreBefore=${report.scoreBefore} verdictBefore=${report.verdictBefore} source=${report.source}`,
    );
    if (before.evidenceHoldWarning) {
      log(`[${disputeId}] evidenceHoldWarning: ${JSON.stringify(before.evidenceHoldWarning)}`);
    }
    if (before.missingChecklistPoints || before.emptySlots) {
      log(
        `[${disputeId}] missingChecklistPoints=${JSON.stringify(before.missingChecklistPoints)} emptySlots=${JSON.stringify(before.emptySlots)}`,
      );
    }

    // SAFETY: never attach/approve/execute on a seeded dispute in execute
    // mode. In dry-run mode attaching evidence to a SEEDED dispute is the
    // sanctioned local verification path (score-verify only, no approval).
    if (report.source !== "sandbox" && execute) {
      throw new Error(
        `REFUSAL: dispute source is "${report.source}", not "sandbox" — will not approve/execute on a seeded dispute`,
      );
    }
    if (report.source !== "sandbox") {
      log(
        `[${disputeId}] NOTE: source is "${report.source}" — dry-run attach + score-verify only; approve/execute will be refused`,
      );
    }

    const amountValue = before.dispute.amount.value;
    const currencyCode = before.dispute.amount.currency_code;
    const filedDate = before.dispute.created_at
      ? fmtDate(new Date(before.dispute.created_at))
      : fmtDate(new Date());
    const ctx: EvidenceContext = {
      disputeId,
      transactionId: planCase.transactionId ?? "",
      reason: planCase.reason ?? before.dispute.reason ?? "",
      amountValue,
      currencyCode,
      filedDate,
    };

    // ---- (2) Attach each evidence entry ---------------------------------
    const entries = planCase.evidence ?? [];
    for (const entry of entries) {
      const gen = generateEvidenceFile(entry, ctx);
      log(
        `[${disputeId}] (2) attaching ${entry.type} as ${gen.fileName} (${gen.bytes.length} bytes)`,
      );
      const form = new FormData();
      // BlobPart typing: copy into a fresh Uint8Array<ArrayBuffer>.
      const fileBytes = new Uint8Array(gen.bytes.byteLength);
      fileBytes.set(gen.bytes);
      form.append("file", new Blob([fileBytes], { type: gen.mimeType }), gen.fileName);
      form.append("evidenceType", entry.type);
      // Quality anchors: STRONG needs 2 anchors (referenceId + documentDate).
      // Default them from the template fields so a plan entry that only sets
      // trackingNumber/deliveryDate still classifies STRONG.
      const refId = entry.referenceId ?? entry.trackingNumber;
      const docDate = entry.documentDate ?? entry.deliveryDate;
      if (refId) form.append("referenceId", refId);
      if (docDate) form.append("documentDate", docDate);
      if (entry.notes) form.append("notes", entry.notes);
      const { status, body } = await fetchJson(
        `${baseUrl}/api/disputes/${encodeURIComponent(disputeId)}/evidence`,
        { method: "POST", body: form },
      );
      if (status < 200 || status >= 300) {
        throw new Error(
          `POST evidence (${entry.type}) returned HTTP ${status}: ${JSON.stringify(body)?.slice(0, 500)}`,
        );
      }
      const rec = asRecord(body) ?? {};
      const item = asRecord(rec.item) ?? {};
      const crossVerify =
        asRecord(item.crossVerify) ??
        asRecord(rec.crossVerify) ??
        null;
      const attached: EvidenceAttachedReport = {
        type: entry.type,
        quality: typeof item.quality === "string" ? item.quality : null,
        scoreDelta: typeof item.scoreDelta === "number" ? item.scoreDelta : null,
        crossVerifyStatus:
          crossVerify && typeof crossVerify.status === "string"
            ? (crossVerify.status as string)
            : typeof item.crossVerifyStatus === "string"
              ? (item.crossVerifyStatus as string)
              : null,
      };
      report.evidenceAttached.push(attached);
      log(
        `[${disputeId}] attached ${entry.type}: quality=${attached.quality} scoreDelta=${attached.scoreDelta} crossVerify=${attached.crossVerifyStatus}`,
      );
    }

    // ---- (3) GET detail again + assert score/verdict --------------------
    log(`[${disputeId}] (3) GET detail (after evidence)`);
    const after = await getDetail(baseUrl, disputeId);
    report.scoreAfter =
      typeof after.final_score === "number" ? after.final_score : null;
    if (report.scoreAfter === null) {
      throw new Error("GET detail (after evidence) returned no final_score");
    }
    report.verdictAfter = verdictForScore(report.scoreAfter);
    const serverVerdictAfter =
      after.run?.verdict ?? (asRecord(after) as { verdict?: Verdict } | null)?.verdict;
    if (serverVerdictAfter && serverVerdictAfter !== report.verdictAfter) {
      log(
        `[${disputeId}] WARNING: server verdict ${serverVerdictAfter} != derived verdict ${report.verdictAfter} for score ${report.scoreAfter}`,
      );
    }
    log(
      `[${disputeId}] scoreAfter=${report.scoreAfter} verdictAfter=${report.verdictAfter} (target score=${planCase.targetScore} verdict=${planCase.targetVerdict})`,
    );
    if (after.evidenceHoldWarning) {
      log(`[${disputeId}] evidenceHoldWarning: ${JSON.stringify(after.evidenceHoldWarning)}`);
    }
    if (
      report.scoreAfter !== planCase.targetScore ||
      report.verdictAfter !== planCase.targetVerdict
    ) {
      throw new Error(
        `SCORE/VERDICT MISMATCH: expected score=${planCase.targetScore} verdict=${planCase.targetVerdict}, got score=${report.scoreAfter} verdict=${report.verdictAfter} — aborting BEFORE approval`,
      );
    }

    // ---- (4) approve/execute (only with --execute) ----------------------
    if (!execute) {
      log(`[${disputeId}] DRY RUN — no approval/execution performed`);
      report.passed = true;
      return report;
    }

    // Re-check source immediately before approve/execute (hard safety rule).
    const recheck = await getDetail(baseUrl, disputeId);
    if (recheck.dispute.source !== "sandbox") {
      throw new Error(
        `REFUSAL: source re-check before approval is "${recheck.dispute.source}", not "sandbox" — will not approve/execute`,
      );
    }
    report.source = recheck.dispute.source;

    log(`[${disputeId}] (4a) POST run (swarm)`);
    const runRes = await fetchJson(
      `${baseUrl}/api/disputes/${encodeURIComponent(disputeId)}/run`,
      { method: "POST" },
    );
    if (runRes.status < 200 || runRes.status >= 300) {
      throw new Error(
        `POST run returned HTTP ${runRes.status}: ${JSON.stringify(runRes.body)?.slice(0, 500)}`,
      );
    }
    const runRec = asRecord(runRes.body) ?? {};
    const runObj = asRecord(runRec.run);
    if (!runObj) {
      throw new Error("POST run returned no run object");
    }
    log(
      `[${disputeId}] run exists: score=${String(runObj.score ?? "?")} verdict=${String(runObj.verdict ?? "?")}`,
    );

    const approveBody: Record<string, unknown> = {
      action: planCase.targetAction,
      approved_by: APPROVED_BY,
    };
    if (typeof planCase.offerAmount === "number") {
      approveBody.offer_amount = {
        currency_code: currencyCode,
        value: planCase.offerAmount.toFixed(2),
      };
    }
    if (planCase.confirmNoEvidence) {
      approveBody.confirmed_no_evidence = true;
    }
    const approveAt = new Date().toISOString();
    log(
      `[${disputeId}] (4b) APPROVAL dispute=${disputeId} action=${planCase.targetAction} approved_by=${APPROVED_BY} at=${approveAt}`,
    );
    const apprRes = await fetchJson(
      `${baseUrl}/api/disputes/${encodeURIComponent(disputeId)}/approve`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(approveBody),
      },
    );
    if (apprRes.status < 200 || apprRes.status >= 300) {
      throw new Error(
        `POST approve returned HTTP ${apprRes.status}: ${JSON.stringify(apprRes.body)?.slice(0, 500)}`,
      );
    }
    const apprRec = asRecord(apprRes.body) ?? {};
    const approval = asRecord(apprRec.approval) ?? apprRec;
    log(
      `[${disputeId}] APPROVED id=${String(approval.id ?? "?")} action=${String(approval.action ?? planCase.targetAction)} at=${approveAt}`,
    );
    report.approved = true;

    const executeAt = new Date().toISOString();
    log(
      `[${disputeId}] (4c) EXECUTION dispute=${disputeId} action=${planCase.targetAction} at=${executeAt}`,
    );
    const execRes = await fetchJson(
      `${baseUrl}/api/disputes/${encodeURIComponent(disputeId)}/execute`,
      { method: "POST" },
    );
    if (execRes.status < 200 || execRes.status >= 300) {
      throw new Error(
        `POST execute returned HTTP ${execRes.status}: ${JSON.stringify(execRes.body)?.slice(0, 500)}`,
      );
    }
    const execRec = asRecord(execRes.body) ?? {};
    const execObj = asRecord(execRec.execution) ?? null;
    report.paypalStatus =
      typeof execRec.paypal_status === "string"
        ? (execRec.paypal_status as string)
        : execObj && typeof execObj.paypal_status === "string"
          ? (execObj.paypal_status as string)
          : execObj && typeof execObj.status === "string"
            ? (execObj.status as string)
            : typeof execRec.status === "string"
              ? (execRec.status as string)
              : null;
    log(
      `[${disputeId}] EXECUTED at=${executeAt} paypal_status=${report.paypalStatus}`,
    );

    log(`[${disputeId}] (4d) GET evidence.pdf`);
    const pdfRes = await fetch(
      `${baseUrl}/api/disputes/${encodeURIComponent(disputeId)}/evidence.pdf`,
    );
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
    report.pdfStatus = pdfRes.status;
    report.pdfBytes = pdfBuf.length;
    log(`[${disputeId}] evidence.pdf status=${report.pdfStatus} bytes=${report.pdfBytes}`);
    if (pdfRes.status < 200 || pdfRes.status >= 300) {
      throw new Error(`GET evidence.pdf returned HTTP ${pdfRes.status}`);
    }

    report.passed = true;
    return report;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[${disputeId}] FAILED: ${message}`);
    report.error = message;
    report.passed = false;
    return report;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    console.error(usage());
    return 2;
  }
  if (opts.help) {
    console.log(usage());
    return 0;
  }
  if (!opts.planPath) {
    console.error("Error: --plan <plan.json> is REQUIRED.");
    console.error(usage());
    return 2;
  }

  let plan: PlanFile;
  try {
    const raw = fs.readFileSync(opts.planPath, "utf-8");
    plan = JSON.parse(raw) as PlanFile;
  } catch (err) {
    console.error(
      `Error: could not read/parse plan file ${opts.planPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 2;
  }
  if (!plan || !Array.isArray(plan.cases) || plan.cases.length === 0) {
    console.error("Error: plan file must contain a non-empty \"cases\" array.");
    return 2;
  }
  // Validate the plan up front (before touching any dispute).
  for (const c of plan.cases) {
    if (!c.disputeId || typeof c.disputeId !== "string") {
      console.error("Error: every plan case needs a string disputeId.");
      return 2;
    }
    if (typeof c.targetScore !== "number" || c.targetScore < 0 || c.targetScore > 100) {
      console.error(`Error: case ${c.disputeId} needs targetScore 0–100.`);
      return 2;
    }
    if (!c.targetVerdict || !["CONTEST_HARD_PROOF", "DE_ESCALATE_OFFER", "CONCEDE_FAST_SETTLE"].includes(c.targetVerdict)) {
      console.error(`Error: case ${c.disputeId} needs a valid targetVerdict.`);
      return 2;
    }
    if (verdictForScore(c.targetScore) !== c.targetVerdict) {
      console.error(
        `Error: case ${c.disputeId} is inconsistent — targetScore ${c.targetScore} derives verdict ${verdictForScore(c.targetScore)}, not ${c.targetVerdict} (thresholds locked at 35/75).`,
      );
      return 2;
    }
    if (!c.targetAction || typeof c.targetAction !== "string") {
      console.error(`Error: case ${c.disputeId} needs a targetAction.`);
      return 2;
    }
    for (const e of c.evidence ?? []) {
      if (!e.type || typeof e.type !== "string") {
        console.error(`Error: case ${c.disputeId} has an evidence entry without a type.`);
        return 2;
      }
    }
  }

  const baseUrl = opts.baseUrl;
  const execute = opts.execute;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath =
    opts.reportPath ?? path.join(process.cwd(), `live-sandbox-report-${timestamp}.json`);

  console.log(`PHALANX live-sandbox seed-and-verify — base: ${baseUrl}`);
  console.log(
    execute
      ? "MODE: LIVE — approvals and executions WILL be performed (Sandbox only)."
      : "MODE: DRY RUN — no approval/execution performed (attach + score-verify only).",
  );
  console.log(`Plan: ${opts.planPath} (${plan.cases.length} case${plan.cases.length === 1 ? "" : "s"})`);
  console.log(`Report: ${reportPath}`);

  const results: CaseReport[] = [];
  for (const c of plan.cases) {
    results.push(await runCase(c, baseUrl, execute));
  }

  const reportObj = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    mode: execute ? "live" : "dry-run",
    planPath: opts.planPath,
    cases: results,
    allPassed: results.every((r) => r.passed),
  };
  fs.writeFileSync(reportPath, JSON.stringify(reportObj, null, 2), "utf-8");
  console.log(`\nReport written to ${reportPath}`);

  console.log("\nSUMMARY");
  for (const r of results) {
    console.log(
      `${r.passed ? "PASS" : "FAIL"} ${r.disputeId} score ${String(r.scoreBefore)} -> ${String(r.scoreAfter)} (target ${r.targetScore}) verdict ${String(r.verdictBefore)} -> ${String(r.verdictAfter)} (target ${r.targetVerdict}) approved=${r.approved} paypal=${r.paypalStatus ?? "-"} pdf=${r.pdfStatus ?? "-"}${r.error ? ` error=${r.error}` : ""}`,
    );
  }
  const passed = results.filter((r) => r.passed).length;
  console.log(`${passed}/${results.length} cases passed.`);
  return reportObj.allPassed ? 0 : 1;
}

main().then((code) => {
  process.exitCode = code;
});
