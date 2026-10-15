"use client";

import { useMemo } from "react";
import { usePrice } from "@/features/settings/currency";
import { GAMES } from "@/data/games";
import { requestInstall } from "@/features/build-state/install-action";
import { upgradeOptions, type UpgradeOption } from "@/lib/agents/specialists";
import { useMessages } from "@/lib/i18n";
import type { GameSettings } from "@/types/benchmark";
import type { BuildSelection } from "@/types/build";
import { ComponentThumb } from "@/components/hardware/ComponentThumb";
import { Badge, Button, cx, EmptyState, StatusPill } from "@/components/ui/primitives";
import { ProductStage } from "@/components/ui/studio";

export type UpgradeSort = "value" | "gain" | "price";

export function useUpgradeOptions(selection: BuildSelection, gameId: string, settings: GameSettings) {
  return useMemo(() => {
    const game = GAMES.find((g) => g.id === gameId) ?? GAMES[0];
    return upgradeOptions(selection, game, settings);
  }, [selection, gameId, settings]);
}

export function sortUpgrades(options: UpgradeOption[], sort: UpgradeSort, opts: { kind?: "gpu" | "cpu" | "all"; budget?: number; hideIncompatible?: boolean } = {}) {
  return options
    .filter((o) => (opts.kind && opts.kind !== "all" ? o.kind === opts.kind : true))
    .filter((o) => (opts.budget ? o.priceRub <= opts.budget : true))
    .filter((o) => (opts.hideIncompatible ? o.compatibility !== "incompatible" : true))
    .filter((o) => o.gainPct !== null)
    .sort((a, b) => {
      if (sort === "gain") return (b.gainPct ?? -999) - (a.gainPct ?? -999);
      if (sort === "price") return a.priceRub - b.priceRub;
      return (a.rubPerFps ?? Infinity) - (b.rubPerFps ?? Infinity);
    });
}

export function UpgradeRow({ o, current }: { o: UpgradeOption; current: number | null }) {
  const formatPrice = usePrice();
  const t = useMessages();
  const gain = o.gainPct ?? 0;
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-line bg-panel-2/50 p-2.5">
      <ComponentThumb component={o.component} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Badge tone={o.kind === "gpu" ? "violet" : "cyan"}>{o.kind.toUpperCase()}</Badge>
          <p className="truncate text-[12.5px] font-medium">{o.component.name}</p>
        </div>
        <p className="num mt-1 text-[11px] break-words text-fg-3">
          {current !== null ? `${current} → ` : ""}~{o.fps ?? "—"} FPS ·{" "}
          <span className={cx(gain > 0 ? "text-ok" : gain < 0 ? "text-bad" : "text-fg-3")}>
            {gain > 0 ? "+" : ""}
            {gain}%
          </span>{" "}
          · {formatPrice(o.priceRub)}
          {o.rubPerFps !== null && <> · {formatPrice(o.rubPerFps)}/FPS</>}
        </p>
        {o.notes.length > 0 && <p className="mt-0.5 text-[11px] text-warn">{o.notes.join(" · ")}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 max-sm:w-full max-sm:flex-row max-sm:items-center max-sm:justify-between">
        <StatusPill status={o.compatibility} size="xs" />
        <Button size="sm" variant="secondary" onClick={() => requestInstall(o.component)}>
          {t.catalog.install}
        </Button>
      </div>
    </li>
  );
}

/**
 * Candidate card for the upgrade page. All FPS figures here come from the relative-performance
 * model (no measurements), so they are prefixed with "~" and labelled as an estimate.
 */
export function UpgradeCard({ o, current, featured = false, rank }: { o: UpgradeOption; current: number | null; featured?: boolean; rank?: number }) {
  const formatPrice = usePrice();
  const t = useMessages();
  const gain = o.gainPct ?? 0;
  return (
    <article className={cx("group flex flex-col overflow-hidden rounded-[var(--radius-xl)] bg-panel ring-1 ring-white/[0.06] transition-[box-shadow,transform] duration-200 hover:ring-violet/40", featured && "ring-violet/30")}>
      <div className="relative">
        <ProductStage component={o.component} size={featured ? 132 : 96} className={featured ? "h-48" : "h-36"} />
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          {rank !== undefined && <span className="num grid size-6 place-items-center rounded-full bg-violet-strong text-[12px] font-semibold text-white">{rank}</span>}
          <Badge tone={o.kind === "gpu" ? "violet" : "cyan"}>{o.kind === "gpu" ? "Видеокарта" : "Процессор"}</Badge>
        </div>
        <div className="absolute top-3 right-3">
          <StatusPill status={o.compatibility} size="xs" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <h3 className={cx("leading-snug font-semibold", featured ? "text-[17px]" : "text-[15px]")}>{o.component.name}</h3>
          <p className="num mt-0.5 text-[13px] text-fg-2">{formatPrice(o.priceRub)}</p>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">FPS · оценка модели</p>
            <p className="num mt-1 text-[15px] text-fg-2">
              {current !== null ? <span className="text-fg-3">~{current} → </span> : null}
              <span className={cx("font-semibold text-fg", featured ? "text-[28px]" : "text-[22px]")}>~{o.fps ?? "—"}</span>
            </p>
          </div>
          <div className="text-right">
            <p className={cx("num font-semibold", featured ? "text-[28px]" : "text-[22px]", gain > 0 ? "text-ok" : gain < 0 ? "text-bad" : "text-fg-3")}>
              {gain > 0 ? "+" : ""}
              {gain}%
            </p>
            {o.rubPerFps !== null && <p className="num text-[12px] text-fg-3">{formatPrice(o.rubPerFps)} за кадр</p>}
          </div>
        </div>
        {o.notes.length > 0 && <p className="text-[12.5px] leading-snug text-warn">{o.notes.join(" · ")}</p>}
        <Button className="mt-auto w-full" variant={featured ? "primary" : "secondary"} onClick={() => requestInstall(o.component)}>
          {t.catalog.install} в сборку
        </Button>
      </div>
    </article>
  );
}

export function UpgradeList({ selection, gameId, settings, limit = 6 }: { selection: BuildSelection; gameId: string; settings: GameSettings; limit?: number }) {
  const { current, options } = useUpgradeOptions(selection, gameId, settings);
  const list = sortUpgrades(options, "value", { hideIncompatible: true }).filter((o) => (o.gainPct ?? 0) >= 5).slice(0, limit);
  if (list.length === 0)
    return (
      <EmptyState title="Нет апгрейдов с оценочным приростом ≥5%">
        Добавьте процессор и видеокарту или выберите другую игру/настройки.
      </EmptyState>
    );
  return (
    <ul className="space-y-2">
      {list.map((o) => (
        <UpgradeRow key={o.component.id} o={o} current={current} />
      ))}
    </ul>
  );
}
