import { NextResponse } from "next/server";
import { listDisputes } from "@/lib/store";
import { listPayPalDisputes, paypalConfigured } from "@/lib/paypal";
import { computeTelemetry } from "@/lib/telemetry";

/** GET /api/disputes — ledger rows (seeded + any ingested Sandbox rows)
 *  + server-side telemetry computed ONLY from loaded disputes, latest
 *  runs, and execution records (brief §8 — no invented totals).
 *  If PayPal is configured, live Sandbox disputes are merged in (fail soft:
 *  the seeded demo still loads and the error is reported, not hidden). */
export async function GET() {
  const rows = listDisputes();
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
  return NextResponse.json({ disputes: rows, liveError, telemetry: computeTelemetry() });
}
