import type { ComponentCategory } from "./hardware";

/**
 * - compatible: every input needed for the rule is known and passes.
 * - warning: works, but with a caveat or something we cannot see (BIOS version, adapters, overclocked memory).
 * - incompatible: known specs prove the combination cannot work.
 * - unknown: a required part or spec is missing, so no verdict can be given. Never treated as "compatible".
 */
export type CheckStatus = "compatible" | "warning" | "incompatible" | "unknown";

export type CheckSeverity = "critical" | "major" | "minor" | "info";

export interface CompatibilityCheck {
  id: string;
  /** Rule identifier, stable across runs. */
  rule: string;
  title: string;
  status: CheckStatus;
  severity: CheckSeverity;
  /** What was found. */
  detail: string;
  /** Why this matters to the user. */
  why: string;
  /** Practical fix when status is not "compatible". */
  resolution?: string;
  categories: ComponentCategory[];
  /** Names of the components this check looked at (filled by the engine). */
  components: string[];
  /** For "unknown": a counterpart part is not selected yet vs. a spec is missing from the data. */
  unknownReason?: "missing-part" | "missing-data";
}

export interface CompatibilityReport {
  checks: CompatibilityCheck[];
  /** Overall verdict: worst status across checks. */
  overall: CheckStatus;
  counts: Record<CheckStatus, number>;
  estimatedPeakPowerW: number | null;
  recommendedPsuW: number | null;
}
