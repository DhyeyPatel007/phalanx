// Horizontal-scroll feature strip — features travel sideways as you
// scroll down (useScrub drives translateX). On narrow screens or
// under reduced motion it degrades to a normal vertical stack.
"use client";

import { useEffect, useState } from "react";
import { CursorGlow, usePrefersReducedMotion, useScrub } from "@/components/premium";
import styles from "./landing.module.css";

const FEATURES = [
  {
    tag: "Scoring",
    title: "Deterministic 0–100 scorer",
    body: "Checklist points decide the verdict. Thresholds 35 / 75 are locked — the model drafts wording only and can never override the score.",
  },
  {
    tag: "Control",
    title: "Human approval gate",
    body: "Nothing executes without a merchant pressing Approve. The swarm drafts, a human decides, and every approval is recorded.",
  },
  {
    tag: "Safety",
    title: "Sandbox-only execution",
    body: "Live actions run against the PayPal Sandbox only. Zero real money moves, and live disputes are pulled straight from PayPal's REST API.",
  },
  {
    tag: "Proof",
    title: "Evidence vault",
    body: "Tracking, invoices and merchant logs, each SHA-256 verified before it counts toward the score. Missing proof is named as a gap, not guessed.",
  },
  {
    tag: "Export",
    title: "5-page PDF dossiers",
    body: "Every run exports a dossier: the score, the named gaps, the debate, and the exact action taken — ready to attach to the dispute.",
  },
  {
    tag: "Audit",
    title: "Webhook & audit log",
    body: "Every PayPal event, every approval and every execution is logged in one place, so the whole trail is inspectable after the fact.",
  },
];

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setNarrow(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

export default function FeatureStrip() {
  const [wrapRef, progress] = useScrub<HTMLDivElement>();
  const [trackRef, setTrackRef] = useState<HTMLDivElement | null>(null);
  const [maxShift, setMaxShift] = useState(0);
  const reduced = usePrefersReducedMotion();
  const narrow = useNarrow();
  const scrolling = !reduced && !narrow;

  // Measure the real overflow so the last card lands flush, never
  // overshooting into empty space.
  useEffect(() => {
    if (!scrolling || !trackRef) return;
    const measure = () =>
      setMaxShift(Math.max(0, trackRef.scrollWidth - window.innerWidth));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [scrolling, trackRef]);

  const shift = scrolling ? progress * maxShift : 0;

  const cards = FEATURES.map((f, i) => (
    <CursorGlow key={f.title} className={styles.hCard}>
      <span className={styles.hCardTag}>{f.tag}</span>
      <h3>{f.title}</h3>
      <p>{f.body}</p>
      <span className={`${styles.hCardNum} font-mono tabular-nums`}>
        {String(i + 1).padStart(2, "0")} / {String(FEATURES.length).padStart(2, "0")}
      </span>
    </CursorGlow>
  ));

  if (!scrolling) {
    return (
      <section id="features" className={styles.hStack}>
        <div className={styles.container}>
          <p className={styles.eyebrow}>What it does</p>
          <h2 className={`${styles.h2} display-sans`}>
            Built like a workbench,{" "}
            <span className="headline-fade">not a chatbot.</span>
          </h2>
          <p className={styles.lede}>
            Six capabilities, each one doing a single job in the open — no
            hidden verdicts, no invented evidence.
          </p>
        </div>
        <div className={styles.hStackTrack}>{cards}</div>
      </section>
    );
  }

  return (
    <section id="features" ref={wrapRef} className={styles.hWrap}>
      <div className={styles.hSticky}>
        <div className={styles.hHead}>
          <p className={styles.eyebrow}>What it does</p>
          <h2 className={`${styles.h2} display-sans`}>
            Built like a workbench,{" "}
            <span className="headline-fade">not a chatbot.</span>
          </h2>
        </div>
        <div
          ref={setTrackRef}
          className={styles.hTrack}
          style={{ transform: `translateX(${-shift.toFixed(1)}px)` }}
        >
          {cards}
        </div>
        <p className={styles.hHint}>Keep scrolling — the strip moves sideways ↓</p>
      </div>
    </section>
  );
}
