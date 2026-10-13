export type Resolution = "1080p" | "1440p" | "4K";
export type GraphicsPreset = "low" | "medium" | "high" | "ultra";
export type UpscalingMode = "off" | "quality" | "balanced" | "performance";

export interface GameSettings {
  resolution: Resolution;
  preset: GraphicsPreset;
  rayTracing: boolean;
  upscaling: UpscalingMode;
}

export interface Game {
  id: string;
  title: string;
  /** Version the model parameters were set for. */
  version: string;
  genre: string;
  supportsRayTracing: boolean;
  upscalers: ("DLSS" | "FSR" | "XeSS")[];
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
  conditions?: string;
  sampleCount: number;
}

export type Confidence = "low" | "medium" | "high";

export type PerformanceResult =
  | {
      kind: "measured";
      avgFps: number;
      low1Fps: number | null;
      rangeFps: [number, number] | null;
      records: BenchmarkRecord[];
      confidence: Confidence;
    }
  | {
      kind: "estimated";
      avgFps: number;
      low1Fps: number;
      rangeFps: [number, number];
      bottleneck: "gpu" | "cpu" | "balanced";
      confidence: Confidence;
      method: string;
      assumptions: string[];
    }
  | { kind: "unavailable"; reason: string };
