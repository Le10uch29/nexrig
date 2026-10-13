import { estimatePeakPower } from "@/lib/hardware/power";
import { hardwareRepository, resolveBuild, type HardwareRepository, type ResolvedBuild } from "@/lib/hardware/repository";
import type { BuildSelection } from "@/types/build";
import type { CheckStatus, CompatibilityCheck, CompatibilityReport } from "@/types/compatibility";
import type { HardwareComponent } from "@/types/hardware";
import { RULES, type Rule } from "./rules";

/** Severity order, worst last. */
export const STATUS_SEVERITY: Record<CheckStatus, number> = {
  compatible: 0,
  insufficient: 1,
  verify: 2,
  incompatible: 3,
};

export function worstStatus(statuses: CheckStatus[]): CheckStatus {
  return statuses.reduce<CheckStatus>((w, s) => (STATUS_SEVERITY[s] > STATUS_SEVERITY[w] ? s : w), "compatible");
}

export function runChecks(b: ResolvedBuild, rules: Rule[] = RULES): CompatibilityCheck[] {
  return rules.flatMap((rule) => {
    const out = rule(b);
    return out === null ? [] : Array.isArray(out) ? out : [out];
  });
}

export function checkBuild(selection: BuildSelection, repo: HardwareRepository = hardwareRepository): CompatibilityReport {
  const resolved = resolveBuild(selection, repo);
  const checks = runChecks(resolved);
  const counts: Record<CheckStatus, number> = { compatible: 0, incompatible: 0, verify: 0, insufficient: 0 };
  for (const c of checks) counts[c.status]++;
  return {
    checks,
    overall: checks.length ? worstStatus(checks.map((c) => c.status)) : "insufficient",
    counts,
    estimatedPeakPowerW: estimatePeakPower(resolved),
  };
}

/** Selection with `component` placed into its slot (storage is appended unless already present). */
export function withComponent(selection: BuildSelection, component: HardwareComponent): BuildSelection {
  if (component.category === "storage") {
    return selection.storage.includes(component.id)
      ? selection
      : { ...selection, storage: [...selection.storage, component.id] };
  }
  return { ...selection, [component.category]: component.id };
}

export interface CandidateVerdict {
  /** "unchecked" when no rule links this part to anything already in the build. */
  status: CheckStatus | "unchecked";
  checks: CompatibilityCheck[];
}

/**
 * Verdict for putting `component` into the current build. Only checks touching the component's
 * category count, and "insufficient" checks (missing counterpart) don't count against the candidate.
 */
export function evaluateCandidate(
  selection: BuildSelection,
  component: HardwareComponent,
  repo: HardwareRepository = hardwareRepository,
): CandidateVerdict {
  const resolved = resolveBuild(withComponent(selection, component), repo);
  const relevant = runChecks(resolved).filter(
    (c) => c.categories.includes(component.category) && c.status !== "insufficient",
  );
  if (relevant.length === 0) return { status: "unchecked", checks: [] };
  return { status: worstStatus(relevant.map((c) => c.status)), checks: relevant };
}
