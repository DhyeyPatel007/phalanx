// Evidence dossier PDF — brief §6, generated server-side with pdf-lib.
// Pages: (1) cover, (2) invoice/order record, (3) tracking/fulfillment
// proof, (4) merchant-log correlation table, (5) evidence manifest.
// Seeded disputes carry a SIMULATED watermark on every page.
// The PDF is an ATTACHMENT to the provide-evidence call; the structured
// evidences[] JSON is the primary payload — never "just a PDF and hope".
// No raw IPs anywhere in the PDF. Scores are checklist scores, never a
// win probability. Size is far under the PayPal limits (50 MB total,
// 10 MB per file).

import { createHash } from "crypto";
import {
  degrees,
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import { scoreDispute } from "./scorer";
import type { Dispute, EvidenceArtifact, SwarmRun } from "./types";

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 48;
const BODY = 11;
const SMALL = 9;

export const PDF_SIZE_LIMIT_BYTES = 10 * 1024 * 1024; // 10 MB per file (Phase 0 row 2)

/**
 * pdf-lib's StandardFonts.Helvetica is WinAnsi-encoded (latin-1 subset):
 * any character outside it (→, smart quotes, ₹, …) makes
 * widthOfTextAtSize / drawText throw and the PDF route 500. Sanitize
 * before measuring so live PayPal / merchant text can never crash the
 * dossier. Characters with no WinAnsi equivalent become "?".
 */
function sanitizeWinAnsi(input: string): string {
  return input
    .replace(/→/g, "->")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF\u2013\u2014\n]/g, "?");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const raw of sanitizeWinAnsi(text).split("\n")) {
    const words = raw.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const trial = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
        line = trial;
      } else {
        if (line) lines.push(line);
        line = w;
      }
    }
    lines.push(line);
  }
  return lines;
}

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  simulated: boolean;
  pageNo: number;
}

function newPage(ctx: Ctx, title: string): { page: PDFPage; y: number } {
  const page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.pageNo += 1;
  const { font, bold, simulated } = ctx;

  // Header
  page.drawText("PHALANX  //  DISPUTE DEFENSE — EVIDENCE DOSSIER", {
    x: MARGIN,
    y: PAGE_H - 36,
    size: 9,
    font: bold,
    color: rgb(0.05, 0.05, 0.08),
  });
  page.drawLine({
    start: { x: MARGIN, y: PAGE_H - 44 },
    end: { x: PAGE_W - MARGIN, y: PAGE_H - 44 },
    thickness: 1,
    color: rgb(0.6, 0.6, 0.65),
  });

  // Title
  page.drawText(title, {
    x: MARGIN,
    y: PAGE_H - 72,
    size: 17,
    font: bold,
    color: rgb(0.05, 0.05, 0.08),
  });

  // Footer
  const footer =
    "PHALANX — checklist score, not a win probability. Sandbox only." +
    (simulated ? " SIMULATED demo data." : "");
  page.drawText(footer, {
    x: MARGIN,
    y: 30,
    size: 8,
    font,
    color: rgb(0.45, 0.45, 0.5),
  });
  page.drawText(`Page ${ctx.pageNo}`, {
    x: PAGE_W - MARGIN - 40,
    y: 30,
    size: 8,
    font,
    color: rgb(0.45, 0.45, 0.5),
  });

  // Watermark on every page for seeded (SIMULATED) disputes.
  if (simulated) {
    page.drawText("SIMULATED", {
      x: 120,
      y: 420,
      size: 64,
      font: bold,
      color: rgb(0.78, 0.1, 0.1),
      opacity: 0.12,
      rotate: degrees(45),
    });
    page.drawText("DEMO DATA — NOT A REAL DISPUTE", {
      x: 150,
      y: 380,
      size: 13,
      font: bold,
      color: rgb(0.78, 0.1, 0.1),
      opacity: 0.18,
      rotate: degrees(45),
    });
  }

  return { page, y: PAGE_H - 96 };
}

function drawWrapped(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  maxWidth: number,
  color = rgb(0.1, 0.1, 0.12),
): number {
  const lines = wrapText(text, font, size, maxWidth);
  let cy = y;
  for (const line of lines) {
    page.drawText(line, { x, y: cy, size, font, color });
    cy -= size + 4;
  }
  return cy;
}

/**
 * Paginating variant of drawWrapped for unbounded text (finding #9):
 * wraps first, then draws line by line, starting a continuation page
 * whenever the cursor would run into the footer (y < 60). Used for the
 * merchant-log source record and anywhere a live record of unknown
 * length is drawn. Pages 1–3 draw only bounded content (fixed strings +
 * short dispute fields, worst case ~480pt from a 745pt start) and need
 * no continuation.
 */
