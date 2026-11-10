// Hero product mockup — the product IS the visual (Linear/Raycast
// pattern). Browser-chrome frame tilts / parallaxes / scale-scrubs
// with scroll via the foundations' useScrub; under reduced motion it
// sits flat and fully visible. The queue inside is REAL ledger data
// (useLedger): rows come from /api/disputes, scores/verdicts from the
// latest run when one exists, "Not run yet" when it does not. While
// loading, skeleton rows — never fake rows.
"use client";

import Link from "next/link";
import type { Dispute, SwarmRun } from "@/lib/types";
import { usePrefersReducedMotion, useScrub } from "@/components/premium";
import styles from "./landing.module.css";
import { verdictShort, verdictTone } from "./verdict";

function money(d: Dispute): string {
  const v = Number.parseFloat(d.amount.value || "0");
  const code = d.amount.currency_code || "USD";
  return `${code} ${v.toFixed(2)}`;
}

export default function HeroMockup({
  disputes,
  runs,
  loading,
  error,
}: {
  disputes: Dispute[];
  runs: Record<string, SwarmRun>;
  loading: boolean;
  error: string | null;
}) {
  const [scrubRef, progress] = useScrub<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();

  // Scrub: tilted + slightly small when entering, flat + full size as
  // it settles. progress 0 = top entering, 1 = scrolled past.
  const tilt = reduced ? 0 : (1 - progress) * 12;
  const scale = reduced ? 1 : 0.96 + 0.04 * progress;
  const rise = reduced ? 0 : (1 - progress) * 24;

  const showSkeleton = loading && disputes.length === 0;
  const sandboxCount = disputes.filter((d) => d.source === "sandbox").length;
  const seededCount = disputes.filter((d) => d.source === "seeded").length;

  return (
    <div id="queue" className={styles.mockupPerspective}>
      <div
        ref={scrubRef}
        className={styles.mockupFrame}
        style={
          reduced
            ? undefined
            : {
                transform: `perspective(1400px) rotateX(${tilt.toFixed(2)}deg) translateY(${rise.toFixed(1)}px) scale(${scale.toFixed(3)})`,
              }
        }
      >
        <div className={styles.mockupChrome} aria-hidden="true">
          <span className={styles.chromeDot} />
          <span className={styles.chromeDot} />
          <span className={styles.chromeDot} />
          <span className={`${styles.chromeUrl} font-mono`}>
            phalanx.krynex.in/dashboard
          </span>
        </div>

        <div className={styles.mockupBody}>
          <div className={styles.mockupHead}>
            <p className={styles.mockupTitle}>Live dispute queue</p>
            <p className={styles.mockupMeta}>
              {showSkeleton
                ? "Loading the ledger…"
                : `${disputes.length} case${disputes.length === 1 ? "" : "s"} · ${sandboxCount} live Sandbox · ${seededCount} seeded`}
            </p>
          </div>

          {error && (
            <div className="callout error" role="alert">
              Error loading the ledger: {error}
            </div>
          )}

          {showSkeleton ? (
            <div aria-label="Loading dispute queue">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`loading-shimmer ${styles.skeletonRow}`}
                />
              ))}
            </div>
          ) : disputes.length === 0 ? (
            <p className={styles.mockupEmpty}>
              No disputes in the ledger yet — run the seeded demo from the
              dashboard to load the three demo scenarios.
            </p>
          ) : (
            <div>
              <div className={styles.queueHead} aria-hidden="true">
                <span>Case</span>
                <span>Reason</span>
                <span style={{ textAlign: "right" }}>Amount</span>
                <span>Score</span>
                <span style={{ textAlign: "right" }}>Verdict</span>
              </div>
              {disputes.map((d) => {
                const run = runs[d.id];
                const tone = run ? verdictTone(run.verdict) : null;
                return (
                  <Link
                    key={d.id}
                    href={`/disputes/${d.id}`}
                    className={styles.queueRow}
                  >
                    <span className={`${styles.queueId} font-mono`}>
                      {d.id}{" "}
                      {d.source === "seeded" ? (
                        <span className="badge sim">SIMULATED</span>
                      ) : (
                        <span className="badge live">LIVE</span>
                      )}
                    </span>
                    <span className={`${styles.queueReason} font-mono`}>
                      {d.reason}
                    </span>
                    <span
                      className={`${styles.queueAmount} font-mono tabular-nums`}
                    >
                      {money(d)}
                    </span>
                    <span className={styles.queueScore}>
                      <span
                        className={`${styles.queueScoreNum} font-mono tabular-nums`}
                      >
                        {run ? `${run.score}` : "—"}
                      </span>
                      <span className={styles.queueMiniBar} aria-hidden="true">
                        <span
                          className={`${styles.queueMiniFill} ${tone ? styles[tone] : ""}`}
                          style={{
                            width: `${run ? Math.max(0, Math.min(100, run.score)) : 0}%`,
                          }}
                        />
                      </span>
                    </span>
                    <span className={styles.queueVerdict}>
                      {run ? (
                        <span className={`badge ${tone ?? ""}`}>
                          {verdictShort(run.verdict)}
                        </span>
                      ) : (
                        <span className="badge na">NOT RUN YET</span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          <div className={styles.queueFoot}>
            <span>
              Seeded rows are SIMULATED demo scenarios — not real buyers or
              funds. Scores are a checklist heuristic, never a win
              probability.
            </span>
            <Link href="/dashboard">Open the workbench →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
