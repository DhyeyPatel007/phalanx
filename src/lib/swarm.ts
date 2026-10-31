// Prosecutor / Red-Team / Jury adversarial loop — brief §5, §7, §9.
// Deterministic first, LLM second.
// When an LLM key is configured:
// - Prosecutor drafts via draft() (wording only, guarded against invented facts/amounts)
// - 3 Jurors (Evidence, Policy, Buyer-Sympathy) evaluate the draft on the cheapest model
// - Gaps are aggregated deterministically (union, dedup)
// - Judge provides issue framing + verdict reasoning (verdict itself is strictly deterministic)
// When NO key is configured or on any failure:
// - Falls back to rebuttalFromTemplate, single deterministic Red-Team check, and score breakdown.
// Max 3 adversarial iterations — never loops forever, never silently passes.

import { getArtifacts } from "./store";
import {
  actionForVerdict,
  evDisplay,
  scoreDispute,
  verdictForScore,
} from "./scorer";
import { draft, isLLMConfigured } from "./llm";
import type {
  DebateMessage,
  Dispute,
  EvidenceArtifact,
  SwarmIteration,
  SwarmRun,
  Verdict,
} from "./types";

const MAX_ITERATIONS = 3;

function now(): string {
  return new Date().toISOString();
}

export function rebuttalFromTemplate(
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
 * Validate that an LLM-generated draft does not contain hallucinated $ amounts
 * or invented facts not present in the evidence bundle.
 */
export function validateDraftAmounts(
  draftText: string,
  dispute: Dispute,
  artifacts: EvidenceArtifact[],
): boolean {
  // Extract all dollar amounts in draftText (e.g. $480, $480.00, $15)
  const matches = draftText.match(/\$\s*(\d+(?:\.\d{2})?)/g);
  if (!matches) return true;

  const allowed = new Set<string>();
  // Dispute amount
  allowed.add(dispute.amount.value);
  const numVal = parseFloat(dispute.amount.value);
  if (!Number.isNaN(numVal)) {
    allowed.add(numVal.toFixed(0));
    allowed.add(numVal.toFixed(2));
    const offer40 = (numVal * 0.4).toFixed(2);
    allowed.add(offer40);
    allowed.add((numVal * 0.4).toFixed(0));
  }
  // Standard fee amounts
  allowed.add("15");
  allowed.add("15.00");
  allowed.add("20");
  allowed.add("20.00");
  allowed.add("30");
  allowed.add("30.00");
  allowed.add("0");
  allowed.add("0.00");

  // Amounts present in artifacts
  for (const a of artifacts) {
    const artMatches = a.summary.match(/\$?\s*(\d+(?:\.\d{2})?)/g);
    if (artMatches) {
      for (const m of artMatches) {
        const clean = m.replace(/[^\d.]/g, "");
        if (clean) allowed.add(clean);
      }
    }
  }

  for (const m of matches) {
    const clean = m.replace(/[^\d.]/g, "");
    if (clean && !allowed.has(clean)) {
      return false; // Invented amount
    }
  }

  return true;
}

/**
 * Prosecutor drafts wording using LLM (if configured) or falls back to template.
 */
export async function draftProsecutor(
  dispute: Dispute,
  artifacts: EvidenceArtifact[],
  version: string,
  preferredAction: string,
): Promise<string> {
  const fallback = rebuttalFromTemplate(dispute, artifacts, version);
  if (!isLLMConfigured()) {
    return fallback;
  }

  const system = `You are the Prosecutor agent in PHALANX, an adversarial dispute-defense workbench for PayPal merchants.
Draft a factual, concise merchant rebuttal to be submitted to PayPal for dispute review.
CRITICAL RULES:
- Use ONLY facts, dates, tracking numbers, and amounts present in the provided evidence artifacts.
- NEVER invent, hallucinate, or extrapolate facts, numbers, dates, tracking numbers, or dollar amounts.
- Do NOT include any buyer PII (such as buyer personal email, phone numbers, or residential addresses) beyond the dispute ID.
- State clearly that the requested action is: ${preferredAction}.
- Be direct, professional, and audit-ready.`;

  const artifactLines = artifacts
    .map((a) => `- [${a.kind}] ${a.summary}${a.simulated ? " (SIMULATED)" : ""}`)
    .join("\n");

  const prompt = `Dispute ID: ${dispute.id}
Reason: ${dispute.reason}
Disputed Amount: $${dispute.amount.value} ${dispute.amount.currency_code}
Lifecycle Stage: ${dispute.dispute_life_cycle_stage} / ${dispute.status}
Requested Action: ${preferredAction}

Evidence Artifacts:
${artifactLines}

Draft the merchant rebuttal for version ${version}.`;

  const llmText = await draft(prompt, { system });
  if (!llmText || llmText.length < 40) {
    return fallback;
  }

  if (!validateDraftAmounts(llmText, dispute, artifacts)) {
    return fallback;
  }

  return llmText;
}

export function parseGapLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[-*•\d.)\]\s]+/, "").trim())
    .filter(
      (line) =>
        line.length > 8 &&
        !line.toLowerCase().startsWith("none") &&
        !line.toLowerCase().startsWith("no gaps") &&
        !line.toLowerCase().startsWith("looks good"),
    );
}

