export type Resolution = "1080p" | "1440p" | "4K";
export type GraphicsPreset = "low" | "medium" | "high" | "ultra";
export type UpscalingMode = "off" | "quality" | "balanced" | "performance";
export type Upscaler = "DLSS" | "FSR" | "XeSS";
export type FrameGenTech = "DLSS-FG" | "FSR-FG";

export const RESOLUTION_PIXELS: Record<Resolution, string> = {
  "1080p": "1920×1080",
  "1440p": "2560×1440",
  "4K": "3840×2160",
};

export interface GameSettings {
  resolution: Resolution;
  preset: GraphicsPreset;
  rayTracing: boolean;
  upscaling: UpscalingMode;
  /** Which upscaler runs when upscaling is on (must be supported by game and GPU). */
  upscaler?: Upscaler | null;
  /** Frame generation (must be supported by game and GPU). */
  frameGen?: boolean;
}

export interface Game {
  id: string;
  title: string;
  /** Version the model parameters were set for. */
  version: string;
  genre: string;
  supportsRayTracing: boolean;
  upscalers: Upscaler[];
  frameGen: FrameGenTech[];
  /**
   * Estimation model parameters. These are hand-set calibration constants, NOT measurements.
   * gpuFps1440High: FPS of the reference GPU (index 100) at 1440p/High with no CPU limit.
   * cpuFpsCap: FPS ceiling of the reference CPU (index 100) in CPU-bound scenes.
   */
  model: {
    gpuFps1440High: number;
    cpuFpsCap: number;
    rtCost: number;
    lowRatio: number;
  };
}

/** A real measurement entered from a source (user or imported dataset). */
export interface BenchmarkRecord {
  id: string;
  gameId: string;
  gameVersion?: string;
  cpuId: string;
  gpuId: string;
  settings: GameSettings;
  avgFps: number;
  low1Fps?: number;
  source: { kind: "user" | "dataset"; label: string; url?: string };
  testDate: string;
  /** Test system details beyond CPU/GPU: RAM, driver, OS. */
  testConfig?: string;
  /** How it was measured, e.g. "CapFrameX, 60 с, встроенный бенчмарк". */
  method?: string;
  conditions?: string;
  notes?: string;
  sampleCount: number;
}

export type Confidence = "low" | "medium" | "high";

export interface ModelBreakdown {
  avgFps: number;
  low1Fps: number;
  rangeFps: [number, number];
  /** FPS ceiling from the GPU side alone (model). */
  gpuBoundFps: number;
  /** FPS ceiling from the CPU/memory side alone (model). */
  cpuBoundFps: number;
  bottleneck: "gpu" | "cpu" | "balanced";
  /** Model-derived load: share of each side's ceiling used at the predicted FPS (0–1). */
  utilization: { gpu: number; cpu: number };
  /** Presented frame rate with frame generation, if enabled. Interpolated frames, not rendered ones. */
  frameGenFps: number | null;
  confidence: Confidence;
  method: string;
  assumptions: string[];
}

/**
 * Three tiers, never mixed up:
 *  - measured: real benchmark records for this exact configuration;
 *  - calibrated: model estimate scaled by real records of the same GPU and game;
 *  - estimated: model-only approximation from relative indices (demo-grade).
 */
export type PerformanceResult =
  | {
      kind: "measured";
      avgFps: number;
      low1Fps: number | null;
      rangeFps: [number, number] | null;
      records: BenchmarkRecord[];
      confidence: Confidence;
    }
  | ({ kind: "calibrated"; calibrationRecords: number } & ModelBreakdown)
  | ({ kind: "estimated" } & ModelBreakdown)
  | { kind: "unavailable"; reason: string };
