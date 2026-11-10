// Standalone login page. Client-side demo gate only — no server
// session, no accounts. On success, route to /dashboard.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoginForm } from "@/components/auth-gate";
import { useAuth } from "@/components/use-auth";
import styles from "@/components/auth.module.css";

export default function LoginPage() {
  const { authed } = useAuth();
  const router = useRouter();

  if (authed) {
    return (
      <main className={styles.pageWrap}>
        <div className={`${styles.card} ${styles.alreadyIn}`}>
          <div className={styles.shield} aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 26 26">
              <path
                d="M13 1.5 23 5.5v7c0 6.2-4.2 10.6-10 12-5.8-1.4-10-5.8-10-12v-7L13 1.5Z"
                fill="#09090B"
              />
              <path
                d="M13 9.2v7M9.8 12.4h6.4"
                stroke="#10B981"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1 className={styles.alreadyInTitle}>You&rsquo;re in</h1>
          <p className={styles.alreadyInText}>
            Signed in to the demo workspace as the single merchant.
          </p>
          <Link href="/dashboard" className="primary btn">
            Continue to dashboard →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.pageWrap}>
      <LoginForm onSuccess={() => router.push("/dashboard")} />
      <div className={styles.framing}>
        <p className={styles.framingTitle}>PHALANX</p>
        <p className={styles.framingText}>
          Adversarial dispute defense for PayPal merchants — deterministic
          checklist scoring, a 3-juror swarm, and a human approval gate before
          anything executes.
        </p>
        <p className={styles.framingText} style={{ marginTop: 8 }}>
          Demo workspace — single merchant. No accounts, no server session;
          your dashboard is yours alone on this deployment.
        </p>
      </div>
    </main>
  );
}
