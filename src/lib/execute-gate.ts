// Execution gate — pure decision logic for POST /api/disputes/{id}/execute.
// The route calls this BEFORE any network call, so every refusal below is
// provable by unit check with zero live PayPal traffic. The order mirrors
// the route's historic refusal order exactly (negative tests pin it):
// approval -> stage -> allowed action -> offer/accept type -> action
// mismatch -> duplicate -> stale approval -> seeded refusal -> sandbox
// guard -> credentials. Nothing here ever calls PayPal.

import { checkOfferAcceptTypes, stageGate } from "./arbiter";
import { evidenceTypesFor } from "./pdf";
import type {
  Approval,
  Dispute,
  EvidenceArtifact,
  ExecutionRecord,
  SwarmRun,
} from "./types";

export type ExecuteGateDecision =
  | { ok: true }
  | {
      ok: false;
      error: string;
      status: number;
      detail: string;
      allowed_actions?: string[];
      allowed_response_options?: Dispute["allowed_response_options"];
    };

export interface ExecuteGateInput {
  dispute: Dispute;
  approval: Approval | null;
  existingExecution: ExecutionRecord | null;
  latestRun: SwarmRun | null;
  /** Action the caller asked to execute; when present it must match the approval. */
  requestedAction?: string;
  /** Resolved PayPal base URL (PAYPAL_BASE_URL or the sandbox default). */
  paypalBaseUrl: string;
  paypalConfigured: boolean;
}

/** Sandbox-only guard: only *.sandbox.paypal.com hosts are ever callable.
 *  Production (api-m.paypal.com), localhost, and unparseable URLs refuse. */
export function isSandboxBaseUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return (
      host === "api-m.sandbox.paypal.com" ||
      host === "api.sandbox.paypal.com" ||
      host.endsWith(".sandbox.paypal.com")
    );
  } catch {
    return false;
  }
}

export function decideExecute(input: ExecuteGateInput): ExecuteGateDecision {
  const { dispute, approval, existingExecution, latestRun, requestedAction } =
    input;

  if (!approval) {
    return {
      ok: false,
      error: "APPROVAL_REQUIRED",
      status: 403,
      detail:
        "Execute refused: no human approval exists for this dispute. Approve first.",
    };
  }

  const gate = stageGate(dispute);
  if (!gate.ok) {
    return {
      ok: false,
      error: "STAGE_BLOCKED",
      status: 409,
      detail: gate.blocker,
      allowed_actions: dispute.allowed_actions,
    };
  }

  if (!dispute.allowed_actions.includes(approval.action)) {
    return {
      ok: false,
      error: "DISALLOWED_ACTION",
      status: 409,
      detail: `Execute refused: approved action (${approval.action}) is not allowed on this dispute.`,
      allowed_actions: dispute.allowed_actions,
    };
  }

  const typeError = checkOfferAcceptTypes(dispute, approval.action);
  if (typeError) {
    return {
      ok: false,
      error: "DISALLOWED_ACTION",
      status: 409,
      detail: `Execute refused: ${typeError}`,
      allowed_response_options: dispute.allowed_response_options,
    };
  }

  if (requestedAction && requestedAction !== approval.action) {
    return {
      ok: false,
      error: "ACTION_MISMATCH",
      status: 409,
      detail: `Execute refused: approved action (${approval.action}) does not match requested execution (${requestedAction}).`,
    };
  }

  if (existingExecution && existingExecution.paypal_status === "EXECUTED") {
    return {
      ok: false,
      error: "DUPLICATE_EXECUTION",
      status: 409,
      detail: `Execute refused: idempotency key ${existingExecution.idempotency_key} has already been executed.`,
    };
  }

  if (!latestRun || latestRun.id !== approval.run_id) {
    return {
      ok: false,
      error: "STALE_APPROVAL",
      status: 409,
      detail:
        "Execute refused: approval is stale (a newer swarm run exists). Re-approve.",
    };
  }

  if (dispute.source === "seeded") {
    return {
      ok: false,
      error: "LIVE_EXECUTION_NOT_ENABLED",
      status: 409,
      detail:
        "REFUSED: seeded (SIMULATED) dispute — no live PayPal dispute exists to act on. Live execution is build step 5, after Sandbox accounts are confirmed.",
    };
  }

  if (!isSandboxBaseUrl(input.paypalBaseUrl)) {
    return {
      ok: false,
      error: "NOT_SANDBOX_BASE_URL",
      status: 409,
      detail: `Execute refused: PAYPAL_BASE_URL (${input.paypalBaseUrl}) is not a PayPal Sandbox host. Production PayPal is never callable from PHALANX.`,
    };
  }

  if (!input.paypalConfigured) {
    return {
      ok: false,
      error: "PAYPAL_NOT_CONFIGURED",
      status: 409,
      detail:
        "Execute refused: PayPal Sandbox credentials (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET) are not configured.",
    };
  }

  return { ok: true };
}

/** Parse "FEDEX 774829104829, DELIVERED ..." into carrier + tracking number.
 *  Returns null when the summary carries no carrier/number pair. */
export function parseTrackingInfo(
  summary: string,
): { carrier_name: string; tracking_number: string } | null {
  const m = summary.match(/^([A-Z][A-Z0-9]*)\s+([A-Za-z0-9][A-Za-z0-9-]*)/);
  if (!m) return null;
  return { carrier_name: m[1], tracking_number: m[2] };
}

export interface ProvideEvidenceInput {
  /** Structured evidences[] JSON — the primary payload (Phase 0 row 2). */
  evidences: Array<{
    evidence_type: string;
    evidence_info?: Record<string, unknown>;
  }>;
}

/** Build the structured evidences[] for provide-evidence from the
 *  evidence types PayPal actually requested (evidenceTypesFor) plus the
 *  merchant's own tracking artifact. Only requested types are ever sent. */
export function buildProvideEvidenceInput(
  dispute: Dispute,
  artifacts: EvidenceArtifact[],
): ProvideEvidenceInput {
  const types = evidenceTypesFor(dispute, "provide-evidence");
  const tracking = artifacts.find((a) => a.kind === "tracking");
  const trackingInfo = tracking ? parseTrackingInfo(tracking.summary) : null;

  const evidences = types.map((evidence_type) => {
    const evidence_info: Record<string, unknown> = {};
    if (evidence_type === "PROOF_OF_FULFILLMENT" && trackingInfo) {
      evidence_info.tracking_info = trackingInfo;
    } else if (evidence_type === "PROOF_OF_FULFILLMENT") {
      evidence_info.notes =
        "Tracking proof is in the attached PDF dossier; no carrier tracking record exists in the merchant store.";
    } else {
      const first = artifacts.find((a) => a.kind !== "tracking");
      evidence_info.notes = first
        ? `See attached PDF dossier: ${first.summary}`
        : "See attached PDF dossier.";
    }
    return { evidence_type, evidence_info };
  });

  return { evidences };
}
