"use client";

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
  EvidenceArtifact,
  SwarmPhaseItem,
  SwarmProgress,
  SwarmRun,
  Verdict,
} from "@/lib/types";

ModuleRegistry.registerModules([AllCommunityModule]);

const supabaseGridTheme = themeQuartz.withParams({
  backgroundColor: "#1C1C1C",
  foregroundColor: "#EDEDED",
  headerBackgroundColor: "#171717",
  headerTextColor: "#A1A1AA",
  borderColor: "#2E2E2E",
  rowHoverColor: "#242424",
  selectedRowBackgroundColor: "rgba(62, 207, 142, 0.12)",
  accentColor: "#3ECF8E",
  fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
  fontSize: 13,
  headerFontSize: 11,
  headerFontWeight: 600,
});

type NavSection = "overview" | "disputes" | "runs" | "evidence" | "settings";

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

interface Detail {
  dispute: Dispute;
  artifacts: EvidenceArtifact[];
  run: (SwarmRun & { issue_framing?: string | null; verdict_reasoning?: string | null }) | null;
  approval: {
    id: string;
    action: string;
    approved_by: string;
    approved_at: string;
    offer_amount?: { currency_code: string; value: string };
  } | null;
  execution: { paypal_status: string; note: string } | null;
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

export default function Home() {
  const [activeNav, setActiveNav] = useState<NavSection>("overview");
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [runs, setRuns] = useState<Record<string, SwarmRun>>({});
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const gridRef = useRef<AgGridReact<Row> | null>(null);

  // Live Swarm Phase Tracker state
  const [liveProgress, setLiveProgress] = useState<SwarmProgress | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/disputes");
      const body = await res.json();
      setDisputes(body.disputes ?? []);
      setTelemetry(body.telemetry ?? null);
      if (body.latest_runs && typeof body.latest_runs === "object") {
        setRuns(body.latest_runs as Record<string, SwarmRun>);
      } else if (body.runs && typeof body.runs === "object") {
        setRuns(body.runs as Record<string, SwarmRun>);
      }
      if (body.liveError) {
        setNotice(
          `Live PayPal list failed (seeded demo still works): ${body.liveError}`,
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

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    const res = await fetch(`/api/disputes/${id}`);
    const body = await res.json();
    setDetail(body);
    if (body.run) {
      setRuns((r) => ({ ...r, [id]: body.run }));
    }

    try {
      const statusRes = await fetch(`/api/disputes/${id}/run-status`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.progress) {
          setLiveProgress(statusData.progress);
        } else if (body.run?.phases) {
          setLiveProgress({
            run_id: body.run.id,
            dispute_id: id,
            status: "DONE",
            started_at: body.run.created_at,
            elapsed_ms: body.run.duration_ms,
            current_phase_key: null,
            current_phase_label: "Done",
            phases: body.run.phases,
          });
        } else {
          setLiveProgress(null);
        }
      }
    } catch {
      // ignore status fetch error
    }
  }, []);

  // Poll run-status while a swarm run is in flight on the selected dispute
  useEffect(() => {
    if (!loading || !selectedId) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/disputes/${selectedId}/run-status`);
        if (res.ok) {
          const data = await res.json();
          if (data.progress) {
            setLiveProgress(data.progress);
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 400);

    const tickInterval = setInterval(() => {
      setNowTick(Date.now());
    }, 100);

    return () => {
      clearInterval(pollInterval);
      clearInterval(tickInterval);
    };
  }, [loading, selectedId]);

  const seedDemo = async () => {
    const res = await fetch("/api/demo/seed", { method: "POST" });
    const body = await res.json();
    setDisputes(body.disputes ?? []);
    setNotice(`Seeded demo loaded: ${body.seeded} scenarios (SIMULATED).`);
    await refresh();
  };

  const runSwarm = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/disputes/${id}/run`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "swarm run failed");
      setRuns((r) => ({ ...r, [id]: body.run }));
      await loadDetail(id);
      await refresh();

      // Final progress refresh to lock in DONE status and auto-expand rejected phases
      try {
        const statusRes = await fetch(`/api/disputes/${id}/run-status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.progress) {
            setLiveProgress(statusData.progress);
            const autoExp: Record<string, boolean> = {};
            for (const p of statusData.progress.phases) {
              if (p.summary_note && p.summary_note.includes("REJECTED")) {
                autoExp[p.key] = true;
              }
            }
            setExpandedPhases((prev) => ({ ...prev, ...autoExp }));
          }
        }
      } catch {
        // ignore
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const approve = async (id: string, action: string) => {
    const res = await fetch(`/api/disputes/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "approve failed");
      return;
    }
    setNotice(
      `Approved ${action} for ${id} (approver: demo merchant). Execute is still gated — see below.`,
    );
    await loadDetail(id);
    await refresh();
  };

