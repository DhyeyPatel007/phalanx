"use client";

import Link from "next/link";

/**
 * Route error boundary (new alabaster theme). Honest copy, no fake data:
 * something failed on our side, nothing was sent to PayPal, and the human
 * approval gate is untouched.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="detail-wrap">
      <div className="detail-header-card">
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 650, letterSpacing: "-0.02em" }}>
          Something went wrong
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          This page failed to load. No dispute action was sent to PayPal —
          nothing executes without your explicit approval. Your seeded demo
          data is unchanged.
        </p>
        {error?.digest && (
          <p className="font-mono" style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
            Error ref: {error.digest}
          </p>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="primary" onClick={() => reset()}>
            Try again
          </button>
          <Link className="btn" href="/dashboard">
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
