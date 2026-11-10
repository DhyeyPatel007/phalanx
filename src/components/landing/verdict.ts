// Landing-only verdict helpers. Thresholds 35 / 75 are locked (scorer).
import type { Verdict } from "@/lib/types";

export type VerdictTone = "contest" | "offer" | "concede";

export function verdictTone(v: Verdict): VerdictTone {
  if (v === "CONTEST_HARD_PROOF") return "contest";
  if (v === "DE_ESCALATE_OFFER") return "offer";
  return "concede";
}

export function verdictShort(v: Verdict): string {
  if (v === "CONTEST_HARD_PROOF") return "CONTEST";
  if (v === "DE_ESCALATE_OFFER") return "OFFER";
  return "CONCEDE";
}

export function verdictLong(v: Verdict): string {
  if (v === "CONTEST_HARD_PROOF") return "CONTEST_HARD_PROOF";
  if (v === "DE_ESCALATE_OFFER") return "DE_ESCALATE_OFFER";
  return "CONCEDE_FAST_SETTLE";
}

/**
 * Recorded outcomes of the seeded demo swarm runs (locked by the brief):
 * A $480 -> 85 CONTEST, B $210 -> 60 OFFER, C $95 -> 0 CONCEDE.
 * Used as the fallback only when a dispute has no completed run yet in
 * this server's memory (fresh deploys start with no runs); a live run
 * always wins when one exists.
 */
export const SEEDED_OUTCOMES: Record<
  string,
  { caseLabel: string; score: number; verdict: Verdict }
> = {
  "PP-D-88412": { caseLabel: "A", score: 85, verdict: "CONTEST_HARD_PROOF" },
  "PP-D-88413": { caseLabel: "B", score: 60, verdict: "DE_ESCALATE_OFFER" },
  "PP-D-88414": { caseLabel: "C", score: 0, verdict: "CONCEDE_FAST_SETTLE" },
};
