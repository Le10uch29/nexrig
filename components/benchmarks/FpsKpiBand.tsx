"use client";

import { targetVerdict } from "@/lib/benchmark-engine/estimate";
import type { PerformanceResult } from "@/types/benchmark";
import { IconHelp } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";
import { Kpi } from "@/components/ui/studio";
import { KIND_LABEL } from "./FpsResult";

/** Data type as a coloured band + words: measured, calibrated by measurements, model only. */
const KIND_STYLE = {
  measured: { tone: "cyan" as const, bar: "bg-cyan", text: "text-cyan", note: "Реальные проверенные замеры этой конфигурации." },
  calibrated: { tone: "violet" as const, bar: "bg-violet", text: "text-violet", note: "Модель, скорректированная по близким проверенным замерам." },
  estimated: { tone: "neutral" as const, bar: "bg-fg-3", text: "text-fg-2", note: "Расчёт модели относительной производительности — не замер." },
};

const VERDICT = {
  meets: { label: "Держит цель", tone: "ok" as const },
  borderline: { label: "На грани", tone: "warn" as const },
  misses: { label: "Ниже цели", tone: "bad" as const },
};

/** The headline numbers of FPS Lab: average, 1% low, target and limiting part. */
export function FpsKpiBand({ result, target, scenario }: { result: PerformanceResult; target: number; scenario: string }) {
  if (result.kind === "unavailable") {
    return (
      <section className="flex flex-col items-start gap-3 rounded-[var(--radius-xl)] bg-panel p-6 ring-1 ring-white/[0.06] md:flex-row md:items-center md:p-8" aria-label="Результат">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-panel-3 text-fg-2">
          <IconHelp width={22} height={22} />
        </span>
        <div>
          <p className="eyebrow">{scenario}</p>
          <p className="mt-1 text-[22px] font-semibold">Недостаточно данных для оценки</p>
          <p className="mt-1 text-[14px] text-fg-3">{result.reason}</p>
        </div>
      </section>
    );
  }
  const style = KIND_STYLE[result.kind];
  const fg = result.kind === "measured" ? result.frameGenIncluded : result.frameGenFps !== null;
  const range = result.rangeFps;
  const verdict = targetVerdict(result, target);
  const prefix = result.kind === "measured" ? "" : "~";
  return (
    <section className="overflow-hidden rounded-[var(--radius-xl)] bg-panel ring-1 ring-white/[0.06]" aria-label="Результат">
      <div className={cx("h-1", style.bar)} aria-hidden />
      <div className="grid gap-x-10 gap-y-8 p-6 md:p-8 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
        <div>
          <p className="eyebrow">{scenario}</p>
          <p className="num mt-2 text-[64px] leading-none font-semibold tracking-tight md:text-[76px]">
            {prefix}
            {result.avgFps}
            <span className="ml-2 font-sans text-[20px] font-medium text-fg-3">FPS</span>
          </p>
          <p className={cx("mt-3 text-[14px] font-semibold", style.text)}>{KIND_LABEL[result.kind]}</p>
          <p className="mt-0.5 text-[13px] text-fg-3">
            {style.note}
            {range ? ` Диапазон ${range[0]}–${range[1]} FPS.` : ""}
          </p>
        </div>
        <Kpi
          label="1% low"
          tone={result.low1Fps !== null ? style.tone : "neutral"}
          value={result.low1Fps !== null ? `${prefix}${result.low1Fps}` : "—"}
          unit={result.low1Fps !== null ? "FPS" : undefined}
          sub={result.low1Fps !== null ? "из замеров" : "не измерен — модель не оценивает"}
        />
        <Kpi
          label={`Цель ${target} FPS`}
          tone={verdict ? VERDICT[verdict].tone : "neutral"}
          value={verdict ? VERDICT[verdict].label : "—"}
          sub={range ? `по нижней границе ${range[0]} FPS` : "по среднему значению"}
        />
        {result.kind === "measured" ? (
          <Kpi label="Замеров" tone="cyan" value={result.records.length} sub={fg ? "с генерацией кадров" : "без генерации кадров"} />
        ) : (
          <Kpi
            label="Ограничение"
            tone="violet"
            value={result.bottleneck === "gpu" ? "Видеокарта" : result.bottleneck === "cpu" ? "Процессор" : "Баланс"}
            sub={`GPU ~${result.gpuBoundFps} · CPU ~${result.cpuBoundFps} FPS`}
          />
        )}
      </div>
      {fg && <p className="border-t border-line px-6 py-3 text-[13px] text-fg-3 md:px-8">Включена генерация кадров: значения — показанный FPS со вставленными кадрами, задержка соответствует базовому FPS.</p>}
    </section>
  );
}
