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
  AttachedEvidence,
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

/** Parse a tracking summary into carrier + tracking number.
 *  Handles both summary shapes in the store:
 *  - seeded bare form: "FEDEX 774829104829, DELIVERED ..."
 *  - PayPal Tracking API form: "Carrier UPS tracking 1Z... — DELIVERED ..."
 *  Returns null when the summary carries no carrier/number pair. */
export function parseTrackingInfo(
  summary: string,
): { carrier_name: string; tracking_number: string } | null {
  const labeled = summary.match(
    /Carrier\s+([A-Za-z]+)\s+tracking\s+([A-Za-z0-9][A-Za-z0-9-]*)/i,
  );
  if (labeled) {
    return {
      carrier_name: labeled[1].toUpperCase(),
      tracking_number: labeled[2],
    };
  }
  const m = summary.match(/^([A-Z][A-Z0-9]*)\s+([A-Za-z0-9][A-Za-z0-9-]*)/);
  if (!m) return null;
  return { carrier_name: m[1], tracking_number: m[2] };
}

/** Parse carrier + tracking number from an attached tracking receipt / POD.
 *  Reads the file's own text ("Carrier: UPS" / "Tracking number: 1Z..."),
 *  falling back to the attachment's referenceId metadata as the number.
 *  Returns null when neither the text nor the metadata yields a pair. */
export function parseTrackingFromAttached(
  att: AttachedEvidence,
): { carrier_name: string; tracking_number: string } | null {
  let text = "";
  if (att.base64Data) {
    try {
      text = Buffer.from(att.base64Data.slice(0, 8192), "base64").toString(
        "utf-8",
      );
    } catch {
      text = "";
    }
  }
  const carrier = text.match(/Carrier:\s*([A-Za-z]+)/i)?.[1];
  const number =
    text.match(/Tracking number:\s*([A-Za-z0-9][A-Za-z0-9-]*)/i)?.[1] ??
    (att.referenceId?.trim() || "");
  if (!carrier || !number) return null;
  return { carrier_name: carrier.toUpperCase(), tracking_number: number };
}

export interface ProvideEvidenceInput {
  /** Structured evidences[] JSON — the primary payload (Phase 0 row 2).
   *  Shape follows PayPal's provide-evidence schema exactly:
   *  `tracking_info` is an ARRAY inside evidence_info, and `notes` is a
   *  sibling of evidence_type/evidence_info — never inside evidence_info
   *  (PayPal 400s that as INVALID_REQUEST; verified live Nov 11, 2026). */
  evidences: Array<{
    evidence_type: string;
    evidence_info?: Record<string, unknown>;
    notes?: string;
  }>;
}

/** Build the structured evidences[] for provide-evidence from the
 *  evidence types PayPal actually requested (evidenceTypesFor) plus the
 *  merchant's own tracking — first from a stored tracking artifact
 *  (PayPal Tracking API record), then from an attached tracking receipt
 *  or carrier POD. Only requested types are ever sent. */
export function buildProvideEvidenceInput(
  dispute: Dispute,
  artifacts: EvidenceArtifact[],
  attached: AttachedEvidence[] = [],
): ProvideEvidenceInput {
  const types = evidenceTypesFor(dispute, "provide-evidence");
  const tracking = artifacts.find((a) => a.kind === "tracking");
  const fromArtifact = tracking ? parseTrackingInfo(tracking.summary) : null;
  const fromAttached =
    fromArtifact ??
    attached
      .filter(
        (a) =>
          a.evidenceType === "TRACKING_RECEIPT" ||
          a.evidenceType === "CARRIER_POD",
      )
      .sort(
        (a, b) =>
          (a.quality === "STRONG" ? 0 : 1) - (b.quality === "STRONG" ? 0 : 1),
      )
      .map((a) => parseTrackingFromAttached(a))
      .find((t) => t !== null) ??
    null;
  const trackingInfo = fromArtifact ?? fromAttached;

  const evidences = types.map((evidence_type) => {
    if (evidence_type === "PROOF_OF_FULFILLMENT" && trackingInfo) {
      return {
        evidence_type,
        evidence_info: { tracking_info: [trackingInfo] },
      };
    }
    if (evidence_type === "PROOF_OF_FULFILLMENT") {
      return {
        evidence_type,
        notes:
          "Tracking proof is in the attached PDF dossier; no carrier tracking record exists in the merchant store.",
      };
    }
    const first = artifacts.find((a) => a.kind !== "tracking");
    return {
      evidence_type,
      notes: first
        ? `See attached PDF dossier: ${first.summary}`
        : "See attached PDF dossier.",
    };
  });

  return { evidences };
}
