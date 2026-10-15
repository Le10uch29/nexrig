import { MAX_PLAUSIBLE_FPS, MIN_BATCHES, MIN_FRAMES, UNSTABLE_CV } from "./config";

/**
 * One timed batch: consecutive frames rendered and finished on the GPU, timed as a single interval
 * of at least BATCH_MIN_MS. Timing batches instead of single frames keeps the browser's coarse
 * performance.now() (0.1 ms in Chrome, up to 1 ms elsewhere without cross-origin isolation) from
 * quantising the result.
 */
export interface Batch {
  frames: number;
  ms: number;
}

/** Summary of one measurement. All figures come from total time and frame counts of the batches. */
export interface FrameStats {
  /** False when nothing was measured (e.g. the tab was hidden during warm-up); figures are then 0. */
  measured: boolean;
  frames: number;
  batches: number;
  /** Sum of batch times: time the workload was running (render + wait for the GPU). */
  durationMs: number;
  /** Wall-clock length of the measurement phase (batch times + short pauses between batches). */
  wallMs: number;
  /** Median of per-batch average frame times. */
  medianMs: number;
  medianFps: number;
  /** frames / durationMs. */
  meanFps: number;
  /** FPS of the slowest 1% of batches ("1% худших отрезков"). */
  p1LowFps: number;
  p99Ms: number;
  stdevMs: number;
  /** Coefficient of variation of per-batch frame times (stdev / mean). */
  cv: number;
  /** Frames per second of each consecutive time window (frames / time in that window). */
  windowFps: number[];
  /** Last window vs first window (−0.1 = 10% slower by the end); null with one window. */
  drift: number | null;
}

/** Value with p% of samples below it (for p=99: the boundary of the slowest 1%). */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

const EMPTY: Omit<FrameStats, "wallMs"> = {
  measured: false,
  frames: 0,
  batches: 0,
  durationMs: 0,
  medianMs: 0,
  medianFps: 0,
  meanFps: 0,
  p1LowFps: 0,
  p99Ms: 0,
  stdevMs: 0,
  cv: 0,
  windowFps: [],
  drift: null,
};

/** batches in order; windows splits the run into equal-duration parts. */
export function summarize(batches: Batch[], windows = 1, wallMs?: number): FrameStats {
  const valid = batches.filter((b) => b.frames > 0 && b.ms > 0);
  const total = valid.reduce((a, b) => a + b.ms, 0);
  if (!valid.length) return { ...EMPTY, wallMs: round(wallMs ?? 0, 0) };
  const frames = valid.reduce((a, b) => a + b.frames, 0);
  const per = valid.map((b) => b.ms / b.frames);
  const sorted = [...per].sort((a, b) => a - b);
  const n = per.length;
  const mean = per.reduce((a, b) => a + b, 0) / n;
  const variance = per.reduce((a, t) => a + (t - mean) ** 2, 0) / n;
  const medianMs = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const p99Ms = percentile(sorted, 99);

  const windowFps: number[] = [];
  if (windows > 1) {
    const span = total / windows;
    let acc = 0;
    let wf = 0;
    let wt = 0;
    for (const b of valid) {
      wf += b.frames;
      wt += b.ms;
      acc += b.ms;
      if (acc >= span * (windowFps.length + 1) && windowFps.length < windows - 1) {
        windowFps.push((wf * 1000) / wt);
        wf = 0;
        wt = 0;
      }
    }
    if (wt > 0) windowFps.push((wf * 1000) / wt);
  }
  return {
    measured: true,
    frames,
    batches: n,
    durationMs: round(total, 0),
    wallMs: round(wallMs ?? total, 0),
    medianMs: round(medianMs, 4),
    medianFps: round(1000 / medianMs),
    meanFps: round((frames * 1000) / total),
    p1LowFps: round(1000 / p99Ms),
    p99Ms: round(p99Ms, 4),
    stdevMs: round(Math.sqrt(variance), 4),
    cv: round(Math.sqrt(variance) / mean, 3),
    windowFps: windowFps.map((x) => round(x)),
    drift: windowFps.length > 1 ? round(windowFps[windowFps.length - 1] / windowFps[0] - 1, 3) : null,
  };
}

export type BenchIssue = "no-measurement" | "too-few-frames" | "hidden" | "stalled" | "unstable" | "throttling" | "software" | "implausible";

export const ISSUE_TEXT: Record<BenchIssue, string> = {
  "no-measurement": "Измерение не выполнено — результата нет.",
  "too-few-frames": "Слишком мало кадров или отрезков измерения для надёжного результата.",
  hidden: "Вкладка была скрыта во время теста — браузер ограничивает фоновые вкладки, результат недостоверен.",
  stalled: "Браузер приостанавливал выполнение (пауза больше секунды) — результат недостоверен.",
  unstable: "Большой разброс времени кадра между отрезками — результат нестабилен.",
  throttling: "Производительность падала к концу теста больше чем на 15% — возможен перегрев или снижение частот.",
  software: "Используется программный рендеринг (без видеокарты) — результат не отражает GPU.",
  implausible: "Неправдоподобно высокий FPS — нагрузка, вероятно, не выполнялась.",
};

/** Issues that make a run invalid (not just flagged). */
export const INVALIDATING: BenchIssue[] = ["no-measurement", "too-few-frames", "hidden", "stalled", "implausible"];

export function assess(stats: FrameStats, flags: { hidden: boolean; stalled: boolean; software: boolean }): { valid: boolean; issues: BenchIssue[] } {
  const issues: BenchIssue[] = [];
  if (!stats.measured) issues.push("no-measurement");
  else if (stats.frames < MIN_FRAMES || stats.batches < MIN_BATCHES) issues.push("too-few-frames");
  if (flags.hidden) issues.push("hidden");
  if (flags.stalled) issues.push("stalled");
  if (stats.measured && stats.medianFps > MAX_PLAUSIBLE_FPS) issues.push("implausible");
  if (stats.measured && stats.cv > UNSTABLE_CV) issues.push("unstable");
  if (stats.drift !== null && stats.drift < -0.15) issues.push("throttling");
  if (flags.software) issues.push("software");
  return { valid: !issues.some((i) => INVALIDATING.includes(i)), issues };
}
