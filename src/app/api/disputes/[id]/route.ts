import { NextResponse } from "next/server";
import { getApproval, getArtifacts, getDispute, getExecution, latestRun } from "@/lib/store";

/** GET /api/disputes/{id} — detail + artifacts + latest run + approval state. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dispute = getDispute(id);
  if (!dispute) {
    return NextResponse.json({ error: "dispute not found" }, { status: 404 });
  }
  return NextResponse.json({
    dispute,
    artifacts: getArtifacts(id),
    run: latestRun(id) ?? null,
    approval: getApproval(id) ?? null,
    execution: getExecution(id) ?? null,
  });
}
