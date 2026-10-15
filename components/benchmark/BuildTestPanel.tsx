"use client";

import Link from "next/link";
import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore } from "@/features/build-state/store";
import { freezeBuild, missingForTest } from "@/features/fps-analysis/freeze";
import { useAnalysis } from "@/features/fps-analysis/store";
import { settingsLabel } from "@/lib/fps-engine/analysis";
import { ANALYSIS_STAGES } from "@/lib/fps-engine/analysis-stages";
import type { ComponentCategory } from "@/types/hardware";
import { AnalysisDialog } from "@/components/fps-analysis/AnalysisDialog";
import { ComponentThumb } from "@/components/hardware/ComponentThumb";
import { IconGauge } from "@/components/ui/icons";
import { Button, cx } from "@/components/ui/primitives";
import { Surface } from "@/components/ui/studio";

const PROVENANCE: [string, string, string][] = [
  ["bg-cyan", "Измерено", "проверенный тест этой же конфигурации"],
  ["bg-violet", "Перенос", "тест похожей системы, пересчитанный на вашу"],
  ["bg-fg-2", "Модель", "расчёт без тестов, с широким диапазоном"],
];

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

  const parts: { category: ComponentCategory; label: string; value: string; component?: Parameters<typeof ComponentThumb>[0]["component"] }[] = [
    { category: "cpu", label: "Процессор", value: resolved.cpu?.name ?? "не выбран", component: resolved.cpu },
    { category: "gpu", label: "Видеокарта", value: resolved.gpu?.name ?? "не выбрана", component: resolved.gpu },
    { category: "ram", label: "Память", value: resolved.ram ? `${resolved.ramCount} × ${resolved.ram.moduleSizeGb} ГБ ${resolved.ram.type} ${resolved.ram.speedMtps} МТ/с` : "не выбрана", component: resolved.ram },
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <Surface className="space-y-6 p-6 md:p-8">
        <div>
          <p className="eyebrow">Сборка из конфигуратора</p>
          <h2 className="mt-1 text-[26px] leading-tight font-semibold tracking-tight">{buildName}</h2>
          <p className="mt-1 text-[14px] text-fg-3">Настройки графики: {settingsLabel({ ...settings, resolution: undefined })}</p>
        </div>
        <ul className="space-y-3">
          {parts.map((p) => (
            <li key={p.category} className="flex items-center gap-4">
              <ComponentThumb component={p.component} category={p.category} size={56} />
              <div className="min-w-0">
                <p className="text-[12.5px] text-fg-3">{p.label}</p>
                <p className={cx("truncate text-[16px] font-medium", !p.component && "text-fg-3 italic")}>{p.value}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
          <Button variant="primary" className="h-12 px-6 text-[15px]" onClick={onClick} disabled={missing.length > 0}>
            <IconGauge width={18} height={18} />
            {running ? "Идёт анализ… (открыть)" : "Протестировать сборку"}
          </Button>
          <Link href="/builder" className="inline-flex h-12 items-center rounded-[var(--radius-md)] px-4 text-[14px] text-fg-2 hover:bg-[var(--hover-bg)] hover:text-fg">
            Изменить сборку
          </Link>
          {missing.length > 0 && <p className="text-[13px] text-warn">Добавьте {missing.join(" и ")} в конфигураторе.</p>}
        </div>
      </Surface>

      <Surface as="aside" className="space-y-6 p-6 md:p-8">
        <div>
          <p className="eyebrow">Как работает анализ</p>
          <ol className="mt-3 space-y-2.5">
            {ANALYSIS_STAGES.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 text-[14px] text-fg-2">
                <span className="num grid size-6 shrink-0 place-items-center rounded-full bg-panel-3 text-[11px] text-fg-3">{i + 1}</span>
                {s.label}
              </li>
            ))}
          </ol>
        </div>
        <div className="border-t border-line pt-5">
          <p className="eyebrow">Откуда каждое значение</p>
          <ul className="mt-3 space-y-2">
            {PROVENANCE.map(([dot, label, text]) => (
              <li key={label} className="flex items-start gap-2.5 text-[13.5px]">
                <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", dot)} aria-hidden />
                <span>
                  <span className="font-medium">{label}</span> <span className="text-fg-3">— {text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12.5px] leading-relaxed text-fg-3">Внешние сайты при запуске не опрашиваются: их результаты вносятся в базу импортом со ссылкой на источник.</p>
        </div>
      </Surface>
      <AnalysisDialog />
    </div>
  );
}
