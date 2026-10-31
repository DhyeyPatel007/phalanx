// PHALANX unit checks — pure-function regression tests for the Gemini
// audit fixes (Oct 30, 2026) + Phase 1 LLM wiring & jury layer (Oct 31, 2026).
// Exits non-zero on any failure. No server, no live PayPal calls.

import { PDFDocument } from "pdf-lib";
import { artifactsFromDetail } from "../src/lib/ingest";
import { artifactsForPdf, buildEvidencePdf, evidenceTypesFor } from "../src/lib/pdf";
import { evDisplay, scoreDispute } from "../src/lib/scorer";
import { draft, getProviderConfig, PROVIDER_REGISTRY, stripThinking } from "../src/lib/llm";
import {
  aggregateJuryGaps,
  draftProsecutor,
  parseJudgeOutput,
  rebuttalFromTemplate,
  runSwarm,
  validateDraftAmounts,
} from "../src/lib/swarm";
import { getDispute, getSwarmProgress, loadSeed } from "../src/lib/store";
import type { Dispute, EvidenceArtifact, SwarmRun } from "../src/lib/types";

let failures = 0;
let count = 0;

function check(name: string, expected: unknown, actual: unknown): void {
  count += 1;
  const pass = expected === actual;
  if (!pass) failures += 1;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name} — expected ${String(expected)}, got ${String(actual)}`);
}

function artifact(
  id: string,
  kind: EvidenceArtifact["kind"],
  summary: string,
): EvidenceArtifact {
  return {
    id,
    dispute_id: "PP-D-TEST",
    kind,
    source: "merchant-test",
    summary,
    simulated: true,
  };
}

function dispute(partial: Partial<Dispute> & { id: string }): Dispute {
  return {
    source: "seeded",
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    amount: { currency_code: "USD", value: "100.00" },
    status: "WAITING_FOR_SELLER_RESPONSE",
    dispute_life_cycle_stage: "INQUIRY",
    dispute_state: "REQUIRED_ACTION",
    allowed_actions: ["provide-evidence", "accept-claim", "send-message"],
    allowed_response_options: {
      accept_claim: { accept_claim_types: ["REFUND"] },
    },
    raw_paypal_detail: null,
    created_at: new Date().toISOString(),
    ...partial,
  };
}

// ---- #4: scorer negation guards ----
{
  const neg = dispute({ id: "PP-D-TEST" });
  const r1 = scoreDispute(neg, [
    artifact("t1", "tracking", "FEDEX 123456789, NOT DELIVERED"),
  ]);
  check("#4 NOT DELIVERED scores 0 for tracking_delivered", false, r1.items[0].passed);
  check("#4 NOT DELIVERED scores 0 for delivery_verifiable", false, r1.items[1].passed);

  const r2 = scoreDispute(neg, [
    artifact("t2", "tracking", "STATUS: UNDELIVERED"),
  ]);
  check("#4 UNDELIVERED scores 0 for tracking_delivered", false, r2.items[0].passed);

  const r3 = scoreDispute(neg, [
    artifact("t3", "tracking", "FEDEX 123456789, delivered 2026-10-26, NO SIGNATURE on file"),
  ]);
  check("#4 NO SIGNATURE scores 0 for signature", false, r3.items[2].passed);

  const r4 = scoreDispute(neg, [
    artifact(
      "t4",
      "tracking",
      "FEDEX 123456789, DELIVERED to PayPal transaction address, delivered 2026-10-26, signed for by buyer",
    ),
  ]);
  check("#4 positive DELIVERED still scores 30", true, r4.items[0].passed);
  check("#4 positive DELIVERED still verifiable (+15)", true, r4.items[1].passed);
  check("#4 positive signed still scores 15", true, r4.items[2].passed);
  check("#4 positive control total is 60", 60, r4.score);
}

// ---- #5: stage-aware concede fee ----
{
  check("#5 INQUIRY concede_cost is amount only ($480)", 480, evDisplay(85, 480, undefined, "INQUIRY").concede_cost);
  check("#5 INQUIRY concede_cost is amount only ($95)", 95, evDisplay(0, 95, undefined, "INQUIRY").concede_cost);
  check("#5 CLAIM concede_cost adds $15 ($210)", 225, evDisplay(60, 210, undefined, "CLAIM").concede_cost);
  check("#5 default stage is CLAIM ($210)", 225, evDisplay(60, 210).concede_cost);
  check("#5 fee_basis states the INQUIRY waiver", true, evDisplay(60, 210, undefined, "INQUIRY").fee_basis.includes("Waived when resolved directly"));
}

// ---- #2: evidenceTypesFor — live evidences first, seed fallback ----
{
  const live = dispute({
    id: "PP-D-LIVE",
    source: "sandbox",
    raw_paypal_detail: {
      evidences: [
        { evidence_type: "PROOF_OF_REFUND", source: "REQUESTED_FROM_SELLER" },
        { evidence_type: "OTHER", source: "REQUESTED_FROM_BUYER" },
        { evidence_type: "PROOF_OF_FULFILLMENT", source: "REQUESTED_FROM_SELLER" },
      ],
    },
  });
  check("#2 live evidences read from raw_paypal_detail", "PROOF_OF_REFUND,PROOF_OF_FULFILLMENT", evidenceTypesFor(live, "provide-evidence").join(","));

  const seedA = dispute({ id: "PP-D-88412" });
  check("#2 seeded A fallback is PROOF_OF_FULFILLMENT", "PROOF_OF_FULFILLMENT", evidenceTypesFor(seedA, "provide-evidence").join(","));
  const seedB = dispute({ id: "PP-D-88413", reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED" });
  check("#2 seeded B fallback is OTHER", "OTHER", evidenceTypesFor(seedB, "provide-evidence").join(","));
  check("#2 non-evidence action returns []", 0, evidenceTypesFor(seedA, "make-offer").length);
}

// ---- #3 + #9: PDF builds with hostile input and many artifacts ----
async function pdfChecks(): Promise<void> {
  const d = dispute({ id: "PP-D-TEST" });
  const nasty = artifact(
    "n1",
    "merchant_log",
    "Buyer note → “café ₹500”\u00A0paid — emoji 😀 and \u202F narrow space, plus a very long tail. " +
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(40),
  );
  const bytes = await buildEvidencePdf(d, [nasty], null);
  check("#3 hostile-Unicode PDF builds (no WinAnsi crash)", true, bytes.length > 1000);
  const loaded = await PDFDocument.load(bytes);
  check("#3 hostile-Unicode PDF has 5 pages", 5, loaded.getPageCount());

  const many: EvidenceArtifact[] = Array.from({ length: 25 }, (_, i) =>
    artifact(`m${i + 1}`, "invoice", `Invoice INV-TEST-${i + 1} + order record present`),
  );
  const bytesMany = await buildEvidencePdf(d, many, null);
  const loadedMany = await PDFDocument.load(bytesMany);
  check("#9 25-artifact PDF paginates past 5 pages", true, loadedMany.getPageCount() > 5);
  console.log(`     (25-artifact PDF page count: ${loadedMany.getPageCount()})`);
}

// ---- #5 (batch 2): artifactsFromDetail derives invoice only from detail ----
{
  const derived = artifactsFromDetail("PP-D-LIVE-1", {
    disputed_transactions: [
      {
        seller_transaction_id: "TXN-123",
        gross_amount: { currency_code: "USD", value: "480.00" },
        transaction_status: "COMPLETED",
      },
    ],
  });
  check("#5 live detail derives 1 invoice artifact", 1, derived.length);
  check("#5 invoice artifact kind", "invoice", derived[0]?.kind);
  check("#5 invoice summary carries seller tx id", true, derived[0]?.summary.includes("TXN-123") ?? false);
  check("#5 invoice summary carries gross amount", true, derived[0]?.summary.includes("480.00") ?? false);
  check("#5 invoice artifact is not simulated", false, derived[0]?.simulated);
  check("#5 never invents tracking", false, derived.some((a) => a.kind === "tracking"));
  check("#5 detail without transactions derives none", 0, artifactsFromDetail("PP-D-LIVE-2", {}).length);
  check("#5 detail with empty transactions derives none", 0, artifactsFromDetail("PP-D-LIVE-3", { disputed_transactions: [] }).length);
}

// ---- #9 (batch 2): artifactsForPdf pre-swarm filter ----
{
  const all = [
    artifact("t1", "tracking", "FEDEX 1, DELIVERED"),
    artifact("i1", "invoice", "Invoice INV-1"),
    artifact("m1", "merchant_log", "Buyer used product post-delivery"),
  ];
  check("#9 pre-swarm shows tracking+invoice only", "tracking,invoice", artifactsForPdf(all, null).map((a) => a.kind).join(","));
  check("#9 after a run shows all artifacts", 3, artifactsForPdf(all, { id: "run-x" } as SwarmRun).length);
}

// ---- Phase 1: LLM provider registry checks ----
{
  const expectedProviders = ["gemini", "openai", "grok", "deepseek", "kimi", "groq", "nvidia", "custom"];
  check("LLM provider registry contains all 8 providers", expectedProviders.length, Object.keys(PROVIDER_REGISTRY).length);
  for (const name of expectedProviders) {
    check(`LLM registry has ${name}`, true, Boolean(PROVIDER_REGISTRY[name]));
  }

  // Base URLs
  check("gemini baseUrl", "https://generativelanguage.googleapis.com/v1beta/openai", PROVIDER_REGISTRY.gemini.baseUrl);
  check("openai baseUrl", "https://api.openai.com/v1", PROVIDER_REGISTRY.openai.baseUrl);
  check("grok baseUrl", "https://api.x.ai/v1", PROVIDER_REGISTRY.grok.baseUrl);
  check("deepseek baseUrl", "https://api.deepseek.com/v1", PROVIDER_REGISTRY.deepseek.baseUrl);
  check("kimi baseUrl", "https://api.moonshot.ai/v1", PROVIDER_REGISTRY.kimi.baseUrl);
  check("groq baseUrl", "https://api.groq.com/openai/v1", PROVIDER_REGISTRY.groq.baseUrl);
  check("nvidia baseUrl", "https://integrate.api.nvidia.com/v1", PROVIDER_REGISTRY.nvidia.baseUrl);

  // Default models
  check("gemini default model", "gemini-3.8-flash", PROVIDER_REGISTRY.gemini.defaultModel);
  check("openai default model", "gpt-4o-mini", PROVIDER_REGISTRY.openai.defaultModel);
  check("grok default model", "grok-4", PROVIDER_REGISTRY.grok.defaultModel);
  check("deepseek default model", "deepseek-chat", PROVIDER_REGISTRY.deepseek.defaultModel);
  check("kimi default model", "kimi-k2.5", PROVIDER_REGISTRY.kimi.defaultModel);
  check("groq default model", "llama-3.3-70b-versatile", PROVIDER_REGISTRY.groq.defaultModel);
  check("nvidia default model", "nvidia/llama-3.1-nemotron-70b-instruct", PROVIDER_REGISTRY.nvidia.defaultModel);

  // Default provider lookup
  check("default provider lookup resolves gemini", "gemini", getProviderConfig()?.name);
}

// ---- Phase 1: draft() returns null when no key is configured ----
async function draftNoKeyChecks(): Promise<void> {
  const savedKey = process.env.GEMINI_API_KEY;
  const savedNvidiaKey = process.env.NVIDIA_API_KEY;
  const savedProvider = process.env.LLM_PROVIDER;
  const savedUniversal = process.env.LLM_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    delete process.env.NVIDIA_API_KEY;
    delete process.env.LLM_API_KEY;

    process.env.LLM_PROVIDER = "gemini";
    const resGemini = await draft("test prompt");
    check("draft() returns null immediately when no key is configured (gemini)", null, resGemini);

    process.env.LLM_PROVIDER = "nvidia";
    const resNvidia = await draft("test prompt");
    check("draft() returns null immediately when no key is configured (nvidia)", null, resNvidia);
  } finally {
    if (savedKey) process.env.GEMINI_API_KEY = savedKey;
    if (savedNvidiaKey) process.env.NVIDIA_API_KEY = savedNvidiaKey;
    if (savedProvider) process.env.LLM_PROVIDER = savedProvider;
    if (savedUniversal) process.env.LLM_API_KEY = savedUniversal;
  }
}

// ---- Phase 1: Prosecutor fallback to template on unconfigured key / provider failure ----
async function prosecutorFallbackChecks(): Promise<void> {
  const d = dispute({ id: "PP-D-PROS" });
  const arts = [
    artifact("t1", "tracking", "FEDEX 123456, DELIVERED"),
    artifact("i1", "invoice", "Invoice INV-PROS-1"),
  ];

  // Without key, draftProsecutor must return the exact rebuttalFromTemplate output
  const template = rebuttalFromTemplate(d, arts, "v1");
  const draftResult = await draftProsecutor(d, arts, "v1", "provide-evidence");
  check("draftProsecutor falls back to rebuttalFromTemplate with no key", template, draftResult);

  // validateDraftAmounts guard checks
  const safeText = "Rebuttal for dispute PP-D-PROS: $100.00 is disputed, plus standard fee $15.00.";
  check("validateDraftAmounts accepts allowed dispute amounts", true, validateDraftAmounts(safeText, d, arts));

  const hallucinatedText = "Rebuttal: We demand a penalty payment of $4,999.00 from buyer!";
  check("validateDraftAmounts rejects hallucinated $ amount", false, validateDraftAmounts(hallucinatedText, d, arts));
}

// ---- Phase 1: Jury gap aggregation (union, dedup) ----
{
  const evidenceGaps = ["Tracking number is missing carrier name", "Delivery date unconfirmed"];
  const policyGaps = ["Delivery date unconfirmed", "Seller protection requires proof of fulfillment"];
  const buyerGaps = ["Buyer claims item was not received", "Tracking number is missing carrier name"];

  const aggregated = aggregateJuryGaps(evidenceGaps, policyGaps, buyerGaps);
  check("Jury aggregation produces union with duplicates removed", 4, aggregated.length);
  check("Jury aggregation retains unique gaps", true, aggregated.includes("Tracking number is missing carrier name"));
  check("Jury aggregation retains policy gaps", true, aggregated.includes("Seller protection requires proof of fulfillment"));
  check("Jury aggregation retains buyer gaps", true, aggregated.includes("Buyer claims item was not received"));
}

// ---- Phase 1: Judge output shape parsing ----
{
  const mockJudgeResponse = `
