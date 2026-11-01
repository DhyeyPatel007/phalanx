"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
} from "ag-grid-community";
import type {
  Dispute,
  SwarmRun,
  Verdict,
} from "@/lib/types";

ModuleRegistry.registerModules([AllCommunityModule]);

const phalanxLightGridTheme = themeQuartz.withParams({
  backgroundColor: "#FFFFFF",
  foregroundColor: "#101828",
  headerBackgroundColor: "#F9FAFB",
  headerTextColor: "#475467",
  borderColor: "rgba(16, 24, 40, 0.08)",
  rowHoverColor: "#F4F6FB",
  selectedRowBackgroundColor: "rgba(111, 61, 255, 0.08)",
  accentColor: "#6F3DFF",
  fontFamily: "var(--font-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSize: 13,
  headerFontSize: 12,
  headerFontWeight: 600,
  borderRadius: 0,
  wrapperBorderRadius: 12,
});

type TabSection = "disputes" | "runs" | "dossiers" | "settings";

interface Row {
  id: string;
  reason: string;
  amount: string;
  iterations: number;
  score: number | null;
  verdict: Verdict | null;
  status: string;
  source: string;
}

interface Telemetry {
  total_volume_usd: number;
  capital_saved_usd: number;
  fees_avoided_usd: number;
  fee_basis: string;
  avg_run_ms: number | null;
  disputes_loaded: number;
  runs_completed: number;
  executions_succeeded: number;
}

