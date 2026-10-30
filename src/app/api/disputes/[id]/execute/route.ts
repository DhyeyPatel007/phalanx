import { NextResponse } from "next/server";
import { getApproval, getDispute, latestRun, setExecution } from "@/lib/store";

/**
 * POST /api/disputes/{id}/execute — executes the approved action once.
 *
 * HARD LIMIT FOR THIS RUN (basics, steps 1–4): NO live Sandbox execution.
 * This endpoint therefore refuses in every case today, and logs each
 * refusal — including the negative test "execute without approval".
 * The live PayPal call (provide-evidence / make-offer / accept-claim,
 * idempotency key = dispute ID + approved action + approval ID) lands in
 * build step 5, only after Dhyey confirms Sandbox accounts exist.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dispute = getDispute(id);
  if (!dispute) {
    return NextResponse.json({ error: "dispute not found" }, { status: 404 });
  }

  // Negative test 1: no approval → refuse.
  const approval = getApproval(id);
  if (!approval) {
    console.warn(
      `[PHALANX] EXECUTE REFUSED ${id}: APPROVAL_REQUIRED — no human approval on record.`,
    );
    return NextResponse.json(
      {
        error: "APPROVAL_REQUIRED",
        detail:
          "Execute refused: no human approval exists for this dispute. Approve first.",
      },
      { status: 403 },
    );
  }

  // Approval must belong to the latest run (stale approvals refuse).
  const run = latestRun(id);
  if (!run || run.id !== approval.run_id) {
    console.warn(
      `[PHALANX] EXECUTE REFUSED ${id}: STALE_APPROVAL — approval ${approval.id} is not for the latest swarm run.`,
    );
    return NextResponse.json(
      {
        error: "STALE_APPROVAL",
        detail: "Execute refused: approval is stale (a newer swarm run exists). Re-approve.",
      },
      { status: 409 },
    );
  }

  // Negative test 2 (this run): seeded disputes are simulated — there is no
  // live PayPal dispute to act on, and live execution is out of scope until
  // step 5 / Sandbox confirmation.
  if (dispute.source === "seeded") {
    const record = {
      dispute_id: id,
      approved_action: approval.action,
      approved_by: approval.approved_by,
      approved_at: approval.approved_at,
      paypal_status: "NOT_EXECUTED",
      paypal_debug_id: null,
      idempotency_key: `${id}:${approval.action}:${approval.id}`,
      follow_up_detail_status: null,
      note: "REFUSED: seeded (SIMULATED) dispute — no live PayPal dispute exists to act on. Live execution is build step 5, after Sandbox accounts are confirmed.",
    };
    setExecution(record);
    console.warn(
      `[PHALANX] EXECUTE REFUSED ${id}: LIVE_EXECUTION_NOT_ENABLED — seeded dispute, no Sandbox execution in this run. Idempotency key ${record.idempotency_key} recorded.`,
    );
    return NextResponse.json(
      { error: "LIVE_EXECUTION_NOT_ENABLED", detail: record.note, record },
      { status: 409 },
    );
  }

  // Live Sandbox disputes: also refused in this run (no Sandbox accounts yet).
  console.warn(
    `[PHALANX] EXECUTE REFUSED ${id}: LIVE_EXECUTION_NOT_ENABLED — live execution is build step 5.`,
  );
  return NextResponse.json(
    {
      error: "LIVE_EXECUTION_NOT_ENABLED",
      detail: "Live Sandbox execution is not enabled in this run (build step 5).",
    },
    { status: 409 },
  );
}
