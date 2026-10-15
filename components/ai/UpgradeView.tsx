"use client";

import Link from "next/link";
import { useState } from "react";
import { CURRENCIES, toRub, useCurrency } from "@/features/settings/currency";
import { GAMES } from "@/data/games";
import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore } from "@/features/build-state/store";
import { upgradeAgent } from "@/lib/agents/specialists";
import { PerformanceControls } from "@/components/benchmarks/PerformanceControls";
import { ConflictDialog } from "@/components/builder/ConflictDialog";
import { ComponentThumb } from "@/components/hardware/ComponentThumb";
import { IconArrowUp, IconCube } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, cx, inputCls, Switch } from "@/components/ui/primitives";
import { EmptyPanel, PageShell, Surface } from "@/components/ui/studio";
import { AgentCard } from "./AgentCard";
import { sortUpgrades, UpgradeCard, useUpgradeOptions, type UpgradeSort } from "./UpgradeList";

const PAGE = 12;

function OptionList<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[] }) {
  return (
    <fieldset>
      <legend className="eyebrow mb-2">{label}</legend>
      <div className="space-y-1" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cx(
              "flex h-10 w-full items-center justify-between gap-2 rounded-[var(--radius-md)] px-3 text-left text-[14px] transition-colors",
              value === o.value ? "bg-[var(--selected-bg)] text-fg ring-1 ring-[var(--selected-border)]" : "text-fg-2 hover:bg-[var(--hover-bg)] hover:text-fg",
            )}
          >
            <span>{o.label}</span>
            {o.hint && <span className="num text-[12px] text-fg-3">{o.hint}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Upgrade advisor. Wide layout: scenario on top, filters in a sidebar, results as a card grid with
 * the three best candidates emphasised. All gains are model estimates and say so.
 */
export function UpgradeView() {
  const { selection, resolved } = useBuildDerived();
  const perf = useBuildStore((s) => s.perf);
  const setPerf = useBuildStore((s) => s.setPerf);
  const [kind, setKind] = useState<"all" | "gpu" | "cpu">("all");
  const [sort, setSort] = useState<UpgradeSort>("value");
  const [budget, setBudget] = useState("");
  const [hideIncompatible, setHideIncompatible] = useState(true);
  const [onlyGain, setOnlyGain] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const currency = useCurrency();
  const symbol = CURRENCIES.find((c) => c.id === currency)?.symbol ?? "₽";
  // The budget is typed in the display currency and converted to RUB (catalogue currency).
  const budgetRub = Number(budget) > 0 ? Math.round(toRub(Number(budget), currency)) : undefined;

  const { current, options } = useUpgradeOptions(selection, perf.gameId, perf.settings);
  const all = sortUpgrades(options, sort, { kind, budget: budgetRub, hideIncompatible });
  // Display filter only: candidates that would not add frames (or lose them) are hidden by default.
  const list = onlyGain ? all.filter((o) => (o.gainPct ?? 0) > 0) : all;
  const game = GAMES.find((g) => g.id === perf.gameId) ?? GAMES[0];
  // Memoized by the React Compiler.
  const agent = upgradeAgent(selection, game, perf.settings, budgetRub);
  const counts = { all: options.filter((o) => o.gainPct !== null).length, gpu: options.filter((o) => o.kind === "gpu" && o.gainPct !== null).length, cpu: options.filter((o) => o.kind === "cpu" && o.gainPct !== null).length };
  const missingParts = !resolved.cpu || !resolved.gpu;
  // Candidates exist but the model gives none of them a gain: the other part is the limit.
  const noGainOnly = onlyGain && kind !== "all" && all.length > 0 && list.length === 0;
  const filtersActive = kind !== "all" || Boolean(budgetRub) || onlyGain || hideIncompatible;
  const resetFilters = () => {
    setKind("all");
    setBudget("");
    setOnlyGain(false);
    setHideIncompatible(false);
    setLimit(PAGE);
  };

  const featured = list.slice(0, 3);
  const rest = list.slice(3, limit);

  return (
    <PageShell className="space-y-8">
      <PageHeader
        section="Апгрейд"
        title="Что даст больше FPS за ваши деньги"
        description={`Замены процессора и видеокарты для текущей сборки, отсортированные по цене одного дополнительного кадра в ${game.title}. Прирост — оценка модели, а не замер; цены — демонстрационные.`}
        aside={
          <Surface as="div" className="flex w-full max-w-md items-center gap-4 p-4 sm:w-auto">
            <div className="flex -space-x-2">
              <ComponentThumb component={resolved.cpu} category="cpu" size={48} />
              <ComponentThumb component={resolved.gpu} category="gpu" size={48} />
            </div>
            <div className="min-w-0">
              <p className="eyebrow">Сейчас в сборке</p>
              <p className="truncate text-[14px] font-medium">{resolved.gpu?.name ?? "Видеокарта не выбрана"}</p>
              <p className="truncate text-[13px] text-fg-3">{resolved.cpu?.name ?? "Процессор не выбран"}</p>
            </div>
            <div className="ml-auto pl-2 text-right">
              <p className="eyebrow">{perf.settings.resolution}</p>
              <p className="num text-[28px] leading-none font-semibold">{current !== null ? `~${current}` : "—"}</p>
              <p className="text-[11.5px] text-fg-3">FPS · модель</p>
            </div>
          </Surface>
        }
      />

      <Surface className="p-5 md:p-6" aria-label="Сценарий">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-start">
          <PerformanceControls layout="row" gameId={perf.gameId} settings={perf.settings} gpu={resolved.gpu} onGame={(gameId) => setPerf({ gameId })} onSettings={(settings) => setPerf({ settings })} />
          <label className="block">
            <span className="eyebrow">Бюджет, {symbol}</span>
            <input
              inputMode="numeric"
              placeholder="без ограничения"
              className={cx(inputCls, "mt-1.5 h-11 text-[15px]")}
              value={budget}
              onChange={(e) => {
                setBudget(e.target.value.replace(/\D/g, ""));
                setLimit(PAGE);
              }}
            />
          </label>
        </div>
      </Surface>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-6 lg:sticky lg:top-[calc(var(--nav-h)+24px)] lg:self-start" aria-label="Фильтры">
          <OptionList
            label="Что менять"
            value={kind}
            onChange={(v) => {
              setKind(v);
              setLimit(PAGE);
            }}
            options={[
              { value: "all", label: "Всё", hint: String(counts.all) },
              { value: "gpu", label: "Видеокарту", hint: String(counts.gpu) },
              { value: "cpu", label: "Процессор", hint: String(counts.cpu) },
            ]}
          />
          <OptionList
            label="Сортировка"
            value={sort}
            onChange={setSort}
            options={[
              { value: "value", label: `Цена за кадр (${symbol})` },
              { value: "gain", label: "Наибольший прирост" },
              { value: "price", label: "Сначала дешевле" },
            ]}
          />
          <div className="space-y-3">
            <p className="eyebrow">Показывать</p>
            <Switch checked={onlyGain} onChange={setOnlyGain} label="Только с приростом FPS" />
            <Switch checked={hideIncompatible} onChange={setHideIncompatible} label="Без несовместимых" />
          </div>
          <details className="group rounded-[var(--radius-lg)] bg-panel/60 ring-1 ring-white/[0.06]">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[13.5px] font-medium">
              Как считалось
              <span className="text-[12px] text-fg-3 group-open:hidden">агент и источники</span>
            </summary>
            <div className="px-2 pb-2">
              <AgentCard result={agent} defaultOpen />
            </div>
          </details>
        </aside>

        <section className="min-w-0 space-y-6" aria-label="Кандидаты">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[20px] font-semibold tracking-tight">
              {list.length ? `Найдено ${list.length} ${list.length === 1 ? "вариант" : list.length < 5 ? "варианта" : "вариантов"}` : "Вариантов нет"}
            </h2>
            <p className="text-[13px] text-fg-3">FPS и прирост — оценка модели для {perf.settings.resolution}, не результаты тестов</p>
          </div>

          {list.length === 0 ? (
            missingParts ? (
              <EmptyPanel
                icon={<IconCube />}
                title={!resolved.gpu ? "В сборке нет видеокарты" : "В сборке нет процессора"}
                actions={
                  <Link href="/builder" className="inline-flex h-10 items-center rounded-[var(--radius-md)] bg-violet-strong px-4 text-[14px] font-semibold text-white hover:bg-violet">
                    Открыть конструктор
                  </Link>
                }
              >
                Прирост считается относительно текущей сборки. Добавьте {!resolved.gpu ? "видеокарту" : "процессор"} в конструкторе — и здесь появятся замены с оценкой FPS и ценой за кадр.
              </EmptyPanel>
            ) : (
              <EmptyPanel
                icon={<IconArrowUp />}
                title={noGainOnly ? `Замена ${kind === "cpu" ? "процессора" : "видеокарты"} не добавит кадров` : "Под эти условия замен не нашлось"}
                actions={
                  filtersActive ? (
                    <>
                      <Button variant="primary" onClick={resetFilters}>
                        Сбросить фильтры
                      </Button>
                      {budgetRub && (
                        <Button variant="secondary" onClick={() => setBudget("")}>
                          Убрать бюджет
                        </Button>
                      )}
                    </>
                  ) : undefined
                }
              >
                {noGainOnly && `По оценке модели ни один из ${all.length} вариантов не поднимает FPS в ${game.title} при этих настройках — ограничивает не ${kind === "cpu" ? "процессор" : "видеокарта"}. Посмотрите замены ${kind === "cpu" ? "видеокарты" : "процессора"} или другое разрешение. `}
                {budgetRub ? "Попробуйте увеличить бюджет или показать замены без прироста. " : ""}
                Сейчас скрыты {onlyGain ? "варианты без прироста" : ""}
                {onlyGain && hideIncompatible ? " и " : ""}
                {hideIncompatible ? "несовместимые с вашей платой или блоком питания" : ""}
                {!onlyGain && !hideIncompatible ? "только варианты без оценки FPS" : ""}.
              </EmptyPanel>
            )
          ) : (
            <>
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {featured.map((o, i) => (
                  <UpgradeCard key={o.component.id} o={o} current={current} featured rank={i + 1} />
                ))}
              </div>
              {rest.length > 0 && (
                <>
                  <h3 className="eyebrow pt-2">Другие варианты</h3>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {rest.map((o) => (
                      <UpgradeCard key={o.component.id} o={o} current={current} />
                    ))}
                  </div>
                </>
              )}
              {list.length > limit && (
                <Button variant="secondary" className="h-11 w-full text-[14px]" onClick={() => setLimit((l) => l + PAGE)}>
                  Показать ещё ({list.length - limit})
                </Button>
              )}
            </>
          )}
        </section>
      </div>
      <ConflictDialog />
    </PageShell>
  );
}
