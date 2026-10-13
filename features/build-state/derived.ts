"use client";

import { useMemo } from "react";
import { checkBuild } from "@/features/compatibility/engine";
import { computePlacements } from "@/features/installation/placement";
import { resolveBuild, totalPrice } from "@/lib/hardware/repository";
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