function verdictBadge(v: Verdict | null) {
  if (!v) return <span className="badge na">NOT RUN</span>;
  const cls =
    v === "CONTEST_HARD_PROOF"
      ? "contest"
      : v === "DE_ESCALATE_OFFER"
        ? "offer"
        : "concede";
  return <span className={`badge ${cls}`}>{v}</span>;
}

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabSection>("disputes");
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [runs, setRuns] = useState<Record<string, SwarmRun>>({});
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const gridRef = useRef<AgGridReact<Row> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let res = await fetch("/api/disputes");
      let body = await res.json();
      let list: Dispute[] = body.disputes ?? [];

      // Auto-load seeded demo scenarios on first load if the ledger is empty
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
      if (body.runs && typeof body.runs === "object") {
        setRuns(body.runs);
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
    refresh();
  }, [refresh]);

  const seedDemo = async () => {
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
  };

  const rows: Row[] = useMemo(
    () =>
      disputes.map((d) => {
        const run = runs[d.id];
        return {
          id: d.id,
          reason: d.reason,
          amount: `$${parseFloat(d.amount.value).toFixed(2)} USD`,
          iterations: run ? run.iterations.length : 0,
          score: run ? run.score : null,
          verdict: run ? run.verdict : null,
          status: d.status,
          source: d.source === "seeded" ? "Seeded — SIMULATED" : "Sandbox",
        };
      }),
    [disputes, runs],
  );

  const totalVolume = telemetry
    ? telemetry.total_volume_usd
    : disputes.reduce((s, d) => s + parseFloat(d.amount.value), 0);
  const runDurations = Object.values(runs).map((r) => r.duration_ms);
  const avgRunMs =
    telemetry?.avg_run_ms ??
    (runDurations.length > 0
      ? Math.round(runDurations.reduce((a, b) => a + b, 0) / runDurations.length)
      : null);
  const capitalSaved = telemetry ? telemetry.capital_saved_usd : 0;
  const feesAvoided = telemetry ? telemetry.fees_avoided_usd : 0;

  const columns: ColDef<Row>[] = [
    {
      field: "id",
      headerName: "Dispute ID",
      minWidth: 150,
      flex: 1.1,
      sortable: true,
      filter: true,
      cellRenderer: (p: { value: string }) => (
        <Link href={`/disputes/${p.value}`} className="grid-link font-mono">
          {p.value}
        </Link>
      ),
    },
    {
      field: "reason",
      headerName: "Reason Code",
      minWidth: 230,
      flex: 1.8,
      sortable: true,
      filter: true,
    },
    {
      field: "amount",
      headerName: "Amount",
      minWidth: 130,
      flex: 1.0,
      sortable: true,
      cellStyle: { textAlign: "right" },
      headerClass: "ag-right-aligned-header",
      cellRenderer: (p: { value: string }) => (
        <span className="tabular-nums font-mono">{p.value}</span>
      ),
    },
    {
      field: "iterations",
      headerName: "Iterations",
      minWidth: 100,
      flex: 0.8,
      sortable: true,
      cellStyle: { textAlign: "right" },
      headerClass: "ag-right-aligned-header",
      cellRenderer: (p: { value: number }) => (
        <span className="tabular-nums font-mono">{p.value}</span>
      ),
    },
    {
      field: "score",
      headerName: "Checklist Score",
      minWidth: 130,
      flex: 1.1,
      sortable: true,
      cellStyle: { textAlign: "right" },
      headerClass: "ag-right-aligned-header",
      cellRenderer: (p: { value: number | null }) =>
        p.value === null ? (
          <span style={{ color: "var(--text-muted)" }}>—</span>
        ) : (
          <span className="tabular-nums font-mono" style={{ fontWeight: 600 }}>
            {p.value}/100
          </span>
        ),
    },
    {
      field: "verdict",
      headerName: "Verdict",
      minWidth: 160,
      flex: 1.4,
      sortable: true,
      cellRenderer: (p: { value: Verdict | null }) => verdictBadge(p.value),
    },
    {
      field: "status",
      headerName: "PayPal Status",
      minWidth: 140,
      flex: 1.2,
      sortable: true,
      filter: true,
    },
    {
      field: "source",
      headerName: "Source",
      minWidth: 150,
      flex: 1.2,
      sortable: true,
      filter: true,
      cellRenderer: (p: { value: string }) => (
        <span
          className={`chip ${p.value.includes("Seeded") ? "sim" : ""}`}
          style={{ fontSize: 11.5, padding: "2px 8px" }}
        >
          {p.value}
        </span>
      ),
    },
  ];

  return (
    <div>
      {/* Benchmark: Floating Pill Navigation */}
      <div className="floating-nav-wrap">
        <header className="floating-nav">
          <div className="brand-cluster">
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="brand-mark">P</span>
              <span>PHALANX</span>
            </Link>
            <span className="chip ultraviolet">PayPal Sandbox</span>
          </div>

          <nav className="nav-links" aria-label="Workbench navigation">
            <Link href="/" className="nav-link">
              Overview
            </Link>
            <button
              type="button"
              className={`nav-link ${activeTab === "disputes" ? "active" : ""}`}
              onClick={() => setActiveTab("disputes")}
            >
              Disputes ({disputes.length})
            </button>
            <button
              type="button"
              className={`nav-link ${activeTab === "runs" ? "active" : ""}`}
              onClick={() => setActiveTab("runs")}
            >
              Swarm Runs ({Object.keys(runs).length})
            </button>
            <button
              type="button"
              className={`nav-link ${activeTab === "dossiers" ? "active" : ""}`}
              onClick={() => setActiveTab("dossiers")}
            >
              Dossiers
            </button>
            <button
              type="button"
              className={`nav-link ${activeTab === "settings" ? "active" : ""}`}
              onClick={() => setActiveTab("settings")}
            >
              Safety Policy
            </button>
            <Link href="/guide" className="nav-link">
              Guide ↗
            </Link>
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={refresh} disabled={loading} style={{ fontSize: 13, padding: "6px 14px" }}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button className="primary" onClick={seedDemo} style={{ fontSize: 13, padding: "6px 14px" }}>
              Load seeded demo
            </button>
          </div>
        </header>
      </div>

      <main className="workbench-wrap">
        {/* Mandatory Honesty Callout — Always Visible */}
        <div className="callout simulated">
          <span>
            <b>SIMULATED DATA</b> — seeded disputes are demo scenarios, not real buyers or funds.
            Checklist scores are an internal heuristic, NOT a win probability. Sandbox only; human approval is mandatory.
          </span>
          <span className="chip sim">3 Seeded Scenarios</span>
        </div>

        {notice && (
          <div className="callout notice">
            <span>{notice}</span>
            <button
              onClick={() => setNotice(null)}
              style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
            >
              ✕
            </button>
          </div>
        )}
        {error && <div className="callout error">Error: {error}</div>}

        {/* 4 Vercel-Style Usage Meter Bars (KPI Discipline) */}
        <section className="grid-2" style={{ gap: 16 }} aria-label="Usage Meters">
          {/* Meter 1: Total Volume */}
          <div className="meter-card">
            <div className="meter-header">
              <span>TOTAL DISPUTED VOLUME</span>
              <span className="font-mono tabular-nums">{disputes.length} Disputes Active</span>
            </div>
            <div className="meter-value-large tabular-nums font-mono">
              ${totalVolume.toFixed(2)} <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-muted)" }}>USD</span>
            </div>
            <div className="meter-track">
              <div
                className="meter-fill"
                style={{ width: `${Math.min(100, Math.max(15, (disputes.length / 5) * 100))}%` }}
              />
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              Sum of loaded dispute principal across the active ledger.
            </div>
          </div>

          {/* Meter 2: Capital Defended */}
          <div className="meter-card">
            <div className="meter-header">
              <span>CAPITAL DEFENDED</span>
              <span className="font-mono tabular-nums">
                {totalVolume > 0 ? Math.round((capitalSaved / totalVolume) * 100) : 0}% Defended
              </span>
            </div>
            <div className="meter-value-large tabular-nums font-mono">
              ${capitalSaved.toFixed(2)} <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-muted)" }}>USD</span>
            </div>
            <div className="meter-track">
              <div
                className="meter-fill"
                style={{
                  width: `${totalVolume > 0 ? Math.min(100, (capitalSaved / totalVolume) * 100) : 0}%`,
                }}
              />
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              Counts confirmed Sandbox executions; stays $0 on unexecuted demo runs.
            </div>
          </div>

          {/* Meter 3: Dispute Fees Avoided */}
          <div className="meter-card">
            <div className="meter-header">
              <span>DISPUTE FEES AVOIDED</span>
              <span className="font-mono tabular-nums">US Standard $15/case</span>
            </div>
            <div className="meter-value-large tabular-nums font-mono">
              ${feesAvoided.toFixed(2)} <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-muted)" }}>USD</span>
            </div>
            <div className="meter-track">
              <div
                className="meter-fill"
                style={{ width: `${Math.min(100, (feesAvoided / 45) * 100)}%` }}
              />
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              Oct 1, 2026 fee schedule standard basis; $0 until execution succeeds.
            </div>
          </div>

          {/* Meter 4: Avg Swarm Duration */}
          <div className="meter-card">
            <div className="meter-header">
              <span>AVG SWARM DURATION</span>
              <span className="font-mono tabular-nums">Target &lt;2,000 ms</span>
            </div>
            <div className="meter-value-large tabular-nums font-mono">
              {avgRunMs === null ? "—" : `${avgRunMs} `}
              <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-muted)" }}>
                {avgRunMs === null ? "" : "ms"}
              </span>
            </div>
            <div className="meter-track">
              <div
                className="meter-fill"
                style={{
                  width: `${avgRunMs ? Math.min(100, Math.max(15, Math.round((avgRunMs / 2000) * 100))) : 0}%`,
                }}
              />
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              Local deterministic multi-agent loop; zero unsourced manual claims.
            </div>
          </div>
        </section>

        {activeTab === "runs" && (
          <section className="card-white">
            <h2 style={{ marginTop: 0, fontSize: 16, fontWeight: 600 }}>
              Recent Swarm Executions ({Object.keys(runs).length})
            </h2>
            <p className="footnote" style={{ marginBottom: 16 }}>
              Adversarial swarm runs: Hound evidence retrieval → Prosecutor draft → 3-Juror quorum audit → Arbiter verdict.
            </p>
            {Object.keys(runs).length === 0 ? (
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-secondary)" }}>
                No swarm runs recorded yet. Click any dispute in the ledger below to inspect evidence and run the adversarial swarm.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {Object.entries(runs).map(([disputeId, r]) => (
                  <div
                    key={disputeId}
                    style={{
                      padding: "12px 16px",
                      background: "var(--bg-muted)",
                      border: "1px solid var(--border-hairline)",
                      borderRadius: "var(--radius-card)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <div>
                      <span className="font-mono" style={{ fontWeight: 600, marginRight: 10 }}>
                        {disputeId}
                      </span>
                      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        {r.iterations.length} iterations · {r.duration_ms} ms · Score: {r.score}/100
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      {verdictBadge(r.verdict)}
                      <Link href={`/disputes/${disputeId}`} className="btn" style={{ fontSize: 12.5, padding: "5px 12px" }}>
                        Inspect →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "dossiers" && (
          <section className="card-white">
            <h2 style={{ marginTop: 0, fontSize: 16, fontWeight: 600 }}>
              5-Page PDF Evidence Dossiers (pdf-lib · SHA-256 Manifest)
            </h2>
            <p className="footnote" style={{ marginBottom: 16 }}>
              Every seeded dispute carries an immutable SIMULATED watermark on all 5 pages. Pre-swarm downloads compile Pass-1 fast merchant sources.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {disputes.map((d) => (
                <a
                  key={d.id}
                  className="pdf-link"
                  href={`/api/disputes/${d.id}/evidence.pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download {d.id} ({d.reason} · ${d.amount.value} USD) ↗
                </a>
              ))}
            </div>
          </section>
        )}

        {activeTab === "settings" && (
          <section className="card-white">
            <h2 style={{ marginTop: 0, fontSize: 16, fontWeight: 600 }}>
              Safety Gates &amp; Deterministic Scoring Charter
            </h2>
            <dl className="kv" style={{ marginTop: 16 }}>
              <dt>PayPal Environment</dt>
              <dd>Sandbox only (api-m.sandbox.paypal.com) — zero real money or live buyer accounts</dd>
              <dt>Human Approval Gate</dt>
              <dd>Strictly mandatory before provide-evidence, make-offer, or accept-claim actions</dd>
              <dt>Checklist Rubric</dt>
              <dd>Deterministic 0–100 score (30 + 15 + 15 + 25 + 15); never treated as a win probability</dd>
              <dt>LLM &amp; 3-Juror Layer</dt>
              <dd>Drafts rebuttal wording &amp; flags quorum gaps only; zero-key template fallback guaranteed</dd>
            </dl>
          </section>
        )}

        {/* AG Grid Dispute Ledger */}
        <section className="ledger-card">
          <div className="ledger-toolbar">
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-ink)" }}>
              Dispute Ledger — AG Grid Community (Light Theme)
            </h2>
            <input
              type="search"
              className="search-input"
              aria-label="Filter ledger"
              placeholder="Search dispute ID, reason, status…"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                gridRef.current?.api.setGridOption(
                  "quickFilterText",
                  e.target.value,
                );
              }}
            />
          </div>

          {disputes.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "var(--text-secondary)" }}>
              No disputes loaded in the active ledger.
              <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
                <button className="primary" onClick={seedDemo}>
                  Load seeded demo
                </button>
              </div>
            </div>
          ) : (
            <div className="grid-wrap">
              <AgGridReact
                ref={gridRef}
                rowData={rows}
                columnDefs={columns}
                theme={phalanxLightGridTheme}
                defaultColDef={{ resizable: true }}
                rowSelection="single"
                onRowClicked={(e) => e.data && router.push(`/disputes/${e.data.id}`)}
                pagination={true}
                paginationPageSize={10}
              />
            </div>
          )}

          <p className="ledger-footer">
            <b>Deterministic Scoring Rubric:</b> 0–100 total (Tracking DELIVERED 30 + Carrier verifiable 15 + Signature 15 + Merchant log 25 + Invoice/Terms 15).
            <br />
            <b>Routing Policy:</b> ≥75 CONTEST_HARD_PROOF · 35–74 DE_ESCALATE_OFFER · &lt;35 CONCEDE_FAST_SETTLE.
            Click any dispute row or ID to inspect the full-page adversarial debate, audit evidence sources, and review the Human Approval Gate.
          </p>
        </section>
      </main>
    </div>
  );
}
