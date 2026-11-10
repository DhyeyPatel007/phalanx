import Link from "next/link";

/**
 * 404 page (new alabaster theme). Honest copy: the route does not exist;
 * nothing was changed or sent anywhere.
 */
export default function NotFound() {
  return (
    <main className="detail-wrap">
      <div className="detail-header-card">
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 650, letterSpacing: "-0.02em" }}>
          Page not found
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          This route does not exist in PHALANX. The dispute ledger and your
          seeded demo cases are untouched.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn primary" href="/dashboard">
            Back to dashboard
          </Link>
          <Link className="btn" href="/">
            Go to overview
          </Link>
        </div>
      </div>
    </main>
  );
}
