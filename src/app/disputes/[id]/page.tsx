"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AttachedEvidence,
  Dispute,
  EvidenceArtifact,
  EvidenceType,
  NamedGap,
  SwarmRun,
  Verdict,
} from "@/lib/types";
import { useNavPill, useSpotlight } from "@/lib/ui-effects";

interface DetailData {
  dispute: Dispute;
  artifacts: EvidenceArtifact[];
  attached_evidence?: AttachedEvidence[];
  base_score?: number;
  final_score?: number;
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

/** One-click copy: icon morphs to an emerald check with a "Copied"
 *  tooltip for 1.5s. Clipboard API with a textarea fallback. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      className="copy-btn"
      onClick={copy}
      aria-label={`Copy ${label}`}
      title={copied ? "Copied" : `Copy ${label}`}
    >
      {copied ? <span className="copy-check">✓</span> : <span>⧉</span>}
      {copied && <span className="copy-tip">Copied</span>}
    </button>
  );
}

/** Animated score ticker: counts to the new score over ~450ms with an
 *  ease-out cubic. Instant when the user prefers reduced motion. */
function ScoreTicker({ score, baseScore }: { score: number; baseScore: number }) {
  const [shown, setShown] = useState(baseScore);
  const prevRef = useRef(baseScore);
  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = score;
    if (from === score) {
      setShown(score);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(score);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 450);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (score - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);
  return <>{shown}</>;
}

export default function DisputeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Attach modal state
  const [isAttaching, setIsAttaching] = useState(false);
  const [evidenceType, setEvidenceType] = useState<EvidenceType>("INVOICE");
  const [referenceId, setReferenceId] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Accordion state
  const [showFullDebate, setShowFullDebate] = useState(false);

  // Micro-interactions
  const navRef = useRef<HTMLElement | null>(null);
  useNavPill(navRef);
  useSpotlight();
  const [justApproved, setJustApproved] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [gaugePulse, setGaugePulse] = useState(false);

  const pulseScore = detail?.run?.score ?? detail?.final_score;
  useEffect(() => {
    if (pulseScore === undefined) return;
    setGaugePulse(true);
    const t = window.setTimeout(() => setGaugePulse(false), 650);
    return () => window.clearTimeout(t);
  }, [pulseScore]);

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

