// Webhook ingest — shared by POST /api/webhooks/paypal (live, verified)
// and POST /api/demo/replay-webhook (demo-only, clearly labelled, no
// signature verification — it never touches PayPal).
// Rules (brief §6): read RAW body, verify signature, return 200 quickly,
// dedupe on event/dispute ID. Unverified or duplicate events are logged
// and ignored, never executed.

import {
  addArtifacts,
  getArtifacts,
  getDispute,
  logWebhook,
  markWebhookEvent,
  seenWebhookEvent,
  upsertDispute,
} from "./store";
import {
  getPayPalDispute,
  getTrackingForTransaction,
  listPayPalDisputes,
  paypalConfigured,
} from "./paypal";
import type { PayPalTrackingRecord } from "./paypal";
import type { Dispute, EvidenceArtifact } from "./types";

/** Bounded per-request timeout for pull-sync reads (live-sync fallback).
 *  The ledger must never hang because PayPal is slow or down. */
const LIVE_SYNC_TIMEOUT_MS = 10_000;
/** Cap on detail fetches per list sync — a pathological merchant ledger
 *  must not turn one page load into dozens of sequential PayPal calls. */
const LIVE_SYNC_MAX_DETAIL_FETCHES = 20;

export interface IngestResult {
  ok: boolean;
  ignored?: string;
  dispute_id?: string;
  event_id?: string;
}

/**
 * Normalize a PayPal HATEOAS link rel to PHALANX's action name.
 * PayPal returns rels snake_case (accept_claim, provide_evidence,
 * make_offer, send_message); PHALANX's action names are kebab-case
 * (accept-claim, provide-evidence, make-offer) everywhere — the approve
 * route, the execute gate, and the arbiter all compare with
 * `.includes(action)` on kebab-case. A live row stored with snake_case
 * actions can never be approved or executed (verified live Nov 11, 2026:
 * all three real Sandbox disputes refused approve with "action
 * accept-claim is not allowed"). Normalize at ingest, in every path
 * that builds allowed_actions from PayPal links.
 * NOTE: allowed_response_options keys stay snake_case — the arbiter
 * reads them as `.make_offer` / `.accept_claim`. Only the rel values
 * are normalized, never the options keys.
 */
