"use client";

import { useState } from "react";
import { cx } from "@/components/ui/primitives";
import { BrowserBenchmark } from "./BrowserBenchmark";
import { BuildTestPanel } from "./BuildTestPanel";

type Tab = "build" | "device";

/** NexRig Benchmark: mode A (selected build, server analysis) and mode B (this computer, in-browser). */
export function NexRigBenchmark({ initial = "build" }: { initial?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial);
  const tabs: [Tab, string, string][] = [
    ["build", "Протестировать сборку", "Ожидаемый FPS выбранной сборки в играх — по проверенным тестам и модели."],
    ["device", "Проверить этот компьютер", "Реальный замер графической нагрузки в этом браузере (WebGPU / WebGL2)."],
  ];
  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 px-4 py-6 md:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">NexRig Benchmark</h1>
        <p className="text-sm text-fg-3">Два разных теста: прогноз FPS в играх для собранной конфигурации и измерение производительности компьютера, на котором открыт сайт.</p>
      </header>
      <div className="grid gap-2 sm:grid-cols-2" role="tablist" aria-label="Режим теста">
        {tabs.map(([id, label, hint]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cx("rounded-[var(--radius-md)] border p-3 text-left transition-colors", tab === id ? "border-violet/50 bg-violet-soft/40" : "border-line bg-panel hover:border-line-strong")}
          >
            <span className="block text-sm font-semibold">{label}</span>
            <span className="block text-[11.5px] text-fg-3">{hint}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel">{tab === "build" ? <BuildTestPanel /> : <BrowserBenchmark />}</div>
    </div>
  );
}
