// Split-Pane Dispute Defense Studio (Gemini directive §3.5) —
// 12-col asymmetric split: 7-col left (verdict hero, practical
// reasons, named gaps, debate transcript) + 5-col right (Evidence
// Vault, rebuttal preview, hardware approval gate). All handlers and
// data contracts are the verified ones from the previous studio:
// GET /api/disputes/[id], POST run/approve/execute, POST/DELETE
// evidence, GET evidence.pdf. Live Sandbox Execute uses the EXISTING
// Sandbox-only execute route/gate — that logic is not rewritten here.
// Verdict bands are the locked 35/75 thresholds.
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AttachedEvidence,
  Dispute,
  EvidenceArtifact,
  EvidenceType,
  NamedGap,
  SwarmRun,
  Verdict,
} from "@/lib/types";
import { useSpotlight } from "@/lib/ui-effects";
import CommandNavbar from "@/components/command-navbar";
import EvidenceVault from "@/components/evidence-vault";
import styles from "@/components/detail.module.css";
import {
  AnimatedCounter,
  CopyChip,
  SpotlightCard,
  SwarmPipelineVisualizer,
} from "@/components/ui/micro-interactions";

interface DetailData {
  dispute: Dispute;
  artifacts: EvidenceArtifact[];
  attached_evidence?: AttachedEvidence[];
  base_score?: number;
  final_score?: number;
  evidenceHoldWarning?: boolean;
  missingChecklistPoints?: number;
  emptySlots?: { key: string; label: string; points: number }[];
  practical_reasons?: string[];
  named_gaps?: NamedGap[];
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

function verdictBand(score: number): "contest" | "offer" | "concede" {
  if (score >= 75) return "contest";
  if (score >= 35) return "offer";
  return "concede";
}

/** Animated radial score meter: SVG ring interpolating to the score
 *  with a CSS transition; centre counts with AnimatedCounter. Colour
 *  follows the real verdict bands (>=75 emerald, 35–74 amber, <35 rose). */
function RadialScoreMeter({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const band = verdictBand(score);
  return (
    <div
      className="radial-meter"
      role="img"
      aria-label={`Checklist score ${score} out of 100`}
    >
      <svg viewBox="0 0 120 120" width="120" height="120">
        <circle cx="60" cy="60" r={r} className="radial-track" />
        <circle
          cx="60"
          cy="60"
          r={r}
          className={`radial-fill ${band}`}
          strokeDasharray={c}
          strokeDashoffset={c - (score / 100) * c}
        />
      </svg>
      <div className="radial-centre">
        <span className="radial-score">
          <AnimatedCounter value={score} />
        </span>
        <span className="radial-of">/ 100</span>
      </div>
    </div>
  );
}

/** Split a practical-reason string like "[+45 pts] Carrier tracking
 *  shows DELIVERED…" into its point badge and body text. */
function splitReason(reason: string): { pts: number | null; text: string } {
  const m = reason.match(/^\[([+-]?\d+)\s*pts\]\s*(.*)$/s);
  if (!m) return { pts: null, text: reason };
  return { pts: parseInt(m[1], 10), text: m[2] };
}

type DebateFilter =
  | "all"
  | "hound"
  | "prosecutor"
  | "red-team"
  | "evidence"
  | "policy"
  | "buyer"
  | "judge";

const DEBATE_FILTERS: { key: DebateFilter; label: string }[] = [
  { key: "all", label: "All Stages" },
  { key: "hound", label: "Hound" },
  { key: "prosecutor", label: "Prosecutor" },
  { key: "red-team", label: "Red-Team" },
  { key: "evidence", label: "Evidence Juror" },
  { key: "policy", label: "Policy Juror" },
  { key: "buyer", label: "Buyer-Sympathy Juror" },
  { key: "judge", label: "Judge" },
];

export default function DisputeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Evidence Vault state (type is parent-owned so a Named Gap can
  // pre-select it; the vault owns file/notes/upload state).
  const [evidenceType, setEvidenceType] = useState<EvidenceType>("INVOICE");
  const [highlightedEvidenceType, setHighlightedEvidenceType] =
    useState<EvidenceType | null>(null);
  const vaultRef = useRef<HTMLDivElement | null>(null);

  // Debate accordion state
  const [showFullDebate, setShowFullDebate] = useState(false);
  const [debateFilter, setDebateFilter] = useState<DebateFilter>("all");

  // Micro-interactions
  useSpotlight();
  const [justApproved, setJustApproved] = useState(false);
  const [gaugePulse, setGaugePulse] = useState(false);

  // Pre-concede evidence hold (workstream B): merchant confirmation
  // that no tracking / delivery proof / fulfillment log exists, required
  // before an accept-claim approval on a bare live dispute.
  const [confirmedNoEvidence, setConfirmedNoEvidence] = useState(false);

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
      void loadDispute(id);
    }
  }, [id, loadDispute]);

  const pulseScore = detail?.run?.score ?? detail?.final_score;
  useEffect(() => {
    if (pulseScore === undefined) return;
    setGaugePulse(true);
    const t = window.setTimeout(() => setGaugePulse(false), 650);
    return () => window.clearTimeout(t);
  }, [pulseScore]);

  // Hooks must ALL run before any early return. The two useMemos below
  // previously sat after the loading/error returns, so the loaded render
  // ran two more hooks than the loading render (React error #310 — the
  // detail page crashed in the browser). `run` is null while loading;
  // both memos are null-safe over it.
  const run = detail?.run ?? null;

  const filteredMessages = useMemo(() => {
    const messages = run?.messages ?? [];
    if (debateFilter === "all") return messages;
    const match: Record<Exclude<DebateFilter, "all">, (actor: string) => boolean> = {
      hound: (a) => a.startsWith("Hound"),
      prosecutor: (a) => a.startsWith("Prosecutor"),
      "red-team": (a) => a.includes("Red-Team"),
      evidence: (a) => a.includes("Evidence"),
      policy: (a) => a.includes("Policy"),
      buyer: (a) => a.includes("Buyer-Sympathy"),
      judge: (a) => a.startsWith("Judge"),
    };
    return messages.filter((m) => match[debateFilter](m.actor));
  }, [run, debateFilter]);

  // Real phase durations from the completed run, keyed by pipeline
  // stage id ("01".."06") — never invented.
  const pipelineDurations = useMemo(() => {
    const out: Partial<Record<string, number | null>> = {};
    const phases = run?.phases ?? [];
    const take = (key: string, ms: number | null) => {
      if (ms == null) return;
      out[key] = Math.max(out[key] ?? 0, ms);
    };
    for (const ph of phases) {
      const a = ph.actor ?? "";
      if (a.startsWith("Hound")) take("01", ph.duration_ms);
      else if (a.startsWith("Prosecutor")) take("02", ph.duration_ms);
      else if (a.includes("Red-Team") || a.includes("Jury")) {
        take("03", ph.duration_ms);
        take("04", ph.duration_ms);
      } else if (a.startsWith("Judge")) take("05", ph.duration_ms);
      else if (a.startsWith("Arbiter")) take("06", ph.duration_ms);
    }
    return out;
  }, [run]);

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
        body: JSON.stringify({
          action,
          approved_by: "merchant",
          ...(confirmedNoEvidence
            ? { confirmed_no_evidence: true }
            : {}),
        }),
      });
      if (res.ok) {
        await loadDispute(disputeId);
        setConfirmedNoEvidence(false);
        setNotice(`Approved action: ${action}`);
        setJustApproved(true);
        window.setTimeout(() => setJustApproved(false), 1300);
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

  const handleRemoveEvidence = async (evidenceId: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/disputes/${id}/evidence?evidenceId=${encodeURIComponent(evidenceId)}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setNotice("Evidence attachment removed.");
        await loadDispute(id);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!id) return;
    await loadDispute(id);
    setNotice("Synced with PayPal Sandbox");
  };

  if (initialLoading) {
    return (
      <div className="phalanx-canvas">
        <CommandNavbar
          envMode="seeded"
          simulatedCount={0}
          evidenceHref="#evidence-vault"
          active="evidence"
        />
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
      <div className="phalanx-canvas">
        <CommandNavbar
          envMode="seeded"
          simulatedCount={0}
          evidenceHref="#evidence-vault"
          active="evidence"
        />
        <main className="detail-wrap">
          <div className="callout error">
            {error || `Dispute ${id} not found.`}
          </div>
          <Link className={`btn ${styles.magnetic}`} href="/dashboard">
            ← Return to Dispute Ledger
          </Link>
        </main>
      </div>
    );
  }

  const attached = detail.attached_evidence ?? [];
  const score = run ? run.score : (detail.final_score ?? 0);
  const baseScore = run?.base_score ?? detail.base_score ?? score;
  const verdict: Verdict = run
    ? run.verdict
    : score >= 75
      ? "CONTEST_HARD_PROOF"
      : score >= 35
        ? "DE_ESCALATE_OFFER"
        : "CONCEDE_FAST_SETTLE";
  const practicalReasons = detail.practical_reasons ?? run?.practical_reasons ?? [];
  const namedGaps = (detail.named_gaps ?? run?.named_gaps ?? []).filter(
    (g) => !g.resolved,
  );

  const actionForVerdict =
    verdict === "CONTEST_HARD_PROOF"
      ? "provide-evidence"
      : verdict === "DE_ESCALATE_OFFER"
        ? "make-offer"
        : "accept-claim";

  // Pre-concede evidence hold (workstream B): the hold applies when the
  // API flags a bare live dispute AND the recommended action is a full
  // refund (accept-claim). The Approve button stays disabled until the
  // merchant checks the confirmation box.
  const holdRequiresConfirm = Boolean(
    detail.evidenceHoldWarning &&
      verdict === "CONCEDE_FAST_SETTLE" &&
      actionForVerdict === "accept-claim",
  );

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

  const gateUnlocked = Boolean(
    detail.approval &&
      detail.approval.action !== "REQUIRES_REAPPROVAL_EVIDENCE_CHANGED",
  );

  const offerAmount =
    verdict === "DE_ESCALATE_OFFER"
      ? run?.ev_display?.offer_cost_usd ?? null
      : null;

  const latestRebuttal =
    run && run.iterations.length > 0
      ? run.iterations[run.iterations.length - 1].rebuttal_text
      : null;

  const fixGap = (gap: NamedGap) => {
    setEvidenceType(gap.recommendedEvidenceType);
    setHighlightedEvidenceType(gap.recommendedEvidenceType);
    vaultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="phalanx-canvas">
      <CommandNavbar
        envMode={detail.dispute.source === "sandbox" ? "sandbox" : "seeded"}
        simulatedCount={0}
        onSync={handleSync}
        syncing={loading}
        evidenceHref="#evidence-vault"
        active="evidence"
      />

      <main className="detail-wrap">
        <div className="breadcrumb-bar">
          <Link href="/dashboard" className={`breadcrumb-link ${styles.crumb}`}>
            All disputes
          </Link>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current font-mono">
            {detail.dispute.id}
          </span>
        </div>

        {notice && (
          <div className="callout notice">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="callout-dismiss"
            >
              ✕
            </button>
          </div>
        )}

        <SwarmPipelineVisualizer
          isRunning={loading}
          durations={pipelineDurations}
        />

        <div className="detail-split">
          <div className="detail-split-left">
            {/* Verdict hero card */}
            <SpotlightCard className={`detail-header-card ${styles.headerCard} ${styles.fadeReveal}`}>
              <div className="detail-header-top">
                <div className="detail-title-cluster">
                  <h1 className="font-mono detail-title">
                    {detail.dispute.id}
                    <CopyChip text={detail.dispute.id} label="Copy ID" />
                  </h1>
                  <p className="detail-meta-line">
                    <b>{detail.dispute.reason}</b> · $
                    {parseFloat(detail.dispute.amount.value).toFixed(2)} USD ·
                    Stage: {detail.dispute.dispute_life_cycle_stage} ·
                    Status: {detail.dispute.status}
                  </p>
                  <div className="detail-badges">
                    {detail.dispute.source === "seeded" ? (
                      <span className="badge sim">SEEDED — SIMULATED</span>
                    ) : (
                      <span className="badge live">LIVE SANDBOX</span>
                    )}
                    {run ? verdictBadge(verdict) : <span className="badge na">NOT RUN</span>}
                    <span className="chip tabular-nums detail-score-chip">
                      Deterministic Score:{" "}
                      <AnimatedCounter value={score} />
                      /100
                    </span>
                    {score > baseScore && (
                      <span className="badge strong">
                        Base Score {baseScore} → Updated Score {score} (+
                        {score - baseScore} pts from Attached Evidence)
                      </span>
                    )}
                  </div>

                  <div className="score-meter-row">
                    <RadialScoreMeter score={score} />
                    <div className="score-gauge-col">
                      <div
                        className="score-gauge"
                        role="img"
                        aria-label={`Checklist score ${score} out of 100`}
                      >
                        <div
                          className={`score-gauge-fill ${verdictBand(score)}${gaugePulse ? " pulse" : ""}`}
                          style={{ width: `${score}%` }}
                        />
                        <div className="score-gauge-marker" style={{ left: "35%" }}>
                          <span>35</span>
                        </div>
                        <div className="score-gauge-marker" style={{ left: "75%" }}>
                          <span>75</span>
                        </div>
                      </div>
                      <div className="score-gauge-labels">
                        <span>0 · Concede &lt;35</span>
                        <span>Offer 35–74</span>
                        <span>Contest ≥75 · 100</span>
                      </div>
                    </div>
                  </div>

                  {/* Arbiter route banner */}
                  <div
                    className={`arbiter-banner ${verdictBand(score)}`}
                    role="status"
                  >
                    <span className="arbiter-banner-verdict">{verdict}</span>
                    <span className="arbiter-banner-action">
                      → {actionForVerdict}
                      {offerAmount !== null &&
                        ` ($${offerAmount.toFixed(2)})`}
                    </span>
                  </div>
                </div>

                <div className="detail-header-actions">
                  <button
                    className={`primary ${styles.magnetic}`}
                    onClick={() => runSwarm(detail.dispute.id)}
                    disabled={loading}
                  >
                    {loading
                      ? "Deliberating…"
                      : run
                        ? "Re-Run Swarm"
                        : "Run Swarm"}
                  </button>
                  <a
                    className={`pdf-link ${styles.magnetic}`}
                    href={`/api/disputes/${detail.dispute.id}/evidence.pdf`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download PDF Dossier ↗
                    <span className="pdf-page-badge font-mono tabular-nums">
                      {5 + attached.length} pages
                    </span>
                  </a>
                </div>
              </div>
            </SpotlightCard>

            {loading && (
              <div className="quiet-status-line" role="status">
                <span className="breathing-dot" />
                <span>
                  Adversarial swarm deliberating — Hound extracting evidence,
                  Prosecutor drafting rebuttal, 3-Juror Quorum auditing gaps…
                </span>
              </div>
            )}

            {/* Why this verdict — 2–3 practical reasons */}
            <SpotlightCard className={`reasons-card ${styles.fadeReveal}`}>
              <h3 className="studio-h3">
                Why This Verdict (Deterministic Checklist Findings)
              </h3>
              {practicalReasons.length > 0 ? (
                <ul className="reasons-list">
                  {practicalReasons.map((r, i) => {
                    const { pts, text } = splitReason(r);
                    return (
                      <li
                        key={i}
                        className={`reason-row stagger-item ${styles.reasonRow}`}
                        style={{ animationDelay: `${i * 70}ms` }}
                      >
                        <span
                          className={`reason-icon ${pts !== null && pts > 0 ? "pass" : pts === 0 ? "fail" : "neutral"}`}
                          aria-hidden="true"
                        >
                          {pts !== null && pts > 0
                            ? "✓"
                            : pts === 0
                              ? "✕"
                              : "•"}
                        </span>
                        <span className="reason-text">{text}</span>
                        {pts !== null && (
                          <span className="font-mono tabular-nums reason-pts">
                            +{pts} pts
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="studio-empty">
                  Run the adversarial swarm to evaluate the deterministic
                  checklist against merchant evidence.
                </p>
              )}
            </SpotlightCard>

            {/* Named gaps grid (max 3) with cross-pane hover sync */}
            <div className={`card-white gaps-card ${styles.reveal}`}>
              <div className="gaps-head">
                <h3 className="studio-h3">Named Gaps &amp; Actionable Fixes</h3>
                <span className="chip">{namedGaps.length} Unresolved</span>
              </div>

              {namedGaps.length === 0 ? (
                <div className="gaps-all-clear">
                  ✓ All primary checklist requirements satisfied. No critical
                  evidentiary gaps remaining.
                </div>
              ) : (
                <div className="gaps-grid">
                  {namedGaps.slice(0, 3).map((g, gi) => (
                    <SpotlightCard
                      key={g.code}
                      className={`gap-card stagger-item ${styles.gapCard} ${styles.fadeReveal}${highlightedEvidenceType === g.recommendedEvidenceType ? " highlighted" : ""}`}
                      onMouseEnter={() =>
                        setHighlightedEvidenceType(g.recommendedEvidenceType)
                      }
                      onMouseLeave={() => setHighlightedEvidenceType(null)}
                      onFocus={() =>
                        setHighlightedEvidenceType(g.recommendedEvidenceType)
                      }
                      onBlur={() => setHighlightedEvidenceType(null)}
                    >
                      <div className="gap-card-top">
                        <span className="gap-card-title">{g.title}</span>
                        <span className="badge offer gap-card-pts">
                          +{g.scoreImpactPts} pts recoverable
                        </span>
                      </div>
                      <p className="gap-card-summary">{g.summary}</p>
                      <div className="gap-card-foot">
                        <span className="gap-card-consensus">
                          Flagged by {g.citedBy.length}/3 Jurors · Collapsed
                          from {g.rawCount} raw note
                          {g.rawCount === 1 ? "" : "s"}
                        </span>
                        <button
                          type="button"
                          className="chip obsidian gap-attach-btn"
                          onClick={() => fixGap(g)}
                        >
                          Fix Gap: Attach {g.recommendedEvidenceType} →
                        </button>
                      </div>
                    </SpotlightCard>
                  ))}
                </div>
              )}
            </div>

            {/* Collapsible full debate transcript */}
            <div className={`card-white debate-card ${styles.reveal}`}>
              <button
                type="button"
                className={`btn debate-toggle ${styles.debateToggle}`}
                onClick={() => setShowFullDebate(!showFullDebate)}
                aria-expanded={showFullDebate}
              >
                <span className="debate-toggle-label">
                  <span
                    className={`debate-toggle-chevron${showFullDebate ? " open" : ""}`}
                  >
                    ▸
                  </span>{" "}
                  {showFullDebate ? "Hide" : "View"} full swarm debate
                  transcript (3 jurors · {namedGaps.length} named gaps ·
                  Red-Team audit)
                </span>
                <span className="debate-toggle-state">
                  {showFullDebate ? "Collapse" : "Expand"}
                </span>
              </button>

              <div className={`debate-panel${showFullDebate ? " open" : ""}`}>
                <div className="debate-panel-inner">
                  {run && (run.issue_framing || run.verdict_reasoning) && (
                    <div className="judge-card">
                      <h4 className="debate-h4">
                        Judge Judicial Framing &amp; Rationale
                      </h4>
                      {run.issue_framing && (
                        <p className="debate-p">
                          <b>Issue Framing:</b>{" "}
                          {cleanMarkdown(run.issue_framing)}
                        </p>
                      )}
                      {run.verdict_reasoning && (
                        <p className="debate-p">
                          <b>Verdict Reasoning:</b>{" "}
                          {cleanMarkdown(run.verdict_reasoning)}
                        </p>
                      )}
                    </div>
                  )}

                  {run && (
                    <div className="debate-block">
                      <h4 className="debate-h4">Iteration Progression</h4>
                      {run.iterations.map((it) => (
                        <p key={it.iteration} className="debate-p">
                          <span className="font-mono">
                            {it.draft_version}:
                          </span>{" "}
                          <span className="tabular-nums font-mono">
                            {it.score_before}
                          </span>{" "}
                          →{" "}
                          <b className="tabular-nums font-mono">
                            {it.score}/100
                          </b>{" "}
                          · {it.verdict} ·{" "}
                          <span
                            className={
                              it.accepted ? "debate-accepted" : "debate-rejected"
                            }
                          >
                            {it.accepted ? "ACCEPTED" : "REJECTED"}
                          </span>
                        </p>
                      ))}
                    </div>
                  )}

                  {run?.ev_display && (
                    <div className="debate-block">
                      <h4 className="debate-h4">
                        Deterministic Outcome Matrix
                      </h4>
                      <dl className="kv">
                        <dt>Contest (if upheld)</dt>
                        <dd>
                          $0.00 net loss ($
                          {parseFloat(detail.dispute.amount.value).toFixed(2)}{" "}
                          retained; $15 fee waived)
                        </dd>
                        <dt>Contest (if lost)</dt>
                        <dd>
                          -$
                          {(
                            run.ev_display.contest_lost_cost_usd ??
                            run.ev_display.concede_cost
                          ).toFixed(2)}{" "}
                          USD ($
                          {parseFloat(detail.dispute.amount.value).toFixed(2)}{" "}
                          + ${run.ev_display.fee_usd.toFixed(2)} fee)
                        </dd>
                        <dt>
                          Partial offer ({run.ev_display.offer_pct ?? 40}%
                          refund)
                        </dt>
                        <dd>
                          -$
                          {(
                            run.ev_display.offer_cost_usd ??
                            run.ev_display.offer_cost
                          ).toFixed(2)}{" "}
                          USD ($0 PayPal fee)
                        </dd>
                        <dt>Immediate concede</dt>
                        <dd>
                          -$
                          {(
                            run.ev_display.concede_cost_usd ??
                            run.ev_display.concede_cost
                          ).toFixed(2)}{" "}
                          USD
                        </dd>
                      </dl>
                    </div>
                  )}

                  {run?.messages && run.messages.length > 0 && (
                    <div>
                      <h4 className="debate-h4">Message Transcript</h4>
                      <div
                        className="debate-filters"
                        role="tablist"
                        aria-label="Filter debate transcript"
                      >
                        {DEBATE_FILTERS.map(({ key, label }) => (
                          <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={debateFilter === key}
                            className={`debate-filter-pill ${styles.debatePill}${debateFilter === key ? " active" : ""}`}
                            onClick={() => setDebateFilter(key)}
                          >
                            {label}
                          </button>
                        ))}
                        <span className="debate-filter-count font-mono tabular-nums">
                          {filteredMessages.length} / {run.messages.length}{" "}
                          messages
                        </span>
                      </div>
                      {filteredMessages.length === 0 ? (
                        <p className="studio-empty">
                          No messages from this stage in this run.
                        </p>
                      ) : (
                        filteredMessages.map((m, i) => (
                          <div key={i} className={`msg ${m.kind}`}>
                            <div className="actor">
                              {m.actor} · Iteration {m.iteration} · {m.kind}
                            </div>
                            <pre>{cleanMarkdown(m.text)}</pre>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="detail-split-right">
            <EvidenceVault
              disputeId={detail.dispute.id}
              attached={attached}
              evidenceType={evidenceType}
              onEvidenceTypeChange={setEvidenceType}
              highlightedType={highlightedEvidenceType}
              onAttached={() => {
                void loadDispute(detail.dispute.id);
              }}
              onRemove={handleRemoveEvidence}
              busy={loading}
              vaultRef={vaultRef}
            />

            {/* Prosecutor rebuttal preview */}
            <div className={`card-white rebuttal-card ${styles.reveal}`}>
              <div className="rebuttal-head">
                <h3 className="studio-h3">Prosecutor Rebuttal Preview</h3>
                {latestRebuttal && (
                  <CopyChip
                    text={cleanMarkdown(latestRebuttal)}
                    label="Copy Rebuttal Text"
                  />
                )}
              </div>
              {latestRebuttal ? (
                <pre className="rebuttal-text">
                  {cleanMarkdown(latestRebuttal)}
                </pre>
              ) : (
                <p className="studio-empty">
                  Run the swarm to generate the evidence-backed rebuttal
                  draft.
                </p>
              )}
            </div>

            {/* Pre-concede evidence hold banner (workstream B): renders
                even when no swarm run exists yet — the hold is about the
                dispute state, not the run. */}
            {detail.evidenceHoldWarning && (
              <div
                className="evidence-hold-banner"
                role="alert"
                style={{
                  background: "#FEF3C7",
                  border: "2px solid #D97706",
                  borderRadius: "12px",
                  padding: "14px 16px",
                  marginBottom: "16px",
                  color: "#78350F",
                  fontSize: "14px",
                  lineHeight: 1.5,
                }}
              >
                ⚠️ Bare PayPal Payload Detected (Score:{" "}
                {detail.final_score ?? 0}/100). PayPal supplied 0 tracking
                or fulfillment records. If you have a carrier receipt, POD,
                merchant log, or invoice, attach them BEFORE approving —
                attaching proof raises this dispute to 60 (Offer) or 85–100
                (Contest).
              </div>
            )}

            {/* Hardware-style mandatory human approval gate */}
            {run && (
              <div
                className={`approval-gate-card ${styles.gate}${gateUnlocked ? " unlocked" : ""}${justApproved ? " gate-just-approved" : ""}`}
              >
                <div className="approval-gate-header">
                  <h3>
                    <svg
                      className={`gate-lock-svg${gateUnlocked ? " unlocked" : ""}`}
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      aria-hidden="true"
                    >
                      <rect
                        x="5"
                        y="10"
                        width="14"
                        height="10"
                        rx="2"
                        fill="currentColor"
                      />
                      <path
                        className="gate-shackle"
                        d="M8 10 V7 a4 4 0 0 1 8 0 v3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <circle cx="12" cy="14.5" r="1.6" fill="var(--bg-white)" />
                    </svg>{" "}
                    Human Approval Gate (Strictly Mandatory)
                  </h3>
                  <span className="chip obsidian">
                    Recommended: {actionForVerdict}
                  </span>
                </div>

                {detail.approval &&
                detail.approval.action !==
                  "REQUIRES_REAPPROVAL_EVIDENCE_CHANGED" ? (
                  <p className="gate-status">
                    Approved: <b>{detail.approval.action}</b>
                    {detail.approval.action === "make-offer" &&
                      detail.approval.offer_amount && (
                        <>
                          {" "}
                          — offer{" "}
                          <b>
                            $
                            {parseFloat(
                              detail.approval.offer_amount.value,
                            ).toFixed(2)}{" "}
                            USD
                          </b>{" "}
                          (REFUND, buyer keeps the item)
                        </>
                      )}{" "}
                    by <b>{detail.approval.approved_by ?? "merchant"}</b> at{" "}
                    <span className="timestamp">
                      {detail.approval.approved_at}
                    </span>
                  </p>
                ) : (
                  <p className="gate-status gate-status-muted">
                    {detail.approval?.action ===
                    "REQUIRES_REAPPROVAL_EVIDENCE_CHANGED"
                      ? "Evidence packet was updated. Re-approval is strictly required before execution."
                      : "No approval recorded yet. No action will execute on PayPal without explicit merchant sign-off."}
                  </p>
                )}

                {verdict === "CONCEDE_FAST_SETTLE" && (
                  <p className="gaplist gate-note">
                    Manual next step (not automated): file a carrier insurance
                    claim for the lost package — PHALANX concedes the PayPal
                    dispute to avoid dispute fees but does not file carrier
                    claims automatically.
                  </p>
                )}

                {holdRequiresConfirm && (
                  <label
                    className="evidence-hold-confirm"
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "8px",
                      margin: "12px 0",
                      fontSize: "14px",
                      lineHeight: 1.5,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={confirmedNoEvidence}
                      onChange={(e) =>
                        setConfirmedNoEvidence(e.target.checked)
                      }
                      style={{ marginTop: "3px" }}
                    />
                    <span>
                      I confirm no tracking, delivery proof, or fulfillment
                      log exists for this transaction (Authorize Full Refund
                      via accept-claim)
                    </span>
                  </label>
                )}

                {detail.execution && (
                  <p className="gaplist gate-note">
                    Last execution attempt:{" "}
                    <b>{detail.execution.paypal_status}</b> —{" "}
                    {detail.execution.note}
                  </p>
                )}

                <div className="gate-actions">
                  <button
                    className={`primary ${styles.magnetic}`}
                    onClick={() => approve(detail.dispute.id, actionForVerdict)}
                    disabled={
                      !isApproveAllowed ||
                      loading ||
                      (holdRequiresConfirm && !confirmedNoEvidence)
                    }
                  >
                    Approve {actionForVerdict}
                  </button>
                  <button
                    className={`danger ${styles.press}`}
                    onClick={() => execute(detail.dispute.id)}
                    disabled={!isExecuteAllowed || loading}
                  >
                    Execute (gated)
                  </button>
                </div>
                <p className="footnote">
                  Execute is strictly disabled until Approve is logged and the
                  action is permitted by PayPal. In seeded mode, Execute
                  records a logged refusal.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
