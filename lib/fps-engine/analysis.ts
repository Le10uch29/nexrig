import { GAMES } from "@/data/games";
import { availableFrameGen, effectiveSettings, estimateFps, MODEL_VERSION, roundModelFps, type MemoryConfig } from "@/lib/benchmark-engine/estimate";
import { hardwareRepository } from "@/lib/hardware/repository";
import type { BenchmarkRecord, Confidence, FpsConfidenceLevel, Game, GameSettings, GraphicsPreset, Resolution } from "@/types/benchmark";
import type { CpuSpec, GpuSpec, MemoryType } from "@/types/hardware";

/**
 * NexRig Benchmark, mode A — "Протестировать сборку". Multi-source analysis on top of the FPS
 * Data Engine.
 *
 * For every game × resolution the verified records are matched to the target build by tier:
 *   1. exact: same CPU, GPU, game, resolution and settings;
 *   2. same GPU and game, another CPU (or another resolution);
 *   3. same GPU in a similar setting: the same game with another preset, or another game with the
 *      same preset;
 *   4. a GPU within ±30% of the model index, same game and settings, corrected for CPU and RAM;
 *   5. model estimate (relative-performance model, no records);
 *   6. otherwise "insufficient data".
 *
 * Ray tracing, upscaler/mode and frame generation must always match: frame-generation results are
 * never mixed with ordinary FPS, RT never with raster. Averages are never compared with 1% lows.
 * A record from another system or setting is normalised by the ratio of the model's FPS for the
 * two cases (the model's smooth-min of GPU and CPU limits decides which side bottlenecks) — not by
 * multiplying raw index ratios. Every step is logged; every value carries its provenance:
 * measured (tier 1), estimated (tiers 2–4, transferred from real tests) or modeled (tier 5).
 *
 * Pure: used by /api/fps/analyze and by tests.
 */

export const ANALYSIS_RESOLUTIONS: Resolution[] = ["1080p", "1440p", "4K"];
export const ANALYSIS_PRESETS: GraphicsPreset[] = ["low", "medium", "high", "ultra"];

export type MatchTier = 1 | 2 | 3 | 4 | 5 | 6;
export type RecordTier = 1 | 2 | 3 | 4;
export type Provenance = "measured" | "estimated" | "modeled";

export const TIER_LABEL: Record<MatchTier, string> = {
  1: "Точное совпадение",
  2: "Та же видеокарта и игра",
  3: "Та же видеокарта, похожие игра или настройки",
  4: "Близкая по производительности видеокарта",
  5: "Модельная оценка",
  6: "Недостаточно данных",
};

export const ANALYSIS_LEVEL_LABEL: Record<FpsConfidenceLevel, string> = {
  verified: "Реальный тест",
  close: "Перенос с похожих систем",
  model: "Модельная оценка",
  insufficient: "Недостаточно данных",
};

export const PROVENANCE_LABEL: Record<Provenance, string> = { measured: "measured · измерено", estimated: "estimated · перенос", modeled: "modeled · модель" };

const PROVENANCE_OF: Record<FpsConfidenceLevel, Provenance | null> = { verified: "measured", close: "estimated", model: "modeled", insufficient: null };

/** Base transfer uncertainty per tier (share of the value). */
const TIER_UNCERTAINTY: Record<RecordTier, number> = { 1: 0.04, 2: 0.1, 3: 0.18, 4: 0.2 };
/** Another game is a weaker anchor than another preset of the same game. */
const OTHER_GAME_UNCERTAINTY = 0.3;
/** Transfers beyond this factor are refused: the systems are too different. */
const MAX_TRANSFER = 3;
/** GPUs count as "close" within this share of the model index. */
const CLOSE_INDEX = 0.3;
/** Results disagreeing more than this (max/min after outlier removal) are not used. */
const MAX_DISAGREEMENT = 2;
/** Above this spread the range is widened and confidence lowered. */
const WIDE_SPREAD = 1.35;
const MODEL_UNCERTAINTY = 0.25;
/** Tests older than this lose weight and add uncertainty (drivers and patches change results). */
const STALE_YEARS = 2;

export interface AnalysisTarget {
  cpu: CpuSpec;
  gpu: GpuSpec;
  memory?: MemoryConfig;
  ramGb?: number;
  /** Settings for all resolutions (preset, RT, upscaling, frame generation). */
  settings: Omit<GameSettings, "resolution">;
}

