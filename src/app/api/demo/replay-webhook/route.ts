import { NextResponse } from "next/server";
import { ingestVerifiedEvent } from "@/lib/ingest";
import { getDispute } from "@/lib/store";

/**
 * POST /api/demo/replay-webhook — demo-only: replays a stored
 * CUSTOMER.DISPUTE.CREATED payload for a seeded dispute, without needing
 * a live webhook. This is a local demo path: it does NOT verify a signature
 * (there is no PayPal signature on a stored payload) and it NEVER executes
 * anything against PayPal. Body: { "dispute_id": "PP-D-88412" }.
 * An optional "event_id" may be supplied (used by the negative-test suite
 * to prove duplicate events dedupe: the second replay of the same id is
 * ignored with no second run).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { dispute_id?: string; event_id?: string };
  const disputeId = body.dispute_id ?? "PP-D-88412";
  const dispute = getDispute(disputeId);
  if (!dispute) {
    return NextResponse.json({ error: "dispute not found" }, { status: 404 });
  }

  const payload = {
    id: body.event_id ?? `WH-REPLAY-${disputeId}-${Date.now()}`,
    event_version: "1.0",
    create_time: new Date().toISOString(),
    event_type: "CUSTOMER.DISPUTE.CREATED",
    resource_type: "dispute",
    summary: `A dispute was created for ${disputeId} (DEMO REPLAY — no live PayPal event)`,
    resource: {
      dispute_id: dispute.id,
      reason: dispute.reason,
      dispute_amount: {
        currency_code: dispute.amount.currency_code,
        value: dispute.amount.value,
      },
      dispute_life_cycle_stage: dispute.dispute_life_cycle_stage,
      status: dispute.status,
    },
  };

  const result = await ingestVerifiedEvent(payload, { demo: true });
  return NextResponse.json({ payload, result, demo: true });
}
