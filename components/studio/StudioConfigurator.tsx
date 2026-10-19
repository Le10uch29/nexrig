"use client";

import Link from "next/link";
import { useState } from "react";
import { GAMES } from "@/data/games";
import { evaluateCandidate } from "@/features/compatibility/engine";
import { useBuildDerived } from "@/features/build-state/derived";
import { requestInstall } from "@/features/build-state/install-action";
import { useSavedBuilds } from "@/features/build-state/saved-builds";
import { useBuildStore, type CaseMode } from "@/features/build-state/store";
import { usePrice } from "@/features/settings/currency";
import { getPerformance, memoryOf } from "@/lib/benchmark-engine/estimate";
import { LEVEL_LABEL, toFpsEstimate } from "@/lib/fps-engine/engine";
import { hardwareRepository } from "@/lib/hardware/repository";
import { matchCatalogGpu, type VideocartRow } from "@/lib/videocart/specs";
import type { GraphicsPreset, Resolution } from "@/types/benchmark";
import type { ComponentCategory, GpuSpec } from "@/types/hardware";
import { CategoryIcon } from "@/components/builder/category-icons";
import { ConflictDialog } from "@/components/builder/ConflictDialog";
import { SceneViewport } from "@/components/builder/scene/SceneViewport";
import { useVerifiedRecords } from "@/components/benchmarks/useServerData";
import { ComponentThumb } from "@/components/hardware/ComponentThumb";
import { IconCheck, IconChevron, IconExplode, IconGauge, IconLayers, IconReset, IconTag } from "@/components/ui/icons";
import { cx, Segmented } from "@/components/ui/primitives";
import { ToolButton } from "@/components/ui/studio";
import { ModelInventory } from "./ModelInventory";
import { ModelWorkspace } from "./ModelWorkspace";

type NavId = "cpu" | "gpu" | "ram" | "storage" | "cooler" | "psu" | "motherboard" | "case";
type Mode = "build" | "import" | "inventory";

const MODES: { id: Mode; label: string }[] = [
  { id: "build", label: "Конфигуратор" },
  { id: "import", label: "3D-модели" },
  { id: "inventory", label: "Список моделей" },
];

const NAV: { id: NavId; label: string; text: string }[] = [
  { id: "cpu", label: "Процессор", text: "Считает игровую логику, физику и подготовку кадров. Сильный процессор поднимает FPS там, где видеокарта ждёт данных." },
  { id: "gpu", label: "Видеокарта", text: "Главный фактор FPS: рисует каждый кадр, тени и освещение. Объём и тип памяти определяют запас для высоких разрешений." },
  { id: "ram", label: "Память", text: "Хранит данные игры рядом с процессором. Объём влияет на плавность, частота — на 1% low." },
  { id: "storage", label: "Накопитель", text: "Отвечает за загрузки уровней и подгрузку текстур. NVMe SSD заметно быстрее SATA." },
  { id: "cooler", label: "Охлаждение", text: "Держит процессор в пределах температур под долгой нагрузкой, чтобы частоты не падали." },
  { id: "psu", label: "Блок питания", text: "Питает всю систему. Нужен запас по мощности и правильные разъёмы для видеокарты." },
  { id: "motherboard", label: "Плата", text: "Связывает все детали: сокет процессора, слоты памяти, PCIe и M.2." },
  { id: "case", label: "Корпус", text: "Определяет, какие платы, видеокарты и кулеры поместятся, и как продувается система." },
];

const PRESETS: { value: GraphicsPreset; label: string }[] = [
  { value: "low", label: "Низкий" },
  { value: "medium", label: "Средний" },
  { value: "high", label: "Высокий" },
  { value: "ultra", label: "Ультра" },
];
const RESOLUTIONS: Resolution[] = ["1080p", "1440p", "4K"];
const CASE_MODES: { id: CaseMode; label: string }[] = [
  { id: "glass", label: "Стекло" },
  { id: "open", label: "Открыт" },
  { id: "solid", label: "Закрыт" },
];


/**
 * NexRig Studio: showroom configurator (the real 3D scene with a studio environment), local
 * glTF import and the list of 3D models. Graphics cards come from
 * public/videocart/graphics_cards_specs.xlsx and install the matching catalog card.
 */
