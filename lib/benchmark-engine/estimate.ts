import { hardwareRepository } from "@/lib/hardware/repository";
import type {
  BenchmarkRecord,
  Confidence,
  FrameGenTech,
  Game,
  GameSettings,
  GraphicsPreset,
  ModelBreakdown,
  PerformanceResult,
  Resolution,
  Upscaler,
  UpscalingMode,
} from "@/types/benchmark";
import type { CpuSpec, GpuSpec, MemoryType } from "@/types/hardware";

/**
 * Relative-performance estimation model, v0.2.
 *
 *   gpuFps = game.gpuFps1440High × (gpu.index / 100) × res × preset × upscaling × RT × VRAM
 *   cpuFps = game.cpuFpsCap × (cpu.gamingIndex / 100) × presetCpu × memory
 *   avg    = smooth-min(gpuFps, cpuFps)
 *
 * All constants are hand-set approximations. Output is labelled "estimate" with ±25% uncertainty
 * and low confidence, or "calibrated" when real records of the same GPU and game exist.
 * It is never presented as a measurement.
 */
export const MODEL_VERSION = "relative-index v0.2";

export const RESOLUTION_FACTOR: Record<Resolution, number> = { "1080p": 1.38, "1440p": 1, "4K": 0.52 };
export const PRESET_FACTOR: Record<GraphicsPreset, number> = { low: 1.75, medium: 1.35, high: 1, ultra: 0.82 };
const PRESET_CPU_FACTOR: Record<GraphicsPreset, number> = { low: 1.1, medium: 1.05, high: 1, ultra: 0.97 };
export const UPSCALING_FACTOR: Record<UpscalingMode, number> = { off: 1, quality: 1.3, balanced: 1.45, performance: 1.65 };
/** Presented-frame multiplier for 2× frame generation (interpolation has overhead). */
const FRAME_GEN_FACTOR = 1.75;
const UNCERTAINTY = 0.25;
const CALIBRATED_UNCERTAINTY = 0.15;

export interface MemoryConfig {
  type: MemoryType;
  speedMtps: number;
  modules: number;
}

function smoothMin(a: number, b: number) {
  // p-norm blend: close to min() when the values differ a lot, slightly below both when similar.
  const k = 6;
  return Math.pow(Math.pow(a, -k) + Math.pow(b, -k), -1 / k);
}

/** Upscalers usable in this game on this GPU (DLSS needs RTX; XeSS DP4a is not on Polaris/Vega). */
export function availableUpscalers(game: Game, gpu: GpuSpec | undefined): Upscaler[] {
  if (!gpu) return [];
  return game.upscalers.filter((u) => gpu.upscalers.includes(u));
}

/** Frame generation usable in this game on this GPU. DLSS FG needs RTX 40/50; FSR FG needs RDNA or RTX. */
export function availableFrameGen(game: Game, gpu: GpuSpec | undefined): FrameGenTech | null {
  if (!gpu) return null;
  if (game.frameGen.includes("DLSS-FG") && gpu.chipVendor === "NVIDIA" && (gpu.architecture === "Ada Lovelace" || gpu.architecture === "Blackwell")) return "DLSS-FG";
  const fsrCapable = gpu.chipVendor === "AMD" ? gpu.architecture.startsWith("RDNA") : gpu.rayTracing;
  if (game.frameGen.includes("FSR-FG") && fsrCapable) return "FSR-FG";
  return null;
}

/** Settings actually applied: unsupported options are switched off with an explanation. */
export function effectiveSettings(game: Game, gpu: GpuSpec, settings: GameSettings) {
  const notes: string[] = [];
  const rt = settings.rayTracing && game.supportsRayTracing && gpu.rayTracing;
  if (settings.rayTracing && !game.supportsRayTracing) notes.push("Игра не поддерживает трассировку лучей — расчёт без RT.");
  else if (settings.rayTracing && !gpu.rayTracing) notes.push(`${gpu.chip} не имеет аппаратной трассировки лучей — расчёт без RT.`);

  const ups = availableUpscalers(game, gpu);
  let upscaler: Upscaler | null = null;
  let upscaling: UpscalingMode = "off";
  if (settings.upscaling !== "off") {
    upscaler = settings.upscaler && ups.includes(settings.upscaler) ? settings.upscaler : (ups[0] ?? null);
    if (upscaler) upscaling = settings.upscaling;
    else notes.push("Выбранный апскейлер не поддерживается этой парой игра/видеокарта — расчёт без апскейлинга.");
    if (settings.upscaler && upscaler && upscaler !== settings.upscaler) notes.push(`${settings.upscaler} недоступен для этой пары — использован ${upscaler}.`);
  }

  const fgTech = availableFrameGen(game, gpu);
  const frameGen = Boolean(settings.frameGen && fgTech);
  if (settings.frameGen && !fgTech) notes.push("Генерация кадров недоступна для этой игры или видеокарты.");

  return { rt, upscaler, upscaling, frameGen: frameGen ? fgTech : null, notes };
}

