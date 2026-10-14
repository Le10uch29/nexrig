import { estimatePeakPower, recommendedPsuWattage } from "@/lib/hardware/power";
import { hardwareRepository, resolveBuild, type HardwareRepository, type ResolvedBuild } from "@/lib/hardware/repository";
import type { BuildSelection } from "@/types/build";
import type { CheckStatus, CompatibilityCheck, CompatibilityReport } from "@/types/compatibility";
import type { ComponentCategory, HardwareComponent } from "@/types/hardware";
import { RULES, type Rule } from "./rules";

/** Severity order, worst last. "unknown" ranks above "compatible": missing data is never a pass. */
export const STATUS_SEVERITY: Record<CheckStatus, number> = {
  compatible: 0,
  unknown: 1,
  warning: 2,
  incompatible: 3,
};

export function worstStatus(statuses: CheckStatus[]): CheckStatus {
  return statuses.reduce<CheckStatus>((w, s) => (STATUS_SEVERITY[s] > STATUS_SEVERITY[w] ? s : w), "compatible");
}

function namesFor(b: ResolvedBuild, categories: ComponentCategory[]): string[] {
  return categories.flatMap((c) => {
    if (c === "storage") return b.storage.map((s) => s.name);
    if (c === "ram") return b.ram ? [b.ramCount > 1 ? `${b.ramCount} × ${b.ram.name}` : b.ram.name] : [];
    const part = b[c];
    return part ? [part.name] : [];
  });
}

export function runChecks(b: ResolvedBuild, rules: Rule[] = RULES): CompatibilityCheck[] {
  return rules
    .flatMap((rule) => {
      const out = rule(b);
      return out === null ? [] : Array.isArray(out) ? out : [out];
    })
    .map((c) => ({ ...c, components: namesFor(b, c.categories) }));
}

export function checkBuild(selection: BuildSelection, repo: HardwareRepository = hardwareRepository): CompatibilityReport {
  const resolved = resolveBuild(selection, repo);
  const checks = runChecks(resolved);
  const counts: Record<CheckStatus, number> = { compatible: 0, warning: 0, incompatible: 0, unknown: 0 };
  for (const c of checks) counts[c.status]++;
  return {
    checks,
    overall: checks.length ? worstStatus(checks.map((c) => c.status)) : "unknown",
    counts,
    estimatedPeakPowerW: estimatePeakPower(resolved),
    recommendedPsuW: recommendedPsuWattage(resolved),
  };
}

/** Selection with `component` placed into its slot (storage is appended unless already present). */
export function withComponent(selection: BuildSelection, component: HardwareComponent): BuildSelection {
  if (component.category === "storage") {
    return selection.storage.includes(component.id) ? selection : { ...selection, storage: [...selection.storage, component.id] };
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
 * category count. Unknowns caused by a not-yet-selected counterpart are ignored; unknowns caused
 * by missing specs are kept, so a part with incomplete data never reads as fully compatible.
 */
export function evaluateCandidate(selection: BuildSelection, component: HardwareComponent, repo: HardwareRepository = hardwareRepository): CandidateVerdict {
  const resolved = resolveBuild(withComponent(selection, component), repo);
  const relevant = runChecks(resolved).filter(
    (c) => c.categories.includes(component.category) && !(c.status === "unknown" && c.unknownReason === "missing-part"),
  );
  if (relevant.length === 0) return { status: "unchecked", checks: [] };
  return { status: worstStatus(relevant.map((c) => c.status)), checks: relevant };
}
