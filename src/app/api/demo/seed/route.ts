import { NextResponse } from "next/server";
import { listDisputes } from "@/lib/store";

/** POST /api/demo/seed — demo-only: loads the 3 seeded scenarios.
 *  Every seeded field is SIMULATED and labelled as such in the UI. */
export async function POST() {
  const disputes = listDisputes();
  return NextResponse.json({ seeded: disputes.length, disputes });
}
