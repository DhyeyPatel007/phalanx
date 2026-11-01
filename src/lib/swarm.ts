// Prosecutor / Red-Team / Jury adversarial loop — brief §5, §7, §9.
// MiroFish-learned agent personas and deliberation architecture.
// Deterministic first, LLM second.
// When an LLM key is configured:
// - Prosecutor drafts via draft() using a structured advocate persona
// - 3 Jurors (Skeptical Merchant Auditor, PayPal Policy Stickler, Aggressive Buyer Advocate) evaluate the draft
// - Gaps are aggregated deterministically (union, dedup)
// - Judge synthesizes judicial issue framing + verdict reasoning (verdict itself is strictly deterministic)
// When NO key is configured or on any failure:
// - Falls back to rebuttalFromTemplate, single deterministic Red-Team check, and score breakdown.
// Max 3 adversarial iterations — never loops forever, never silently passes.

import { createPhaseTracker, getArtifacts } from "./store";
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
 * Uses an explicit advocate persona with strict evidence boundary rules.
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

  const system = `AGENT PERSONA:
Role: Lead Merchant Dispute Advocate (Prosecutor) in PHALANX.
Objective: Draft a rigorous, audit-ready merchant rebuttal to submit to PayPal dispute operations.
Stance: Firm, factual, professional, protective of merchant revenue under PayPal Seller Protection terms.
MANDATORY CONSTRAINTS:
- Rely EXCLUSIVELY on facts, dates, tracking numbers, and dollar amounts present in the provided evidence artifacts.
- NEVER invent, hallucinate, assume, or extrapolate facts, carrier statuses, tracking timestamps, or dollar figures.
- Do NOT include buyer personal data (emails, personal phone numbers, physical home addresses) beyond the dispute ID.
- Explicitly state the requested PayPal dispute action: ${preferredAction}.
- Be direct, concise, and structured for swift human PayPal reviewer adjudication.`;

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

export function classifyGapDomain(gap: string): string {
  const g = gap.toLowerCase();
  if (g.includes("signature") || g.includes("signed")) return "signature";
  if (
    g.includes("carrier") ||
    g.includes("tracking number") ||
    g.includes("verifiable") ||
    g.includes("date")
  )
    return "verifiable";
  if (g.includes("delivery") || g.includes("delivered") || g.includes("tracking"))
    return "tracking";
  if (
    g.includes("merchant log") ||
    g.includes("post-delivery") ||
    g.includes("access") ||
    g.includes("license") ||
    g.includes("condition") ||
    g.includes("qa")
  )
    return "merchant_log";
  if (
    g.includes("invoice") ||
    g.includes("terms") ||
    g.includes("order record") ||
    g.includes("receipt")
  )
    return "invoice";
  return "other";
}

export function tagJuryQuorum(
  evidenceGaps: string[],
  policyGaps: string[],
  buyerGaps: string[],
): {
  evidenceGaps: string[];
  policyGaps: string[];
  buyerGaps: string[];
  combinedGaps: string[];
  quorumDomains: Set<string>;
} {
  const domainCounts: Record<string, number> = {};
  const lists = [evidenceGaps, policyGaps, buyerGaps];

  for (const list of lists) {
    const listDomains = new Set<string>();
    for (const g of list) {
      listDomains.add(classifyGapDomain(g));
    }
    for (const d of listDomains) {
      if (d !== "other") {
        domainCounts[d] = (domainCounts[d] ?? 0) + 1;
      }
    }
  }

  const quorumDomains = new Set<string>(
    Object.entries(domainCounts)
      .filter(([_, count]) => count >= 2)
      .map(([domain]) => domain),
  );

  const tagList = (list: string[]) =>
    list.map((g) => {
      const d = classifyGapDomain(g);
      const isQuorum = quorumDomains.has(d);
      return isQuorum ? `[QUORUM 2/3+] ${g}` : `[ADVISORY 1/3] ${g}`;
    });

  const taggedEvidence = tagList(evidenceGaps);
  const taggedPolicy = tagList(policyGaps);
  const taggedBuyer = tagList(buyerGaps);
  const combinedGaps = aggregateJuryGaps(taggedEvidence, taggedPolicy, taggedBuyer);

  return {
    evidenceGaps: taggedEvidence,
    policyGaps: taggedPolicy,
    buyerGaps: taggedBuyer,
    combinedGaps,
    quorumDomains,
  };
}

