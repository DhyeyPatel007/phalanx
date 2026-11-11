import { NextResponse } from "next/server";
import {
  getDispute,
  getArtifacts,
  getAttachedEvidence,
  addAttachedEvidence,
  removeAttachedEvidence,
  latestRun,
  addRun,
  getApproval,
  setApproval,
} from "@/lib/store";
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_DISPUTE,
  classifyEvidenceQuality,
  computeAttachedEvidenceDelta,
  computeSha256,
} from "@/lib/evidence-scorer";
import { buildPracticalReasons, deduplicateGaps } from "@/lib/practical-reasoning";
import { verifyAttachmentAgainstDispute } from "@/lib/cross-verify";
import { evDisplay, scoreDispute } from "@/lib/scorer";
import type { AttachedEvidence, EvidenceType, SwarmRun } from "@/lib/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dispute = getDispute(id);
  if (!dispute) {
    return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  }

  const attached = getAttachedEvidence(id);
  const baseArtifacts = getArtifacts(id);
  const baseCheck = scoreDispute(dispute, baseArtifacts);
  const deltaCalc = computeAttachedEvidenceDelta(
    attached,
    baseCheck.items,
    dispute,
    baseCheck.score,
  );
  const practicalReasons = buildPracticalReasons(
    baseCheck.items,
    deltaCalc.verdict,
    deltaCalc.finalScore,
    attached,
    dispute,
  );
  const namedGaps = deduplicateGaps(
    baseCheck.gaps,
    baseCheck.items,
    attached,
    dispute,
  );

  return NextResponse.json({
    disputeId: id,
    attached,
    baseScore: baseCheck.score,
    finalScore: deltaCalc.finalScore,
    delta: deltaCalc.delta,
    verdict: deltaCalc.verdict,
    practicalReasons,
    namedGaps,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dispute = getDispute(id);
  if (!dispute) {
    return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  }

  const curAttached = getAttachedEvidence(id);
  if (curAttached.length >= MAX_ATTACHMENTS_PER_DISPUTE) {
    return NextResponse.json(
      { error: `Maximum ${MAX_ATTACHMENTS_PER_DISPUTE} attachments allowed per dispute` },
      { status: 400 },
    );
  }

  let fileName = "";
  let mimeType = "";
  let evidenceType: EvidenceType = "OTHER";
  let referenceId = "";
  let documentDate = "";
  let notes = "";
  let fileBuffer: Buffer | null = null;

  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded in form data" }, { status: 400 });
    }
    fileName = file.name;
    mimeType = file.type || "application/octet-stream";
    evidenceType = (formData.get("evidenceType") as EvidenceType) || "OTHER";
    referenceId = (formData.get("referenceId") as string) || "";
    documentDate = (formData.get("documentDate") as string) || "";
    notes = (formData.get("notes") as string) || "";

    const arrayBuffer = await file.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);
  } else {
    // JSON Payload
    const body = await req.json();
    fileName = body.fileName || "";
    mimeType = body.mimeType || "application/octet-stream";
    evidenceType = body.evidenceType || "OTHER";
    referenceId = body.referenceId || "";
    documentDate = body.documentDate || "";
    notes = body.notes || "";

    if (!body.base64Data) {
      return NextResponse.json({ error: "Missing file base64Data in JSON body" }, { status: 400 });
    }
    fileBuffer = Buffer.from(body.base64Data, "base64");
  }

  // Input sanitization: evidenceType is user-supplied. An unvalidated value
  // would crash classifyEvidenceQuality (deltaTable lookup) with a 500, so
  // unknown types fall back to OTHER. fileName is stripped of path
  // separators and control characters (files are never written to disk).
  const VALID_EVIDENCE_TYPES: EvidenceType[] = [
    "INVOICE",
    "TRACKING_RECEIPT",
    "DELIVERY_PHOTO",
    "CARRIER_POD",
    "MERCHANT_LOG",
    "EMAIL_CONFIRMATION",
    "OTHER",
  ];
  if (!VALID_EVIDENCE_TYPES.includes(evidenceType)) evidenceType = "OTHER";
  fileName = fileName.replace(/[\\/<>:"|?*\x00-\x1f]/g, "_").slice(0, 200);

  if (!fileBuffer || fileBuffer.length === 0) {
    return NextResponse.json({ error: "File cannot be empty" }, { status: 400 });
  }

  if (fileBuffer.length > MAX_ATTACHMENT_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds maximum allowed size of 5 MB (${fileBuffer.length} bytes)` },
      { status: 400 },
    );
  }

  const ext = "." + fileName.split(".").pop()?.toLowerCase();
  const hasValidExt = ALLOWED_EXTENSIONS.includes(ext);
  const hasValidMime = ALLOWED_MIME_TYPES.has(mimeType);

  if (!hasValidExt && !hasValidMime) {
    return NextResponse.json(
      { error: `Unsupported file type: ${fileName} (${mimeType}). Allowed: PDF, PNG, JPG, TXT, JSON, CSV` },
      { status: 400 },
    );
  }

  const sha256 = computeSha256(fileBuffer);
  const metadata = { referenceId, documentDate, notes };
  const classification = classifyEvidenceQuality(
    evidenceType,
    fileName,
    mimeType,
    fileBuffer,
    metadata,
    dispute,
  );

  const newAttachment: AttachedEvidence = {
    id: `att-${id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    disputeId: id,
    fileName,
    mimeType,
    evidenceType,
    referenceId: referenceId || undefined,
    documentDate: documentDate || undefined,
    notes: notes || undefined,
    sizeBytes: fileBuffer.length,
    sha256,
    quality: classification.quality,
    scoreDelta: classification.scoreDelta,
    // 5-anchor cross-verification against the PayPal dispute record
    // (pure/deterministic; stored before addAttachedEvidence so the
    // detail API, UI badges and PDF manifest all see it).
    crossVerify: verifyAttachmentAgainstDispute({
      fileName,
      mimeType,
      bytes: fileBuffer,
      evidenceType,
      referenceId: referenceId || undefined,
      documentDate: documentDate || undefined,
      notes: notes || undefined,
      dispute,
    }),
    base64Data: fileBuffer.toString("base64"),
    createdAt: new Date().toISOString(),
  };

  addAttachedEvidence(id, newAttachment);

  // Invalidate approval if one existed, so merchant must re-sign off on the updated packet
  // (human approval gate invariant)
  const existingAppr = getApproval(id);
  if (existingAppr) {
    // Reset approval on change to evidence packet
    setApproval({
      ...existingAppr,
      action: "REQUIRES_REAPPROVAL_EVIDENCE_CHANGED",
    });
  }

  // Recalculate score and update latest run
  const updatedAttached = getAttachedEvidence(id);
  const baseArtifacts = getArtifacts(id);
  const baseCheck = scoreDispute(dispute, baseArtifacts);
  const deltaCalc = computeAttachedEvidenceDelta(
    updatedAttached,
    baseCheck.items,
    dispute,
    baseCheck.score,
  );

  const practicalReasons = buildPracticalReasons(
    baseCheck.items,
    deltaCalc.verdict,
    deltaCalc.finalScore,
    updatedAttached,
    dispute,
  );
  const namedGaps = deduplicateGaps(
    baseCheck.gaps,
    baseCheck.items,
    updatedAttached,
    dispute,
  );

  const prevRun = latestRun(id);
  if (prevRun) {
    const updatedRun: SwarmRun = {
      ...prevRun,
      score: deltaCalc.finalScore,
      base_score: baseCheck.score,
      verdict: deltaCalc.verdict,
      ev_display: evDisplay(
        deltaCalc.finalScore,
        parseFloat(dispute.amount.value),
        undefined,
        dispute,
      ),
      practical_reasons: practicalReasons,
      named_gaps: namedGaps,
      attached_evidence: updatedAttached,
    };
    addRun(updatedRun);
  }

  return NextResponse.json({
    success: true,
    item: newAttachment,
    attached: updatedAttached,
    baseScore: baseCheck.score,
    finalScore: deltaCalc.finalScore,
    delta: deltaCalc.delta,
    verdict: deltaCalc.verdict,
    practicalReasons,
    namedGaps,
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dispute = getDispute(id);
  if (!dispute) {
    return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  let evidenceId = url.searchParams.get("evidenceId") || url.searchParams.get("id");

  if (!evidenceId) {
    try {
      const body = await req.json();
      evidenceId = body.evidenceId || body.id;
    } catch {
      // url search param fallback
    }
  }

  if (!evidenceId) {
    return NextResponse.json({ error: "Missing evidenceId parameter" }, { status: 400 });
  }

  const removed = removeAttachedEvidence(id, evidenceId);
  if (!removed) {
    return NextResponse.json({ error: "Evidence item not found" }, { status: 404 });
  }

  // Recalculate score and practical reasons
  const updatedAttached = getAttachedEvidence(id);
  const baseArtifacts = getArtifacts(id);
  const baseCheck = scoreDispute(dispute, baseArtifacts);
  const deltaCalc = computeAttachedEvidenceDelta(
    updatedAttached,
    baseCheck.items,
    dispute,
    baseCheck.score,
  );

  const practicalReasons = buildPracticalReasons(
    baseCheck.items,
    deltaCalc.verdict,
    deltaCalc.finalScore,
    updatedAttached,
    dispute,
  );
  const namedGaps = deduplicateGaps(
    baseCheck.gaps,
    baseCheck.items,
    updatedAttached,
    dispute,
  );

  const prevRun = latestRun(id);
  if (prevRun) {
    const updatedRun: SwarmRun = {
      ...prevRun,
      score: deltaCalc.finalScore,
      base_score: baseCheck.score,
      verdict: deltaCalc.verdict,
      ev_display: evDisplay(
        deltaCalc.finalScore,
        parseFloat(dispute.amount.value),
        undefined,
        dispute,
      ),
      practical_reasons: practicalReasons,
      named_gaps: namedGaps,
      attached_evidence: updatedAttached,
    };
    addRun(updatedRun);
  }

  return NextResponse.json({
    success: true,
    attached: updatedAttached,
    baseScore: baseCheck.score,
    finalScore: deltaCalc.finalScore,
    delta: deltaCalc.delta,
    verdict: deltaCalc.verdict,
    practicalReasons,
    namedGaps,
  });
}