export interface TestMatch {
  recordId: string;
  tier: RecordTier;
  source: { id: string | null; label: string; url: string | null; date: string; gameVersion: string | null; method: string | null; community: boolean };
  testSystem: { cpu: string; gpu: string; ram: string | null; config: string | null; game: string; resolution: Resolution; settings: string };
  /** 0–100: how closely the test matches the target (components, settings, age). */
  matchScore: number;
  matched: string[];
  differences: string[];
  measured: { avg: number; low1: number | null; samples: number };
  transfer: { factor: number; method: string };
  transferred: { avg: number; low1: number | null };
  uncertainty: number;
  stale: boolean;
  used: boolean;
  excludedReason: string | null;
}

export interface Range {
  low: number;
  mid: number;
  high: number;
}

export interface ResolutionResult {
  resolution: Resolution;
  level: FpsConfidenceLevel;
  provenance: Provenance | null;
  tier: MatchTier;
  /** Average FPS. With frame generation on, presented FPS (interpolated frames included). */
  avg: Range | null;
  /** 1% low — only from records that measured it; never from the model. */
  low1: Range | null;
  frameGen: boolean;
  confidence: Confidence | null;
  /** Tests that went into the value. */
  testsUsed: number;
  reasons: string[];
  limitations: string[];
  bottleneck: "gpu" | "cpu" | "balanced" | null;
  tests: TestMatch[];
  /** Every step taken for this result, in order. */
  log: string[];
  /** The same build with other settings: presets, RT on, FG on. */
  variants?: Variants;
}

export interface VariantValue {
  label: string;
  provenance: Provenance | null;
  avg: Range | null;
  testsUsed: number;
}

export interface Variants {
  presets: (VariantValue & { preset: GraphicsPreset })[];
  /** RT on (null when the game or GPU has no RT, or RT is already on). */
  rayTracing: VariantValue | null;
  /** Frame generation on (null when unavailable or already on) — presented FPS. */
  frameGen: VariantValue | null;
}

export interface GameReport {
  gameId: string;
  title: string;
  version: string;
  results: ResolutionResult[];
}

export interface SimilarSystem {
  cpu: string;
  gpu: string;
  ram: string | null;
  tier: RecordTier;
  tests: number;
}

export interface AnalysisReport {
  modelVersion: string;
  generatedAt: string;
  target: { cpu: string; gpu: string; ram: string | null; settings: string };
  games: GameReport[];
  similarSystems: SimilarSystem[];
  sourcesUsed: { id: string | null; label: string; url: string | null; tests: number }[];
  counts: Record<FpsConfidenceLevel, number>;
  limitations: string[];
}

/* ------------------------------------------------------------------ labels */

export const PRESET_LABEL: Record<GraphicsPreset, string> = { low: "Низкие", medium: "Средние", high: "Высокие", ultra: "Ультра" };
const MODE_LABEL: Record<GameSettings["upscaling"], string> = { off: "выкл.", quality: "Quality", balanced: "Balanced", performance: "Performance" };

export function settingsLabel(s: Omit<GameSettings, "resolution"> & { resolution?: Resolution }): string {
  return [
    s.resolution,
    PRESET_LABEL[s.preset],
    s.rayTracing ? "RT вкл." : "RT выкл.",
    s.upscaling === "off" ? "без апскейлинга" : `${s.upscaler ?? "апскейлер"} ${MODE_LABEL[s.upscaling]}`,
    s.frameGen ? "FG вкл." : "FG выкл.",
  ]
    .filter(Boolean)
    .join(", ");
}

const ramLabel = (type: MemoryType | undefined, gb: number | undefined, speed?: number) =>
  type || gb ? [gb ? `${gb} ГБ` : null, type ?? null, speed ? `${speed} МТ/с` : null].filter(Boolean).join(" ") : null;

const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;

const ageYears = (date: string, now: Date) => Math.max(0, (now.getTime() - Date.parse(date)) / (365.25 * 24 * 3600 * 1000));

/* ------------------------------------------------------------------ phase 1: candidates */

export interface Candidate {
  record: BenchmarkRecord;
  /** Game the record was measured in (may differ from the target game in tier 3). */
  recordGame: Game;
  cpu: CpuSpec;
  gpu: GpuSpec;
  tier: RecordTier;
  matched: string[];
  differences: string[];
  otherGame: boolean;
  otherPreset: boolean;
}

export interface CandidateSet {
  candidates: Candidate[];
  /** Records left out, by reason. */
  excluded: Record<string, number>;
}

const close = (a: number, b: number) => a > 0 && b > 0 && Math.abs(a / b - 1) <= CLOSE_INDEX;

/** RT, upscaler and mode, frame generation: never transferred across. */
function strictSettingsMatch(r: GameSettings, q: GameSettings) {
  return r.rayTracing === q.rayTracing && r.upscaling === q.upscaling && (q.upscaling === "off" || (r.upscaler ?? null) === (q.upscaler ?? null)) && Boolean(r.frameGen) === Boolean(q.frameGen);
}

