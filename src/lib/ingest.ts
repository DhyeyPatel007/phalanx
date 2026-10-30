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
 * Ingest a parsed webhook event that has ALREADY passed verification
 * (or is an explicit demo replay). Fetches live dispute detail when the
 * dispute is not a seeded demo row.
 */
export async function ingestVerifiedEvent(
  event: Record<string, unknown>,
  opts: { demo?: boolean } = {},
): Promise<IngestResult> {
  const eventId = (event.id as string | undefined) ?? "unknown-event";
  const eventType = (event.event_type as string | undefined) ?? "unknown";
  const resource = (event.resource ?? {}) as Record<string, unknown>;
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