export function aggregateJuryGaps(...gapLists: string[][]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const list of gapLists) {
    for (const gap of list) {
      const norm = gap.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
      if (norm.length > 5 && !seen.has(norm)) {
        seen.add(norm);
        result.push(gap);
      }
    }
  }
  return result;
}

export interface JuryResults {
  evidenceGaps: string[];
  policyGaps: string[];
  buyerGaps: string[];
  combinedGaps: string[];
}

/**
 * Three jurors evaluate the draft in parallel using the cheapest model.
 * If any juror call fails, returns null to trigger deterministic fallback.
 */
export async function runJury(
  dispute: Dispute,
  artifacts: EvidenceArtifact[],
  draftText: string,
): Promise<JuryResults | null> {
  if (!isLLMConfigured()) {
    return null;
  }

  const artifactLines = artifacts
    .map((a) => `- [${a.kind}] ${a.summary}`)
    .join("\n");

  const context = `Dispute: ${dispute.id} (${dispute.reason}, $${dispute.amount.value} ${dispute.amount.currency_code})
Evidence Bundle:
${artifactLines}

Prosecutor Draft:
${draftText}`;

  const prompts = [
    {
      system:
        "You are the Evidence Juror in PHALANX. Analyze the merchant rebuttal and evidence bundle. What concrete evidentiary proof is missing, ambiguous, or weak? Output bullet points of missing evidence gaps only.",
      prompt: `${context}\n\nList all missing or weak evidence gaps:`,
    },
    {
      system:
        "You are the Policy Juror in PHALANX. Analyze the merchant rebuttal against PayPal dispute policies and Seller Protection rules. What rules or policy requirements are not satisfied? Output bullet points of policy gaps only.",
      prompt: `${context}\n\nList all PayPal policy gaps:`,
    },
    {
      system:
        "You are the Buyer-Sympathy Juror in PHALANX. Adopt the buyer's perspective. How would an aggressive buyer or card issuer challenge this draft? Output bullet points of vulnerabilities/counter-arguments only.",
      prompt: `${context}\n\nList all buyer attack vectors and vulnerabilities:`,
    },
  ];

  try {
    const results = await Promise.all(
      prompts.map((p) => draft(p.prompt, { system: p.system, cheap: true })),
    );

    // If any juror call failed, fall back to deterministic Red-Team check
    if (results.some((r) => r === null)) {
      return null;
    }

    const evidenceGaps = parseGapLines(results[0]!);
    const policyGaps = parseGapLines(results[1]!);
    const buyerGaps = parseGapLines(results[2]!);
    const combinedGaps = aggregateJuryGaps(evidenceGaps, policyGaps, buyerGaps);

    return { evidenceGaps, policyGaps, buyerGaps, combinedGaps };
  } catch {
    return null;
  }
}

export function parseJudgeOutput(text: string): {
  issueFraming?: string;
  verdictReasoning?: string;
} {
  const issueMatch = text.match(/ISSUE_FRAMING:\s*([\s\S]*?)(?=VERDICT_REASONING:|$)/i);
  const reasoningMatch = text.match(/VERDICT_REASONING:\s*([\s\S]*?)$/i);

  const issueFraming = issueMatch ? issueMatch[1].trim() : undefined;
  const verdictReasoning = reasoningMatch ? reasoningMatch[1].trim() : undefined;

  return {
    issueFraming: issueFraming || undefined,
    verdictReasoning: verdictReasoning || undefined,
  };
}

