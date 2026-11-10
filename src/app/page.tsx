// Premium landing — from-scratch rebuild (Nov 11, 2026).
// Apple-grade scroll-driven page: the product UI is the hero visual,
// one different scroll animation per section, every number from the
// real ledger (useLedger) or a static structural fact (6 stages).
// Data layer, API routes, thresholds (35/75) and seeded scores
// (A 85 / B 60 / C 0) are untouched.
"use client";

import Link from "next/link";
import CommandNavbar from "@/components/command-navbar";
import { useLedger } from "@/lib/use-ledger";
import {
  Magnetic,
  Marquee,
  Reveal,
  ScrollProgress,
} from "@/components/premium";
import { SerifAccent } from "@/components/ui/micro-interactions";
import HeroMockup from "@/components/landing/HeroMockup";
import ScrollySwarm from "@/components/landing/ScrollySwarm";
import FeatureStrip from "@/components/landing/FeatureStrip";
import StatBand from "@/components/landing/StatBand";
import ProofCards from "@/components/landing/ProofCards";
import FinalCta from "@/components/landing/FinalCta";
import styles from "@/components/landing/landing.module.css";

const MARQUEE_ITEMS = [
  "Deterministic scoring",
  "Human approval gate",
  "Sandbox-only execution",
  "Open source",
  "Free for merchants",
];

export default function LandingPage() {
  const { disputes, runs, telemetry, loading, error, refresh, setNotice } =
    useLedger();

  const hasSandbox = disputes.some((d) => d.source === "sandbox");
  const simulatedCount = disputes.filter((d) => d.source === "seeded").length;
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
      <ScrollProgress />
      <CommandNavbar
        envMode={hasSandbox ? "sandbox" : "seeded"}
        simulatedCount={simulatedCount}
        onSync={handleSync}
        syncing={loading}
        evidenceHref={evidenceHref}
        active="queue"
      />

      <main>
        {/* 1 — Hero: parallax + scrubbed product mockup */}
        <section className="hero-wrap hero-new" id="product">
          <Reveal>
            <div className="hero-eyebrow">
              DETERMINISTIC 0–100 CHECKLIST AUTHORITY · ADVERSARIAL 6-AGENT
              SWARM
            </div>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="hero-h1 display-sans">
              <span className="headline-ink">
                Autonomous PayPal Dispute Defense.
              </span>{" "}
              <span className="headline-fade">
                Zero <SerifAccent>Hallucinated</SerifAccent> Verdicts.
              </span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="hero-subcopy">
              The LLM drafts the prose. A deterministic checklist scorer
              decides the verdict. Attach bills, collapse 70+ juror notes
              into 3 actionable reasons, and execute only after human
              approval.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="hero-cta-row">
              <Magnetic strength={0.25}>
                <Link className="btn primary" href="/dashboard">
                  Open the Workbench →
                </Link>
              </Magnetic>
              <Magnetic strength={0.25}>
                <Link className="btn" href="#queue">
                  View Command Queue ↓
                </Link>
              </Magnetic>
            </div>
          </Reveal>

          <Reveal delay={320}>
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
          </Reveal>

          <HeroMockup
            disputes={disputes}
            runs={runs}
            loading={loading}
            error={error}
          />
        </section>

        {/* Marquee — honest items only */}
        <div className={styles.marqueeBand} aria-label="PHALANX principles">
          <Marquee duration={32}>
            {MARQUEE_ITEMS.map((item) => (
              <span key={item} className={styles.marqueeItem}>
                {item}
              </span>
            ))}
          </Marquee>
        </div>

        {/* 2 — Pinned scrollytelling: how the swarm works */}
        <ScrollySwarm />

        {/* 3 — Horizontal-scroll feature strip */}
        <FeatureStrip />

        {/* 4 — Stat band: spring counters from the real ledger */}
        <StatBand disputes={disputes} telemetry={telemetry} />

        {/* 5 — Sticky stacking proof cards: seeded outcomes */}
        <ProofCards disputes={disputes} runs={runs} loading={loading} />

        {/* Audit anchor (navbar links here; the log itself lives in the
            workbench — never faked on the landing page) */}
        <section id="audit" className={styles.sectionPad}>
          <div className={styles.container}>
            <Reveal>
              <div className={styles.auditCard}>
                <div>
                  <h3>Webhook &amp; audit log</h3>
                  <p>
                    Every PayPal dispute event, every human approval and every
                    execution is written to the audit log. The log lives in
                    the workbench, next to the cases it describes.
                  </p>
                </div>
                <Link className="btn" href="/dashboard">
                  Open the audit log →
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* 6 — Final CTA: magnetic, auth-aware */}
        <FinalCta />
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
            <p className="footer-about">
              Free for merchants — self-hosted, bring your own key. PayPal
              charges its own $15 dispute fee; PHALANX adds nothing.
              Single-tenant demo workspace.
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
