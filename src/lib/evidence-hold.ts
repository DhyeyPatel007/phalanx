// Pre-concede evidence hold gate (live-evidence fix, workstream B).
// A bare live (Sandbox) PayPal dispute arrives with only the invoice slot
// (15 pts) and zero attached evidence, so the deterministic checklist
// scores it 15 -> CONCEDE and the merchant would authorize a full refund
// without ever being asked whether tracking / delivery proof / a
// fulfillment log exists. This helper flags that state so the detail API
// can warn, the detail page can banner + require an explicit
// "no evidence exists" confirmation, and the approve route can enforce
// it server-side. Applies to LIVE disputes only (source === "sandbox");
// seeded demo cases keep current behavior.

export interface EmptySlot {
  key: string;
  label: string;
  points: number;
}

export const CHECKLIST_SLOTS: EmptySlot[] = [
  { key: "tracking_delivered", label: "tracking DELIVERED", points: 30 },
  { key: "delivery_verifiable", label: "delivery verifiable", points: 15 },
  { key: "signature_confirmation", label: "signature", points: 15 },
  {
    key: "merchant_log_post_delivery_use",
    label: "merchant log",
    points: 25,
  },
  { key: "invoice_terms_consistent", label: "invoice/terms", points: 15 },
];

export function detectBareDisputeRisk(input: {
  source: string;
  score: number;
  attachedCount: number;
  items: { key: string; passed: boolean }[];
}): {
  isBare: boolean;
  missingChecklistPoints: number;
  emptySlots: EmptySlot[];
} {
  const passedKeys = new Set(
    input.items.filter((i) => i.passed).map((i) => i.key),
  );
  const emptySlots = CHECKLIST_SLOTS.filter((s) => !passedKeys.has(s.key));
  const isBare =
    input.source === "sandbox" &&
    input.score < 35 &&
    input.attachedCount === 0 &&
    emptySlots.length >= 3;
  return {
    isBare,
    missingChecklistPoints: isBare ? 100 - input.score : 0,
    emptySlots,
  };
}

export function isBareConcede(input: {
  source: string;
  score: number;
  attachedCount: number;
  action: string;
}): boolean {
  return (
    input.source === "sandbox" &&
    input.score < 35 &&
    input.attachedCount === 0 &&
    input.action === "accept-claim"
  );
}