/** CPU-side memory factor (model assumption) and an explanation. */
function memoryFactor(cpu: CpuSpec, memory: MemoryConfig | undefined): { factor: number; notes: string[] } {
  if (!memory) return { factor: 1, notes: ["Конфигурация памяти неизвестна — принят двухканальный режим на официальной частоте."] };
  const notes: string[] = [];
  let factor = 1;
  if (memory.modules === 1) {
    factor *= 0.85;
    notes.push("Один модуль памяти (одноканальный режим): CPU-предел снижен на 15%.");
  } else if (memory.modules === 3) {
    factor *= 0.95;
    notes.push("Три модуля памяти (несимметричные каналы): CPU-предел снижен на 5%.");
  }
  const jedec = cpu.memorySpeedMtps?.[memory.type];
  if (jedec) {
    const delta = Math.max(-0.08, Math.min(0.05, (memory.speedMtps / jedec - 1) * 0.15));
    if (Math.abs(delta) >= 0.005) {
      factor *= 1 + delta;
      notes.push(`Память ${memory.speedMtps} МТ/с относительно официальных ${jedec} МТ/с: ${delta > 0 ? "+" : ""}${Math.round(delta * 100)}% к CPU-пределу (при работающем XMP/EXPO).`);
    }
  }
  if (memory.type === "DDR4" && cpu.memorySupport.includes("DDR5")) {
    factor *= 0.94;
    notes.push("DDR4 на платформе с поддержкой DDR5: CPU-предел снижен на 6%.");
  }
  return { factor, notes };
}

export interface EstimateInput {
  game: Game;
  cpu: CpuSpec;
  gpu: GpuSpec;
  settings: GameSettings;
  memory?: MemoryConfig;
}

export function estimateFps({ game, cpu, gpu, settings, memory }: EstimateInput): Extract<PerformanceResult, { kind: "estimated" }> {
  const eff = effectiveSettings(game, gpu, settings);
  const assumptions = [...eff.notes];
  const index = eff.rt ? gpu.rtIndex : gpu.rasterIndex;

  let gpuFps =
    game.model.gpuFps1440High *
    (index / 100) *
    RESOLUTION_FACTOR[settings.resolution] *
    PRESET_FACTOR[settings.preset] *
    UPSCALING_FACTOR[eff.upscaling] *
    (eff.rt ? game.model.rtCost : 1);

  const vramNeed = settings.resolution === "4K" ? 12 : settings.resolution === "1440p" && (settings.preset === "ultra" || eff.rt) ? 10 : settings.preset === "low" ? 4 : 6;
  if (gpu.vramGb < vramNeed) {
    // Larger shortfalls hurt more (texture streaming / swapping over PCIe).
    const penalty = gpu.vramGb <= vramNeed / 2 ? 0.6 : 0.8;
    gpuFps *= penalty;
    assumptions.push(`Видеопамяти ${gpu.vramGb} ГБ может не хватать для этих настроек — применён штраф −${Math.round((1 - penalty) * 100)}%.`);
  }

  const mem = memoryFactor(cpu, memory);
  assumptions.push(...mem.notes);
  const cpuFps = game.model.cpuFpsCap * (cpu.gamingIndex / 100) * PRESET_CPU_FACTOR[settings.preset] * mem.factor;
  const avg = smoothMin(gpuFps, cpuFps);
  const ratio = gpuFps / cpuFps;
  const bottleneck = ratio < 0.85 ? "gpu" : ratio > 1.15 ? "cpu" : "balanced";

  assumptions.push(
    "Индексы производительности CPU/GPU и базовые FPS игры — параметры модели, а не результаты тестов.",
    "Предполагаются актуальные драйверы и сцена средней нагрузки.",
  );
  if (eff.upscaler) assumptions.push(`Апскейлинг: ${eff.upscaler}, режим «${eff.upscaling}» — прирост задан коэффициентом модели.`);
  if (eff.frameGen) assumptions.push(`${eff.frameGen}: показанный FPS включает сгенерированные кадры; задержка ввода соответствует базовому FPS.`);
  if (bottleneck === "cpu") {
    assumptions.push("Упор в процессор: FPS почти не зависит от разрешения и настроек графики — поэтому значения на разных разрешениях близки или совпадают.");
  }

  const round = (n: number) => Math.max(1, Math.round(n));
  return {
    kind: "estimated",
    avgFps: round(avg),
    // A 1% low needs frame-time data; the model has none (lowRatio is only a display hint, unused here).
    low1Fps: null,
    rangeFps: [round(avg * (1 - UNCERTAINTY)), round(avg * (1 + UNCERTAINTY))],
    gpuBoundFps: round(gpuFps),
    cpuBoundFps: round(cpuFps),
    bottleneck,
    utilization: { gpu: Math.min(1, avg / gpuFps), cpu: Math.min(1, avg / cpuFps) },
    frameGenFps: eff.frameGen ? round(avg * FRAME_GEN_FACTOR) : null,
    confidence: "low",
    method: MODEL_VERSION,
    assumptions,
  };
}

