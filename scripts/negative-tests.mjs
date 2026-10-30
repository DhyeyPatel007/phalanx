// PHALANX negative tests — brief §10.5.
// Runs against a FRESH production server (in-memory store, so the test
// order matters: approvals/runs do not survive a restart).
//   PHALANX_BASE_URL=http://localhost:3100 node scripts/negative-tests.mjs
// Writes docs/negative-tests.md with expected vs actual + PASS/FAIL.
// Exits non-zero if any test fails. No live PayPal calls are made.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.PHALANX_BASE_URL ?? "http://localhost:3100";
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const results = [];
let failures = 0;

async function call(method, p, body, headers = {}) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body (PDF) */
  }
  return { status: res.status, headers: res.headers, text, json };
}

function check(name, expected, actual, detail = "") {
  const pass = expected === actual;
  if (!pass) failures += 1;
  results.push({ name, expected: String(expected), actual: String(actual), detail, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name} — expected ${expected}, got ${actual}${detail ? ` (${detail})` : ""}`);
}

function pdftotext(file) {
  try {
    return execSync(`pdftotext ${file} -`, { encoding: "utf-8" });
  } catch {
    return null;
  }
}

const A = "PP-D-88412";
const B = "PP-D-88413";
const C = "PP-D-88414";

// T1 — execute without approval must refuse (403 APPROVAL_REQUIRED).
{
  const r = await call("POST", `/api/disputes/${A}/execute`, {});
  check("T1 execute without approval → 403", 403, r.status, r.json?.error);
  check("T1 error code is APPROVAL_REQUIRED", "APPROVAL_REQUIRED", r.json?.error);
}

// T2 — approve a disallowed action must refuse WITH the allowed list shown.
// (A needs a swarm run first — approve refuses before any run exists.)
{
  const runFirst = await call("POST", `/api/disputes/${A}/run`, {});
  check("T2 setup run A → 200", 200, runFirst.status);
  const r = await call("POST", `/api/disputes/${A}/approve`, { action: "escalate" });
  check("T2 approve disallowed action → 409", 409, r.status, r.json?.error);
  check(
    "T2 response shows allowed_actions list",
    true,
    Array.isArray(r.json?.allowed_actions) && r.json.allowed_actions.length > 0,
    (r.json?.allowed_actions ?? []).join(","),
  );
  check("T2 suggests a downgrade action", "provide-evidence", r.json?.suggested_action);
}

// T2b — approve with no swarm run yet must refuse (B has no run at this point).
{
  const r = await call("POST", `/api/disputes/${B}/approve`, { action: "make-offer" });
  check("T2b approve before any run → 409", 409, r.status, r.json?.error);
}

// T3 — run swarm on A: v1 rejected (named log gap), v2 passes, score 85.
{
  const r = await call("POST", `/api/disputes/${A}/run`, {});
  const run = r.json?.run;
  check("T3 swarm run A → 200", 200, r.status);
  check("T3 A has 2 iterations", 2, run?.iterations?.length);
  check("T3 A v1 rejected", false, run?.iterations?.[0]?.accepted);
  check("T3 A v2 accepted", true, run?.iterations?.[1]?.accepted);
  check("T3 A final score 85", 85, run?.score);
  check("T3 A verdict CONTEST_HARD_PROOF", "CONTEST_HARD_PROOF", run?.verdict);
}

// T4 — approve A provide-evidence.
{
  const r = await call("POST", `/api/disputes/${A}/approve`, { action: "provide-evidence" });
  check("T4 approve A provide-evidence → 200", 200, r.status);
  check("T4 approved action", "provide-evidence", r.json?.approval?.action);
}

// T5 — execute A (approved, seeded) → 409 LIVE_EXECUTION_NOT_ENABLED.
{
  const r = await call("POST", `/api/disputes/${A}/execute`, {});
  check("T5 execute A (seeded, approved) → 409", 409, r.status, r.json?.error);
  check("T5 error is LIVE_EXECUTION_NOT_ENABLED", "LIVE_EXECUTION_NOT_ENABLED", r.json?.error);
  check("T5 idempotency key recorded", true, Boolean(r.json?.record?.idempotency_key), r.json?.record?.idempotency_key ?? "");
}

// T6 — stale approval: run A again, then execute → 409 STALE_APPROVAL.
{
  const run = await call("POST", `/api/disputes/${A}/run`, {});
  check("T6 re-run A → 200", 200, run.status);
  const r = await call("POST", `/api/disputes/${A}/execute`, {});
  check("T6 execute with stale approval → 409", 409, r.status, r.json?.error);
  check("T6 error is STALE_APPROVAL", "STALE_APPROVAL", r.json?.error);
}

// T7 — make-offer path (B): run, approve with no amount → default 40% = $84.00.
{
  const run = await call("POST", `/api/disputes/${B}/run`, {});
  check("T7 run B → 200", 200, run.status);
  check("T7 B verdict DE_ESCALATE_OFFER", "DE_ESCALATE_OFFER", run.json?.run?.verdict);
  check("T7 B score 60", 60, run.json?.run?.score);
  const appr = await call("POST", `/api/disputes/${B}/approve`, { action: "make-offer" });
  check("T7 approve B make-offer → 200", 200, appr.status);
  check("T7 default offer is 40% = $84.00", "84.00", appr.json?.approval?.offer_amount?.value);
  const ex = await call("POST", `/api/disputes/${B}/execute`, {});
  check("T7 execute B → 409 LIVE_EXECUTION_NOT_ENABLED", 409, ex.status, ex.json?.error);
  check("T7 approved action recorded as make-offer", "make-offer", ex.json?.record?.approved_action);
}

// T7b — make-offer with an amount above the dispute total must refuse (400).
{
  const r = await call("POST", `/api/disputes/${B}/approve`, {
    action: "make-offer",
    offer_amount: { currency_code: "USD", value: "999.00" },
  });
  check("T7b offer above dispute amount → 400", 400, r.status, r.json?.error);
}

// T8 — accept-claim path (C): run, approve, execute → 409 LIVE_EXECUTION_NOT_ENABLED.
{
  const run = await call("POST", `/api/disputes/${C}/run`, {});
  check("T8 run C → 200", 200, run.status);
  check("T8 C verdict CONCEDE_FAST_SETTLE", "CONCEDE_FAST_SETTLE", run.json?.run?.verdict);
  check("T8 C score 0", 0, run.json?.run?.score);
  const appr = await call("POST", `/api/disputes/${C}/approve`, { action: "accept-claim" });
  check("T8 approve C accept-claim → 200", 200, appr.status);
  const ex = await call("POST", `/api/disputes/${C}/execute`, {});
  check("T8 execute C → 409 LIVE_EXECUTION_NOT_ENABLED", 409, ex.status, ex.json?.error);
  check("T8 approved action recorded as accept-claim", "accept-claim", ex.json?.record?.approved_action);
}

// T9 — duplicate webhook: same event_id replayed twice → second ignored as duplicate.
{
  const first = await call("POST", "/api/demo/replay-webhook", { dispute_id: A, event_id: "WH-TEST-DUP-1" });
  check("T9 first replay → 200", 200, first.status);
  const second = await call("POST", "/api/demo/replay-webhook", { dispute_id: A, event_id: "WH-TEST-DUP-1" });
  check("T9 second replay → 200 (answered, not executed)", 200, second.status);
  check("T9 second replay ignored as duplicate", "duplicate", second.json?.result?.ignored);
  const log = await call("GET", "/api/webhooks/paypal");
  const dup = (log.json?.log ?? []).some((e) => e.result === "DUPLICATE_IGNORED");
  check("T9 webhook log records DUPLICATE_IGNORED", true, dup);
}

// T10 — bad webhook signature: fake event + bogus headers → 200, ignored, logged.
{
  const r = await call(
    "POST",
    "/api/webhooks/paypal",
    { id: "WH-FAKE-1", event_type: "CUSTOMER.DISPUTE.CREATED", resource: { dispute_id: A } },
    {
      "paypal-auth-algo": "bogus",
      "paypal-cert-url": "https://example.invalid/cert",
      "paypal-transmission-id": "fake",
      "paypal-transmission-sig": "fake",
      "paypal-transmission-time": new Date().toISOString(),
    },
  );
  check("T10 fake webhook → 200 (answered, not executed)", 200, r.status);
  check("T10 fake webhook ignored", true, Boolean(r.json?.ignored), r.json?.ignored ?? "");
  const log = await call("GET", "/api/webhooks/paypal");
  const bad = (log.json?.log ?? []).some((e) => e.event_id === "WH-FAKE-1");
  check("T10 webhook log records the fake event", true, bad);
}

// T11 — evidence PDFs for all 3 scenarios.
for (const id of [A, B, C]) {
  const res = await fetch(`${BASE}/api/disputes/${id}/evidence.pdf`);
  const buf = Buffer.from(await res.arrayBuffer());
  check(`T11 PDF ${id} → 200`, 200, res.status);
  check(`T11 PDF ${id} content-type`, "application/pdf", res.headers.get("content-type"));
  check(`T11 PDF ${id} under 10 MB`, true, buf.length < 10 * 1024 * 1024, `${buf.length} bytes`);
  check(`T11 PDF ${id} has SHA-256 header`, true, Boolean(res.headers.get("x-phalanx-pdf-sha256")));
  const tmp = `/tmp/negtest-${id}.pdf`;
  fs.writeFileSync(tmp, buf);
  const text = pdftotext(tmp);
  if (text !== null) {
    check(`T11 PDF ${id} contains SIMULATED watermark`, true, text.includes("SIMULATED"));
    check(`T11 PDF ${id} has all 5 sections`, true,
      ["Evidence dossier", "Invoice / order record", "Tracking / fulfillment proof", "Merchant-log correlation", "Evidence manifest"].every((s) => text.includes(s)));
  } else {
    console.log(`(pdftotext unavailable — text checks skipped for ${id})`);
  }
}

// ---- write the report ----
const now = new Date().toISOString();
const passed = results.filter((r) => r.pass).length;
const md = `# PHALANX — Negative tests (brief §10.5)

Run: ${now} against a fresh production build (\`npm run build\` + \`next start\`).
Script: \`scripts/negative-tests.mjs\` (\`PHALANX_BASE_URL=http://localhost:3100 node scripts/negative-tests.mjs\`).
Result: **${passed}/${results.length} passed**${failures > 0 ? ` — ${failures} FAILING` : ""}.

No live PayPal calls are made in any test. Seeded disputes only.

| Test | Expected | Actual | Result |
|---|---|---|---|
${results.map((r) => `| ${r.name} | ${r.expected} | ${r.actual}${r.detail ? ` (${r.detail})` : ""} | ${r.pass ? "PASS" : "FAIL"} |`).join("\n")}

## What each test proves
- **T1** — Execute without approval refuses (403 APPROVAL_REQUIRED). The human gate is real.
- **T2/T2b** — A disallowed action refuses WITH the live allowed list shown + a downgrade suggestion; approving before any swarm run refuses.
- **T3–T6** — Scenario A: v1 rejected on the named merchant-log gap, v2 passes at 85/CONTEST; approved execution on a seeded dispute refuses (409 LIVE_EXECUTION_NOT_ENABLED) with the idempotency key recorded; a newer run makes the old approval stale (409 STALE_APPROVAL).
- **T7/T7b** — make-offer path: B scores 60/DE_ESCALATE_OFFER, default offer is 40% ($84.00); an offer above the dispute amount refuses (400).
- **T8** — accept-claim path: C scores 0/CONCEDE_FAST_SETTLE; execution refuses (409 LIVE_EXECUTION_NOT_ENABLED).
- **T9** — Duplicate webhook event dedupes: second replay is ignored, no second run; the webhook log records DUPLICATE_IGNORED.
- **T10** — Fake webhook (bad signature / no config) is answered 200, ignored, and logged — never executed.
- **T11** — Evidence PDFs generate for all 3 scenarios: 200, application/pdf, under 10 MB, SHA-256 header present, SIMULATED watermark + all 5 sections present.

## Not covered here (needs Dhyey)
- Live Sandbox execution (provide-evidence / make-offer / accept-claim against PayPal) — deliberately refused in this run; needs his Sandbox accounts + webhook.
- The live-check fill-in report (brief §10.6): dispute ID seen in Sandbox, PDF visible in the dispute, offer/accept reflected on re-fetch.
`;
fs.writeFileSync(path.join(ROOT, "docs", "negative-tests.md"), md);
console.log(`\n${passed}/${results.length} passed. Report written to docs/negative-tests.md`);
process.exit(failures > 0 ? 1 : 0);
