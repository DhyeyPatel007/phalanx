// Dashboard workbench — new UI (Gemini directive §3): the same command
// navbar as the landing, the new Bento KPI strip, the main dispute
// command queue, recent swarm runs, PDF dossiers and the safety charter.
// All values come from the live ledger (useLedger).
"use client";

import Link from "next/link";
import CommandNavbar from "@/components/command-navbar";
import BentoKpis from "@/components/bento-kpis";
import DisputeQueue from "@/components/dispute-queue";
import { useLedger } from "@/lib/use-ledger";
import type { Verdict } from "@/lib/types";

function verdictBadge(v: Verdict | null) {
  if (!v) return <span className="badge na">NOT RUN</span>;
  const cls =
    v === "CONTEST_HARD_PROOF"
      ? "contest"
      : v === "DE_ESCALATE_OFFER"
        ? "offer"
        : "concede";
  return <span className={`badge ${cls}`}>{v}</span>;
}

export default function DashboardPage() {
  const {
    disputes,
    runs,
    telemetry,
    loading,
    error,
    notice,
    setNotice,
    refresh,
    seedDemo,
  } = useLedger();

  const hasSandbox = disputes.some((d) => d.source === "sandbox");
  const simulatedCount = disputes.filter(
    (d) => d.source === "seeded",
  ).length;
  const evidenceHref =
    disputes.length > 0
      ? `/disputes/${disputes[0].id}#evidence-vault`
      : "/dashboard";

  const handleSync = async () => {
    await refresh();
    setNotice("Synced with PayPal Sandbox");
  };

  return (
    <div className="phalanx-canvas">
      <CommandNavbar
        envMode={hasSandbox ? "sandbox" : "seeded"}
        simulatedCount={simulatedCount}
        onSync={handleSync}
        syncing={loading}
        evidenceHref={evidenceHref}
        active="queue"
      />

      <main className="workbench-wrap">
        <div className="callout simulated">
          <span>
            <b>SIMULATED DATA</b> — seeded disputes are demo scenarios, not
            real buyers or funds. Checklist scores are an internal heuristic,
            NOT a win probability. Sandbox only; human approval is mandatory.
          </span>
          <span className="chip sim">3 Seeded Scenarios</span>
        </div>

        {notice && (
          <div className="callout notice">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="callout-dismiss"
            >
              ✕
            </button>
          </div>
        )}
        {error && <div className="callout error">Error: {error}</div>}

        <BentoKpis
          disputes={disputes}
          runs={runs}
          executionsSucceeded={telemetry?.executions_succeeded ?? 0}
        />

        <DisputeQueue disputes={disputes} runs={runs} />

        <section className="card-white dashboard-section">
          <h2 className="dashboard-section-title">
            Recent Swarm Executions ({Object.keys(runs).length})
          </h2>
          <p className="footnote">
            Adversarial swarm runs: Hound evidence retrieval → Prosecutor
            draft → 3-Juror quorum audit → Arbiter verdict.
          </p>
          {Object.keys(runs).length === 0 ? (
            <p className="dashboard-empty">
              No swarm runs recorded yet. Click any dispute in the ledger
              above to inspect evidence and run the adversarial swarm.
            </p>
          ) : (
            <div className="runs-list">
              {Object.entries(runs).map(([disputeId, r]) => (
                <div key={disputeId} className="runs-row">
                  <div>
                    <span className="font-mono runs-row-id">{disputeId}</span>
                    <span className="runs-row-meta">
                      {r.iterations.length} iterations · {r.duration_ms} ms ·
                      Score: {r.score}/100
                    </span>
                  </div>
                  <div className="runs-row-actions">
                    {verdictBadge(r.verdict)}
                    <Link
                      href={`/disputes/${disputeId}`}
                      className="btn runs-inspect"
                    >
                      Inspect →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card-white dashboard-section">
          <h2 className="dashboard-section-title">
            5-Page PDF Evidence Dossiers (pdf-lib · SHA-256 Manifest)
          </h2>
          <p className="footnote">
            Every seeded dispute carries an immutable SIMULATED watermark on
            all 5 pages. Pre-swarm downloads compile Pass-1 fast merchant
            sources.
          </p>
          <div className="dossiers-list">
            {disputes.map((d) => (
              <a
                key={d.id}
                className="pdf-link"
                href={`/api/disputes/${d.id}/evidence.pdf`}
                target="_blank"
                rel="noreferrer"
              >
                Download {d.id} ({d.reason} · ${d.amount.value} USD) ↗
              </a>
            ))}
          </div>
          {disputes.length === 0 && (
            <button className="primary" onClick={seedDemo} disabled={loading}>
              Load seeded demo
            </button>
          )}
        </section>

        <section className="card-white dashboard-section">
          <h2 className="dashboard-section-title">
            Safety Gates &amp; Deterministic Scoring Charter
          </h2>
          <dl className="kv">
            <dt>PayPal Environment</dt>
            <dd>
              Sandbox only (api-m.sandbox.paypal.com) — zero real money or
              live buyer accounts
            </dd>
            <dt>Human Approval Gate</dt>
            <dd>
              Strictly mandatory before provide-evidence, make-offer, or
              accept-claim actions
            </dd>
            <dt>Checklist Rubric</dt>
            <dd>
              Deterministic 0–100 score (30 + 15 + 15 + 25 + 15); never
              treated as a win probability
            </dd>
            <dt>LLM &amp; 3-Juror Layer</dt>
            <dd>
              Drafts rebuttal wording &amp; flags quorum gaps only; zero-key
              template fallback guaranteed
            </dd>
          </dl>
        </section>
      </main>
    </div>
  );
}
