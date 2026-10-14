"use client";

import { useMemo, useState } from "react";
import { usePrice } from "@/features/settings/currency";
import { GAMES } from "@/data/games";
import { useSavedBuilds } from "@/features/build-state/saved-builds";
import { useBuildStore } from "@/features/build-state/store";
import { checkBuild } from "@/features/compatibility/engine";
import { getPerformance, memoryOf } from "@/lib/benchmark-engine/estimate";
import { resolveBuild, totalPrice } from "@/lib/hardware/repository";
import { useMessages } from "@/lib/i18n";
import type { BuildSelection } from "@/types/build";
import { CATEGORY_ORDER } from "@/types/hardware";
import { cx, EmptyState, Field, Select, StatusPill } from "@/components/ui/primitives";

const CURRENT = "__current__";

export function ComparePanel() {
  const formatPrice = usePrice();
  const t = useMessages();
  const builds = useSavedBuilds((s) => s.builds);
  const current = useBuildStore((s) => s.selection);
  const perf = useBuildStore((s) => s.perf);
  const [a, setA] = useState(CURRENT);
  const [b, setB] = useState<string>("");

  const options = [{ value: CURRENT, label: "Текущая сборка" }, ...builds.map((x) => ({ value: x.id, label: x.name }))];
  const sel = (id: string): BuildSelection | null => (id === CURRENT ? current : builds.find((x) => x.id === id)?.selection ?? null);
  const bId = b || builds[0]?.id || "";
  const A = sel(a);
  const B = sel(bId);
  const game = GAMES.find((g) => g.id === perf.gameId);

  const summary = useMemo(() => {
    const one = (s: BuildSelection | null) => {
      if (!s) return null;
      const r = resolveBuild(s);
      return { r, total: totalPrice(r), report: checkBuild(s), fps: getPerformance({ game, cpu: r.cpu, gpu: r.gpu, settings: perf.settings, measured: [], memory: memoryOf(r.ram, r.ramCount) }) };
    };
    return { a: one(A), b: one(B) };
  }, [A, B, game, perf.settings]);

  if (builds.length === 0) {
    return <EmptyState title="Нечего сравнивать">Сохраните хотя бы одну сборку — её можно будет сравнить с текущей.</EmptyState>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Field label="A">
          <Select label="Сборка A" value={a} onChange={setA} options={options} />
        </Field>
        <Field label="B">
          <Select label="Сборка B" value={bId} onChange={setB} options={options} />
        </Field>
      </div>
      {summary.a && summary.b && (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-line">
          <table className="w-full table-fixed text-[11.5px]">
            <tbody className="divide-y divide-line">
              {CATEGORY_ORDER.map((cat) => {
                const na = cat === "storage" ? summary.a!.r.storage.map((s) => s.name).join(", ") : summary.a!.r[cat]?.name;
                const nb = cat === "storage" ? summary.b!.r.storage.map((s) => s.name).join(", ") : summary.b!.r[cat]?.name;
                const diff = (na || "") !== (nb || "");
                return (
                  <tr key={cat} className={cx(diff && "bg-violet-soft/40")}>
                    <th scope="row" className="w-20 px-2 py-1.5 text-left font-normal text-fg-3">
                      {t.categoriesShort[cat]}
                    </th>
                    <td className="truncate px-2 py-1.5 text-fg-2" title={na}>
                      {na || "—"}
                    </td>
                    <td className="truncate px-2 py-1.5 text-fg-2" title={nb}>
                      {nb || "—"}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <th scope="row" className="px-2 py-1.5 text-left font-normal text-fg-3">
                  {t.sidebar.total}
                </th>
                <td className="num px-2 py-1.5">{formatPrice(summary.a.total)}</td>
                <td className="num px-2 py-1.5">{formatPrice(summary.b.total)}</td>
              </tr>
              <tr>
                <th scope="row" className="px-2 py-1.5 text-left font-normal text-fg-3">
                  {game?.title.split(" ")[0]}
                </th>
                {[summary.a, summary.b].map((s, i) => (
                  <td key={i} className="num px-2 py-1.5">
                    {s.fps.kind === "unavailable" ? "—" : `~${s.fps.avgFps} FPS`}
                    {s.fps.kind === "estimated" && <span className="ml-1 text-[10px] text-fg-3">оценка</span>}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="px-2 py-1.5 text-left font-normal text-fg-3">
                  Совм.
                </th>
                <td className="px-2 py-1.5">
                  <StatusPill status={summary.a.report.overall} size="xs" />
                </td>
                <td className="px-2 py-1.5">
                  <StatusPill status={summary.b.report.overall} size="xs" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-fg-3">
        FPS — оценка модели для «{game?.title}», {perf.settings.resolution}. Цены демонстрационные.
      </p>
    </div>
  );
}
