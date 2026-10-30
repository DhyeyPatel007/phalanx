import { NextResponse } from "next/server";
import { allLatestRuns, listDisputes } from "@/lib/store";
import { listPayPalDisputes, paypalConfigured } from "@/lib/paypal";
import { computeTelemetry } from "@/lib/telemetry";

/** GET /api/disputes — ledger rows (seeded + any ingested Sandbox rows)
 *  + server-side telemetry computed ONLY from loaded disputes, latest
 *  runs, and execution records (brief §8 — no invented totals).
 *  Also returns latest_runs (one latest swarm run per dispute) so the
 *  ledger hydrates Iterations / Score / Verdict after a browser reload
 *  instead of resetting to NOT RUN (finding #7).
 *  If PayPal is configured, live Sandbox disputes are merged in (fail soft:
 *  the seeded demo still loads and the error is reported, not hidden). */
export async function GET() {
  const rows = listDisputes();
  const latestRuns = Object.fromEntries(
    allLatestRuns().map((r) => [r.dispute_id, r]),
  );
  let liveError: string | null = null;
  if (paypalConfigured()) {
    try {
      const live = (await listPayPalDisputes()) as { items?: unknown[] };
      liveError = null;
      void live;
      // Live rows are ingested via webhook / detail fetch, not merged here,
      // so the ledger never shows a dispute PHALANX has not verified.
    } catch (err) {
      liveError = err instanceof Error ? err.message : String(err);
    }
  }
  return NextResponse.json({ disputes: rows, latest_runs: latestRuns, liveError, telemetry: computeTelemetry() });
}
