// Pinned scrollytelling "How the swarm works" — one stage at a time
// as you scroll. Stage names/order match SwarmPipelineVisualizer
// exactly (Hound, Prosecutor, Red-Team, 3-Juror Quorum, Judge,
// Arbiter). The visualizer itself is embedded below the stage panel.
// Reduced motion or narrow screens: the pin is dropped and all six
// stages render as a static list — content is never hidden.
"use client";

import { useEffect, useState } from "react";
import { SwarmPipelineVisualizer } from "@/components/ui/micro-interactions";
import { usePrefersReducedMotion, useScrub } from "@/components/premium";
import styles from "./landing.module.css";

const STAGES = [
  {
    id: "01",
    name: "Hound",
    role: "Extracts PayPal artifacts & attached merchant bills with SHA-256 verification.",
  },
  {
    id: "02",
    name: "Prosecutor",
    role: "Drafts evidence-backed rebuttal citing tracking, logs, and invoice IDs.",
  },
  {
    id: "03",
    name: "Red-Team",
    role: "Attacks the draft rebuttal and surfaces missing proof vulnerabilities.",
  },
  {
    id: "04",
    name: "3-Juror Quorum",
    role: "Evidence, Policy & Buyer-Sympathy personas evaluate gaps (2/3 quorum).",
  },
  {
    id: "05",
    name: "Judge",
    role: "Deduplicates ~70 raw juror notes into 2–3 practical reasons & named gaps.",
  },
  {
    id: "06",
    name: "Arbiter",
    role: "Applies deterministic 0–100 checklist score to route Contest, Offer, or Concede.",
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

export default function ScrollySwarm() {
  const [scrubRef, progress] = useScrub<HTMLElement>();
  const reduced = usePrefersReducedMotion();
  const narrow = useNarrow();
  const staticMode = reduced || narrow;

  const active = Math.min(STAGES.length - 1, Math.floor(progress * STAGES.length));
  const stage = STAGES[active];

  const jumpTo = (i: number) => {
    const el = scrubRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const total = el.offsetHeight - window.innerHeight;
    window.scrollTo({
      top: top + ((i + 0.5) / STAGES.length) * total,
      behavior: reduced ? "auto" : "smooth",
    });
  };

  if (staticMode) {
    return (
      <section id="swarm" className={styles.scrollyStatic}>
        <div className={styles.container}>
          <p className={styles.eyebrow}>How the swarm works</p>
          <h2 className={`${styles.h2} display-sans`}>
            Six agents in debate.{" "}
            <span className="headline-fade">One deterministic verdict.</span>
          </h2>
          <p className={styles.lede}>
            The LLM drafts the prose. A deterministic checklist scorer decides
            the verdict — the score decides, never the model.
          </p>
          <div className={styles.staticStageGrid}>
            {STAGES.map((s) => (
              <div key={s.id} className={styles.staticStageCard}>
                <span className="font-mono tabular-nums">{s.id}</span>
                <h3>{s.name}</h3>
                <p>{s.role}</p>
              </div>
            ))}
          </div>
          <SwarmPipelineVisualizer />
        </div>
      </section>
    );
  }

  return (
    <section id="swarm" ref={scrubRef} className={styles.scrolly}>
      <div className={styles.scrollySticky}>
        <div className={styles.scrollyInner}>
          <div>
            <p className={styles.eyebrow}>How the swarm works</p>
            <h2 className={`${styles.h2} display-sans`}>
              Six agents in debate.{" "}
              <span className="headline-fade">One deterministic verdict.</span>
            </h2>
          </div>

          <div className={styles.scrollyGrid}>
            <div
              className={styles.stageList}
              role="tablist"
              aria-label="Swarm stages"
            >
              {STAGES.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  onClick={() => jumpTo(i)}
                  className={`${styles.stageListItem} ${i === active ? styles.stageListItemActive : ""}`}
                >
                  <span className={`${styles.stageListNum} font-mono`}>
                    {s.id}
                  </span>
                  {s.name}
                </button>
              ))}
            </div>

            <div className={styles.stagePanel} aria-live="polite">
              <div key={stage.id} className={styles.stagePanelInner}>
                <span
                  className={`${styles.stageCount} font-mono tabular-nums`}
                >
                  STAGE {stage.id} / 06
                </span>
                <p className={`${styles.stageName} display-sans`}>
                  {stage.name}
                </p>
                <p className={styles.stageRole}>{stage.role}</p>
                <div className={styles.stageDots} aria-hidden="true">
                  {STAGES.map((s, i) => (
                    <span
                      key={s.id}
                      className={`${styles.stageDot} ${i === active ? styles.stageDotActive : ""}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.scrollyViz}>
            <SwarmPipelineVisualizer />
          </div>
        </div>
      </div>
    </section>
  );
}
