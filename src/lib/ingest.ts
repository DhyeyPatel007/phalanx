// Webhook ingest — shared by POST /api/webhooks/paypal (live, verified)
// and POST /api/demo/replay-webhook (demo-only, clearly labelled, no
// signature verification — it never touches PayPal).
// Rules (brief §6): read RAW body, verify signature, return 200 quickly,
// dedupe on event/dispute ID. Unverified or duplicate events are logged
// and ignored, never executed.

import {
  addArtifacts,
  getDispute,
  logWebhook,
  markWebhookEvent,
  seenWebhookEvent,
  upsertDispute,
} from "./store";
import { getPayPalDispute } from "./paypal";
import type { Dispute, EvidenceArtifact } from "./types";

export interface IngestResult {
  ok: boolean;
  ignored?: string;
  dispute_id?: string;
  event_id?: string;
}

/** Extract the dispute id from a CUSTOMER.DISPUTE.CREATED resource. */
function disputeIdFromResource(resource: Record<string, unknown>): string | null {
  const v =
    (resource.dispute_id as string | undefined) ??
    (resource.id as string | undefined) ??
    null;
  return typeof v === "string" ? v : null;
}

/**
 * Derive evidence artifacts from a live dispute detail — ONLY from what
 * the detail actually carries (finding #5). The Disputes API detail has
 * `disputed_transactions` (seller/buyer transaction ids, status, gross
 * amount) but NO tracking info, so the derived artifact is an invoice /
 * order record: the PayPal-side transaction record, labelled as such.
 * Tracking is NOT in the detail and stays a named gap; it is never
 * invented. A live dispute therefore scores 15 (invoice) instead of 0
 * until the merchant attaches real tracking / log records.
 */
export function artifactsFromDetail(
  disputeId: string,
  detail: Record<string, unknown>,
): EvidenceArtifact[] {
  const txs = detail.disputed_transactions;
  if (!Array.isArray(txs)) return [];
  const out: EvidenceArtifact[] = [];
  txs.forEach((t, i) => {
    if (typeof t !== "object" || t === null) return;
    const tx = t as Record<string, unknown>;
    const sellerTx =
      (tx.seller_transaction_id as string | undefined) ??
      (tx.buyer_transaction_id as string | undefined);
    const gross = tx.gross_amount as
      | { currency_code?: string; value?: string }
      | undefined;
    const status = tx.transaction_status as string | undefined;
    if (!sellerTx && !gross) return;
    const parts = [
      "PayPal dispute detail — order record from the dispute itself",
      sellerTx ? `seller transaction ${sellerTx}` : null,
      gross?.value
        ? `gross ${gross.value}${gross.currency_code ? ` ${gross.currency_code}` : ""}`
        : null,
      status ? `status ${status}` : null,
    ].filter((p): p is string => p !== null);
    out.push({
      id: `${disputeId}-tx-${i + 1}`,
      dispute_id: disputeId,
      kind: "invoice",
      source: "paypal-detail",
      summary: parts.join(", ") + ". No merchant invoice or tracking attached yet — tracking stays a named gap.",
      simulated: false,
    });
  });
  return out;
}

/**
 * Status-only patch from a webhook resource. Only fields actually present
 * in the resource are set — an absent field never wipes a stored value.
 */
function patchFromResource(
  resource: Record<string, unknown>,
): Partial<Dispute> {
  const patch: Partial<Dispute> = {};
  if (typeof resource.status === "string") patch.status = resource.status;
  if (typeof resource.dispute_life_cycle_stage === "string")
    patch.dispute_life_cycle_stage = resource.dispute_life_cycle_stage;
  if (typeof resource.dispute_state === "string")
    patch.dispute_state = resource.dispute_state;
  if (Array.isArray(resource.links)) {
    patch.allowed_actions = (resource.links as { rel?: unknown }[])
      .map((l) => l.rel)
      .filter((r): r is string => typeof r === "string" && r !== "self");
  }
  if (
    resource.allowed_response_options &&
    typeof resource.allowed_response_options === "object"
  ) {
    patch.allowed_response_options = resource.allowed_response_options as Dispute["allowed_response_options"];
  }
  return patch;
}