function drawWrappedPaged(
  ctx: Ctx,
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  maxWidth: number,
  continueTitle: string,
  color = rgb(0.1, 0.1, 0.12),
): { page: PDFPage; y: number } {
  const lines = wrapText(text, font, size, maxWidth);
  let cur = page;
  let cy = y;
  for (const line of lines) {
    if (cy < 60) {
      const next = newPage(ctx, continueTitle);
      cur = next.page;
      cy = next.y;
    }
    cur.drawText(line, { x, y: cy, size, font, color });
    cy -= size + 4;
  }
  return { page: cur, y: cy };
}

function drawKv(
  page: PDFPage,
  pairs: [string, string][],
  x: number,
  y: number,
  font: PDFFont,
  bold: PDFFont,
  maxWidth: number,
): number {
  let cy = y;
  for (const [k, v] of pairs) {
    page.drawText(k, { x, y: cy, size: BODY, font: bold, color: rgb(0.05, 0.05, 0.08) });
    cy = drawWrapped(page, v, x + 150, cy, font, BODY, maxWidth - 150);
    cy -= 6;
  }
  return cy;
}

/** Evidence types this dossier would send with provide-evidence.
 *  The live dispute detail is the authority: only types PayPal requested
 *  (evidences[] with source REQUESTED_FROM_SELLER) are sent (Phase 0
 *  row 2/3). The reason-based list below is ONLY the fallback for seeded
 *  rows, whose raw_paypal_detail is null. ingest.ts already stores the
 *  full live detail in raw_paypal_detail for Sandbox disputes. */
export function evidenceTypesFor(dispute: Dispute, action: string): string[] {
  if (action !== "provide-evidence") return [];
  const rawEvidences = (
    dispute.raw_paypal_detail as {
      evidences?: Array<{ evidence_type?: string; source?: string }>;
    } | null
  )?.evidences;
  if (Array.isArray(rawEvidences) && rawEvidences.length > 0) {
    const requested = rawEvidences
      .filter((e) => !e.source || e.source === "REQUESTED_FROM_SELLER")
      .map((e) => e.evidence_type)
      .filter((t): t is string => Boolean(t));
    if (requested.length > 0) return [...new Set(requested)];
  }
  if (dispute.reason === "MERCHANDISE_OR_SERVICE_NOT_RECEIVED") {
    return ["PROOF_OF_FULFILLMENT"];
  }
  return ["OTHER"];
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("hex");
}

/**
 * Which artifacts a dossier may show (finding #9). Before the swarm has
 * run (run === null), only Hound pass-1 sources — tracking + invoice —
 * exist yet: the merchant log is fetched only after a Red-Team rejection
 * (swarm.ts mirrors this filter). Showing all artifacts pre-swarm would
 * print the merchant log and score 85 for A, contradicting the swarm's
 * own pass-1 story (60, tracking+invoice only). After a run, all
 * artifacts the swarm actually used are shown.
 */
export function artifactsForPdf(
  artifacts: EvidenceArtifact[],
  run: SwarmRun | null,
): EvidenceArtifact[] {
  if (run !== null) return artifacts;
  return artifacts.filter((a) => a.kind === "tracking" || a.kind === "invoice");
}