  const execute = async (id: string) => {
    const res = await fetch(`/api/disputes/${id}/execute`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      setNotice(`Execute refused (${body.error}): ${body.detail ?? ""}`);
      await loadDetail(id);
      await refresh();
      return;
    }
    setNotice("Executed.");
    await loadDetail(id);
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
    { field: "id", headerName: "Dispute ID", flex: 1.1, sortable: true, filter: true },
    { field: "reason", headerName: "Reason Code", flex: 2, sortable: true, filter: true },
    { field: "amount", headerName: "Amount", flex: 0.9, sortable: true },
    { field: "iterations", headerName: "Iterations", flex: 0.7, sortable: true },
    {
      field: "score",
      headerName: "Checklist Score",
      flex: 1.2,
      sortable: true,
      cellRenderer: (p: { value: number | null }) =>
        p.value === null ? (
          <span style={{ color: "#71717A" }}>—</span>
        ) : (
          <span className="scorebar">
            <span className="bar">
              <span
                className="fill"
                style={{ width: `${p.value}%`, display: "block" }}
              />
            </span>
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
    { field: "status", headerName: "PayPal Status", flex: 1.3, sortable: true, filter: true },
    { field: "source", headerName: "Source", flex: 1.2, sortable: true, filter: true },
  ];

  const run = detail?.run ?? null;
  const actionForVerdict =
    run?.verdict === "CONTEST_HARD_PROOF"
      ? "provide-evidence"
      : run?.verdict === "DE_ESCALATE_OFFER"
        ? "make-offer"
        : run?.verdict === "CONCEDE_FAST_SETTLE"
          ? "accept-claim"
          : null;

  const isApproveAllowed = Boolean(
    actionForVerdict && detail?.dispute.allowed_actions.includes(actionForVerdict),
  );
  const isExecuteAllowed = Boolean(
    detail?.approval && detail?.dispute.allowed_actions.includes(detail.approval.action),
  );

  // Derived progress values for UI
  const displayedPhases: SwarmPhaseItem[] =
    liveProgress?.phases ?? (run?.phases ?? []);
  const isRunning = liveProgress?.status === "RUNNING";
  const donePhasesCount = displayedPhases.filter((p) => p.status === "done").length;
  const progressPct =
    displayedPhases.length > 0
      ? Math.round((donePhasesCount / displayedPhases.length) * 100)
      : 0;
  const totalElapsedMs = isRunning
    ? Math.max(
        0,
        liveProgress?.started_at ? nowTick - Date.parse(liveProgress.started_at) : 0,
      )
    : (run?.duration_ms ?? liveProgress?.elapsed_ms ?? 0);

  return (
    <div className="app-shell">
      {/* Left Supabase-style Sidebar */}
      <aside className="sidebar" aria-label="Sidebar navigation">
        <div className="brand-header">
          <div className="brand-title">
            <span className="brand-dot" /> PHALANX
          </div>
          <span className="env-pill">Sandbox</span>
        </div>

        <div className="nav-group-label">Workbench</div>
        <ul className="nav-list">
          <li>
            <button
              className={`nav-btn ${activeNav === "overview" ? "active" : ""}`}
              onClick={() => setActiveNav("overview")}
            >
              <span>Overview</span>
              <span className="nav-count">{disputes.length}</span>
            </button>
          </li>
          <li>
            <button
              className={`nav-btn ${activeNav === "disputes" ? "active" : ""}`}
              onClick={() => setActiveNav("disputes")}
            >
              <span>Disputes</span>
              <span className="nav-count">{disputes.length}</span>
            </button>
          </li>
          <li>
            <button
              className={`nav-btn ${activeNav === "runs" ? "active" : ""}`}
              onClick={() => setActiveNav("runs")}
            >
              <span>Swarm Runs</span>
              <span className="nav-count">{Object.keys(runs).length}</span>
            </button>
          </li>
          <li>
            <button
              className={`nav-btn ${activeNav === "evidence" ? "active" : ""}`}
              onClick={() => setActiveNav("evidence")}
            >
              <span>Evidence Dossiers</span>
              <span className="nav-count">{disputes.length}</span>
            </button>
          </li>
          <li>
            <button
              className={`nav-btn ${activeNav === "settings" ? "active" : ""}`}
              onClick={() => setActiveNav("settings")}
            >
              <span>Settings</span>
            </button>
          </li>
        </ul>

        <div className="sidebar-footer">
          <a
            className="sidebar-link"
            href="https://github.com/DhyeyPatel007/phalanx"
            target="_blank"
            rel="noreferrer"
          >
            GitHub Repository ↗
          </a>
          <a
            className="sidebar-link"
            href="https://developer.paypal.com/api/customer-disputes/v1"
            target="_blank"
            rel="noreferrer"
          >
            PayPal Disputes v1 Docs ↗
          </a>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <h1>
              {activeNav === "overview"
                ? "Overview"
                : activeNav === "disputes"
                  ? "Disputes Ledger"
                  : activeNav === "runs"
                    ? "Swarm Deliberation Runs"
                    : activeNav === "evidence"
                      ? "Evidence Dossiers (PDF)"
                      : "Environment & Gate Settings"}
            </h1>
            <span className="sub">
              Adversarial swarm · PayPal Sandbox · human approves every action
            </span>
          </div>
          <div className="topbar-actions">
            <button onClick={refresh} disabled={loading}>
              Refresh ledger
            </button>
            <button className="primary" onClick={seedDemo}>
              Load seeded demo
            </button>
          </div>
        </header>

        <div className="content-wrap">
          {/* Mandatory Honesty Callout — Always Visible */}
          <div className="callout simulated">
            <span>
              <b>SIMULATED DATA</b> — seeded disputes are demo data, not real
              buyers or transactions. Checklist scores are an internal
              heuristic, NOT a win probability. Sandbox only; no live execution
              in this run.
            </span>
          </div>

          {notice && <div className="callout notice">{notice}</div>}
          {error && <div className="callout error">Error: {error}</div>}

          {/* Telemetry Stat Cards */}
          {(activeNav === "overview" || activeNav === "runs") && (
            <section className="telemetry" aria-label="Telemetry">
              <div className="tele">
                <div className="label">Total disputed volume</div>
                <div className="value">${totalVolume.toFixed(2)}</div>
                <div className="note">Sum of loaded dispute amounts</div>
              </div>
              <div className="tele">
                <div className="label">Capital saved by swarm</div>
                <div className="value">${capitalSaved.toFixed(2)}</div>
                <div className="note">
                  Amount retained on contested disputes where evidence was
                  accepted in Sandbox; $0 until a Sandbox execution succeeds
                </div>
              </div>
              <div className="tele">
                <div className="label">Dispute fees avoided</div>
                <div className="value">${feesAvoided.toFixed(2)}</div>
                <div className="note">
                  Basis: US Standard Dispute Fee $15 (Oct 1, 2026 schedule); $0
                  until a Sandbox execution succeeds
                </div>
              </div>
              <div className="tele">
                <div className="label">Avg swarm resolution time</div>
                <div className="value">
                  {avgRunMs === null ? "—" : `${avgRunMs} ms`}
                </div>
                <div className="note">
                  Demo run time only — never compared to an unsourced manual figure
                </div>
              </div>
            </section>
          )}

          {/* Swarm Runs Dedicated Summary View */}
          {activeNav === "runs" && (
            <section className="ledger-card" style={{ padding: 16 }}>
              <h2 style={{ marginTop: 0, fontSize: 14 }}>
                Swarm Deliberation Runs ({Object.keys(runs).length})
              </h2>
              <p className="footnote" style={{ marginBottom: 12 }}>
                Each run executes the 4-agent chain: Hound → Prosecutor → Red-Team Jury → Arbiter.
              </p>
              {Object.keys(runs).length === 0 ? (
                <div className="empty">No swarm runs executed yet. Select a dispute from the ledger to run the swarm.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {Object.entries(runs).map(([disputeId, r]) => (
                    <div
                      key={disputeId}
                      style={{
                        padding: 12,
                        background: "var(--bg-canvas)",
                        border: "1px solid var(--border-default)",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                      onClick={() => loadDetail(disputeId)}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 600 }}>{disputeId}</span>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {verdictBadge(r.verdict)}
                          <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 12 }}>{r.score}/100</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                        {r.iterations.length} iterations · {r.duration_ms} ms · {r.gaps.length} gaps identified
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Evidence Quick-Access View */}
          {activeNav === "evidence" && (
            <section className="ledger-card" style={{ padding: 16 }}>
              <h2 style={{ marginTop: 0, fontSize: 14 }}>
                5-Page PDF Evidence Dossiers (pdf-lib · SHA-256 manifest)
              </h2>
              <p className="footnote" style={{ marginBottom: 12 }}>
                Every seeded dispute carries a SIMULATED watermark on all 5 pages. Pre-swarm downloads reflect only Pass-1 fast sources.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {disputes.map((d) => (
                  <a
                    key={d.id}
                    className="pdf-link"
                    href={`/api/disputes/${d.id}/evidence.pdf`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: "8px 12px",
                      border: "1px solid var(--border-default)",
                      borderRadius: 6,
                      background: "var(--bg-canvas)",
                    }}
                  >
                    Download {d.id} ({d.reason} · ${d.amount.value}) ↗
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Settings Read-Only Inspection View */}
          {activeNav === "settings" && (
            <section className="ledger-card" style={{ padding: 16 }}>
              <h2 style={{ marginTop: 0, fontSize: 14 }}>
                Architecture &amp; Safety Gates
              </h2>
              <dl className="kv">
                <dt>PayPal Target</dt>
                <dd>Sandbox only (api-m.sandbox.paypal.com) — no real money</dd>
                <dt>Human Gate</dt>
                <dd>Mandatory before provide-evidence, make-offer, or accept-claim</dd>
                <dt>Scoring Engine</dt>
                <dd>Deterministic 0–100 checklist rubric (never a win probability)</dd>
                <dt>LLM Layer</dt>
                <dd>Wording + 3-juror deliberation only; zero-key template fallback</dd>
              </dl>
            </section>
          )}

          {/* Main AG Grid Dispute Ledger */}
          {(activeNav === "overview" || activeNav === "disputes") && (
            <section className="ledger-card">
              <div className="ledger-toolbar">
                <h2>Dispute ledger — AG Grid Community</h2>
                <input
                  type="search"
                  className="search-input"
                  aria-label="Filter ledger"
                  placeholder="Filter: dispute ID, reason, status…"
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
                <div className="empty">
                  No disputes loaded.
                  <div className="actions" style={{ justifyContent: "center", marginTop: 10 }}>
                    <button className="primary" onClick={seedDemo}>
                      Load seeded demo
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid-wrap">
                  <AgGridReact
                    ref={gridRef}
                    theme={supabaseGridTheme}
                    rowData={rows}
                    columnDefs={columns}
                    defaultColDef={{ resizable: true }}
                    rowSelection="single"
                    onRowClicked={(e) => e.data && loadDetail(e.data.id)}
                    pagination={true}
                    paginationPageSize={10}
                  />
                </div>
              )}

              <p className="ledger-footer">
                Score = checklist score 0–100 (tracking DELIVERED 30 + delivery
                verifiable 15 + signature 15 + merchant log 25 + invoice/terms
                15). Routing policy: ≥75 CONTEST_HARD_PROOF · 35–74
                DE_ESCALATE_OFFER · &lt;35 CONCEDE_FAST_SETTLE. Click any row to
                open the adversarial debate &amp; human approval drawer.
              </p>
            </section>
          )}
        </div>
      </div>

      {/* Right Slide-Over Debate & Human Gate Drawer */}
      {detail && selectedId && (
        <div
          className="drawer-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setDetail(null);
              setSelectedId(null);
            }
          }}
        >
          <aside className="drawer" aria-label="Adversarial debate inspector">
            <div className="drawer-header">
              <div>
                <h2>{detail.dispute.id}</h2>
                <p className="drawer-meta">
                  {detail.dispute.reason} · ${detail.dispute.amount.value}{" "}
                  {detail.dispute.amount.currency_code} ·{" "}
                  {detail.dispute.dispute_life_cycle_stage} /{" "}
                  {detail.dispute.status}
                </p>
                <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                  {detail.dispute.source === "seeded" ? (
                    <span className="badge sim">SEEDED — SIMULATED</span>
                  ) : (
                    <span className="badge na">SANDBOX</span>
                  )}
                  {run ? (
                    verdictBadge(run.verdict)
                  ) : (
                    <span className="badge na">NOT RUN</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setDetail(null);
                  setSelectedId(null);
                }}
              >
                Close ✕
              </button>
            </div>

            <div className="drawer-body">
              {/* Swarm Controls */}
              <div className="actions">
                <button
                  className="primary"
                  onClick={() => runSwarm(detail.dispute.id)}
                  disabled={loading}
                >
                  {loading ? "Running swarm…" : "Run swarm"}
                </button>
                <button
                  onClick={async () => {
                    const res = await fetch("/api/demo/replay-webhook", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ dispute_id: detail.dispute.id }),
                    });
                    await res.json();
                    setNotice(
                      `Replayed stored CUSTOMER.DISPUTE.CREATED for ${detail.dispute.id} (demo only, no live webhook).`,
                    );
                  }}
                >
                  Replay webhook
                </button>
                <a
                  className="pdf-link"
                  style={{ marginLeft: "auto", fontSize: 12.5 }}
                  href={`/api/disputes/${detail.dispute.id}/evidence.pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download PDF Dossier ↗
                </a>
              </div>

              {/* Live Swarm Phase Tracker / Timeline */}
              {displayedPhases.length > 0 && (
                <section className="phase-tracker-card" aria-label="Swarm Execution Timeline">
                  <div className="phase-tracker-header">
                    <div className="phase-tracker-top">
                      <div className="phase-live-title">
                        <span
                          className="brand-dot"
                          style={{
                            background: isRunning ? "var(--brand-green)" : "#71717A",
                            boxShadow: isRunning ? "0 0 8px var(--brand-green)" : "none",
                          }}
                        />
                        <span>
                          {isRunning
                            ? liveProgress?.current_phase_label || "Swarm running…"
                            : "Swarm execution complete"}
                        </span>
                      </div>
                      <div className="phase-elapsed">
                        {isRunning
                          ? `${(totalElapsedMs / 1000).toFixed(1)}s live`
                          : `${totalElapsedMs} ms`}
                      </div>
                    </div>
                    <div className="phase-progress-wrap">
                      <div className="phase-progress-track">
                        <div
                          className={`phase-progress-fill ${isRunning ? "running" : ""}`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <span className="phase-progress-count">
                        {donePhasesCount} of {displayedPhases.length} phases
                      </span>
                    </div>
                  </div>

                  <div className="phase-list">
                    {displayedPhases.map((phase) => {
                      const isDone = phase.status === "done";
                      const isCurrent = phase.status === "current";
                      const isPending = phase.status === "pending";
                      const isExpanded = Boolean(expandedPhases[phase.key]);

                      let durationDisplay = "Pending";
                      if (isDone) {
                        durationDisplay =
                          phase.duration_ms !== null ? `${phase.duration_ms} ms` : "0 ms";
                      } else if (isCurrent && phase.started_at) {
                        const elapsedSec = Math.max(
                          0,
                          (nowTick - Date.parse(phase.started_at)) / 1000,
                        );
                        durationDisplay = `${elapsedSec.toFixed(1)}s live`;
                      }

                      const toggleExpand = () => {
                        if (isPending) return;
                        setExpandedPhases((prev) => ({
                          ...prev,
                          [phase.key]: !prev[phase.key],
                        }));
                      };

                      return (
                        <div key={phase.key} className={`phase-item ${phase.status}`}>
                          <button
                            type="button"
                            className="phase-row"
                            onClick={toggleExpand}
                            aria-expanded={isExpanded}
                          >
                            <div className="phase-left">
                              <span className={`phase-icon ${phase.status}`}>
                                {isDone ? "✓" : isCurrent ? "" : "○"}
                              </span>
                              <div className="phase-label-group">
                                <span className="phase-label">{phase.label}</span>
                                <span className="phase-submeta">
                                  [{phase.actor}]
                                  {phase.summary_note ? ` · ${phase.summary_note}` : ""}
                                </span>
                              </div>
                            </div>
                            <div className="phase-right">
                              <span className={`phase-duration ${isCurrent ? "live" : ""}`}>
                                {durationDisplay}
                              </span>
                              {!isPending && (
                                <span className="phase-chevron">
                                  {isExpanded ? "▴" : "▾"}
                                </span>
                              )}
                            </div>
                          </button>

                          {isExpanded && !isPending && (
                            <div className="phase-transcript">
                              {phase.messages.length === 0 ? (
                                <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                                  No transcript items emitted in this phase.
                                </span>
                              ) : (
                                phase.messages.map((m, idx) => (
                                  <div key={idx} className={`msg ${m.kind}`}>
                                    <div className="actor">
                                      {m.actor} · iter {m.iteration} · {m.kind}
                                    </div>
                                    <pre>{m.text}</pre>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Prominent Human Approval Gate — First-Class Trust Module */}
              {run && (
                <div className="approval-gate-card">
                  <div className="approval-gate-header">
                    <h3>Human Approval Gate (Mandatory)</h3>
                    <span className="badge contest">
                      Target: {actionForVerdict ?? "—"}
                    </span>
                  </div>

                  {detail.approval ? (
                    <p style={{ margin: "4px 0", fontSize: 12.5 }}>
                      Approved: <b>{detail.approval.action}</b>
                      {detail.approval.action === "make-offer" &&
                        detail.approval.offer_amount && (
                          <>
                            {" "}
                            — offer{" "}
                            <b>
                              ${detail.approval.offer_amount.value}{" "}
                              {detail.approval.offer_amount.currency_code}
                            </b>{" "}
                            (REFUND, buyer keeps the item)
                          </>
                        )}{" "}
                      by <b>{detail.approval.approved_by ?? "demo merchant"}</b>{" "}
                      at {detail.approval.approved_at}
                    </p>
                  ) : (
                    <p style={{ margin: "4px 0", fontSize: 12.5, color: "#A1A1AA" }}>
                      No approval recorded yet. PHALANX never executes a PayPal
                      mutation without explicit human approval.
                    </p>
                  )}

                  {run.verdict === "CONCEDE_FAST_SETTLE" && (
                    <p className="gaplist" style={{ marginTop: 6 }}>
                      Manual next step (not automated): file a carrier insurance
                      claim for the lost package — PHALANX does not file claims
                      automatically.
                    </p>
                  )}

                  {detail.execution && (
                    <p className="gaplist" style={{ marginTop: 6 }}>
                      Last execution attempt: {detail.execution.paypal_status} —{" "}
                      {detail.execution.note}
                    </p>
                  )}

                  <div className="gate-actions">
                    <button
                      className="primary"
                      onClick={() =>
                        actionForVerdict &&
                        approve(detail.dispute.id, actionForVerdict)
                      }
                      disabled={!isApproveAllowed || loading}
                    >
                      Approve {actionForVerdict ?? "—"}
                    </button>
                    <button
                      className="danger"
                      onClick={() => execute(detail.dispute.id)}
                      disabled={!isExecuteAllowed || loading}
                    >
                      Execute (gated)
                    </button>
                  </div>
                  {actionForVerdict && !isApproveAllowed && (
                    <p className="gaplist" style={{ marginTop: 6 }}>
                      Verdict action {actionForVerdict} is not allowed on this
                      dispute (live allowed:{" "}
                      {detail.dispute.allowed_actions.join(", ") || "none"}).
                      Approve is disabled — the server would refuse it.
                    </p>
                  )}
                  <p className="footnote">
                    Execute is disabled until Approve, and until the action is
                    live-allowed. In this run live execution is not enabled —
                    Execute records a refusal (negative test, logged).
                  </p>
                </div>
              )}

              {/* Judge Framing & Reasoning Callout (feat/llm-wiring support) */}
              {run && (run.issue_framing || run.verdict_reasoning) && (
                <div className="judge-card">
                  <h3>Judge Framing &amp; Verdict Summary (Deliberation Only)</h3>
                  {run.issue_framing && (
                    <p style={{ margin: "0 0 6px", fontSize: 12.5 }}>
                      <b>Issue framing:</b> {run.issue_framing}
                    </p>
                  )}
                  {run.verdict_reasoning && (
                    <p style={{ margin: 0, fontSize: 12.5 }}>
                      <b>Verdict explanation:</b> {run.verdict_reasoning}
                    </p>
                  )}
                  <p className="footnote">
                    Note: The routing verdict ({run.verdict}) is strictly
                    computed from the deterministic checklist score ({run.score}
                    /100), never decided by the LLM.
                  </p>
                </div>
              )}

              {/* Evidence Artifacts */}
              <div className="drawer-section">
                <h3>Evidence artifacts</h3>
                {detail.artifacts.length === 0 ? (
                  <p className="gaplist">No artifacts yet.</p>
                ) : (
                  <dl className="kv">
                    {detail.artifacts.map((a) => (
                      <span key={a.id} style={{ display: "contents" }}>
                        <dt>
                          [{a.kind}]{a.simulated ? " (SIM)" : ""}
                        </dt>
                        <dd>{a.summary}</dd>
                      </span>
                    ))}
                  </dl>
                )}
              </div>

              {run && (
                <>
                  {/* Score Progression */}
                  <div className="drawer-section">
                    <h3>Score — before / after</h3>
                    {run.iterations.map((it) => (
                      <p
                        key={it.iteration}
                        style={{
                          margin: "4px 0",
                          fontFamily: "var(--font-mono), monospace",
                          fontSize: 12,
                        }}
                      >
                        {it.draft_version}: {it.score_before} →{" "}
                        <b>{it.score}/100</b> · {it.verdict} ·{" "}
                        {it.accepted ? "ACCEPTED" : "REJECTED"}
                      </p>
                    ))}
                    <p className="footnote">
                      Final: <b>{run.score}/100</b> — checklist score, not a win
                      probability. Run time: {run.duration_ms} ms.
                    </p>
                  </div>

                  {/* Named Gaps */}
                  <div className="drawer-section">
                    <h3>Named gaps</h3>
                    {run.gaps.length === 0 ? (
                      <p style={{ margin: 0 }}>
                        No gaps — every checklist item has an artifact.
                      </p>
                    ) : (
                      <ul className="gaplist">
                        {run.gaps.map((g) => (
                          <li key={g}>{g}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Illustrative EV */}
                  {run.ev_display && (
                    <div className="drawer-section">
                      <h3>Illustrative EV — not a PayPal outcome prediction</h3>
                      <dl className="kv">
                        <dt>EV contest</dt>
                        <dd>${run.ev_display.ev_contest.toFixed(2)}</dd>
                        <dt>Concede cost</dt>
                        <dd>${run.ev_display.concede_cost.toFixed(2)}</dd>
                        <dt>Offer cost (40%)</dt>
                        <dd>${run.ev_display.offer_cost.toFixed(2)}</dd>
                        <dt>Fee basis</dt>
                        <dd>{run.ev_display.fee_basis}</dd>
                      </dl>
                    </div>
                  )}

                  {/* Adversarial Debate Transcript */}
                  <div className="drawer-section">
                    <h3>Adversarial debate transcript</h3>
                    {run.messages.map((m, i) => (
                      <div key={i} className={`msg ${m.kind}`}>
                        <div className="actor">
                          {m.actor} · iter {m.iteration} · {m.kind}
                        </div>
                        <pre>{m.text}</pre>
                      </div>
                    ))}
                  </div>

                  {/* Allowed Actions & PDF Dossier */}
                  <div className="drawer-section">
                    <h3>Evidence dossier (PDF) &amp; Allowed Actions</h3>
                    <p style={{ margin: "0 0 10px" }}>
                      <a
                        className="pdf-link"
                        href={`/api/disputes/${detail.dispute.id}/evidence.pdf`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download evidence dossier (PDF) ↗
                      </a>{" "}
                      <span className="footnote">
                        — preview before approval; SIMULATED watermark on seeded
                        disputes.
                      </span>
                    </p>
                    <details>
                      <summary
                        style={{
                          cursor: "pointer",
                          fontSize: 12,
                          color: "#A1A1AA",
                        }}
                      >
                        PayPal says I can… (allowed actions)
                      </summary>
                      <pre
                        style={{
                          fontSize: 11.5,
                          background: "#121212",
                          padding: 10,
                          borderRadius: 6,
                          marginTop: 8,
                        }}
                      >
                        {JSON.stringify(detail.dispute.allowed_actions, null, 2)}
                        {detail.dispute.source === "seeded"
                          ? "\n(SIMULATED list for seeded disputes — live gating applies to Sandbox rows.)"
                          : ""}
                      </pre>
                    </details>
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
