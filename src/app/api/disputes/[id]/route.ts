import { NextResponse } from "next/server";
import {
  getApproval,
  getArtifacts,
  getAttachedEvidence,
  getDispute,
  getExecution,
  latestRun,
} from "@/lib/store";
import { ensureLiveDispute } from "@/lib/ingest";
import { buildPracticalReasons, deduplicateGaps } from "@/lib/practical-reasoning";
import { computeAttachedEvidenceDelta } from "@/lib/evidence-scorer";
import {
  detectBareDisputeRisk,
  type EmptySlot,
} from "@/lib/evidence-hold";
import { scoreDispute } from "@/lib/scorer";

/** GET /api/disputes/{id} — detail + artifacts + attached evidence + latest run + approval state.
 *  Live-sync fallback: a live dispute not yet in the store is pulled from
 *  PayPal on demand (fail-soft) before returning 404. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dispute = getDispute(id) ?? (await ensureLiveDispute(id));
  if (!dispute) {
    return NextResponse.json({ error: "dispute not found" }, { status: 404 });
  }

  const artifacts = getArtifacts(id);
  const attached = getAttachedEvidence(id);
  const baseCheck = scoreDispute(dispute, artifacts);
  const deltaCalc = computeAttachedEvidenceDelta(
    attached,
    baseCheck.items,
    dispute,
    baseCheck.score,
  );
  const run = latestRun(id) ?? null;

  // Pre-concede evidence hold (workstream B): bare live disputes score
  // <35 with zero attached evidence. Derived live on every fetch, so
  // the flag clears automatically once attachments raise the score.
  const hold = detectBareDisputeRisk({
    source: dispute.source,
    score: deltaCalc.finalScore,
    attachedCount: attached.length,
    items: baseCheck.items,
  });

  const practicalReasons = run?.practical_reasons ?? buildPracticalReasons(
    baseCheck.items,
    deltaCalc.verdict,
    deltaCalc.finalScore,
    attached,
    dispute,
  );

  const namedGaps = run?.named_gaps ?? deduplicateGaps(
    run ? run.gaps : baseCheck.gaps,
    baseCheck.items,
    attached,
    dispute,
  );

  return NextResponse.json({
    dispute,
    artifacts,
    attached_evidence: attached,
    base_score: baseCheck.score,
    final_score: deltaCalc.finalScore,
    evidenceHoldWarning: hold.isBare,
    missingChecklistPoints: hold.missingChecklistPoints,
    emptySlots: hold.emptySlots,
    practical_reasons: practicalReasons,
    named_gaps: namedGaps,
    run: run
      ? {
          ...run,
          score: deltaCalc.finalScore,
          base_score: baseCheck.score,
          verdict: deltaCalc.verdict,
          practical_reasons: practicalReasons,
          named_gaps: namedGaps,
          attached_evidence: attached,
        }
      : null,
    approval: getApproval(id) ?? null,
    execution: getExecution(id) ?? null,
  });
}
