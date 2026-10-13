"use client";

import Link from "next/link";
import { GAMES } from "@/data/games";
import { useMeasuredBenchmarks } from "@/features/benchmarks/measured-store";
import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore } from "@/features/build-state/store";
import { getPerformance } from "@/lib/benchmark-engine/estimate";
import { useMessages } from "@/lib/i18n";
import { cx, SectionTitle } from "@/components/ui/primitives";
import { FpsResult } from "./FpsResult";
import { PerformanceControls } from "./PerformanceControls";

export function PerformancePanel() {
  const t = useMessages();
  const { resolved } = useBuildDerived();
  const perf = useBuildStore((s) => s.perf);
  const setPerf = useBuildStore((s) => s.setPerf);
  const measured = useMeasuredBenchmarks((s) => s.records);
  const game = GAMES.find((g) => g.id === perf.gameId);
  const result = getPerformance({ game, cpu: resolved.cpu, gpu: resolved.gpu, settings: perf.settings, measured });

  return (
    <div className="space-y-4">
      <PerformanceControls
        gameId={perf.gameId}
        settings={perf.settings}
        gpu={resolved.gpu}
        onGame={(gameId) => setPerf({ gameId })}
        onSettings={(settings) => setPerf({ settings })}
      />
      <FpsResult result={result} />
      <div className="space-y-2">
        <SectionTitle>Все игры · те же настройки</SectionTitle>
        <ul className="divide-y divide-line rounded-[var(--radius-md)] border border-line">
          {GAMES.map((g) => {
            const r = getPerformance({ game: g, cpu: resolved.cpu, gpu: resolved.gpu, settings: perf.settings, measured });
            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setPerf({ gameId: g.id })}
                  className={cx("flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-panel-2", g.id === perf.gameId && "bg-panel-2")}
                >
                  <span className="truncate text-fg-2">{g.title}</span>
                  <span className="num shrink-0">
                    {r.kind === "unavailable" ? (
                      <span className="text-fg-3">—</span>
                    ) : (
                      <>
                        <span className={r.kind === "measured" ? "text-cyan" : "text-fg"}>
                          {r.kind === "estimated" ? "~" : ""}
                          {r.avgFps}
                        </span>
                        <span className="ml-1.5 text-[10px] text-fg-3">{r.kind === "measured" ? "замер" : "оценка"}</span>
                      </>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <Link href="/games" className="block text-center text-xs text-violet hover:underline">
        {t.nav.games}: сравнение GPU, фильтры и свои замеры →
      </Link>
    </div>
  );
}
