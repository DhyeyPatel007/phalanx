"use client";

import Link from "next/link";
import { useState } from "react";

export default function LandingPage() {
  const [heroIteration, setHeroIteration] = useState<1 | 2>(2);

  return (
    <div>
      {/* Sticky Perplexity Light Header */}
      <header className="pplx-nav">
        <div className="pplx-nav-inner">
          <div className="brand-cluster">
            <span className="brand-mark">P</span>
            <span>PHALANX</span>
            <span className="chip teal">PayPal AI Hackathon</span>
          </div>

          <nav className="nav-links" aria-label="Landing navigation">
            <a href="#problem" className="nav-tab">
              The Problem
            </a>
            <a href="#swarm" className="nav-tab">
              How the Swarm Works
            </a>
            <a href="#scenarios" className="nav-tab">
              3 Demo Cases
            </a>
            <a href="#outcome-math" className="nav-tab">
              Outcome Math
            </a>
            <a href="#free-trust" className="nav-tab">
              Free &amp; Honest
            </a>
          </nav>

          <div className="actions">
            <Link className="btn primary pill" href="/dashboard">
              Open the Workbench →
            </Link>
          </div>
        </div>
      </header>

      <main className="landing-wrap">
        {/* A1. HERO SECTION */}
        <section className="hero-section">
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="chip teal">Adversarial Multi-Agent Swarm</span>
              <span className="chip">PayPal Sandbox</span>
              <span className="chip sim">Human Approves Every Action</span>
            </div>
            <h1 className="hero-h1">
              Dispute defense for small PayPal merchants—audited by an
              adversarial swarm before you respond.
            </h1>
            <p className="hero-lead">
              Small merchants lose winnable disputes when initial responses omit
              corroborating logs—and pay PayPal&apos;s $15 Standard Dispute Fee
              when claims fail. PHALANX assembles your evidence, attacks its own
              draft with a 3-juror Red-Team, and routes every case through a
              mandatory human approval gate.
            </p>
            <div className="actions" style={{ marginBottom: 20 }}>
              <Link className="btn primary pill" href="/dashboard">
                Open the Workbench →
              </Link>
              <a href="#scenarios" className="btn pill">
                Inspect 3 Seeded Scenarios
              </a>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="chip">[1] Deterministic 0–100 Rubric</span>
              <span className="chip">[2] 5-Page PDF Evidence Dossier</span>
              <span className="chip">[3] $0 Self-Hosted BYOK</span>
            </div>
          </div>

          {/* Interactive Hero Visual: Live Scenario A Walkthrough Card */}
          <div className="pplx-card" style={{ padding: 22 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div>
                <span className="chip sim">SIMULATED DEMO CASE</span>
                <div
                  style={{
                    fontFamily: "var(--font-mono), monospace",
                    fontWeight: 600,
                    fontSize: 14,
                    marginTop: 4,
                  }}
                >
                  PP-D-88412 · $480.00 USD · ITEM_NOT_RECEIVED
                </div>
              </div>
              <div className="actions">
                <button
                  className={heroIteration === 1 ? "primary" : ""}
                  onClick={() => setHeroIteration(1)}
                  style={{ fontSize: 12, padding: "4px 10px" }}
                >
                  Pass 1 (60/100)
                </button>
                <button
                  className={heroIteration === 2 ? "primary" : ""}
                  onClick={() => setHeroIteration(2)}
                  style={{ fontSize: 12, padding: "4px 10px" }}
                >
                  Pass 2 (85/100)
                </button>
              </div>
            </div>

            {heroIteration === 1 ? (
              <div
                style={{
                  background: "var(--bg-paper)",
                  border: "1px solid var(--border-hairline)",
                  borderRadius: 10,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <span className="badge offer">
                    DRAFT v1 · REJECTED BY RED-TEAM
                  </span>
                  <span className="score-pill">Checklist: 60/100</span>
                </div>
                <p style={{ fontSize: 13, margin: "0 0 10px", color: "#4A5568" }}>
                  <b>Hound Pass 1 (Fast Sources):</b> Attached{" "}
                  <span className="chip">[ev1] FEDEX DELIVERED</span> +{" "}
                  <span className="chip">[ev3] Invoice INV-SIM-2026-480</span>.
                </p>
                <div
                  style={{
                    padding: 10,
                    background: "var(--verdict-offer-bg)",
                    border: "1px solid var(--verdict-offer-border)",
                    borderRadius: 8,
                    fontSize: 12.5,
                    color: "#7A4100",
                  }}
                >
                  <b>Red-Team &amp; Jury Critique:</b> Named gap — merchant log
                  tying buyer to post-delivery product use is missing. Score
                  60/100 is below the ≥75 contest threshold.{" "}
                  <b>Action: Command Hound to fetch deep merchant logs.</b>
                </div>
              </div>
            ) : (
              <div
                style={{
                  background: "var(--bg-paper)",
                  border: "1px solid var(--border-hairline)",
                  borderRadius: 10,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <span className="badge contest">
                    DRAFT v2 · ACCEPTED → CONTEST_HARD_PROOF
                  </span>
                  <span className="score-pill">Checklist: 85/100</span>
                </div>
                <p style={{ fontSize: 13, margin: "0 0 10px", color: "#4A5568" }}>
                  <b>Hound Pass 2 (+25 pts):</b> Fetched{" "}
                  <span className="chip teal">
                    [ev2] Post-delivery license activation + 3 builds exported
                  </span>
                  .
                </p>
                <div
                  style={{
                    padding: 10,
                    background: "var(--verdict-contest-bg)",
                    border: "1px solid var(--verdict-contest-border)",
                    borderRadius: 8,
                    fontSize: 12.5,
                    color: "var(--verdict-contest-text)",
                  }}
                >
                  <b>Arbiter Routing:</b> Score flipped <b>60 → 85/100</b>.
                  Routes to <code>provide-evidence</code> (PROOF_OF_FULFILLMENT)
                  with 5-page SHA-256 PDF dossier. Locked at{" "}
                  <b>AWAITING_APPROVAL</b>.
                </div>
              </div>
            )}

            <div
              style={{
                marginTop: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              <span>Score is a checklist heuristic, never a win probability.</span>
              <Link className="pdf-link" href="/dashboard">
                Run live in Workbench →
              </Link>
            </div>
          </div>
        </section>

        {/* A2. THE PROBLEM SECTION */}
        <section id="problem" className="section-block">
          <div className="section-eyebrow">01 · The Merchant Bottleneck</div>
          <h2 className="section-h2">
            Why small PayPal merchants lose money on both ends of a dispute
          </h2>
          <p className="section-sub">
            Responding with incomplete proof loses winnable cases, while blindly
            fighting unwinnable logistics failures triggers avoidable dispute
            fees.
          </p>

          <div className="grid-3">
            <div className="pplx-card">
              <span className="chip teal">PayPal Oct 1, 2026 Fee Schedule</span>
              <div
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 28,
                  fontWeight: 600,
                  margin: "10px 0 6px",
                }}
              >
                $15 / $20 / $30
              </div>
              <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: 0 }}>
                US Standard Dispute Fee is <b>$15</b> (waived in Inquiry or
                seller-favor outcome), External Card Chargeback is <b>$20</b>,
                and High-Volume tier is <b>$30</b>.
              </p>
            </div>

            <div className="pplx-card">
              <span className="chip sim">Scenario A · $480.00 INR</span>
              <div
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 28,
                  fontWeight: 600,
                  margin: "10px 0 6px",
                }}
              >
                60 → 85 pts
              </div>
              <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: 0 }}>
                A tracking-only response scores 60/100. Only after the Red-Team
                demands the merchant&apos;s post-delivery usage log (+25 pts)
                does the brief cross the ≥75 contest gate.
              </p>
            </div>

            <div className="pplx-card">
              <span className="chip">Scenario B ($210) &amp; C ($95)</span>
              <div
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 28,
                  fontWeight: 600,
                  margin: "10px 0 6px",
                }}
              >
                Triage Early
              </div>
              <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: 0 }}>
                Subjective SNAD claims ($210) de-escalate via a dynamic 40%
                refund offer ($84), while stalled-in-transit orders ($95)
                concede in INQUIRY to avoid claim fees.
              </p>
            </div>
          </div>
        </section>

        {/* A3. HOW THE SWARM WORKS (VISUAL DIAGRAM) */}
        <section id="swarm" className="section-block">
          <div className="section-eyebrow">02 · Multi-Agent Architecture</div>
          <h2 className="section-h2">
            Four deterministic stages + 3-Juror deliberation + mandatory human
            gate
          </h2>
          <p className="section-sub">
            The LLM drafts rebuttal wording and deliberates on gaps concurrently
            via <code>Promise.all</code>—it never invents facts, never scores,
            and never executes a PayPal call.
          </p>

          <div className="swarm-flow">
            <div className="swarm-node">
              <span className="swarm-step-num">STAGE 01 · HOUND</span>
              <strong>Evidence Collector</strong>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
                Ingests verified <code>CUSTOMER.DISPUTE.CREATED</code> webhook,
                pulls PayPal dispute detail, and loads fast <code>tracking</code>{" "}
                + <code>invoice</code> records.
              </p>
            </div>

            <div className="swarm-node">
              <span className="swarm-step-num">STAGE 02 · PROSECUTOR</span>
              <strong>Fact-Bound Drafter</strong>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
                Drafts rebuttal citing only verified store artifacts, guarded by{" "}
                <code>validateDraftAmounts</code> and a 0ms template floor.
              </p>
            </div>

            <div className="swarm-node highlight">
              <span className="swarm-step-num">STAGE 03 · RED-TEAM &amp; JURY</span>
              <strong>3-Juror Adversarial Loop</strong>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
                Evidence, Policy, and Buyer-Sympathy jurors attack the draft in
                parallel. <code>[QUORUM 2/3+]</code> gaps send Hound back for
                deep logs (max 3 iterations).
              </p>
            </div>

            <div className="swarm-node">
              <span className="swarm-step-num">STAGE 04 · JUDGE &amp; ARBITER</span>
              <strong>Rubric &amp; Stage Gate</strong>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
                Deterministic 0–100 scorer routes ≥75 to{" "}
                <code>provide-evidence</code>, 35–74 to <code>make-offer</code>,
                &lt;35 to <code>accept-claim</code>, gated by HATEOAS links.
              </p>
            </div>

            <div className="swarm-node">
              <span className="swarm-step-num">STAGE 05 · HUMAN GATE</span>
              <strong>Idempotent Execution</strong>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
                Requires explicit human approval (<code>demo merchant</code>) +
                idempotency key lock before touching PayPal Sandbox.
              </p>
            </div>
          </div>
        </section>

        {/* A4. THREE SEEDED DEMO SCENARIOS */}
        <section id="scenarios" className="section-block">
          <div className="section-eyebrow">03 · Seeded Demo Cases (SIMULATED)</div>
          <h2 className="section-h2">
            Three canonical dispute vectors ready to run out of the box
          </h2>
          <p className="section-sub">
            Every seeded field is explicitly labelled <code>SIMULATED</code> in
            the UI, transcript, and 5-page PDF evidence dossier.
          </p>

          <div className="grid-3">
            <div className="pplx-card">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span className="chip">Scenario A · PP-D-88412</span>
                <span className="badge contest">CONTEST_HARD_PROOF</span>
              </div>
              <h3 style={{ margin: "0 0 6px" }}>$480.00 USD · Item Not Received</h3>
              <p style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
                FedEx delivered + post-delivery software license activation and
                3 production builds exported.
              </p>
              <dl className="kv" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-hairline)" }}>
                <dt>Score progression</dt>
                <dd>60 (v1 rejected) → 85/100 (v2)</dd>
                <dt>PayPal Action</dt>
                <dd>provide-evidence (PROOF_OF_FULFILLMENT)</dd>
              </dl>
            </div>

            <div className="pplx-card">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span className="chip">Scenario B · PP-D-88413</span>
                <span className="badge offer">DE_ESCALATE_OFFER</span>
              </div>
              <h3 style={{ margin: "0 0 6px" }}>$210.00 USD · Not As Described</h3>
              <p style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
                Buyer received physical item; condition photos are subjective and
                no post-delivery log exists.
              </p>
              <dl className="kv" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-hairline)" }}>
                <dt>Checklist Score</dt>
                <dd>60/100 (1 iteration — store exhausted)</dd>
                <dt>PayPal Action</dt>
                <dd>make-offer ($84.00 / 40% REFUND)</dd>
              </dl>
            </div>

            <div className="pplx-card">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span className="chip">Scenario C · PP-D-88414</span>
                <span className="badge concede">CONCEDE_FAST_SETTLE</span>
              </div>
              <h3 style={{ margin: "0 0 6px" }}>$95.00 USD · Lost in Transit</h3>
              <p style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
                USPS tracking stalled at regional hub for 9 days with no
                delivery scan; merchant is at fault.
              </p>
              <dl className="kv" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-hairline)" }}>
                <dt>Checklist Score</dt>
                <dd>0/100 (immediate stop)</dd>
                <dt>PayPal Action</dt>
                <dd>accept-claim + manual carrier claim note</dd>
              </dl>
            </div>
          </div>
        </section>

        {/* A5. HONEST OUTCOME MATH VISUALIZER */}
        <section id="outcome-math" className="section-block">
          <div className="section-eyebrow">04 · Honest Financial Math</div>
          <h2 className="section-h2">
            Deterministic Outcome &amp; Break-Even Matrix—never a fake win
            probability
          </h2>
          <p className="section-sub">
            PHALANX never multiplies a checklist score by the dispute amount to
            invent an &ldquo;expected value.&rdquo; Instead, it computes the
            exact financial boundary of each action and the algebraic break-even
            threshold.
          </p>

          <div className="pplx-card">
            <div className="grid-2">
              <div>
                <h3 style={{ marginTop: 0 }}>
                  Example: Scenario B ($210.00 SNAD · Score 60/100)
                </h3>
                <dl className="kv">
                  <dt>Contest (if upheld)</dt>
                  <dd>$0.00 loss ($210.00 retained, $15 fee waived)</dd>
                  <dt>Contest (if lost)</dt>
                  <dd>-$225.00 loss ($210.00 claim + $15.00 dispute fee)</dd>
                  <dt>Dynamic Offer (40%)</dt>
                  <dd>-$84.00 settled ($126.00 retained, $0 Inquiry fee)</dd>
                  <dt>Break-Even Threshold</dt>
                  <dd>
                    Contesting beats an $84.00 offer only if true external win
                    odds exceed <b>63%</b>{" "}
                    <code>((210 - 84 + 15) / (210 + 15))</code>
                  </dd>
                </dl>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                    <span>Dynamic 40% Offer Settlement (Retains $126.00, $0 Fee)</span>
                    <b>-$84.00</b>
                  </div>
                  <div style={{ height: 10, background: "var(--bg-subtle)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: "37%", height: "100%", background: "var(--accent-teal)" }} />
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                    <span>Contest &amp; Lose Worst-Case ($210.00 + $15.00 Fee)</span>
                    <b>-$225.00</b>
                  </div>
                  <div style={{ height: 10, background: "var(--bg-subtle)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: "100%", height: "100%", background: "var(--verdict-concede-text)" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* A6. FREE FOR MERCHANTS + TRUST & HONESTY CHARTER */}
        <section id="free-trust" className="section-block">
          <div className="grid-2">
            <div className="pplx-card">
              <div className="section-eyebrow">05 · Free Forever for Merchants</div>
              <h3 style={{ margin: "4px 0 10px", fontSize: 20 }}>
                Self-hosted, BYOK Free-Tier Gemini, Zero-Key Floor
              </h3>
              <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 14 }}>
                <li>
                  <b>Zero Subscription or Central Server:</b> Runs as a standard
                  Next.js App Router repo you deploy on your own free tier.
                </li>
                <li>
                  <b>Zero-Key Floor:</b> Works with <b>no LLM key at all</b> via
                  deterministic rebuttal templates and the 0–100 rubric.
                </li>
                <li>
                  <b>Bounded Parallel Budget:</b> Max 6 LLM calls per dispute,
                  with all 3 Jurors executing concurrently via{" "}
                  <code>Promise.all</code>.
                </li>
                <li>
                  <b>Multi-Provider Registry:</b> Supports Gemini Free Tier
                  (default), NVIDIA NIM, OpenAI, Groq, DeepSeek, Grok, and Kimi.
                </li>
              </ul>
            </div>

            <div className="pplx-card">
              <div className="section-eyebrow">06 · Trust &amp; Honesty Charter</div>
              <h3 style={{ margin: "4px 0 10px", fontSize: 20 }}>
                Non-negotiable guardrails built into the code
              </h3>
              <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 14 }}>
                <li>
                  <b>Mandatory Human Approval Gate:</b> Every execution requires
                  an explicit human approval record; unapproved calls return{" "}
                  <code>403 APPROVAL_REQUIRED</code>.
                </li>
                <li>
                  <b>Live HATEOAS Authority:</b> Actions are gated on the live
                  PayPal dispute&apos;s <code>links</code> and{" "}
                  <code>allowed_response_options</code>.
                </li>
                <li>
                  <b>SIMULATED Watermarks:</b> Seeded demo rows and their 5-page
                  PDF dossiers carry explicit <code>SIMULATED</code> labels on
                  every page.
                </li>
                <li>
                  <b>Cryptographic Webhook Verification:</b> Raw body verified
                  via <code>/v1/notifications/verify-webhook-signature</code>.
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* A7. SHORT FAQ + FOOTER CTA */}
        <section className="section-block" style={{ borderBottom: "none", paddingBottom: 0 }}>
          <div className="section-eyebrow">07 · FAQ</div>
          <h2 className="section-h2">Frequently Asked Questions</h2>
          <div className="grid-2" style={{ marginBottom: 40 }}>
            <div className="pplx-card">
              <strong>Does the LLM decide whether to fight, offer, or concede?</strong>
              <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: "6px 0 0" }}>
                Never. The deterministic 0–100 checklist scorer decides the
                verdict (≥75 contest, 35–74 offer, &lt;35 concede). The LLM only
                drafts wording and highlights quorum gaps.
              </p>
            </div>
            <div className="pplx-card">
              <strong>Can a webhook automatically trigger a PayPal refund or upload?</strong>
              <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: "6px 0 0" }}>
                No. Webhooks only verify, dedupe, and ingest the dispute into
                the ledger. Execution is physically blocked until a human clicks
                Approve and Execute.
              </p>
            </div>
          </div>

          <div
            className="pplx-card"
            style={{
              textAlign: "center",
              padding: "36px 24px",
              background: "var(--bg-subtle)",
            }}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: 22 }}>
              Ready to inspect the adversarial swarm?
            </h2>
            <p style={{ color: "var(--text-secondary)", margin: "0 0 18px" }}>
              Open the Perplexity-styled workbench, run Scenarios A, B, and C,
              and inspect the 5-page PDF evidence dossiers.
            </p>
            <Link className="btn primary pill" href="/dashboard">
              Open the Workbench →
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
