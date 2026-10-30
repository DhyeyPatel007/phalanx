import { NextResponse } from "next/server";
import { getDispute, latestRun, setApproval } from "@/lib/store";
import { actionForVerdict } from "@/lib/scorer";
import {
  checkOfferAcceptTypes,
  resolveAction,
  stageGate,
} from "@/lib/arbiter";

/**
 * POST /api/disputes/{id}/approve — human approval gate (brief §5/§6).
 * Records approver = "demo merchant" + the exact action + amounts approved.
 * Required before execution. Approval is tied to the latest swarm run.
 *
 * make-offer: default offer is 40% of the dispute amount (Scenario B);
 * the human may pass a different offer_amount, which must be > 0 and
 * <= the dispute amount. The offer type is REFUND (buyer keeps the item).
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

  // Stage gate (Phase 0 row 4): actions open only at WAITING_FOR_SELLER_RESPONSE.
  const gate = stageGate(dispute);
  if (!gate.ok) {
    return NextResponse.json(
      {
        error: "STAGE_BLOCKED",
        detail: gate.blocker,
        allowed_actions: dispute.allowed_actions,
      },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    offer_amount?: { currency_code: string; value: string };
  };
  const action = body.action ?? actionForVerdict(run.verdict);

  // The verdict's action must be allowed on the dispute (live list for
  // Sandbox rows; SIMULATED list for seeded rows). A disallowed action
  // refuses WITH the live allowed list shown + a downgrade suggestion.
  if (!dispute.allowed_actions.includes(action)) {
    const { action: suggested, blocker } = resolveAction(dispute, run.verdict);
    return NextResponse.json(
      {
        error: `action ${action} is not allowed on this dispute`,
        allowed_actions: dispute.allowed_actions,
        suggested_action: suggested,
        detail: blocker,
      },
      { status: 409 },
    );
  }

  // Offer/accept TYPE check (allowed_response_options). Checked only when
  // the dispute carries that data; absent means "cannot verify".
  const typeError = checkOfferAcceptTypes(dispute, action);
  if (typeError) {
    return NextResponse.json(
      { error: typeError, allowed_response_options: dispute.allowed_response_options },
      { status: 409 },
    );
  }

  // make-offer amount: default 40% of the dispute amount; human-editable,
  // must be > 0 and <= the dispute amount.
  let offerAmount = body.offer_amount;
  if (action === "make-offer") {
    const amount = parseFloat(dispute.amount.value);
    if (!offerAmount) {
      offerAmount = {
        currency_code: dispute.amount.currency_code,
        value: (amount * 0.4).toFixed(2),
      };
    } else {
      const v = parseFloat(offerAmount.value);
      if (!Number.isFinite(v) || v <= 0 || v > amount) {
        return NextResponse.json(
          {
            error: `offer_amount must be > 0 and <= dispute amount $${amount.toFixed(2)}`,
            offer_amount: offerAmount,
          },
          { status: 400 },
        );
      }
    }
  }

  const approval = {
    id: `appr-${id}-${Date.now()}`,
    dispute_id: id,
    action,
    offer_amount: offerAmount,
    approved_by: "demo merchant",
    approved_at: new Date().toISOString(),
    run_id: run.id,
  };
  setApproval(approval);
  return NextResponse.json({ approval });
}
