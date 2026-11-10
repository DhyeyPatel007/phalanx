// Final CTA — magnetic button, auth-aware: straight to /dashboard
// when logged in, to /login when logged out.
"use client";

import Link from "next/link";
import { Magnetic, Reveal } from "@/components/premium";
import { useAuth } from "@/components/use-auth";
import styles from "./landing.module.css";

export default function FinalCta() {
  const { authed } = useAuth();
  const href = authed ? "/dashboard" : "/login";

  return (
    <section id="cta" className={styles.ctaSection}>
      <div className={styles.container}>
        <Reveal>
          <h2 className={`${styles.ctaH2} display-sans`}>
            Let the swarm read the dispute.{" "}
            <span className="headline-fade">You make the call.</span>
          </h2>
          <p className={styles.ctaSub}>
            Free for PayPal merchants. Deterministic scoring, a human approval
            gate, and Sandbox-only execution — no real money, no hallucinated
            verdicts.
          </p>
          <Magnetic strength={0.25}>
            <Link href={href} className={`btn primary ${styles.ctaBtn}`}>
              Enter the dashboard →
            </Link>
          </Magnetic>
          <Link href="/guide" className={styles.ctaSecondary}>
            Read the integration guide →
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
