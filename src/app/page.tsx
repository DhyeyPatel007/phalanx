"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import type { ColDef } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import type {
  Dispute,
  EvidenceArtifact,
  SwarmRun,
  Verdict,
} from "@/lib/types";

ModuleRegistry.registerModules([AllCommunityModule]);

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
  run: SwarmRun | null;
  approval: { id: string; action: string; approved_by: string; approved_at: string; offer_amount?: { currency_code: string; value: string } } | null;
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
      // Hydrate runs from the server (finding #7): without this, a
      // browser reload resets every grid row to NOT RUN until clicked.
      if (body.latest_runs) setRuns(body.latest_runs as Record<string, SwarmRun>);
      if (body.liveError) setNotice(`Live PayPal list failed (seeded demo still works): ${body.liveError}`);
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
    setNotice(`Seeded demo loaded: ${body.seeded} scenarios (SIMULATED).`);
    // Refresh ledger + telemetry from the server (finding #7).
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
      // Refresh ledger + telemetry from the server (finding #7): without
      // this, runs_completed / capital / fees stay stale until a manual
      // refresh.
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
    setNotice(`Approved ${action} for ${id} (approver: demo merchant). Execute is still gated — see below.`);
    await loadDetail(id);
  };

  const execute = async (id: string) => {
    const res = await fetch(`/api/disputes/${id}/execute`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      // Expected in this run: refusals are the correct behaviour (see log).
      setNotice(`Execute refused (${body.error}): ${body.detail ?? ""}`);
      await loadDetail(id);
      return;
    }
    setNotice("Executed.");
    await loadDetail(id);
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
    { field: "id", headerName: "Dispute ID", flex: 1.2, sortable: true, filter: true },
    { field: "reason", headerName: "Reason Code", flex: 2, sortable: true, filter: true },
    { field: "amount", headerName: "Amount", flex: 0.8, sortable: true },
    { field: "iterations", headerName: "Iterations", flex: 0.6, sortable: true },
    {
      field: "score",
      headerName: "Checklist Score",
      flex: 1.2,
      sortable: true,
      cellRenderer: (p: { value: number | null }) =>
        p.value === null ? (
          <span style={{ color: "#8b98a5" }}>—</span>
        ) : (
          <span className="scorebar">
            <span className="bar">
              <span className="fill" style={{ width: `${p.value}%`, display: "block" }} />
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
    { field: "status", headerName: "PayPal Status", flex: 1.2, sortable: true, filter: true },
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
  // UI gates (finding #7): the buttons must respect allowed_actions, as
  // the footnote below claims — the server already gates, this keeps the
  // UI honest instead of offering an action that will refuse.
  const actionAllowed = Boolean(
    actionForVerdict && detail?.dispute.allowed_actions.includes(actionForVerdict),
  );
  const approvalActionAllowed = Boolean(
    detail?.approval && detail.dispute.allowed_actions.includes(detail.approval.action),
  );

  return (
    <div>
      <header className="topbar">
        <h1>
          PHALANX<span> // </span>DISPUTE DEFENSE
        </h1>
        <span className="sub">
          Adversarial swarm · PayPal Sandbox · human approves every action
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={seedDemo}>Load seeded demo</button>
        <button onClick={refresh} disabled={loading}>
          Refresh ledger
        </button>
      </header>

      <div className="banner">
        <b>SIMULATED DATA</b> — seeded disputes are demo data, not real
        buyers or transactions. Checklist scores are an internal heuristic,
        NOT a win probability. Sandbox only; no live execution in this run.
      </div>

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
            Amount retained on contested disputes where evidence was accepted
            in Sandbox; $0 until a Sandbox execution succeeds
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
          <div className="value">{avgRunMs === null ? "—" : `${avgRunMs} ms`}</div>
          <div className="note">Demo run time only — never compared to an unsourced manual figure</div>
        </div>
      </section>

      {notice && (
        <div style={{ padding: "8px 16px", background: "#0b3d24", color: "#b7f5d0", fontSize: 13 }}>
          {notice}
        </div>
      )}
      {error && (
        <div className="error" style={{ padding: "8px 16px" }}>
          Error: {error}
        </div>
      )}

      <div className="main">
        <section className="ledger">
          <h2>Dispute ledger — AG Grid Community</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              type="search"
              aria-label="Filter ledger"
              placeholder="Filter: dispute ID, reason, status…"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                gridRef.current?.api.setGridOption("quickFilterText", e.target.value);
              }}
              style={{ flex: 1, padding: "6px 10px", background: "#0d1117", color: "#e6edf3", border: "1px solid #30363d", borderRadius: 6 }}
            />
          </div>
          {disputes.length === 0 ? (
            <div className="empty">
              No disputes loaded.
              <div className="actions" style={{ justifyContent: "center" }}>
                <button className="primary" onClick={seedDemo}>
                  Load seeded demo
                </button>
              </div>
            </div>
          ) : (
            <div className="grid-wrap ag-theme-quartz-dark">
              <AgGridReact
                ref={gridRef}
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
          <p className="footnote">
            Score = checklist score 0–100 (tracking DELIVERED 30 + delivery
            verifiable 15 + signature 15 + merchant log 25 + invoice/terms
            15). Routing policy: ≥75 CONTEST_HARD_PROOF · 35–74
            DE_ESCALATE_OFFER · &lt;35 CONCEDE_FAST_SETTLE. Click a row to
            open the debate inspector.
          </p>
        </section>

        {detail && selectedId && (
          <aside className="drawer" aria-label="Adversarial debate inspector">
            <button className="close" onClick={() => { setDetail(null); setSelectedId(null); }}>
              Close ✕
            </button>
            <h2>{detail.dispute.id}</h2>
            <p>
              {detail.dispute.reason} · ${detail.dispute.amount.value}{" "}
              {detail.dispute.amount.currency_code} ·{" "}
              {detail.dispute.dispute_life_cycle_stage} /{" "}
              {detail.dispute.status}
            </p>
            <p>
              {detail.dispute.source === "seeded" ? (
                <span className="badge sim">SEEDED — SIMULATED</span>
              ) : (
                <span className="badge na">SANDBOX</span>
              )}{" "}
              {run ? verdictBadge(run.verdict) : <span className="badge na">NOT RUN</span>}
            </p>

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

            <div className="actions">
              <button
                className="primary"
                onClick={() => runSwarm(detail.dispute.id)}
                disabled={loading}
              >
                Run swarm
              </button>
              <button
                onClick={async () => {
                  const res = await fetch("/api/demo/replay-webhook", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ dispute_id: detail.dispute.id }),
                  });
                  const body = await res.json();
                  setNotice(`Replayed stored CUSTOMER.DISPUTE.CREATED for ${detail.dispute.id} (demo only, no live webhook).`);
                  void body;
                }}
              >
                Replay webhook
              </button>
            </div>

            {run && (
              <>
                <h3>Score — before / after</h3>
                {run.iterations.map((it) => (
                  <p key={it.iteration} style={{ margin: "4px 0" }}>
                    {it.draft_version}: {it.score_before} →{" "}
                    <b>{it.score}/100</b> · {it.verdict} ·{" "}
                    {it.accepted ? "ACCEPTED" : "REJECTED"}
                  </p>
                ))}
                <p>
                  Final: <b>{run.score}/100</b> — checklist score, not a win
                  probability. Run time: {run.duration_ms} ms.
                </p>

                <h3>Named gaps</h3>
                {run.gaps.length === 0 ? (
                  <p>No gaps — every checklist item has an artifact.</p>
                ) : (
                  <ul className="gaplist">
                    {run.gaps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                )}

                <h3>Adversarial debate transcript</h3>
                {run.messages.map((m, i) => (
                  <div key={i} className={`msg ${m.kind}`}>
                    <div className="actor">
                      {m.actor} · iter {m.iteration} · {m.kind}
                    </div>
                    <pre>{m.text}</pre>
                  </div>
                ))}

                {run.ev_display && (
                  <>
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
                  </>
                )}

                <details>
                  <summary>PayPal says I can… (allowed actions)</summary>
                  <pre>
                    {JSON.stringify(detail.dispute.allowed_actions, null, 2)}
                    {detail.dispute.source === "seeded"
                      ? "\n(SIMULATED list for seeded disputes — live gating applies to Sandbox rows.)"
                      : ""}
                  </pre>
                </details>

                <h3>Evidence dossier (PDF)</h3>
                <p>
                  <a
                    href={`/api/disputes/${detail.dispute.id}/evidence.pdf`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download evidence dossier (PDF)
                  </a>{" "}
                  <span className="footnote">
                    — preview before approval; SIMULATED watermark on seeded
                    disputes.
                  </span>
                </p>

                <h3>Human approval gate</h3>
                {detail.approval ? (
                  <p>
                    Approved: <b>{detail.approval.action}</b>
                    {detail.approval.action === "make-offer" && detail.approval.offer_amount && (
                      <>
                        {" "}— offer{" "}
                        <b>
                          ${detail.approval.offer_amount.value}{" "}
                          {detail.approval.offer_amount.currency_code}
                        </b>{" "}
                        (REFUND, buyer keeps the item)
                      </>
                    )}{" "}
                    by {detail.approval.approved_by ?? "demo merchant"} at{" "}
                    {detail.approval.approved_at}
                  </p>
                ) : (
                  <p>No approval yet. Nothing executes before approval.</p>
                )}
                {run?.verdict === "CONCEDE_FAST_SETTLE" && (
                  <p className="gaplist">
                    Manual next step (not automated): file a carrier insurance
                    claim for the lost package — PHALANX does not file claims
                    automatically.
                  </p>
                )}
                {detail.execution && (
                  <p className="gaplist">
                    Last execution attempt: {detail.execution.paypal_status} —{" "}
                    {detail.execution.note}
                  </p>
                )}
                <div className="actions">
                  <button
                    onClick={() => actionForVerdict && approve(detail.dispute.id, actionForVerdict)}
                    disabled={!actionForVerdict || !actionAllowed || loading}
                    title={!actionForVerdict ? undefined : actionAllowed ? undefined : `${actionForVerdict} is not in this dispute's live allowed actions`}
                  >
                    Approve {actionForVerdict ?? "—"}
                  </button>
                  <button
                    className="danger"
                    onClick={() => execute(detail.dispute.id)}
                    disabled={!detail.approval || !approvalActionAllowed || loading}
                    title={detail.approval && !approvalActionAllowed ? `${detail.approval.action} is no longer in this dispute's live allowed actions` : undefined}
                  >
                    Execute (gated)
                  </button>
                </div>
                {actionForVerdict && !actionAllowed && (
                  <p className="gaplist">
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
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
