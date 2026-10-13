"use client";

import { useMessages } from "@/lib/i18n";
import type { PerformanceResult } from "@/types/benchmark";
import { IconHelp } from "@/components/ui/icons";
import { Badge, cx } from "@/components/ui/primitives";

/** FPS card. Measured and estimated results are visually and textually distinct. */
export function FpsResult({ result }: { result: PerformanceResult }) {
  const t = useMessages();
  if (result.kind === "unavailable") {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-line p-4 text-center">
        <IconHelp className="mx-auto mb-1.5 text-fg-3" />
        <p className="text-sm font-medium text-fg-2">{t.perf.unavailable}</p>
        <p className="mt-1 text-xs text-fg-3">{result.reason}</p>
      </div>
    );
  }
  const measured = result.kind === "measured";
  const range = result.rangeFps;
  const max = Math.max(range?.[1] ?? result.avgFps, result.avgFps) * 1.1;
  return (
    <div className={cx("rounded-[var(--radius-md)] border p-4", measured ? "border-ok/30 bg-ok-soft/40" : "border-line bg-panel-2/60")}>
      <div className="flex items-center justify-between gap-2">
        <Badge tone={measured ? "cyan" : "violet"}>{measured ? t.perf.measured : t.perf.estimated}</Badge>
        <span className="text-[11px] text-fg-3">
          {t.perf.confidence}: <span className="text-fg-2">{t.perf.confidenceLevels[result.confidence]}</span>
        </span>
      </div>
      <div className="mt-3 flex items-end gap-5">
        <div>
          <p className="num text-4xl leading-none font-semibold tracking-tight">
            {measured ? "" : "~"}
            {result.avgFps}
          </p>
          <p className="mt-1 text-[11px] text-fg-3">{t.perf.avg}</p>
        </div>
        <div>
          <p className="num text-xl leading-none font-medium text-fg-2">{result.low1Fps ?? "—"}</p>
          <p className="mt-1 text-[11px] text-fg-3">{t.perf.low1}</p>
        </div>
      </div>
      {range && (
        <div className="mt-4">
          <div className="relative h-2 rounded-full bg-bg-1">
            <div
              className={cx("absolute h-full rounded-full", measured ? "bg-ok/40" : "bg-violet/35")}
              style={{ left: `${(range[0] / max) * 100}%`, width: `${((range[1] - range[0]) / max) * 100}%` }}
            />
            <div className={cx("absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded", measured ? "bg-ok" : "bg-violet")} style={{ left: `${(result.avgFps / max) * 100}%` }} />
          </div>
          <p className="num mt-1.5 text-[11px] text-fg-3">
            {measured ? "Разброс замеров" : t.perf.range}: {range[0]}–{range[1]} FPS
          </p>
        </div>
      )}
      {result.kind === "estimated" && (
        <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-[11px] leading-relaxed">
          <p className="font-medium text-warn">{t.perf.notMeasurement}</p>
          <p className="text-fg-3">
            {t.perf.bottleneck}: <span className="text-fg-2">{t.perf.bottlenecks[result.bottleneck]}</span> · {t.perf.method}: <span className="num text-fg-2">{result.method}</span>
          </p>
          <ul className="list-disc space-y-0.5 pl-4 text-fg-3">
            {result.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {result.kind === "measured" && (
        <div className="mt-4 space-y-1 border-t border-line pt-3 text-[11px] text-fg-3">
          {result.records.map((r) => (
            <p key={r.id}>
              {t.perf.source}: <span className="text-fg-2">{r.source.label}</span> · {r.testDate} · {r.sampleCount} прогон(а)
              {r.conditions && <> · {r.conditions}</>}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
