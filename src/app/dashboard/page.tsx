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

const perplexityDarkGridTheme = themeQuartz.withParams({
  backgroundColor: "#191919",
  foregroundColor: "#EDEDEA",
  headerBackgroundColor: "#202020",
  headerTextColor: "#A1A1A3",
  borderColor: "rgba(255, 255, 255, 0.08)",
  rowHoverColor: "#252525",
  selectedRowBackgroundColor: "rgba(32, 128, 141, 0.16)",
  accentColor: "#20808D",
  fontFamily: "var(--font-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSize: 13,
  headerFontSize: 11,
  headerFontWeight: 600,
  borderRadius: 0,
  wrapperBorderRadius: 4,
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
      const res = await fetch("/api/disputes");
      const body = await res.json();
      setDisputes(body.disputes ?? []);
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
    const res = await fetch("/api/demo/seed", { method: "POST" });
    const body = await res.json();
    setDisputes(body.disputes ?? []);
    setNotice(`Seeded demo loaded: ${body.seeded} scenarios (SIMULATED).`);
    await refresh();
  };

  const rows: Row[] = useMemo(
    () =>
      disputes.map((d) => {
        const run = runs[d.id];
        return {
          id: d.id,
          reason: d.reason,
          amount: `$${parseFloat(d.amount.value).toFixed(2)} ${d.amount.currency_code}`,
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
      flex: 1.1,
      sortable: true,
      filter: true,
      cellRenderer: (p: { value: string }) => (
        <Link href={`/disputes/${p.value}`} className="grid-link font-mono">
          {p.value}
        </Link>
      ),
    },
    { field: "reason", headerName: "Reason Code", flex: 2, sortable: true, filter: true },
    {
      field: "amount",
      headerName: "Amount",
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
      flex: 0.8,
      sortable: true,
      cellStyle: { textAlign: "right" },
      headerClass: "ag-right-aligned-header",
      cellRenderer: (p: { value: number }) => (
        <span className="tabular-nums">{p.value}</span>
      ),
    },
    {
      field: "score",
      headerName: "Checklist Score",
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
      flex: 1.4,
      sortable: true,
      cellRenderer: (p: { value: Verdict | null }) => verdictBadge(p.value),
    },
    { field: "status", headerName: "PayPal Status", flex: 1.2, sortable: true, filter: true },
    { field: "source", headerName: "Source", flex: 1.2, sortable: true, filter: true },
  ];

  return (
    <div>
      {/* 12-Site Benchmark: Slim Top Bar (No Sidebar) */}
      <header className="pplx-nav">
        <div className="pplx-nav-inner">
          <div className="brand-cluster">
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="brand-mark">P</span>
              <span>PHALANX</span>
            </Link>
            <span className="chip teal">PayPal Sandbox</span>
          </div>

          <nav className="nav-links" aria-label="Main navigation">
            <Link href="/" className="nav-tab">
              Overview
            </Link>
            <button
              className={`nav-tab ${activeTab === "disputes" ? "active" : ""}`}
              onClick={() => setActiveTab("disputes")}
            >
              Disputes ({disputes.length})
            </button>
            <button
              className={`nav-tab ${activeTab === "runs" ? "active" : ""}`}
              onClick={() => setActiveTab("runs")}
            >
              Swarm Runs
            </button>
            <button
              className={`nav-tab ${activeTab === "dossiers" ? "active" : ""}`}
              onClick={() => setActiveTab("dossiers")}
            >
              Evidence Dossiers
            </button>
            <button
              className={`nav-tab ${activeTab === "settings" ? "active" : ""}`}
              onClick={() => setActiveTab("settings")}
            >
              Settings
            </button>
          </nav>

          <div className="actions">
            <button onClick={refresh} disabled={loading}>
              Refresh ledger
            </button>
            <button className="primary" onClick={seedDemo}>
              Load seeded demo
            </button>
            <a
              href="https://github.com/DhyeyPatel007/phalanx"
              target="_blank"
              rel="noreferrer"
              className="nav-link-subtle"
            >
              GitHub ↗
            </a>
            <a
              href="https://developer.paypal.com/docs/api/disputes/v1/"
              target="_blank"
              rel="noreferrer"
              className="nav-link-subtle"
            >
              PayPal Docs ↗
            </a>
          </div>
        </div>
      </header>

      <main className="workbench-wrap">
        {/* Mandatory Honesty Callout — Always Visible */}
        <div className="callout simulated">
          <span>
            <b>SIMULATED DATA</b> — seeded disputes are demo data, not real
            buyers or transactions. Checklist scores are an internal heuristic,
            NOT a win probability. Sandbox only; human approval is mandatory.
          </span>
          <span className="chip sim">3 Seeded Cases</span>
        </div>

        {notice && <div className="callout notice">{notice}</div>}
        {error && <div className="callout error">Error: {error}</div>}

        {/* 4 Quiet Perplexity Stat Cards (KPI Discipline: 3-5 Metrics Max, Tabular Numerals) */}
        <section className="telemetry" aria-label="Telemetry">
          <div className="tele">
            <div className="label">Total disputed volume</div>
            <div className="value tabular-nums">${totalVolume.toFixed(2)}</div>
            <div className="note">Sum of loaded dispute amounts</div>
          </div>
          <div className="tele">
            <div className="label">Capital saved by swarm</div>
            <div className="value tabular-nums">${capitalSaved.toFixed(2)}</div>
            <div className="note">
              Counts only confirmed Sandbox executions (contested upheld or
              offer principal retained); $0 on seeded demo runs
            </div>
          </div>
          <div className="tele">
            <div className="label">Dispute fees avoided</div>
            <div className="value tabular-nums">${feesAvoided.toFixed(2)}</div>
            <div className="note">
              Default: US Standard Dispute Fee $15 (Oct 1, 2026 schedule); $0
              until a Sandbox execution succeeds
            </div>
          </div>
          <div className="tele">
            <div className="label">Avg swarm resolution time</div>
            <div className="value tabular-nums">
              {avgRunMs === null ? "—" : `${avgRunMs} ms`}
            </div>
            <div className="note">
              Demo run time only — never compared to an unsourced manual figure
            </div>
          </div>
        </section>

        {activeTab === "runs" && (
          <section className="pplx-card">
            <h2 style={{ marginTop: 0, fontSize: 15, fontWeight: 600 }}>
              Recent Swarm Executions ({Object.keys(runs).length})
            </h2>
            <p className="footnote" style={{ marginBottom: 12 }}>
              Adversarial swarm runs: Hound evidence retrieval → Prosecutor draft → 3-Juror quorum audit → Arbiter verdict.
            </p>
            {Object.keys(runs).length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                No swarm runs recorded yet. Click any dispute in the ledger below to run the adversarial swarm.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Object.entries(runs).map(([disputeId, r]) => (
                  <div
                    key={disputeId}
                    style={{
                      padding: "10px 14px",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-hairline)",
                      borderRadius: "var(--radius-card)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
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
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {verdictBadge(r.verdict)}
                      <Link href={`/disputes/${disputeId}`} className="btn" style={{ fontSize: 12, padding: "4px 10px" }}>
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
          <section className="pplx-card">
            <h2 style={{ marginTop: 0, fontSize: 15, fontWeight: 600 }}>
              5-Page PDF Evidence Dossiers (pdf-lib · SHA-256 manifest)
            </h2>
            <p className="footnote" style={{ marginBottom: 12 }}>
              Every seeded dispute carries a SIMULATED watermark on all 5 pages.
              Pre-swarm downloads include only Pass-1 fast sources.
            </p>
            <div className="actions">
              {disputes.map((d) => (
                <a
                  key={d.id}
                  className="btn"
                  href={`/api/disputes/${d.id}/evidence.pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download {d.id} ({d.reason} · ${d.amount.value}) ↗
                </a>
              ))}
            </div>
          </section>
        )}

        {activeTab === "settings" && (
          <section className="pplx-card">
            <h2 style={{ marginTop: 0, fontSize: 15, fontWeight: 600 }}>
              Safety Gates &amp; Deterministic Scoring Charter
            </h2>
            <dl className="kv">
              <dt>PayPal Environment</dt>
              <dd>Sandbox only (api-m.sandbox.paypal.com) — zero real money</dd>
              <dt>Human Approval Gate</dt>
              <dd>Mandatory before provide-evidence, make-offer, or accept-claim</dd>
              <dt>Checklist Rubric</dt>
              <dd>Deterministic 0–100 score (30 + 15 + 15 + 25 + 15); never a win probability</dd>
              <dt>LLM &amp; 3-Juror Layer</dt>
              <dd>Drafts wording &amp; flags quorum gaps only; zero-key template floor</dd>
            </dl>
          </section>
        )}

        {/* AG Grid Dark Dispute Ledger */}
        <section className="ledger-card">
          <div className="ledger-toolbar">
            <h2>Dispute Ledger — AG Grid Community</h2>
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
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
              No disputes loaded.
              <div className="actions" style={{ justifyContent: "center", marginTop: 12 }}>
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
                theme={perplexityDarkGridTheme}
                defaultColDef={{ resizable: true }}
                rowSelection="single"
                onRowClicked={(e) => e.data && router.push(`/disputes/${e.data.id}`)}
                pagination={true}
                paginationPageSize={10}
              />
            </div>
          )}

          <p className="ledger-footer">
            Score = checklist score 0–100 (tracking DELIVERED 30 + delivery
            verifiable 15 + signature 15 + merchant log 25 + invoice/terms 15).
            Routing policy: ≥75 CONTEST_HARD_PROOF · 35–74 DE_ESCALATE_OFFER ·
            &lt;35 CONCEDE_FAST_SETTLE. Click any dispute row or ID to open the
            full-page adversarial debate, proof artifacts, and human approval gate.
          </p>
        </section>
      </main>
    </div>
  );
}
