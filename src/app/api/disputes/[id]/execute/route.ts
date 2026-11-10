import { NextResponse } from "next/server";
import {
  getApproval,
  getArtifacts,
  getAttachedEvidence,
  getDispute,
  getExecution,
  latestRun,
  setExecution,
} from "@/lib/store";
import {
  acceptClaim,
  getPayPalDispute,
  makeOffer,
  paypalBaseUrl,
  paypalConfigured,
  provideEvidence,
} from "@/lib/paypal";
import { buildProvideEvidenceInput, decideExecute } from "@/lib/execute-gate";
import { pickAcceptClaimType } from "@/lib/arbiter";
import { buildEvidencePdf } from "@/lib/pdf";
import { computeOfferAmount } from "@/lib/scorer";

/**
 * POST /api/disputes/{id}/execute — executes the approved action once.
 *
 * SANDBOX ONLY. The gate (src/lib/execute-gate.ts, pure + unit-checked)
 * refuses in this order, before any network call: no approval (403),
 * stage blocked (409), disallowed action (409), offer/accept type
 * mismatch (409), action mismatch (409), duplicate execution (409),
 * stale approval (409), seeded dispute (409, logged refusal — never
 * calls PayPal for SIMULATED rows), non-sandbox base URL (409),
 * PayPal not configured (409). Only a gated sandbox dispute reaches the
 * live PayPal call below (provide-evidence / make-offer / accept-claim),
 * with idempotency key = dispute ID + approved action + approval ID.
 * A failed PayPal call records FAILED (not EXECUTED) so a retry is
 * possible; a 2xx records EXECUTED with the PayPal debug id and a
 * best-effort follow-up dispute status.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dispute = getDispute(id);
  if (!dispute) {
    return NextResponse.json({ error: "dispute not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const approval = getApproval(id);
  const decision = decideExecute({
    dispute,
    approval: approval ?? null,
    existingExecution: getExecution(id) ?? null,
    latestRun: latestRun(id) ?? null,
    requestedAction: body.action,
    paypalBaseUrl: paypalBaseUrl(),
    paypalConfigured: paypalConfigured(),
  });

  if (!decision.ok) {
    console.warn(
      `[PHALANX] EXECUTE REFUSED ${id}: ${decision.error} — ${decision.detail}`,
    );
    // Seeded refusal: record the NOT_EXECUTED record (idempotency key)
    // exactly as before, so the refusal is auditable in the ledger.
    if (decision.error === "LIVE_EXECUTION_NOT_ENABLED" && approval) {
      const record = {
        dispute_id: id,
        approved_action: approval.action,
        approved_by: approval.approved_by,
        approved_at: approval.approved_at,
        paypal_status: "NOT_EXECUTED",
        paypal_debug_id: null,
        idempotency_key: `${id}:${approval.action}:${approval.id}`,
        follow_up_detail_status: null,
        note: decision.detail,
      };
      setExecution(record);
      return NextResponse.json(
        { error: decision.error, detail: decision.detail, record },
        { status: decision.status },
      );
    }
    return NextResponse.json(
      {
        error: decision.error,
        detail: decision.detail,
        ...(decision.allowed_actions
          ? { allowed_actions: decision.allowed_actions }
          : {}),
        ...(decision.allowed_response_options
          ? { allowed_response_options: decision.allowed_response_options }
          : {}),
      },
      { status: decision.status },
    );
  }

  // Gate passed — approval is non-null here by construction.
  const approved = approval!;
  const run = latestRun(id);
  const idempotencyKey = `${id}:${approved.action}:${approved.id}`;
  const note = `PHALANX swarm execution (approved by ${approved.approved_by} at ${approved.approved_at}).`;

  try {
    let result: {
      ok: boolean;
      status: number;
      debugId: string | null;
      body?: unknown;
    };
    if (approved.action === "provide-evidence") {
      const artifacts = getArtifacts(id);
      const attached = getAttachedEvidence(id);
      const pdfBytes = await buildEvidencePdf(
        dispute,
        artifacts,
        run ?? null,
        attached,
      );
      const { evidences } = buildProvideEvidenceInput(dispute, artifacts);
      result = await provideEvidence(id, evidences, pdfBytes);
    } else if (approved.action === "make-offer") {
      const offerAmount =
        approved.offer_amount ??
        (run
          ? {
              currency_code: dispute.amount.currency_code,
              value: computeOfferAmount(
                run.score,
                parseFloat(dispute.amount.value),
              ).offerUsd.toFixed(2),
            }
          : null);
      if (!offerAmount) {
        return NextResponse.json(
          {
            error: "OFFER_AMOUNT_MISSING",
            detail: "Execute refused: no offer amount on the approval.",
          },
          { status: 409 },
        );
      }
      result = await makeOffer(id, offerAmount, note);
    } else if (approved.action === "accept-claim") {
      const types =
        dispute.allowed_response_options?.accept_claim?.accept_claim_types;
      // Never send types[0] blindly: PARTIAL_REFUND needs a
      // refund_amount we do not send (PayPal rejects it with
      // INVALID_ACCEPT_CLAIM_TYPE). Prefer REFUND, no extra fields.
      const claimType = pickAcceptClaimType(types);
      result = await acceptClaim(id, claimType, note);
    } else {
      return NextResponse.json(
        {
          error: "DISALLOWED_ACTION",
          detail: `Execute refused: approved action (${approved.action}) is not a supported PayPal execution action.`,
          allowed_actions: dispute.allowed_actions,
        },
        { status: 409 },
      );
    }

    if (!result.ok) {
      // Surface PayPal's own error body (name / message / details) —
      // the HTTP status alone never explains a 400 (e.g. a claim type
      // the dispute does not support, or an action not permitted in
      // the current life-cycle stage). Keep it in the record note and
      // the response so the merchant — and the audit log — see why.
      const paypalBody =
        typeof result.body === "object" && result.body !== null
          ? (result.body as Record<string, unknown>)
          : null;
      const paypalMessage =
        (typeof paypalBody?.message === "string" ? paypalBody.message : null) ??
        (typeof paypalBody?.name === "string" ? paypalBody.name : null) ??
        null;
      const record = {
        dispute_id: id,
        approved_action: approved.action,
        approved_by: approved.approved_by,
        approved_at: approved.approved_at,
        paypal_status: "FAILED",
        paypal_debug_id: result.debugId,
        idempotency_key: idempotencyKey,
        follow_up_detail_status: null,
        note: `PayPal Sandbox rejected the ${approved.action} call: HTTP ${result.status} (debug id: ${result.debugId ?? "n/a"})${paypalMessage ? ` — ${paypalMessage}` : ""}. Not marked EXECUTED — retry is possible.`,
      };
      setExecution(record);
      console.warn(
        `[PHALANX] EXECUTE FAILED ${id}: PayPal HTTP ${result.status} (debug id: ${result.debugId ?? "n/a"}). Body: ${JSON.stringify(result.body ?? null)}`,
      );
      return NextResponse.json(
        {
          error: "PAYPAL_EXECUTION_FAILED",
          detail: record.note,
          debug_id: result.debugId,
          paypal_error: result.body ?? null,
          record,
        },
        { status: 502 },
      );
    }

    // Success: best-effort re-fetch for the follow-up dispute status.
    // A re-fetch failure never turns a successful execution into an error.
    let followUp: string | null = null;
    try {
      const detail = (await getPayPalDispute(id)) as Record<string, unknown>;
      followUp =
        typeof detail.status === "string" ? detail.status : null;
    } catch {
      followUp = null;
    }
    const record = {
      dispute_id: id,
      approved_action: approved.action,
      approved_by: approved.approved_by,
      approved_at: approved.approved_at,
      paypal_status: "EXECUTED",
      paypal_debug_id: result.debugId,
      idempotency_key: idempotencyKey,
      follow_up_detail_status: followUp,
      note: `Executed ${approved.action} on PayPal Sandbox (debug id: ${result.debugId ?? "n/a"}).`,
    };
    setExecution(record);
    return NextResponse.json({
      ok: true,
      paypal_status: "EXECUTED",
      debug_id: result.debugId,
      follow_up_detail_status: followUp,
      record,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const record = {
      dispute_id: id,
      approved_action: approved.action,
      approved_by: approved.approved_by,
      approved_at: approved.approved_at,
      paypal_status: "FAILED",
      paypal_debug_id: null,
      idempotency_key: idempotencyKey,
      follow_up_detail_status: null,
      note: `PayPal Sandbox call failed before a response: ${message}. Not marked EXECUTED — retry is possible.`,
    };
    setExecution(record);
    console.warn(`[PHALANX] EXECUTE FAILED ${id}: ${message}`);
    return NextResponse.json(
      {
        error: "PAYPAL_EXECUTION_FAILED",
        detail: record.note,
        record,
      },
      { status: 502 },
    );
  }
}
