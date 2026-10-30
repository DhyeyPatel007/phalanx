// Prosecutor / Red-Team adversarial loop — brief §5.
// Deterministic first, LLM second. In this run the LLM is NOT called:
// the Prosecutor drafts from a fixed template + artifacts only (see
// prompts/rebuttal-template.md). If a model call were added later it would
// draft wording only, never add facts, and the loop below is unchanged.
// Max 3 adversarial iterations, then the loop stops and returns the best
// draft with its gaps listed — never loops forever, never silently passes.

import { getArtifacts } from "./store";
import {
  actionForVerdict,
  evDisplay,
  scoreDispute,
  verdictForScore,
} from "./scorer";
import type {
  DebateMessage,
  Dispute,
  EvidenceArtifact,
  SwarmIteration,
  SwarmRun,
} from "./types";

const MAX_ITERATIONS = 3;

function now(): string {
  return new Date().toISOString();
}

function rebuttalFromTemplate(
  dispute: Dispute,
  artifacts: EvidenceArtifact[],
  version: string,
): string {
  const lines = artifacts.map(
    (a) => `- [${a.kind}] ${a.summary}${a.simulated ? " (SIMULATED)" : ""}`,
  );
  return [
    `Rebuttal ${version} — Dispute ${dispute.id} (${dispute.reason}, $${dispute.amount.value} ${dispute.amount.currency_code}).`,
    `Merchant position: the claim is disputed on the evidence below. No fact is asserted that is not in an artifact.`,
    ...lines,
    `Requested action: ${actionForVerdict(verdictForScore(scoreDispute(dispute, artifacts).score))} — see routing policy, not a prediction.`,
  ].join("\n");
}

/**
 * Run the swarm on a dispute. Hound pass 1 gathers the fast sources
 * (tracking + invoice); the merchant log is a second, slower merchant-system
 * lookup that the Hound only performs when the Red-Team names it as a gap.
 * That is why Scenario A shows Draft v1 rejected, then Draft v2 passing.
 */
export function runSwarm(dispute: Dispute): SwarmRun {
  const started = Date.now();
  const runId = `run-${dispute.id}-${Date.now()}`;
  const messages: DebateMessage[] = [];
  const iterations: SwarmIteration[] = [];
  const allArtifacts = getArtifacts(dispute.id);

  const msg = (
    iteration: number,
    actor: string,
    kind: DebateMessage["kind"],
    text: string,
  ) => {
    messages.push({ run_id: runId, iteration, actor, kind, text, timestamp: now() });
  };

  msg(0, "Hound", "artifact", `Ingested dispute ${dispute.id} (${dispute.reason}, $${dispute.amount.value}). Gathering evidence from PayPal dispute detail + merchant evidence store.`);
  let available = allArtifacts.filter((a) => a.kind === "tracking" || a.kind === "invoice");
  for (const a of available) {
    msg(0, "Hound", "artifact", `Artifact ${a.id} [${a.kind}] from ${a.source}: ${a.summary}${a.simulated ? " (SIMULATED)" : ""}`);
  }

  let best: SwarmIteration | null = null;

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    const { score, gaps } = scoreDispute(dispute, available);
    const verdict = verdictForScore(score);
    const scoreBefore = best ? best.score : 0;
    const version = `v${i}`;
    const draft = rebuttalFromTemplate(dispute, available, version);
    msg(i, "Prosecutor", "draft", draft);

    // Red-Team review against the §5 rubric.
    const merchantLogMissing = gaps.some((g) =>
      g.includes("merchant log entry"),
    );
    const merchantLogRetrievable =
      merchantLogMissing &&
      allArtifacts.some(
        (a) => a.kind === "merchant_log" && !available.some((x) => x.id === a.id),
      );

    let accepted = true;
    let rejection = "";
    if (merchantLogRetrievable && verdict === "CONTEST_HARD_PROOF") {
      // Contest needs post-delivery-use corroboration; v1 only had tracking.
      accepted = false;
      rejection =
        "REJECTED — named gap: merchant log tying buyer to post-delivery use is missing. A tracking-only draft cannot support CONTEST_HARD_PROOF. Hound: fetch the merchant log.";
    } else if (merchantLogRetrievable && score < 75 && dispute.reason === "MERCHANDISE_OR_SERVICE_NOT_RECEIVED") {
      accepted = false;
      rejection =
        "REJECTED — named gap: merchant log tying buyer to post-delivery use is missing. Score below the contest band; Hound: fetch the merchant log before triage.";
    }

    if (!accepted) {
      msg(i, "Red-Team", "critique", rejection);
      for (const g of gaps) msg(i, "Red-Team", "gap", `Gap: ${g}`);
      const fetched = allArtifacts.filter(
        (a) => a.kind === "merchant_log" && !available.some((x) => x.id === a.id),
      );
      if (fetched.length > 0) {
        available = [...available, ...fetched];
        for (const a of fetched) {
          msg(i, "Hound", "artifact", `Hound fetched on Red-Team demand — ${a.id} [${a.kind}] from ${a.source}: ${a.summary}${a.simulated ? " (SIMULATED)" : ""}`);
        }
      }
      const iteration: SwarmIteration = {
        iteration: i,
        draft_version: version,
        score,
        score_before: scoreBefore,
        gaps,
        verdict,
        accepted: false,
        rebuttal_text: draft,
      };
      iterations.push(iteration);
      best = iteration;
      continue;
    }

    // Accepted: record verdict, list any unfilled gaps (never waived).
    msg(i, "Red-Team", "critique", `ACCEPTED ${version}. Score ${score}/100 (checklist score, not a win probability). Verdict ${verdict} per routing policy.`);
    for (const g of gaps) {
      msg(i, "Red-Team", "gap", `Unfilled gap (recorded, not waived): ${g}`);
    }
    msg(i, "Arbiter", "verdict", `Verdict ${verdict} → action ${actionForVerdict(verdict)}. Awaiting human approval; nothing executes before approval.`);
    const iteration: SwarmIteration = {
      iteration: i,
      draft_version: version,
      score,
      score_before: scoreBefore,
      gaps,
      verdict,
      accepted: true,
      rebuttal_text: draft,
    };
    iterations.push(iteration);
    best = iteration;
    break;
  }

  const finalScore = best ? best.score : 0;
  const finalVerdict = best ? best.verdict : verdictForScore(finalScore);
  const finalGaps = best ? best.gaps : [];
  const amount = parseFloat(dispute.amount.value);

  const run: SwarmRun = {
    id: runId,
    dispute_id: dispute.id,
    iterations,
    messages,
    score: finalScore,
    gaps: finalGaps,
    verdict: finalVerdict,
    ev_display: evDisplay(finalScore, amount),
    status: "AWAITING_APPROVAL",
    duration_ms: Date.now() - started,
    created_at: new Date().toISOString(),
  };
  return run;
}
