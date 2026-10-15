import { z } from "zod";
import { fingerprint } from "@/lib/fps-engine/analysis-stages";
import { BATCH_MIN_MS, BENCH_MODES, BENCH_PRESETS, BENCH_VERSION, MAX_PLAUSIBLE_FPS, MIN_BATCHES, MIN_FRAMES, UNSTABLE_CV } from "./config";
import { INVALIDATING, type BenchIssue } from "./stats";

/**
 * A browser benchmark result as the client sends it for publication. The server never trusts the
 * FPS figures as a confirmed measurement: it checks they are internally consistent, flags
 * anomalies, stores the result as "unverified" and an admin decides.
 */

/** Browser family + major version, exactly as describeAgent() produces it. */
export const BROWSER_PATTERN = /^(?:(?:Chrome|Edge|Firefox|Safari|Opera) \d{1,4}|неизвестный браузер)$/;
export const OS_VALUES = ["Windows", "macOS", "Linux", "Android", "iOS", "неизвестная ОС"] as const;
/** GPU strings as browsers report them (ANGLE/WebGPU adapter text): letters, digits, punctuation — no links or markup. */
export const GPU_RENDERER_PATTERN = /^[\p{L}\p{N} ()[\]\-_.,/+:;@&#']{2,200}$/u;
const NO_LINKS = (v: string) => !/https?:|www\.|<|>/i.test(v);

export const submissionSchema = z.object({
  version: z.string().max(40),
  backend: z.enum(["webgl2", "webgpu"]),
  preset: z.enum(["light", "medium", "heavy"]),
  mode: z.enum(["short", "stability"]),
  width: z.number().int().min(1).max(8192),
  height: z.number().int().min(1).max(8192),
  stats: z.object({
    measured: z.literal(true),
    frames: z.number().int().min(1).max(10_000_000),
    batches: z.number().int().min(1).max(1_000_000),
    durationMs: z.number().min(1).max(3_600_000),
    wallMs: z.number().min(1).max(3_600_000),
    medianMs: z.number().positive().max(100_000),
    medianFps: z.number().positive().max(100_000),
    meanFps: z.number().positive().max(100_000),
    p1LowFps: z.number().positive().max(100_000),
    cv: z.number().min(0).max(100),
    drift: z.number().min(-1).max(100).nullable(),
    windowFps: z.array(z.number().positive().max(100_000)).max(20),
  }),
  issues: z.array(z.enum(["no-measurement", "too-few-frames", "hidden", "stalled", "unstable", "throttling", "software", "implausible"])).max(10),
  software: z.boolean(),
  /** Sent only when the user ticked "publish GPU name". */
  gpuRenderer: z.string().trim().regex(GPU_RENDERER_PATTERN).refine(NO_LINKS).nullable(),
  browser: z.string().trim().regex(BROWSER_PATTERN),
  os: z.enum(OS_VALUES),
  logicalCores: z.number().int().min(1).max(1024).nullable(),
});

export type Submission = z.infer<typeof submissionSchema>;

export type AnomalyFlag = "software" | "unstable" | "throttling" | "high-fps" | "low-frames";

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b));

/**
 * Time relations the measurement loop guarantees (see runner.ts):
 *  - wallMs: the measurement ran for at least measureMs and stopped after the batch that crossed
 *    it (plus at most one long frame);
 *  - durationMs (sum of batch times) ≤ wallMs, and the gaps between batches are short yields, so
 *    durationMs ≥ MIN_BUSY_SHARE × wallMs;
 *  - every batch lasts at least BATCH_MIN_MS, so batches ≤ durationMs / BATCH_MIN_MS.
 */
const MIN_BUSY_SHARE = 0.85;

/** Rejects inconsistent or invalid results; returns anomaly flags for moderation otherwise. */
export function checkSubmission(s: Submission): { ok: true; anomalies: AnomalyFlag[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const preset = BENCH_PRESETS[s.preset];
  const mode = BENCH_MODES[s.mode];
  const st = s.stats;
  if (s.version !== BENCH_VERSION) errors.push(`Устаревшая версия теста (${s.version}); текущая — ${BENCH_VERSION}. Пройдите тест заново.`);
  if (s.width !== preset.width || s.height !== preset.height) errors.push("Разрешение не соответствует пресету.");
  if (s.issues.some((i) => INVALIDATING.includes(i as BenchIssue))) errors.push("Недостоверный прогон (скрытая вкладка, пауза браузера или мало кадров) не публикуется.");
  if (st.frames < MIN_FRAMES || st.batches < MIN_BATCHES) errors.push("Слишком мало кадров или отрезков измерения.");
  if (st.frames < st.batches) errors.push("Кадров не может быть меньше, чем отрезков измерения.");
  if (!near(st.medianFps, 1000 / st.medianMs, 0.02)) errors.push("Медианный FPS не согласуется с медианным временем кадра.");
  if (st.p1LowFps > st.medianFps * 1.001) errors.push("1% худших отрезков не может быть выше медианы.");
  if (!near(st.meanFps, (st.frames * 1000) / st.durationMs, 0.02)) errors.push("Средний FPS не согласуется с числом кадров и временем работы.");
  if (st.wallMs < mode.measureMs * 0.99 || st.wallMs > mode.measureMs + Math.max(5_000, 2 * st.medianMs)) errors.push("Длительность измерения не соответствует режиму теста.");
  if (st.durationMs > st.wallMs + 1 || st.durationMs < st.wallMs * MIN_BUSY_SHARE) errors.push("Время работы нагрузки не согласуется с длительностью измерения.");
  if (st.batches > st.durationMs / BATCH_MIN_MS + 1) errors.push("Отрезков измерения больше, чем позволяет их минимальная длина.");
  // A very long batch can span two windows, so fewer windows than configured is possible.
  if (st.windowFps.length < 1 || st.windowFps.length > mode.windows) errors.push("Число окон измерения не соответствует режиму.");
  if (st.medianFps > MAX_PLAUSIBLE_FPS) errors.push("Неправдоподобно высокий FPS.");
  if (s.software !== s.issues.includes("software")) errors.push("Флаг программного рендеринга не согласован.");
  if (errors.length) return { ok: false, errors };

  const anomalies: AnomalyFlag[] = [];
  if (s.software) anomalies.push("software");
  if (st.cv > UNSTABLE_CV) anomalies.push("unstable");
  if (st.drift !== null && st.drift < -0.15) anomalies.push("throttling");
  if (st.medianFps > MAX_PLAUSIBLE_FPS / 2) anomalies.push("high-fps");
  if (st.frames < MIN_FRAMES * 5) anomalies.push("low-frames");
  return { ok: true, anomalies };
}

/** Same measurement summary = duplicate (per user). */
export function submissionFingerprint(s: Submission): string {
  const st = s.stats;
  return fingerprint([s.version, s.backend, s.preset, s.mode, st.frames, st.batches, st.durationMs, st.wallMs, st.medianMs, st.p1LowFps, st.cv]);
}

/** A stored result as shown publicly (no user id). Free-text fields are null unless verified. */
export interface PublicBrowserResult {
  id: string;
  version: string;
  backend: "webgl2" | "webgpu";
  preset: "light" | "medium" | "heavy";
  mode: "short" | "stability";
  medianFps: number;
  p1LowFps: number;
  meanFps: number;
  cv: number;
  drift: number | null;
  frames: number;
  gpuRenderer: string | null;
  browser: string | null;
  os: string | null;
  software: boolean;
  anomalies: string[];
  status: "unverified" | "verified" | "rejected";
  createdAt: string;
}
