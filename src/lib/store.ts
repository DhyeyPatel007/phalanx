// In-memory / JSON evidence store. Seeded from data/seed-disputes.json.
// Persistence beyond the demo session is explicitly NOT required (brief §6).
// All seeded rows are labelled SIMULATED everywhere they are shown.

import fs from "fs";
import path from "path";
import type {
  Approval,
  Dispute,
  EvidenceArtifact,
  ExecutionRecord,
  SwarmRun,
} from "./types";

interface SeedDispute {
  id: string;
  source: "seeded";
  reason: string;
  amount: { currency: string; value: string };
  status: string;
  dispute_life_cycle_stage: string;
  expected_verdict: string;
  /** Per-dispute SIMULATED allowed actions. Must stay consistent with
   *  allowed_response_options below: A and C carry accept_claim only, so
   *  they must NOT list make-offer (finding #6). Omit to fall back to
   *  SEEDED_ALLOWED_ACTIONS. */
  allowed_actions?: string[];
  allowed_response_options?: Dispute["allowed_response_options"];
  evidence: { kind: string; summary: string; simulated: boolean }[];
}

interface PhalanxStoreState {
  disputes: Map<string, Dispute>;
  artifacts: Map<string, EvidenceArtifact[]>;
  runs: Map<string, SwarmRun[]>; // by dispute id
  approvals: Map<string, Approval>; // by dispute id (latest)
  executions: Map<string, ExecutionRecord>; // by dispute id
  processedWebhookEvents: Set<string>;
  webhookLog: { at: string; event_id: string; result: string; detail: string }[];
  seeded: boolean;
}

/**
 * Pin ALL store state onto globalThis (finding #8). Next.js App Router can
 * instantiate a module more than once across route bundles / dev HMR, and
 * module-scoped Maps would then silently reset — a swarm run saved by
 * /run could look missing to /approve. The global object survives that.
 */
const globalForPhalanx = globalThis as unknown as {
  __phalanxStore?: PhalanxStoreState;
};

function getStore(): PhalanxStoreState {
  if (!globalForPhalanx.__phalanxStore) {
    globalForPhalanx.__phalanxStore = {
      disputes: new Map(),
      artifacts: new Map(),
      runs: new Map(),
      approvals: new Map(),
      executions: new Map(),
      processedWebhookEvents: new Set(),
      webhookLog: [],
      seeded: false,
    };
  }
  return globalForPhalanx.__phalanxStore;
}

const store = getStore();
const disputes = store.disputes;
const artifacts = store.artifacts;
const runs = store.runs;
const approvals = store.approvals;
const executions = store.executions;
const processedWebhookEvents = store.processedWebhookEvents;
const webhookLog = store.webhookLog;

/** Simulated allowed actions for seeded disputes (INQUIRY, WAITING_FOR_SELLER_RESPONSE).
 *  Live disputes get theirs from the real PayPal detail response. */
export const SEEDED_ALLOWED_ACTIONS = [
  "provide-evidence",
  "make-offer",
  "accept-claim",
  "send-message",
];

export function loadSeed(): Dispute[] {
  if (store.seeded) return [...disputes.values()];
  const file = path.join(process.cwd(), "data", "seed-disputes.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as {
    disputes: SeedDispute[];
  };
  for (const s of raw.disputes) {
    const d: Dispute = {
      id: s.id,
      source: "seeded",
      reason: s.reason,
      amount: { currency_code: s.amount.currency, value: s.amount.value },
      status: s.status,
      dispute_life_cycle_stage: s.dispute_life_cycle_stage,
      dispute_state: "REQUIRED_ACTION",
      allowed_actions: s.allowed_actions ? [...s.allowed_actions] : [...SEEDED_ALLOWED_ACTIONS],
      allowed_response_options: s.allowed_response_options,
      raw_paypal_detail: null,
      created_at: new Date().toISOString(),
    };
    disputes.set(d.id, d);
    artifacts.set(
      d.id,
      s.evidence.map((e, i) => ({
        id: `${d.id}-ev${i + 1}`,
        dispute_id: d.id,
        kind: e.kind as EvidenceArtifact["kind"],
        source: "merchant-seed",
        summary: e.summary,
        simulated: e.simulated,
      })),
    );
  }
  store.seeded = true;
  return [...disputes.values()];
}

export function listDisputes(): Dispute[] {
  loadSeed();
  return [...disputes.values()];
}

export function getDispute(id: string): Dispute | undefined {
  loadSeed();
  return disputes.get(id);
}

export function upsertDispute(d: Dispute): void {
  disputes.set(d.id, d);
}

/**
 * Demo/test harness only: replace a SEEDED dispute's
 * allowed_response_options (used by the negative-test suite to prove the
 * execute route re-checks offer/accept types at execution time). Refuses
 * live (sandbox) disputes — their options come from PayPal only.
 */
export function setAllowedResponseOptions(
  id: string,
  options: Dispute["allowed_response_options"],
): Dispute | undefined {
  const d = disputes.get(id);
  if (!d || d.source !== "seeded") return undefined;
  d.allowed_response_options = options;
  disputes.set(id, d);
  return d;
}

export function getArtifacts(disputeId: string): EvidenceArtifact[] {
  loadSeed();
  return artifacts.get(disputeId) ?? [];
}

export function addArtifacts(list: EvidenceArtifact[]): void {
  for (const a of list) {
    const cur = artifacts.get(a.dispute_id) ?? [];
    if (!cur.some((x) => x.id === a.id)) cur.push(a);
    artifacts.set(a.dispute_id, cur);
  }
}

/** Demo/test harness only: replace a dispute's whole artifact list. */
export function setArtifacts(disputeId: string, list: EvidenceArtifact[]): void {
  artifacts.set(disputeId, [...list]);
}

export function addRun(run: SwarmRun): void {
  const cur = runs.get(run.dispute_id) ?? [];
  cur.push(run);
  runs.set(run.dispute_id, cur);
}

export function getRuns(disputeId: string): SwarmRun[] {
  return runs.get(disputeId) ?? [];
}

export function latestRun(disputeId: string): SwarmRun | undefined {
  const cur = runs.get(disputeId) ?? [];
  return cur[cur.length - 1];
}

/** Latest run per dispute (for server-side telemetry). */
export function allLatestRuns(): SwarmRun[] {
  const out: SwarmRun[] = [];
  for (const cur of runs.values()) {
    if (cur.length > 0) out.push(cur[cur.length - 1]);
  }
  return out;
}

/** All execution records (for server-side telemetry). */
export function listExecutions(): ExecutionRecord[] {
  return [...executions.values()];
}

export function setApproval(a: Approval): void {
  approvals.set(a.dispute_id, a);
}

export function getApproval(disputeId: string): Approval | undefined {
  return approvals.get(disputeId);
}

export function setExecution(e: ExecutionRecord): void {
  executions.set(e.dispute_id, e);
}

export function getExecution(disputeId: string): ExecutionRecord | undefined {
  return executions.get(disputeId);
}

export function seenWebhookEvent(eventId: string): boolean {
  return processedWebhookEvents.has(eventId);
}

export function markWebhookEvent(eventId: string): void {
  processedWebhookEvents.add(eventId);
}

export function logWebhook(entry: {
  event_id: string;
  result: string;
  detail: string;
}): void {
  webhookLog.push({ at: new Date().toISOString(), ...entry });
  if (webhookLog.length > 200) webhookLog.shift();
}

export function getWebhookLog() {
  return [...webhookLog].reverse();
}

export function isSeeded(): boolean {
  return store.seeded;
}
