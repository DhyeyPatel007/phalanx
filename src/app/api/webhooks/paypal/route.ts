import { NextResponse } from "next/server";
import { ingestVerifiedEvent } from "@/lib/ingest";
import { logWebhook } from "@/lib/store";
import {
  paypalConfigured,
  verifyWebhookSignature,
  webhookConfigured,
} from "@/lib/paypal";

/**
 * POST /api/webhooks/paypal — PayPal webhook listener.
 * Reads the RAW body (required for signature verification), verifies via
 * PayPal's verify-webhook-signature endpoint, dedupes on event id.
 * Unverified or duplicate events are logged and ignored, never executed.
 * Always answers 200 quickly (PayPal retries up to 25x over 3 days on
 * non-2xx). If no webhook ID / credentials are configured, verification
 * cannot run — the event is logged as unverified and ignored (safe default).
 */
export async function POST(req: Request) {
  const raw = await req.text();
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    logWebhook({ event_id: "unparseable", result: "IGNORED_BAD_JSON", detail: "Request body was not valid JSON." });
    return NextResponse.json({ ok: true, ignored: "bad json" }, { status: 200 });
  }

  const eventId = (event.id as string | undefined) ?? "unknown-event";
  const eventType = (event.event_type as string | undefined) ?? "unknown";

  if (!webhookConfigured() || !paypalConfigured()) {
    logWebhook({
      event_id: eventId,
      result: "UNVERIFIED_NO_CONFIG",
      detail: `event ${eventType} ignored: PAYPAL_WEBHOOK_ID / credentials not configured, so signature verification cannot run. Configure env to enable live ingest.`,
    });
    return NextResponse.json(
      { ok: true, ignored: "unverified — webhook not configured" },
      { status: 200 },
    );
  }

  let verified = false;
  try {
    verified = await verifyWebhookSignature({
      auth_algo: req.headers.get("paypal-auth-algo") ?? "",
      cert_url: req.headers.get("paypal-cert-url") ?? "",
      transmission_id: req.headers.get("paypal-transmission-id") ?? "",
      transmission_sig: req.headers.get("paypal-transmission-sig") ?? "",
      transmission_time: req.headers.get("paypal-transmission-time") ?? "",
      webhook_event: event,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logWebhook({ event_id: eventId, result: "VERIFY_ERROR", detail: message });
    return NextResponse.json({ ok: true, ignored: "verification error" }, { status: 200 });
  }

  if (!verified) {
    logWebhook({ event_id: eventId, result: "UNVERIFIED_SIGNATURE", detail: `event ${eventType}: PayPal verification_status was not SUCCESS. Ignored.` });
    return NextResponse.json({ ok: true, ignored: "bad signature" }, { status: 200 });
  }

  const result = await ingestVerifiedEvent(event);
  return NextResponse.json(result, { status: 200 });
}