function normalizeActionRel(rel: string): string {
  return rel.replace(/_/g, "-");
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
 * Derive a tracking artifact from a PayPal Tracking API record — pure,
 * unit-testable. Only a DELIVERED record with a carrier + tracking
 * number becomes an artifact; anything else (in transit, missing
 * carrier/number, null record) yields null and is never invented.
 * The summary states exactly what PayPal reported, in the same literal
 * style scoreDispute matches on (DELIVERED + carrier + ISO date).
 */
export function trackingArtifactFromRecord(
  disputeId: string,
  record: PayPalTrackingRecord | null | undefined,
): EvidenceArtifact | null {
  if (!record) return null;
  if (typeof record.status !== "string" || record.status.toLowerCase() !== "delivered") {
    return null;
  }
  if (!record.carrier || !record.trackingNumber) return null;
  return {
    id: `${disputeId}-tracking-paypal`,
    dispute_id: disputeId,
    kind: "tracking",
    source: "paypal-tracking",
    summary:
      `Carrier ${record.carrier} tracking ${record.trackingNumber} — DELIVERED` +
      (record.deliveryDate ? ` on ${record.deliveryDate}` : ""),
    simulated: false,
  };
}

/** Timeout for the best-effort Tracking API probe inside ingest. */
const TRACKING_PROBE_TIMEOUT_MS = 5000;

/**
 * Best-effort Tracking API probe for one live dispute detail: fetch the
 * tracker for the detail's seller_transaction_id and, when PayPal
 * reports DELIVERED with carrier + tracking number, add the single
 * paypal-tracking artifact (addArtifacts dedupes by id, so this is
 * idempotent). NEVER throws and never blocks ingest: unconfigured
 * credentials, 404/403, timeout, or any other failure silently means
 * "no tracking known" and the dispute keeps its detail-derived invoice
 * artifact only. Skips the fetch when the artifact already exists.
 */
async function maybeAddTrackingArtifact(
  disputeId: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    if (getArtifacts(disputeId).some((a) => a.id === `${disputeId}-tracking-paypal`)) {
      return;
    }
    const txs = detail.disputed_transactions;
    if (!Array.isArray(txs) || txs.length === 0) return;
    const first = txs[0];
    if (typeof first !== "object" || first === null) return;
    const tx = first as Record<string, unknown>;
    const sellerTx =
      (tx.seller_transaction_id as string | undefined) ??
      (tx.buyer_transaction_id as string | undefined);
    if (!sellerTx) return;
    const record = await getTrackingForTransaction(sellerTx, TRACKING_PROBE_TIMEOUT_MS);
    const artifact = trackingArtifactFromRecord(disputeId, record);
    if (artifact) addArtifacts([artifact]);
  } catch {
    // Fail-soft: tracking is a bonus, never a reason to break ingest.
  }
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
      .filter((r): r is string => typeof r === "string" && r !== "self")
      .map(normalizeActionRel);
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
          ? links.map((l) => l.rel).filter((r) => r !== "self").map(normalizeActionRel)
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
    const allowed = links.map((l) => l.rel).filter((r) => r !== "self").map(normalizeActionRel);
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
    await maybeAddTrackingArtifact(disputeId, detail);
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

// ---------------------------------------------------------------------------
// Live-sync fallback (pull, not push).
//
// The webhook path is the primary ingestion route, but in Sandbox PayPal
// has recorded ZERO CUSTOMER.DISPUTE.CREATED deliveries for real disputes
// against the app's merchant (verified Nov 11, 2026 — webhook subscribed
// and correct, no events in 30 days), so live disputes never reach the
// in-memory store. This fallback pulls them over the authenticated
// server-to-server REST API instead. A dispute fetched this way IS
// verified: the OAuth2 client-credentials token acts as the app's own
// Sandbox merchant, and the detail comes straight from PayPal — no
// webhook signature is involved or needed.
//
// Rules: never throw, never wipe. A re-ingest updates ONLY the live
// status fields (status / stage / state / allowed actions / options /
// raw detail) from the fresh detail — merchant-attached evidence, runs,
// and approvals live in separate maps and are untouched. A detail for a
// seeded (SIMULATED) id is refused, exactly like the webhook path.
// ---------------------------------------------------------------------------

export interface LiveIngestResult extends IngestResult {
  /** True when the call created a new store row (false = refresh of an
   *  existing sandbox row, or a refusal). */
  created?: boolean;
}

/** Build a sandbox Dispute row from a PayPal detail object. Returns null
 *  when the detail is malformed (no string id). */
function disputeFromDetail(detail: Record<string, unknown>): Dispute | null {
  const id =
    (detail.dispute_id as string | undefined) ??
    (detail.id as string | undefined);
  if (typeof id !== "string" || id.length === 0) return null;
  const links = (detail.links ?? []) as { rel?: unknown }[];
  const allowed = links
    .map((l) => l.rel)
    .filter((r): r is string => typeof r === "string" && r !== "self")
    .map(normalizeActionRel);
  return {
    id,
    source: "sandbox",
    reason: (detail.reason as string) ?? "UNKNOWN",
    amount: (detail.dispute_amount as { currency_code: string; value: string }) ?? {
      currency_code: "USD",
      value: "0.00",
    },
    status: (detail.status as string) ?? "OPEN",
    dispute_life_cycle_stage: (detail.dispute_life_cycle_stage as string) ?? "INQUIRY",
    dispute_state: (detail.dispute_state as string) ?? "OPEN_INQUIRIES",
    allowed_actions: allowed,
    allowed_response_options: (detail.allowed_response_options as Dispute["allowed_response_options"]) ?? undefined,
    raw_paypal_detail: detail,
    created_at: (detail.create_time as string) ?? new Date().toISOString(),
  };
}

/**
 * Ingest one PayPal dispute detail object (as returned by
 * getPayPalDispute) into the store as a live `sandbox` row. Pure w.r.t.
 * the network — the caller supplies the detail, so this is unit-testable
 * with a fabricated detail. Dedupe on dispute id; a re-ingest refreshes
 * only live status fields and never wipes attached evidence, runs, or
 * approvals. Never throws.
 */
export function ingestPayPalDispute(detail: unknown): LiveIngestResult {
  try {
    if (!detail || typeof detail !== "object") {
      return { ok: false, ignored: "malformed detail: not an object" };
    }
    const row = disputeFromDetail(detail as Record<string, unknown>);
    if (!row) {
      return { ok: false, ignored: "malformed detail: no dispute id" };
    }
    const existing = getDispute(row.id);
    if (existing && existing.source === "seeded") {
      return {
        ok: true,
        ignored: "seeded row",
        dispute_id: row.id,
        created: false,
      };
    }
    if (existing) {
      // Refresh: live status fields only, from fields actually present.
      // Absent fields keep their stored values (same rule as
      // patchFromResource on the webhook path).
      const updated: Dispute = {
        ...existing,
        status:
          (detail as Record<string, unknown>).status !== undefined
            ? row.status
            : existing.status,
        dispute_life_cycle_stage:
          (detail as Record<string, unknown>).dispute_life_cycle_stage !== undefined
            ? row.dispute_life_cycle_stage
            : existing.dispute_life_cycle_stage,
        dispute_state:
          (detail as Record<string, unknown>).dispute_state !== undefined
            ? row.dispute_state
            : existing.dispute_state,
        allowed_actions:
          row.allowed_actions.length > 0 ? row.allowed_actions : existing.allowed_actions,
        allowed_response_options:
          row.allowed_response_options ?? existing.allowed_response_options,
        raw_paypal_detail: row.raw_paypal_detail,
      };
      upsertDispute(updated);
      addArtifacts(artifactsFromDetail(row.id, detail as Record<string, unknown>));
      return { ok: true, dispute_id: row.id, created: false };
    }
    upsertDispute(row);
    addArtifacts(artifactsFromDetail(row.id, detail as Record<string, unknown>));
    return { ok: true, dispute_id: row.id, created: true };
  } catch (err) {
    return {
      ok: false,
      ignored: `ingest failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Return the stored dispute if present; otherwise — only when PayPal is
 * configured — fetch it from PayPal and ingest it. Fail-soft: any
 * failure (not configured, PayPal 404, timeout, malformed detail) logs
 * nothing to the user and returns null, never throws.
 */
export async function ensureLiveDispute(id: string): Promise<Dispute | null> {
  const existing = getDispute(id);
  if (existing) return existing;
  if (!paypalConfigured()) return null;
  try {
    const detail = (await getPayPalDispute(id, LIVE_SYNC_TIMEOUT_MS)) as Record<string, unknown>;
    const res = ingestPayPalDispute(detail);
    if (!res.ok || !res.dispute_id) return null;
    await maybeAddTrackingArtifact(res.dispute_id, detail);
    return getDispute(res.dispute_id) ?? null;
  } catch {
    return null;
  }
}

export interface LiveSyncResult {
  /** Ids newly ingested into the store by this sync. */
  added: string[];
  /** Ids already present in the store. Sandbox rows are re-fetched for
   *  a status/actions refresh (see below); seeded rows are left alone. */
  alreadyPresent: string[];
  /** Non-null when the PayPal list call failed (or PayPal is not
   *  configured — in which case this is null and added is empty, i.e.
   *  the caller keeps the seeded-only behaviour). */
  liveError: string | null;
}

/**
 * Pull-sync: list live disputes from PayPal and ingest every id missing
 * from the store (full detail fetch per missing id, bounded). Ids already
 * stored as sandbox rows are ALSO re-fetched (bounded by the same cap)
 * so status / allowed actions refresh — the webhook path is the nominal
 * refresh route, but in Sandbox PayPal has delivered zero dispute events
 * for this app, so without a sync refresh a stored live row would go
 * stale forever (e.g. after an Execute changes its PayPal status).
 * Seeded rows are never re-fetched. Fail-soft: a list/fetch failure
 * returns liveError and an empty `added` list; the caller keeps serving
 * seeded rows.
 */
export async function syncLiveDisputes(): Promise<LiveSyncResult> {
  const empty: LiveSyncResult = { added: [], alreadyPresent: [], liveError: null };
  if (!paypalConfigured()) return empty;
  let listed: { items?: unknown[] };
  try {
    listed = (await listPayPalDisputes({}, LIVE_SYNC_TIMEOUT_MS)) as {
      items?: unknown[];
    };
  } catch (err) {
    return {
      ...empty,
      liveError: err instanceof Error ? err.message : String(err),
    };
  }
  const items = Array.isArray(listed.items) ? listed.items : [];
  const added: string[] = [];
  const alreadyPresent: string[] = [];
  let fetched = 0;
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const it = item as Record<string, unknown>;
    const id =
      (it.dispute_id as string | undefined) ?? (it.id as string | undefined);
    if (typeof id !== "string" || id.length === 0) continue;
    const existing = getDispute(id);
    if (existing && existing.source !== "sandbox") {
      // Seeded row: never re-fetched, never overwritten.
      alreadyPresent.push(id);
      continue;
    }
    if (fetched >= LIVE_SYNC_MAX_DETAIL_FETCHES) {
      if (existing) alreadyPresent.push(id);
      continue;
    }
    fetched += 1;
    try {
      const detail = (await getPayPalDispute(id, LIVE_SYNC_TIMEOUT_MS)) as Record<string, unknown>;
      const res = ingestPayPalDispute(detail);
      if (res.ok && res.dispute_id) await maybeAddTrackingArtifact(res.dispute_id, detail);
      if (res.ok && res.created && res.dispute_id) added.push(res.dispute_id);
      else if (existing) alreadyPresent.push(id);
    } catch {
      // One bad detail must not abort the sync of the rest.
      if (existing) alreadyPresent.push(id);
      continue;
    }
  }
  return { added, alreadyPresent, liveError: null };
}
