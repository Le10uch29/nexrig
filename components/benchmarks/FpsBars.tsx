"use client";

import { useState } from "react";
import type { PerformanceResult } from "@/types/benchmark";
import { cx } from "@/components/ui/primitives";
import { KIND_LABEL } from "./FpsResult";

/** Validated categorical pair (dark surface): current build, alternative build. */
export const SERIES_COLORS = ["#8d7dff", "#22a6bd"] as const;

export interface BarSeries {
  key: string;
  label: string;
}

export interface BarGroup {
  label: string;
  values: PerformanceResult[];
}

const avgOf = (r: PerformanceResult) => (r.kind === "unavailable" ? 0 : r.avgFps);
const topOf = (r: PerformanceResult) => (r.kind === "unavailable" ? 0 : (r.rangeFps?.[1] ?? r.avgFps));

/**
 * Horizontal FPS bars: one row per group, one bar per series, 2px gaps, direct value labels,
 * uncertainty whisker, dashed target line, hover/focus tooltip. One series → no legend box.
 */
export function FpsBars({ groups, series, target, caption }: { groups: BarGroup[]; series: BarSeries[]; target?: number; caption: string }) {
  const [hover, setHover] = useState<{ g: number; s: number } | null>(null);
  const max = Math.max(1, target ?? 0, ...groups.flatMap((g) => g.values.map(topOf))) * 1.08;
  const pct = (v: number) => `${(v / max) * 100}%`;

  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-fg-2">{caption}</span>
        {series.length > 1 && (
          <span className="flex gap-3 text-[11px] text-fg-2" aria-label="Легенда">
            {series.map((s, i) => (
              <span key={s.key} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px]" style={{ background: SERIES_COLORS[i] }} />
                {s.label}
              </span>
            ))}
          </span>
        )}
      </figcaption>
      <div className="relative space-y-3">
        {target && (
          <div className="pointer-events-none absolute inset-y-0 z-10 border-l border-dashed border-fg-3" style={{ left: `calc(84px + (100% - 84px - 64px) * ${target / max})` }}>
            <span className="absolute -top-4 -translate-x-1/2 text-[10px] text-fg-3">{target}</span>
          </div>
        )}
        {groups.map((g, gi) => (
          <div key={g.label} className="flex items-center gap-2">
            <span className="w-[76px] shrink-0 text-right text-[11.5px] text-fg-2">{g.label}</span>
            <div className="min-w-0 flex-1 space-y-[2px]">
              {g.values.map((r, si) => {
                const active = hover?.g === gi && hover?.s === si;
                const avg = avgOf(r);
                return (
                  <div key={si} className="relative flex h-5 items-center gap-2">
                    <div className="relative h-full flex-1">
                      {r.kind !== "unavailable" && r.rangeFps && (
                        <div className="absolute top-1/2 h-px -translate-y-1/2 bg-fg-3/70" style={{ left: pct(r.rangeFps[0]), width: `calc(${pct(r.rangeFps[1])} - ${pct(r.rangeFps[0])})` }} />
                      )}
                      <button
                        type="button"
                        className={cx("absolute inset-y-0 left-0 rounded-r-[4px] transition-opacity focus-visible:outline-offset-1", r.kind === "estimated" && "opacity-80", active && "opacity-100")}
                        style={{ width: pct(avg), background: SERIES_COLORS[si] }}
                        onMouseEnter={() => setHover({ g: gi, s: si })}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover({ g: gi, s: si })}
                        onBlur={() => setHover(null)}
                        aria-label={`${g.label}, ${series[si]?.label}: ${r.kind === "unavailable" ? "нет данных" : `${avg} FPS`}`}
                      />
                      {active && r.kind !== "unavailable" && (
                        <div role="tooltip" className="absolute bottom-full left-0 z-20 mb-1.5 w-max max-w-[240px] rounded-[var(--radius-sm)] border border-line-strong bg-panel-3 px-2.5 py-1.5 text-[11px] shadow-pop" style={{ left: `min(${pct(avg)}, calc(100% - 200px))` }}>
                          <p className="font-semibold text-fg">
                            {series[si]?.label} · {g.label}
                          </p>
                          <p className="num text-fg-2">
                            {r.kind === "measured" ? "" : "~"}
                            {avg} FPS{r.rangeFps ? ` (${r.rangeFps[0]}–${r.rangeFps[1]})` : ""} · 1% low {r.low1Fps ?? "—"}
                          </p>
                          <p className="text-fg-3">{KIND_LABEL[r.kind]}</p>
                        </div>
                      )}
                    </div>
                    <span className="num w-14 shrink-0 text-[11.5px] text-fg">{r.kind === "unavailable" ? "—" : `${r.kind === "measured" ? "" : "~"}${avg}`}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}
