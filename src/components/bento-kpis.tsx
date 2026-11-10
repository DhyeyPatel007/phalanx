// 4-card Bento KPI strip with animated number counters (directive
// Section 3, exact labels). Every metric is computed ONLY from the
// disputes + runs actually loaded — nothing hardcoded, nothing invented.
// Counts animate 0 -> value with useAnimatedNumber (600ms, rAF); each
// tile has a hover-fill segmented bar. "Deterministic Win/Contest Rate"
// is the share of loaded disputes routed to CONTEST by the deterministic
// checklist (score >=75) — a routing share, explicitly NOT a predicted
// win rate. "Cryptographic Dossiers Ready" counts loaded disputes with a
// downloadable PDF dossier (every loaded dispute has one — the 5-page
// dossier with SHA-256 manifest).
"use client";

import { useAnimatedNumber } from "@/lib/use-animated-number";
import type { Dispute, SwarmRun } from "@/lib/types";

function useCount(value: number): number {
  return Math.round(useAnimatedNumber(value, 600));
}

export default function BentoKpis({
  disputes,
  runs,
  executionsSucceeded,
}: {
  disputes: Dispute[];
  runs: Record<string, SwarmRun>;
  executionsSucceeded: number;
}) {
  const total = disputes.reduce(
    (s, d) => s + (parseFloat(d.amount.value) || 0),
    0,
  );
  const animatedTotal = useAnimatedNumber(total, 600);
  const runList = Object.values(runs);
  // Loaded disputes routed to CONTEST: latest run score >=75.
  const contested = disputes.filter(
    (d) => runs[d.id] && runs[d.id].score >= 75,
  ).length;
  const contestRate =
    disputes.length > 0 ? (contested / disputes.length) * 100 : 0;
  const animatedRate = useAnimatedNumber(contestRate, 600);
  const queue = runList.filter((r) => r.status === "RUNNING").length;
  const animatedQueue = useCount(queue);
  // Every loaded dispute has a downloadable PDF dossier.
  const dossiers = disputes.length;
  const animatedDossiers = useCount(dossiers);

  const tiles = [
    {
      label: "Total Disputed Exposure",
      value: `$${animatedTotal.toFixed(2)}`,
      sub: `across ${disputes.length} loaded case${disputes.length === 1 ? "" : "s"} · sum of dispute principal`,
      fillPct: Math.min(100, Math.max(12, (disputes.length / 5) * 100)),
    },
    {
      label: "Deterministic Win/Contest Rate",
      value: `${Math.round(animatedRate)}%`,
      sub: `${contested} of ${disputes.length} loaded case${disputes.length === 1 ? "" : "s"} routed to CONTEST (score ≥75) — deterministic checklist routing share, not a predicted win rate`,
      fillPct: Math.min(100, Math.max(contestRate, 0)),
    },
    {
      label: "Active Swarm Queue",
      value: `${animatedQueue}`,
      sub: "swarm runs in progress right now",
      fillPct: Math.min(100, queue * 25),
    },
    {
      label: "Cryptographic Dossiers Ready",
      value: `${animatedDossiers}`,
      sub: `loaded disputes with a downloadable 5-page PDF dossier (SHA-256 manifest) · ${executionsSucceeded} Sandbox execution${executionsSucceeded === 1 ? "" : "s"} succeeded`,
      fillPct:
        disputes.length > 0
          ? Math.min(100, Math.max(12, (dossiers / disputes.length) * 100))
          : 0,
    },
  ];

  return (
    <section className="bento-kpis" aria-label="Dispute metrics">
      {tiles.map((t) => (
        <div key={t.label} className="bento-tile spotlight lift">
          <div className="bento-label">{t.label}</div>
          <div className="bento-value tabular-nums font-mono">{t.value}</div>
          <div className="bento-sub">{t.sub}</div>
          <div className="bento-bar" aria-hidden="true">
            <div
              className="bento-fill"
              style={{ width: `${t.fillPct}%` }}
            />
          </div>
        </div>
      ))}
    </section>
  );
}
