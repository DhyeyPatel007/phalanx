import { NextResponse } from "next/server";
import { getDispute, latestRun } from "@/lib/store";

/** GET /api/disputes/{id}/debate — full transcript for the latest run. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dispute = getDispute(id);
  if (!dispute) {
    return NextResponse.json({ error: "dispute not found" }, { status: 404 });
  }
  const run = latestRun(id);
  if (!run) {
    return NextResponse.json({ run: null, messages: [] });
  }
  return NextResponse.json({ run, messages: run.messages });
}
