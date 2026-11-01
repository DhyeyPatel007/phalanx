"use client";

import Link from "next/link";
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
  SwarmRun,
  Verdict,
} from "@/lib/types";

ModuleRegistry.registerModules([AllCommunityModule]);

const perplexityGridTheme = themeQuartz.withParams({
  backgroundColor: "#FFFFFF",
  foregroundColor: "#13343B",
  headerBackgroundColor: "#F9F9F6",
  headerTextColor: "#4A5568",
  borderColor: "#E4E4DF",
  rowHoverColor: "#F3F3EE",
  selectedRowBackgroundColor: "#E6F7F9",
  accentColor: "#1FB8CD",
  fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
  fontSize: 13,
  headerFontSize: 11,
  headerFontWeight: 600,
});

type TabSection = "workbench" | "dossiers" | "charter";

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

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabSection>("workbench");
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

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    const res = await fetch(`/api/disputes/${id}`);
    const body = await res.json();
    setDetail(body);
    if (body.run) setRuns((r) => ({ ...r, [id]: body.run }));
  }, []);

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
      `Approved ${action} for ${id} (approver: demo merchant). Execute remains gated.`,
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
    setNotice("Executed in PayPal Sandbox.");
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
      flex: 1.1,
      sortable: true,
      cellRenderer: (p: { value: number | null }) =>
        p.value === null ? (
          <span style={{ color: "#64748B" }}>—</span>
        ) : (
          <span className="score-pill">{p.value}/100</span>
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
    detail?.approval &&
      detail?.dispute.allowed_actions.includes(detail.approval.action),
  );

  return (
    <div>
      {/* Slim Perplexity Top Navigation Bar */}
      <header className="pplx-nav">
        <div className="pplx-nav-inner">
          <div className="brand-cluster">
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="brand-mark">P</span>
              <span>PHALANX</span>
            </Link>
            <span className="chip teal">PayPal Sandbox</span>
            <Link href="/" className="chip" style={{ cursor: "pointer" }}>
              ← Product Overview
            </Link>
          </div>

          <nav className="nav-links" aria-label="Workbench sections">
            <button
              className={`nav-tab ${activeTab === "workbench" ? "active" : ""}`}
              onClick={() => setActiveTab("workbench")}
            >
              Dispute Workbench ({disputes.length})
            </button>
            <button
              className={`nav-tab ${activeTab === "dossiers" ? "active" : ""}`}
              onClick={() => setActiveTab("dossiers")}
            >
              Evidence Dossiers (PDF)
            </button>
            <button
              className={`nav-tab ${activeTab === "charter" ? "active" : ""}`}
              onClick={() => setActiveTab("charter")}
            >
              Safety &amp; Gate Rules
            </button>
          </nav>

          <div className="actions">
            <button onClick={refresh} disabled={loading}>
              Refresh ledger
            </button>
            <button className="primary" onClick={seedDemo}>
              Load seeded demo
            </button>
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

        {/* 4 Quiet Perplexity Stat Cards */}
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
              Counts only confirmed Sandbox executions (contested upheld or
              offer principal retained); $0 on seeded demo runs
            </div>
          </div>
          <div className="tele">
            <div className="label">Dispute fees avoided</div>
            <div className="value">${feesAvoided.toFixed(2)}</div>
            <div className="note">
              Default: US Standard Dispute Fee $15 (Oct 1, 2026 schedule); $0
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

        {activeTab === "dossiers" && (
          <section className="pplx-card">
            <h2 style={{ marginTop: 0, fontSize: 16 }}>
              5-Page PDF Evidence Dossiers (pdf-lib · SHA-256 manifest)
            </h2>
            <p className="footnote" style={{ marginBottom: 14 }}>
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

        {activeTab === "charter" && (
          <section className="pplx-card">
            <h2 style={{ marginTop: 0, fontSize: 16 }}>
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

        {/* AG Grid Light Dispute Ledger */}
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
            <div style={{ padding: 40, textAlign: "center", color: "#4A5568" }}>
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
                theme={perplexityGridTheme}
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
            verifiable 15 + signature 15 + merchant log 25 + invoice/terms 15).
            Routing policy: ≥75 CONTEST_HARD_PROOF · 35–74 DE_ESCALATE_OFFER ·
            &lt;35 CONCEDE_FAST_SETTLE. Click a row to inspect the swarm debate.
          </p>
        </section>
      </main>

      {/* Slide-Over Dispute Detail & Debate Drawer */}
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
              <div className="actions">
                <button
                  className="primary"
                  onClick={() => runSwarm(detail.dispute.id)}
                  disabled={loading}
                >
                  {loading ? "Deliberating…" : "Run swarm"}
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
                  style={{ marginLeft: "auto" }}
                  href={`/api/disputes/${detail.dispute.id}/evidence.pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download PDF Dossier ↗
                </a>
              </div>

              {/* Quiet Swarm Run Status Line (No Progress Bar / No Stepper) */}
              {loading && (
                <div className="quiet-status-line" role="status">
                  <span className="breathing-dot" />
                  <span>
                    Adversarial swarm deliberating — Hound, Prosecutor, 3-Juror
                    Panel &amp; Red-Team reviewing evidence…
                  </span>
                </div>
              )}

              {/* Prominent Human Approval Gate */}
              {run && (
                <div className="approval-gate-card">
                  <div className="approval-gate-header">
                    <h3>Human Approval Gate (Mandatory)</h3>
                    <span className="chip teal">
                      Recommended: {actionForVerdict ?? "—"}
                    </span>
                  </div>

                  {detail.approval ? (
                    <p style={{ margin: "4px 0", fontSize: 13 }}>
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
                    <p style={{ margin: "4px 0", fontSize: 13, color: "#4A5568" }}>
                      No approval recorded yet. Nothing executes on PayPal
                      without explicit human approval.
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
                  <p className="footnote">
                    Execute is disabled until Approve, and until the action is
                    live-allowed. In seeded mode Execute records a logged
                    refusal.
                  </p>
                </div>
              )}

              {/* Judge Framing & Reasoning Callout */}
              {run && (run.issue_framing || run.verdict_reasoning) && (
                <div className="judge-card">
                  <h3>Judge Framing &amp; Verdict Summary (Advisory)</h3>
                  {run.issue_framing && (
                    <p style={{ margin: "0 0 6px", fontSize: 13 }}>
                      <b>Issue framing:</b> {run.issue_framing}
                    </p>
                  )}
                  {run.verdict_reasoning && (
                    <p style={{ margin: 0, fontSize: 13 }}>
                      <b>Verdict explanation:</b> {run.verdict_reasoning}
                    </p>
                  )}
                  <p className="footnote">
                    The routing verdict ({run.verdict}) is strictly computed from
                    the deterministic checklist score ({run.score}/100).
                  </p>
                </div>
              )}

              {/* Evidence Source Chips & Summaries */}
              <div className="drawer-section">
                <h3>Evidence Sources ({detail.artifacts.length})</h3>
                {detail.artifacts.length === 0 ? (
                  <p className="gaplist">No artifacts in store.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {detail.artifacts.map((a, idx) => (
                      <div
                        key={a.id}
                        style={{
                          padding: "8px 10px",
                          background: "var(--bg-paper)",
                          border: "1px solid var(--border-hairline)",
                          borderRadius: 8,
                          fontSize: 13,
                        }}
                      >
                        <div style={{ display: "flex", gap: 6, marginBottom: 3 }}>
                          <span className="chip">[{idx + 1}] {a.kind}</span>
                          {a.simulated && <span className="chip sim">SIMULATED</span>}
                        </div>
                        <div>{a.summary}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {run && (
                <>
                  {/* Score Progression */}
                  <div className="drawer-section">
                    <h3>Checklist Score — Before / After</h3>
                    {run.iterations.map((it) => (
                      <p
                        key={it.iteration}
                        style={{
                          margin: "4px 0",
                          fontFamily: "var(--font-mono), monospace",
                          fontSize: 12.5,
                        }}
                      >
                        {it.draft_version}: {it.score_before} →{" "}
                        <b>{it.score}/100</b> · {it.verdict} ·{" "}
                        {it.accepted ? "ACCEPTED" : "REJECTED"}
                      </p>
                    ))}
                    <p className="footnote">
                      Final: <b>{run.score}/100</b> — deterministic checklist
                      score, NEVER a win probability. Run time: {run.duration_ms}{" "}
                      ms.
                    </p>
                  </div>

                  {/* Named Gaps */}
                  <div className="drawer-section">
                    <h3>Named Gaps</h3>
                    {run.gaps.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 13 }}>
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

                  {/* Honest Deterministic Outcome & Break-Even Matrix */}
                  {run.ev_display && (
                    <div className="drawer-section">
                      <h3>
                        Deterministic Outcome &amp; Break-Even Matrix — Not a
                        PayPal Outcome Prediction
                      </h3>
                      <dl className="kv">
                        <dt>Contest (if upheld)</dt>
                        <dd>
                          $0.00 net loss (${detail.dispute.amount.value} retained;
                          $15 fee waived)
                        </dd>
                        <dt>Contest (if lost)</dt>
                        <dd>
                          -$
                          {(
                            run.ev_display.contest_lost_cost_usd ??
                            run.ev_display.concede_cost
                          ).toFixed(2)}{" "}
                          (${detail.dispute.amount.value} claim + $
                          {run.ev_display.fee_usd} fee)
                        </dd>
                        <dt>
                          Partial offer ({run.ev_display.offer_pct ?? 40}% refund)
                        </dt>
                        <dd>
                          -$
                          {(
                            run.ev_display.offer_cost_usd ??
                            run.ev_display.offer_cost
                          ).toFixed(2)}{" "}
                          settled in INQUIRY ($0 PayPal fee)
                        </dd>
                        <dt>Immediate concede</dt>
                        <dd>
                          -$
                          {(
                            run.ev_display.concede_cost_usd ??
                            run.ev_display.concede_cost
                          ).toFixed(2)}
                        </dd>
                        {typeof run.ev_display.breakeven_win_rate_vs_offer_pct ===
                          "number" && (
                          <>
                            <dt>Break-even vs. offer</dt>
                            <dd>
                              Contesting beats a $
                              {(
                                run.ev_display.offer_cost_usd ??
                                run.ev_display.offer_cost
                              ).toFixed(2)}{" "}
                              offer only if true external win odds exceed{" "}
                              {run.ev_display.breakeven_win_rate_vs_offer_pct}%
                              (not estimated by PHALANX)
                            </dd>
                          </>
                        )}
                        <dt>Fee basis</dt>
                        <dd>{run.ev_display.fee_basis}</dd>
                      </dl>
                    </div>
                  )}

                  {/* Unfolding Adversarial Debate Transcript */}
                  <div className="drawer-section">
                    <h3>Adversarial Debate Transcript</h3>
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
                    <h3>Evidence Dossier (PDF) &amp; Allowed Actions</h3>
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
                      <summary style={{ cursor: "pointer", fontSize: 12.5, color: "#4A5568" }}>
                        PayPal says I can… (allowed actions)
                      </summary>
                      <pre
                        style={{
                          fontSize: 12,
                          background: "var(--bg-subtle)",
                          padding: 10,
                          borderRadius: 8,
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
