import type {
  BenchmarkRecord,
  Confidence,
  Game,
  GameSettings,
  GraphicsPreset,
  PerformanceResult,
  Resolution,
  UpscalingMode,
} from "@/types/benchmark";
import type { CpuSpec, GpuSpec } from "@/types/hardware";

/**
 * Relative-performance estimation model, v0.1.
 *
 *   gpuFps = game.gpuFps1440High × (gpu.index / 100) × res × preset × upscaling × RT × VRAM
 *   cpuFps = game.cpuFpsCap × (cpu.gamingIndex / 100) × presetCpu
 *   avg    = smooth-min(gpuFps, cpuFps)
 *
 * All constants are hand-set approximations. Output is labelled "estimate" with ±25% uncertainty
 * and low confidence. It is never presented as a measurement.
 */
export const MODEL_VERSION = "relative-index v0.1";

export const RESOLUTION_FACTOR: Record<Resolution, number> = { "1080p": 1.38, "1440p": 1, "4K": 0.52 };
export const PRESET_FACTOR: Record<GraphicsPreset, number> = { low: 1.75, medium: 1.35, high: 1, ultra: 0.82 };
const PRESET_CPU_FACTOR: Record<GraphicsPreset, number> = { low: 1.1, medium: 1.05, high: 1, ultra: 0.97 };
export const UPSCALING_FACTOR: Record<UpscalingMode, number> = { off: 1, quality: 1.3, balanced: 1.45, performance: 1.65 };
const UNCERTAINTY = 0.25;

function smoothMin(a: number, b: number) {
  // p-norm style blend: close to min() when the values differ a lot, slightly below both when similar.
  const k = 6;
  return Math.pow(Math.pow(a, -k) + Math.pow(b, -k), -1 / k);
}

export interface EstimateInput {
  game: Game;
  cpu: CpuSpec;
  gpu: GpuSpec;
  settings: GameSettings;
}

export function estimateFps({ game, cpu, gpu, settings }: EstimateInput): Extract<PerformanceResult, { kind: "estimated" }> {
  const assumptions: string[] = [];
  const rt = settings.rayTracing && game.supportsRayTracing && gpu.rayTracing;
  if (settings.rayTracing && game.supportsRayTracing && !gpu.rayTracing) {
    assumptions.push(`${gpu.chip} не имеет аппаратной трассировки лучей — расчёт без RT.`);
  }
  const index = rt ? gpu.rtIndex : gpu.rasterIndex;
  const upscale =
    settings.upscaling !== "off" && gpu.upscalers.some((u) => game.upscalers.includes(u)) ? settings.upscaling : "off";

  if (settings.upscaling !== "off" && upscale === "off") {
    assumptions.push("Выбранный апскейлер не поддерживается этой парой игра/видеокарта — расчёт без апскейлинга.");
  }
  if (settings.rayTracing && !game.supportsRayTracing) {
    assumptions.push("Игра не поддерживает трассировку лучей — расчёт без RT.");
  }

  let gpuFps =
    game.model.gpuFps1440High *
    (index / 100) *
    RESOLUTION_FACTOR[settings.resolution] *
    PRESET_FACTOR[settings.preset] *
    UPSCALING_FACTOR[upscale] *
    (rt ? game.model.rtCost : 1);

  const vramNeed = settings.resolution === "4K" ? 12 : settings.resolution === "1440p" && (settings.preset === "ultra" || rt) ? 10 : settings.preset === "low" ? 4 : 6;
  if (gpu.vramGb < vramNeed) {
    // Larger shortfalls hurt more (texture streaming / swapping over PCIe).
    const penalty = gpu.vramGb <= vramNeed / 2 ? 0.6 : 0.8;
    gpuFps *= penalty;
    assumptions.push(`Видеопамяти ${gpu.vramGb} ГБ может не хватать для этих настроек — применён штраф −${Math.round((1 - penalty) * 100)}%.`);
  }

  const cpuFps = game.model.cpuFpsCap * (cpu.gamingIndex / 100) * PRESET_CPU_FACTOR[settings.preset];
  const avg = smoothMin(gpuFps, cpuFps);
  const ratio = gpuFps / cpuFps;
  const bottleneck = ratio < 0.85 ? "gpu" : ratio > 1.15 ? "cpu" : "balanced";

  assumptions.push(
    "Индексы производительности CPU/GPU и базовые FPS игры — параметры модели, а не результаты тестов.",
    "Предполагается двухканальная память, актуальные драйверы и сцена средней нагрузки.",
  );
  if (upscale !== "off") assumptions.push("Генерация кадров не учитывается.");

  const round = (n: number) => Math.max(1, Math.round(n));
  return {
    kind: "estimated",
    avgFps: round(avg),
    low1Fps: round(avg * game.model.lowRatio),
    rangeFps: [round(avg * (1 - UNCERTAINTY)), round(avg * (1 + UNCERTAINTY))],
    bottleneck,
    confidence: "low",
    method: MODEL_VERSION,
    assumptions,
  };
}

function sameSettings(a: GameSettings, b: GameSettings) {
  return a.resolution === b.resolution && a.preset === b.preset && a.rayTracing === b.rayTracing && a.upscaling === b.upscaling;
}

/** Exact-match measured records for this CPU/GPU/game/settings. */
export function findMeasured(records: BenchmarkRecord[], q: { gameId: string; cpuId: string; gpuId: string; settings: GameSettings }) {
  return records.filter(
    (r) => r.gameId === q.gameId && r.cpuId === q.cpuId && r.gpuId === q.gpuId && sameSettings(r.settings, q.settings),
  );
}

function measuredConfidence(records: BenchmarkRecord[]): Confidence {
  const samples = records.reduce((s, r) => s + r.sampleCount, 0);
  if (records.length >= 3 && samples >= 9) return "high";
  if (samples >= 3) return "medium";
  return "low";
}

export interface PerformanceQuery {
  game: Game | undefined;
  cpu: CpuSpec | undefined;
  gpu: GpuSpec | undefined;
  settings: GameSettings;
  measured: BenchmarkRecord[];
}

/** Measured data wins; otherwise a labelled estimate; otherwise an explicit "unavailable". */
export function getPerformance({ game, cpu, gpu, settings, measured }: PerformanceQuery): PerformanceResult {
  if (!game) return { kind: "unavailable", reason: "Игра не выбрана." };
  if (!cpu) return { kind: "unavailable", reason: "В сборке нет процессора — оценка невозможна." };
  if (!gpu)
    return {
      kind: "unavailable",
      reason: "В сборке нет дискретной видеокарты. Модель не оценивает встроенную графику.",
    };

  const matches = findMeasured(measured, { gameId: game.id, cpuId: cpu.id, gpuId: gpu.id, settings });
  if (matches.length) {
    const avgs = matches.map((r) => r.avgFps);
    const lows = matches.map((r) => r.low1Fps).filter((n): n is number => typeof n === "number");
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    return {
      kind: "measured",
      avgFps: Math.round(mean(avgs)),
      low1Fps: lows.length ? Math.round(mean(lows)) : null,
      rangeFps: matches.length > 1 ? [Math.min(...avgs), Math.max(...avgs)] : null,
      records: matches,
      confidence: measuredConfidence(matches),
    };
  }
  return estimateFps({ game, cpu, gpu, settings });
}