export interface JuryResults {
  evidenceGaps: string[];
  policyGaps: string[];
  buyerGaps: string[];
  combinedGaps: string[];
}

/**
 * Three distinct jurors evaluate the draft in parallel using the cheapest model.
 * MiroFish persona architecture:
 * 1. Evidence Juror (Skeptical Merchant Auditor)
 * 2. Policy Juror (PayPal Policy Stickler)
 * 3. Buyer-Sympathy Juror (Aggressive Buyer Advocate)
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
      system: `AGENT PERSONA:
Role: Skeptical Merchant Evidence Auditor (Juror 1) in PHALANX.
Objective: Audit forensic evidence completeness, tracking verification, delivery confirmation, and invoice hashes.
Stance: Rigorous, skeptical, evidentiary perfectionist.
Task: Identify what concrete physical, digital, or courier proof is missing, unverified, or ambiguous in this draft.
Output ONLY bullet points of missing evidence gaps. Never assume unstated facts.`,
      prompt: `${context}\n\nList all missing or weak evidence gaps:`,
    },
    {
      system: `AGENT PERSONA:
Role: PayPal Dispute Resolution Policy Stickler (Juror 2) in PHALANX.
Objective: Audit compliance with PayPal Seller Protection requirements, item condition rules, and deadline adherence.
Stance: Formalist, unyielding compliance officer adhering strictly to PayPal User Agreement dispute criteria.
Task: Identify what PayPal regulatory or policy requirements remain unsatisfied in this draft.
Output ONLY bullet points of policy gaps.`,
      prompt: `${context}\n\nList all PayPal policy gaps:`,
    },
    {
      system: `AGENT PERSONA:
Role: Aggressive Consumer & Cardholder Advocate (Juror 3) in PHALANX.
Objective: Stress-test the merchant rebuttal from the buyer and issuing bank's perspective.
Stance: Pro-consumer, vigilant against merchant overreach, questioning delivery accuracy and buyer satisfaction.
Task: Identify vulnerabilities, ambiguities, or counter-arguments a buyer or card issuer would exploit.
Output ONLY bullet points of buyer vulnerabilities.`,
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
    const tagged = tagJuryQuorum(evidenceGaps, policyGaps, buyerGaps);

    return {
      evidenceGaps: tagged.evidenceGaps,
      policyGaps: tagged.policyGaps,
      buyerGaps: tagged.buyerGaps,
      combinedGaps: tagged.combinedGaps,
    };
  } catch {
    return null;
  }
}

export function parseJudgeOutput(text: string): {
  issueFraming?: string;
  verdictReasoning?: string;
} {
  const clean = text.replace(/\*\*/g, "").replace(/__/g, "");
  const issueMatch = clean.match(/ISSUE_FRAMING:\s*([\s\S]*?)(?=VERDICT_REASONING:|$)/i);
  const reasoningMatch = clean.match(/VERDICT_REASONING:\s*([\s\S]*?)$/i);

  const issueFraming = issueMatch ? issueMatch[1].trim() : undefined;
  const verdictReasoning = reasoningMatch ? reasoningMatch[1].trim() : undefined;

  return {
    issueFraming: issueFraming || undefined,
    verdictReasoning: verdictReasoning || undefined,
  };
}

