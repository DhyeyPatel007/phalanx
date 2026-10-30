// PHALANX unit checks — pure-function regression tests for the Gemini
// audit fixes (Oct 30, 2026). Run with:
//   rm -rf /tmp/phalanx-unit && npx tsc scripts/unit-checks.ts --ignoreConfig \
//     --module commonjs --target es2022 --moduleResolution bundler \
//     --esModuleInterop --skipLibCheck --outDir /tmp/phalanx-unit \
//     && NODE_PATH=$PWD/node_modules node /tmp/phalanx-unit/scripts/unit-checks.js
// (The --ignoreConfig + bundler flags are needed because the project
// tsconfig is Next-oriented; type errors about node globals in this
// standalone compile are expected and do not block emit.)
// Exits non-zero on any failure. No server, no live PayPal calls.

import { PDFDocument } from "pdf-lib";
import { artifactsFromDetail } from "../src/lib/ingest";
import { artifactsForPdf, buildEvidencePdf, evidenceTypesFor } from "../src/lib/pdf";
import { evDisplay, scoreDispute } from "../src/lib/scorer";
import type { Dispute, EvidenceArtifact, SwarmRun } from "../src/lib/types";

let failures = 0;
let count = 0;

function check(name: string, expected: unknown, actual: unknown): void {
  count += 1;
  const pass = expected === actual;
  if (!pass) failures += 1;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name} — expected ${String(expected)}, got ${String(actual)}`);
}

function artifact(
  id: string,
  kind: EvidenceArtifact["kind"],
  summary: string,
): EvidenceArtifact {
  return {
    id,
    dispute_id: "PP-D-TEST",
    kind,
    source: "merchant-test",
    summary,
    simulated: true,
  };
}

function dispute(partial: Partial<Dispute> & { id: string }): Dispute {
  return {
    source: "seeded",
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    amount: { currency_code: "USD", value: "100.00" },
    status: "WAITING_FOR_SELLER_RESPONSE",
    dispute_life_cycle_stage: "INQUIRY",
    dispute_state: "REQUIRED_ACTION",
    allowed_actions: ["provide-evidence", "accept-claim", "send-message"],
    allowed_response_options: {
      accept_claim: { accept_claim_types: ["REFUND"] },
    },
    raw_paypal_detail: null,
    created_at: new Date().toISOString(),
    ...partial,
  };
}

// ---- #4: scorer negation guards ----
{
  const neg = dispute({ id: "PP-D-TEST" });
  const r1 = scoreDispute(neg, [
    artifact("t1", "tracking", "FEDEX 123456789, NOT DELIVERED"),
  ]);
  check("#4 NOT DELIVERED scores 0 for tracking_delivered", false, r1.items[0].passed);
  check("#4 NOT DELIVERED scores 0 for delivery_verifiable", false, r1.items[1].passed);

  const r2 = scoreDispute(neg, [
    artifact("t2", "tracking", "STATUS: UNDELIVERED"),
  ]);
  check("#4 UNDELIVERED scores 0 for tracking_delivered", false, r2.items[0].passed);

  const r3 = scoreDispute(neg, [
    artifact("t3", "tracking", "FEDEX 123456789, delivered 2026-10-26, NO SIGNATURE on file"),
  ]);
  check("#4 NO SIGNATURE scores 0 for signature", false, r3.items[2].passed);

  const r4 = scoreDispute(neg, [
    artifact(
      "t4",
      "tracking",
      "FEDEX 123456789, DELIVERED to PayPal transaction address, delivered 2026-10-26, signed for by buyer",
    ),
  ]);
  check("#4 positive DELIVERED still scores 30", true, r4.items[0].passed);
  check("#4 positive DELIVERED still verifiable (+15)", true, r4.items[1].passed);
  check("#4 positive signed still scores 15", true, r4.items[2].passed);
  check("#4 positive control total is 60", 60, r4.score);
}

// ---- #5: stage-aware concede fee ----
{
  check("#5 INQUIRY concede_cost is amount only ($480)", 480, evDisplay(85, 480, undefined, "INQUIRY").concede_cost);
  check("#5 INQUIRY concede_cost is amount only ($95)", 95, evDisplay(0, 95, undefined, "INQUIRY").concede_cost);
  check("#5 CLAIM concede_cost adds $15 ($210)", 225, evDisplay(60, 210, undefined, "CLAIM").concede_cost);
  check("#5 default stage is CLAIM ($210)", 225, evDisplay(60, 210).concede_cost);
  check("#5 fee_basis states the INQUIRY waiver", true, evDisplay(60, 210, undefined, "INQUIRY").fee_basis.includes("Waived when resolved directly"));
}

// ---- #2: evidenceTypesFor — live evidences first, seed fallback ----
{
  const live = dispute({
    id: "PP-D-LIVE",
    source: "sandbox",
    raw_paypal_detail: {
      evidences: [
        { evidence_type: "PROOF_OF_REFUND", source: "REQUESTED_FROM_SELLER" },
        { evidence_type: "OTHER", source: "REQUESTED_FROM_BUYER" },
        { evidence_type: "PROOF_OF_FULFILLMENT", source: "REQUESTED_FROM_SELLER" },
      ],
    },
  });
  check("#2 live evidences read from raw_paypal_detail", "PROOF_OF_REFUND,PROOF_OF_FULFILLMENT", evidenceTypesFor(live, "provide-evidence").join(","));

  const seedA = dispute({ id: "PP-D-88412" });
  check("#2 seeded A fallback is PROOF_OF_FULFILLMENT", "PROOF_OF_FULFILLMENT", evidenceTypesFor(seedA, "provide-evidence").join(","));
  const seedB = dispute({ id: "PP-D-88413", reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED" });
  check("#2 seeded B fallback is OTHER", "OTHER", evidenceTypesFor(seedB, "provide-evidence").join(","));
  check("#2 non-evidence action returns []", 0, evidenceTypesFor(seedA, "make-offer").length);
}

// ---- #3 + #9: PDF builds with hostile input and many artifacts ----
async function pdfChecks(): Promise<void> {
  const d = dispute({ id: "PP-D-TEST" });
  const nasty = artifact(
    "n1",
    "merchant_log",
    "Buyer note → “café ₹500”\u00A0paid — emoji 😀 and \u202F narrow space, plus a very long tail. " +
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(40),
  );
  const bytes = await buildEvidencePdf(d, [nasty], null);
  check("#3 hostile-Unicode PDF builds (no WinAnsi crash)", true, bytes.length > 1000);
  const loaded = await PDFDocument.load(bytes);
  check("#3 hostile-Unicode PDF has 5 pages", 5, loaded.getPageCount());

  // 25 artifacts x ~30pt each = ~750pt > ~674pt available on page 5, so
  // the pagination guard must start a continuation page (12 would still
  // fit on one page — verified by arithmetic, not assumed).
  const many: EvidenceArtifact[] = Array.from({ length: 25 }, (_, i) =>
    artifact(`m${i + 1}`, "invoice", `Invoice INV-TEST-${i + 1} + order record present`),
  );
  const bytesMany = await buildEvidencePdf(d, many, null);
  const loadedMany = await PDFDocument.load(bytesMany);
  check("#9 25-artifact PDF paginates past 5 pages", true, loadedMany.getPageCount() > 5);
  console.log(`     (25-artifact PDF page count: ${loadedMany.getPageCount()})`);
}

// ---- #5 (batch 2): artifactsFromDetail derives invoice only from detail ----
{
  const derived = artifactsFromDetail("PP-D-LIVE-1", {
    disputed_transactions: [
      {
        seller_transaction_id: "TXN-123",
        gross_amount: { currency_code: "USD", value: "480.00" },
        transaction_status: "COMPLETED",
      },
    ],
  });
  check("#5 live detail derives 1 invoice artifact", 1, derived.length);
  check("#5 invoice artifact kind", "invoice", derived[0]?.kind);
  check("#5 invoice summary carries seller tx id", true, derived[0]?.summary.includes("TXN-123") ?? false);
  check("#5 invoice summary carries gross amount", true, derived[0]?.summary.includes("480.00") ?? false);
  check("#5 invoice artifact is not simulated", false, derived[0]?.simulated);
  check("#5 never invents tracking", false, derived.some((a) => a.kind === "tracking"));
  check("#5 detail without transactions derives none", 0, artifactsFromDetail("PP-D-LIVE-2", {}).length);
  check("#5 detail with empty transactions derives none", 0, artifactsFromDetail("PP-D-LIVE-3", { disputed_transactions: [] }).length);
}

// ---- #9 (batch 2): artifactsForPdf pre-swarm filter ----
{
  const all = [
    artifact("t1", "tracking", "FEDEX 1, DELIVERED"),
    artifact("i1", "invoice", "Invoice INV-1"),
    artifact("m1", "merchant_log", "Buyer used product post-delivery"),
  ];
  check("#9 pre-swarm shows tracking+invoice only", "tracking,invoice", artifactsForPdf(all, null).map((a) => a.kind).join(","));
  check("#9 after a run shows all artifacts", 3, artifactsForPdf(all, { id: "run-x" } as SwarmRun).length);
}

async function main(): Promise<void> {
  await pdfChecks();
  console.log(`\n${count - failures}/${count} unit checks passed.`);
  process.exit(failures > 0 ? 1 : 0);
}

main();
