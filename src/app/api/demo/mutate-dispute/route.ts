import { NextResponse } from "next/server";
import {
  addArtifacts,
  getDispute,
  setAllowedResponseOptions,
  setArtifacts,
} from "@/lib/store";
import type { EvidenceArtifact } from "@/lib/types";

/**
 * POST /api/demo/mutate-dispute — demo/test harness ONLY, seeded disputes
 * only. Lets the negative-test suite prove two gates that need a state
 * change between approve and execute:
 *  - replace allowed_response_options (finding #7: execute must re-check
 *    offer/accept types at execution time, not trust the approve-time
 *    check), and
 *  - append artifacts (finding #3: a merchant record with non-WinAnsi
 *    characters must still render a PDF instead of crashing the route).
 * Body: { dispute_id, allowed_response_options?, add_artifacts?: [{ kind, summary }], set_artifacts?: [{ kind, summary }] }.
 * Refuses non-seeded disputes — live rows come from PayPal only. Never
 * executes anything against PayPal.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    dispute_id?: string;
    allowed_response_options?: {
      make_offer?: { offer_types: string[] };
      accept_claim?: { accept_claim_types: string[] };
    };
    add_artifacts?: { kind: string; summary: string }[];
    set_artifacts?: { kind: string; summary: string }[];
  };
  const disputeId = body.dispute_id;
  if (!disputeId) {
    return NextResponse.json({ error: "dispute_id is required" }, { status: 400 });
  }
  const dispute = getDispute(disputeId);
  if (!dispute) {
    return NextResponse.json({ error: "dispute not found" }, { status: 404 });
  }
  if (dispute.source !== "seeded") {
    return NextResponse.json(
      { error: "mutate-dispute is demo-only and refuses live (sandbox) disputes" },
      { status: 403 },
    );
  }

  if (body.allowed_response_options !== undefined) {
    setAllowedResponseOptions(disputeId, body.allowed_response_options);
  }
  if (Array.isArray(body.add_artifacts) && body.add_artifacts.length > 0) {
    const stamp = Date.now();
    const list: EvidenceArtifact[] = body.add_artifacts.map((a, i) => ({
      id: `${disputeId}-test${stamp}-${i + 1}`,
      dispute_id: disputeId,
      kind: a.kind as EvidenceArtifact["kind"],
      source: "merchant-test",
      summary: a.summary,
      simulated: true,
    }));
    addArtifacts(list);
  }
  if (Array.isArray(body.set_artifacts)) {
    // Replace the whole artifact list (test harness: lets a test put a
    // hostile-Unicode tracking summary in the slot the PDF actually draws).
    const list: EvidenceArtifact[] = body.set_artifacts.map((a, i) => ({
      id: `${disputeId}-test-${i + 1}`,
      dispute_id: disputeId,
      kind: a.kind as EvidenceArtifact["kind"],
      source: "merchant-test",
      summary: a.summary,
      simulated: true,
    }));
    setArtifacts(disputeId, list);
  }

  return NextResponse.json({ dispute: getDispute(disputeId), demo: true });
}