/**
 * Judge synthesizes issue framing and verdict reasoning in words only.
 * Persona: Impartial Judicial Magistrate.
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

  const system = `AGENT PERSONA:
Role: Impartial Judicial Magistrate (Judge) in PHALANX.
Context: The dispute has ALREADY been deterministically scored: Score ${score}/100, Verdict ${verdict}.
Boundary: You do NOT score the dispute or pick the verdict. You provide judicial issue framing and reasoning.
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
 * Arbiter computes EV and routes dispute action.
 * Live phase tracker records every lifecycle phase with real timestamps and durations.
 */
export async function runSwarm(dispute: Dispute): Promise<SwarmRun> {
  const started = Date.now();
  const runId = `run-${dispute.id}-${Date.now()}`;
  const messages: DebateMessage[] = [];
  const iterations: SwarmIteration[] = [];
  const allArtifacts = getArtifacts(dispute.id);

  // Initialize live phase tracker in the store
  const tracker = createPhaseTracker(dispute.id, runId);

  const msg = (
    iteration: number,
    actor: string,
    kind: DebateMessage["kind"],
    text: string,
  ) => {
    const m: DebateMessage = { run_id: runId, iteration, actor, kind, text, timestamp: now() };
    messages.push(m);
    tracker.addMessageToCurrentPhase(m);
  };

  // Phase 1: Hound fast evidence gathering
  tracker.startPhase("hound_init", "Hound gathering fast evidence", "Hound", 0);
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
  tracker.endPhase("hound_init", `${available.length} fast artifact(s) loaded`);

  let best: SwarmIteration | null = null;
  let llmDegraded = !isLLMConfigured();

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    const { score, gaps: deterministicGaps } = scoreDispute(dispute, available);
    const verdict = verdictForScore(score);
    const preferredAction = actionForVerdict(verdict);
    const scoreBefore = best ? best.score : 0;
    const version = `v${i}`;

    // Prosecutor draft phase
    tracker.startPhase(`prosecutor_v${i}`, `Prosecutor drafting rebuttal v${i}`, "Prosecutor", i);
    let draftText: string;
    if (llmDegraded) {
      draftText = rebuttalFromTemplate(dispute, available, version);
    } else {
      draftText = await draftProsecutor(dispute, available, version, preferredAction);
      if (draftText.startsWith("Rebuttal v") && draftText.includes("Merchant position:")) {
        // Circuit breaker: LLM degraded to template; skip LLM in jury/judge to avoid repeated timeouts
        llmDegraded = true;
      }
    }
    msg(i, "Prosecutor", "draft", draftText);
    tracker.endPhase(`prosecutor_v${i}`, `Draft v${i} ready`);

    // Red-Team & Jury deliberation phase
    tracker.startPhase(
      `redteam_jury_v${i}`,
      `Red-Team & Jury attacking draft v${i}`,
      "Red-Team / Jury",
      i,
    );

    // Un-fetched artifacts available in store
    const unFetchedArtifacts = allArtifacts.filter(
      (a) => !available.some((x) => x.id === a.id),
    );
    const hasRetrievableArtifacts = unFetchedArtifacts.length > 0;

    // Skip redundant jury on un-retrievable concede or when degraded
    const skipJury = llmDegraded || (score < 35 && !hasRetrievableArtifacts);
    const jury = skipJury ? null : await runJury(dispute, available, draftText);

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
      unFetchedArtifacts.some((a) => a.kind === "merchant_log");

    let accepted = true;
    let rejection = "";

    // Stopping Rule 1: Target reached
    if (score >= 75 && !merchantLogRetrievable) {
      accepted = true;
    }
    // Stopping Rule 2: Exhausted store / Zero delta (no retrievable artifacts in store) -> accept v1
    else if (!hasRetrievableArtifacts) {
      accepted = true;
    }
    // Stopping Rule 3: Zero score improvement on iteration > 1
    else if (i > 1 && score <= scoreBefore) {
      accepted = true;
    }
    // Otherwise, if retrievable merchant log is missing and iterations remain, reject to fetch
    else if (
      merchantLogRetrievable &&
      (score < 75 || verdict === "CONTEST_HARD_PROOF") &&
      i < MAX_ITERATIONS
    ) {
      accepted = false;
      rejection =
        "REJECTED — named gap: merchant log tying buyer to post-delivery use is missing. A tracking-only draft cannot support CONTEST_HARD_PROOF. Hound: fetch the merchant log.";
    } else {
      accepted = true;
    }

    if (!accepted) {
      msg(i, "Red-Team", "critique", rejection);
      for (const g of deterministicGaps) msg(i, "Red-Team", "gap", `Gap: ${g}`);
      tracker.endPhase(
        `redteam_jury_v${i}`,
        `REJECTED (${deterministicGaps.length} gap${deterministicGaps.length === 1 ? "" : "s"})`,
      );

      const fetched = allArtifacts.filter(
        (a) => a.kind === "merchant_log" && !available.some((x) => x.id === a.id),
      );

      if (i < MAX_ITERATIONS) {
        tracker.scheduleNextIterationPhases(i + 1, fetched.length > 0);
      }

      if (fetched.length > 0) {
        tracker.startPhase(
          `hound_deep_v${i + 1}`,
          `Hound fetching deep merchant logs (iter ${i + 1})`,
          "Hound",
          i + 1,
        );
        available = [...available, ...fetched];
        for (const a of fetched) {
          msg(
            i,
            "Hound",
            "artifact",
            `Hound fetched on Red-Team demand — ${a.id} [${a.kind}] from ${a.source}: ${a.summary}${a.simulated ? " (SIMULATED)" : ""}`,
          );
        }
        tracker.endPhase(`hound_deep_v${i + 1}`, `Fetched ${fetched.length} deep artifact(s)`);
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
    tracker.endPhase(`redteam_jury_v${i}`, `ACCEPTED (${score}/100)`);

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
  const finalAction = actionForVerdict(finalVerdict);

  // Judge framing phase
  tracker.startPhase("judge_framing", "Judge framing issue & verdict rationale", "Judge", 0);
  const judge = llmDegraded
    ? {}
    : await runJudge(dispute, finalScore, finalVerdict, available, finalGaps);
  if (judge.issueFraming || judge.verdictReasoning) {
    const lines = [
      judge.issueFraming ? `Issue Framing: ${judge.issueFraming}` : null,
      judge.verdictReasoning ? `Reasoning: ${judge.verdictReasoning}` : null,
    ].filter(Boolean);
    msg(best ? best.iteration : MAX_ITERATIONS, "Judge", "verdict", lines.join("\n\n"));
  }
  tracker.endPhase("judge_framing", judge.issueFraming ? "Framed via LLM" : "Deterministic framing");

  // Arbiter routing phase
  tracker.startPhase("arbiter_routing", "Arbiter computing EV & routing policy", "Arbiter", 0);
  msg(
    best ? best.iteration : 1,
    "Arbiter",
    "verdict",
    `Verdict ${finalVerdict} → action ${finalAction}. Awaiting human approval; nothing executes before approval.`,
  );
  tracker.endPhase("arbiter_routing", `${finalVerdict} → ${finalAction}`);

  // Complete phase tracking
  const completedPhases = tracker.finishRun();

  const run: SwarmRun = {
    id: runId,
    dispute_id: dispute.id,
    iterations,
    messages,
    score: finalScore,
    gaps: finalGaps,
    verdict: finalVerdict,
    ev_display: evDisplay(finalScore, amount, undefined, dispute),
    status: "AWAITING_APPROVAL",
    duration_ms: Date.now() - started,
    created_at: new Date().toISOString(),
    issue_framing: judge.issueFraming,
    verdict_reasoning: judge.verdictReasoning,
    phases: completedPhases,
  };
  return run;
}
