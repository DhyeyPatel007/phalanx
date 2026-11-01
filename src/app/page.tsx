"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LandingPage() {
  const router = useRouter();
  const [disputeInput, setDisputeInput] = useState("");
  const [inputNotice, setInputNotice] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<"A" | "B" | "C">("A");
  const [heroPass, setHeroPass] = useState<1 | 2>(2);
  const [totalVolumeUsd, setTotalVolumeUsd] = useState(785);

  useEffect(() => {
    fetch("/api/disputes")
      .then((res) => res.json())
      .then((data) => {
        if (data.telemetry?.total_volume_usd) {
          setTotalVolumeUsd(data.telemetry.total_volume_usd);
        }
      })
      .catch(() => {});
  }, []);

  const handleDisputeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = disputeInput.trim().toUpperCase();
    if (cleanId === "PP-D-88412" || cleanId === "PP-D-88413" || cleanId === "PP-D-88414") {
      router.push(`/disputes/${cleanId}`);
    } else if (cleanId.length > 0) {
      setInputNotice(
        `Dispute "${cleanId}" not found in current demo. Exploring seeded dispute PP-D-88412 ($480.00 USD, Item Not Received) instead.`,
      );
      setTimeout(() => {
        router.push("/disputes/PP-D-88412");
      }, 1400);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div className="landing-page">
      {/* 1. Floating Pill Nav (Chargeflow / Raycast) */}
      <div className="floating-nav-wrap">
        <header className="floating-nav">
          <div className="brand-cluster">
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="brand-mark">P</span>
              <span style={{ fontWeight: 700 }}>PHALANX</span>
            </Link>
            <span className="chip ultraviolet">PayPal Sandbox</span>
          </div>

          <nav className="nav-links" aria-label="Landing navigation">
            <a href="#product" className="nav-link">
              Product
            </a>
            <a href="#swarm" className="nav-link">
              How it works
            </a>
            <a href="#demo-cases" className="nav-link">
              Demo cases
            </a>
            <Link href="/guide" className="nav-link">
              Guide
            </Link>
          </nav>

          <div className="actions">
            <Link className="btn primary" href="/dashboard">
              Open the Workbench →
            </Link>
          </div>
        </header>
      </div>

      <main>
        {/* 2. Hero — Prompt-First (Perplexity / Retool) */}
        <section className="hero-wrap" id="product">
          <div className="hero-eyebrow">
            <span className="tabular-nums font-mono" style={{ fontWeight: 600, color: "var(--accent-ultraviolet)" }}>
              ${totalVolumeUsd.toFixed(2)} USD
            </span>{" "}
            at stake across 3 live demo cases · Fee basis: US Standard Dispute Fee $15
          </div>

          <h1 className="hero-h1 display-serif">
            <span className="headline-ink">Disputes defended before PayPal acts.</span>{" "}
            <span className="headline-fade">Deterministic proof, jury audit, human approval gate.</span>
          </h1>

          <p className="hero-subcopy">
            PHALANX turns messy merchant records into proof dossiers that win PayPal disputes. Multi-agent debate, deterministic 0–100 checklist scoring, and a mandatory human approval gate before any refund or evidence submission.
          </p>

          {/* Centred Input Box (Prompt-First) */}
          <form onSubmit={handleDisputeSubmit} className="hero-input-box">
            <input
              type="text"
              className="hero-input-field"
              placeholder="Paste a PayPal dispute ID (e.g. PP-D-88412)…"
              value={disputeInput}
              onChange={(e) => setDisputeInput(e.target.value)}
              aria-label="PayPal dispute ID input"
            />
            <button type="submit" className="primary" style={{ padding: "8px 20px" }}>
              Defend Dispute →
            </button>
          </form>

          {inputNotice && (
            <div style={{ maxWidth: 640, margin: "12px auto 0", fontSize: 13, color: "var(--text-secondary)", background: "#ffffff", padding: "8px 14px", borderRadius: "var(--radius-tag)", border: "1px solid var(--border-hairline)" }}>
              {inputNotice}
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <Link href="/dashboard" className="hero-secondary-link">
              or open the dispute workbench directly →
            </Link>
          </div>

          {/* 3. Hero Visual — The Product is the Hero (Linear) */}
          <div className="hero-visual-frame">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--border-hairline)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-ink)" }}>
                  LIVE WORKBENCH PREVIEW · SANDBOX
                </span>
                <span className="chip sim">SIMULATED DATA</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setHeroPass(1)}
                  className={`btn ${heroPass === 1 ? "primary" : ""}`}
                  style={{ fontSize: 12, padding: "4px 12px" }}
                >
                  Pass 1 (Score 60 · Rejected)
                </button>
                <button
                  onClick={() => setHeroPass(2)}
                  className={`btn ${heroPass === 2 ? "primary" : ""}`}
                  style={{ fontSize: 12, padding: "4px 12px" }}
                >
                  Pass 2 (Score 85 · Accepted)
                </button>
              </div>
            </div>

            {/* KPI Row */}
            <div className="grid-3" style={{ marginBottom: 20 }}>
              <div style={{ background: "var(--bg-muted)", padding: 14, borderRadius: "var(--radius-tag)", border: "1px solid var(--border-hairline)" }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.04em" }}>Total Volume</div>
                <div className="font-mono tabular-nums" style={{ fontSize: 20, fontWeight: 700, margin: "2px 0", color: "var(--text-ink)" }}>$785.00 USD</div>
                <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>3 Seeded PayPal Cases</div>
              </div>

              <div style={{ background: "var(--bg-muted)", padding: 14, borderRadius: "var(--radius-tag)", border: "1px solid var(--border-hairline)" }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.04em" }}>Deterministic Score</div>
                <div className="font-mono tabular-nums" style={{ fontSize: 20, fontWeight: 700, margin: "2px 0", color: heroPass === 2 ? "var(--verdict-contest-text)" : "var(--verdict-offer-text)" }}>
                  {heroPass === 1 ? "60 / 100" : "85 / 100"}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                  {heroPass === 1 ? "Gap: Merchant chat missing" : "Verified: Tracking + Chat"}
                </div>
              </div>

              <div style={{ background: "var(--bg-muted)", padding: 14, borderRadius: "var(--radius-tag)", border: "1px solid var(--border-hairline)" }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.04em" }}>Human Approval Gate</div>
                <div style={{ fontSize: 20, fontWeight: 700, margin: "2px 0", color: "var(--accent-ultraviolet)" }}>
                  MANDATORY
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>Zero Autonomous PayPal Calls</div>
              </div>
            </div>

            {/* Framed Ledger Strip */}
            <div style={{ background: "#ffffff", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-tag)", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 2fr 1fr 1fr 1.4fr", padding: "10px 14px", background: "var(--bg-muted)", fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                <span>Dispute ID</span>
                <span>Reason</span>
                <span style={{ textAlign: "right" }}>Amount</span>
                <span style={{ textAlign: "right" }}>Score</span>
                <span style={{ textAlign: "right" }}>Routing Verdict</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 2fr 1fr 1fr 1.4fr", padding: "12px 14px", fontSize: 13, borderTop: "1px solid var(--border-hairline)", alignItems: "center" }}>
                <Link href="/disputes/PP-D-88412" className="grid-link font-mono">PP-D-88412</Link>
                <span>MERCHANDISE_OR_SERVICE_NOT_RECEIVED</span>
                <span className="font-mono tabular-nums" style={{ textAlign: "right" }}>$480.00 USD</span>
                <span className="font-mono tabular-nums" style={{ textAlign: "right", fontWeight: 600, color: heroPass === 2 ? "var(--verdict-contest-text)" : "var(--verdict-offer-text)" }}>
                  {heroPass === 1 ? "60/100" : "85/100"}
                </span>
                <span style={{ textAlign: "right" }}>
                  <span className="badge contest">CONTEST_HARD_PROOF</span>
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 2fr 1fr 1fr 1.4fr", padding: "12px 14px", fontSize: 13, borderTop: "1px solid var(--border-hairline)", alignItems: "center" }}>
                <Link href="/disputes/PP-D-88413" className="grid-link font-mono">PP-D-88413</Link>
                <span>MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED</span>
                <span className="font-mono tabular-nums" style={{ textAlign: "right" }}>$210.00 USD</span>
                <span className="font-mono tabular-nums" style={{ textAlign: "right", fontWeight: 600 }}>60/100</span>
                <span style={{ textAlign: "right" }}>
                  <span className="badge offer">DE_ESCALATE_OFFER</span>
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 2fr 1fr 1fr 1.4fr", padding: "12px 14px", fontSize: 13, borderTop: "1px solid var(--border-hairline)", alignItems: "center" }}>
                <Link href="/disputes/PP-D-88414" className="grid-link font-mono">PP-D-88414</Link>
                <span>MERCHANDISE_OR_SERVICE_NOT_RECEIVED</span>
                <span className="font-mono tabular-nums" style={{ textAlign: "right" }}>$95.00 USD</span>
                <span className="font-mono tabular-nums" style={{ textAlign: "right", fontWeight: 600 }}>0/100</span>
                <span style={{ textAlign: "right" }}>
                  <span className="badge concede">CONCEDE_FAST_SETTLE</span>
                </span>
              </div>
            </div>
          </div>

          {/* 4. Proof Strip */}
          <div className="proof-strip">
            <span className="proof-item">
              <span style={{ color: "var(--accent-ultraviolet)" }}>✓</span> PayPal Sandbox API Verified
            </span>
            <span className="proof-item">
              <span style={{ color: "var(--accent-ultraviolet)" }}>✓</span> MIT Open Source
            </span>
            <span className="proof-item">
              <span style={{ color: "var(--accent-ultraviolet)" }}>✓</span> Human Approves Every Action
            </span>
            <span className="proof-item">
              <span style={{ color: "var(--accent-ultraviolet)" }}>✓</span> Zero Predicted Win Odds (Deterministic Only)
            </span>
          </div>
        </section>

        {/* 5. The Swarm — One Rigid Skeleton, Repeated (Linear) */}
        <section className="section-white" id="swarm">
          <div className="section-container">
            <div className="skeleton-header">
              <h2 className="section-h2 display-serif">
                <span className="headline-ink">Four agents in debate.</span>{" "}
                <span className="headline-fade">One deterministic verdict.</span>
              </h2>
              <p className="skeleton-desc">
                Hound retrieves merchant tracking and invoices. Prosecutor drafts the rebuttal. A 3-juror Red-Team attacks the draft for missing proof. When gaps exist, Hound re-fetches records. Arbiter computes balance-sheet break-even math and routes fight, offer, or concede from a 0–100 checklist score.
              </p>
            </div>

            <div className="skeleton-visual">
              <div className="swarm-grid">
                <div className="swarm-step-card">
                  <span className="swarm-step-tag">Step 1 · Ingest</span>
                  <h3 className="swarm-step-title">Hound</h3>
                  <p className="swarm-step-role">Gathers carrier tracking, signed receipts, and order invoices. Re-fetches deep records if jurors name proof gaps.</p>
                </div>
                <div className="swarm-step-card">
                  <span className="swarm-step-tag">Step 2 · Draft</span>
                  <h3 className="swarm-step-title">Prosecutor</h3>
                  <p className="swarm-step-role">Drafts factual rebuttal letters tied strictly to verifiable artifacts. Never invents facts or hallucinates dollar figures.</p>
                </div>
                <div className="swarm-step-card">
                  <span className="swarm-step-tag">Step 3 · Audit</span>
                  <h3 className="swarm-step-title">3-Juror Jury</h3>
                  <p className="swarm-step-role">Evidence Juror, Policy Juror, and Buyer-Sympathy Juror critique the draft in parallel, enforcing a 2/3 quorum on named gaps.</p>
                </div>
                <div className="swarm-step-card">
                  <span className="swarm-step-tag">Step 4 · Route</span>
                  <h3 className="swarm-step-title">Arbiter</h3>
                  <p className="swarm-step-role">Evaluates deterministic checklist score (0–100). Routes provide-evidence (≥75), make-offer (35–74), or accept-claim (&lt;35).</p>
                </div>
              </div>

              {/* Debate Transcript Fragment */}
              <div style={{ marginTop: 24, padding: 18, background: "var(--bg-muted)", borderRadius: "var(--radius-tag)", border: "1px solid var(--border-hairline)" }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                  Real Debate Transcript Fragment · Scenario A (Pass 1 → Pass 2)
                </div>
                <div className="msg gap" style={{ marginBottom: 8, background: "#ffffff" }}>
                  <div className="actor">[QUORUM 2/3+] RED-TEAM JURY · ITERATION 1</div>
                  <pre style={{ margin: 0, fontSize: 12.5 }}>Named Gap: Carrier tracking delivered verified (+30), but post-delivery merchant communication log is missing (+25). Score: 60/100 (Threshold 75 not met).</pre>
                </div>
                <div className="msg critique" style={{ margin: 0, background: "#ffffff" }}>
                  <div className="actor">HOUND DEEP RETRIEVAL · ITERATION 2</div>
                  <pre style={{ margin: 0, fontSize: 12.5 }}>Retrieved artifact: Zendesk ticket #4092 showing buyer acknowledged delivery on Oct 14. Checklist re-scored: 85/100. Verdict flipped to CONTEST_HARD_PROOF.</pre>
                </div>
              </div>
            </div>

            <div className="skeleton-cta-row">
              <Link className="btn primary" href="/dashboard">
                Open the Workbench →
              </Link>
            </div>
          </div>
        </section>

        {/* 6. Demo Cases — Expandable Cards (Stripe) */}
        <section className="section-glacier" id="demo-cases">
          <div className="section-container">
            <div className="skeleton-header">
              <h2 className="section-h2 display-serif">
                <span className="headline-ink">Three real scenarios.</span>{" "}
                <span className="headline-fade">Transparent routing.</span>
              </h2>
              <p className="skeleton-desc">
                Every dispute route has a designed role. Scenario A fights on carrier tracking proof. Scenario B de-escalates with a partial refund offer to protect merchant reputation. Scenario C fast-settles immediately to avoid $15 dispute fees.
              </p>
            </div>

            <div className="skeleton-visual">
              <div className="grid-3" style={{ marginBottom: 24 }}>
                <div
                  className={`demo-card ${selectedCase === "A" ? "active" : ""}`}
                  onClick={() => setSelectedCase("A")}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="chip sim">Scenario A · $480.00 USD</span>
                    <span className="badge contest">CONTEST</span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>PP-D-88412</h3>
                  <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Item Not Received. Pass 1 rejected (60/100). Pass 2 fetches merchant communication log and accepts at 85/100.
                  </p>
                  <div style={{ marginTop: "auto", fontSize: 12.5, fontWeight: 600, color: "var(--accent-ultraviolet)" }}>
                    Action: provide-evidence →
                  </div>
                </div>

                <div
                  className={`demo-card ${selectedCase === "B" ? "active" : ""}`}
                  onClick={() => setSelectedCase("B")}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="chip sim">Scenario B · $210.00 USD</span>
                    <span className="badge offer">OFFER</span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>PP-D-88413</h3>
                  <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Significantly Not As Described. Score 60/100. Sized to 40% partial refund ($84.00 USD) in Inquiry to waive $15 fee.
                  </p>
                  <div style={{ marginTop: "auto", fontSize: 12.5, fontWeight: 600, color: "var(--accent-ultraviolet)" }}>
                    Action: make-offer ($84.00 USD) →
                  </div>
                </div>

                <div
                  className={`demo-card ${selectedCase === "C" ? "active" : ""}`}
                  onClick={() => setSelectedCase("C")}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="chip sim">Scenario C · $95.00 USD</span>
                    <span className="badge concede">CONCEDE</span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>PP-D-88414</h3>
                  <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Lost package confirmed by carrier tracking (0/100). Concedes immediately to save $15 fee. Directs to carrier insurance.
                  </p>
                  <div style={{ marginTop: "auto", fontSize: 12.5, fontWeight: 600, color: "var(--accent-ultraviolet)" }}>
                    Action: accept-claim →
                  </div>
                </div>
              </div>

              {/* Detail Expansion Panel */}
              <div style={{ padding: 22, background: "var(--bg-muted)", borderRadius: "var(--radius-tag)", border: "1px solid var(--border-hairline)" }}>
                {selectedCase === "A" && (
                  <div>
                    <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Scenario A Progression: PP-D-88412 ($480.00 USD)</h4>
                    <p style={{ margin: "0 0 12px", fontSize: 13.5, color: "var(--text-secondary)" }}>
                      <b>Iteration 1:</b> Prosecutor drafts rebuttal with tracking + invoice (Score 60/100). Red-Team rejects: delivery confirmed, but buyer claimed package was empty. Missing: merchant communication log.<br />
                      <b>Iteration 2:</b> Hound re-inspects store logs, finds customer email acknowledging items arrived intact. Score improves to <b>85/100</b>. Arbiter approves <b>CONTEST_HARD_PROOF</b>.
                    </p>
                    <Link className="btn primary" href="/disputes/PP-D-88412">
                      Inspect Full Dispute Dossier for PP-D-88412 →
                    </Link>
                  </div>
                )}
                {selectedCase === "B" && (
                  <div>
                    <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Scenario B Dynamic Offer: PP-D-88413 ($210.00 USD)</h4>
                    <p style={{ margin: "0 0 12px", fontSize: 13.5, color: "var(--text-secondary)" }}>
                      Buyer claims minor discoloration on apparel. Item delivered, but merchant lacks factory QA photo (Score 60/100). Arbiter routes <b>DE_ESCALATE_OFFER</b>.<br />
                      Dynamic offer calculation: <code>1.0 - (60 / 100) = 40%</code> → <b>$84.00 USD</b> refund. Merchant retains $126.00 USD principal and avoids the $15 PayPal dispute fee by settling in Inquiry stage.
                    </p>
                    <Link className="btn primary" href="/disputes/PP-D-88413">
                      Inspect Full Dispute Dossier for PP-D-88413 →
                    </Link>
                  </div>
                )}
                {selectedCase === "C" && (
                  <div>
                    <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Scenario C Fast Concede: PP-D-88414 ($95.00 USD)</h4>
                    <p style={{ margin: "0 0 12px", fontSize: 13.5, color: "var(--text-secondary)" }}>
                      Carrier tracking explicitly states <i>&quot;Package lost in transit&quot;</i>. Score: <b>0/100</b>.<br />
                      Contesting would lose $95.00 USD claim + $15.00 USD dispute fee ($110.00 USD total loss). Immediate concede in Inquiry stage refunds the buyer and waives the $15 dispute fee entirely. PHALANX prompts merchant to file a carrier insurance claim.
                    </p>
                    <Link className="btn primary" href="/disputes/PP-D-88414">
                      Inspect Full Dispute Dossier for PP-D-88414 →
                    </Link>
                  </div>
                )}
              </div>
            </div>

            <div className="skeleton-cta-row">
              <Link className="btn primary" href="/dashboard">
                Open the Workbench →
              </Link>
            </div>
          </div>
        </section>

        {/* 7. Outcome Math — Live Proof (Mintlify / Stripe) */}
        <section className="section-white" id="outcome-math">
          <div className="section-container">
            <div className="skeleton-header">
              <h2 className="section-h2 display-serif">
                <span className="headline-ink">Deterministic balance sheet.</span>{" "}
                <span className="headline-fade">No win-rate illusions.</span>
              </h2>
              <p className="skeleton-desc">
                PHALANX rejects speculative win probabilities. We compute exact boundary outcomes: Contest (if upheld: $0 loss; if lost: amount + $15 fee), Partial Offer (principal retained + $0 fee), and Concede (immediate claim acceptance with fee waived in Inquiry).
              </p>
            </div>

            <div className="skeleton-visual">
              <div className="grid-2">
                <div style={{ padding: 22, background: "var(--bg-muted)", borderRadius: "var(--radius-card)", border: "1px solid var(--border-hairline)" }}>
                  <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 600 }}>Deterministic Boundary Matrix (Scenario A · $480.00 USD)</h3>
                  <dl className="kv">
                    <dt>Contest (Upheld)</dt>
                    <dd className="font-mono tabular-nums" style={{ color: "var(--verdict-contest-text)" }}>$0.00 net loss ($480.00 retained; $15 fee waived)</dd>
                    <dt>Contest (Lost)</dt>
                    <dd className="font-mono tabular-nums" style={{ color: "var(--verdict-concede-text)" }}>-$495.00 USD ($480 claim + $15 fee)</dd>
                    <dt>Immediate Concede</dt>
                    <dd className="font-mono tabular-nums">-$480.00 USD (settled in Inquiry; fee waived)</dd>
                    <dt>Fee Basis</dt>
                    <dd>US Standard Dispute Fee $15 (Oct 1, 2026 schedule)</dd>
                  </dl>
                </div>

                <div style={{ padding: 22, background: "var(--bg-muted)", borderRadius: "var(--radius-card)", border: "1px solid var(--border-hairline)" }}>
                  <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 600 }}>Break-Even Threshold Analysis (Scenario B · $210.00 USD)</h3>
                  <dl className="kv">
                    <dt>Partial Offer (40%)</dt>
                    <dd className="font-mono tabular-nums" style={{ color: "var(--verdict-offer-text)" }}>-$84.00 USD refund ($126.00 retained; $0 fee)</dd>
                    <dt>Contest (Lost)</dt>
                    <dd className="font-mono tabular-nums">-$225.00 USD ($210 claim + $15 fee)</dd>
                    <dt>Break-Even Win Rate</dt>
                    <dd className="font-mono tabular-nums" style={{ fontWeight: 700, color: "var(--accent-ultraviolet)" }}>
                      63% External Win Odds
                    </dd>
                    <dt>Formula Truth</dt>
                    <dd style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      Contesting beats an $84 offer only if true PayPal win probability exceeds 63% (never estimated by AI).
                    </dd>
                  </dl>
                </div>
              </div>
            </div>

            <div className="skeleton-cta-row">
              <Link className="btn primary" href="/dashboard">
                Open the Workbench →
              </Link>
            </div>
          </div>
        </section>

        {/* 8. How-To — Docs as a First-Class Surface (Mintlify) */}
        <section className="section-glacier" id="how-it-works">
          <div className="section-container">
            <div className="skeleton-header">
              <h2 className="section-h2 display-serif">
                <span className="headline-ink">Defend disputes in minutes.</span>{" "}
                <span className="headline-fade">Three strict steps.</span>
              </h2>
              <p className="skeleton-desc">
                Connect your PayPal Sandbox API credentials, inspect the adversarial proof dossier, and approve the action. Zero PayPal calls happen without your manual confirmation.
              </p>
            </div>

            <div className="skeleton-visual">
              <div className="grid-3" style={{ marginBottom: 24 }}>
                <div style={{ padding: 22, background: "#ffffff", borderRadius: "var(--radius-card)", border: "1px solid var(--border-hairline)" }}>
                  <span className="chip ultraviolet" style={{ marginBottom: 10 }}>Step 1</span>
                  <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 600 }}>Connect Sandbox API</h3>
                  <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Enter your PayPal Developer credentials or test immediately with pre-loaded seeded disputes. No API keys required for demo mode.
                  </p>
                </div>

                <div style={{ padding: 22, background: "#ffffff", borderRadius: "var(--radius-card)", border: "1px solid var(--border-hairline)" }}>
                  <span className="chip ultraviolet" style={{ marginBottom: 10 }}>Step 2</span>
                  <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 600 }}>Run Adversarial Swarm</h3>
                  <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Hound extracts merchant records. Prosecutor drafts the rebuttal. Red-Team jury audits missing proof and Arbiter calculates break-even math.
                  </p>
                </div>

                <div style={{ padding: 22, background: "#ffffff", borderRadius: "var(--radius-card)", border: "1px solid var(--border-hairline)" }}>
                  <span className="chip ultraviolet" style={{ marginBottom: 10 }}>Step 3</span>
                  <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 600 }}>Review &amp; Approve Gate</h3>
                  <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Inspect the 5-page PDF dossier and Judge framing. Click Approve to authorize provide-evidence, make-offer, or accept-claim on PayPal.
                  </p>
                </div>
              </div>

              <div style={{ textAlign: "center", padding: "16px", background: "var(--bg-muted)", borderRadius: "var(--radius-tag)" }}>
                <Link href="/guide" style={{ fontSize: 14.5, fontWeight: 600, color: "var(--accent-ultraviolet)" }}>
                  Read the Complete Integration &amp; Runbook Guide →
                </Link>
              </div>
            </div>

            <div className="skeleton-cta-row">
              <Link className="btn primary" href="/dashboard">
                Open the Workbench →
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* 9. Footer with Documentation Column (Stripe / Mintlify) */}
      <footer className="footer-wrap">
        <div className="footer-inner">
          <div className="footer-col">
            <div className="brand-cluster" style={{ marginBottom: 14 }}>
              <span className="brand-mark">P</span>
              <span style={{ fontWeight: 700 }}>PHALANX</span>
            </div>
            <p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
              Adversarial dispute-defense workbench for small PayPal merchants. Built for the PayPal AI Hackathon.
            </p>
          </div>

          <div className="footer-col">
            <h4>Product</h4>
            <ul className="footer-links">
              <li><Link href="/dashboard">Dispute Workbench</Link></li>
              <li><Link href="/dashboard">Seeded Demo Cases</Link></li>
              <li><Link href="/dashboard">5-Page PDF Dossiers</Link></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Documentation</h4>
            <ul className="footer-links">
              <li><Link href="/guide">Integration Guide</Link></li>
              <li><a href="https://github.com/DhyeyPatel007/phalanx" target="_blank" rel="noreferrer">README.md ↗</a></li>
              <li><a href="https://developer.paypal.com/docs/api/disputes/v1/" target="_blank" rel="noreferrer">PayPal Sandbox Specs ↗</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Repository</h4>
            <ul className="footer-links">
              <li><a href="https://github.com/DhyeyPatel007/phalanx" target="_blank" rel="noreferrer">GitHub Repo ↗</a></li>
              <li><a href="https://devpost.com" target="_blank" rel="noreferrer">Devpost Submission ↗</a></li>
              <li><span style={{ color: "var(--text-muted)" }}>MIT Open Source</span></li>
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