/**
 * Selects the comparable records for one game at one resolution and assigns their match tier.
 * Records of other games are considered only for the same GPU (tier 3).
 */
export function selectCandidates(target: AnalysisTarget, game: Game, resolution: Resolution, records: BenchmarkRecord[], disabledSources: Set<string> = new Set()): CandidateSet {
  const settings: GameSettings = { ...target.settings, resolution };
  const excluded: Record<string, number> = {};
  const skip = (reason: string) => (excluded[reason] = (excluded[reason] ?? 0) + 1);
  const candidates: Candidate[] = [];
  for (const r of records) {
    const sameGame = r.gameId === game.id;
    const rg = hardwareRepository.byId(r.gpuId);
    const sameChip = rg?.category === "gpu" && (rg.id === target.gpu.id || rg.chip === target.gpu.chip);
    // Other games only help when the GPU is the same; anything else is noise.
    if (!sameGame && !sameChip) continue;
    if (r.verification && r.verification !== "verified") {
      skip("не проверен");
      continue;
    }
    if (r.sourceId && disabledSources.has(r.sourceId)) {
      skip("источник отключён администратором");
      continue;
    }
    if (Boolean(r.settings.frameGen) !== Boolean(settings.frameGen)) {
      if (sameGame) skip("генерация кадров (FG) не смешивается с обычным FPS");
      continue;
    }
    if (!strictSettingsMatch(r.settings, settings)) {
      if (sameGame) skip("другие RT или апскейлинг");
      continue;
    }
    const recordGame = GAMES.find((g) => g.id === r.gameId);
    const rc = hardwareRepository.byId(r.cpuId);
    if (!recordGame || rc?.category !== "cpu" || rg?.category !== "gpu") {
      if (sameGame) skip("игры или комплектующего теста нет в каталоге");
      continue;
    }
    const samePreset = r.settings.preset === settings.preset;
    // Another game AND another preset is two steps away — not used.
    if (!sameGame && !samePreset) continue;
    const sameCpu = rc.id === target.cpu.id;
    const sameGpu = rg.id === target.gpu.id;
    const sameRes = r.settings.resolution === resolution;

    const matched = ["RT", "Апскейлинг", "Генерация кадров"];
    const differences: string[] = [];
    if (sameGame) matched.unshift("Игра");
    else differences.push(`Игра: ${recordGame.title} вместо ${game.title} (перенос через модель игры)`);
    if (samePreset) matched.push("Пресет");
    else differences.push(`Пресет: ${PRESET_LABEL[r.settings.preset]} вместо ${PRESET_LABEL[settings.preset]} (нормализация через модель)`);
    if (sameRes) matched.push("Разрешение");
    else differences.push(`Разрешение: ${r.settings.resolution} вместо ${resolution}`);
    if (sameCpu) matched.push("Процессор");
    else differences.push(`Процессор: ${rc.name} вместо ${target.cpu.name} (игровой индекс ${pct(target.cpu.gamingIndex / rc.gamingIndex - 1)} у вашего)`);
    if (sameGpu) matched.push("Видеокарта");
    else if (sameChip) differences.push(`Видеокарта: другая версия ${rg.chip} (${rg.name})`);
    else differences.push(`Видеокарта: ${rg.name} вместо ${target.gpu.name} (индекс ${pct(target.gpu.rasterIndex / rg.rasterIndex - 1)} у вашей)`);
    if (!sameChip && rg.architecture === target.gpu.architecture) matched.push(`Архитектура GPU (${rg.architecture})`);
    if (!sameChip && rg.vramGb !== target.gpu.vramGb) differences.push(`Видеопамять: ${rg.vramGb} ГБ против ${target.gpu.vramGb} ГБ`);
    if (r.ramType && target.memory) {
      if (r.ramType === target.memory.type) matched.push(`Тип памяти (${r.ramType})`);
      else differences.push(`Память: ${r.ramType} на стенде, ${target.memory.type} у вас`);
    }
    if (r.ramGb && target.ramGb && r.ramGb !== target.ramGb) differences.push(`Объём памяти: ${r.ramGb} ГБ на стенде, ${target.ramGb} ГБ у вас`);
    if (sameGame && r.gameVersion && r.gameVersion !== game.version) differences.push(`Версия игры в тесте: ${r.gameVersion} (модель настроена для ${game.version})`);

    let tier: RecordTier;
    if (sameGame && samePreset && sameCpu && sameGpu && sameRes) tier = 1;
    else if (sameGame && samePreset && sameChip) tier = 2;
    else if (sameChip) tier = 3;
    else if (sameGame && samePreset && close(rg.rasterIndex, target.gpu.rasterIndex)) tier = 4;
    else {
      skip("видеокарта теста слишком отличается (>±30%)");
      continue;
    }
    if (tier === 4) matched.push("Класс производительности GPU (±30%)");
    candidates.push({ record: r, recordGame, cpu: rc, gpu: rg, tier, matched, differences, otherGame: !sameGame, otherPreset: !samePreset });
  }
  return { candidates, excluded };
}

