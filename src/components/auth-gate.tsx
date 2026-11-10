// AuthGate + LoginForm — the shared demo login form used by both the
// standalone /login page and the route gate. Client-side only: when not
// logged in, the protected content stays unmounted and the login form
// renders instead. Routes still return HTTP 200 unauthenticated —
// there is no middleware and no server redirect.
"use client";

import { useState } from "react";
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  LOGIN_FAILURE_MESSAGE,
  useAuth,
} from "./use-auth";
import styles from "./auth.module.css";

export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const { login } = useAuth();
  // Prefilled with the real demo credentials as controlled state, so
  // the first "Log in" click actually submits them. (Previously the
  // fields started empty and the browser's autofill display only
  // *looked* filled, so the first submit failed native validation.)
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(email, password)) {
      setError(null);
      onSuccess?.();
    } else {
      setError(LOGIN_FAILURE_MESSAGE);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.shield} aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 26 26">
          <path
            d="M13 1.5 23 5.5v7c0 6.2-4.2 10.6-10 12-5.8-1.4-10-5.8-10-12v-7L13 1.5Z"
            fill="#09090B"
          />
          <path
            d="M13 6.2 18.5 8.4v4.3c0 3.4-2.3 5.9-5.5 6.7-3.2-.8-5.5-3.3-5.5-6.7V8.4L13 6.2Z"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="1.1"
          />
          <path
            d="M13 9.2v7M9.8 12.4h6.4"
            stroke="#10B981"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <p className={styles.eyebrow}>PHALANX · Merchant workspace</p>
      <h1 className={styles.title}>Log in to your workspace</h1>
      <p className={styles.subtitle}>
        Dispute defense for your PayPal Sandbox ledger — deterministic
        scoring, swarm deliberation, human approval before anything moves.
      </p>

      <form onSubmit={submit} className={styles.form}>
        <label className={styles.label} htmlFor="phx-auth-email">
          Email
        </label>
        <input
          id="phx-auth-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="demo@phalanx.krynex.in"
          className={styles.input}
        />
        <label className={styles.label} htmlFor="phx-auth-password">
          Password
        </label>
        <input
          id="phx-auth-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••••"
          className={styles.input}
        />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={`primary ${styles.submit}`}>
          Log in
        </button>
      </form>

      <div className={styles.demoBox}>
        <p className={styles.demoTitle}>Demo workspace — single merchant</p>
        <p className={styles.demoCreds}>
          <span>{DEMO_EMAIL}</span>
          <span>{DEMO_PASSWORD}</span>
        </p>
        <button
          type="button"
          className={styles.fillBtn}
          onClick={() => {
            setEmail(DEMO_EMAIL);
            setPassword(DEMO_PASSWORD);
            setError(null);
          }}
        >
          Fill demo credentials →
        </button>
      </div>

      <p className={styles.honest}>
        Demo gate only — not real authentication. No accounts, no server
        session; the flag lives in this browser alone.
      </p>
    </div>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { authed } = useAuth();
  if (authed) return <>{children}</>;
  return (
    <div className={styles.gateWrap}>
      <LoginForm />
    </div>
  );
}