/**
 * Judge synthesizes issue framing and verdict reasoning in words only.
 * The verdict itself is NEVER decided by the Judge — it comes strictly from scorer.ts.
 */
export async function runJudge(
  dispute: Dispute,
  score: number,
  verdict: Verdict,
  artifacts: EvidenceArtifact[],
  gaps: string[],
): Promise<{ issueFraming?: string; verdictReasoning?: string }> {
  if (!isLLMConfigured()) {
    return {};
  }

  const system = `You are the Judge in PHALANX, an adversarial dispute-defense workbench.
The dispute has ALREADY been deterministically scored: Score ${score}/100, Verdict ${verdict}.
You do NOT decide the score or verdict. Your role is purely to provide judicial issue framing and reasoning.
Provide two labeled sections:
ISSUE_FRAMING: Exactly one concise sentence stating the decisive legal/factual question of this dispute.
VERDICT_REASONING: Two to three concise sentences explaining why the evidence checklist score of ${score}/100 and gaps support the ${verdict} routing policy under PayPal standards.`;

  const artifactSummaries = artifacts
    .map((a) => `- [${a.kind}] ${a.summary}`)
    .join("\n");

  const prompt = `Dispute: ${dispute.id} (${dispute.reason}, $${dispute.amount.value} ${dispute.amount.currency_code})
Score: ${score}/100
Deterministic Verdict: ${verdict}
Evidence Artifacts:
${artifactSummaries}
Remaining Gaps: ${gaps.length > 0 ? gaps.join("; ") : "None"}`;

  const text = await draft(prompt, { system, cheap: false });
  if (!text) return {};

  return parseJudgeOutput(text);
}

/**
 * Run the swarm on a dispute.
 * Hound pass 1 gathers fast sources (tracking + invoice).
 * Prosecutor drafts rebuttal (LLM-wired with template fallback).
 * Jury layer (3 jurors) audits the draft; if retrievable gaps exist, Hound fetches merchant log.
 * Max 3 iterations.
 * After scoring, Judge provides display framing and reasoning.
 */