/** Final outcome code from a RESOLVED resource, else the literal "RESOLVED". */
function outcomeFromResource(resource: Record<string, unknown>): string {
  if (typeof resource.outcome_code === "string") return resource.outcome_code;
  const outcome = resource.dispute_outcome;
  if (
    outcome &&
    typeof outcome === "object" &&
    typeof (outcome as Record<string, unknown>).outcome_code === "string"
  )
    return (outcome as Record<string, unknown>).outcome_code as string;
  if (typeof resource.resolution === "string") return resource.resolution;
  return "RESOLVED";
}

/**
 * Handle CUSTOMER.DISPUTE.UPDATED / CUSTOMER.DISPUTE.RESOLVED.
 * Deterministic + idempotent (dedupe is checked by the caller before this
 * runs; the event is marked seen on every terminal outcome below).
 * Seeded rows: resource fields only, never a live fetch. Sandbox rows:
 * best-effort live re-fetch; on fetch failure the resource fields are
 * applied instead and the failure is logged — nothing is wiped.
 * RESOLVED additionally clears allowed_actions and records the outcome.
 */
async function handleDisputeUpdate(
  eventType: string,
  eventId: string,
  resource: Record<string, unknown>,
  disputeId: string | null,
  rawResource: unknown,
): Promise<IngestResult> {
  const resolved = eventType === "CUSTOMER.DISPUTE.RESOLVED";
  const verb = resolved ? "RESOLVED" : "UPDATED";

  if (rawResource === undefined || rawResource === null || typeof rawResource !== "object") {
    markWebhookEvent(eventId);
    logWebhook({ event_id: eventId, result: `IGNORED_${verb}_NO_RESOURCE`, detail: `${eventType} carried no resource object.` });
    return { ok: true, ignored: "no resource", event_id: eventId };
  }
  if (!disputeId) {
    markWebhookEvent(eventId);
    logWebhook({ event_id: eventId, result: `IGNORED_${verb}_NO_DISPUTE_ID`, detail: "resource carried no dispute_id." });
    return { ok: true, ignored: "no dispute id in resource", event_id: eventId };
  }
  const existing = getDispute(disputeId);
  if (!existing) {
    markWebhookEvent(eventId);
    logWebhook({ event_id: eventId, result: `IGNORED_${verb}_UNKNOWN_DISPUTE`, detail: `Dispute ${disputeId} is not in the store; an update alone never creates a row.` });
    return { ok: true, ignored: "unknown dispute", event_id: eventId };
  }

  const resolution = resolved
    ? { outcome: outcomeFromResource(resource), resolved_at: new Date().toISOString() }
    : undefined;

  // Seeded rows: status fields from the resource only — never live-fetch.
  if (existing.source === "seeded") {
    const updated: Dispute = {
      ...existing,
      ...patchFromResource(resource),
      ...(resolved ? { allowed_actions: [], resolution } : {}),
    };
    upsertDispute(updated);
    markWebhookEvent(eventId);
    logWebhook({
      event_id: eventId,
      result: resolved ? "RESOLVED_SEEDED" : "UPDATED_SEEDED",
      detail:
        `Dispute ${disputeId} ${verb.toLowerCase()} from resource fields only (seeded row, no live fetch).` +
        (resolved ? ` Final outcome: ${resolution!.outcome} at ${resolution!.resolved_at}; allowed_actions cleared, Execute locked.` : "") +
        ` Evidence, runs and approvals untouched.`,
    });
    return { ok: true, dispute_id: disputeId, event_id: eventId };
  }

  // Sandbox rows: best-effort live re-fetch (authoritative). On failure,
  // fall back to the resource fields — never wipe, never leave unmarked
  // in a retry loop: the resource-field application is the terminal
  // outcome for this delivery (a PayPal redelivery re-applies it
  // idempotently).
  try {
    const detail = (await getPayPalDispute(disputeId)) as Record<string, unknown>;
    const links = (detail.links ?? []) as { rel: string }[];
    const updated: Dispute = {
      ...existing,
      status: (detail.status as string) ?? existing.status,
      dispute_life_cycle_stage:
        (detail.dispute_life_cycle_stage as string) ?? existing.dispute_life_cycle_stage,
      dispute_state: (detail.dispute_state as string) ?? existing.dispute_state,
      allowed_actions: resolved
        ? []
        : links.length > 0
          ? links.map((l) => l.rel).filter((r) => r !== "self")
          : existing.allowed_actions,
      allowed_response_options:
        (detail.allowed_response_options as Dispute["allowed_response_options"]) ??
        existing.allowed_response_options,
      raw_paypal_detail: detail,
      ...(resolved ? { resolution } : {}),
    };
    upsertDispute(updated);
    markWebhookEvent(eventId);
    logWebhook({
      event_id: eventId,
      result: resolved ? "RESOLVED" : "UPDATED",
      detail:
        `Dispute ${disputeId} ${verb.toLowerCase()} from live Sandbox detail (status ${updated.status}).` +
        (resolved ? ` Final outcome: ${resolution!.outcome} at ${resolution!.resolved_at}; allowed_actions cleared, Execute locked.` : ""),
    });
    return { ok: true, dispute_id: disputeId, event_id: eventId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const updated: Dispute = {
      ...existing,
      ...patchFromResource(resource),
      ...(resolved ? { allowed_actions: [], resolution } : {}),
    };
    upsertDispute(updated);
    markWebhookEvent(eventId);
    logWebhook({
      event_id: eventId,
      result: resolved ? "RESOLVED_FETCH_FALLBACK" : "UPDATED_FETCH_FALLBACK",
      detail:
        `Live re-fetch failed (${message}); applied ${verb.toLowerCase()} resource fields only, nothing wiped.` +
        (resolved ? ` Final outcome: ${resolution!.outcome} at ${resolution!.resolved_at}; allowed_actions cleared, Execute locked.` : ""),
    });
    return { ok: true, dispute_id: disputeId, event_id: eventId };
  }
}

/**
 * Ingest a parsed webhook event that has ALREADY passed verification
 * (or is an explicit demo replay). Fetches live dispute detail when the
 * dispute is not a seeded demo row.
 *
 * CUSTOMER.DISPUTE.CREATED creates/refreshes the row from live detail.
 * CUSTOMER.DISPUTE.UPDATED refreshes status / stage / state / allowed
 * actions (best-effort live re-fetch for Sandbox rows, resource fields
 * only for seeded rows). CUSTOMER.DISPUTE.RESOLVED does the same and
 * additionally records the final outcome, clears allowed_actions (second
 * lock on Execute — the first is stageGate), and logs the audit time.
 * Updates NEVER wipe merchant-attached evidence, runs, or approvals:
 * only the Dispute row itself is replaced via upsertDispute, and the
 * artifact / run / approval maps are untouched. An update for an unknown
 * dispute never creates a row. Malformed events are ignored + logged,
 * never crash, never execute.
 */
export async function ingestVerifiedEvent(
  event: Record<string, unknown>,
  opts: { demo?: boolean } = {},
): Promise<IngestResult> {
  const eventId = (event.id as string | undefined) ?? "unknown-event";
  const eventType = (event.event_type as string | undefined) ?? "unknown";
  const rawResource = event.resource;
  const resource =
    (typeof rawResource === "object" && rawResource !== null
      ? rawResource
      : {}) as Record<string, unknown>;
  const disputeId = disputeIdFromResource(resource);

  if (seenWebhookEvent(eventId)) {
    logWebhook({ event_id: eventId, result: "DUPLICATE_IGNORED", detail: `event ${eventType} already processed; no second run.` });
    return { ok: true, ignored: "duplicate", event_id: eventId };
  }
  // NOTE (finding #4): the event is marked seen ONLY on a terminal,
  // non-retryable outcome below — never before the PayPal fetch. If
  // getPayPalDispute fails transiently, the event stays unmarked so a
  // PayPal redelivery / replay can retry it instead of being dropped
  // forever as a "duplicate".

  if (
    eventType === "CUSTOMER.DISPUTE.UPDATED" ||
    eventType === "CUSTOMER.DISPUTE.RESOLVED"
  ) {
    return handleDisputeUpdate(eventType, eventId, resource, disputeId, rawResource);
  }

  if (eventType !== "CUSTOMER.DISPUTE.CREATED") {
    markWebhookEvent(eventId);
    logWebhook({ event_id: eventId, result: "IGNORED_NOT_DISPUTE_CREATED", detail: `event_type ${eventType} is not handled.` });
    return { ok: true, ignored: "not a dispute-created event", event_id: eventId };
  }
  if (!disputeId) {
    markWebhookEvent(eventId);
    logWebhook({ event_id: eventId, result: "IGNORED_NO_DISPUTE_ID", detail: "resource carried no dispute_id." });
    return { ok: true, ignored: "no dispute id in resource", event_id: eventId };
  }

  const existing = getDispute(disputeId);
  if (existing && existing.source === "seeded") {
    // Demo replay of a seeded dispute: keep the seeded row, note the replay.
    markWebhookEvent(eventId);
    logWebhook({
      event_id: eventId,
      result: opts.demo ? "DEMO_REPLAY_SEEDED" : "INGESTED_SEEDED",
      detail: `Dispute ${disputeId} already present as a seeded (SIMULATED) row; no live fetch.`,
    });
    return { ok: true, dispute_id: disputeId, event_id: eventId };
  }

  // Live dispute: pull full detail from PayPal (HATEOAS links are the only
  // authority on allowed actions — Phase 0 row 4).
  try {
    const detail = (await getPayPalDispute(disputeId)) as Record<string, unknown>;
    const links = (detail.links ?? []) as { rel: string }[];
    const allowed = links.map((l) => l.rel).filter((r) => r !== "self");
    const d: Dispute = {
      id: disputeId,
      source: "sandbox",
      reason: (detail.reason as string) ?? "UNKNOWN",
      amount: (detail.dispute_amount as { currency_code: string; value: string }) ?? { currency_code: "USD", value: "0.00" },
      status: (detail.status as string) ?? "OPEN",
      dispute_life_cycle_stage: (detail.dispute_life_cycle_stage as string) ?? "INQUIRY",
      dispute_state: (detail.dispute_state as string) ?? "OPEN_INQUIRIES",
      allowed_actions: allowed,
      allowed_response_options: (detail.allowed_response_options as Dispute["allowed_response_options"]) ?? undefined,
      raw_paypal_detail: detail,
      created_at: (detail.create_time as string) ?? new Date().toISOString(),
    };
    upsertDispute(d);
    addArtifacts(artifactsFromDetail(disputeId, detail));
    markWebhookEvent(eventId);
    logWebhook({ event_id: eventId, result: "INGESTED", detail: `Dispute ${disputeId} stored from live Sandbox detail. Allowed actions: ${allowed.join(", ") || "(none yet)"}.` });
    return { ok: true, dispute_id: disputeId, event_id: eventId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // No markWebhookEvent here (finding #4): a transient fetch failure
    // must NOT lock the event out — PayPal redelivers, and the retry
    // must be able to run.
    logWebhook({ event_id: eventId, result: "INGEST_FAILED", detail: message });
    return { ok: false, dispute_id: disputeId, event_id: eventId };
  }
}
