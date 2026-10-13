"use client";

import { GAMES } from "@/data/games";
import { useMessages } from "@/lib/i18n";
import type { Game, GameSettings, GraphicsPreset, Resolution, UpscalingMode } from "@/types/benchmark";
import type { GpuSpec } from "@/types/hardware";
import { Field, Segmented, Select, Switch } from "@/components/ui/primitives";

export function PerformanceControls({
  gameId,
  settings,
  gpu,
  onGame,
  onSettings,
  layout = "stack",
}: {
  gameId: string;
  settings: GameSettings;
  gpu?: GpuSpec;
  onGame: (id: string) => void;
  onSettings: (patch: Partial<GameSettings>) => void;
  layout?: "stack" | "row";
}) {
  const t = useMessages();
  const game: Game | undefined = GAMES.find((g) => g.id === gameId);
  const sharedUpscalers = game && gpu ? game.upscalers.filter((u) => gpu.upscalers.includes(u)) : game?.upscalers ?? [];
  return (
    <div className={layout === "row" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_auto_auto_minmax(160px,1fr)_auto]" : "space-y-3"}>
      <Field label={t.perf.game}>
        <Select label={t.perf.game} value={gameId} onChange={onGame} options={GAMES.map((g) => ({ value: g.id, label: g.title }))} />
      </Field>
      <Field label={t.perf.resolution}>
        <Segmented<Resolution>
          label={t.perf.resolution}
          value={settings.resolution}
          onChange={(resolution) => onSettings({ resolution })}
          options={[
            { value: "1080p", label: "1080p" },
            { value: "1440p", label: "1440p" },
            { value: "4K", label: "4K" },
          ]}
        />
      </Field>
      <Field label={t.perf.preset}>
        <Segmented<GraphicsPreset>
          label={t.perf.preset}
          value={settings.preset}
          onChange={(preset) => onSettings({ preset })}
          options={(["low", "medium", "high", "ultra"] as GraphicsPreset[]).map((p) => ({ value: p, label: t.perf.presets[p] }))}
        />
      </Field>
      <Field label={t.perf.upscaling} hint={sharedUpscalers.length ? `Доступно: ${sharedUpscalers.join(", ")}` : "Нет общего апскейлера у игры и GPU"}>
        <Select<UpscalingMode>
          label={t.perf.upscaling}
          value={sharedUpscalers.length ? settings.upscaling : "off"}
          onChange={(upscaling) => onSettings({ upscaling })}
          options={(["off", "quality", "balanced", "performance"] as UpscalingMode[]).map((u) => ({ value: u, label: t.perf.upscalingModes[u] }))}
        />
      </Field>
      <div className="flex items-end pb-1.5">
        <Switch
          checked={Boolean(game?.supportsRayTracing) && settings.rayTracing}
          disabled={!game?.supportsRayTracing}
          onChange={(rayTracing) => onSettings({ rayTracing })}
          label={game?.supportsRayTracing ? t.perf.rayTracing : `${t.perf.rayTracing} — не поддерживается`}
        />
      </div>
    </div>
  );
}
