/**
 * NexRig browser benchmark — fixed workloads. Changing any value here changes the results, so it
 * must come with a new BENCH_VERSION; results of different versions are never compared.
 */
export const BENCH_VERSION = "nexrig-gfx-1.1";

export type BenchPresetId = "light" | "medium" | "heavy";
export type BenchMode = "short" | "stability";
export type BackendId = "webgl2" | "webgpu";

export interface BenchPreset {
  id: BenchPresetId;
  label: string;
  /** Rendered off-screen at this fixed size, whatever the window size. */
  width: number;
  height: number;
  /** Instanced cubes per frame. */
  instances: number;
  /** Fragment-shader loop iterations per pixel. */
  iterations: number;
}

export const BENCH_PRESETS: Record<BenchPresetId, BenchPreset> = {
  light: { id: "light", label: "Лёгкий", width: 960, height: 540, instances: 2_000, iterations: 8 },
  medium: { id: "medium", label: "Средний", width: 1280, height: 720, instances: 8_000, iterations: 24 },
  heavy: { id: "heavy", label: "Тяжёлый", width: 1920, height: 1080, instances: 20_000, iterations: 48 },
};

export interface BenchModeConfig {
  id: BenchMode;
  label: string;
  warmupMs: number;
  measureMs: number;
  /** Equal time windows for the stability analysis. */
  windows: number;
}

export const BENCH_MODES: Record<BenchMode, BenchModeConfig> = {
  short: { id: "short", label: "Короткий тест (~13 с)", warmupMs: 3_000, measureMs: 10_000, windows: 2 },
  stability: { id: "stability", label: "Тест устойчивости (~63 с)", warmupMs: 3_000, measureMs: 60_000, windows: 6 },
};

/** The animation advances by frame number, not wall time: every run renders the same frames. */
export const FRAME_STEP_S = 1 / 60;
/**
 * The animation loops every LOOP_FRAMES frames, so a fast GPU (which renders more frames) measures
 * the same scene states as a slow one — the workload does not drift with time.
 */
export const LOOP_FRAMES = 600;

/** Shader time for the given frame index. */
export const frameTime = (index: number) => (index % LOOP_FRAMES) * FRAME_STEP_S;

/** A run with fewer frames than this says nothing reliable. */
export const MIN_FRAMES = 30;
/** Each timed batch lasts at least this long (coarse performance.now() resolution). */
export const BATCH_MIN_MS = 50;
/** A run needs at least this many batches for its spread and 1% figures to mean anything. */
export const MIN_BATCHES = 20;
/** Coefficient of variation of frame times above which a run is marked unstable. */
export const UNSTABLE_CV = 0.25;
/** A pause between frames longer than this means the browser throttled or suspended the page. */
export const STALL_MS = 1_000;
/** Median FPS above this is implausible for any preset (likely a broken or skipped workload). */
export const MAX_PLAUSIBLE_FPS = 5_000;
