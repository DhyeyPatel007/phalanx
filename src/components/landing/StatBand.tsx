// Stat band — spring counters computed ONLY from the real fetched
// ledger (server-side telemetry + row counts) plus the structural
// fact of 6 swarm stages. No invented metric anywhere.
"use client";

import type { Dispute } from "@/lib/types";
import type { Telemetry } from "@/lib/use-ledger";
import { CursorGlow, Reveal, SpringCounter } from "@/components/premium";
import styles from "./landing.module.css";

export default function StatBand({
  disputes,
  telemetry,
}: {
  disputes: Dispute[];
  telemetry: Telemetry | null;
}) {
  const fallbackVolume = disputes.reduce(
    (sum, d) => sum + (Number.parseFloat(d.amount.value || "0") || 0),
    0,
  );
  const volume = telemetry ? telemetry.total_volume_usd : fallbackVolume;
  const liveCount = disputes.filter((d) => d.source === "sandbox").length;
  const seededCount = disputes.filter((d) => d.source === "seeded").length;

  const stats = [
    {
      label: "Total disputed volume",
      sub: "From the live ledger — updates as disputes sync.",
      value: <SpringCounter value={Math.round(volume)} prefix="$" />,
    },
    {
      label: "Live Sandbox cases",
      sub: "Pulled from PayPal's REST API, not a webhook.",
      value: <SpringCounter value={liveCount} />,
    },
    {
      label: "Seeded demo cases",
      sub: "SIMULATED scenarios — demo data, clearly labelled.",
      value: <SpringCounter value={seededCount} />,
    },
    {
      label: "Swarm stages",
      sub: "Hound → Prosecutor → Red-Team → Quorum → Judge → Arbiter.",
      value: <SpringCounter value={6} />,
    },
  ];

  return (
    <section id="stats" className={`${styles.statBand} ${styles.sectionPad}`}>
      <div className={styles.container}>
        <Reveal>
          <p className={styles.eyebrow}>The ledger, in numbers</p>
        </Reveal>
        <div className={styles.statGrid}>
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 90}>
              <CursorGlow className={styles.statCard}>
                <span className={`${styles.statValue} tabular-nums`}>
                  {s.value}
                </span>
                <span className={styles.statLabel}>{s.label}</span>
                <p className={styles.statSub}>{s.sub}</p>
              </CursorGlow>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
