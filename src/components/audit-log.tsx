// Webhook & Audit Log section (Gemini directive §3.1 "Webhook & Audit
// Log" nav target). Reads the real server webhook log via
// GET /api/webhooks/paypal — every PayPal CUSTOMER.DISPUTE.* event the
// server received, most recent first. Empty state is honest: no events
// have arrived yet.
"use client";

import { useEffect, useState } from "react";

interface WebhookLogEntry {
  at: string;
  event_id: string;
  result: string;
  detail: string;
}

export default function AuditLog() {
  const [log, setLog] = useState<WebhookLogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/webhooks/paypal")
      .then((res) => res.json())
      .then((body) => {
        setLog(Array.isArray(body.log) ? body.log : []);
        setLoaded(true);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoaded(true);
      });
  }, []);

  return (
    <section id="audit" className="card-white audit-log-section">
      <h2 className="audit-log-title">Webhook &amp; Audit Log</h2>
      <p className="footnote">
        PayPal webhook endpoint:{" "}
        <span className="font-mono">/api/webhooks/paypal</span> · subscribed
        to CUSTOMER.DISPUTE.CREATED, UPDATED and RESOLVED · signature-verified
        and deduplicated; unverified or duplicate events are logged and
        ignored, never executed.
      </p>
      {!loaded ? (
        <p className="audit-log-empty">Loading webhook log…</p>
      ) : error ? (
        <p className="audit-log-empty">Could not load webhook log: {error}</p>
      ) : log.length === 0 ? (
        <p className="audit-log-empty">
          No webhook events received yet — events arrive here when PayPal posts
          a dispute event for this deployment.
        </p>
      ) : (
        <div className="audit-log-list">
          {log.map((entry, i) => (
            <div key={`${entry.event_id}-${i}`} className="audit-log-row">
              <span className="font-mono tabular-nums audit-log-time">
                {entry.at}
              </span>
              <span className="font-mono audit-log-event">
                {entry.event_id}
              </span>
              <span
                className={`badge ${entry.result.includes("IGNORED") || entry.result.includes("UNVERIFIED") ? "offer" : "contest"}`}
              >
                {entry.result}
              </span>
              <span className="audit-log-detail">{entry.detail}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
