"use client";

import { targetVerdict, type TargetVerdict } from "@/lib/benchmark-engine/estimate";
import { useMessages } from "@/lib/i18n";
import type { PerformanceResult } from "@/types/benchmark";
import { IconAlert, IconCheck, IconHelp, IconX } from "@/components/ui/icons";
import { Badge, cx } from "@/components/ui/primitives";

export const KIND_LABEL = {
  measured: "Реальный замер",
  calibrated: "Оценка по замерам",
  estimated: "Примерная оценка",
} as const;

export const KIND_TONE = { measured: "cyan", calibrated: "violet", estimated: "neutral" } as const;

const VERDICT: Record<TargetVerdict, { label: string; cls: string; Icon: typeof IconCheck }> = {
  meets: { label: "Держит цель", cls: "text-ok", Icon: IconCheck },
  borderline: { label: "На грани", cls: "text-warn", Icon: IconAlert },
  misses: { label: "Ниже цели", cls: "text-bad", Icon: IconX },
};

export function TargetBadge({ result, target }: { result: PerformanceResult; target: number }) {
  const v = targetVerdict(result, target);
  if (!v) return null;
  const { label, cls, Icon } = VERDICT[v];
  return (
    <span className={cx("inline-flex items-center gap-1 text-[11px] font-medium", cls)}>
      <Icon width={12} height={12} /> {label} {target}
    </span>
  );
}

function Meter({ label, value, hint }: { label: string; value: number; hint: string }) {
  const pct = Math.round(value * 100);
  return (
    <div title={hint}>
      <div className="flex justify-between text-[11px]">
        <span className="text-fg-3">{label}</span>
        <span className="num text-fg-2">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-bg-1" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cx("h-full rounded-full", pct >= 95 ? "bg-violet" : "bg-fg-3/60")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** FPS card. Measured, calibrated and model-only results are distinct in label, colour and text. */
export function FpsResult({ result, target }: { result: PerformanceResult; target?: number }) {
  const t = useMessages();
  if (result.kind === "unavailable") {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-line p-4 text-center">
        <IconHelp className="mx-auto mb-1.5 text-fg-3" />
        <p className="text-sm font-medium text-fg-2">Недостаточно данных для точной оценки</p>
        <p className="mt-1 text-xs text-fg-3">{result.reason}</p>
      </div>
    );
  }
  const measured = result.kind === "measured";
  const range = result.rangeFps;
  const max = Math.max(range?.[1] ?? result.avgFps, result.avgFps, target ?? 0) * 1.1;
  return (
    <div className={cx("rounded-[var(--radius-md)] border p-4", measured ? "border-ok/30 bg-ok-soft/40" : "border-line bg-panel-2/60")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone={KIND_TONE[result.kind]}>{KIND_LABEL[result.kind]}</Badge>
        <span className="text-[11px] text-fg-3">
          {t.perf.confidence}: <span className="text-fg-2">{t.perf.confidenceLevels[result.confidence]}</span>
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
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
        {result.kind !== "measured" && result.frameGenFps && (
          <div>
            <p className="num text-xl leading-none font-medium text-cyan">~{result.frameGenFps}</p>
            <p className="mt-1 text-[11px] text-fg-3">с генерацией кадров</p>
          </div>
        )}
        {target && <TargetBadge result={result} target={target} />}
      </div>
      {range && (
        <div className="mt-4">
          <div className="relative h-2 rounded-full bg-bg-1">
            <div className={cx("absolute h-full rounded-full", measured ? "bg-ok/40" : "bg-violet/35")} style={{ left: `${(range[0] / max) * 100}%`, width: `${((range[1] - range[0]) / max) * 100}%` }} />
            <div className={cx("absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded", measured ? "bg-ok" : "bg-violet")} style={{ left: `${(result.avgFps / max) * 100}%` }} />
            {target && <div className="absolute -top-1 h-4 border-l border-dashed border-fg-2" style={{ left: `${(target / max) * 100}%` }} title={`Цель ${target} FPS`} />}
          </div>
          <p className="num mt-1.5 text-[11px] text-fg-3">
            {measured ? "Разброс замеров" : t.perf.range}: {range[0]}–{range[1]} FPS{target ? ` · пунктир — цель ${target}` : ""}
          </p>
        </div>
      )}
      {result.kind !== "measured" && (
        <div className="mt-4 space-y-3 border-t border-line pt-3">
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <p className="text-fg-3">Предел видеокарты</p>
              <p className="num text-sm text-fg">~{result.gpuBoundFps} FPS</p>
            </div>
            <div>
              <p className="text-fg-3">Предел CPU и памяти</p>
              <p className="num text-sm text-fg">~{result.cpuBoundFps} FPS</p>
            </div>
            <Meter label="Загрузка GPU (по модели)" value={result.utilization.gpu} hint="Доля предела видеокарты, используемая при ожидаемом FPS — вывод модели, не телеметрия." />
            <Meter label="Загрузка CPU-предела (по модели)" value={result.utilization.cpu} hint="Доля CPU-предела, используемая при ожидаемом FPS — вывод модели, не телеметрия." />
          </div>
          <p className="text-[11.5px] text-fg-2">
            {t.perf.bottleneck}:{" "}
            <span className="font-semibold text-fg">
              {result.bottleneck === "gpu" ? "видеокарта (GPU-bound)" : result.bottleneck === "cpu" ? "процессор и память (CPU-bound)" : "смешанный режим"}
            </span>
          </p>
          <p className="text-[11px] font-medium text-warn">
            {result.kind === "calibrated" ? "Оценка модели, скорректированная по реальным замерам этой видеокарты — не прямое измерение." : t.perf.notMeasurement}
          </p>
          <details className="text-[11px] text-fg-3">
            <summary className="cursor-pointer select-none hover:text-fg-2">
              {t.perf.method}: <span className="num">{result.method}</span> · допущения ({result.assumptions.length})
            </summary>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              {result.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
      {result.kind === "measured" && (
        <div className="mt-4 space-y-1 border-t border-line pt-3 text-[11px] text-fg-3">
          {result.records.map((r) => (
            <p key={r.id}>
              {t.perf.source}: <span className="text-fg-2">{r.source.label}</span> · {r.testDate} · {r.sampleCount} прогон(а)
              {r.method && <> · {r.method}</>}
              {r.testConfig && <> · {r.testConfig}</>}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
