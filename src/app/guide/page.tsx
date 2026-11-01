import Link from "next/link";

export default function GuidePage() {
  return (
    <div className="landing-page">
      {/* Floating Pill Nav (Chargeflow / Raycast) */}
      <div className="floating-nav-wrap">
        <header className="floating-nav">
          <div className="brand-cluster">
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="brand-mark">P</span>
              <span style={{ fontWeight: 700 }}>PHALANX</span>
            </Link>
            <span className="chip ultraviolet">PayPal Sandbox</span>
          </div>

          <nav className="nav-links" aria-label="Documentation navigation">
            <Link href="/" className="nav-link">
              Product
            </Link>
            <Link href="/dashboard" className="nav-link">
              Disputes
            </Link>
            <Link href="/guide" className="nav-link active">
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

      <main style={{ maxWidth: 1040, margin: "0 auto", padding: "64px 24px 96px" }}>
        {/* Document Header */}
        <div style={{ marginBottom: 48, textAlign: "left" }}>
          <div className="hero-eyebrow">Documentation · Implementation Runbook</div>
          <h1 className="hero-h1 display-serif" style={{ margin: "12px 0 16px", textAlign: "left" }}>
            <span className="headline-ink">Step-by-step defense guide.</span>{" "}
            <span className="headline-fade">From PayPal Sandbox setup to human-approved execution.</span>
          </h1>
          <p className="hero-subcopy" style={{ margin: 0, textAlign: "left" }}>
            PHALANX protects PayPal merchants by gathering carrier proof, assembling evidence dossiers, running multi-juror red-team reviews, and enforcing an immutable human approval gate before any PayPal API call.
          </p>
        </div>

        {/* Section 1: Quickstart & Setup */}
        <section className="card-white" style={{ marginBottom: 32 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 600 }}>
            1. Setup &amp; Prerequisites
          </h2>
          <p style={{ margin: "0 0 16px", color: "var(--text-secondary)", fontSize: 15 }}>
            PHALANX operates out-of-the-box with zero configuration in seeded demo mode. For live Sandbox execution, configure PayPal Developer credentials in <code className="font-mono">.env.local</code>:
          </p>
          <pre
            style={{
              background: "var(--bg-muted)",
              border: "1px solid var(--border-hairline)",
              borderRadius: "var(--radius-tag)",
              padding: "16px 20px",
              fontSize: 13,
              lineHeight: 1.6,
              overflowX: "auto",
            }}
          >
{`# PayPal Sandbox Credentials (developer.paypal.com)
PAYPAL_CLIENT_ID=your-sandbox-client-id
PAYPAL_CLIENT_SECRET=your-sandbox-client-secret
PAYPAL_WEBHOOK_ID=your-sandbox-webhook-id
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com

# Multi-Provider AI Keys (Optional - zero-key mode falls back to deterministic template floor)
GEMINI_API_KEY=your-gemini-key
LLM_PROVIDER=gemini`}
          </pre>
        </section>

        {/* Section 2: Seeded Demo Scenarios */}
        <section className="card-white" style={{ marginBottom: 32 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 600 }}>
            2. The 3 Seeded Scenarios (SIMULATED)
          </h2>
          <p style={{ margin: "0 0 18px", color: "var(--text-secondary)", fontSize: 15 }}>
            Three canonical dispute archetypes demonstrate PHALANX&apos;s deterministic routing and proof assembly:
          </p>
          <div className="grid-3" style={{ gap: 16 }}>
            <div style={{ padding: 18, background: "var(--bg-muted)", borderRadius: "var(--radius-card)", border: "1px solid var(--border-hairline)" }}>
              <span className="chip sim" style={{ marginBottom: 8 }}>Scenario A · $480.00 USD</span>
              <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600 }}>PP-D-88412</h3>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-secondary)" }}>
                Item Not Received. Pass 1 scores 60/100 (lacks merchant log). Hound extracts customer chat; Pass 2 passes at 85/100.
              </p>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--verdict-contest-text)" }}>
                Verdict: CONTEST_HARD_PROOF
              </div>
            </div>

            <div style={{ padding: 18, background: "var(--bg-muted)", borderRadius: "var(--radius-card)", border: "1px solid var(--border-hairline)" }}>
              <span className="chip sim" style={{ marginBottom: 8 }}>Scenario B · $210.00 USD</span>
              <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600 }}>PP-D-88413</h3>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-secondary)" }}>
                Not As Described. Delivered but lacks condition proof (score 60/100). Arbiter routes a 40% ($84.00 USD) refund offer.
              </p>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--verdict-offer-text)" }}>
                Verdict: DE_ESCALATE_OFFER
              </div>
            </div>

            <div style={{ padding: 18, background: "var(--bg-muted)", borderRadius: "var(--radius-card)", border: "1px solid var(--border-hairline)" }}>
              <span className="chip sim" style={{ marginBottom: 8 }}>Scenario C · $95.00 USD</span>
              <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600 }}>PP-D-88414</h3>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-secondary)" }}>
                Tracking shows carrier package loss (score 0/100). Immediate concede saves $15 dispute fee. Suggests carrier insurance claim.
              </p>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--verdict-concede-text)" }}>
                Verdict: CONCEDE_FAST_SETTLE
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: The 0–100 Checklist Rubric */}
        <section className="card-white" style={{ marginBottom: 32 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 600 }}>
            3. Deterministic 0–100 Checklist Rubric
          </h2>
          <p style={{ margin: "0 0 16px", color: "var(--text-secondary)", fontSize: 15 }}>
            Checklist scores are computed by deterministic code in <code className="font-mono">src/lib/scorer.ts</code> — the LLM never generates numbers or decides routing:
          </p>
          <dl className="kv" style={{ rowGap: 12 }}>
            <dt className="font-mono">+30 Points</dt>
            <dd>Carrier tracking status indicates <b>DELIVERED</b> to buyer destination.</dd>
            <dt className="font-mono">+15 Points</dt>
            <dd>Delivery verifiable via carrier records, tracking number, and delivery timestamp.</dd>
            <dt className="font-mono">+15 Points</dt>
            <dd>Signature confirmation verified on file (mandatory for transactions &gt;$750).</dd>
            <dt className="font-mono">+25 Points</dt>
            <dd>Post-delivery merchant communication log confirming receipt or item condition.</dd>
            <dt className="font-mono">+15 Points</dt>
            <dd>Original purchase invoice, transaction metadata, and store terms of service.</dd>
          </dl>
          <div style={{ marginTop: 20, padding: 14, background: "var(--bg-muted)", borderRadius: "var(--radius-tag)", fontSize: 13 }}>
            <b>Routing Policy:</b> Score ≥ 75 → <span className="badge contest">CONTEST_HARD_PROOF</span> · Score 35–74 → <span className="badge offer">DE_ESCALATE_OFFER</span> · Score &lt; 35 → <span className="badge concede">CONCEDE_FAST_SETTLE</span>.
          </div>
        </section>

        {/* Section 4: The Human Approval Gate */}
        <section className="card-white" style={{ marginBottom: 32 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 600 }}>
            4. The Mandatory Human Approval Gate
          </h2>
          <p style={{ margin: "0 0 12px", color: "var(--text-secondary)", fontSize: 15 }}>
            PayPal merchants must never be exposed to rogue automated actions. PHALANX physically gates every PayPal mutation:
          </p>
          <ul style={{ margin: "0 0 16px", paddingLeft: 20, color: "var(--text-secondary)", fontSize: 14.5, lineHeight: 1.7 }}>
            <li><b>Pre-approval:</b> Clicking <i>Execute</i> without prior human approval returns <code className="font-mono">APPROVAL_REQUIRED</code>.</li>
            <li><b>Human review:</b> Merchant inspects the evidence summary, Judge framing, and deterministic outcome matrix.</li>
            <li><b>Approve button:</b> Records merchant identity, action (<code className="font-mono">provide-evidence</code>, <code className="font-mono">make-offer</code>, or <code className="font-mono">accept-claim</code>), and timestamp.</li>
            <li><b>Seeded protection:</b> In seeded demo mode, clicking <i>Execute</i> records a logged refusal (<code className="font-mono">REFUSED_SEEDED_MODE</code>) preventing fake API calls.</li>
          </ul>
        </section>

        {/* Section 5: Verification & Tests */}
        <section className="card-white" style={{ marginBottom: 40 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 600 }}>
            5. Verification &amp; Negative Test Suite
          </h2>
          <p style={{ margin: "0 0 16px", color: "var(--text-secondary)", fontSize: 15 }}>
            Verify the complete deterministic pipeline and all 84 negative test cases locally:
          </p>
          <pre
            style={{
              background: "var(--bg-muted)",
              border: "1px solid var(--border-hairline)",
              borderRadius: "var(--radius-tag)",
              padding: "16px 20px",
              fontSize: 13,
              lineHeight: 1.6,
              overflowX: "auto",
            }}
          >
{`# 1. Run Next.js production build
npm run build

# 2. Run deterministic unit checks (114/114 passing)
npx tsx scripts/unit-checks.ts

# 3. Run negative test suite against production server (84/84 passing)
PORT=3100 npx next start -p 3100
PHALANX_BASE_URL=http://localhost:3100 node scripts/negative-tests.mjs`}
          </pre>
        </section>

        {/* Call to Action */}
        <div style={{ textAlign: "center", padding: "48px 24px", background: "#ffffff", borderRadius: "var(--radius-card)", border: "1px solid var(--border-hairline)" }}>
          <h2 className="display-serif" style={{ margin: "0 0 12px", fontSize: 28 }}>
            Ready to inspect the live workbench?
          </h2>
          <p style={{ color: "var(--text-secondary)", margin: "0 0 24px", fontSize: 16 }}>
            Launch the dispute defense swarm on Scenarios A, B, and C with full PDF dossiers.
          </p>
          <Link className="btn primary" href="/dashboard" style={{ padding: "10px 24px" }}>
            Open the Workbench →
          </Link>
        </div>
      </main>

      {/* Footer */}
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