/* ------------------------------------------------------------------ phase 2: transfer */

export interface Transferred extends Candidate {
  factor: number;
  method: string;
  avg: number;
  low1: number | null;
  uncertainty: number;
  stale: boolean;
  /** Weight of this test (closer tier, more runs, fresher → higher). */
  weight: number;
  matchScore: number;
  refused: string | null;
}

function recordMemory(r: BenchmarkRecord, cpu: CpuSpec): MemoryConfig | undefined {
  if (!r.ramType) return undefined;
  return { type: r.ramType, speedMtps: cpu.memorySpeedMtps[r.ramType] ?? 3200, modules: 2 };
}

const modelReadyFor = (game: Game, cpu: CpuSpec, gpu: GpuSpec) => cpu.gamingIndex > 0 && gpu.rasterIndex > 0 && game.model.gpuFps1440High > 0 && game.model.cpuFpsCap > 0;

/** Normalises each candidate's measurement to the target build and settings through the model ratio. */
export function transferCandidates(target: AnalysisTarget, game: Game, resolution: Resolution, candidates: Candidate[], now: Date = new Date()): Transferred[] {
  const settings: GameSettings = { ...target.settings, resolution };
  const targetModel = modelReadyFor(game, target.cpu, target.gpu) ? estimateFps({ game, cpu: target.cpu, gpu: target.gpu, settings, memory: target.memory }) : null;
  return candidates.map((c) => {
    const r = c.record;
    const age = ageYears(r.testDate, now);
    const stale = age > STALE_YEARS;
    const staleness = stale ? Math.min(0.15, 0.05 * (age - STALE_YEARS + 1)) : 0;
    const differences = stale ? [...c.differences, `Тест от ${r.testDate} — старше ${STALE_YEARS} лет (драйверы и патчи могли изменить результат)`] : c.differences;
    const recency = 1 / (1 + Math.max(0, age - 1));
    const score = (u: number) => Math.max(0, Math.round(100 * (1 - u)));
    if (c.tier === 1) {
      const u = TIER_UNCERTAINTY[1] + staleness;
      return { ...c, differences, factor: 1, method: "Без переноса: та же конфигурация и настройки.", avg: r.avgFps, low1: r.low1Fps ?? null, uncertainty: u, stale, weight: (Math.sqrt(r.sampleCount) * recency) / (u * u), matchScore: score(u), refused: null };
    }
    const refuse = (reason: string, factor = NaN, method = "—") => ({ ...c, differences, factor, method, avg: NaN, low1: null, uncertainty: 1, stale, weight: 0, matchScore: 0, refused: reason });
    if (!targetModel || !modelReadyFor(c.recordGame, c.cpu, c.gpu)) return refuse("нет параметров модели для переноса");
    const sourceModel = estimateFps({ game: c.recordGame, cpu: c.cpu, gpu: c.gpu, settings: r.settings, memory: recordMemory(r, c.cpu) });
    const fg = Boolean(settings.frameGen);
    const tFps = fg ? (targetModel.frameGenFps ?? targetModel.avgFps) : targetModel.avgFps;
    const sFps = fg ? (sourceModel.frameGenFps ?? sourceModel.avgFps) : sourceModel.avgFps;
    const factor = tFps / sFps;
    // The "too different" check looks only at the systems: the same test settings on your build.
    // The game/preset part of the factor is the model's normalisation and is reported separately.
    const sameSettingsOnTarget = estimateFps({ game: c.recordGame, cpu: target.cpu, gpu: target.gpu, settings: r.settings, memory: target.memory });
    const systemFactor = (fg ? (sameSettingsOnTarget.frameGenFps ?? sameSettingsOnTarget.avgFps) : sameSettingsOnTarget.avgFps) / sFps;
    const settingFactor = factor / systemFactor;
    const method =
      `k = ${factor.toFixed(2)}: модель для вашей системы ${tFps} FPS / для теста ${sFps} FPS` +
      (c.otherGame ? ` (${c.recordGame.title} → ${game.title})` : "") +
      (c.otherPreset ? ` (пресет ${PRESET_LABEL[r.settings.preset]} → ${PRESET_LABEL[settings.preset]})` : "") +
      `. Предел GPU ${sourceModel.gpuBoundFps}→${targetModel.gpuBoundFps}, предел CPU ${sourceModel.cpuBoundFps}→${targetModel.cpuBoundFps}` +
      (targetModel.bottleneck === "cpu" ? " — у вас упор в процессор, разрешение почти не влияет." : targetModel.bottleneck === "gpu" ? " — у вас упор в видеокарту." : ".") +
      (c.otherGame || c.otherPreset ? ` Из них разница систем ×${systemFactor.toFixed(2)}, нормализация ${c.otherGame ? "игры" : "пресета"} ×${settingFactor.toFixed(2)}.` : "");
    if (!Number.isFinite(factor) || !Number.isFinite(systemFactor) || systemFactor > MAX_TRANSFER || systemFactor < 1 / MAX_TRANSFER) {
      return refuse(`конфигурации слишком разные для переноса (разница систем ×${Number.isFinite(systemFactor) ? systemFactor.toFixed(2) : "—"})`, factor, method);
    }
    let u = (c.otherGame ? OTHER_GAME_UNCERTAINTY : TIER_UNCERTAINTY[c.tier]) + Math.abs(Math.log(systemFactor)) * 0.15 + Math.min(0.1, Math.abs(Math.log(settingFactor)) * 0.08) + staleness;
    if (r.settings.resolution !== resolution) u += 0.04;
    if (r.ramType && target.memory && r.ramType !== target.memory.type) u += 0.03;
    if (!c.otherGame && r.gameVersion && r.gameVersion !== game.version) u += 0.03;
    u = Math.min(0.6, u);
    return { ...c, differences, factor, method, avg: r.avgFps * factor, low1: r.low1Fps ? r.low1Fps * factor : null, uncertainty: u, stale, weight: (Math.sqrt(r.sampleCount) * recency) / (u * u), matchScore: score(u), refused: null };
  });
}

