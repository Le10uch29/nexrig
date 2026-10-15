"use client";

import Link from "next/link";
import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore } from "@/features/build-state/store";
import { freezeBuild, missingForTest } from "@/features/fps-analysis/freeze";
import { useAnalysis } from "@/features/fps-analysis/store";
import { settingsLabel } from "@/lib/fps-engine/analysis";
import { AnalysisDialog } from "@/components/fps-analysis/AnalysisDialog";
import { Button } from "@/components/ui/primitives";

/** NexRig Benchmark, mode A: the build from the 3D configurator, analysed on the server. */
export function BuildTestPanel() {
  const { selection, resolved, report } = useBuildDerived();
  const buildName = useBuildStore((s) => s.buildName);
  const settings = useBuildStore((s) => s.perf.settings);
  const status = useAnalysis((s) => s.status);
  const runVersion = useAnalysis((s) => s.frozen?.version);
  const start = useAnalysis((s) => s.start);
  const setOpen = useAnalysis((s) => s.setOpen);
  const missing = missingForTest(resolved);
  const running = status === "running";

  const onClick = () => {
    const frozen = freezeBuild({ selection, resolved, settings, buildName, checks: report.checks });
    if (!frozen) return;
    if (frozen.version === runVersion && (running || status === "done")) return setOpen(true);
    void start(frozen);
  };

  const parts: [string, string][] = [
    ["Процессор", resolved.cpu?.name ?? "не выбран"],
    ["Видеокарта", resolved.gpu?.name ?? "не выбрана"],
    ["Память", resolved.ram ? `${resolved.ramCount} × ${resolved.ram.moduleSizeGb} ГБ ${resolved.ram.type} ${resolved.ram.speedMtps} МТ/с` : "не выбрана"],
    ["Настройки", settingsLabel({ ...settings, resolution: undefined })],
  ];

  return (
    <section className="space-y-3 rounded-[var(--radius-lg)] border border-line bg-panel p-4">
      <div>
        <h2 className="text-sm font-semibold">{buildName}</h2>
        <p className="text-[11.5px] text-fg-3">Сборка из 3D-конфигуратора. Настройки графики меняются в разделе «FPS и производительность» конструктора.</p>
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-[12px] sm:grid-cols-2">
        {parts.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="shrink-0 text-fg-3">{k}:</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={onClick} disabled={missing.length > 0}>
          {running ? "Идёт анализ… (открыть)" : "Протестировать сборку"}
        </Button>
        <Link href="/builder" className="inline-flex h-9 items-center rounded-[var(--radius-md)] px-3 text-sm text-fg-2 hover:bg-panel-2 hover:text-fg">
          Изменить сборку
        </Link>
        {missing.length > 0 && <p className="text-[12px] text-fg-3">Добавьте {missing.join(" и ")} в конфигураторе.</p>}
      </div>
      <p className="text-[11.5px] text-fg-3">
        Анализ ищет проверенные тесты этой и похожих конфигураций в базе NexRig, переносит их на вашу сборку и показывает, где значение измерено, перенесено или рассчитано моделью. Внешние сайты при этом не опрашиваются: их результаты вносятся в базу импортом со ссылкой на источник.
      </p>
      <AnalysisDialog />
    </section>
  );
}
