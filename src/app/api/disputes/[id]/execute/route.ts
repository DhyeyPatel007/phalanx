import { NextResponse } from "next/server";
import { getApproval, getDispute, getExecution, latestRun, setExecution } from "@/lib/store";
import { checkOfferAcceptTypes, stageGate } from "@/lib/arbiter";

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
  req: Request,
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

  // Stage gate (Phase 0 row 4): the dispute must be waiting for the seller.
  const gate = stageGate(dispute);
  if (!gate.ok) {
    console.warn(
      `[PHALANX] EXECUTE REFUSED ${id}: STAGE_BLOCKED — ${gate.blocker}`,
    );
    return NextResponse.json(
      {
        error: "STAGE_BLOCKED",
        detail: gate.blocker,
        allowed_actions: dispute.allowed_actions,
      },
      { status: 409 },
    );
  }

  // Disallowed-action check: the approved action must still be allowed on
  // the live dispute. Refuses WITH the allowed list shown.
  if (!dispute.allowed_actions.includes(approval.action)) {
    console.warn(
      `[PHALANX] EXECUTE REFUSED ${id}: DISALLOWED_ACTION — approved ${approval.action} is not in allowed actions [${dispute.allowed_actions.join(", ")}].`,
    );
    return NextResponse.json(
      {
        error: "DISALLOWED_ACTION",
        detail: `Execute refused: approved action (${approval.action}) is not allowed on this dispute.`,
        allowed_actions: dispute.allowed_actions,
      },
      { status: 409 },
    );
  }

  // Offer/accept TYPE re-check: approve verified the type, but the live
  // dispute's allowed_response_options may have changed since (finding #7).
  // Re-check at execution time; a type the live response now excludes
  // refuses, same as a disallowed action.
  const typeError = checkOfferAcceptTypes(dispute, approval.action);
  if (typeError) {
    console.warn(
      `[PHALANX] EXECUTE REFUSED ${id}: DISALLOWED_ACTION_TYPE — ${typeError}`,
    );
    return NextResponse.json(
      {
        error: "DISALLOWED_ACTION",
        detail: `Execute refused: ${typeError}`,
        allowed_response_options: dispute.allowed_response_options,
      },
      { status: 409 },
    );
  }

  // Action-mismatch check (adopted from Gemini package review): if the
  // caller names an action, it must be the approved one.
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action && body.action !== approval.action) {
    console.warn(
      `[PHALANX] EXECUTE REFUSED ${id}: ACTION_MISMATCH — approved ${approval.action}, requested ${body.action}.`,
    );
    return NextResponse.json(
      {
        error: "ACTION_MISMATCH",
        detail: `Execute refused: approved action (${approval.action}) does not match requested execution (${body.action}).`,
      },
      { status: 409 },
    );
  }

  // Duplicate-execution check (idempotency key = dispute + action + approval).
  const existing = getExecution(id);
  if (existing && existing.paypal_status === "EXECUTED") {
    console.warn(
      `[PHALANX] EXECUTE REFUSED ${id}: DUPLICATE_EXECUTION — idempotency key ${existing.idempotency_key} already executed.`,
    );
    return NextResponse.json(
      {
        error: "DUPLICATE_EXECUTION",
        detail: `Execute refused: idempotency key ${existing.idempotency_key} has already been executed.`,
      },
      { status: 409 },
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
