// PHALANX core types — brief §7. No buyer PII beyond what PayPal/merchant
// records already contain for that dispute. Scores are checklist scores,
// never a win probability.

export type DisputeSource = "sandbox" | "seeded";

export interface Money {
  currency_code: string;
  value: string;
}

export interface Dispute {
  id: string;
  source: DisputeSource;
  reason: string;
  amount: Money;
  status: string;
  dispute_life_cycle_stage: string;
  dispute_state: string;
  /** Actions the live dispute allows (from HATEOAS links / allowed_response_options).
   *  For seeded disputes this is a SIMULATED list — live gating applies only to Sandbox rows. */
  allowed_actions: string[];
  /** Offer/accept types the live dispute allows (from allowed_response_options).
   *  Checked when present; absent means "cannot verify from this response". */
  allowed_response_options?: {
    make_offer?: { offer_types: string[] };
    accept_claim?: { accept_claim_types: string[] };
  };
  raw_paypal_detail: Record<string, unknown> | null;
  created_at: string;
}

export type EvidenceKind =
  | "tracking"
  | "invoice"
  | "merchant_log"
  | "terms"
  | "photo";

export interface EvidenceArtifact {
  id: string;
  dispute_id: string;
  kind: EvidenceKind;
  source: string;
  summary: string;
  simulated: boolean;
  sha256?: string;
}

export type Verdict =
  | "CONTEST_HARD_PROOF"
  | "DE_ESCALATE_OFFER"
  | "CONCEDE_FAST_SETTLE";

export interface ChecklistItem {
  key: string;
  label: string;
  points: number;
  passed: boolean;
  artifact_id?: string;
  gap?: string;
}

export interface EvDisplay {
  /** Illustrative EV — not a PayPal outcome prediction. Fee basis shown. */
  ev_contest: number;
  concede_cost: number;
  offer_cost: number;
  fee_usd: number;
  fee_basis: string;
}

export type DebateKind = "draft" | "critique" | "gap" | "artifact" | "verdict";

export interface DebateMessage {
  run_id: string;
  iteration: number;
  actor: string;
  kind: DebateKind;
  text: string;
  timestamp: string;
}

export interface SwarmIteration {
  iteration: number;
  draft_version: string;
  score: number;
  score_before: number;
  gaps: string[];
  verdict: Verdict;
  accepted: boolean;
  rebuttal_text: string;
}

export interface SwarmRun {
  id: string;
  dispute_id: string;
  iterations: SwarmIteration[];
  messages: DebateMessage[];
  score: number;
  gaps: string[];
  verdict: Verdict;
  ev_display: EvDisplay | null;
  status: "RUNNING" | "TRIAGED" | "AWAITING_APPROVAL" | "EXECUTED" | "EXECUTION_FAILED";
  duration_ms: number;
  created_at: string;
}

export interface Approval {
  id: string;
  dispute_id: string;
  action: string;
  offer_amount?: Money;
  approved_by: string;
  approved_at: string;
  run_id: string;
}

export interface ExecutionRecord {
  dispute_id: string;
  approved_action: string;
  approved_by: string;
  approved_at: string;
  paypal_status: string;
  paypal_debug_id: string | null;
  idempotency_key: string;
  follow_up_detail_status: string | null;
  note: string;
}
