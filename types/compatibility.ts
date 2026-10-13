import type { ComponentCategory } from "./hardware";

/**
 * - compatible: every input needed for the rule is known and passes.
 * - incompatible: known specs prove the combination cannot work.
 * - verify: probably works but depends on something we cannot see (BIOS version, adapters, exact partner card).
 * - insufficient: a required part or spec is missing, so no verdict can be given.
 */
export type CheckStatus = "compatible" | "incompatible" | "verify" | "insufficient";

export interface CompatibilityCheck {
  id: string;
  /** Rule identifier, stable across runs. */
  rule: string;
  title: string;
  status: CheckStatus;
  detail: string;
  /** Practical fix when status is not "compatible". */
  resolution?: string;
  categories: ComponentCategory[];
}

export interface CompatibilityReport {
  checks: CompatibilityCheck[];
  /** Overall verdict: worst status across checks. */
  overall: CheckStatus;
  counts: Record<CheckStatus, number>;
  estimatedPeakPowerW: number | null;
}