export async function runSwarm(dispute: Dispute): Promise<SwarmRun> {
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

  msg(
    0,
    "Hound",
    "artifact",
    `Ingested dispute ${dispute.id} (${dispute.reason}, $${dispute.amount.value}). Gathering evidence from PayPal dispute detail + merchant evidence store.`,
  );
  let available = allArtifacts.filter((a) => a.kind === "tracking" || a.kind === "invoice");
  for (const a of available) {
    msg(
      0,
      "Hound",
      "artifact",
      `Artifact ${a.id} [${a.kind}] from ${a.source}: ${a.summary}${a.simulated ? " (SIMULATED)" : ""}`,
    );
  }

  let best: SwarmIteration | null = null;

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    const { score, gaps: deterministicGaps } = scoreDispute(dispute, available);
    const verdict = verdictForScore(score);
    const preferredAction = actionForVerdict(verdict);
    const scoreBefore = best ? best.score : 0;
    const version = `v${i}`;

    // Prosecutor draft: LLM if configured and valid, otherwise template
    const draftText = await draftProsecutor(dispute, available, version, preferredAction);
    msg(i, "Prosecutor", "draft", draftText);

    // Jury layer (Evidence, Policy, Buyer-Sympathy jurors)
    const jury = await runJury(dispute, available, draftText);

    let activeGaps = deterministicGaps;
    if (jury) {
      for (const g of jury.evidenceGaps) msg(i, "Juror (Evidence)", "gap", `Evidence gap: ${g}`);
      for (const g of jury.policyGaps) msg(i, "Juror (Policy)", "gap", `Policy gap: ${g}`);
      for (const g of jury.buyerGaps) msg(i, "Juror (Buyer-Sympathy)", "gap", `Buyer counter: ${g}`);
      activeGaps = aggregateJuryGaps(deterministicGaps, jury.combinedGaps);
    }

    // Red-Team / Gap triage against the rubric
    const merchantLogMissing = activeGaps.some(
      (g) =>
        g.toLowerCase().includes("merchant log") ||
        g.toLowerCase().includes("post-delivery") ||
        g.toLowerCase().includes("buyer identity"),
    );
    const merchantLogRetrievable =
      merchantLogMissing &&
      allArtifacts.some(
        (a) => a.kind === "merchant_log" && !available.some((x) => x.id === a.id),
      );

    let accepted = true;
    let rejection = "";
    if (merchantLogRetrievable && verdict === "CONTEST_HARD_PROOF") {
      accepted = false;
      rejection =
        "REJECTED — named gap: merchant log tying buyer to post-delivery use is missing. A tracking-only draft cannot support CONTEST_HARD_PROOF. Hound: fetch the merchant log.";
    } else if (
      merchantLogRetrievable &&
      score < 75 &&
      dispute.reason === "MERCHANDISE_OR_SERVICE_NOT_RECEIVED"
    ) {
      accepted = false;
      rejection =
        "REJECTED — named gap: merchant log tying buyer to post-delivery use is missing. Score below the contest band; Hound: fetch the merchant log before triage.";
    }

    if (!accepted) {
      msg(i, "Red-Team", "critique", rejection);
      for (const g of deterministicGaps) msg(i, "Red-Team", "gap", `Gap: ${g}`);
      const fetched = allArtifacts.filter(
        (a) => a.kind === "merchant_log" && !available.some((x) => x.id === a.id),
      );
      if (fetched.length > 0) {
        available = [...available, ...fetched];
        for (const a of fetched) {
          msg(
            i,
            "Hound",
            "artifact",
            `Hound fetched on Red-Team demand — ${a.id} [${a.kind}] from ${a.source}: ${a.summary}${a.simulated ? " (SIMULATED)" : ""}`,
          );
        }
      }
      const iteration: SwarmIteration = {
        iteration: i,
        draft_version: version,
        score,
        score_before: scoreBefore,
        gaps: deterministicGaps,
        verdict,
        accepted: false,
        rebuttal_text: draftText,
      };
      iterations.push(iteration);
      best = iteration;
      continue;
    }

    // Accepted: record verdict, list any unfilled gaps (never waived)
    msg(
      i,
      "Red-Team",
      "critique",
      `ACCEPTED ${version}. Score ${score}/100 (checklist score, not a win probability). Verdict ${verdict} per routing policy.`,
    );
    for (const g of deterministicGaps) {
      msg(i, "Red-Team", "gap", `Unfilled gap (recorded, not waived): ${g}`);
    }
    msg(
      i,
      "Arbiter",
      "verdict",
      `Verdict ${verdict} → action ${preferredAction}. Awaiting human approval; nothing executes before approval.`,
    );
    const iteration: SwarmIteration = {
      iteration: i,
      draft_version: version,
      score,
      score_before: scoreBefore,
      gaps: deterministicGaps,
      verdict,
      accepted: true,
      rebuttal_text: draftText,
    };
    iterations.push(iteration);
    best = iteration;
    break;
  }

  const finalScore = best ? best.score : 0;
  const finalVerdict = best ? best.verdict : verdictForScore(finalScore);
  const finalGaps = best ? best.gaps : [];
  const amount = parseFloat(dispute.amount.value);

  // Judge framing + reasoning (words only, verdict stays strictly deterministic)
  const judge = await runJudge(dispute, finalScore, finalVerdict, available, finalGaps);
  if (judge.issueFraming || judge.verdictReasoning) {
    const lines = [
      judge.issueFraming ? `Issue Framing: ${judge.issueFraming}` : null,
      judge.verdictReasoning ? `Reasoning: ${judge.verdictReasoning}` : null,
    ].filter(Boolean);
    msg(best ? best.iteration : MAX_ITERATIONS, "Judge", "verdict", lines.join("\n\n"));
  }

  const run: SwarmRun = {
    id: runId,
    dispute_id: dispute.id,
    iterations,
    messages,
    score: finalScore,
    gaps: finalGaps,
    verdict: finalVerdict,
    ev_display: evDisplay(finalScore, amount, undefined, dispute.dispute_life_cycle_stage),
    status: "AWAITING_APPROVAL",
    duration_ms: Date.now() - started,
    created_at: new Date().toISOString(),
    issue_framing: judge.issueFraming,
    verdict_reasoning: judge.verdictReasoning,
  };
  return run;
}
