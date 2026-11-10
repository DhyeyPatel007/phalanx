import { NextResponse } from "next/server";
import { addRun, getDispute } from "@/lib/store";
import { ensureLiveDispute } from "@/lib/ingest";
import { runSwarm } from "@/lib/swarm";

/** POST /api/disputes/{id}/run — run the swarm (idempotent per dispute;
 *  a re-run creates a new iteration set, never overwrites history).
 *  Live-sync fallback: a live dispute not yet in the store is pulled
 *  from PayPal on demand (fail-soft) before returning 404. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dispute = getDispute(id) ?? (await ensureLiveDispute(id));
  if (!dispute) {
    return NextResponse.json({ error: "dispute not found" }, { status: 404 });
  }
  const run = await runSwarm(dispute);
  addRun(run);
  return NextResponse.json({ run });
}
