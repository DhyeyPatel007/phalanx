import { NextResponse } from "next/server";
import { allLatestRuns, listDisputes } from "@/lib/store";
import { syncLiveDisputes } from "@/lib/ingest";
import { paypalConfigured } from "@/lib/paypal";
import { computeTelemetry } from "@/lib/telemetry";

/** GET /api/disputes — ledger rows (seeded + any ingested Sandbox rows)
 *  + server-side telemetry computed ONLY from loaded disputes, latest
 *  runs, and execution records (brief §8 — no invented totals).
 *  Also returns latest_runs (one latest swarm run per dispute) so the
 *  ledger hydrates Iterations / Score / Verdict after a browser reload
 *  instead of resetting to NOT RUN (finding #7).
 *  Live-sync fallback: when PayPal is configured, live Sandbox disputes
 *  are pulled from the authenticated REST API (list + detail fetch per
 *  missing id) and merged into the ledger. A direct API read is
 *  authenticated server-to-server, so a dispute fetched this way IS
 *  verified — this replaces the old rule that live rows arrive only via
 *  webhook, which Sandbox proved dead (zero CUSTOMER.DISPUTE.CREATED
 *  deliveries in 30 days despite a correct, subscribed webhook).
 *  Fail-soft: a PayPal failure leaves the seeded rows + liveError, and
 *  the page never breaks or hangs (bounded 10s timeouts). */
export async function GET() {
  let liveError: string | null = null;
  if (paypalConfigured()) {
    const sync = await syncLiveDisputes();
    liveError = sync.liveError;
  }
  const rows = listDisputes();
  const latestRuns = Object.fromEntries(
    allLatestRuns().map((r) => [r.dispute_id, r]),
  );
  return NextResponse.json({ disputes: rows, latest_runs: latestRuns, liveError, telemetry: computeTelemetry() });
}
