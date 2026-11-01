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
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`{1,3}(.*?)`{1,3}/g, "$1")
    .replace(/^[ \t]*#[# \t]*/gm, "")
    .trim();
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
        <div className="floating-nav-wrap">
          <header className="floating-nav">
            <div className="brand-cluster">
              <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="brand-mark">P</span>
                <span>PHALANX</span>
              </Link>
              <span className="chip ultraviolet">Dispute Inspector</span>
            </div>
            <Link className="btn" href="/dashboard">
              ← All disputes
            </Link>
          </header>
        </div>
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
        <div className="floating-nav-wrap">
          <header className="floating-nav">
            <div className="brand-cluster">
              <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="brand-mark">P</span>
                <span>PHALANX</span>
              </Link>
              <span className="chip ultraviolet">Dispute Inspector</span>
            </div>
            <Link className="btn" href="/dashboard">
              ← All disputes
            </Link>
          </header>
        </div>
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
      {/* Floating Pill Nav */}
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
            <Link href="/dashboard" className="nav-link active">
              Disputes
            </Link>
            <Link href="/guide" className="nav-link">
              Guide ↗
            </Link>
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link className="btn" href="/dashboard" style={{ fontSize: 13, padding: "6px 14px" }}>
              ← All disputes
            </Link>
            <a
              href="https://github.com/DhyeyPatel007/phalanx"
              target="_blank"
              rel="noreferrer"
              className="btn"
              style={{ fontSize: 13, padding: "6px 14px" }}
            >
              GitHub ↗
            </a>
          </div>
        </header>
      </div>

      <main className="detail-wrap">
        {/* Breadcrumbs: All disputes / PP-D-XXXXX */}
        <div className="breadcrumb-bar">
          <Link href="/dashboard" className="breadcrumb-link">
            All disputes
          </Link>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current font-mono">{detail.dispute.id}</span>
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

        {/* 1. Header Card: ID, Badges, Reason, Stage, Amount in USD */}
        <div className="detail-header-card">
          <div className="detail-header-top">
            <div className="detail-title-cluster">
              <h1 className="font-mono">{detail.dispute.id}</h1>
              <p className="detail-meta-line">
                <b>{detail.dispute.reason}</b> · ${parseFloat(detail.dispute.amount.value).toFixed(2)} USD · Stage:{" "}
                {detail.dispute.dispute_life_cycle_stage} · Status: {detail.dispute.status}
              </p>
              <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {detail.dispute.source === "seeded" ? (
                  <span className="badge sim">SEEDED — SIMULATED</span>
                ) : (
                  <span className="badge na">SANDBOX</span>
                )}
                {run ? verdictBadge(run.verdict) : <span className="badge na">NOT RUN</span>}
                {run && (
                  <span className="chip" style={{ fontWeight: 600 }}>
                    Checklist Score: {run.score}/100
                  </span>
                )}
              </div>
            </div>

            {/* Actions: Run Swarm / Replay Webhook / Download PDF */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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

          {/* Quiet Swarm Status Line */}
          {loading && (
            <div className="quiet-status-line" role="status">
              <span className="breathing-dot" />
              <span>
                Adversarial swarm deliberating — Hound gathering evidence, Prosecutor drafting rebuttal, 3-Juror Panel auditing gaps…
              </span>
            </div>
          )}
        </div>

        {/* 2. Prominent Human Approval Gate (4px Ultraviolet Left Edge) */}
        {run && (
          <div className="approval-gate-card">
            <div className="approval-gate-header">
              <h3>Human Approval Gate (Strictly Mandatory)</h3>
              <span className="chip ultraviolet">
                Recommended: {actionForVerdict ?? "—"}
              </span>
            </div>

            {detail.approval ? (
              <p style={{ margin: "6px 0", fontSize: 13.5 }}>
                Approved: <b>{detail.approval.action}</b>
                {detail.approval.action === "make-offer" && detail.approval.offer_amount && (
                  <>
                    {" "}
                    — offer{" "}
                    <b>
                      ${parseFloat(detail.approval.offer_amount.value).toFixed(2)} USD
                    </b>{" "}
                    (REFUND, buyer keeps the item)
                  </>
                )}{" "}
                by <b>{detail.approval.approved_by ?? "merchant"}</b> at{" "}
                <span className="timestamp">{detail.approval.approved_at}</span>
              </p>
            ) : (
              <p style={{ margin: "6px 0", fontSize: 13.5, color: "var(--text-secondary)" }}>
                No approval recorded yet. No action will execute on PayPal without explicit merchant sign-off.
              </p>
            )}

            {run.verdict === "CONCEDE_FAST_SETTLE" && (
              <p className="gaplist" style={{ marginTop: 10 }}>
                Manual next step (not automated): file a carrier insurance claim for the lost package — PHALANX concedes the PayPal dispute to avoid dispute fees but does not file carrier claims automatically.
              </p>
            )}

            {detail.execution && (
              <p className="gaplist" style={{ marginTop: 10 }}>
                Last execution attempt: <b>{detail.execution.paypal_status}</b> — {detail.execution.note}
              </p>
            )}

            <div className="gate-actions">
              <button
                className="primary"
                onClick={() =>
                  actionForVerdict && approve(detail.dispute.id, actionForVerdict)
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
              Execute is strictly disabled until Approve is logged and the action is permitted by PayPal. In seeded mode, Execute records a logged refusal.
            </p>
          </div>
        )}

        {/* 3. Judge Framing & Reasoning Callout (No raw Markdown **) */}
        {run && (run.issue_framing || run.verdict_reasoning) && (
          <div className="judge-card">
            <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>
              Judge Framing &amp; Verdict Summary (Advisory Layer)
            </h3>
            {run.issue_framing && (
              <p style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.55 }}>
                <b style={{ color: "var(--text-ink)" }}>Issue Framing:</b> {cleanMarkdown(run.issue_framing)}
              </p>
            )}
            {run.verdict_reasoning && (
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
                <b style={{ color: "var(--text-ink)" }}>Verdict Explanation:</b> {cleanMarkdown(run.verdict_reasoning)}
              </p>
            )}
            <p className="footnote">
              <b>Safety Guarantee:</b> The routing verdict ({run.verdict}) is strictly computed from the deterministic 0–100 checklist score ({run.score}/100), never by an LLM.
            </p>
          </div>
        )}

        {/* 4. Evidence Sources */}
        <div className="detail-section">
          <h3>Evidence Sources ({detail.artifacts.length})</h3>
          {detail.artifacts.length === 0 ? (
            <p className="gaplist">No artifacts in store.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {detail.artifacts.map((a, idx) => (
                <div
                  key={a.id}
                  style={{
                    padding: "12px 16px",
                    background: "var(--bg-muted)",
                    border: "1px solid var(--border-hairline)",
                    borderRadius: "var(--radius-card)",
                    fontSize: 13.5,
                  }}
                >
                  <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="chip font-mono">[{idx + 1}] {a.kind}</span>
                    {a.simulated && <span className="chip sim">SIMULATED</span>}
                  </div>
                  <div style={{ color: "var(--text-ink)" }}>{a.summary}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {run && (
          <>
            {/* 5. Score Progression */}
            <div className="detail-section">
              <h3>Checklist Score — Iteration Progression</h3>
              {run.iterations.map((it) => (
                <p
                  key={it.iteration}
                  style={{
                    margin: "6px 0",
                    fontSize: 13.5,
                  }}
                >
                  <span className="font-mono" style={{ color: "var(--text-secondary)" }}>
                    {it.draft_version}:
                  </span>{" "}
                  <span className="tabular-nums font-mono">{it.score_before}</span> →{" "}
                  <b className="tabular-nums font-mono">{it.score}/100</b> · {it.verdict} ·{" "}
                  <span
                    style={{
                      fontWeight: 600,
                      color: it.accepted ? "var(--verdict-contest-text)" : "var(--verdict-offer-text)",
                    }}
                  >
                    {it.accepted ? "ACCEPTED" : "REJECTED"}
                  </span>
                </p>
              ))}
              <p className="footnote">
                Final Score: <b className="font-mono">{run.score}/100</b> — deterministic checklist score, NEVER a win probability. Loop duration: <span className="font-mono">{run.duration_ms} ms</span>.
              </p>
            </div>

            {/* 6. Named Gaps */}
            <div className="detail-section">
              <h3>Named Gaps Identified by Red-Team / Jurors</h3>
              {run.gaps.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-secondary)" }}>
                  No gaps identified — every checklist requirement is substantiated with an evidence artifact.
                </p>
              ) : (
                <ul className="gaplist">
                  {run.gaps.map((g) => (
                    <li key={g} style={{ margin: "4px 0" }}>{g}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* 7. Deterministic Outcome & Break-Even Matrix */}
            {run.ev_display && (
              <div className="detail-section">
                <h3>
                  Deterministic Outcome &amp; Break-Even Matrix — Not a Prediction
                </h3>
                <dl className="kv">
                  <dt>Contest (if upheld)</dt>
                  <dd>
                    $0.00 net loss (${parseFloat(detail.dispute.amount.value).toFixed(2)} retained; $15 dispute fee waived)
                  </dd>
                  <dt>Contest (if lost)</dt>
                  <dd>
                    -$
                    {(
                      run.ev_display.contest_lost_cost_usd ??
                      run.ev_display.concede_cost
                    ).toFixed(2)}{" "}
                    USD (${parseFloat(detail.dispute.amount.value).toFixed(2)} claim + $
                    {run.ev_display.fee_usd.toFixed(2)} fee)
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
                    USD settled in INQUIRY ($0 PayPal fee)
                  </dd>
                  <dt>Immediate concede</dt>
                  <dd>
                    -$
                    {(
                      run.ev_display.concede_cost_usd ??
                      run.ev_display.concede_cost
                    ).toFixed(2)}{" "}
                    USD (immediate settlement)
                  </dd>
                  {typeof run.ev_display.breakeven_win_rate_vs_offer_pct === "number" && (
                    <>
                      <dt>Break-even vs. offer</dt>
                      <dd>
                        Contesting beats a $
                        {(
                          run.ev_display.offer_cost_usd ??
                          run.ev_display.offer_cost
                        ).toFixed(2)}{" "}
                        offer only if true external win odds exceed{" "}
                        <b>{run.ev_display.breakeven_win_rate_vs_offer_pct}%</b> (not estimated by PHALANX)
                      </dd>
                    </>
                  )}
                  <dt>Fee basis</dt>
                  <dd>{run.ev_display.fee_basis}</dd>
                </dl>
              </div>
            )}

            {/* 8. Adversarial Debate Transcript */}
            <div className="detail-section">
              <h3>Adversarial Debate Transcript</h3>
              {run.messages.map((m, i) => (
                <div key={i} className={`msg ${m.kind}`}>
                  <div className="actor">
                    {m.actor} · Iteration {m.iteration} · {m.kind}
                  </div>
                  <pre>{cleanMarkdown(m.text)}</pre>
                </div>
              ))}
            </div>

            {/* 9. Evidence Dossier & Allowed Actions */}
            <div className="detail-section">
              <h3>Evidence Dossier (PDF) &amp; Allowed Actions</h3>
              <p style={{ margin: "0 0 12px" }}>
                <a
                  className="pdf-link"
                  href={`/api/disputes/${detail.dispute.id}/evidence.pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download Evidence Dossier (5-Page PDF) ↗
                </a>{" "}
                <span className="footnote" style={{ display: "inline", marginLeft: 8 }}>
                  Preview before approval; carries immutable SIMULATED watermark.
                </span>
              </p>
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 13.5, color: "var(--text-secondary)" }}>
                  PayPal allowed actions for {detail.dispute.id}…
                </summary>
                <pre
                  style={{
                    fontSize: 12,
                    background: "var(--bg-muted)",
                    padding: 14,
                    borderRadius: "var(--radius-card)",
                    marginTop: 8,
                    border: "1px solid var(--border-hairline)",
                  }}
                >
                  {JSON.stringify(detail.dispute.allowed_actions, null, 2)}
                  {detail.dispute.source === "seeded"
                    ? "\n(SIMULATED allowed action list for seeded demo scenarios.)"
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
