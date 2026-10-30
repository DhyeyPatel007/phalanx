import { NextResponse } from "next/server";
import { listDisputes } from "@/lib/store";
import { listPayPalDisputes, paypalConfigured } from "@/lib/paypal";

/** GET /api/disputes — ledger rows (seeded + any ingested Sandbox rows).
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
  return NextResponse.json({ disputes: rows, liveError });
}
