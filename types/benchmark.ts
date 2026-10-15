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
  // Optional provenance and test-system fields (FPS Data Engine). Unknown values stay undefined.
  /** Data source id (see DataSourceInfo), e.g. "nexrig", "tomshardware". */
  sourceId?: string;
  ramGb?: number;
  ramType?: "DDR3" | "DDR4" | "DDR5";
  /** Only with a stated measurement method. */
  minFps?: number;
  minFpsMethod?: string;
  cpuUtil?: number;
  gpuUtil?: number;
  os?: string;
  driver?: string;
  verification?: VerificationStatus;
  importBatchId?: string;
  /** Auth user who submitted the measurement (community submissions). Never exposed publicly. */
  submittedBy?: string;
  /** Set by the public API instead of submittedBy: a verified measurement sent by a user. */
  community?: boolean;
  createdAt?: string;
}

export type VerificationStatus = "unverified" | "verified" | "rejected";

export type SourceStatus = "active" | "not_configured" | "disabled" | "error";
export type SourceIntegration = "api" | "licensed-dataset" | "manual-import" | "local-catalogue" | "model";

/** A data source as shown to users; never "active" unless the connection actually works. */
export interface DataSourceInfo {
  id: string;
  name: string;
  baseUrl: string | null;
  integration: SourceIntegration;
  status: SourceStatus;
  lastSyncAt: string | null;
  lastErrorAt: string | null;
  /** Without secrets. */
  errorMessage: string | null;
  attribution: string;
  updateMode: "manual" | "scheduled" | "none";
  description: string;
  /** How data gets in, as shown to users (e.g. "ручной импорт"). */
  integrationLabel?: string;
  /** Verified records from this source used in calculations. */
  usableRecords?: number | null;
}

/** Reliability level shown to the user. */
export type FpsConfidenceLevel = "verified" | "close" | "model" | "insufficient";

/** Engine output (FPS Data Engine contract). Unknown values are null, never 0. */
export interface FpsEstimate {
  level: FpsConfidenceLevel;
  averageFpsEstimate: number | null;
  /** Range bounds; null for a single measurement (no invented spread). */
  lowFpsEstimate: number | null;
  highFpsEstimate: number | null;
  onePercentLow: number | null;
  /** Presented FPS with frame generation (interpolated frames), reported separately. */
  frameGenFps: number | null;
  confidence: Confidence | null;
  confidenceReasons: string[];
  dataSource: string | null;
  sourceUrl: string | null;
  /** Every record the value is based on, each with its own link (measured or calibration anchors). */
  sources: EstimateSource[];
  benchmarkDate: string | null;
  gameVersion: string | null;
  calculationMethod: string;
  limitations: string[];
  /** Records the result is based on (measured or calibration anchors). */
  recordCount: number;
  bottleneck: "gpu" | "cpu" | "balanced" | null;
}

export type Confidence = "low" | "medium" | "high";

export interface EstimateSource {
  label: string;
  url: string | null;
  date: string;
  /** Sent by a NexRig user (and verified by an admin). */
  community: boolean;
}

export interface ModelBreakdown {
  avgFps: number;
  /** Only when backed by real 1% low measurements (calibration); the model alone has none. */
  low1Fps: number | null;
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
      /** The records were taken with frame generation: avgFps counts interpolated frames. */
      frameGenIncluded: boolean;
    }
  | ({ kind: "calibrated"; calibrationRecords: number; anchors: BenchmarkRecord[] } & ModelBreakdown)
  | ({ kind: "estimated" } & ModelBreakdown)
  | { kind: "unavailable"; reason: string };
