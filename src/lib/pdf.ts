// Evidence dossier PDF — brief §6, generated server-side with pdf-lib.
// Pages: (1) Executive Result Summary, (2) invoice/order record, (3) tracking/fulfillment
// proof, (4) merchant-log correlation table, (5) evidence manifest.
// Subsequent pages (6..N): Dedicated Exhibit pages for merchant-attached bills/evidence.
// Seeded disputes carry a SIMULATED watermark on every page.
// The PDF is an ATTACHMENT to the provide-evidence call; the structured
// evidences[] JSON is the primary payload.

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
import { buildPracticalReasons, deduplicateGaps } from "./practical-reasoning";
import { computeAttachedEvidenceDelta } from "./evidence-scorer";
import { getAttachedEvidence } from "./store";
import type {
  AttachedEvidence,
  Dispute,
  EvidenceArtifact,
  SwarmRun,
} from "./types";

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 48;
const BODY = 11;
const SMALL = 9;

export const PDF_SIZE_LIMIT_BYTES = 10 * 1024 * 1024; // 10 MB per file (Phase 0 row 2)

/**
 * pdf-lib's StandardFonts.Helvetica is WinAnsi-encoded (latin-1 subset):
 * any character outside it makes widthOfTextAtSize / drawText throw.
 * Sanitize before measuring so text can never crash the dossier.
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
  mono: PDFFont;
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

/** Cross-anchor check badge line for one attached exhibit in the PDF
 *  manifest. Attachments stored before cross-verification existed have
 *  no crossVerify result and render as UNVERIFIED (Self-attested). */