ISSUE_FRAMING: The decisive question is whether delivery to the transaction address can be verified through merchant records.

VERDICT_REASONING: The evidence score of 85/100 fulfills tracking and post-delivery merchant log requirements. This satisfies PayPal Seller Protection standards and strongly supports the CONTEST_HARD_PROOF routing policy.
`;

  const parsed = parseJudgeOutput(mockJudgeResponse);
  check(
    "Judge issueFraming parsed correctly",
    "The decisive question is whether delivery to the transaction address can be verified through merchant records.",
    parsed.issueFraming,
  );
  check(
    "Judge verdictReasoning parsed correctly",
    "The evidence score of 85/100 fulfills tracking and post-delivery merchant log requirements. This satisfies PayPal Seller Protection standards and strongly supports the CONTEST_HARD_PROOF routing policy.",
    parsed.verdictReasoning,
  );

  const emptyParsed = parseJudgeOutput("Unformatted text with no labels");
  check("Judge parse returns undefined for missing labels", undefined, emptyParsed.issueFraming);
  check("Judge parse returns undefined for missing reasoning", undefined, emptyParsed.verdictReasoning);
}


// ---- MiroFish learnings: thinking-block stripping ----
{
  const reasoningOutput = "<think>\nThinking about the merchant dispute...\nConsidering PayPal policies...\n</think>\nRebuttal v1 — Claim is contested on tracking proof.";
  check(
    "stripThinking removes <think>...</think> blocks",
    "Rebuttal v1 — Claim is contested on tracking proof.",
    stripThinking(reasoningOutput),
  );

  const multipleThinks = "<think>first thought</think>Part 1<think>second thought</think> Part 2";
  check(
    "stripThinking removes multiple <think> blocks",
    "Part 1 Part 2",
    stripThinking(multipleThinks),
  );

  const noThinking = "Plain text without any thinking tags.";
  check(
    "stripThinking leaves clean text unchanged",
    "Plain text without any thinking tags.",
    stripThinking(noThinking),
  );

  check("stripThinking handles empty string", "", stripThinking(""));
}

// ---- Live Swarm Phase Tracker & Seeded Dispute Integration ----
async function swarmAndTrackerChecks(): Promise<void> {
  loadSeed();

  // Test Scenario A: PP-D-88412 (60 -> 85)
  const disputeA = getDispute("PP-D-88412");
  if (!disputeA) throw new Error("Seed dispute PP-D-88412 missing");
  const runA = await runSwarm(disputeA);

  check("Seeded A score progression achieves 85", 85, runA.score);
  check("Seeded A verdict is CONTEST_HARD_PROOF", "CONTEST_HARD_PROOF", runA.verdict);
  check("Seeded A took exactly 2 iterations (v1 rejected -> v2 accepted)", 2, runA.iterations.length);
  check("Seeded A iteration 1 was rejected", false, runA.iterations[0].accepted);
  check("Seeded A iteration 1 score was 60", 60, runA.iterations[0].score);
  check("Seeded A iteration 2 was accepted", true, runA.iterations[1].accepted);
  check("Seeded A iteration 2 score was 85", 85, runA.iterations[1].score);

  // Check SwarmRun phases
  check("runA carries phases array", true, Array.isArray(runA.phases));
  const phasesA = runA.phases ?? [];
  check("runA has hound_init phase", true, phasesA.some((p) => p.key === "hound_init"));
  check("runA has prosecutor_v1 phase", true, phasesA.some((p) => p.key === "prosecutor_v1"));
  check("runA has redteam_jury_v1 phase", true, phasesA.some((p) => p.key === "redteam_jury_v1"));
  check("runA has dynamic hound_deep_v2 phase", true, phasesA.some((p) => p.key === "hound_deep_v2"));
  check("runA has prosecutor_v2 phase", true, phasesA.some((p) => p.key === "prosecutor_v2"));
  check("runA has redteam_jury_v2 phase", true, phasesA.some((p) => p.key === "redteam_jury_v2"));
  check("runA has judge_framing phase", true, phasesA.some((p) => p.key === "judge_framing"));
  check("runA has arbiter_routing phase", true, phasesA.some((p) => p.key === "arbiter_routing"));

  // Check store progress for PP-D-88412
  const progressA = getSwarmProgress("PP-D-88412");
  check("Store progressA status is DONE", "DONE", progressA?.status);
  const pPros1 = progressA?.phases.find((p) => p.key === "prosecutor_v1");
  check("prosecutor_v1 is done in progress", "done", pPros1?.status);
  check("prosecutor_v1 has non-null duration_ms", true, typeof pPros1?.duration_ms === "number");
  const pPros2 = progressA?.phases.find((p) => p.key === "prosecutor_v2");
  check("prosecutor_v2 is done in progress", "done", pPros2?.status);

  // Test Scenario B: PP-D-88413 (Score 60 -> DE_ESCALATE_OFFER)
  const disputeB = getDispute("PP-D-88413");
  if (!disputeB) throw new Error("Seed dispute PP-D-88413 missing");
  const runB = await runSwarm(disputeB);
  check("Seeded B score is 60", 60, runB.score);
  check("Seeded B verdict is DE_ESCALATE_OFFER", "DE_ESCALATE_OFFER", runB.verdict);
  check("Seeded B took 1 iteration", 1, runB.iterations.length);

  // Test Scenario C: PP-D-88414 (Score 0 -> CONCEDE_FAST_SETTLE)
  const disputeC = getDispute("PP-D-88414");
  if (!disputeC) throw new Error("Seed dispute PP-D-88414 missing");
  const runC = await runSwarm(disputeC);
  check("Seeded C score is 0", 0, runC.score);
  check("Seeded C verdict is CONCEDE_FAST_SETTLE", "CONCEDE_FAST_SETTLE", runC.verdict);
  check("Seeded C took 1 iteration", 1, runC.iterations.length);
}

async function main(): Promise<void> {
  await pdfChecks();
  await draftNoKeyChecks();
  await prosecutorFallbackChecks();
  await swarmAndTrackerChecks();
  console.log(`\n${count - failures}/${count} unit checks passed.`);
  process.exit(failures > 0 ? 1 : 0);
}

main();
