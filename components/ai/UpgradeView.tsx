"use client";

import { useState } from "react";
import { CURRENCIES, toRub, useCurrency } from "@/features/settings/currency";
import { GAMES } from "@/data/games";
import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore } from "@/features/build-state/store";
import { upgradeAgent } from "@/lib/agents/specialists";
import { useMessages } from "@/lib/i18n";
import { PerformanceControls } from "@/components/benchmarks/PerformanceControls";
import { ConflictDialog } from "@/components/builder/ConflictDialog";
import { EmptyState, Field, inputCls, SectionTitle, Segmented, Switch } from "@/components/ui/primitives";
import { AgentCard } from "./AgentCard";
import { sortUpgrades, UpgradeRow, useUpgradeOptions, type UpgradeSort } from "./UpgradeList";

export function UpgradeView() {
  const t = useMessages();
  const { selection, resolved } = useBuildDerived();
  const perf = useBuildStore((s) => s.perf);
  const setPerf = useBuildStore((s) => s.setPerf);
  const [kind, setKind] = useState<"all" | "gpu" | "cpu">("all");
  const [sort, setSort] = useState<UpgradeSort>("value");
  const [budget, setBudget] = useState("");
  const [hideIncompatible, setHideIncompatible] = useState(true);
  const currency = useCurrency();
  const symbol = CURRENCIES.find((c) => c.id === currency)?.symbol ?? "₽";
  // The budget is typed in the display currency and converted to RUB (catalogue currency).
  const budgetRub = Number(budget) > 0 ? Math.round(toRub(Number(budget), currency)) : undefined;

  const { current, options } = useUpgradeOptions(selection, perf.gameId, perf.settings);
  const list = sortUpgrades(options, sort, { kind, budget: budgetRub, hideIncompatible });
  const game = GAMES.find((g) => g.id === perf.gameId) ?? GAMES[0];
  // Memoized by the React Compiler.
  const agent = upgradeAgent(selection, game, perf.settings, budgetRub);

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 px-4 py-6 md:px-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{t.nav.upgrade}</h1>
        <p className="max-w-3xl text-sm text-fg-3">
          Кандидаты ранжируются по стоимости одного дополнительного кадра в выбранной игре. Совместимость проверяется детерминированно для каждой замены; прирост — оценка модели, цены — демонстрационные.
        </p>
      </header>

      <section className="space-y-4 rounded-[var(--radius-lg)] border border-line bg-panel p-4">
        <PerformanceControls layout="row" gameId={perf.gameId} settings={perf.settings} gpu={resolved.gpu} onGame={(gameId) => setPerf({ gameId })} onSettings={(settings) => setPerf({ settings })} />
        <div className="flex flex-wrap items-end gap-4 border-t border-line pt-4">
          <Field label={`Бюджет, ${symbol}`}>
            <input inputMode="numeric" placeholder="без ограничения" className={`${inputCls} w-44`} value={budget} onChange={(e) => setBudget(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Компонент">
            <Segmented
              label="Компонент"
              value={kind}
              onChange={setKind}
              options={[
                { value: "all", label: "Все" },
                { value: "gpu", label: "GPU" },
                { value: "cpu", label: "CPU" },
              ]}
            />
          </Field>
          <Field label="Сортировка">
            <Segmented<UpgradeSort>
              label="Сортировка"
              value={sort}
              onChange={setSort}
              options={[
                { value: "value", label: `${symbol} за кадр` },
                { value: "gain", label: "Прирост" },
                { value: "price", label: "Цена" },
              ]}
            />
          </Field>
          <div className="pb-1.5">
            <Switch checked={hideIncompatible} onChange={setHideIncompatible} label="Скрыть несовместимые" />
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-3">
          <SectionTitle>
            Кандидаты · сейчас {current !== null ? `~${current} FPS (оценка)` : "нет оценки"}
          </SectionTitle>
          {list.length === 0 ? (
            <EmptyState title="Подходящих вариантов нет">Измените бюджет, фильтры или добавьте CPU и GPU в сборку.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {list.map((o) => (
                <UpgradeRow key={o.component.id} o={o} current={current} />
              ))}
            </ul>
          )}
        </section>
        <aside className="space-y-3">
          <SectionTitle>Вывод агента апгрейда</SectionTitle>
          <AgentCard result={agent} defaultOpen />
        </aside>
      </div>
      <ConflictDialog />
    </div>
  );
}
