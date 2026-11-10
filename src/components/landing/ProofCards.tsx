// Sticky stacking proof cards — the three seeded demo outcomes.
// Amounts/reasons come from the live ledger; scores/verdicts come
// from the latest run when one exists, else the recorded seeded-run
// outcomes (A 85 CONTEST / B 60 OFFER / C 0 CONCEDE — locked by the
// brief). Every card is labelled SIMULATED and links to its dossier.
"use client";

import Link from "next/link";
import type { Dispute, SwarmRun } from "@/lib/types";
import { Reveal } from "@/components/premium";
import styles from "./landing.module.css";
import {
  SEEDED_OUTCOMES,
  verdictLong,
  verdictShort,
  verdictTone,
} from "./verdict";
import type { CSSProperties } from "react";

const ORDER = ["PP-D-88412", "PP-D-88413", "PP-D-88414"];

export default function ProofCards({
  disputes,
  runs,
  loading,
}: {
  disputes: Dispute[];
  runs: Record<string, SwarmRun>;
  loading: boolean;
}) {
  const showSkeleton = loading && disputes.length === 0;

  return (
    <section id="cases" className={styles.sectionPad}>
      <div className={styles.container}>
        <Reveal>
          <p className={styles.eyebrow}>Proof, not promises</p>
          <h2 className={`${styles.h2} display-sans`}>
            Three seeded cases.{" "}
            <span className="headline-fade">Three different verdicts.</span>
          </h2>
          <p className={styles.lede}>
            The same swarm, the same checklist — different evidence, different
            outcome. Scores are an internal heuristic, never a win
            probability.
          </p>
        </Reveal>

        <div className={styles.stackWrap} style={{ marginTop: 48 }}>
          {showSkeleton
            ? [0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`loading-shimmer ${styles.stackCard}`}
                  style={{ minHeight: 340 }}
                />
              ))
            : ORDER.map((id, i) => {
                const d = disputes.find((x) => x.id === id);
                const recorded = SEEDED_OUTCOMES[id];
                const run = runs[id];
                const score = run ? run.score : recorded.score;
                const verdict = run ? run.verdict : recorded.verdict;
                const tone = verdictTone(verdict);
                const amount = d
                  ? Number.parseFloat(d.amount.value || "0")
                  : { "PP-D-88412": 480, "PP-D-88413": 210, "PP-D-88414": 95 }[
                      id
                    ] ?? 0;
                return (
                  <article
                    key={id}
                    className={styles.stackCard}
                    style={{ "--stack-i": i } as CSSProperties}
                  >
                    <div
                      className={`${styles.stackAccent} ${styles[tone]}`}
                      aria-hidden="true"
                    />
                    <div className={styles.stackTop}>
                      <span className={styles.stackCase}>
                        Case {recorded.caseLabel} · Seeded demo
                      </span>
                      <span className="badge sim">SIMULATED</span>
                    </div>
                    <div className={styles.stackBody}>
                      <div>
                        <p
                          className={`${styles.stackAmount} font-mono tabular-nums`}
                        >
                          ${amount.toFixed(0)}
                        </p>
                        <p className={`${styles.stackId} font-mono`}>{id}</p>
                        {d && (
                          <p className={`${styles.stackReason} font-mono`}>
                            {d.reason}
                          </p>
                        )}
                      </div>
                      <div>
                        <p
                          className={`${styles.stackScoreNum} font-mono tabular-nums`}
                        >
                          {score}
                          <span className={styles.stackScoreOf}> / 100</span>
                        </p>
                        <div className="score-gauge" aria-hidden="true">
                          <div
                            className={`score-gauge-fill ${tone}`}
                            style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                          />
                          <span
                            className="score-gauge-marker"
                            style={{ left: "35%" }}
                          >
                            <span>35</span>
                          </span>
                          <span
                            className="score-gauge-marker"
                            style={{ left: "75%" }}
                          >
                            <span>75</span>
                          </span>
                        </div>
                        <div className="score-gauge-labels">
                          <span>CONCEDE &lt; 35</span>
                          <span>OFFER 35–74</span>
                          <span>CONTEST ≥ 75</span>
                        </div>
                        <div className={styles.stackVerdictRow}>
                          <span className={`badge ${tone}`}>
                            {verdictShort(verdict)}
                          </span>
                          <span className="font-mono" style={{ fontSize: 12.5 }}>
                            {verdictLong(verdict)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Link href={`/disputes/${id}`} className={styles.stackLink}>
                      Open dossier →
                    </Link>
                  </article>
                );
              })}
        </div>

        <p className={styles.stackNote}>
          Seeded outcomes are the recorded results of the seeded swarm runs on
          SIMULATED data. Live Sandbox disputes score on their own evidence —
          the three real Sandbox cases each scored 15 / CONCEDE on bare
          Send Money payments with no tracking.
        </p>
      </div>
    </section>
  );
}
