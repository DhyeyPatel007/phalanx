import { NextResponse } from "next/server";
import { addRun, getDispute } from "@/lib/store";
import { runSwarm } from "@/lib/swarm";

/** POST /api/disputes/{id}/run — run the swarm (idempotent per dispute;
 *  a re-run creates a new iteration set, never overwrites history). */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dispute = getDispute(id);
  if (!dispute) {
    return NextResponse.json({ error: "dispute not found" }, { status: 404 });
  }
  const run = await runSwarm(dispute);
  addRun(run);
  return NextResponse.json({ run });
}