export async function buildEvidencePdf(
  dispute: Dispute,
  artifacts: EvidenceArtifact[],
  run: SwarmRun | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const simulated = dispute.source === "seeded";
  const ctx: Ctx = { doc, font, bold, simulated, pageNo: 0 };
  const maxW = PAGE_W - MARGIN * 2;

  // Pre-swarm preview: score/print only pass-1 artifacts (finding #9).
  const visibleArtifacts = artifactsForPdf(artifacts, run);
  const { score, items } = scoreDispute(dispute, visibleArtifacts);
  const finalScore = run ? run.score : score;
  const verdict = run ? run.verdict : finalScore >= 75 ? "CONTEST_HARD_PROOF" : finalScore >= 35 ? "DE_ESCALATE_OFFER" : "CONCEDE_FAST_SETTLE";
  const action =
    verdict === "CONTEST_HARD_PROOF"
      ? "provide-evidence"
      : verdict === "DE_ESCALATE_OFFER"
        ? "make-offer"
        : "accept-claim";
  const evidenceTypes = evidenceTypesFor(dispute, action);
  const generatedAt = new Date().toISOString();

  const tracking = visibleArtifacts.find((a) => a.kind === "tracking");
  const invoice = visibleArtifacts.find((a) => a.kind === "invoice");
  const merchantLog = visibleArtifacts.find((a) => a.kind === "merchant_log");

  // ---- Page 1: cover ----
  {
    const { page, y } = newPage(ctx, "Evidence dossier — cover");
    let cy = y;
    cy = drawKv(
      page,
      [
        ["Dispute ID", dispute.id],
        ["Reason", dispute.reason],
        ["Amount", `$${dispute.amount.value} ${dispute.amount.currency_code}`],
        ["Lifecycle stage", `${dispute.dispute_life_cycle_stage} / ${dispute.status}`],
        ["Checklist score", `${finalScore}/100 — checklist score, not a win probability`],
        ["Verdict (routing policy)", verdict],
        ["Recommended action", action],
        ["Generated", generatedAt],
        ["Source", simulated ? "Seeded — SIMULATED demo data (no real buyer, no real transaction)" : "PayPal Sandbox"],
      ],
      MARGIN,
      cy,
      font,
      bold,
      maxW,
    );
    cy -= 10;
    cy = drawWrapped(
      page,
      "How to read this dossier: the score is a deterministic checklist score (tracking DELIVERED 30 + delivery verifiable 15 + signature 15 + merchant log 25 + invoice/terms 15). It is an internal heuristic. PHALANX does not know, and does not claim, how PayPal or a card issuer will decide this case.",
      MARGIN,
      cy,
      font,
      BODY,
      maxW,
    );
    cy -= 8;
    if (run === null) {
      cy = drawWrapped(
        page,
        "PRE-SWARM PREVIEW — the swarm has not run yet. This dossier shows only Hound pass-1 sources (tracking + invoice). The merchant log and other slow sources are not included, and the score below reflects partial evidence only.",
        MARGIN,
        cy,
        bold,
        BODY,
        maxW,
        rgb(0.6, 0.1, 0.1),
      );
      cy -= 8;
    }
    drawWrapped(
      page,
      simulated
        ? "SIMULATED — every field in this dossier is seeded demo data, labelled as such. Nothing here is a real transaction, buyer, or delivery."
        : "Sandbox dispute — test data only. Nothing in this dossier moves real money or decides a real case.",
      MARGIN,
      cy,
      bold,
      BODY,
      maxW,
      rgb(0.6, 0.1, 0.1),
    );
    void items;
  }

  // ---- Page 2: invoice / order record ----
  {
    const { page, y } = newPage(ctx, "Invoice / order record");
    let cy = y;
    cy = drawKv(
      page,
      [
        ["Dispute ID", dispute.id],
        ["Amount", `$${dispute.amount.value} ${dispute.amount.currency_code}`],
        ["Reason", dispute.reason],
        ["Invoice artifact", invoice ? invoice.summary : "No invoice artifact — gap recorded, not waived."],
        ["Terms", "Order record + terms timestamp consistent with the dispute (checklist item: invoice/terms, 15 points)."],
      ],
      MARGIN,
      cy,
      font,
      bold,
      maxW,
    );
    cy -= 10;
    drawWrapped(
      page,
      "The invoice and order record above are the merchant's own records from the evidence store. If the invoice artifact is missing, the checklist records it as a named gap and the score reflects that — the gap is never waived.",
      MARGIN,
      cy,
      font,
      BODY,
      maxW,
    );
  }

  // ---- Page 3: tracking / fulfillment proof ----
  {
    const { page, y } = newPage(ctx, "Tracking / fulfillment proof");
    let cy = y;
    cy = drawKv(
      page,
      [
        ["Tracking artifact", tracking ? tracking.summary : "No tracking artifact — gap recorded, not waived."],
        ["Evidence type", evidenceTypes.length > 0 ? evidenceTypes.join(", ") : "(none — no evidence file is sent for this action)"],
        ["Requested by PayPal", "Only evidence types PayPal requested for this dispute are sent (Phase 0 row 2/3)."],
      ],
      MARGIN,
      cy,
      font,
      bold,
      maxW,
    );
    cy -= 10;
    drawWrapped(
      page,
      action === "provide-evidence"
        ? "This page supports PROOF_OF_FULFILLMENT: carrier + tracking number + delivery status from the merchant's own evidence store. The structured evidences[] JSON (tracking_info with carrier_name + tracking_number) is the primary payload; this PDF is the attachment."
        : "The recommended action for this dispute is " + action + ", which sends no evidence file. This dossier is a review copy for the human approver; the PDF is attached only when the action is provide-evidence.",
      MARGIN,
      cy,
      font,
      BODY,
      maxW,
    );
  }

  // ---- Page 4: merchant-log correlation table ----
  {
    let { page, y } = newPage(ctx, "Merchant-log correlation");
    let cy = y;
    cy = drawWrapped(
      page,
      "Merchant's own system logs only — order/buyer ID + timestamps. No raw IP addresses, no device fingerprints, no scraped data anywhere in this dossier.",
      MARGIN,
      cy,
      font,
      BODY,
      maxW,
    );
    cy -= 14;
    // Table header
    page.drawText("Event", { x: MARGIN, y: cy, size: SMALL, font: bold });
    page.drawText("Timestamp", { x: MARGIN + 230, y: cy, size: SMALL, font: bold });
    page.drawText("Order / buyer ref", { x: MARGIN + 360, y: cy, size: SMALL, font: bold });
    cy -= 6;
    page.drawLine({ start: { x: MARGIN, y: cy }, end: { x: PAGE_W - MARGIN, y: cy }, thickness: 1, color: rgb(0.6, 0.6, 0.65) });
    cy -= 16;

    const invoiceRef = invoice ? invoice.summary.match(/INV-[A-Z0-9-]+/)?.[0] ?? "invoice on file" : "no invoice on file";
    if (merchantLog) {
      // Rows are derived from the artifact record itself — no invented
      // events, timestamps, or IDs. Dates are the YYYY-MM-DD dates stated
      // in the merchant-log summary; the full record follows below.
      const dates = [...new Set(merchantLog.summary.match(/\d{4}-\d{2}-\d{2}/g) ?? [])];
      const ts = dates.length > 0 ? dates.join(" to ") : "as stated in record";
      page.drawText("Post-delivery use (see record below)", { x: MARGIN, y: cy, size: SMALL, font });
      page.drawText(ts, { x: MARGIN + 230, y: cy, size: SMALL, font });
      page.drawText(invoiceRef, { x: MARGIN + 360, y: cy, size: SMALL, font });
      cy -= 18;
      cy -= 6;
      // Unbounded live record — paginate instead of overflowing the footer.
      const paged = drawWrappedPaged(ctx, page, `Source record: ${merchantLog.summary}`, MARGIN, cy, font, SMALL, maxW, "Merchant-log correlation (continued)");
      page = paged.page;
      cy = paged.y;
    } else {
      cy = drawWrapped(
        page,
        "No merchant-log artifact for this dispute. Recorded as a named gap by the Red-Team pass — not waived, and the checklist score reflects it.",
        MARGIN,
        cy,
        font,
        BODY,
        maxW,
      );
    }
  }

  // ---- Page 5: evidence manifest ----
  {
    let { page, y } = newPage(ctx, "Evidence manifest");
    let cy = y;
    cy = drawWrapped(
      page,
      "File list + SHA-256 of each included record. Hashes are of the canonical artifact records in the evidence store, so a judge can verify nothing was altered after the swarm run.",
      MARGIN,
      cy,
      font,
      BODY,
      maxW,
    );
    cy -= 12;
    for (const a of visibleArtifacts) {
      // Pagination guard (finding #9): a live dispute can carry many
      // artifacts; each takes ~32pt, so start a continuation page before
      // the cursor would run into the footer.
      if (cy < 110) {
        const next = newPage(ctx, "Evidence manifest (continued)");
        page = next.page;
        cy = next.y;
      }
      const canonical = JSON.stringify({ id: a.id, kind: a.kind, source: a.source, summary: a.summary, simulated: a.simulated });
      const hash = sha256Hex(canonical);
      cy = drawWrapped(page, `${a.id} [${a.kind}]${a.simulated ? " (SIMULATED)" : ""}`, MARGIN, cy, bold, SMALL, maxW);
      cy = drawWrapped(page, `SHA-256: ${hash}`, MARGIN + 12, cy, font, SMALL, maxW);
      cy -= 4;
    }
    cy -= 6;
    // Footer key-values are bounded (~150pt) — one pre-draw space check
    // is enough; they never straddle a page break.
    if (cy < 170) {
      const next = newPage(ctx, "Evidence manifest (continued)");
      page = next.page;
      cy = next.y;
    }
    cy = drawKv(
      page,
      [
        ["Evidence types sent", evidenceTypes.length > 0 ? evidenceTypes.join(", ") : "(none for this action)"],
        ["Dossier file", `phalanx-${dispute.id}-evidence.pdf`],
        ["Dossier SHA-256", "See the x-phalanx-pdf-sha256 response header at download time (the hash is of the final bytes)."],
        ["Size limit", "PayPal: 50 MB total per request, 10 MB per file. This dossier is far under both."],
      ],
      MARGIN,
      cy,
      font,
      bold,
      maxW,
    );
    void cy;
  }

  return doc.save();
}
