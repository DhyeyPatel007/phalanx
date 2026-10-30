import { NextResponse } from "next/server";
import { getDispute, latestRun, setApproval } from "@/lib/store";
import { actionForVerdict } from "@/lib/scorer";

/**
 * POST /api/disputes/{id}/approve — human approval gate (brief §5/§6).
 * Records approver = "demo merchant" + the exact action + amounts approved.
 * Required before execution. Approval is tied to the latest swarm run.
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
  const run = latestRun(id);
  if (!run) {
    return NextResponse.json(
      { error: "no swarm run yet — run the swarm before approving" },
      { status: 409 },
    );
  }
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    offer_amount?: { currency_code: string; value: string };
  };
  const action = body.action ?? actionForVerdict(run.verdict);

  // The verdict's action must be allowed on the dispute (live list for
  // Sandbox rows; SIMULATED list for seeded rows).
  if (!dispute.allowed_actions.includes(action)) {
    return NextResponse.json(
      {
        error: `action ${action} is not allowed on this dispute`,
        allowed_actions: dispute.allowed_actions,
      },
      { status: 409 },
    );
  }

  const approval = {
    id: `appr-${id}-${Date.now()}`,
    dispute_id: id,
    action,
    offer_amount: body.offer_amount,
    approved_by: "demo merchant",
    approved_at: new Date().toISOString(),
    run_id: run.id,
  };
  setApproval(approval);
  return NextResponse.json({ approval });
}