  const handleAttachSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !id) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("evidenceType", evidenceType);
      if (referenceId) formData.append("referenceId", referenceId);
      if (documentDate) formData.append("documentDate", documentDate);
      if (notes) formData.append("notes", notes);

      const res = await fetch(`/api/disputes/${id}/evidence`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || "Failed to attach evidence");
        return;
      }

      setNotice(`Attached ${selectedFile.name} successfully (+${data.delta} pts).`);
      setIsAttaching(false);
      setSelectedFile(null);
      setReferenceId("");
      setDocumentDate("");
      setNotes("");
      await loadDispute(id);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveEvidence = async (evidenceId: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/disputes/${id}/evidence?evidenceId=${encodeURIComponent(evidenceId)}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) {
        setNotice("Evidence attachment removed.");
        await loadDispute(id);
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
              <span className="chip obsidian">Dispute Inspector</span>
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
              <span className="chip obsidian">Dispute Inspector</span>
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
  const attached = detail.attached_evidence ?? [];
  const score = run ? run.score : (detail.final_score ?? 0);
  const baseScore = run?.base_score ?? detail.base_score ?? score;
  const verdict = run ? run.verdict : (score >= 75 ? "CONTEST_HARD_PROOF" : score >= 35 ? "DE_ESCALATE_OFFER" : "CONCEDE_FAST_SETTLE");
  const practicalReasons = detail.practical_reasons ?? run?.practical_reasons ?? [];
  const namedGaps = (detail.named_gaps ?? run?.named_gaps ?? []).filter((g) => !g.resolved);

  const actionForVerdict =
    verdict === "CONTEST_HARD_PROOF"
      ? "provide-evidence"
      : verdict === "DE_ESCALATE_OFFER"
        ? "make-offer"
        : "accept-claim";

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
            <span className="chip obsidian">PayPal Sandbox</span>
          </div>

          <nav className="nav-links" aria-label="Workbench navigation" ref={navRef}>
            <span className="nav-pill" aria-hidden="true" />
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
        {/* Breadcrumbs */}
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

        {/* ========================================================
            BLOCK 1: Practical Verdict Summary Card (Top Hero)
            ======================================================== */}
        <div className="detail-header-card">
          <div className="detail-header-top">
            <div className="detail-title-cluster">
              <h1 className="font-mono" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {detail.dispute.id}
                <CopyButton text={detail.dispute.id} label="dispute ID" />
              </h1>
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
                {run ? verdictBadge(verdict) : <span className="badge na">NOT RUN</span>}
                <span className="chip tabular-nums" style={{ fontWeight: 600 }}>
                  Deterministic Score: <ScoreTicker score={score} baseScore={baseScore} />/100
                </span>
                {score > baseScore && (
                  <span className="badge strong">
                    Base: {baseScore} → Updated: {score} (+{score - baseScore} from attached bills)
                  </span>
                )}
              </div>
              {/* Score gauge — thresholds 35 / 75, the real bands */}
              <div className="score-gauge" role="img" aria-label={`Checklist score ${score} out of 100`}>
                <div
                  className={`score-gauge-fill ${verdict === "CONTEST_HARD_PROOF" ? "contest" : verdict === "DE_ESCALATE_OFFER" ? "offer" : "concede"}${gaugePulse ? " pulse" : ""}`}
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

          {/* Why This Verdict (2–3 Practical Reasons) */}
          <div
            style={{
              marginTop: 12,
              padding: "16px 20px",
              background: "var(--bg-muted)",
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border-hairline)",
            }}
          >
            <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600, color: "var(--text-ink)" }}>
              Why This Verdict (Deterministic Checklist Findings)
            </h3>
            {practicalReasons.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {practicalReasons.map((r, i) => (
                  <li key={i} className="stagger-item" style={{ animationDelay: `${i * 50}ms` }}>{r}</li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                Run the adversarial swarm to evaluate the deterministic checklist against merchant evidence.
              </p>
            )}
          </div>

          {/* Quiet Deliberation Status */}
          {loading && (
            <div className="quiet-status-line" role="status">
              <span className="breathing-dot" />
              <span>
                Adversarial swarm deliberating — Hound extracting evidence, Prosecutor drafting rebuttal, 3-Juror Quorum auditing gaps…
              </span>
            </div>
          )}
        </div>

        {/* ========================================================
            BLOCK 2 & 3: Named Gaps (Left) + Attached Evidence Tray (Right)
            ======================================================== */}
        <div className="grid-2" style={{ gap: 20 }}>
          {/* BLOCK 2: Named Gaps & Actionable Fixes */}
          <div className="card-white" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-ink)" }}>
                Named Gaps &amp; Actionable Fixes
              </h3>
              <span className="chip" style={{ fontSize: 12 }}>
                {namedGaps.length} Unresolved
              </span>
            </div>

            {namedGaps.length === 0 ? (
              <div
                style={{
                  padding: "16px 20px",
                  background: "var(--verdict-contest-bg)",
                  color: "var(--verdict-contest-text)",
                  borderRadius: "var(--radius-card)",
                  fontSize: 13.5,
                  fontWeight: 500,
                  border: "1px solid var(--verdict-contest-border)",
                }}
              >
                ✓ All primary checklist requirements satisfied. No critical evidentiary gaps remaining.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {namedGaps.slice(0, 3).map((g, gi) => (
                  <div
                    key={g.code}
                    className="gap-card stagger-item"
                    style={{
                      animationDelay: `${gi * 50}ms`,
                      padding: "12px 16px",
                      background: "var(--bg-muted)",
                      borderRadius: "var(--radius-card)",
                      border: "1px solid var(--border-hairline)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text-ink)" }}>
                        {g.title}
                      </span>
                      <span className="badge offer" style={{ fontSize: 11 }}>
                        +{g.scoreImpactPts} pts recoverable
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.45 }}>
                      {g.summary}
                    </p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                      <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                        Flagged by {g.citedBy.length}/3 Jurors ({g.rawCount} findings collapsed)
                      </span>
                      <span className="chip obsidian gap-attach-btn" style={{ fontSize: 11, cursor: "pointer" }} onClick={() => setIsAttaching(true)}>
                        Fix: Attach {g.recommendedEvidenceType}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* BLOCK 3: Attached Bills & Evidence Tray */}
          <div className="card-white" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-ink)" }}>
                Evidence &amp; Attached Bills ({attached.length})
              </h3>
              <button
                className="primary"
                onClick={() => setIsAttaching(true)}
                style={{ fontSize: 12.5, padding: "5px 14px" }}
              >
                + Attach Bill / Evidence
              </button>
            </div>

            {attached.length === 0 ? (
              <div
                style={{
                  padding: "24px 20px",
                  background: "var(--bg-muted)",
                  borderRadius: "var(--radius-card)",
                  textAlign: "center",
                  border: "1px dashed var(--border-medium)",
                  fontSize: 13.5,
                  color: "var(--text-secondary)",
                }}
              >
                <p style={{ margin: "0 0 10px" }}>
                  No merchant bills or courier receipts attached yet.
                </p>
                <button
                  className="btn"
                  onClick={() => setIsAttaching(true)}
                  style={{ fontSize: 12.5 }}
                >
                  Attach bill / courier receipt now →
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {attached.map((att) => (
                  <div
                    key={att.id}
                    style={{
                      padding: "10px 14px",
                      background: "var(--bg-muted)",
                      borderRadius: "var(--radius-card)",
                      border: "1px solid var(--border-hairline)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-ink)" }}>
                          {att.fileName}
                        </span>
                        <span className="chip font-mono" style={{ fontSize: 11 }}>
                          {att.evidenceType}
                        </span>
                        <span
                          className={`badge ${att.quality === "STRONG" ? "strong" : "weak"}`}
                          style={{ fontSize: 11 }}
                        >
                          {att.quality} (+{att.scoreDelta} pts)
                        </span>
                      </div>
                      <div className="font-mono" style={{ fontSize: 11.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                        <span>
                          SHA-256: {att.sha256.slice(0, 12)}… · {(att.sizeBytes / 1024).toFixed(1)} KB
                          {att.referenceId ? ` · Ref: ${att.referenceId}` : ""}
                        </span>
                        <CopyButton text={att.sha256} label="SHA-256 hash" />
                      </div>
                    </div>
                    <button
                      className="btn"
                      onClick={() => handleRemoveEvidence(att.id)}
                      disabled={loading}
                      style={{ fontSize: 11.5, padding: "4px 10px", color: "var(--verdict-concede-text)" }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Attachment Upload Modal */}
        {isAttaching && (
          <div className="modal-backdrop" onClick={() => !uploading && setIsAttaching(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
                  Attach Merchant Bill / Evidence Document
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAttaching(false)}
                  disabled={uploading}
                  style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18 }}
                >
                  ✕
                </button>
              </div>

              {uploadError && <div className="callout error" style={{ margin: 0 }}>{uploadError}</div>}

              <form onSubmit={handleAttachSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Evidence Type</label>
                  <select
                    className="form-select"
                    value={evidenceType}
                    onChange={(e) => setEvidenceType(e.target.value as EvidenceType)}
                  >
                    <option value="INVOICE">INVOICE (Itemized bill / Order record: +15 pts)</option>
                    <option value="CARRIER_POD">CARRIER_POD (Signed Proof-of-Delivery: +25 pts)</option>
                    <option value="DELIVERY_PHOTO">DELIVERY_PHOTO (Visual condition proof / drop-off: +15 pts)</option>
                    <option value="TRACKING_RECEIPT">TRACKING_RECEIPT (Courier drop-off receipt: +20 pts)</option>
                    <option value="MERCHANT_LOG">MERCHANT_LOG (System / Fulfillment access log: +25 pts)</option>
                    <option value="EMAIL_CONFIRMATION">EMAIL_CONFIRMATION (Buyer communications: +10 pts)</option>
                    <option value="OTHER">OTHER (Supporting exhibit: +5 pts)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Reference ID (Invoice #, Tracking #, or Order ID)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. INV-88412 or 1Z999AA10123456784"
                    value={referenceId}
                    onChange={(e) => setReferenceId(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Document Date (YYYY-MM-DD)</label>
                  <input
                    type="date"
                    className="form-input"
                    value={documentDate}
                    onChange={(e) => setDocumentDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">File Document (PDF, PNG, JPG, TXT, JSON, CSV - Max 5 MB)</label>
                  <div
                    className={`dropzone${isDragOver ? " dragging" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) setSelectedFile(f);
                    }}
                  >
                    <span className="dropzone-icon">⇪</span>
                    <p style={{ margin: "6px 0 10px", fontSize: 13, color: "var(--text-secondary)" }}>
                      Drop a bill or courier receipt here, or choose a file below. The real SHA-256 is shown after upload.
                    </p>
                    <input
                      type="file"
                      className="form-input"
                      accept=".pdf,.png,.jpg,.jpeg,.txt,.json,.csv"
                      required
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setIsAttaching(false)}
                    disabled={uploading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="primary"
                    disabled={uploading || !selectedFile}
                  >
                    {uploading ? "Verifying & Rescoring…" : "Upload & Rescore"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================
            BLOCK 5: Mandatory Human Approval Gate & Dossier Download
            ======================================================== */}
        {run && (
          <div className={`approval-gate-card${gateUnlocked ? " unlocked" : ""}${justApproved ? " gate-just-approved" : ""}`}>
            <div className="approval-gate-header">
              <h3>
                <span className={`gate-lock${gateUnlocked ? " unlocked" : ""}`}>{gateUnlocked ? "🔓" : "🔒"}</span>{" "}
                Human Approval Gate (Strictly Mandatory)
              </h3>
              <span className="chip obsidian">
                Recommended: {actionForVerdict}
              </span>
            </div>

            {detail.approval && detail.approval.action !== "REQUIRES_REAPPROVAL_EVIDENCE_CHANGED" ? (
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
                {detail.approval?.action === "REQUIRES_REAPPROVAL_EVIDENCE_CHANGED"
                  ? "Evidence packet was updated. Re-approval is strictly required before execution."
                  : "No approval recorded yet. No action will execute on PayPal without explicit merchant sign-off."}
              </p>
            )}

            {verdict === "CONCEDE_FAST_SETTLE" && (
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
                onClick={() => approve(detail.dispute.id, actionForVerdict)}
                disabled={!isApproveAllowed || loading}
              >
                Approve {actionForVerdict}
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

        {/* ========================================================
            BLOCK 4: Collapsible Full Debate Section (Bottom Accordion)
            ======================================================== */}
        <div className="card-white" style={{ padding: "18px 24px" }}>
          <button
            type="button"
            className="btn"
            onClick={() => setShowFullDebate(!showFullDebate)}
            style={{ width: "100%", justifyContent: "space-between", border: "none", padding: "8px 0" }}
          >
            <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text-ink)" }}>
              <span className={`debate-toggle-chevron${showFullDebate ? " open" : ""}`}>▸</span>{" "}
              {showFullDebate ? "Hide" : "View"} full debate transcript (3 jurors · {namedGaps.length} named gaps · Red-Team audit)
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {showFullDebate ? "Collapse" : "Expand"}
            </span>
          </button>

          <div className={`debate-panel${showFullDebate ? " open" : ""}`}>
            <div className="debate-panel-inner">
              <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Judge Framing */}
              {run && (run.issue_framing || run.verdict_reasoning) && (
                <div className="judge-card" style={{ margin: 0 }}>
                  <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600 }}>
                    Judge Judicial Framing &amp; Rationale
                  </h4>
                  {run.issue_framing && (
                    <p style={{ margin: "0 0 8px", fontSize: 13, lineHeight: 1.5 }}>
                      <b>Issue Framing:</b> {cleanMarkdown(run.issue_framing)}
                    </p>
                  )}
                  {run.verdict_reasoning && (
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
                      <b>Verdict Reasoning:</b> {cleanMarkdown(run.verdict_reasoning)}
                    </p>
                  )}
                </div>
              )}

              {/* Iteration Score Progression */}
              {run && (
                <div style={{ padding: "14px 18px", background: "var(--bg-muted)", borderRadius: "var(--radius-card)" }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>Iteration Progression</h4>
                  {run.iterations.map((it) => (
                    <p key={it.iteration} style={{ margin: "4px 0", fontSize: 13 }}>
                      <span className="font-mono">{it.draft_version}:</span>{" "}
                      <span className="tabular-nums font-mono">{it.score_before}</span> →{" "}
                      <b className="tabular-nums font-mono">{it.score}/100</b> · {it.verdict} ·{" "}
                      <span style={{ fontWeight: 600, color: it.accepted ? "var(--verdict-contest-text)" : "var(--verdict-offer-text)" }}>
                        {it.accepted ? "ACCEPTED" : "REJECTED"}
                      </span>
                    </p>
                  ))}
                </div>
              )}

              {/* Deterministic Outcome Matrix */}
              {run?.ev_display && (
                <div style={{ padding: "14px 18px", background: "var(--bg-muted)", borderRadius: "var(--radius-card)" }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>Deterministic Outcome Matrix</h4>
                  <dl className="kv">
                    <dt>Contest (if upheld)</dt>
                    <dd>$0.00 net loss (${parseFloat(detail.dispute.amount.value).toFixed(2)} retained; $15 fee waived)</dd>
                    <dt>Contest (if lost)</dt>
                    <dd>
                      -${(run.ev_display.contest_lost_cost_usd ?? run.ev_display.concede_cost).toFixed(2)} USD (${parseFloat(detail.dispute.amount.value).toFixed(2)} + ${run.ev_display.fee_usd.toFixed(2)} fee)
                    </dd>
                    <dt>Partial offer ({run.ev_display.offer_pct ?? 40}% refund)</dt>
                    <dd>-${(run.ev_display.offer_cost_usd ?? run.ev_display.offer_cost).toFixed(2)} USD ($0 PayPal fee)</dd>
                    <dt>Immediate concede</dt>
                    <dd>-${(run.ev_display.concede_cost_usd ?? run.ev_display.concede_cost).toFixed(2)} USD</dd>
                  </dl>
                </div>
              )}

              {/* Full Message Log */}
              {run?.messages && run.messages.length > 0 && (
                <div>
                  <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600 }}>Message Transcript</h4>
                  {run.messages.map((m, i) => (
                    <div key={i} className={`msg ${m.kind}`}>
                      <div className="actor">
                        {m.actor} · Iteration {m.iteration} · {m.kind}
                      </div>
                      <pre>{cleanMarkdown(m.text)}</pre>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
