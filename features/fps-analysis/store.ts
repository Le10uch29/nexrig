"use client";

import { create } from "zustand";
import type { AnalysisReport } from "@/lib/fps-engine/analysis";
import { ANALYSIS_STAGES, type AnalysisEvent, type StageId, type StageStatus } from "@/lib/fps-engine/analysis-stages";

/** Request body of /api/fps/analyze (see analyzeSchema). */
export interface AnalyzeRequest {
  cpuId: string;
  gpuId: string;
  ram?: { type: "DDR3" | "DDR4" | "DDR5"; speedMtps: number; modules: number; moduleGb?: number };
  settings: { preset: "low" | "medium" | "high" | "ultra"; rayTracing: boolean; upscaling: "off" | "quality" | "balanced" | "performance"; upscaler?: "DLSS" | "FSR" | "XeSS" | null; frameGen?: boolean };
  buildVersion: string;
}

/** The configuration as it was when the test started (it does not follow later edits). */
export interface FrozenBuild {
  request: AnalyzeRequest;
  buildName: string;
  version: string;
  frozenAt: string;
  parts: { label: string; value: string }[];
  /** Build-level warnings (incompatible parts) computed in the builder. */
  caveats: string[];
}

export interface AnalysisRun {
  frozen: FrozenBuild;
  report: AnalysisReport;
  cached: boolean;
  cachedAt: string | null;
  warnings: string[];
}

type RunStatus = "idle" | "running" | "done" | "error" | "cancelled";

interface AnalysisState {
  open: boolean;
  status: RunStatus;
  frozen: FrozenBuild | null;
  stages: Record<StageId, { status: StageStatus; detail?: string }>;
  run: AnalysisRun | null;
  error: string | null;
  /** Completed runs of different builds this session (latest first), for comparison. */
  history: AnalysisRun[];
  setOpen: (open: boolean) => void;
  start: (frozen: FrozenBuild, opts?: { force?: boolean }) => Promise<void>;
  retry: () => void;
  cancel: () => void;
}

const freshStages = () => Object.fromEntries(ANALYSIS_STAGES.map((s) => [s.id, { status: "pending" as StageStatus }])) as AnalysisState["stages"];

let controller: AbortController | null = null;

export const useAnalysis = create<AnalysisState>()((set, get) => ({
  open: false,
  status: "idle",
  frozen: null,
  stages: freshStages(),
  run: null,
  error: null,
  history: [],

  setOpen: (open) => set({ open }),

  start: async (frozen, opts) => {
    controller?.abort();
    const ctrl = new AbortController();
    controller = ctrl;
    set({ open: true, status: "running", frozen, stages: freshStages(), run: null, error: null });
    const onEvent = (e: AnalysisEvent) => {
      if (controller !== ctrl) return;
      if (e.type === "stage") set((s) => ({ stages: { ...s.stages, [e.id]: { status: e.status, detail: e.detail } } }));
      else if (e.type === "fatal") set({ status: "error", error: e.message });
      else if (e.type === "result") {
        const run: AnalysisRun = { frozen, report: e.report, cached: e.cached, cachedAt: e.cachedAt, warnings: e.warnings };
        set((s) => ({
          status: "done",
          run,
          history: [run, ...s.history.filter((h) => h.frozen.version !== frozen.version)].slice(0, 6),
        }));
      }
    };
    try {
      const res = await fetch("/api/fps/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...frozen.request, force: opts?.force ?? false }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Сервер ответил HTTP ${res.status}.`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line) onEvent(JSON.parse(line) as AnalysisEvent);
        }
      }
      if (controller === ctrl && get().status === "running") set({ status: "error", error: "Соединение прервалось до получения результата." });
    } catch (e) {
      if (controller !== ctrl) return;
      if (ctrl.signal.aborted) return;
      set({ status: "error", error: e instanceof Error ? e.message : "Не удалось выполнить анализ." });
      // Stages that never finished stay visible as failed rather than "running".
      set((s) => ({ stages: Object.fromEntries(Object.entries(s.stages).map(([k, v]) => [k, v.status === "running" ? { status: "error" as StageStatus, detail: "Прервано" } : v])) as AnalysisState["stages"] }));
    } finally {
      if (controller === ctrl) controller = null;
    }
  },

  retry: () => {
    const frozen = get().frozen;
    if (frozen) void get().start(frozen, { force: true });
  },

  cancel: () => {
    controller?.abort();
    controller = null;
    set((s) => ({
      status: "cancelled",
      stages: Object.fromEntries(Object.entries(s.stages).map(([k, v]) => [k, v.status === "running" ? { status: "pending" as StageStatus, detail: "Отменено" } : v])) as AnalysisState["stages"],
    }));
  },
}));
