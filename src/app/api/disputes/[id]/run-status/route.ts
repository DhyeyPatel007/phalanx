import { NextResponse } from "next/server";
import { getDispute, getSwarmProgress, latestRun } from "@/lib/store";

/**
 * GET /api/disputes/{id}/run-status — live phase tracker state for polling.
 * Returns real phase transitions emitted by runSwarm in src/lib/swarm.ts.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dispute = getDispute(id);
  if (!dispute) {
    return NextResponse.json({ error: "dispute not found" }, { status: 404 });
  }
  const progress = getSwarmProgress(id);
  const run = latestRun(id) ?? null;
  return NextResponse.json(
    { progress, run },
    { headers: { "Cache-Control": "no-store" } },
  );
}