/* ------------------------------------------------------------------ phase 3: reconcile */

export interface Reconciled {
  used: Transferred[];
  rejected: { t: Transferred; reason: string }[];
  bestTier: RecordTier | null;
  spread: number;
  /** Results contradict each other too much to be used. */
  contradictory: boolean;
  log: string[];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Keeps the closest tiers, removes outliers and measures agreement. */
export function reconcile(items: Transferred[]): Reconciled {
  const log: string[] = [];
  const rejected: Reconciled["rejected"] = [];
  const ok = items.filter((t) => {
    if (t.refused) rejected.push({ t, reason: t.refused });
    return !t.refused;
  });
  if (!ok.length) return { used: [], rejected, bestTier: null, spread: 1, contradictory: false, log };
  const bestTier = Math.min(...ok.map((t) => t.tier)) as RecordTier;
  // The closest tier, plus the next one as support — farther tiers add noise, not information.
  let used = ok.filter((t) => {
    const keep = t.tier <= bestTier + 1;
    if (!keep) rejected.push({ t, reason: `есть более близкие тесты (уровень ${bestTier})` });
    return keep;
  });
  log.push(`Лучший уровень совпадения: ${bestTier} — ${TIER_LABEL[bestTier]}. Используются уровни ${bestTier}${used.some((t) => t.tier > bestTier) ? `–${bestTier + 1}` : ""}.`);

  if (used.length >= 3) {
    const med = median(used.map((t) => t.avg));
    const mad = median(used.map((t) => Math.abs(t.avg - med)));
    const limit = Math.max(3 * 1.4826 * mad, 0.2 * med);
    used = used.filter((t) => {
      const out = Math.abs(t.avg - med) > limit;
      if (out) {
        const reason = `выброс: ${Math.round(t.avg)} FPS против медианы ${Math.round(med)} FPS`;
        rejected.push({ t, reason });
        log.push(`Запись ${t.record.id} исключена — ${reason}.`);
      }
      return !out;
    });
  }
  const values = used.map((t) => t.avg);
  const spread = values.length > 1 ? Math.max(...values) / Math.min(...values) : 1;
  const contradictory = spread > MAX_DISAGREEMENT;
  if (contradictory) log.push(`Результаты противоречат друг другу (разброс в ${spread.toFixed(1)} раза) — перенесённые тесты не используются.`);
  else if (spread > WIDE_SPREAD) log.push(`Результаты расходятся (в ${spread.toFixed(2)} раза) — диапазон расширен, уверенность снижена.`);
  return { used: contradictory ? [] : used, rejected, bestTier, spread, contradictory, log };
}

/* ------------------------------------------------------------------ phase 4: result */

function weightedMedian(items: { v: number; w: number }[]) {
  const s = [...items].sort((a, b) => a.v - b.v);
  const total = s.reduce((a, x) => a + x.w, 0);
  let acc = 0;
  for (const x of s) {
    acc += x.w;
    if (acc >= total / 2) return x.v;
  }
  return s[s.length - 1].v;
}

const independentKey = (r: BenchmarkRecord) => `${r.source.url ?? r.source.label}|${r.testDate}|${r.cpuId}|${r.gpuId}|${r.gameId}`;

function rangeOf(points: { v: number; w: number; u: number }[], exact: boolean): Range {
  const mid = weightedMedian(points);
  const vs = points.map((p) => p.v);
  if (exact) {
    const round = (n: number) => Math.max(1, Math.round(n));
    return { low: round(Math.min(...vs)), mid: round(mid), high: round(Math.max(...vs)) };
  }
  const u = points.reduce((a, p) => a + p.u * p.w, 0) / points.reduce((a, p) => a + p.w, 0) / Math.sqrt(Math.min(points.length, 4));
  const r = roundModelFps;
  return { low: r(Math.min(mid * (1 - u), ...vs)), mid: r(mid), high: r(Math.max(mid * (1 + u), ...vs)) };
}

function toMatch(t: Transferred, used: boolean, excludedReason: string | null): TestMatch {
  const r = t.record;
  return {
    recordId: r.id,
    tier: t.tier,
    source: { id: r.sourceId ?? null, label: r.source.label, url: r.source.url ?? null, date: r.testDate, gameVersion: r.gameVersion ?? null, method: r.method ?? null, community: Boolean(r.submittedBy) },
    testSystem: { cpu: t.cpu.name, gpu: t.gpu.name, ram: ramLabel(r.ramType, r.ramGb), config: r.testConfig ?? null, game: t.recordGame.title, resolution: r.settings.resolution, settings: settingsLabel(r.settings) },
    matchScore: t.matchScore,
    matched: t.matched,
    differences: t.differences,
    measured: { avg: r.avgFps, low1: r.low1Fps ?? null, samples: r.sampleCount },
    transfer: { factor: Number.isFinite(t.factor) ? Math.round(t.factor * 1000) / 1000 : 0, method: t.method },
    transferred: { avg: Number.isFinite(t.avg) ? Math.round(t.avg) : 0, low1: t.low1 !== null ? Math.round(t.low1) : null },
    uncertainty: Math.round(t.uncertainty * 100) / 100,
    stale: t.stale,
    used,
    excludedReason,
  };
}

const lower = (c: Confidence): Confidence => (c === "high" ? "medium" : "low");

/** One game at one resolution: all four phases, with the step log. */
export function analyzeResolution(target: AnalysisTarget, game: Game, resolution: Resolution, records: BenchmarkRecord[], disabledSources?: Set<string>, now: Date = new Date()): ResolutionResult {
  const settings: GameSettings = { ...target.settings, resolution };
  const eff = effectiveSettings(game, target.gpu, settings);
  const fg = Boolean(settings.frameGen);
  const log: string[] = [];

  const { candidates, excluded } = selectCandidates(target, game, resolution, records, disabledSources);
  const gameRecords = records.filter((r) => r.gameId === game.id).length;
  log.push(`Проверенных записей этой игры: ${gameRecords}; сопоставимых тестов (включая ту же видеокарту в других играх): ${candidates.length}.`);
  for (const [reason, n] of Object.entries(excluded)) log.push(`Исключено (${reason}): ${n}.`);

  const transferred = transferCandidates(target, game, resolution, candidates, now);
  for (const t of transferred) {
    if (t.refused) log.push(`Запись ${t.record.id}: перенос невозможен — ${t.refused}.`);
    else if (t.tier > 1) log.push(`Запись ${t.record.id} (${t.recordGame.title}, ${t.cpu.name} + ${t.gpu.name}, ${t.record.settings.resolution}): ${t.record.avgFps} FPS × ${t.factor.toFixed(2)} = ${Math.round(t.avg)} FPS.`);
    else log.push(`Запись ${t.record.id}: точное совпадение, ${t.record.avgFps} FPS.`);
    if (t.stale && !t.refused) log.push(`Запись ${t.record.id} старше ${STALE_YEARS} лет — вес снижен, неопределённость увеличена.`);
  }

  const rec = reconcile(transferred);
  log.push(...rec.log);
  const usedIds = new Set(rec.used.map((t) => t.record.id));
  const rejectedReason = new Map(rec.rejected.map((x) => [x.t.record.id, x.reason]));
  const tests = transferred
    .map((t) => toMatch(t, usedIds.has(t.record.id), usedIds.has(t.record.id) ? null : (rejectedReason.get(t.record.id) ?? (rec.contradictory ? "результаты противоречат друг другу" : null))))
    .sort((a, b) => Number(b.used) - Number(a.used) || a.tier - b.tier || b.matchScore - a.matchScore);

  const limitations = [...eff.notes];
  if (fg) limitations.push("Генерация кадров включена: значения — показанный FPS со вставленными кадрами; задержка ввода соответствует базовому FPS.");
  const targetModel = modelReadyFor(game, target.cpu, target.gpu) ? estimateFps({ game, cpu: target.cpu, gpu: target.gpu, settings, memory: target.memory }) : null;

  // Measured or transferred data.
  if (rec.used.length && rec.bestTier) {
    const exact = rec.bestTier === 1 && rec.used.every((t) => t.tier === 1);
    const points = rec.used.map((t) => ({ v: t.avg, w: t.weight, u: t.uncertainty }));
    const avg = rangeOf(points, exact);
    const lows = rec.used.filter((t) => t.low1 !== null).map((t) => ({ v: t.low1!, w: t.weight, u: t.uncertainty }));
    const low1 = lows.length ? rangeOf(lows, exact) : null;
    const independent = new Set(rec.used.map((t) => independentKey(t.record))).size;
    let confidence: Confidence = rec.bestTier === 1 ? (independent >= 3 ? "high" : "medium") : rec.bestTier === 2 && independent >= 2 ? "medium" : "low";
    if (rec.spread > WIDE_SPREAD) confidence = lower(confidence);
    if (rec.used.every((t) => t.stale)) confidence = lower(confidence);
    const reasons = [
      `${TIER_LABEL[rec.bestTier]}: использовано тестов — ${rec.used.length}, независимых — ${independent}.`,
      exact ? (rec.used.length > 1 ? "Диапазон — разброс между замерами." : "Один замер — диапазон не указывается.") : "Диапазон — неопределённость переноса и разброс между тестами.",
    ];
    if (rec.used.every((t) => t.stale)) reasons.push(`Все использованные тесты старше ${STALE_YEARS} лет — уверенность снижена.`);
    if (!low1) reasons.push("1% low в использованных тестах не измерен — не указывается.");
    else if (!exact) reasons.push("1% low перенесён из тестов с измеренным 1% low тем же коэффициентом — приблизительно.");
    log.push(`Итог: взвешенная медиана ${avg.mid} FPS, диапазон ${avg.low}–${avg.high}.`);
    const level: FpsConfidenceLevel = rec.bestTier === 1 && exact ? "verified" : "close";
    return { resolution, level, provenance: PROVENANCE_OF[level], tier: rec.bestTier, avg, low1, frameGen: fg, confidence, testsUsed: rec.used.length, reasons, limitations, bottleneck: targetModel?.bottleneck ?? null, tests, log };
  }

  // Model only.
  if (!targetModel) {
    log.push("Нет ни сопоставимых тестов, ни параметров модели.");
    return { resolution, level: "insufficient", provenance: null, tier: 6, avg: null, low1: null, frameGen: fg, confidence: null, testsUsed: 0, reasons: ["Недостаточно данных: подходящих тестов нет, а для этой конфигурации нет параметров модели."], limitations, bottleneck: null, tests, log };
  }
  const v = fg ? (targetModel.frameGenFps ?? targetModel.avgFps) : targetModel.avgFps;
  const r = roundModelFps;
  log.push(`Модель ${MODEL_VERSION}: предел GPU ${targetModel.gpuBoundFps}, предел CPU ${targetModel.cpuBoundFps} → ${v} FPS, неопределённость ±${MODEL_UNCERTAINTY * 100}%.`);
  return {
    resolution,
    level: "model",
    provenance: "modeled",
    tier: 5,
    avg: { low: r(v * (1 - MODEL_UNCERTAINTY)), mid: r(v), high: r(v * (1 + MODEL_UNCERTAINTY)) },
    low1: null,
    frameGen: fg,
    confidence: "low",
    testsUsed: 0,
    reasons: [
      rec.contradictory ? "Найденные тесты противоречат друг другу — использована модель." : "Сопоставимых тестов нет — оценка по модели относительной производительности.",
      "Это не замер. 1% low моделью не оценивается.",
    ],
    limitations: [...limitations, ...targetModel.assumptions.filter((a) => !limitations.includes(a))],
    bottleneck: targetModel.bottleneck,
    tests,
    log,
  };
}

function variantOf(label: string, r: ResolutionResult): VariantValue {
  return { label, provenance: r.provenance, avg: r.avg, testsUsed: r.testsUsed };
}

/** The same build and resolution with every preset, plus RT on and FG on where available. */
export function analyzeVariants(target: AnalysisTarget, game: Game, resolution: Resolution, records: BenchmarkRecord[], disabledSources?: Set<string>, now?: Date): Variants {
  const at = (settings: AnalysisTarget["settings"]) => analyzeResolution({ ...target, settings }, game, resolution, records, disabledSources, now);
  const s = target.settings;
  const presets = ANALYSIS_PRESETS.map((preset) => ({ preset, ...variantOf(PRESET_LABEL[preset], at({ ...s, preset })) }));
  const rtPossible = game.supportsRayTracing && target.gpu.rayTracing && target.gpu.rtIndex > 0;
  const fgPossible = Boolean(availableFrameGen(game, target.gpu));
  return {
    presets,
    rayTracing: rtPossible && !s.rayTracing ? variantOf("RT вкл.", at({ ...s, rayTracing: true })) : null,
    frameGen: fgPossible && !s.frameGen ? variantOf("Генерация кадров вкл. (показанный FPS)", at({ ...s, frameGen: true })) : null,
  };
}

export interface AnalyzeInput {
  target: AnalysisTarget;
  games: Game[];
  records: BenchmarkRecord[];
  disabledSources?: Set<string>;
  resolutions?: Resolution[];
  /** Build-level caveats (e.g. incompatible parts) shown with the report. */
  caveats?: string[];
  /** Also compute other presets, RT on and FG on. */
  variants?: boolean;
  now?: Date;
}

export function analyzeBuild({ target, games, records, disabledSources, resolutions = ANALYSIS_RESOLUTIONS, caveats = [], variants = true, now = new Date() }: AnalyzeInput): AnalysisReport {
  const verified = records.filter((r) => r.verification === undefined || r.verification === "verified");
  const gameReports = games.map((game) => ({
    gameId: game.id,
    title: game.title,
    version: game.version,
    results: resolutions.map((res) => {
      const result = analyzeResolution(target, game, res, verified, disabledSources, now);
      return variants ? { ...result, variants: analyzeVariants(target, game, res, verified, disabledSources, now) } : result;
    }),
  }));

  const counts: Record<FpsConfidenceLevel, number> = { verified: 0, close: 0, model: 0, insufficient: 0 };
  const systems = new Map<string, SimilarSystem>();
  const sources = new Map<string, { id: string | null; label: string; url: string | null; tests: Set<string> }>();
  for (const g of gameReports) {
    for (const res of g.results) {
      counts[res.level]++;
      for (const t of res.tests.filter((x) => x.used)) {
        const key = `${t.testSystem.cpu}|${t.testSystem.gpu}|${t.testSystem.ram ?? ""}`;
        const s = systems.get(key) ?? { cpu: t.testSystem.cpu, gpu: t.testSystem.gpu, ram: t.testSystem.ram, tier: t.tier, tests: 0 };
        s.tests++;
        s.tier = Math.min(s.tier, t.tier) as RecordTier;
        systems.set(key, s);
        const sk = t.source.url ?? t.source.id ?? t.source.label;
        const src = sources.get(sk) ?? { id: t.source.id, label: t.source.label, url: t.source.url, tests: new Set<string>() };
        src.tests.add(t.recordId);
        sources.set(sk, src);
      }
    }
  }
  const ram = target.memory ? ramLabel(target.memory.type, target.ramGb, target.memory.speedMtps) : null;
  return {
    modelVersion: MODEL_VERSION,
    generatedAt: now.toISOString(),
    target: { cpu: target.cpu.name, gpu: target.gpu.name, ram, settings: settingsLabel(target.settings) },
    games: gameReports,
    similarSystems: [...systems.values()].sort((a, b) => a.tier - b.tier || b.tests - a.tests),
    sourcesUsed: [...sources.values()].map((s) => ({ id: s.id, label: s.label, url: s.url, tests: s.tests.size })).sort((a, b) => b.tests - a.tests),
    counts,
    limitations: [
      ...caveats,
      ...(target.memory ? [] : ["Память в сборке не выбрана — принят двухканальный режим на официальной частоте."]),
      "Результаты зависят от сцены, драйвера и версии игры; перенос между системами — оценка, а не замер.",
      "Мощность, охлаждение и лимиты питания в расчёте не учитываются: достоверных данных о них нет — предполагается работа без троттлинга.",
    ],
  };
}
