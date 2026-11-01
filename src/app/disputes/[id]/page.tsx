"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type {
  Dispute,
  EvidenceArtifact,
  SwarmRun,
  Verdict,
} from "@/lib/types";

interface DetailData {
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

function cleanMarkdown(text?: string | null): string {
  if (!text) return "";
  return text.replace(/\*\*/g, "").replace(/__/g, "");
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

export default function DisputeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDispute = useCallback(async (disputeId: string) => {
    try {
      setError(null);
      const res = await fetch(`/api/disputes/${disputeId}`);
      if (!res.ok) {
        setError(`Failed to load dispute ${disputeId} (${res.status})`);
        return;
      }
      const data: DetailData = await res.json();
      setDetail(data);
    } catch (e) {
      setError(`Error fetching dispute: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    if (id) {
      loadDispute(id);
    }
  }, [id, loadDispute]);

  const runSwarm = async (disputeId: string) => {
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/disputes/${disputeId}/run`, {
        method: "POST",
      });
      if (res.ok) {
        await loadDispute(disputeId);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(`Swarm run failed: ${body.error ?? res.statusText}`);
      }
    } catch (err) {
      setError(`Swarm run error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const approve = async (disputeId: string, action: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/disputes/${disputeId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, approved_by: "merchant" }),
      });
      if (res.ok) {
        await loadDispute(disputeId);
        setNotice(`Approved action: ${action}`);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(`Approval failed: ${body.error ?? res.statusText}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const execute = async (disputeId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/disputes/${disputeId}/execute`, {
        method: "POST",
      });
      const data = await res.json();
      await loadDispute(disputeId);
      if (data.status === "REFUSED_SEEDED_MODE") {
        setNotice(
          "Refused execution: dispute is SEEDED. Seeded disputes simulate flow and never hit PayPal APIs.",
        );
      } else if (res.ok) {
        setNotice(`Execution completed on PayPal: ${data.paypal_status ?? "OK"}`);
      } else {
        setError(`Execution failed: ${data.error ?? data.note ?? "Unknown error"}`);
      }
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div>
        <header className="pplx-nav">
          <div className="pplx-nav-inner">
            <div className="brand-cluster">
              <span className="brand-mark">P</span>
              <span>PHALANX</span>
              <span className="chip teal">PayPal AI Hackathon</span>
            </div>
            <Link className="btn" href="/dashboard">
              ← All disputes
            </Link>
          </div>
        </header>
        <main className="detail-wrap">
          <div className="quiet-status-line">
            <span className="breathing-dot" />
            <span>Loading dispute record…</span>
          </div>
        </main>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div>
        <header className="pplx-nav">
          <div className="pplx-nav-inner">
            <div className="brand-cluster">
              <span className="brand-mark">P</span>
              <span>PHALANX</span>
              <span className="chip teal">PayPal AI Hackathon</span>
            </div>
            <Link className="btn" href="/dashboard">
              ← All disputes
            </Link>
          </div>
        </header>
        <main className="detail-wrap">
          <div className="callout error">
            {error || `Dispute ${id} not found.`}
          </div>
          <Link className="btn" href="/dashboard" style={{ width: "fit-content" }}>
            ← Return to Dispute Ledger
          </Link>
        </main>
      </div>
    );
  }

  const run = detail.run;
  const actionForVerdict =
    run?.verdict === "CONTEST_HARD_PROOF"
      ? "provide-evidence"
      : run?.verdict === "DE_ESCALATE_OFFER"
        ? "make-offer"
        : run?.verdict === "CONCEDE_FAST_SETTLE"
          ? "accept-claim"
          : null;

  const isApproveAllowed = Boolean(
    actionForVerdict &&
      (detail.dispute.source === "seeded" ||
        detail.dispute.allowed_actions?.includes(actionForVerdict)),
  );

  const isExecuteAllowed = Boolean(
    detail.approval &&
      (detail.dispute.source === "seeded" ||
        detail.dispute.allowed_actions?.includes(detail.approval.action)),
  );

  return (
    <div>
      {/* Top Editorial Nav */}
      <header className="pplx-nav">
        <div className="pplx-nav-inner">
          <div className="brand-cluster">
            <span className="brand-mark">P</span>
            <span>PHALANX</span>
            <span className="chip teal">Dispute Inspector</span>
          </div>

          <div className="actions">
            <Link className="btn" href="/dashboard">
              ← All disputes
            </Link>
            <Link className="btn primary" href="/dashboard">
              Workbench
            </Link>
          </div>
        </div>
      </header>

      <main className="detail-wrap">
        {/* Back Link */}
        <Link href="/dashboard" className="detail-nav-back">
          ← All disputes
        </Link>

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

        {/* 1. Header Card: ID, Badges, Reason, Stage, Amount */}
        <div className="detail-header-card">
          <div className="detail-header-top">
            <div className="detail-title-cluster">
              <h1>{detail.dispute.id}</h1>
              <p className="detail-meta-line">
                {detail.dispute.reason} · ${detail.dispute.amount.value}{" "}
                {detail.dispute.amount.currency_code} · Stage:{" "}
                {detail.dispute.dispute_life_cycle_stage} · Status:{" "}
                {detail.dispute.status}
              </p>
              <div style={{ marginTop: 4, display: "flex", gap: 6, alignItems: "center" }}>
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

            {/* 2. Primary Actions: Run Swarm / Replay Webhook / Download PDF */}
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
                href={`/api/disputes/${detail.dispute.id}/evidence.pdf`}
                target="_blank"
                rel="noreferrer"
              >
                Download PDF Dossier ↗
              </a>
            </div>
          </div>

          {/* Quiet Swarm Status Line (No Progress Bar / No Stepper) */}
          {loading && (
            <div className="quiet-status-line" role="status">
              <span className="breathing-dot" />
              <span>
                Adversarial swarm deliberating — Hound, Prosecutor, 3-Juror Panel
                &amp; Red-Team reviewing evidence…
              </span>
            </div>
          )}
        </div>

        {/* 3. Prominent Human Approval Gate */}
        {run && (
          <div className="approval-gate-card">
            <div className="approval-gate-header">
              <h3>Human Approval Gate (Mandatory)</h3>
              <span className="chip teal">
                Recommended: {actionForVerdict ?? "—"}
              </span>
            </div>

            {detail.approval ? (
              <p style={{ margin: "4px 0", fontSize: 13.5 }}>
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
                by <b>{detail.approval.approved_by ?? "demo merchant"}</b> at{" "}
                <span className="timestamp">{detail.approval.approved_at}</span>
              </p>
            ) : (
              <p style={{ margin: "4px 0", fontSize: 13.5, color: "var(--text-secondary)" }}>
                No approval recorded yet. Nothing executes on PayPal without explicit human approval.
              </p>
            )}

            {run.verdict === "CONCEDE_FAST_SETTLE" && (
              <p className="gaplist" style={{ marginTop: 8 }}>
                Manual next step (not automated): file a carrier insurance claim for the lost package — PHALANX does not file claims automatically.
              </p>
            )}

            {detail.execution && (
              <p className="gaplist" style={{ marginTop: 8 }}>
                Last execution attempt: {detail.execution.paypal_status} — {detail.execution.note}
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
              Execute is disabled until Approve, and until the action is live-allowed. In seeded mode Execute records a logged refusal.
            </p>
          </div>
        )}

        {/* 4. Judge Framing & Reasoning Callout (No Markdown **) */}
        {run && (run.issue_framing || run.verdict_reasoning) && (
          <div className="judge-card">
            <h3>Judge Framing &amp; Verdict Summary (Advisory)</h3>
            {run.issue_framing && (
              <p style={{ margin: "0 0 8px", fontSize: 13.5, lineHeight: 1.5 }}>
                <b style={{ color: "var(--text-main)" }}>Issue framing:</b> {cleanMarkdown(run.issue_framing)}
              </p>
            )}
            {run.verdict_reasoning && (
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
                <b style={{ color: "var(--text-main)" }}>Verdict explanation:</b> {cleanMarkdown(run.verdict_reasoning)}
              </p>
            )}
            <p className="footnote">
              The routing verdict ({run.verdict}) is strictly computed from the deterministic checklist score ({run.score}/100).
            </p>
          </div>
        )}

        {/* 5. Evidence Sources */}
        <div className="detail-section">
          <h3>Evidence Sources ({detail.artifacts.length})</h3>
          {detail.artifacts.length === 0 ? (
            <p className="gaplist">No artifacts in store.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {detail.artifacts.map((a, idx) => (
                <div
                  key={a.id}
                  style={{
                    padding: "10px 14px",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-hairline)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
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
            {/* 6. Score Progression */}
            <div className="detail-section">
              <h3>Checklist Score — Before / After</h3>
              {run.iterations.map((it) => (
                <p
                  key={it.iteration}
                  style={{
                    margin: "5px 0",
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>{it.draft_version}:</span>{" "}
                  {it.score_before} → <b>{it.score}/100</b> · {it.verdict} ·{" "}
                  <span style={{ fontWeight: 600, color: it.accepted ? "var(--accent-teal-ink)" : "var(--verdict-offer-text)" }}>
                    {it.accepted ? "ACCEPTED" : "REJECTED"}
                  </span>
                </p>
              ))}
              <p className="footnote">
                Final: <b>{run.score}/100</b> — deterministic checklist score, NEVER a win probability. Run time: {run.duration_ms} ms.
              </p>
            </div>

            {/* 7. Named Gaps */}
            <div className="detail-section">
              <h3>Named Gaps</h3>
              {run.gaps.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                  No gaps — every checklist item has an artifact.
                </p>
              ) : (
                <ul className="gaplist">
                  {run.gaps.map((g) => (
                    <li key={g} style={{ margin: "4px 0" }}>{g}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* 8. Honest Deterministic Outcome & Break-Even Matrix */}
            {run.ev_display && (
              <div className="detail-section">
                <h3>
                  Deterministic Outcome &amp; Break-Even Matrix — Not a PayPal Outcome Prediction
                </h3>
                <dl className="kv">
                  <dt>Contest (if upheld)</dt>
                  <dd>
                    $0.00 net loss (${detail.dispute.amount.value} retained; $15 fee waived)
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
                        {run.ev_display.breakeven_win_rate_vs_offer_pct}% (not estimated by PHALANX)
                      </dd>
                    </>
                  )}
                  <dt>Fee basis</dt>
                  <dd>{run.ev_display.fee_basis}</dd>
                </dl>
              </div>
            )}

            {/* 9. Adversarial Debate Transcript */}
            <div className="detail-section">
              <h3>Adversarial Debate Transcript</h3>
              {run.messages.map((m, i) => (
                <div key={i} className={`msg ${m.kind}`}>
                  <div className="actor">
                    {m.actor} · iter {m.iteration} · {m.kind}
                  </div>
                  <pre>{cleanMarkdown(m.text)}</pre>
                </div>
              ))}
            </div>

            {/* 10. Evidence Dossier & Allowed Actions */}
            <div className="detail-section">
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
                  — preview before approval; SIMULATED watermark on seeded disputes.
                </span>
              </p>
              <details>
                <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--text-secondary)" }}>
                  PayPal says I can… (allowed actions)
                </summary>
                <pre
                  style={{
                    fontSize: 12,
                    background: "var(--bg-subtle)",
                    padding: 12,
                    borderRadius: "var(--radius-md)",
                    marginTop: 8,
                    border: "1px solid var(--border-hairline)",
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
      </main>
    </div>
  );
}

