"use client";

import { GAMES } from "@/data/games";
import { availableFrameGen, availableUpscalers } from "@/lib/benchmark-engine/estimate";
import { useMessages } from "@/lib/i18n";
import { RESOLUTION_PIXELS, type GameSettings, type GraphicsPreset, type Resolution, type Upscaler, type UpscalingMode } from "@/types/benchmark";
import type { GpuSpec } from "@/types/hardware";
import { Field, Segmented, Select, Switch } from "@/components/ui/primitives";

export const TARGET_FPS = [60, 144, 240, 360] as const;

/**
 * Game settings. Only options the selected game AND GPU actually support are offered:
 * RT needs hardware RT, DLSS needs RTX, frame generation needs game + GPU support.
 */
export function PerformanceControls({
  gameId,
  settings,
  gpu,
  onGame,
  onSettings,
  layout = "stack",
  target,
  onTarget,
}: {
  gameId: string;
  settings: GameSettings;
  gpu?: GpuSpec;
  onGame: (id: string) => void;
  onSettings: (patch: Partial<GameSettings>) => void;
  layout?: "stack" | "row";
  target?: number;
  onTarget?: (fps: number) => void;
}) {
  const t = useMessages();
  const game = GAMES.find((g) => g.id === gameId);
  const ups = game ? (gpu ? availableUpscalers(game, gpu) : game.upscalers) : [];
  const fg = game && gpu ? availableFrameGen(game, gpu) : null;
  const rtAvailable = Boolean(game?.supportsRayTracing) && (gpu ? gpu.rayTracing : true);
  const rtHint = !game?.supportsRayTracing ? "не поддерживается игрой" : gpu && !gpu.rayTracing ? "нет аппаратного RT у видеокарты" : null;
  const upscalerValue: Upscaler | "" = settings.upscaler && ups.includes(settings.upscaler) ? settings.upscaler : (ups[0] ?? "");

  return (
    <div className={layout === "row" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1.2fr)_auto_auto_minmax(150px,1fr)_minmax(130px,0.8fr)]" : "space-y-3"}>
      <Field label={t.perf.game}>
        <Select label={t.perf.game} value={gameId} onChange={onGame} options={GAMES.map((g) => ({ value: g.id, label: g.title }))} />
      </Field>
      <Field label={t.perf.resolution} hint={RESOLUTION_PIXELS[settings.resolution]}>
        <Segmented<Resolution>
          label={t.perf.resolution}
          value={settings.resolution}
          onChange={(resolution) => onSettings({ resolution })}
          options={(["1080p", "1440p", "4K"] as Resolution[]).map((r) => ({ value: r, label: r }))}
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
      <Field label={t.perf.upscaling} hint={ups.length ? `Доступно: ${ups.join(", ")}` : "Нет общего апскейлера у игры и GPU"}>
        <div className="flex gap-1.5">
          {ups.length > 1 && settings.upscaling !== "off" && (
            <div className="w-24 shrink-0">
              <Select<Upscaler> label="Технология апскейлинга" value={upscalerValue as Upscaler} onChange={(upscaler) => onSettings({ upscaler })} options={ups.map((u) => ({ value: u, label: u }))} />
            </div>
          )}
          <Select<UpscalingMode>
            label={t.perf.upscaling}
            value={ups.length ? settings.upscaling : "off"}
            onChange={(upscaling) => onSettings({ upscaling, upscaler: settings.upscaler ?? ups[0] ?? null })}
            options={(ups.length ? (["off", "quality", "balanced", "performance"] as UpscalingMode[]) : (["off"] as UpscalingMode[])).map((u) => ({
              value: u,
              label: u === "off" ? t.perf.upscalingModes.off : `${ups.length === 1 ? `${ups[0]} · ` : ""}${t.perf.upscalingModes[u]}`,
            }))}
          />
        </div>
      </Field>
      <div className="flex flex-col justify-end gap-2 pb-1">
        <Switch
          checked={rtAvailable && settings.rayTracing}
          disabled={!rtAvailable}
          onChange={(rayTracing) => onSettings({ rayTracing })}
          label={rtHint ? `${t.perf.rayTracing} — ${rtHint}` : t.perf.rayTracing}
        />
        {fg ? (
          <Switch checked={Boolean(settings.frameGen)} onChange={(frameGen) => onSettings({ frameGen })} label={`Генерация кадров (${fg})`} />
        ) : (
          <span className="text-[11px] text-fg-3">Генерация кадров недоступна{game?.frameGen.length ? " для этой видеокарты" : " в игре"}</span>
        )}
      </div>
      {onTarget && target !== undefined && (
        <Field label="Целевой FPS">
          <Segmented
            label="Целевой FPS"
            value={String(target)}
            onChange={(v) => onTarget(Number(v))}
            options={TARGET_FPS.map((f) => ({ value: String(f), label: String(f) }))}
          />
        </Field>
      )}
    </div>
  );
}
