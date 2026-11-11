// Part B unit checks — pre-concede evidence hold gate (workstream B).
// Pure-function checks for src/lib/evidence-hold.ts. Wired into the
// main suite by the coordinator; run standalone via a temp runner.
// `check` uses strict ===, so array/object values are asserted field
// by field, never by reference.

import {
  CHECKLIST_SLOTS,
  detectBareDisputeRisk,
  isBareConcede,
} from "../src/lib/evidence-hold";

export async function runPartBChecks(
  check: (name: string, expected: unknown, actual: unknown) => void,
): Promise<void> {
  // Items shape mirrors ChecklistItem keys scoreDispute produces.
  // Bare live dispute: only invoice/terms passed (15 pts) -> 4 empty slots.
  const bareItems = [
    { key: "tracking_delivered", passed: false },
    { key: "delivery_verifiable", passed: false },
    { key: "signature_confirmation", passed: false },
    { key: "merchant_log_post_delivery_use", passed: false },
    { key: "invoice_terms_consistent", passed: true },
  ];
  // Only 2 empty slots: tracking + delivery passed, signature + log + invoice passed... use 3 passed.
  const twoEmptyItems = [
    { key: "tracking_delivered", passed: true },
    { key: "delivery_verifiable", passed: true },
    { key: "signature_confirmation", passed: true },
    { key: "merchant_log_post_delivery_use", passed: false },
    { key: "invoice_terms_consistent", passed: false },
  ];

  // --- detectBareDisputeRisk: bare live dispute (score 34, 0 attachments) ---
  const bare = detectBareDisputeRisk({
    source: "sandbox",
    score: 34,
    attachedCount: 0,
    items: bareItems,
  });
  check("B#1 bare sandbox score 34 + 0 attachments isBare", true, bare.isBare);
  check(
    "B#2 bare missingChecklistPoints is 100-34",
    66,
    bare.missingChecklistPoints,
  );
  check("B#3 bare emptySlots has 4 entries", 4, bare.emptySlots.length);
  check(
    "B#4 empty slot 0 label tracking DELIVERED",
    "tracking DELIVERED",
    bare.emptySlots[0]?.label,
  );
  check("B#5 empty slot 0 points 30", 30, bare.emptySlots[0]?.points);
  check(
    "B#6 empty slot 1 label delivery verifiable",
    "delivery verifiable",
    bare.emptySlots[1]?.label,
  );
  check("B#7 empty slot 1 points 15", 15, bare.emptySlots[1]?.points);
  check(
    "B#8 empty slot 2 label signature",
    "signature",
    bare.emptySlots[2]?.label,
  );
  check("B#9 empty slot 2 points 15", 15, bare.emptySlots[2]?.points);
  check(
    "B#10 empty slot 3 label merchant log",
    "merchant log",
    bare.emptySlots[3]?.label,
  );
  check("B#11 empty slot 3 points 25", 25, bare.emptySlots[3]?.points);

  // --- Boundary: score 35 is NOT bare (threshold is <35) ---
  const at35 = detectBareDisputeRisk({
    source: "sandbox",
    score: 35,
    attachedCount: 0,
    items: bareItems,
  });
  check("B#12 score 35 -> no hold", false, at35.isBare);
  check("B#13 score 35 -> missing 0", 0, at35.missingChecklistPoints);

  // --- 1 attachment defeats the hold ---
  const oneAttached = detectBareDisputeRisk({
    source: "sandbox",
    score: 34,
    attachedCount: 1,
    items: bareItems,
  });
  check("B#14 score 34 + 1 attachment -> no hold", false, oneAttached.isBare);

  // --- Only 2 empty slots defeats the hold (>=3 required) ---
  const twoEmpty = detectBareDisputeRisk({
    source: "sandbox",
    score: 34,
    attachedCount: 0,
    items: twoEmptyItems,
  });
  check("B#15 score 34 + 2 empty slots -> no hold", false, twoEmpty.isBare);
  check("B#16 2-empty case still lists 2 slots", 2, twoEmpty.emptySlots.length);

  // --- Seeded source is never bare, even at score 0 ---
  const seeded = detectBareDisputeRisk({
    source: "seeded",
    score: 0,
    attachedCount: 0,
    items: bareItems,
  });
  check("B#17 seeded source score 0 -> no hold", false, seeded.isBare);
  check("B#18 seeded -> missing 0", 0, seeded.missingChecklistPoints);

  // --- Hold clears once attachments raise the score (helper level) ---
  const raised = detectBareDisputeRisk({
    source: "sandbox",
    score: 60,
    attachedCount: 2,
    items: [
      { key: "tracking_delivered", passed: true },
      { key: "delivery_verifiable", passed: true },
      { key: "signature_confirmation", passed: false },
      { key: "merchant_log_post_delivery_use", passed: false },
      { key: "invoice_terms_consistent", passed: true },
    ],
  });
  check("B#19 raised score 60 -> hold cleared", false, raised.isBare);

  // --- CHECKLIST_SLOTS invariant ---
  check("B#20 CHECKLIST_SLOTS has 5 entries", 5, CHECKLIST_SLOTS.length);

  // --- isBareConcede ---
  check(
    "B#21 isBareConcede accept-claim bare -> true",
    true,
    isBareConcede({
      source: "sandbox",
      score: 15,
      attachedCount: 0,
      action: "accept-claim",
    }),
  );
  check(
    "B#22 isBareConcede make-offer bare -> false",
    false,
    isBareConcede({
      source: "sandbox",
      score: 15,
      attachedCount: 0,
      action: "make-offer",
    }),
  );
  check(
    "B#23 isBareConcede non-bare score 40 -> false",
    false,
    isBareConcede({
      source: "sandbox",
      score: 40,
      attachedCount: 0,
      action: "accept-claim",
    }),
  );
  check(
    "B#24 isBareConcede seeded score 0 -> false",
    false,
    isBareConcede({
      source: "seeded",
      score: 0,
      attachedCount: 0,
      action: "accept-claim",
    }),
  );
  check(
    "B#25 isBareConcede bare + 1 attachment -> false",
    false,
    isBareConcede({
      source: "sandbox",
      score: 15,
      attachedCount: 1,
      action: "accept-claim",
    }),
  );
}
