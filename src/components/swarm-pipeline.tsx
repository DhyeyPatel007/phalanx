// Interactive 6-stage swarm pipeline visualizer (SVG + hover popovers).
// Horizontal architectural diagram: 01 Hound -> 02 Prosecutor -> 03
// Red-Team -> 04 3-Juror Quorum -> 05 Judge -> 06 Arbiter. Connectors are
// SVG paths with stroke-dasharray 6 6 and an infinite beamFlow animation
// (stroke-dashoffset 24 -> 0). Hovering a node scales it 1.06, lights its
// adjacent connectors in emerald, and shows a glass popover with that
// agent's exact deterministic role. No invented latencies: the popover
// shows a measured duration only when the caller passes real phase
// durations from a completed run.
"use client";

import { useState } from "react";

export interface PipelineNode {
  key: string;
  num: string;
  name: string;
  tag: string;
  role: string;
}

export const SWARM_NODES: PipelineNode[] = [
  {
    key: "hound",
    num: "01",
    name: "Hound",
    tag: "Gather",
    role: "Retrieves tracking, invoices and merchant logs — never invents an artifact.",
  },
  {
    key: "prosecutor",
    num: "02",
    name: "Prosecutor",
    tag: "Draft",
    role: "Drafts the rebuttal strictly from verifiable artifacts. Never adds facts.",
  },
  {
    key: "red-team",
    num: "03",
    name: "Red-Team",
    tag: "Attack",
    role: "Attacks the draft against the fixed checklist and names the missing proof.",
  },
  {
    key: "jurors",
    num: "04",
    name: "3-Juror Quorum",
    tag: "Audit",
    role: "Evidence, Policy and Buyer-Sympathy jurors audit in parallel; 2/3 quorum names gaps.",
  },
  {
    key: "judge",
    num: "05",
    name: "Judge",
    tag: "Frame",
    role: "Frames the issue in one sentence and writes the verdict reasoning in words.",
  },
  {
    key: "arbiter",
    num: "06",
    name: "Arbiter",
    tag: "Route",
    role: "Routes fight, offer or concede from the deterministic 0–100 score. The score decides.",
  },
];

export default function SwarmPipeline({
  durations,
}: {
  /** Measured phase durations from a completed run, keyed by node key.
   *  Omitted on pages with no run — no latency is ever invented. */
  durations?: Partial<Record<string, number | null>>;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div
      className="swarm-pipeline"
      role="list"
      aria-label="Six-stage adversarial swarm pipeline"
    >
      {SWARM_NODES.map((node, i) => (
        <div key={node.key} className="pipeline-step" role="listitem">
          <button
            type="button"
            className={`pipeline-node spotlight lift${hovered === i ? " hovered" : ""}`}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered(null)}
            aria-label={`${node.num} ${node.name}: ${node.role}`}
          >
            <span className="pipeline-num font-mono">{node.num}</span>
            <span className="pipeline-name">{node.name}</span>
            <span className="pipeline-tag">{node.tag}</span>
            {hovered === i && (
              <span className="pipeline-popover" role="tooltip">
                <b>{node.name}</b> — {node.role}
                {durations && durations[node.key] != null ? (
                  <span className="pipeline-latency font-mono tabular-nums">
                    Last run: {durations[node.key]} ms
                  </span>
                ) : (
                  <span className="pipeline-latency">
                    Deterministic step — the score, not the model, decides.
                  </span>
                )}
              </span>
            )}
          </button>
          {i < SWARM_NODES.length - 1 && (
            <div
              className={`pipeline-connector${hovered === i || hovered === i + 1 ? " lit" : ""}`}
              aria-hidden="true"
            >
              <svg viewBox="0 0 60 12" preserveAspectRatio="none">
                <path
                  d="M0 6 H60"
                  className="pipeline-beam"
                  fill="none"
                />
              </svg>
              <span className="pipeline-arrow">›</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
