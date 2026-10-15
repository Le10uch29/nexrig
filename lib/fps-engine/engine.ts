import { GAMES } from "@/data/games";
import { getPerformance, memoryOf, MODEL_VERSION, type MemoryConfig } from "@/lib/benchmark-engine/estimate";
import { hardwareRepository } from "@/lib/hardware/repository";
import type { BenchmarkRecord, EstimateSource, FpsConfidenceLevel, FpsEstimate, Game, GameSettings, PerformanceResult } from "@/types/benchmark";
import type { CpuSpec, GpuSpec } from "@/types/hardware";

/**
 * FPS Data Engine — calculation contract on top of the performance model.
 *
 * Priority:
 *  1. exact verified/own measurement for the same CPU, GPU, game and settings → "verified";
 *  2. close measurements (same GPU, game, preset, RT, upscaling, frame generation; other
 *     resolution or CPU) calibrate the model → "close";
 *  3. the documented relative-performance model alone → "model" (low confidence, ±25%);
 *  4. otherwise → "insufficient" with no number.
 *
 * Pure and UI-independent: used by the API routes and by FPS Lab in the browser.
 */

export const LEVEL_LABEL: Record<FpsConfidenceLevel, string> = {
  verified: "Подтверждённый тест",
  close: "Оценка по близким тестам",
  model: "Модельная оценка",
  insufficient: "Недостаточно данных",
};

export interface FpsInput {
  game: Game | undefined;
  cpu: CpuSpec | undefined;
  gpu: GpuSpec | undefined;
  settings: GameSettings;
  memory?: MemoryConfig;
  /** Verified global records plus the user's own measurements. */
  records: BenchmarkRecord[];
}

const sourcesOf = (records: BenchmarkRecord[]): EstimateSource[] =>
  [...records]
    .sort((a, b) => b.testDate.localeCompare(a.testDate))
    .map((r) => ({ label: r.source.label, url: r.source.url ?? null, date: r.testDate, community: Boolean(r.community || r.submittedBy) }));

const latest = (records: BenchmarkRecord[]) => [...records].sort((a, b) => b.testDate.localeCompare(a.testDate))[0];

export function toFpsEstimate(result: PerformanceResult, game: Game | undefined): FpsEstimate {
  if (result.kind === "unavailable") {
    return {
      level: "insufficient",
      averageFpsEstimate: null,
      lowFpsEstimate: null,
      highFpsEstimate: null,
      onePercentLow: null,
      frameGenFps: null,
      confidence: null,
      confidenceReasons: [result.reason],
      dataSource: null,
      sourceUrl: null,
      sources: [],
      benchmarkDate: null,
      gameVersion: game?.version ?? null,
      calculationMethod: "—",
      limitations: ["Численная оценка не выдаётся без достаточных данных."],
      recordCount: 0,
      bottleneck: null,
    };
  }
  if (result.kind === "measured") {
    const ref = latest(result.records);
    const sources = [...new Set(result.records.map((r) => r.source.label))];
    // Measured with frame generation: the number is presented FPS, not native performance.
    const fg = result.frameGenIncluded;
    return {
      level: "verified",
      averageFpsEstimate: fg ? null : result.avgFps,
      // A range only when several measurements exist (their spread), never around a single result.
      lowFpsEstimate: fg ? null : (result.rangeFps?.[0] ?? null),
      highFpsEstimate: fg ? null : (result.rangeFps?.[1] ?? null),
      onePercentLow: fg ? null : result.low1Fps,
      frameGenFps: fg ? result.avgFps : null,
      confidence: result.confidence,
      confidenceReasons: [
        ...(fg ? ["Замер сделан с генерацией кадров: это показанный FPS со вставленными кадрами; нативный FPS в источнике не указан."] : []),
        `Замеров с точно совпадающей конфигурацией: ${result.records.length} (прогонов: ${result.records.reduce((s, r) => s + r.sampleCount, 0)}).`,
        result.records.length > 1 ? "Диапазон — разброс между этими замерами." : "Один замер — диапазон не указывается.",
      ],
      dataSource: sources.join(", "),
      sourceUrl: ref.source.url ?? null,
      sources: sourcesOf(result.records),
      benchmarkDate: ref.testDate,
      gameVersion: ref.gameVersion ?? null,
      calculationMethod: ref.method ?? "Среднее по замерам",
      limitations: ["Результат зависит от сцены, драйвера и версии игры, указанных в источнике."],
      recordCount: result.records.length,
      bottleneck: null,
    };
  }
  const calibrated = result.kind === "calibrated";
  return {
    level: calibrated ? "close" : "model",
    averageFpsEstimate: result.avgFps,
    lowFpsEstimate: result.rangeFps[0],
    highFpsEstimate: result.rangeFps[1],
    // Only data-backed (calibrated from records with 1% low); the model alone has none.
    onePercentLow: result.low1Fps,
    frameGenFps: result.frameGenFps,
    confidence: result.confidence,
    confidenceReasons: calibrated
      ? [`Калибровка по ${result.calibrationRecords} близким замерам той же видеокарты в этой игре (тот же пресет, RT и генерация кадров).`, "Диапазон ±15% — неопределённость переноса на вашу конфигурацию."]
      : ["Замеров для этой конфигурации нет — оценка по модели относительной производительности.", "Диапазон ±25% — типичная ошибка модели, а не разброс измерений."],
    dataSource: calibrated ? "Модель + близкие замеры" : "Модель NexRig",
    sourceUrl: null,
    sources: calibrated ? sourcesOf(result.anchors) : [],
    benchmarkDate: null,
    gameVersion: game?.version ?? null,
    calculationMethod: result.method,
    limitations: result.assumptions,
    recordCount: calibrated ? result.calibrationRecords : 0,
    bottleneck: result.bottleneck,
  };
}

export function computeFps(input: FpsInput): FpsEstimate {
  const result = getPerformance({ game: input.game, cpu: input.cpu, gpu: input.gpu, settings: input.settings, measured: input.records, memory: input.memory });
  return toFpsEstimate(result, input.game);
}

/** Resolves ids from the catalogue (API helper). Unknown ids yield an "insufficient" estimate. */
export function computeFpsByIds(q: { gameId: string; cpuId: string; gpuId: string; settings: GameSettings; ram?: { type: "DDR3" | "DDR4" | "DDR5"; speedMtps: number; modules: number }; records: BenchmarkRecord[] }): FpsEstimate {
  const game = GAMES.find((g) => g.id === q.gameId);
  const cpu = hardwareRepository.byId(q.cpuId);
  const gpu = hardwareRepository.byId(q.gpuId);
  return computeFps({
    game,
    cpu: cpu?.category === "cpu" ? cpu : undefined,
    gpu: gpu?.category === "gpu" ? gpu : undefined,
    settings: q.settings,
    memory: q.ram ? memoryOf(q.ram, q.ram.modules) : undefined,
    records: q.records,
  });
}

/**
 * Caveats for a build that cannot actually be assembled: the FPS figure then describes the chosen
 * CPU/GPU pair as if it could run, which must be said next to the number.
 */
export function fpsCaveats(checks: { status: string; categories: string[]; title: string }[]): string[] {
  const relevant = new Set(["cpu", "gpu", "ram", "motherboard", "psu"]);
  return checks
    .filter((c) => c.status === "incompatible" && c.categories.some((cat) => relevant.has(cat)))
    .map((c) => `Сборка несовместима (${c.title.toLowerCase()}): FPS рассчитан для выбранных процессора и видеокарты так, как если бы систему удалось собрать.`);
}

export { MODEL_VERSION };