function sameSettings(a: GameSettings, b: GameSettings) {
  return (
    a.resolution === b.resolution &&
    a.preset === b.preset &&
    a.rayTracing === b.rayTracing &&
    a.upscaling === b.upscaling &&
    (a.upscaling === "off" || (a.upscaler ?? null) === (b.upscaler ?? null)) &&
    Boolean(a.frameGen) === Boolean(b.frameGen)
  );
}

/** Exact-match measured records for this CPU/GPU/game/settings. */
export function findMeasured(records: BenchmarkRecord[], q: { gameId: string; cpuId: string; gpuId: string; settings: GameSettings }) {
  return records.filter((r) => r.gameId === q.gameId && r.cpuId === q.cpuId && r.gpuId === q.gpuId && sameSettings(r.settings, q.settings));
}

function measuredConfidence(records: BenchmarkRecord[]): Confidence {
  const samples = records.reduce((s, r) => s + r.sampleCount, 0);
  if (records.length >= 3 && samples >= 9) return "high";
  if (samples >= 3) return "medium";
  return "low";
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export interface PerformanceQuery {
  game: Game | undefined;
  cpu: CpuSpec | undefined;
  gpu: GpuSpec | undefined;
  settings: GameSettings;
  measured: BenchmarkRecord[];
  memory?: MemoryConfig;
}

/** Model figures carry ±25% uncertainty: show them to the nearest 5 FPS, not to the unit. */
export function roundModelFps(n: number) {
  return n >= 40 ? Math.max(5, Math.round(n / 5) * 5) : Math.max(1, Math.round(n));
}

/**
 * Records may only calibrate the model when they were taken with the same preset, ray tracing,
 * upscaling and frame generation state — results are never transferred across those.
 * Resolution and CPU may differ (the model accounts for them).
 */
export function comparableForCalibration(r: GameSettings, q: GameSettings) {
  return (
    r.preset === q.preset &&
    r.rayTracing === q.rayTracing &&
    r.upscaling === q.upscaling &&
    (q.upscaling === "off" || (r.upscaler ?? null) === (q.upscaler ?? null)) &&
    Boolean(r.frameGen) === Boolean(q.frameGen)
  );
}

/** Measured data wins; then a model calibrated on close real records; then a model estimate; else "unavailable". */
export function getPerformance({ game, cpu, gpu, settings, measured: all, memory }: PerformanceQuery): PerformanceResult {
  // Rejected records never count.
  const measured = all.filter((r) => r.verification !== "rejected");
  if (!game) return { kind: "unavailable", reason: "Игра не выбрана." };
  if (!cpu) return { kind: "unavailable", reason: "Недостаточно данных для точной оценки: в сборке нет процессора." };
  if (!gpu) return { kind: "unavailable", reason: "Недостаточно данных для точной оценки: в сборке нет дискретной видеокарты (встроенная графика моделью не оценивается)." };
  const usable = (n: number | undefined) => typeof n === "number" && Number.isFinite(n) && n > 0;
  const modelReady = usable(cpu.gamingIndex) && usable(gpu.rasterIndex) && usable(game.model.gpuFps1440High) && usable(game.model.cpuFpsCap);

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
      frameGenIncluded: Boolean(settings.frameGen),
    };
  }

  // Without performance indices the model has no basis: say so instead of producing a number.
  if (!modelReady) {
    return { kind: "unavailable", reason: `Недостаточно данных для точной оценки: для ${!usable(cpu.gamingIndex) ? cpu.name : !usable(gpu.rasterIndex) ? gpu.name : game.title} нет параметров модели, а подходящих замеров нет.` };
  }

  const estimate = estimateFps({ game, cpu, gpu, settings, memory });

  // Calibration: real records of the same GPU in this game (any CPU/settings) correct the model.
  const anchors = measured.filter((r) => r.gameId === game.id && r.gpuId === gpu.id && comparableForCalibration(r.settings, settings));
  const used: BenchmarkRecord[] = [];
  const ratios = anchors
    .map((r) => {
      const rCpu = hardwareRepository.byId(r.cpuId);
      if (!rCpu || rCpu.category !== "cpu") return null;
      const m = estimateFps({ game, cpu: rCpu, gpu, settings: r.settings });
      // Frame-generation records report presented frames: compare them with the model's presented FPS.
      const modelled = r.settings.frameGen ? (m.frameGenFps ?? m.avgFps) : m.avgFps;
      const ratio = r.avgFps / modelled;
      if (!Number.isFinite(ratio)) return null;
      used.push(r);
      return ratio;
    })
    .filter((x): x is number => x !== null);
  const lowRatios = anchors.filter((r) => r.low1Fps && r.avgFps > 0).map((r) => r.low1Fps! / r.avgFps);
  if (ratios.length) {
    const k = Math.max(0.5, Math.min(1.8, median(ratios)));
    const round = roundModelFps;
    const avg = estimate.avgFps * k;
    // Copy the breakdown without the "estimated" tag — the tier is set explicitly below.
    const { kind: _estimatedKind, ...breakdown } = estimate;
    void _estimatedKind;
    const calibrated: ModelBreakdown = {
      ...breakdown,
      avgFps: round(avg),
      // 1% low only from records that measured it (ratio to their own average).
      low1Fps: lowRatios.length ? round(avg * median(lowRatios)) : null,
      rangeFps: [round(avg * (1 - CALIBRATED_UNCERTAINTY)), round(avg * (1 + CALIBRATED_UNCERTAINTY))],
      gpuBoundFps: round(estimate.gpuBoundFps * k),
      frameGenFps: estimate.frameGenFps ? round(estimate.frameGenFps * k) : null,
      confidence: "medium",
      method: `${MODEL_VERSION}, калибровка по ${ratios.length} замер(ам) этой видеокарты в игре (коэффициент ${k.toFixed(2)})`,
      assumptions: [...estimate.assumptions, "Оценка скорректирована по реальным замерам той же видеокарты в этой игре с тем же пресетом, RT и генерацией кадров (другое разрешение или процессор)."],
    };
    return { ...calibrated, kind: "calibrated", calibrationRecords: ratios.length, anchors: used };
  }
  const r5 = roundModelFps;
  return {
    ...estimate,
    avgFps: r5(estimate.avgFps),
    low1Fps: null,
    rangeFps: [r5(estimate.rangeFps[0]), r5(estimate.rangeFps[1])],
    gpuBoundFps: r5(estimate.gpuBoundFps),
    cpuBoundFps: r5(estimate.cpuBoundFps),
    frameGenFps: estimate.frameGenFps ? r5(estimate.frameGenFps) : null,
  };
}

export type TargetVerdict = "meets" | "borderline" | "misses";

/** Whether a result sustains a target FPS: uses the lower bound of the range when known. */
export function targetVerdict(result: PerformanceResult, target: number): TargetVerdict | null {
  if (result.kind === "unavailable") return null;
  const low = result.rangeFps ? result.rangeFps[0] : result.avgFps;
  if (low >= target) return "meets";
  if (result.avgFps >= target * 0.95) return "borderline";
  return "misses";
}

/** Memory configuration of a build for the estimator. */
export function memoryOf(ram: { type: MemoryType; speedMtps: number } | undefined, modules: number): MemoryConfig | undefined {
  return ram ? { type: ram.type, speedMtps: ram.speedMtps, modules } : undefined;
}
