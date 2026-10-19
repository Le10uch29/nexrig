"use client";

import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore } from "@/features/build-state/store";
import { computeFit } from "@/features/installation/fit";
import { usePrice } from "@/features/settings/currency";
import { FAN_POSITIONS, fanCountOf, fanPacksOf } from "@/lib/hardware/repository";
import type { FanLayout, FanPosition } from "@/types/hardware";
import { IconPlus } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";

const LABEL: Record<FanPosition, string> = { front: "Спереди", side: "Сбоку", top: "Сверху", rear: "Сзади", bottom: "Снизу" };

/**
 * How many case fans go where. Limits come from the case's mounts and the physical room left by
 * the GPU, radiator and drives (computeFit), so the 3D scene and the compatibility check agree.
 */
export function FanLayoutEditor() {
  const formatPrice = usePrice();
  const { resolved } = useBuildDerived();
  const setFanLayout = useBuildStore((s) => s.setFanLayout);
  const fans = resolved.fans;
  const pcCase = resolved.case;
  if (!fans) return null;
  const fit = pcCase ? computeFit(resolved)?.fans : undefined;
  const manual = Boolean(resolved.fanLayout);
  // Manual layout, or what the automatic placement did — the starting point for edits.
  const current: FanLayout = resolved.fanLayout ?? fit?.placedBy ?? {};
  const total = fanCountOf(resolved);
  const packs = fanPacksOf(resolved);
  const dual = pcCase?.layout === "dual-chamber";
  const positions = FAN_POSITIONS.filter((p) => (pcCase?.fanMounts[p] ?? 0) > 0);
  const columnUsed = (current.front ?? 0) + (current.side ?? 0);
  const sum = FAN_POSITIONS.reduce((s, p) => s + (current[p] ?? 0), 0);

  const change = (pos: FanPosition, delta: number) => {
    const next: FanLayout = { ...current, [pos]: Math.max(0, (current[pos] ?? 0) + delta) };
    setFanLayout(next);
  };

  return (
    <div className="rounded-[var(--radius-md)] border border-violet/30 bg-violet-soft/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-medium text-fg-2">Где стоят вентиляторы</span>
        <div className="flex rounded-[var(--radius-sm)] border border-line bg-bg-1 p-0.5" role="radiogroup" aria-label="Раскладка вентиляторов">
          <button type="button" role="radio" aria-checked={!manual} onClick={() => setFanLayout(null)} className={cx("rounded-[5px] px-2 py-0.5 text-[11px] font-medium", !manual ? "bg-panel-3 text-fg" : "text-fg-3 hover:text-fg-2")}>
            Авто
          </button>
          <button type="button" role="radio" aria-checked={manual} onClick={() => !manual && sum > 0 && setFanLayout(current)} disabled={!fit || sum === 0} className={cx("rounded-[5px] px-2 py-0.5 text-[11px] font-medium disabled:opacity-40", manual ? "bg-panel-3 text-fg" : "text-fg-3 hover:text-fg-2")}>
            Вручную
          </button>
        </div>
      </div>

      {!pcCase ? (
        <p className="mt-2 text-[11.5px] text-fg-3">Выберите корпус — места для вентиляторов зависят от него.</p>
      ) : !fit ? (
        <p className="mt-2 text-[11.5px] text-fg-3">Нет данных о местах крепления.</p>
      ) : (
        <>
          <ul className="mt-2 space-y-1">
            {positions.map((pos) => {
              const n = current[pos] ?? 0;
              const cap = fit.capacity[pos] ?? 0;
              const inColumn = pos === "front" || pos === "side";
              const roomLeft = inColumn ? fit.columnSlots - columnUsed : Infinity;
              const canAdd = n < cap && roomLeft > 0 && sum < pcCase.fanSlots120;
              const canRemove = n > 0 && sum > 1;
              const mounts = pcCase.fanMounts[pos] ?? 0;
              const hint =
                cap === 0
                  ? pos === "bottom"
                    ? "нет места: накопители или видеокарта"
                    : inColumn
                      ? fit.frontBlockedByRadiator
                        ? "занято радиатором"
                        : "нет места: длинная видеокарта"
                      : "нет места"
                  : cap < mounts
                    ? `влезает ${cap} из ${mounts}`
                    : `до ${cap}`;
              return (
                <li key={pos} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] text-fg">
                      {LABEL[pos]}
                      {pos === "side" && dual && <span className="text-fg-3"> · справа от платы</span>}
                    </span>
                    <span className={cx("block text-[10.5px]", cap === 0 ? "text-warn" : "text-fg-3")}>{hint}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => change(pos, -1)} disabled={!canRemove} aria-label={`Убрать вентилятор: ${LABEL[pos]}`} className="grid size-7 place-items-center rounded-[var(--radius-sm)] border border-line bg-panel-2 text-[15px] leading-none text-fg-2 hover:border-line-strong hover:text-fg disabled:opacity-30">
                      −
                    </button>
                    <span className="num w-5 text-center text-[13px] font-semibold" aria-live="polite">
                      {n}
                    </span>
                    <button type="button" onClick={() => change(pos, 1)} disabled={!canAdd} aria-label={`Добавить вентилятор: ${LABEL[pos]}`} className="grid size-7 place-items-center rounded-[var(--radius-sm)] border border-line bg-panel-2 text-fg-2 hover:border-line-strong hover:text-fg disabled:opacity-30">
                      <IconPlus width={13} height={13} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          {fit.columnSlots > 0 && (pcCase.fanMounts.front ?? 0) > 0 && (pcCase.fanMounts.side ?? 0) > 0 && <p className="mt-1.5 text-[10.5px] text-fg-3">Спереди и сбоку — одна колонна: вместе до {fit.columnSlots}.</p>}
        </>
      )}
      <p className="mt-2 border-t border-line pt-2 text-[11px] leading-snug text-fg-2">
        Всего <span className="num font-semibold text-fg">{total}</span> шт. · {packs} {packs === 1 ? "упаковка" : packs < 5 ? "упаковки" : "упаковок"} по {fans.count} = <span className="num">{formatPrice(fans.price.amountRub * packs)}</span>
        {pcCase && <span className="text-fg-3"> · в корпусе мест: {pcCase.fanSlots120}</span>}
      </p>
    </div>
  );
}
