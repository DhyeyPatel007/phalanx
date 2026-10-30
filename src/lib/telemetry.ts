// Telemetry — brief §8. Every number is computed ONLY from loaded disputes,
// latest runs, and execution records. No invented totals.
// - Total disputed volume: sum of loaded dispute amounts.
// - Capital saved: amount retained on contested disputes where evidence was
//   accepted in Sandbox (paypal_status EXECUTED + action provide-evidence).
//   $0 until a Sandbox execution succeeds.
// - Fees avoided: $15 (US Standard Dispute Fee, Oct 1 2026 schedule) per
//   dispute where evidence was accepted in Sandbox. $0 until then.
// - Avg swarm resolution time: mean of latest runs' duration_ms ("demo run
//   time" — never compared to an unsourced manual figure).

import { STANDARD_DISPUTE_FEE_USD } from "./scorer";
import { allLatestRuns, listDisputes, listExecutions } from "./store";

export interface Telemetry {
  total_volume_usd: number;
  capital_saved_usd: number;
  fees_avoided_usd: number;
  fee_basis: string;
  avg_run_ms: number | null;
  disputes_loaded: number;
  runs_completed: number;
  executions_succeeded: number;
}

export function computeTelemetry(): Telemetry {
  const disputes = listDisputes();
  const runs = allLatestRuns();
  const executions = listExecutions();

  const totalVolume = disputes.reduce((s, d) => s + parseFloat(d.amount.value), 0);

  // Evidence accepted in Sandbox = an EXECUTED provide-evidence record.
  const accepted = executions.filter(
    (e) => e.paypal_status === "EXECUTED" && e.approved_action === "provide-evidence",
  );
  const amountById = new Map(disputes.map((d) => [d.id, parseFloat(d.amount.value)]));
  const capitalSaved = accepted.reduce((s, e) => s + (amountById.get(e.dispute_id) ?? 0), 0);
  const feesAvoided = accepted.length * STANDARD_DISPUTE_FEE_USD;

  const durations = runs.map((r) => r.duration_ms);
  const avgRunMs =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

  return {
    total_volume_usd: +totalVolume.toFixed(2),
    capital_saved_usd: +capitalSaved.toFixed(2),
    fees_avoided_usd: +feesAvoided.toFixed(2),
    fee_basis:
      "US Standard Dispute Fee $15 (PayPal merchant fee schedule, last updated Oct 1, 2026). High-volume $30 / chargeback $20 are separate routes.",
    avg_run_ms: avgRunMs,
    disputes_loaded: disputes.length,
    runs_completed: runs.length,
    executions_succeeded: accepted.length,
  };
}
