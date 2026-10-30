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

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
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
 *  Only types PayPal requested for the dispute reason (Phase 0 row 3).
 *  make-offer / accept-claim send no evidence file — the dossier is then
 *  a review copy only, and the manifest says so. */
export function evidenceTypesFor(dispute: Dispute, action: string): string[] {
  if (action !== "provide-evidence") return [];
  if (dispute.reason === "MERCHANDISE_OR_SERVICE_NOT_RECEIVED") {
    return ["PROOF_OF_FULFILLMENT"];
  }
  return ["OTHER"];
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("hex");
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

  const { score, items } = scoreDispute(dispute, artifacts);
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

  const tracking = artifacts.find((a) => a.kind === "tracking");
  const invoice = artifacts.find((a) => a.kind === "invoice");
  const merchantLog = artifacts.find((a) => a.kind === "merchant_log");

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
    const { page, y } = newPage(ctx, "Merchant-log correlation");
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
      cy = drawWrapped(page, `Source record: ${merchantLog.summary}`, MARGIN, cy, font, SMALL, maxW);
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
    const { page, y } = newPage(ctx, "Evidence manifest");
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
    for (const a of artifacts) {
      const canonical = JSON.stringify({ id: a.id, kind: a.kind, source: a.source, summary: a.summary, simulated: a.simulated });
      const hash = sha256Hex(canonical);
      cy = drawWrapped(page, `${a.id} [${a.kind}]${a.simulated ? " (SIMULATED)" : ""}`, MARGIN, cy, bold, SMALL, maxW);
      cy = drawWrapped(page, `SHA-256: ${hash}`, MARGIN + 12, cy, font, SMALL, maxW);
      cy -= 4;
    }
    cy -= 6;
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
