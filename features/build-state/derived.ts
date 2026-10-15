"use client";

import { useMemo } from "react";
import { checkBuild } from "@/features/compatibility/engine";
import { computePlacements } from "@/features/installation/placement";
import { resolveBuild, totalPrice } from "@/lib/hardware/repository";
import type { ComponentCategory } from "@/types/hardware";
import { useBuildStore } from "./store";

/** Memoized views of the current build shared by sidebar, inspector, timeline and scene. */
export function useBuildDerived() {
  const selection = useBuildStore((s) => s.selection);
  return useMemo(() => {
    const resolved = resolveBuild(selection);
    const report = checkBuild(selection);
    const placements = computePlacements(resolved, report.checks);
    return { selection, resolved, report, placements, total: totalPrice(resolved) };
  }, [selection]);
}

/** Categories a complete build has installed in the case. */
export const REQUIRED_CATEGORIES: ComponentCategory[] = ["case", "motherboard", "cpu", "cooler", "ram", "gpu", "storage", "psu"];

/** Installation progress: categories whose parts are all mounted (and not mid-animation). */
export function useBuildProgress() {
  const { placements } = useBuildDerived();
  const motion = useBuildStore((s) => s.motion);
  const done = REQUIRED_CATEGORIES.filter((cat) => {
    const ps = placements.filter((p) => p.category === cat);
    return ps.length > 0 && ps.every((p) => p.state === "mounted" && !motion[p.key]);
  }).length;
  const total = REQUIRED_CATEGORIES.length;
  return { done, total, pct: Math.round((done / total) * 100) };
}
