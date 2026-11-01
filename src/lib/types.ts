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
  /** Deterministic Outcome & Break-Even Matrix — NEVER a win probability prediction. */
  contest_upheld_net_usd: number;       // $0.00 loss ($amount retained, $15 fee waived on seller win)
  contest_lost_cost_usd: number;        // +(amount + fee) worst-case loss if contested and lost
  offer_cost_usd: number;               // Dynamic partial refund offer amount ($0 fee in INQUIRY)
  offer_retained_usd: number;           // +(amount - offer_cost_usd) retained by merchant
  offer_pct: number;                    // e.g. 40 for 40%
  concede_cost_usd: number;             // +amount in INQUIRY ($0 fee) or +(amount + fee) in CLAIM/CHARGEBACK
  breakeven_win_rate_vs_offer_pct: number; // Algebraic threshold: (amount - offer + fee) / (amount + fee) * 100
  /** Legacy compatibility aliases for existing tests/UI */
  concede_cost: number;
  offer_cost: number;
  fee_usd: number;
  fee_basis: string;
  ev_contest: number;
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
  issue_framing?: string;
  verdict_reasoning?: string;
  phases?: SwarmPhaseItem[];
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

export type PhaseStatus = "pending" | "current" | "done";

export interface SwarmPhaseItem {
  key: string;
  label: string;
  actor: string;
  iteration: number;
  status: PhaseStatus;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  summary_note?: string;
  messages: DebateMessage[];
}

export interface SwarmProgress {
  run_id: string;
  dispute_id: string;
  status: "RUNNING" | "DONE";
  started_at: string;
  elapsed_ms: number;
  current_phase_key: string | null;
  current_phase_label: string;
  phases: SwarmPhaseItem[];
}
