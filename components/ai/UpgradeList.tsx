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
    <li className="flex items-center gap-3 rounded-[var(--radius-md)] border border-line bg-panel-2/50 p-2.5">
      <ComponentThumb component={o.component} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Badge tone={o.kind === "gpu" ? "violet" : "cyan"}>{o.kind.toUpperCase()}</Badge>
          <p className="truncate text-[12.5px] font-medium">{o.component.name}</p>
        </div>
        <p className="num mt-1 text-[11px] text-fg-3">
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
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <StatusPill status={o.compatibility} size="xs" />
        <Button size="sm" variant="secondary" onClick={() => requestInstall(o.component)}>
          {t.catalog.install}
        </Button>
      </div>
    </li>
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
