// Micro-interactions for the new PHALANX UI (Gemini directive §5).
// ADAPTED: this repo has NO Tailwind configured, so the directive's
// Tailwind utility classes are implemented with the repo's existing CSS
// system instead (classes in globals.css + CSS vars). Same props and
// behaviour as the directive's components; no new dependency installed.
// All values shown are real — hashes come from the server, scores from
// the deterministic scorer, durations from completed runs only.
"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 1. SpotlightCard: tracks the cursor (--mouse-x, --mouse-y) to render
 * a radial hover spotlight and a tactile 2px lift on Bento tiles,
 * verdict cards and named-gap cards.
 */
export function SpotlightCard({
  children,
  className = "",
  accentColor = "rgba(16, 185, 129, 0.08)",
  onMouseEnter,
  onMouseLeave,
  onClick,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { accentColor?: string }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ x: -200, y: -200 });
  const [hovered, setHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setCoords({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={(e) => {
        setHovered(true);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        onMouseLeave?.(e);
      }}
      onClick={onClick}
      style={{
        background: hovered
          ? `radial-gradient(380px circle at ${coords.x}px ${coords.y}px, ${accentColor}, #FFFFFF 75%)`
          : "#FFFFFF",
        transform: hovered ? "translateY(-2px)" : "translateY(0px)",
        boxShadow: hovered
          ? "0 12px 32px -8px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.03)"
          : "0 1px 3px rgba(15, 23, 42, 0.03), 0 8px 24px -4px rgba(15, 23, 42, 0.03)",
        borderColor: hovered
          ? "rgba(15, 23, 42, 0.18)"
          : "rgba(15, 23, 42, 0.08)",
        transition:
          "transform 220ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease, border-color 220ms ease",
      }}
      className={`spotlight-card ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * 2. AnimatedCounter: smooth requestAnimationFrame number ticker for
 * 0–100 scores and dollar totals (cubic ease-out, 550ms).
 */
export function AnimatedCounter({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 550,
  className = "",
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const previousRef = useRef(value);

  useEffect(() => {
    const startValue = previousRef.current;
    const delta = value - startValue;
    if (delta === 0) return;

    const startTime = performance.now();
    let rafId: number;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      setDisplay(startValue + delta * eased);
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        previousRef.current = value;
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value, duration]);

  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {prefix}
      {/* Counters in this app only ever count non-negative quantities
          (money, scores, counts) — clamp transient animation frames at 0
          so a spring/easing overshoot never flashes a negative value. The
          settled value is untouched: every target is >= 0. */}
      {Math.max(0, display).toFixed(decimals)}
      {suffix}
    </span>
  );
}

async function copyText(text: string): Promise<void> {
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
}

/**
 * 3. CopyChip: 1-click cryptographic hash / dispute-ID copy chip with
 * an SVG checkmark morph ("Copied" for 1.5s).
 */
export function CopyChip({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void copyText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied" : `Copy ${text}`}
      className="copy-chip"
    >
      <span>{label ?? text}</span>
      {copied ? (
        <span className="copy-chip-check">
          <svg
            className="copy-chip-svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
          Copied
        </span>
      ) : (
        <svg
          className="copy-chip-svg copy-chip-idle"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      )}
    </button>
  );
}

/**
 * 4. HashScrambler: scrambles hex characters for 300ms when a new
 * bill/exhibit is attached, then locks onto the true SHA-256 digest
 * (first 16 chars — the digest the server computed, never invented).
 * Optionally pops the STRONG/WEAK (+XX pts) badge once locked.
 */
export function HashScrambler({
  sha256,
  quality,
  delta,
  fileName,
}: {
  sha256: string;
  quality?: "STRONG" | "WEAK" | "INVALID";
  delta?: number;
  fileName?: string;
}) {
  const shortHash = sha256 ? sha256.slice(0, 16) : "e3b0c44298fc1c14";
  const [output, setOutput] = useState(shortHash);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    setLocked(false);
    const hexChars = "0123456789abcdef";
    let step = 0;
    const totalSteps = 10;
    const interval = window.setInterval(() => {
      step++;
      if (step >= totalSteps) {
        setOutput(shortHash);
        setLocked(true);
        window.clearInterval(interval);
      } else {
        const lockedCount = Math.floor((step / totalSteps) * shortHash.length);
        const scrambled =
          shortHash.slice(0, lockedCount) +
          Array.from({ length: shortHash.length - lockedCount })
            .map(() => hexChars[Math.floor(Math.random() * 16)])
            .join("");
        setOutput(scrambled);
      }
    }, 30);
    return () => window.clearInterval(interval);
  }, [shortHash]);

  return (
    <div className={`hash-scramble${locked ? " locked" : ""}`}>
      <div className="hash-scramble-head">
        {fileName && <span className="hash-scramble-name">{fileName}</span>}
        {locked && quality && delta !== undefined && (
          <span
            className={`badge hash-badge-pop ${quality === "STRONG" ? "strong" : "weak"}`}
          >
            {quality} (+{delta} pts)
          </span>
        )}
      </div>
      <div className="font-mono tabular-nums hash-scramble-hash">
        SHA-256: {output}
        {!locked && <span className="hash-scrambling"> · scrambling…</span>}
      </div>
      {locked && <CopyChip text={sha256} label={`sha256:${output}…`} />}
    </div>
  );
}

/**
 * 5. SwarmPipelineVisualizer: interactive 6-agent pipeline. Six stage
 * cards joined by animated SVG data beams (stroke-dashoffset loop via
 * .animate-beam). Hovering a stage lifts it, lights its adjacent beams
 * emerald and shows its exact deterministic role; a measured duration
 * is shown only when the caller passes real phase durations from a
 * completed run — never invented.
 */
const SWARM_STAGES = [
  {
    id: "01",
    name: "Hound",
    role: "Extracts PayPal artifacts & attached merchant bills with SHA-256 verification.",
  },
  {
    id: "02",
    name: "Prosecutor",
    role: "Drafts evidence-backed rebuttal citing tracking, logs, and invoice IDs.",
  },
  {
    id: "03",
    name: "Red-Team",
    role: "Attacks the draft rebuttal and surfaces missing proof vulnerabilities.",
  },
  {
    id: "04",
    name: "3-Juror Quorum",
    role: "Evidence, Policy & Buyer-Sympathy personas evaluate gaps (2/3 quorum).",
  },
  {
    id: "05",
    name: "Judge",
    role: "Deduplicates ~70 raw juror notes into 2–3 practical reasons & named gaps.",
  },
  {
    id: "06",
    name: "Arbiter",
    role: "Applies deterministic 0–100 checklist score to route Contest, Offer, or Concede.",
  },
];

export function SwarmPipelineVisualizer({
  isRunning = false,
  durations,
}: {
  isRunning?: boolean;
  /** Measured phase durations (ms) from a completed run, keyed by
   *  stage id ("01".."06"). Omitted when there is no run. */
  durations?: Partial<Record<string, number | null>>;
}) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  return (
    <div className="swarm-viz">
      <div className="swarm-viz-head">
        <span className="swarm-viz-title">
          6-Stage Adversarial Swarm + Deterministic 0–100 Scorer
        </span>
        <span className="swarm-viz-status">
          <span
            className={`swarm-viz-dot${isRunning ? " running" : ""}`}
            aria-hidden="true"
          />
          {isRunning ? "SWARM EXECUTING..." : "DETERMINISTIC AUTHORITY LOCKED"}
        </span>
      </div>

      <div className="swarm-viz-stages">
        {SWARM_STAGES.map((stage, idx) => {
          const isHovered = activeIdx === idx;
          const duration =
            durations && durations[stage.id] != null
              ? durations[stage.id]
              : null;
          return (
            <div key={stage.id} className="swarm-viz-step">
              <div
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseLeave={() => setActiveIdx(null)}
                className={`swarm-viz-node${isHovered ? " hovered" : ""}`}
              >
                <div className="swarm-viz-num">
                  <span>STAGE {stage.id}</span>
                  <span aria-hidden="true">→</span>
                </div>
                <div className="swarm-viz-name">{stage.name}</div>
                <p className="swarm-viz-role">{stage.role}</p>
                {duration != null ? (
                  <span className="swarm-viz-duration font-mono tabular-nums">
                    Last run: {duration} ms
                  </span>
                ) : (
                  <span className="swarm-viz-duration">
                    Deterministic step — the score, not the model, decides.
                  </span>
                )}
              </div>
              {idx < SWARM_STAGES.length - 1 && (
                <div
                  className={`swarm-viz-beam${isHovered || activeIdx === idx + 1 ? " lit" : ""}`}
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 60 12" preserveAspectRatio="none">
                    <path d="M0 6 H60" className="animate-beam" fill="none" />
                  </svg>
                  <span className="swarm-viz-arrow">›</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 6. SerifAccent (premium foundations, Nov 11, 2026): wraps a single
 * display word in Instrument Serif italic — the accent-word pattern
 * ("Zero *Hallucinated* Verdicts"). Never used for body text.
 * Additive only; no existing export changed.
 */
export function SerifAccent({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <em className={`display-accent ${className}`}>{children}</em>;
}
