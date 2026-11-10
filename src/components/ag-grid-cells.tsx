// Dedicated AG Grid v36 cell renderers — no default plain-text cells.
// DisputeIdCell (monospace ID + SIMULATED/LIVE badge + hover copy that
// stops propagation and morphs to an emerald check for 1500ms),
// ScoreGaugeCell (tabular "85 / 100" + 72px segmented bar animating
// 0 -> score% on mount, emerald >=75 / amber 35-74 / rose <35, tick at
// the 75 contest threshold), VerdictBadgeCell (pill + animated status
// dot; offer shows the real offer amount), ActionHoverCell ("Inspect
// Dossier →" slides in on row hover, translates 4px on hover).
// Grid theme params live here too; row/header heights ride on --ag-*
// CSS vars in globals.css (the reliable route in AG Grid v36).
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { themeQuartz } from "ag-grid-community";
import type { Verdict } from "@/lib/types";

export const phalanxGridTheme = themeQuartz.withParams({
  backgroundColor: "#FFFFFF",
  foregroundColor: "#09090B",
  headerBackgroundColor: "#F8F9FA",
  headerTextColor: "#52525B",
  borderColor: "rgba(15, 23, 42, 0.06)",
  rowHoverColor: "rgba(16, 185, 129, 0.04)",
  selectedRowBackgroundColor: "rgba(9, 9, 11, 0.08)",
  accentColor: "#09090B",
  fontFamily:
    "var(--font-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSize: 13,
  headerFontSize: 12,
  headerFontWeight: 600,
  borderRadius: 0,
  wrapperBorderRadius: 12,
});

function useCopyFeedback(): { copied: boolean; copy: (text: string) => void } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  };
  return { copied, copy };
}

export function DisputeIdCell(p: {
  value: string;
  data: { source: string };
}) {
  const { copied, copy } = useCopyFeedback();
  const isSeeded = (p.data?.source ?? "").includes("Seeded");
  return (
    <span className="ag-id-cell">
      <Link href={`/disputes/${p.value}`} className="grid-link font-mono">
        {p.value}
      </Link>
      <span className={`ag-micro-badge ${isSeeded ? "sim" : "live"}`}>
        {isSeeded ? "SIMULATED" : "LIVE"}
      </span>
      <button
        type="button"
        className="ag-cell-copy"
        aria-label={`Copy dispute ID ${p.value}`}
        title={copied ? "Copied" : "Copy dispute ID"}
        onClick={(e) => {
          e.stopPropagation();
          copy(p.value);
        }}
      >
        {copied ? <span className="copy-check">✓</span> : <span>⧉</span>}
        {copied && <span className="copy-tip">Copied</span>}
      </button>
    </span>
  );
}

function gaugeClass(score: number): "contest" | "offer" | "concede" {
  if (score >= 75) return "contest";
  if (score >= 35) return "offer";
  return "concede";
}

export function ScoreGaugeCell(p: { value: number | null }) {
  const [width, setWidth] = useState(0);
  const score = p.value;
  useEffect(() => {
    if (score === null) return;
    const raf = requestAnimationFrame(() => setWidth(score));
    return () => cancelAnimationFrame(raf);
  }, [score]);
  if (score === null) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }
  return (
    <span className="ag-score-cell">
      <span className="tabular-nums font-mono" style={{ fontWeight: 600 }}>
        {score} / 100
      </span>
      <span className="ag-gauge" aria-hidden="true">
        <span
          className={`ag-gauge-fill ${gaugeClass(score)}`}
          style={{ width: `${width}%` }}
        />
        <span className="ag-gauge-tick" style={{ left: "75%" }} />
      </span>
    </span>
  );
}

export function VerdictBadgeCell(p: {
  value: Verdict | null;
  data: { offerUsd?: number | null };
}) {
  if (!p.value) return <span className="badge na">NOT RUN</span>;
  const cls =
    p.value === "CONTEST_HARD_PROOF"
      ? "contest"
      : p.value === "DE_ESCALATE_OFFER"
        ? "offer"
        : "concede";
  const offer =
    p.value === "DE_ESCALATE_OFFER" && p.data?.offerUsd != null
      ? ` ($${p.data.offerUsd.toFixed(2)})`
      : "";
  return (
    <span className={`badge ${cls}`}>
      <span className={`badge-dot ${cls}`} aria-hidden="true" />
      {p.value}
      {offer}
    </span>
  );
}

export function ActionHoverCell(p: { data: { id: string } }) {
  return (
    <a className="ag-action-btn" href={`/disputes/${p.data.id}`}>
      Inspect Dossier <span aria-hidden="true">→</span>
    </a>
  );
}
