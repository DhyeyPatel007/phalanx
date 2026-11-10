// Main dispute command queue (Gemini directive §3.4): filter pills +
// instant search (⌘K to focus) above a custom AG Grid v36 table.
// Filter bands use the LOCKED 35/75 thresholds (≥75 contest, 35–74
// offer, <35 concede) so the UI never disagrees with the scorer.
// Cell renderers are the verified ones in ag-grid-cells.tsx.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
} from "ag-grid-community";
import type { Dispute, SwarmRun, Verdict } from "@/lib/types";
import {
  ActionHoverCell,
  DisputeIdCell,
  ScoreGaugeCell,
  VerdictBadgeCell,
  phalanxGridTheme,
} from "@/components/ag-grid-cells";

ModuleRegistry.registerModules([AllCommunityModule]);

type QueueFilter =
  | "all"
  | "contest"
  | "offer"
  | "concede"
  | "simulated"
  | "live";

interface Row {
  id: string;
  reason: string;
  amount: string;
  amountValue: number;
  iterations: number;
  score: number | null;
  verdict: Verdict | null;
  status: string;
  source: string;
  offerUsd?: number | null;
}

const FILTERS: { key: QueueFilter; label: string }[] = [
  { key: "all", label: "All Disputes" },
  { key: "contest", label: "Contest (≥75)" },
  { key: "offer", label: "De-escalate (35–74)" },
  { key: "concede", label: "Concede (<35)" },
  { key: "simulated", label: "Simulated" },
  { key: "live", label: "Live Sandbox" },
];

function reasonBadge(reason: string): string {
  return reason === "MERCHANDISE_OR_SERVICE_NOT_RECEIVED"
    ? "NOT_RECEIVED"
    : reason === "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED"
      ? "NOT_AS_DESCRIBED"
      : reason;
}

export default function DisputeQueue({
  disputes,
  runs,
}: {
  disputes: Dispute[];
  runs: Record<string, SwarmRun>;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const gridRef = useRef<AgGridReact<Row> | null>(null);

  // ⌘K / Ctrl-K focuses the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rows: Row[] = useMemo(
    () =>
      disputes.map((d) => {
        const run = runs[d.id];
        return {
          id: d.id,
          reason: d.reason,
          amount: `$${parseFloat(d.amount.value).toFixed(2)} USD`,
          amountValue: parseFloat(d.amount.value) || 0,
          iterations: run ? run.iterations.length : 0,
          score: run ? run.score : null,
          verdict: run ? run.verdict : null,
          status: d.status,
          source: d.source === "seeded" ? "Seeded — SIMULATED" : "Sandbox",
          offerUsd: run?.ev_display?.offer_cost_usd ?? null,
        };
      }),
    [disputes, runs],
  );

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "contest" && !(r.score !== null && r.score >= 75))
        return false;
      if (
        filter === "offer" &&
        !(r.score !== null && r.score >= 35 && r.score < 75)
      )
        return false;
      if (filter === "concede" && !(r.score !== null && r.score < 35))
        return false;
      if (filter === "simulated" && !r.source.includes("Seeded"))
        return false;
      if (filter === "live" && r.source.includes("Seeded")) return false;
      if (q) {
        const hay = `${r.id} ${r.reason} ${r.amount} ${r.amountValue}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, query]);

  const columns: ColDef<Row>[] = [
    {
      field: "id",
      headerName: "Dispute ID",
      minWidth: 210,
      flex: 1.4,
      sortable: true,
      filter: true,
      cellRenderer: DisputeIdCell,
    },
    {
      field: "reason",
      headerName: "Claim Reason & Amount",
      minWidth: 230,
      flex: 1.6,
      sortable: true,
      cellRenderer: (p: { data: Row }) => (
        <span className="ag-reason-cell">
          <span className="chip font-mono ag-reason-badge">
            {reasonBadge(p.data.reason)}
          </span>
          <span className="tabular-nums font-mono ag-reason-amount">
            {p.data.amount}
          </span>
        </span>
      ),
    },
    {
      field: "iterations",
      headerName: "Iterations",
      minWidth: 90,
      flex: 0.7,
      sortable: true,
      cellStyle: { textAlign: "right" },
      headerClass: "ag-right-aligned-header",
      cellRenderer: (p: { value: number }) => (
        <span className="tabular-nums font-mono">{p.value}</span>
      ),
    },
    {
      field: "score",
      headerName: "Deterministic Score",
      minWidth: 170,
      flex: 1.2,
      sortable: true,
      cellRenderer: ScoreGaugeCell,
    },
    {
      field: "verdict",
      headerName: "Arbiter Verdict & Action",
      minWidth: 240,
      flex: 1.6,
      sortable: true,
      cellRenderer: VerdictBadgeCell,
    },
    {
      field: "id",
      headerName: "Gate & Action",
      minWidth: 190,
      flex: 1.1,
      sortable: false,
      filter: false,
      cellRenderer: ActionHoverCell,
    },
  ];

  return (
    <section id="queue" className="ledger-card queue-section">
      <div className="ledger-toolbar">
        <h2 className="queue-title">Dispute Command Queue</h2>
        <div className="queue-search-wrap">
          <input
            ref={searchRef}
            type="search"
            className="search-input queue-search"
            aria-label="Search disputes by ID, reason or amount"
            placeholder="Search dispute ID, reason, amount…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="queue-kbd">⌘K</kbd>
        </div>
      </div>

      <div
        className="queue-filters"
        role="tablist"
        aria-label="Filter disputes"
      >
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            className={`queue-filter-pill${filter === f.key ? " active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            {f.key === "all" && (
              <span className="queue-filter-count font-mono tabular-nums">
                {rows.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {disputes.length === 0 ? (
        <div className="queue-empty">
          No disputes loaded in the active ledger.
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="queue-empty">
          No disputes match this filter{query ? ` (“${query}”)` : ""}.
        </div>
      ) : (
        <div className="grid-wrap">
          <AgGridReact
            ref={gridRef}
            rowData={visibleRows}
            columnDefs={columns}
            theme={phalanxGridTheme}
            defaultColDef={{ resizable: true }}
            getRowClass={(params) =>
              params.data?.verdict === "CONTEST_HARD_PROOF"
                ? "verdict-contest"
                : params.data?.verdict === "DE_ESCALATE_OFFER"
                  ? "verdict-offer"
                  : params.data?.verdict === "CONCEDE_FAST_SETTLE"
                    ? "verdict-concede"
                    : ""
            }
            rowSelection="single"
            onRowClicked={(e) =>
              e.data && router.push(`/disputes/${e.data.id}`)
            }
            pagination={true}
            paginationPageSize={10}
          />
        </div>
      )}

      <p className="ledger-footer">
        <b>Deterministic Scoring Rubric:</b> 0–100 total (Tracking DELIVERED
        30 + Carrier verifiable 15 + Signature 15 + Merchant log 25 +
        Invoice/Terms 15).
        <br />
        <b>Routing Policy:</b> ≥75 CONTEST_HARD_PROOF · 35–74
        DE_ESCALATE_OFFER · &lt;35 CONCEDE_FAST_SETTLE. Click any dispute row
        or ID to open the Split-Pane Defense Studio.
      </p>
    </section>
  );
}
