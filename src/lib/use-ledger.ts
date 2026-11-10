// Shared client hook for the dispute ledger: loads /api/disputes,
// auto-seeds the demo when the ledger is empty, and hydrates runs from
// `latest_runs` (the API key — `body.runs` never exists). Used by the
// landing page and the dashboard so both show the same live data.
"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dispute, SwarmRun } from "@/lib/types";

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

export function useLedger() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [runs, setRuns] = useState<Record<string, SwarmRun>>({});
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let res = await fetch("/api/disputes");
      let body = await res.json();
      let list: Dispute[] = body.disputes ?? [];

      // Auto-load seeded demo scenarios on first load if the ledger is empty.
      if (list.length === 0) {
        const seedRes = await fetch("/api/demo/seed", { method: "POST" });
        if (seedRes.ok) {
          res = await fetch("/api/disputes");
          body = await res.json();
          list = body.disputes ?? [];
        }
      }

      setDisputes(list);
      setTelemetry(body.telemetry ?? null);
      const latestRuns = body.latest_runs ?? body.runs;
      if (latestRuns && typeof latestRuns === "object") {
        setRuns(latestRuns);
      }
      if (body.liveError) {
        setNotice(
          `Live PayPal list unavailable (seeded demo active): ${body.liveError}`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const seedDemo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/demo/seed", { method: "POST" });
      const body = await res.json();
      setDisputes(body.disputes ?? []);
      setNotice(`Seeded demo loaded: ${body.seeded} scenarios (SIMULATED).`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  return {
    disputes,
    runs,
    telemetry,
    loading,
    error,
    notice,
    setNotice,
    setError,
    refresh,
    seedDemo,
  };
}
