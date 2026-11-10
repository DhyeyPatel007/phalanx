// 4-card Bento KPI strip (Gemini directive §3.3 — NEW labels replace
// the previous strip's labels). Every metric is computed ONLY from the
// disputes + runs actually loaded — nothing hardcoded, nothing invented.
// Card 2 shows Case A's base → final progression from its latest run
// when one exists (pre-run it honestly shows "—" and asks for a run).
// Card 3 compresses the latest run's raw debate messages into its
// practical-reason count. Card 4 counts loaded disputes with a
// downloadable PDF dossier and links the active case's dossier.
// Verdict bands are the locked 35/75 thresholds.
"use client";

import { useMemo } from "react";
import { useAnimatedNumber } from "@/lib/use-animated-number";
import { AnimatedCounter, SpotlightCard } from "./ui/micro-interactions";
import type { Dispute, SwarmRun } from "@/lib/types";

export default function BentoKpis({
  disputes,
  runs,
  executionsSucceeded,
  activeCaseId,
}: {
  disputes: Dispute[];
  runs: Record<string, SwarmRun>;
  executionsSucceeded: number;
  activeCaseId?: string;
}) {
  const total = disputes.reduce(
    (s, d) => s + (parseFloat(d.amount.value) || 0),
    0,
  );
  const animatedTotal = useAnimatedNumber(total, 600);

  // Breakdown: NOT_RECEIVED vs NOT_AS_DESCRIBED (by dispute principal).
  const notReceived = disputes
    .filter((d) => d.reason === "MERCHANDISE_OR_SERVICE_NOT_RECEIVED")
    .reduce((s, d) => s + (parseFloat(d.amount.value) || 0), 0);
  const notAsDescribed = disputes
    .filter((d) => d.reason === "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED")
    .reduce((s, d) => s + (parseFloat(d.amount.value) || 0), 0);
  const nrPct = total > 0 ? (notReceived / total) * 100 : 0;

  // Card 2 — Case A (PP-D-88412) progression from its latest run.
  const caseARun = runs["PP-D-88412"];
  const caseABase = caseARun?.base_score;
  const caseAFinal = caseARun?.score;

  // Card 3 — latest run across loaded disputes (most recent first).
  const latestRun = useMemo(() => {
    const list = Object.values(runs);
    if (list.length === 0) return null;
    return list.sort((a, b) =>
      (b.created_at ?? "").localeCompare(a.created_at ?? ""),
    )[0];
  }, [runs]);
  const rawNotes = latestRun?.messages?.length ?? 0;
  const practicalCount = latestRun?.practical_reasons?.length ?? 0;

  // Card 4 — every loaded dispute has a downloadable PDF dossier.
  const dossiers = disputes.length;
  const animatedDossiers = Math.round(useAnimatedNumber(dossiers, 600));
  const activeId = activeCaseId ?? disputes[0]?.id;

  return (
    <section className="bento-kpis bento-kpis-new" aria-label="Dispute metrics">
      <SpotlightCard className="bento-tile">
        <div className="bento-label">Total Disputed Volume</div>
        <div className="bento-value">
          <AnimatedCounter value={animatedTotal} prefix="$" decimals={2} />
        </div>
        <div className="bento-sub">
          across {disputes.length} loaded case
          {disputes.length === 1 ? "" : "s"} · sum of dispute principal
        </div>
        <div className="bento-breakdown" aria-hidden="true">
          <div
            className="bento-breakdown-nr"
            style={{ width: `${nrPct}%` }}
            title={`NOT_RECEIVED $${notReceived.toFixed(2)}`}
          />
          <div
            className="bento-breakdown-nad"
            style={{ width: `${100 - nrPct}%` }}
            title={`NOT_AS_DESCRIBED $${notAsDescribed.toFixed(2)}`}
          />
        </div>
        <div className="bento-breakdown-legend">
          <span>
            <i className="bento-legend-dot nr" /> NOT_RECEIVED $
            {notReceived.toFixed(2)}
          </span>
          <span>
            <i className="bento-legend-dot nad" /> NOT_AS_DESCRIBED $
            {notAsDescribed.toFixed(2)}
          </span>
        </div>
      </SpotlightCard>

      <SpotlightCard className="bento-tile">
        <div className="bento-label">Deterministic Contest Score</div>
        <div className="bento-value">
          {caseARun && caseABase !== undefined && caseAFinal !== undefined ? (
            <>
              <AnimatedCounter value={caseABase} />{" "}
              <span className="bento-arrow">→</span>{" "}
              <AnimatedCounter value={caseAFinal} />
            </>
          ) : (
            "—"
          )}
        </div>
        <div className="bento-sub">
          {caseARun
            ? `Case A (PP-D-88412) base → final checklist score · contest threshold ≥75 pts`
            : `Case A (PP-D-88412) — no swarm run yet. Run the swarm to see the base → final progression. Contest threshold ≥75 pts.`}
        </div>
        <div className="bento-bar" aria-hidden="true">
          <div
            className="bento-fill"
            style={{
              width:
                caseAFinal !== undefined ? `${caseAFinal}%` : "0%",
            }}
          />
        </div>
      </SpotlightCard>

      <SpotlightCard className="bento-tile">
        <div className="bento-label">Juror Noise Compression</div>
        <div className="bento-value">
          {latestRun ? (
            <>
              <AnimatedCounter value={rawNotes} />{" "}
              <span className="bento-arrow">→</span>{" "}
              <AnimatedCounter value={practicalCount} />
            </>
          ) : (
            "—"
          )}
        </div>
        <div className="bento-sub">
          {latestRun
            ? `~${rawNotes} raw debate notes → ${practicalCount} practical reason${practicalCount === 1 ? "" : "s"} (latest run, ${latestRun.dispute_id})`
            : "No swarm run yet — run the swarm to collapse juror notes into practical reasons."}
        </div>
        <div className="bento-bar" aria-hidden="true">
          <div
            className="bento-fill"
            style={{
              width:
                rawNotes > 0
                  ? `${Math.max(8, (practicalCount / rawNotes) * 100)}%`
                  : "0%",
            }}
          />
        </div>
      </SpotlightCard>

      <SpotlightCard className="bento-tile">
        <div className="bento-label">Cryptographic PDF Dossiers</div>
        <div className="bento-value">
          <AnimatedCounter value={animatedDossiers} />
        </div>
        <div className="bento-sub">
          SHA-256 Verified · Multi-Exhibit PDF · {executionsSucceeded}{" "}
          Sandbox execution{executionsSucceeded === 1 ? "" : "s"} succeeded
        </div>
        {activeId && (
          <a
            className="bento-download"
            href={`/api/disputes/${activeId}/evidence.pdf`}
            target="_blank"
            rel="noreferrer"
          >
            Download {activeId} dossier ↗
          </a>
        )}
      </SpotlightCard>
    </section>
  );
}