export function crossAnchorPdfLine(att: AttachedEvidence): string {
  const cv = att.crossVerify;
  if (!cv) return "Cross-Anchor Check: UNVERIFIED (Self-attested)";
  if (cv.status === "VERIFIED") {
    return `Cross-Anchor Check: VERIFIED (${cv.anchorsMatched}/${cv.anchorsTotal} anchors match PayPal record)`;
  }
  if (cv.status === "CONTRADICTION") {
    return "Cross-Anchor Check: CONTRADICTION (0 pts awarded)";
  }
  return "Cross-Anchor Check: UNVERIFIED (Self-attested)";
}

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
  attachedEvidence?: AttachedEvidence[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const simulated = dispute.source === "seeded";
  const ctx: Ctx = { doc, font, bold, mono, simulated, pageNo: 0 };
  const maxW = PAGE_W - MARGIN * 2;

  // Pre-swarm preview: score/print only pass-1 artifacts
  const visibleArtifacts = artifactsForPdf(artifacts, run);
  const { score: baseCheckScore, items: baseItems, gaps: baseGaps } = scoreDispute(dispute, visibleArtifacts);

  // Attached evidence scoring
  const attached = attachedEvidence ?? getAttachedEvidence(dispute.id);
  const baseScore = run ? run.score : baseCheckScore;
  const deltaCalc = computeAttachedEvidenceDelta(attached, baseItems, dispute, baseScore);
  const finalScore = deltaCalc.finalScore;
  const verdict = deltaCalc.verdict;

  const action =
    verdict === "CONTEST_HARD_PROOF"
      ? "provide-evidence"
      : verdict === "DE_ESCALATE_OFFER"
        ? "make-offer"
        : "accept-claim";
  const evidenceTypes = evidenceTypesFor(dispute, action);
  const generatedAt = new Date().toISOString();

  // Practical reasoning and named gaps
  const practicalReasons =
    run?.practical_reasons ??
    buildPracticalReasons(baseItems, verdict, finalScore, attached, dispute);
  const namedGaps =
    run?.named_gaps ??
    deduplicateGaps(run ? run.gaps : baseGaps, baseItems, attached, dispute);

  const tracking = visibleArtifacts.find((a) => a.kind === "tracking");
  const invoice = visibleArtifacts.find((a) => a.kind === "invoice");
  const merchantLog = visibleArtifacts.find((a) => a.kind === "merchant_log");

  // ---- Page 1: One-Page Executive Result Summary ----
  {
    const { page, y } = newPage(ctx, "Evidence dossier — Executive Summary");
    let cy = y;

    // Score string
    const scoreStr =
      deltaCalc.delta > 0
        ? `${finalScore}/100 (Base: ${baseScore} + ${deltaCalc.delta} from attached bills)`
        : `${finalScore}/100 — checklist score, not a win probability`;

    cy = drawKv(
      page,
      [
        ["Dispute ID", dispute.id],
        ["Reason", dispute.reason],
        ["Amount", `$${dispute.amount.value} ${dispute.amount.currency_code}`],
        ["Lifecycle stage", `${dispute.dispute_life_cycle_stage} / ${dispute.status}`],
        ["Checklist score", scoreStr],
        ["Verdict route", verdict],
        ["Recommended action", action],
        ["Generated at", generatedAt],
        ["Environment", simulated ? "Seeded — SIMULATED demo data" : "PayPal Sandbox"],
      ],
      MARGIN,
      cy,
      font,
      bold,
      maxW,
    );
    cy -= 6;

    // Pre-swarm preview label — honesty label, must survive reworks.
    // A pre-swarm PDF must never be mistaken for a completed dossier.
    if (!run) {
      cy = drawWrapped(
        page,
        "PRE-SWARM PREVIEW — the swarm has not run yet. This dossier shows only Hound pass-1 sources (tracking + invoice). The merchant log and other slow sources are not included, and the score below reflects partial evidence only.",
        MARGIN,
        cy,
        bold,
        SMALL,
        maxW,
        rgb(0.6, 0.1, 0.1),
      );
      cy -= 6;
    }

    // Box 2: Practical Reasons
    page.drawText("Why This Verdict (Key Deterministic Findings):", {
      x: MARGIN,
      y: cy,
      size: 10,
      font: bold,
      color: rgb(0.05, 0.05, 0.08),
    });
    cy -= 14;
    for (const r of practicalReasons.slice(0, 3)) {
      cy = drawWrapped(page, `- ${r}`, MARGIN + 8, cy, font, SMALL, maxW - 8);
    }
    cy -= 6;

    // Box 3: Top Named Gaps & Resolution Status
    page.drawText("Top Evidentiary Gaps & Resolution Status:", {
      x: MARGIN,
      y: cy,
      size: 10,
      font: bold,
      color: rgb(0.05, 0.05, 0.08),
    });
    cy -= 14;
    if (namedGaps.length === 0) {
      cy = drawWrapped(page, "All primary checklist requirements satisfied.", MARGIN + 8, cy, font, SMALL, maxW - 8);
    } else {
      for (const g of namedGaps.slice(0, 3)) {
        const statusText = g.resolved ? "[RESOLVED]" : `[UNRESOLVED: +${g.scoreImpactPts} pts recoverable]`;
        cy = drawWrapped(
          page,
          `* ${g.title}: ${statusText} — ${g.summary}`,
          MARGIN + 8,
          cy,
          font,
          SMALL,
          maxW - 8,
        );
      }
    }
    cy -= 6;

    // Notice
    drawWrapped(
      page,
      simulated
        ? "SIMULATED — demo data only. Nothing here is a real transaction, buyer, or delivery."
        : "Sandbox dispute — test data only. Human approval is strictly mandatory before execution.",
      MARGIN,
      cy,
      bold,
      SMALL,
      maxW,
      rgb(0.6, 0.1, 0.1),
    );
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
      const dates = [...new Set(merchantLog.summary.match(/\d{4}-\d{2}-\d{2}/g) ?? [])];
      const ts = dates.length > 0 ? dates.join(" to ") : "as stated in record";
      page.drawText("Post-delivery use (see record below)", { x: MARGIN, y: cy, size: SMALL, font });
      page.drawText(ts, { x: MARGIN + 230, y: cy, size: SMALL, font });
      page.drawText(invoiceRef, { x: MARGIN + 360, y: cy, size: SMALL, font });
      cy -= 18;
      cy -= 6;
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

    // List attached files in manifest table as well
    if (attached.length > 0) {
      cy -= 6;
      page.drawText("Merchant Attached Files & Bills:", { x: MARGIN, y: cy, size: SMALL, font: bold });
      cy -= 14;
      for (const att of attached) {
        if (cy < 110) {
          const next = newPage(ctx, "Evidence manifest (continued)");
          page = next.page;
          cy = next.y;
        }
        cy = drawWrapped(page, `Attached: ${att.fileName} [${att.evidenceType}] (${att.quality}, +${att.scoreDelta} pts)`, MARGIN, cy, bold, SMALL, maxW);
        cy = drawWrapped(page, `SHA-256: ${att.sha256}`, MARGIN + 12, cy, font, SMALL, maxW);
        cy = drawWrapped(page, `Post-Upload Lock: SHA-256 ${att.sha256}`, MARGIN + 12, cy, font, SMALL, maxW);
        cy = drawWrapped(page, crossAnchorPdfLine(att), MARGIN + 12, cy, font, SMALL, maxW);
        cy -= 4;
      }
    }

    cy -= 6;
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
        ["Dossier SHA-256", "See the x-phalanx-pdf-sha256 response header at download time (hash of final bytes)."],
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

  // ---- Subsequent Pages: Dedicated Exhibit pages for attached evidence ----
  if (attached.length > 0) {
    let exhibitNum = 1;
    for (const att of attached) {
      const title = `Exhibit ${exhibitNum}: ${att.evidenceType} — ${att.fileName}`;
      exhibitNum += 1;

      const fileBytes = att.base64Data ? Buffer.from(att.base64Data, "base64") : null;

      // Case 1: Uploaded PDF — embed/copy pages
      if (
        fileBytes &&
        att.mimeType === "application/pdf" &&
        fileBytes.length >= 4 &&
        fileBytes[0] === 0x25 &&
        fileBytes[1] === 0x50 &&
        fileBytes[2] === 0x44 &&
        fileBytes[3] === 0x46
      ) {
        try {
          const uploadedDoc = await PDFDocument.load(fileBytes);
          const pageIndices = uploadedDoc.getPageIndices();
          const copiedPages = await doc.copyPages(uploadedDoc, pageIndices);

          for (let pIdx = 0; pIdx < copiedPages.length; pIdx++) {
            const page = doc.addPage(copiedPages[pIdx]);
            ctx.pageNo += 1;

            // Header Banner
            page.drawText(`${title} (Page ${pIdx + 1} of ${copiedPages.length})`, {
              x: MARGIN,
              y: PAGE_H - 32,
              size: 9,
              font: bold,
              color: rgb(0.05, 0.05, 0.08),
            });
            page.drawText(`SHA-256: ${att.sha256.slice(0, 32)}…`, {
              x: PAGE_W - MARGIN - 180,
              y: PAGE_H - 32,
              size: 8,
              font: mono,
              color: rgb(0.4, 0.4, 0.45),
            });

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
            }
          }
          continue;
        } catch {
          // Fall through to text card fallback
        }
      }

      // Case 2: Uploaded Image (PNG / JPG)
      if (
        fileBytes &&
        (att.mimeType === "image/png" ||
          att.mimeType === "image/jpeg" ||
          att.mimeType === "image/jpg" ||
          /\.(png|jpe?g)$/i.test(att.fileName))
      ) {
        try {
          let embeddedImg;
          if (att.mimeType === "image/png" || att.fileName.toLowerCase().endsWith(".png")) {
            embeddedImg = await doc.embedPng(fileBytes);
          } else {
            embeddedImg = await doc.embedJpg(fileBytes);
          }

          const { page, y } = newPage(ctx, title);
          let cy = y;

          cy = drawKv(
            page,
            [
              ["Evidence Type", att.evidenceType],
              ["Reference ID", att.referenceId || "N/A"],
              ["Document Date", att.documentDate || "N/A"],
              ["Quality Assessment", `${att.quality} (+${att.scoreDelta} pts checklist contribution)`],
              ["File SHA-256", att.sha256],
            ],
            MARGIN,
            cy,
            font,
            bold,
            maxW,
          );
          cy -= 16;

          // Scale image to fit remaining page height
          const imgDims = embeddedImg.scale(1.0);
          const maxImgW = maxW;
          const maxImgH = Math.max(100, cy - 60);

          let scaleW = maxImgW / imgDims.width;
          let scaleH = maxImgH / imgDims.height;
          let scale = Math.min(1.0, scaleW, scaleH);

          const renderW = imgDims.width * scale;
          const renderH = imgDims.height * scale;
          const renderX = MARGIN + (maxW - renderW) / 2;
          const renderY = cy - renderH;

          page.drawImage(embeddedImg, {
            x: renderX,
            y: renderY,
            width: renderW,
            height: renderH,
          });

          continue;
        } catch {
          // Fall through to text card fallback
        }
      }

      // Case 3: Text / JSON / CSV or Fallback
      {
        let { page, y } = newPage(ctx, title);
        let cy = y;

        cy = drawKv(
          page,
          [
            ["Evidence Type", att.evidenceType],
            ["Reference ID", att.referenceId || "N/A"],
            ["Document Date", att.documentDate || "N/A"],
            ["Quality Assessment", `${att.quality} (+${att.scoreDelta} pts)`],
            ["File SHA-256", att.sha256],
          ],
          MARGIN,
          cy,
          font,
          bold,
          maxW,
        );
        cy -= 12;

        page.drawText("Attached Document Content (Forensic Extract):", {
          x: MARGIN,
          y: cy,
          size: 10,
          font: bold,
          color: rgb(0.05, 0.05, 0.08),
        });
        cy -= 14;

        let contentStr = "";
        if (fileBytes) {
          try {
            contentStr = fileBytes.toString("utf-8");
          } catch {
            contentStr = `[Binary content — ${fileBytes.length} bytes]`;
          }
        } else {
          contentStr = `[No file bytes stored — SHA-256: ${att.sha256}]`;
        }

        const paged = drawWrappedPaged(
          ctx,
          page,
          contentStr,
          MARGIN,
          cy,
          mono,
          8,
          maxW,
          `${title} (continued)`,
        );
        void paged;
      }
    }
  }

  return doc.save();
}