export function StudioConfigurator({ rows, error }: { rows: VideocartRow[]; error: string | null }) {
  const formatPrice = usePrice();
  const { selection, total } = useBuildDerived();
  const buildName = useBuildStore((s) => s.buildName);
  const save = useSavedBuilds((s) => s.save);
  const [mode, setMode] = useState<Mode>("build");
  const [saved, setSaved] = useState(false);

  return (
    <div className="relative flex flex-col bg-bg-0 text-fg lg:h-[calc(100dvh-var(--nav-h))] lg:overflow-hidden">
      {mode === "build" && <BuildMode rows={rows} error={error} />}
      {mode === "import" && <ModelWorkspace />}
      {mode === "inventory" && <ModelInventory />}

      {/* ── top bar (shared) ── */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-3 px-4 pt-4 lg:flex-nowrap lg:px-8 lg:pt-5">
        <Link href="/builder" aria-label="К обычному конструктору" title="К обычному конструктору" className="pointer-events-auto grid size-10 shrink-0 place-items-center rounded-full border border-line bg-bg-0/60 text-fg-2 backdrop-blur-md hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-violet">
          <IconChevron className="rotate-180" />
        </Link>
        <div className="min-w-0 flex-1 lg:flex-none lg:basis-[28%]">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-violet uppercase">NexRig Studio</p>
          <h1 className="truncate text-[19px] leading-tight font-semibold tracking-tight lg:text-[24px]">{mode === "build" ? buildName : mode === "import" ? "Импорт 3D-модели" : "Список 3D-моделей"}</h1>
        </div>
        <nav className="pointer-events-auto order-last w-full lg:order-none lg:flex lg:w-auto lg:flex-1 lg:justify-center" aria-label="Раздел Studio">
          <div className="flex rounded-full border border-line bg-bg-0/70 p-1 backdrop-blur-md" role="tablist">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={mode === m.id}
                onClick={() => setMode(m.id)}
                className={cx(
                  "flex-1 rounded-full px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-violet lg:flex-none lg:px-5",
                  mode === m.id ? "bg-violet-strong text-white shadow-[0_6px_18px_-8px_var(--violet-strong)]" : "text-fg-2 hover:text-fg",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </nav>
        {mode === "build" && (
          <div className="pointer-events-auto flex shrink-0 items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-[10.5px] font-semibold tracking-[0.12em] text-fg-3 uppercase">Итого · демо-цена</p>
              <p className="num text-[22px] leading-tight font-semibold">{formatPrice(total)}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                save(buildName, selection);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              }}
              className="flex h-10 items-center gap-2 rounded-full bg-violet-strong px-5 text-[13px] font-semibold text-white shadow-[0_8px_26px_-10px_var(--violet-strong)] transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
            >
              {saved && <IconCheck />}
              {saved ? "Сохранено" : "Сохранить"}
            </button>
          </div>
        )}
      </header>
    </div>
  );
}

function BuildMode({ rows, error }: { rows: VideocartRow[]; error: string | null }) {
  const formatPrice = usePrice();
  const { selection, resolved } = useBuildDerived();
  const perf = useBuildStore((s) => s.perf);
  const setPerf = useBuildStore((s) => s.setPerf);
  const view = useBuildStore((s) => s.view);
  const setView = useBuildStore((s) => s.setView);
  const resetCamera = useBuildStore((s) => s.resetCamera);
  const [active, setActive] = useState<NavId>("gpu");
  const [specsOpen, setSpecsOpen] = useState(false);

  const game = GAMES.find((g) => g.id === perf.gameId) ?? GAMES[0];
  const memory = memoryOf(resolved.ram, resolved.ramCount);
  const records = useVerifiedRecords([resolved.gpu?.id]).records;
  const fps = resolved.cpu && resolved.gpu ? toFpsEstimate(getPerformance({ game, cpu: resolved.cpu, gpu: resolved.gpu, settings: perf.settings, measured: records, memory }), game) : null;
  const fpsValue = fps ? (fps.averageFpsEstimate ?? fps.frameGenFps) : null;

  // Table rows → catalog cards, with a model FPS figure for the current CPU and settings.
  const gpus = hardwareRepository.byCategory("gpu");
  const options = rows.map((row) => {
    const gpu = matchCatalogGpu(row, gpus);
    const result = gpu && resolved.cpu ? getPerformance({ game, cpu: resolved.cpu, gpu, settings: perf.settings, measured: [], memory }) : null;
    const estimate = result && result.kind !== "unavailable" ? result.avgFps : null;
    const status = gpu ? evaluateCandidate(selection, gpu).status : null;
    return { row, gpu, estimate, status };
  });
  const best = options.filter((o) => o.gpu && o.estimate && o.status !== "incompatible").sort((a, b) => b.estimate! / b.gpu!.price.amountRub - a.estimate! / a.gpu!.price.amountRub)[0];
  const installedOption = resolved.gpu ? options.find((o) => o.gpu?.id === resolved.gpu?.id) : undefined;
  const alternatives = options.filter((o) => o !== installedOption);

  const nav = NAV.find((n) => n.id === active)!;
  const navIndex = NAV.findIndex((n) => n.id === active);
  const installed = active === "gpu" ? undefined : active === "storage" ? resolved.storage[0] : resolved[active as Exclude<NavId, "storage">];

  const specs: [string, string][] = [
    ["Процессор", resolved.cpu?.name ?? "—"],
    ["Видеокарта", resolved.gpu ? `${resolved.gpu.name}, ${resolved.gpu.vramGb} ГБ ${resolved.gpu.memoryType}` : "—"],
    ["Память", resolved.ram ? `${resolved.ramCount * resolved.ram.moduleSizeGb} ГБ (${resolved.ramCount}×${resolved.ram.moduleSizeGb}), ${resolved.ram.type}-${resolved.ram.speedMtps}` : "—"],
    ["Накопитель", resolved.storage.map((s) => s.name).join(", ") || "—"],
    ["Охлаждение", resolved.cooler?.name ?? "—"],
    ["Блок питания", resolved.psu?.name ?? "—"],
  ];

  const cycleCase = () => {
    const i = CASE_MODES.findIndex((m) => m.id === view.caseMode);
    setView({ caseMode: CASE_MODES[(i + 1) % CASE_MODES.length].id });
  };
  const delta = (gpu: GpuSpec) => {
    const d = gpu.price.amountRub - (resolved.gpu?.price.amountRub ?? 0);
    return `${d > 0 ? "+" : d < 0 ? "−" : "±"}${formatPrice(Math.abs(d))}`;
  };

  return (
    <>
      {/* ── scene: the centre of the page ── */}
      <div className="relative h-[60dvh] min-h-[380px] pt-[104px] lg:absolute lg:inset-0 lg:h-auto lg:pt-0">
        <SceneViewport environment="studio" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-bg-0 via-bg-0/70 to-transparent" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-bg-0 to-transparent lg:h-[270px] lg:via-bg-0/80" aria-hidden />
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-64 bg-gradient-to-r from-bg-0/80 to-transparent lg:block" aria-hidden />
        {/* view tools */}
        <div className="absolute right-4 bottom-4 flex gap-2 lg:top-[96px] lg:right-[352px] lg:bottom-auto lg:flex-col" role="toolbar" aria-label="Вид сцены">
          <ToolButton label={`Корпус: ${CASE_MODES.find((m) => m.id === view.caseMode)?.label}`} onClick={cycleCase}>
            <IconLayers width={18} height={18} />
          </ToolButton>
          <ToolButton label="Разнести детали" active={view.exploded} onClick={() => setView({ exploded: !view.exploded })}>
            <IconExplode width={18} height={18} />
          </ToolButton>
          <ToolButton label="Подписи деталей" active={view.labels} onClick={() => setView({ labels: !view.labels })}>
            <IconTag width={18} height={18} />
          </ToolButton>
          <ToolButton label="Вернуть камеру" onClick={resetCamera}>
            <IconReset width={18} height={18} />
          </ToolButton>
        </div>
      </div>

      {/* ── categories ── */}
      <nav className="order-2 border-b border-line lg:absolute lg:top-1/2 lg:left-8 lg:z-10 lg:order-none lg:-translate-y-[62%] lg:border-0" aria-label="Комплектующие">
        <ul className="scroll-thin flex gap-1 overflow-x-auto px-4 py-3 lg:flex-col lg:gap-1 lg:overflow-visible lg:p-0">
          {NAV.map((n) => {
            const on = n.id === active;
            return (
              <li key={n.id} className="shrink-0">
                <button type="button" onClick={() => setActive(n.id)} aria-current={on ? "true" : undefined} className="group flex items-center gap-3 rounded-full py-1 pr-3 pl-1 text-left focus-visible:outline-2 focus-visible:outline-violet lg:pr-2">
                  <span className={cx("grid size-9 place-items-center rounded-full border transition-[border-color,box-shadow,color,background-color]", on ? "border-violet bg-violet/15 text-fg shadow-[0_0_18px_-2px_rgb(141_125_255/0.55)]" : "border-line-strong/70 text-fg-3 group-hover:border-fg-3 group-hover:text-fg")}>
                    <CategoryIcon category={n.id} size={17} />
                  </span>
                  <span className={cx("text-[13.5px] font-medium whitespace-nowrap transition-colors", on ? "text-fg" : "text-fg-3 group-hover:text-fg-2")}>{n.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── performance: compact settings panel ── */}
      <aside className="order-4 m-4 rounded-[var(--radius-xl)] border border-line bg-panel/85 p-4 backdrop-blur-xl lg:absolute lg:top-[96px] lg:right-6 lg:z-10 lg:m-0 lg:max-h-[calc(100%-96px-270px)] lg:w-[316px] lg:overflow-y-auto" aria-label="Производительность">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[11px] font-semibold tracking-[0.1em] text-fg-3 uppercase">Производительность</h2>
          <IconGauge className="text-fg-3" width={15} height={15} />
        </div>
        <div className="mt-3 flex items-end gap-2">
          <span className="num text-[46px] leading-none font-semibold text-cyan">{fpsValue !== null ? `${fps?.level === "verified" ? "" : "~"}${fpsValue}` : "—"}</span>
          <span className="pb-1 text-[13px] font-semibold text-fg-2">FPS</span>
          <span className="ml-auto pb-1 text-right text-[11.5px] leading-tight text-fg-3">{fps ? LEVEL_LABEL[fps.level] : "Нужны процессор и видеокарта"}</span>
        </div>
        <label className="mt-3 block">
          <span className="sr-only">Игра</span>
          <select value={game.id} onChange={(e) => setPerf({ gameId: e.target.value })} className="h-9 w-full rounded-[var(--radius-md)] border border-line bg-bg-1 px-2.5 text-[13px] text-fg outline-none hover:border-line-strong focus:border-violet/60">
            {GAMES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <Segmented<GraphicsPreset> size="sm" label="Пресет графики" value={perf.settings.preset} onChange={(preset) => setPerf({ settings: { preset } })} options={PRESETS} />
          <Segmented<Resolution> size="sm" label="Разрешение" value={perf.settings.resolution} onChange={(resolution) => setPerf({ settings: { resolution } })} options={RESOLUTIONS.map((r) => ({ value: r, label: r }))} />
        </div>
        <button type="button" onClick={() => setSpecsOpen((v) => !v)} aria-expanded={specsOpen} className="mt-3 flex w-full items-center justify-between border-t border-line pt-3 text-[12.5px] text-fg-2 hover:text-fg">
          Характеристики сборки
          <IconChevron width={13} height={13} className={cx("transition-transform", specsOpen && "rotate-90")} />
        </button>
        {specsOpen && (
          <dl className="mt-2.5 space-y-2.5">
            {specs.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] text-fg-3">{k}</dt>
                <dd className="text-[12.5px] leading-snug">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </aside>

      {/* ── choice tray ── */}
      <section className="order-3 flex flex-col gap-5 px-4 py-5 lg:absolute lg:inset-x-0 lg:bottom-0 lg:z-10 lg:flex-row lg:items-end lg:gap-8 lg:px-8 lg:pt-0 lg:pb-6" aria-label={nav.label}>
        <div className="lg:w-[300px] lg:shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-[28px] leading-none font-semibold tracking-tight lg:text-[34px]">{nav.label}</h2>
            <button type="button" onClick={() => setActive(NAV[(navIndex + 1) % NAV.length].id)} aria-label="Следующая категория" className="grid size-8 place-items-center rounded-full border border-line bg-bg-0/60 text-fg-2 hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-violet">
              <IconChevron width={14} height={14} />
            </button>
          </div>
          <p className="mt-2.5 text-[13px] leading-relaxed text-fg-2">{nav.text}</p>
          {active === "gpu" && <p className="mt-2 text-[11.5px] leading-relaxed text-fg-3">Модели и характеристики — из graphics_cards_specs.xlsx ({rows.length}). Цены демонстрационные, FPS — оценка модели.</p>}
        </div>

        {active === "gpu" ? (
          error ? (
            <p className="rounded-[var(--radius-lg)] border border-bad/40 bg-bg-0/70 p-4 text-[13px] text-fg-2 lg:max-w-xl">Таблица видеокарт не прочитана: {error}</p>
          ) : rows.length === 0 ? (
            <p className="rounded-[var(--radius-lg)] border border-line bg-bg-0/70 p-4 text-[13px] text-fg-2 lg:max-w-xl">В таблице graphics_cards_specs.xlsx нет строк с моделями.</p>
          ) : (
            <div className="flex min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:items-end">
              {/* the installed card: one emphasised block */}
              <div className="rounded-[var(--radius-xl)] border border-violet/50 bg-[linear-gradient(140deg,rgb(116_98_255/0.22),rgb(16_20_31/0.85)_55%)] p-4 backdrop-blur-md lg:w-[300px] lg:shrink-0">
                <p className="text-[11px] font-semibold tracking-[0.1em] text-violet uppercase">В сборке</p>
                {installedOption && resolved.gpu ? (
                  <>
                    <p className="mt-1.5 text-[18px] leading-snug font-semibold">{installedOption.row.model}</p>
                    <p className="text-[12px] text-fg-3">{resolved.gpu.name}</p>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
                      <div>
                        <dt className="text-fg-3">Память</dt>
                        <dd className="num font-medium">{resolved.gpu.vramGb} ГБ</dd>
                      </div>
                      <div>
                        <dt className="text-fg-3">Тип</dt>
                        <dd className="font-medium">{installedOption.row.memoryType}</dd>
                      </div>
                      <div>
                        <dt className="text-fg-3">FPS</dt>
                        <dd className="num font-medium text-cyan">{installedOption.estimate !== null ? `~${installedOption.estimate}` : "—"}</dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-[11.5px] text-fg-3">Архитектура {installedOption.row.architecture} · {formatPrice(resolved.gpu.price.amountRub)}</p>
                  </>
                ) : (
                  <>
                    <p className="mt-1.5 text-[16px] font-semibold">{resolved.gpu ? resolved.gpu.name : "Видеокарта не выбрана"}</p>
                    <p className="mt-1 text-[12px] text-fg-3">{resolved.gpu ? "Этой модели нет в таблице — выберите вариант справа." : "Выберите модель из таблицы — она встанет в корпус."}</p>
                  </>
                )}
              </div>

              {/* alternatives: a compact list, not a wall of identical cards */}
              <ul className="scroll-thin grid min-w-0 flex-1 gap-1 rounded-[var(--radius-xl)] border border-line bg-bg-0/75 p-1.5 backdrop-blur-md lg:auto-cols-[minmax(250px,1fr)] lg:grid-flow-col lg:grid-rows-3 lg:overflow-x-auto" aria-label="Другие видеокарты">
                {alternatives.map(({ row, gpu, estimate, status }) => {
                  const isBest = Boolean(best && gpu && best.gpu?.id === gpu.id);
                  const incompatible = status === "incompatible";
                  return (
                    <li key={row.model}>
                      <button
                        type="button"
                        disabled={!gpu}
                        onClick={() => gpu && requestInstall(gpu)}
                        title={gpu ? `${row.vendor} ${row.model} → ${gpu.name}` : "Этой модели нет в каталоге"}
                        className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-[var(--radius-md)] px-3 py-2 text-left transition-colors hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-violet disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[13.5px] font-medium group-hover:text-fg">{row.model}</span>
                            {isBest && <span className="shrink-0 rounded-full bg-violet/15 px-1.5 py-px text-[10px] font-semibold text-violet">FPS/цена</span>}
                          </span>
                          <span className="block truncate text-[11.5px] text-fg-3">
                            {row.vendor} · {row.memory} {row.memoryType} · {row.architecture}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="num block text-[12.5px] font-medium">{gpu ? delta(gpu) : "нет в каталоге"}</span>
                          <span className={cx("num block text-[11.5px]", incompatible ? "text-bad" : "text-fg-3")}>{incompatible ? "несовместима" : estimate !== null ? `~${estimate} FPS` : ""}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )
        ) : (
          <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-xl)] border border-line bg-bg-0/75 p-4 backdrop-blur-md lg:max-w-[560px]">
            <ComponentThumb component={installed} category={active as ComponentCategory} size={60} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold tracking-[0.1em] text-fg-3 uppercase">Сейчас в сборке</p>
              <p className="truncate text-[16px] font-medium">{installed?.name ?? "Не выбрано"}</p>
              {installed && <p className="num text-[13px] text-fg-2">{formatPrice(installed.price.amountRub)}</p>}
            </div>
            <Link href="/builder" className="inline-flex h-9 items-center rounded-[var(--radius-md)] border border-line bg-panel-2 px-3.5 text-[13px] font-medium hover:border-line-strong hover:bg-panel-3">
              Изменить в конструкторе
            </Link>
            <p className="w-full text-[11.5px] text-fg-3">В Studio из таблицы подключены видеокарты; остальные детали пока меняются в обычном конструкторе.</p>
          </div>
        )}
      </section>

      <ConflictDialog />
    </>
  );
}
