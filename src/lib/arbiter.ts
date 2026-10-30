// Execution Arbiter helpers — brief §5.
// Stage gating + offer/accept type checks + downgrade resolution.
// The live PayPal response (links / allowed_response_options) is the only
// authority on what is allowed (Phase 0 row 4). Never force a disallowed call.

import { actionForVerdict } from "./scorer";
import type { Dispute, Verdict } from "./types";

/** Stage gate: actions open only when the dispute is waiting for the seller. */
export function stageGate(
  dispute: Dispute,
): { ok: true } | { ok: false; blocker: string } {
  if (dispute.status === "WAITING_FOR_SELLER_RESPONSE") return { ok: true };
  return {
    ok: false,
    blocker: `Dispute status is ${dispute.status} (stage ${dispute.dispute_life_cycle_stage}) — actions open only at WAITING_FOR_SELLER_RESPONSE.`,
  };
}

/** Offer/accept TYPE check against allowed_response_options.
 *  Returns an error string, or null when the type is allowed / unverifiable.
 *  "Cannot verify" (data absent) is not a refusal — the action check above
 *  is the gate; this only refuses a type the live response excludes. */
export function checkOfferAcceptTypes(
  dispute: Dispute,
  action: string,
): string | null {
  if (action === "make-offer") {
    const types = dispute.allowed_response_options?.make_offer?.offer_types;
    if (types && !types.includes("REFUND")) {
      return `offer type REFUND is not in allowed_response_options.make_offer.offer_types (${types.join(", ")})`;
    }
  }
  if (action === "accept-claim") {
    const types =
      dispute.allowed_response_options?.accept_claim?.accept_claim_types;
    if (types && !types.includes("REFUND")) {
      return `accept-claim type REFUND is not in allowed_response_options.accept_claim.accept_claim_types (${types.join(", ")})`;
    }
  }
  return null;
}

/** Downgrade resolution: if the verdict's action is not allowed, fall to
 *  the highest allowed action that fits (make-offer → send-message).
 *  If nothing fits, stop at AWAITING_APPROVAL with the blocker shown. */
export function resolveAction(
  dispute: Dispute,
  verdict: Verdict,
): {
  action: string | null;
  downgradedFrom: string | null;
  blocker: string | null;
} {
  const preferred = actionForVerdict(verdict);
  if (dispute.allowed_actions.includes(preferred)) {
    return { action: preferred, downgradedFrom: null, blocker: null };
  }
  for (const fallback of ["make-offer", "send-message"]) {
    if (dispute.allowed_actions.includes(fallback)) {
      return {
        action: fallback,
        downgradedFrom: preferred,
        blocker: `Verdict action ${preferred} is not allowed on this dispute; downgraded to ${fallback}.`,
      };
    }
  }
  return {
    action: null,
    downgradedFrom: preferred,
    blocker: `Verdict action ${preferred} is not allowed and no fallback action is available. Stopped at AWAITING_APPROVAL.`,
  };
}
