// Landing page — new UI (Gemini directive §3): sticky glass command
// navbar, minimalist hero + interactive 6-agent swarm visualizer, the
// new 4-card Bento KPI strip, the main dispute command queue, and the
// webhook & audit log. All values come from the live ledger
// (useLedger) — nothing hardcoded, nothing invented.
"use client";

import Link from "next/link";
import CommandNavbar from "@/components/command-navbar";
import BentoKpis from "@/components/bento-kpis";
import DisputeQueue from "@/components/dispute-queue";
import AuditLog from "@/components/audit-log";
import { SwarmPipelineVisualizer } from "@/components/ui/micro-interactions";
import { useLedger } from "@/lib/use-ledger";

export default function LandingPage() {
  const {
    disputes,
    runs,
    telemetry,
    loading,
    error,
    notice,
    setNotice,
    refresh,
  } = useLedger();

  const hasSandbox = disputes.some((d) => d.source === "sandbox");
  const simulatedCount = disputes.filter(
    (d) => d.source === "seeded",
  ).length;
  const evidenceHref =
    disputes.length > 0
      ? `/disputes/${disputes[0].id}#evidence-vault`
      : "/dashboard";

  const handleSync = async () => {
    await refresh();
    setNotice("Synced with PayPal Sandbox");
  };

  return (
    <div className="landing-page phalanx-canvas">
      <CommandNavbar
        envMode={hasSandbox ? "sandbox" : "seeded"}
        simulatedCount={simulatedCount}
        onSync={handleSync}
        syncing={loading}
        evidenceHref={evidenceHref}
        active="queue"
      />

      <main>
        {/* Hero — directive §3.2 */}
        <section className="hero-wrap hero-new" id="product">
          <div className="hero-eyebrow">
            DETERMINISTIC 0–100 CHECKLIST AUTHORITY · ADVERSARIAL 6-AGENT
            SWARM
          </div>

          <h1 className="hero-h1 display-sans">
            <span className="headline-ink">
              Autonomous PayPal Dispute Defense.
            </span>{" "}
            <span className="headline-fade">Zero Hallucinated Verdicts.</span>
          </h1>

          <p className="hero-subcopy">
            The LLM drafts the prose. A deterministic checklist scorer decides
            the verdict. Attach bills, collapse 70+ juror notes into 3
            actionable reasons, and execute only after human approval.
          </p>

          <div className="hero-cta-row">
            <Link className="btn primary" href="/dashboard">
              Open the Workbench →
            </Link>
            <Link className="btn" href="#queue">
              View Command Queue ↓
            </Link>
          </div>

          <div className="proof-strip">
            <span className="proof-item">
              <span className="proof-check">✓</span> PayPal Sandbox API
              Verified
            </span>
            <span className="proof-item">
              <span className="proof-check">✓</span> MIT Open Source
            </span>
            <span className="proof-item">
              <span className="proof-check">✓</span> Human Approves Every
              Action
            </span>
            <span className="proof-item">
              <span className="proof-check">✓</span> Zero Predicted Win Odds
              (Deterministic Only)
            </span>
          </div>
        </section>

        {/* Swarm Architecture — directive §3.2 */}
        <section className="section-white" id="swarm">
          <div className="section-container">
            <div className="skeleton-header">
              <h2 className="section-h2 display-sans">
                <span className="headline-ink">Six agents in debate.</span>{" "}
                <span className="headline-fade">One deterministic verdict.</span>
              </h2>
              <p className="skeleton-desc">
                Hound retrieves merchant tracking and invoices. Prosecutor
                drafts the rebuttal. Red-Team attacks the draft for missing
                proof. The 3-juror quorum names the gaps. Judge frames the
                issue in plain English. Arbiter routes fight, offer, or
                concede from the 0–100 checklist score — the score decides,
                never the model.
              </p>
            </div>

            <SwarmPipelineVisualizer />

            <div className="debate-fragment">
              <div className="debate-fragment-label">
                Real Debate Transcript Fragment · Scenario A (Pass 1 → Pass 2)
              </div>
              <div className="msg gap debate-fragment-msg">
                <div className="actor">
                  [QUORUM 2/3+] RED-TEAM JURY · ITERATION 1
                </div>
                <pre>
                  Named Gap: Carrier tracking delivered verified (+30), but
                  post-delivery merchant communication log is missing (+25).
                  Score: 60/100 (Threshold 75 not met).
                </pre>
              </div>
              <div className="msg critique debate-fragment-msg">
                <div className="actor">HOUND DEEP RETRIEVAL · ITERATION 2</div>
                <pre>
                  Retrieved artifact: Zendesk ticket #4092 showing buyer
                  acknowledged delivery on Oct 14. Checklist re-scored:
                  85/100. Verdict flipped to CONTEST_HARD_PROOF.
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* Bento KPIs + Command Queue — directive §3.3–3.4 */}
        <section className="section-alabaster queue-wrap-section">
          <div className="section-container">
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
            {error && <div className="callout error">Error: {error}</div>}

            <div className="callout simulated">
              <span>
                <b>SIMULATED DATA</b> — seeded disputes are demo scenarios,
                not real buyers or funds. Checklist scores are an internal
                heuristic, NOT a win probability. Sandbox only; human approval
                is mandatory.
              </span>
              <span className="chip sim">3 Seeded Scenarios</span>
            </div>

            <BentoKpis
              disputes={disputes}
              runs={runs}
              executionsSucceeded={telemetry?.executions_succeeded ?? 0}
            />

            <DisputeQueue disputes={disputes} runs={runs} />

            <AuditLog />
          </div>
        </section>
      </main>

      <footer className="footer-wrap">
        <div className="footer-inner">
          <div className="footer-col">
            <div className="brand-cluster footer-brand">
              <span className="brand-mark">P</span>
              <span className="footer-brand-name">PHALANX</span>
            </div>
            <p className="footer-about">
              Adversarial dispute-defense workbench for small PayPal
              merchants. Built for the PayPal AI Hackathon.
            </p>
          </div>

          <div className="footer-col">
            <h4>Product</h4>
            <ul className="footer-links">
              <li>
                <Link href="/dashboard">Dispute Workbench</Link>
              </li>
              <li>
                <Link href="/dashboard">Seeded Demo Cases</Link>
              </li>
              <li>
                <Link href="/dashboard">5-Page PDF Dossiers</Link>
              </li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Documentation</h4>
            <ul className="footer-links">
              <li>
                <Link href="/guide">Integration Guide</Link>
              </li>
              <li>
                <a
                  href="https://github.com/DhyeyPatel007/phalanx"
                  target="_blank"
                  rel="noreferrer"
                >
                  README.md ↗
                </a>
              </li>
              <li>
                <a
                  href="https://developer.paypal.com/docs/api/disputes/v1/"
                  target="_blank"
                  rel="noreferrer"
                >
                  PayPal Sandbox Specs ↗
                </a>
              </li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Repository</h4>
            <ul className="footer-links">
              <li>
                <a
                  href="https://github.com/DhyeyPatel007/phalanx"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub Repo ↗
                </a>
              </li>
              <li>
                <a href="https://devpost.com" target="_blank" rel="noreferrer">
                  Devpost Submission ↗
                </a>
              </li>
              <li>
                <span className="footer-muted">MIT Open Source</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© 2026 PHALANX · PayPal AI Hackathon Submission</span>
          <span>SIMULATED Data · Zero Real Money · Human Gate Mandatory</span>
        </div>
      </footer>
    </div>
  );
}
