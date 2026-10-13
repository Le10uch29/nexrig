"use client";

import { create } from "zustand";
import { evaluateCandidate } from "@/features/compatibility/engine";
import type { CompatibilityCheck } from "@/types/compatibility";
import type { HardwareComponent } from "@/types/hardware";
import { useBuildStore } from "./store";

interface ConflictState {
  pending: { component: HardwareComponent; checks: CompatibilityCheck[] } | null;
  open: (component: HardwareComponent, checks: CompatibilityCheck[]) => void;
  close: () => void;
}

export const useConflictDialog = create<ConflictState>((set) => ({
  pending: null,
  open: (component, checks) => set({ pending: { component, checks } }),
  close: () => set({ pending: null }),
}));

/**
 * Validate first, then install. Incompatible parts require explicit confirmation and will be
 * placed on the bench instead of inside the case.
 */
export function requestInstall(component: HardwareComponent) {
  const { selection, setComponent } = useBuildStore.getState();
  const verdict = evaluateCandidate(selection, component);
  if (verdict.status === "incompatible") {
    useConflictDialog.getState().open(
      component,
      verdict.checks.filter((c) => c.status === "incompatible"),
    );
    return;
  }
  setComponent(component);
}
