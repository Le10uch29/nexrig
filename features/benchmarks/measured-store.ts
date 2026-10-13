"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { BenchmarkRecord } from "@/types/benchmark";

/**
 * Measured FPS records entered by the user (their own runs or a cited review), kept in localStorage.
 * The app ships with no measured data: it does not invent benchmark records.
 */
interface MeasuredState {
  records: BenchmarkRecord[];
  add: (r: Omit<BenchmarkRecord, "id">) => void;
  remove: (id: string) => void;
}

export const useMeasuredBenchmarks = create<MeasuredState>()(
  persist(
    (set, get) => ({
      records: [],
      add: (r) => set({ records: [{ ...r, id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }, ...get().records] }),
      remove: (id) => set({ records: get().records.filter((r) => r.id !== id) }),
    }),
    { name: "buildai.measured-benchmarks.v1", storage: createJSONStorage(() => localStorage), skipHydration: true },
  ),
);
