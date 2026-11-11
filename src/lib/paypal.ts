// PayPal client — server only. OAuth2 client-credentials token, cached until
// expiry, Sandbox base https://api-m.sandbox.paypal.com. Refresh on 401 once,
// then fail loudly. No tokens, secrets, or buyer PII in logs (brief §6).
// Phase 0: endpoints verified against live Disputes v1 reference, Oct 30 2026.
// NOTE: no live Sandbox execution in this run — this client is used for
// list/detail + webhook verification only until Dhyey confirms Sandbox accounts.

const BASE = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";

/** Resolved PayPal base URL (Sandbox default). The execute gate refuses
 *  any base that is not a *.sandbox.paypal.com host — production is never
 *  callable from PHALANX. */
export function paypalBaseUrl(): string {
  return BASE;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export function paypalConfigured(): boolean {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET,
  );
}

export function webhookConfigured(): boolean {
  return Boolean(process.env.PAYPAL_WEBHOOK_ID);
}

async function fetchToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) {
    return cachedToken.token;
  }
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
        ).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`PayPal token request failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return cachedToken.token;
}

/**
 * Bounded timeout for pull-sync reads (live-sync fallback). The webhook
 * path never hangs a page, and the sync path must not either: pass
 * `timeoutMs` (AbortSignal.timeout) from list/detail reads used by the
 * ledger. Callers that do not pass it keep the previous behaviour
 * (no timeout) — the execute path is untouched.
 */
async function paypalFetch(
  path: string,
  init: RequestInit = {},
  retried = false,
  timeoutMs?: number,
): Promise<Response> {
  if (!paypalConfigured()) {
    throw new Error(
      "PayPal credentials not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET). Seeded demo works without them.",
    );
  }
  const token = await fetchToken();
  // Content-Type: only force application/json for non-FormData bodies.
  // A FormData body (provide-evidence multipart, Phase 0 row 2) must let
  // fetch auto-generate `multipart/form-data; boundary=...` — forcing
  // application/json here would corrupt the upload (400/415 from PayPal).
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${token}`,
  };
  if (!isFormData && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers,
    ...(timeoutMs !== undefined ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  });
  if (res.status === 401 && !retried) {
    cachedToken = null;
    return paypalFetch(path, init, true, timeoutMs);
  }
  return res;
}

/** GET /v1/customer/disputes — list disputes for the merchant account. */
export async function listPayPalDisputes(
  params?: Record<string, string>,
  timeoutMs?: number,
) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const res = await paypalFetch(`/v1/customer/disputes${qs}`, {}, false, timeoutMs);
  if (!res.ok) {
    throw new Error(
      `PayPal list disputes failed: HTTP ${res.status} (debug id: ${res.headers.get("paypal-debug-id") ?? "n/a"})`,
    );
  }
  return res.json();
}

/** GET /v1/customer/disputes/{id} — full detail incl. HATEOAS links +
 *  allowed_response_options. The live response is the only authority on
 *  which actions are allowed (Phase 0 row 4). */
export async function getPayPalDispute(id: string, timeoutMs?: number) {
  const res = await paypalFetch(
    `/v1/customer/disputes/${encodeURIComponent(id)}`,
    {},
    false,
    timeoutMs,
  );
  if (!res.ok) {
    throw new Error(
      `PayPal show dispute failed: HTTP ${res.status} (debug id: ${res.headers.get("paypal-debug-id") ?? "n/a"})`,
    );
  }
  return res.json();
}

export interface PayPalTrackingRecord {
  status?: string;
  carrier?: string;
  trackingNumber?: string;
  deliveryDate?: string;
}

/**
 * GET /v1/shipping/trackers/{transactionId} — PayPal Tracking API probe
 * (live-evidence workstream A).
 *
 * FAIL-SOFT by design: returns null on ANY failure — unconfigured
 * credentials, 404 / 403 / missing scope, timeout, malformed body — and
 * NEVER throws. Callers treat null as "no tracking known" and carry on
 * with the dispute detail alone; a live dispute's score never depends
 * on this call succeeding. NOTE: not live-verified yet — this VM has no
 * PayPal credentials, so the call path is verified structurally only
 * (unit tests) until Part D proves it against Sandbox.
 */
