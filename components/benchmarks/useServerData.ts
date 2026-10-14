"use client";

import { useEffect, useState } from "react";
import type { BenchmarkRecord, DataSourceInfo } from "@/types/benchmark";

/**
 * Verified records from the NexRig database for the given GPUs (all games), fetched page by page
 * from the public API — the browser never downloads the whole dataset, only what the build uses.
 */
export function useVerifiedRecords(gpuIds: (string | undefined)[]) {
  const key = [...new Set(gpuIds.filter(Boolean))].sort().join(",");
  const [state, setState] = useState<{ key: string; records: BenchmarkRecord[]; error: string | null }>({ key: "", records: [], error: null });
  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const out: BenchmarkRecord[] = [];
        for (const gpuId of key.split(",")) {
          // Up to 5 pages × 100 per GPU is plenty for one build; more would be a server-side query.
          for (let page = 1; page <= 5; page++) {
            const res = await fetch(`/api/fps/benchmarks?gpuId=${encodeURIComponent(gpuId)}&page=${page}&pageSize=100`, { signal: ctrl.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { items: BenchmarkRecord[]; total: number };
            out.push(...data.items);
            if (page * 100 >= data.total) break;
          }
        }
        setState({ key, records: out, error: null });
      } catch (e) {
        if (!ctrl.signal.aborted) setState({ key, records: [], error: e instanceof Error ? e.message : "ошибка" });
      }
    })();
    return () => ctrl.abort();
  }, [key]);
  // Results for another set of GPUs are not shown while the new ones load.
  return state.key === key ? state : { key, records: [] as BenchmarkRecord[], error: null };
}

export function useSourceStatuses() {
  const [state, setState] = useState<{ items: DataSourceInfo[]; verifiedRecords: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/fps/sources", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setState(d))
      .catch((e: Error) => !ctrl.signal.aborted && setError(e.message));
    return () => ctrl.abort();
  }, []);
  return { data: state, error };
}
