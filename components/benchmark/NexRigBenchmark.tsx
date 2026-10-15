"use client";

import { useState } from "react";
import { IconBolt, IconGauge } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { cx } from "@/components/ui/primitives";
import { PageShell } from "@/components/ui/studio";
import { BrowserBenchmark } from "./BrowserBenchmark";
import { BuildTestPanel } from "./BuildTestPanel";

type Tab = "build" | "device";

const MODES: { id: Tab; title: string; text: string; facts: string[]; icon: typeof IconGauge }[] = [
  {
    id: "build",
    title: "Протестировать сборку",
    text: "Ожидаемый FPS собранной в конфигураторе системы во всех играх — по проверенным тестам, переносу с похожих систем и модели.",
    facts: ["8 этапов анализа", "1080p · 1440p · 4K", "источник у каждого значения"],
    icon: IconGauge,
  },
  {
    id: "device",
    title: "Проверить этот компьютер",
    text: "Реальный замер графической нагрузки прямо в этом браузере. Показывает производительность тестовой сцены, а не FPS в играх.",
    facts: ["WebGPU / WebGL2", "~13 с или 63 с", "данные остаются у вас"],
    icon: IconBolt,
  },
];

/** NexRig Benchmark: mode A (selected build, server analysis) and mode B (this computer, in-browser). */
export function NexRigBenchmark({ initial = "build" }: { initial?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial);
  return (
    <PageShell className="space-y-8">
      <PageHeader section="Производительность" title="NexRig Benchmark" description="Два разных теста: прогноз FPS в играх для собранной конфигурации и измерение производительности компьютера, на котором открыт сайт." />
      <div className="grid gap-4 md:grid-cols-2" role="tablist" aria-label="Режим теста">
        {MODES.map((m) => {
          const active = tab === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(m.id)}
              className={cx(
                "group flex gap-5 rounded-[var(--radius-xl)] p-5 text-left ring-1 transition-[background-color,box-shadow] duration-200 md:p-6",
                active ? "bg-[linear-gradient(135deg,rgb(116_98_255/0.18),rgb(116_98_255/0.04))] ring-violet/50" : "bg-panel ring-white/[0.06] hover:ring-violet/30",
              )}
            >
              <span className={cx("grid size-12 shrink-0 place-items-center rounded-[var(--radius-lg)]", active ? "bg-violet-strong text-white" : "bg-panel-3 text-fg-2")}>
                <m.icon width={22} height={22} />
              </span>
              <span className="min-w-0">
                <span className="block text-[19px] font-semibold tracking-tight">{m.title}</span>
                <span className="mt-1.5 block text-[14px] leading-relaxed text-fg-2">{m.text}</span>
                <span className="mt-3 flex flex-wrap gap-1.5">
                  {m.facts.map((f) => (
                    <span key={f} className="rounded-full bg-bg-1/80 px-2.5 py-1 text-[12px] text-fg-2 ring-1 ring-white/[0.06]">
                      {f}
                    </span>
                  ))}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{tab === "build" ? <BuildTestPanel /> : <BrowserBenchmark />}</div>
    </PageShell>
  );
}