export async function getTrackingForTransaction(
  transactionId: string,
  timeoutMs = 5000,
): Promise<PayPalTrackingRecord | null> {
  try {
    if (!transactionId) return null;
    const res = await paypalFetch(
      `/v1/shipping/trackers/${encodeURIComponent(transactionId)}`,
      {},
      false,
      timeoutMs,
    );
    if (!res.ok) return null;
    const body: unknown = await res.json().catch(() => null);
    if (!body || typeof body !== "object") return null;
    // Shape varies: a single tracker object, or { trackers: [...] }.
    const raw = body as Record<string, unknown>;
    const first = Array.isArray(raw.trackers) ? raw.trackers[0] : raw;
    if (!first || typeof first !== "object") return null;
    const rec = first as Record<string, unknown>;
    const str = (v: unknown): string | undefined =>
      typeof v === "string" && v.length > 0 ? v : undefined;
    const status = str(rec.status);
    const carrier = str(rec.carrier);
    const trackingNumber =
      str(rec.tracking_number) ?? str(rec.trackingNumber) ?? str(rec.tracking_no);
    // Delivery date: known keys first, then any ISO-date string value in
    // the record (field names vary across PayPal's tracker shapes).
    let deliveryDate =
      str(rec.delivery_date) ??
      str(rec.delivered_date) ??
      str(rec.actual_delivery_date) ??
      str(rec.deliveryDate) ??
      str(rec.deliveredDate);
    if (!deliveryDate) {
      for (const v of Object.values(rec)) {
        if (typeof v === "string") {
          const m = v.match(/\d{4}-\d{2}-\d{2}/);
          if (m) {
            deliveryDate = m[0];
            break;
          }
        }
      }
    }
    if (!status && !carrier && !trackingNumber && !deliveryDate) return null;
    return { status, carrier, trackingNumber, deliveryDate };
  } catch {
    return null;
  }
}

export interface PayPalActionResult {
  ok: boolean;
  status: number;
  debugId: string | null;
  body: unknown;
}

async function actionResult(res: Response): Promise<PayPalActionResult> {
  const text = await res.text().catch(() => "");
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep raw text */
  }
  return {
    ok: res.ok,
    status: res.status,
    debugId: res.headers.get("paypal-debug-id"),
    body,
  };
}

/**
 * POST /v1/customer/disputes/{id}/provide-evidence — multipart (Phase 0
 * row 2): an `input` JSON part (evidences[] with evidence_type +
 * evidence_info) plus the PDF dossier as file part `file1`. The structured
 * evidences[] JSON is the primary payload; the PDF is the attachment.
 * Sandbox only — the execute gate refuses non-sandbox base URLs first.
 */
export async function provideEvidence(
  disputeId: string,
  evidences: Array<{
    evidence_type: string;
    evidence_info?: Record<string, unknown>;
  }>,
  pdfBytes: Uint8Array,
): Promise<PayPalActionResult> {
  const form = new FormData();
  form.append("input", JSON.stringify({ evidences }));
  form.append(
    "file1",
    new Blob([pdfBytes as unknown as BlobPart], {
      type: "application/pdf",
    }),
    `phalanx-dossier-${disputeId}.pdf`,
  );
  const res = await paypalFetch(
    `/v1/customer/disputes/${encodeURIComponent(disputeId)}/provide-evidence`,
    { method: "POST", body: form },
  );
  return actionResult(res);
}

/** POST /v1/customer/disputes/{id}/make-offer — partial refund offer.
 *  offer_type REFUND: buyer keeps the item. */
export async function makeOffer(
  disputeId: string,
  offerAmount: { currency_code: string; value: string },
  note?: string,
): Promise<PayPalActionResult> {
  const res = await paypalFetch(
    `/v1/customer/disputes/${encodeURIComponent(disputeId)}/make-offer`,
    {
      method: "POST",
      body: JSON.stringify({
        offer_type: "REFUND",
        offer_amount: offerAmount,
        ...(note ? { note } : {}),
      }),
    },
  );
  return actionResult(res);
}

/** POST /v1/customer/disputes/{id}/accept-claim — accept the claim.
 *  accept_claim_type comes from the dispute's allowed_response_options
 *  (REFUND is the only type the arbiter ever approves). */
export async function acceptClaim(
  disputeId: string,
  acceptClaimType: string,
  note?: string,
): Promise<PayPalActionResult> {
  const res = await paypalFetch(
    `/v1/customer/disputes/${encodeURIComponent(disputeId)}/accept-claim`,
    {
      method: "POST",
      body: JSON.stringify({
        accept_claim_type: acceptClaimType,
        ...(note ? { note } : {}),
      }),
    },
  );
  return actionResult(res);
}

export interface WebhookVerificationInput {
  auth_algo: string;
  cert_url: string;
  transmission_id: string;
  transmission_sig: string;
  transmission_time: string;
  webhook_event: unknown;
}

/**
 * POST /v1/notifications/verify-webhook-signature — PayPal verifies the
 * signature for us (Phase 0 row 5). Returns true only when PayPal says
 * verification_status === "SUCCESS". Mock/simulator events are not
 * supported by this endpoint — they must use the demo replay path instead.
 */
export async function verifyWebhookSignature(
  input: WebhookVerificationInput,
): Promise<boolean> {
  if (!webhookConfigured()) {
    throw new Error(
      "PAYPAL_WEBHOOK_ID not configured — cannot verify webhook signature.",
    );
  }
  const res = await paypalFetch("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: JSON.stringify({ ...input, webhook_id: process.env.PAYPAL_WEBHOOK_ID }),
  });
  if (!res.ok) {
    throw new Error(
      `PayPal verify-webhook-signature failed: HTTP ${res.status}`,
    );
  }
  const body = (await res.json()) as { verification_status?: string };
  return body.verification_status === "SUCCESS";
}
