"use client";

import { useSyncExternalStore } from "react";
import type { BackendId, BenchMode, BenchPresetId } from "@/lib/browser-bench/config";
import type { BenchIssue, FrameStats } from "@/lib/browser-bench/stats";

/** One finished run, as kept in this browser. */
export interface BenchRun {
  id: string;
  at: string;
  version: string;
  backend: BackendId;
  preset: BenchPresetId;
  mode: BenchMode;
  width: number;
  height: number;
  stats: FrameStats;
  valid: boolean;
  issues: BenchIssue[];
  software: boolean;
  renderer: string | null;
  browser: string;
  os: string;
  logicalCores: number | null;
}

/**
 * Local history, kept only with the user's consent (localStorage, this browser only). Without
 * consent nothing is written; withdrawing consent deletes the stored history.
 */
const CONSENT_KEY = "nexrig.bench.consent.v1";
const HISTORY_KEY = "nexrig.bench.history.v1";
const MAX_RUNS = 30;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: history simply is not kept */
  }
};

let cachedRaw: string | null | undefined;
let cachedRuns: BenchRun[] = [];
const EMPTY: BenchRun[] = [];

function historySnapshot(): BenchRun[] {
  const raw = read(HISTORY_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      cachedRuns = Array.isArray(parsed) ? (parsed as BenchRun[]) : [];
    } catch {
      cachedRuns = [];
    }
  }
  return cachedRuns;
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => (e.key === HISTORY_KEY || e.key === CONSENT_KEY) && fn();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
};

export function useBenchConsent(): boolean {
  return useSyncExternalStore(subscribe, () => read(CONSENT_KEY) === "yes", () => false);
}

export function useBenchHistory(): BenchRun[] {
  return useSyncExternalStore(subscribe, historySnapshot, () => EMPTY);
}

export function setBenchConsent(yes: boolean) {
  write(CONSENT_KEY, yes ? "yes" : null);
  if (!yes) write(HISTORY_KEY, null);
  emit();
}

/** Saves a run only if the user agreed to keep history. */
export function saveRun(run: BenchRun) {
  if (read(CONSENT_KEY) !== "yes") return false;
  write(HISTORY_KEY, JSON.stringify([run, ...historySnapshot()].slice(0, MAX_RUNS)));
  emit();
  return true;
}

export function clearHistory() {
  write(HISTORY_KEY, null);
  emit();
}
