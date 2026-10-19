"use client";

import { useState } from "react";
import { GAMES } from "@/data/games";
import { useBuildDerived, useBuildProgress } from "@/features/build-state/derived";
import { useSavedBuilds } from "@/features/build-state/saved-builds";
import { useBuildStore } from "@/features/build-state/store";
import { usePrice } from "@/features/settings/currency";
import { getPerformance, memoryOf } from "@/lib/benchmark-engine/estimate";
import { LEVEL_LABEL, toFpsEstimate } from "@/lib/fps-engine/engine";
import { useVerifiedRecords } from "@/components/benchmarks/useServerData";
import { TestPcButton } from "@/components/fps-analysis/TestPcButton";
import { IconBookmark, IconCheck, IconReset } from "@/components/ui/icons";
import { Button, cx, StatusPill } from "@/components/ui/primitives";
import { useOpenSection } from "./inspector-nav";

/**
 * Build status bar across the top of the builder: what the build is, how complete and compatible
 * it is, what it costs and what it is expected to do — plus the main actions.
 * FPS is the existing engine's figure for the selected game, labelled with its data type.
 */
export function BuildHeaderBar() {
  const formatPrice = usePrice();
  const { resolved, report, total, selection } = useBuildDerived();
  const progress = useBuildProgress();
  const buildName = useBuildStore((s) => s.buildName);
  const setBuildName = useBuildStore((s) => s.setBuildName);
  const perf = useBuildStore((s) => s.perf);
  const resetBuild = useBuildStore((s) => s.resetBuild);
  const clearBuild = useBuildStore((s) => s.clearBuild);
  const save = useSavedBuilds((s) => s.save);
  const openSection = useOpenSection();
  const [saved, setSaved] = useState(false);
  const records = useVerifiedRecords([resolved.gpu?.id]).records;
  const game = GAMES.find((g) => g.id === perf.gameId);
  const fps = resolved.cpu && resolved.gpu ? toFpsEstimate(getPerformance({ game, cpu: resolved.cpu, gpu: resolved.gpu, settings: perf.settings, measured: records, memory: memoryOf(resolved.ram, resolved.ramCount) }), game) : null;
  const issues = report.counts.incompatible + report.counts.warning;
  const psuW = resolved.psu?.wattage ?? null;
  const psuShort = psuW !== null && report.recommendedPsuW !== null && psuW < report.recommendedPsuW;
  const fpsValue = fps ? (fps.averageFpsEstimate ?? fps.frameGenFps) : null;

  return (
    <header
      className="@container relative z-20 border-b border-line bg-bg-1 px-4 py-3 lg:pointer-events-none lg:absolute lg:inset-x-0 lg:top-0 lg:border-0 lg:bg-transparent lg:px-6 lg:pt-4 lg:pb-0"
      aria-label="Состояние сборки"
    >
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="min-w-0 flex-1 basis-64 lg:pointer-events-auto lg:max-w-[540px]">
          <p className="px-1 text-[11px] font-semibold tracking-[0.14em] text-violet uppercase">Конструктор</p>
          <label htmlFor="build-name" className="sr-only">
            Название сборки
          </label>
          <input
            id="build-name"
            value={buildName}
            onChange={(e) => setBuildName(e.target.value)}
            maxLength={120}
            className="w-full truncate rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1 py-0.5 text-[20px] font-semibold tracking-tight outline-none hover:border-line focus:border-violet/60 lg:text-[24px]"
          />
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[12.5px]">
            <span className="flex items-center gap-2 text-fg-3">
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-panel-3" role="progressbar" aria-label="Готовность сборки" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100}>
                <span className={cx("block h-full rounded-full transition-[width] duration-500", progress.pct === 100 ? "bg-ok" : "bg-violet")} style={{ width: `${progress.pct}%` }} />
              </span>
              <span className="num">
                {progress.done}/{progress.total}
              </span>
              собрано
            </span>
            <button type="button" onClick={() => openSection("compat")} className="flex items-center gap-1.5 rounded-full hover:opacity-90" title="Открыть проверку совместимости">
              <StatusPill status={report.overall} size="xs" />
              {issues > 0 && <span className="text-fg-3">{issues === 1 ? "1 замечание" : `${issues} замечания`}</span>}
            </button>
          </div>
        </div>

        <dl className="flex flex-wrap items-center gap-x-8 gap-y-2 lg:pointer-events-auto lg:mx-auto lg:rounded-[var(--radius-xl)] lg:border lg:border-line lg:bg-bg-0/65 lg:px-6 lg:py-2.5 lg:backdrop-blur-md">
          <div>
            <dt className="eyebrow">Стоимость</dt>
            <dd className="num text-[24px] leading-tight font-semibold">{formatPrice(total)}</dd>
          </div>
          <div>
            <dt className="eyebrow">
              FPS · {game?.title ?? "—"} · {perf.settings.resolution}
            </dt>
            <dd>
              <button type="button" onClick={() => openSection("perf")} className="flex items-baseline gap-1.5 text-left" title="Открыть FPS и производительность">
                <span className="num text-[24px] leading-tight font-semibold text-cyan">{fpsValue !== null ? `${fps?.level === "verified" ? "" : "~"}${fpsValue}` : "—"}</span>
                <span className="text-[12px] text-fg-3">{fps ? LEVEL_LABEL[fps.level].toLowerCase() : !resolved.cpu && !resolved.gpu ? "нужны CPU и GPU" : !resolved.gpu ? "нужна видеокарта" : "нужен процессор"}</span>
              </button>
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Пик · блок питания</dt>
            <dd className={cx("num text-[16px] leading-tight font-semibold", psuShort && "text-bad")}>
              {report.estimatedPeakPowerW ? `~${report.estimatedPeakPowerW}` : "—"} / {psuW ?? "—"} Вт
              {report.recommendedPsuW && <span className="ml-1.5 font-sans text-[12px] font-normal text-fg-3">реком. {report.recommendedPsuW}</span>}
            </dd>
          </div>
        </dl>

        <div className="flex items-center gap-2 lg:pointer-events-auto">
          <TestPcButton />
          <Button
            variant="secondary"
            onClick={() => {
              save(buildName, selection);
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            }}
            title="Сохранить сборку в этом браузере"
          >
            {saved ? <IconCheck className="text-ok" /> : <IconBookmark />}
            <span className="@max-3xl:hidden">{saved ? "Сохранено" : "Сохранить"}</span>
          </Button>
          <Button variant="ghost" onClick={resetBuild} title="Вернуть стартовую конфигурацию" aria-label="Сбросить сборку">
            <IconReset />
          </Button>
          <Button variant="ghost" onClick={clearBuild} title="Начать новую сборку с нуля">
            <span className="@max-3xl:hidden">Новая</span>
            <span className="@3xl:hidden">+</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
