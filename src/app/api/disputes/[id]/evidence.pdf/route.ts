import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getArtifacts, getDispute, latestRun } from "@/lib/store";
import { buildEvidencePdf, PDF_SIZE_LIMIT_BYTES } from "@/lib/pdf";

/**
 * GET /api/disputes/{id}/evidence.pdf — evidence dossier for
 * preview/download BEFORE approval (brief §6).
 * No approval required to preview — the dossier is a review copy; the
 * actual provide-evidence call still needs approval + live Sandbox.
 * The dossier SHA-256 is returned in the x-phalanx-pdf-sha256 header
 * (hash of the final bytes, so it cannot be embedded in the PDF itself).
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
  const artifacts = getArtifacts(id);
  const run = latestRun(id) ?? null;
  const bytes = await buildEvidencePdf(dispute, artifacts, run);
  if (bytes.length > PDF_SIZE_LIMIT_BYTES) {
    return NextResponse.json(
      { error: "dossier exceeds PayPal 10 MB per-file limit" },
      { status: 500 },
    );
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="phalanx-${id}-evidence.pdf"`,
      "Content-Length": String(bytes.length),
      "x-phalanx-pdf-sha256": sha256,
      "Cache-Control": "no-store",
    },
  });
}
