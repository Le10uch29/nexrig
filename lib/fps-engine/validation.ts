import { z } from "zod";
import { GAMES } from "@/data/games";
import { hardwareRepository } from "@/lib/hardware/repository";
import type { BenchmarkRecord } from "@/types/benchmark";

/**
 * Import validation for benchmark records (CSV or JSON). Format checks only prove that a row is
 * well-formed and internally consistent — imported rows start as "unverified" until an admin
 * confirms them against the source.
 */

export const IMPORT_LIMITS = { maxBytes: 1_000_000, maxRows: 5000 } as const;

const num = (min: number, max: number) => z.coerce.number().min(min).max(max);
const optionalNum = (min: number, max: number) => z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), num(min, max).optional());
const optionalText = (max: number) => z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().max(max).optional());
const bool = z.preprocess((v) => (typeof v === "string" ? ["1", "true", "yes", "да"].includes(v.trim().toLowerCase()) : v), z.boolean());

/** One flat row, as in CSV columns or JSON objects. */
export const importRowSchema = z
  .object({
    game_id: z.string().trim().min(1),
    game_version: optionalText(60),
    cpu_id: z.string().trim().min(1),
    gpu_id: z.string().trim().min(1),
    ram_gb: optionalNum(1, 1024),
    ram_type: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["DDR3", "DDR4", "DDR5"]).optional()),
    resolution: z.enum(["1080p", "1440p", "4K"]),
    preset: z.enum(["low", "medium", "high", "ultra"]),
    ray_tracing: bool,
    upscaling: z.preprocess((v) => (v === "" || v === undefined ? "off" : v), z.enum(["off", "quality", "balanced", "performance"])),
    upscaler: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["DLSS", "FSR", "XeSS"]).optional()),
    frame_gen: z.preprocess((v) => (v === "" || v === undefined ? false : v), bool),
    avg_fps: num(1, 1000),
    low1_fps: optionalNum(1, 1000),
    min_fps: optionalNum(1, 1000),
    min_fps_method: optionalText(200),
    cpu_util: optionalNum(0, 100),
    gpu_util: optionalNum(0, 100),
    os: optionalText(80),
    driver: optionalText(80),
    source_id: z.preprocess((v) => (v === "" || v === undefined ? "nexrig" : v), z.string().trim().max(40)),
    source_label: z.string().trim().min(2).max(120),
    source_url: z.preprocess((v) => (v === "" ? undefined : v), z.url({ protocol: /^https$/ }).max(500).optional()),
    test_date: z.iso.date(),
    method: optionalText(200),
    test_config: optionalText(300),
    notes: optionalText(500),
    sample_count: z.preprocess((v) => (v === "" || v === undefined ? 1 : v), z.coerce.number().int().min(1).max(100)),
  })
  .superRefine((r, ctx) => {
    if (r.low1_fps !== undefined && r.low1_fps > r.avg_fps) ctx.addIssue({ code: "custom", path: ["low1_fps"], message: "1% low не может быть выше среднего FPS" });
    if (r.min_fps !== undefined && r.low1_fps !== undefined && r.min_fps > r.low1_fps) ctx.addIssue({ code: "custom", path: ["min_fps"], message: "Минимум не может быть выше 1% low" });
    if (r.min_fps !== undefined && !r.min_fps_method) ctx.addIssue({ code: "custom", path: ["min_fps_method"], message: "Минимальный FPS принимается только с указанной методикой" });
    if (r.upscaling !== "off" && !r.upscaler) ctx.addIssue({ code: "custom", path: ["upscaler"], message: "Укажите апскейлер (DLSS/FSR/XeSS) для режима апскейлинга" });
    if (r.test_date > new Date().toISOString().slice(0, 10)) ctx.addIssue({ code: "custom", path: ["test_date"], message: "Дата теста в будущем" });
  });

export type ImportRow = z.infer<typeof importRowSchema>;

export interface RowError {
  row: number;
  messages: string[];
}

/** Catalogue/game references and source existence (beyond format). */
function referenceErrors(r: ImportRow, knownSources: Set<string>): string[] {
  const errors: string[] = [];
  const game = GAMES.find((g) => g.id === r.game_id);
  if (!game) errors.push(`Неизвестная игра: ${r.game_id}`);
  const cpu = hardwareRepository.byId(r.cpu_id);
  if (!cpu || cpu.category !== "cpu") errors.push(`Неизвестный процессор: ${r.cpu_id}`);
  const gpu = hardwareRepository.byId(r.gpu_id);
  if (!gpu || gpu.category !== "gpu") errors.push(`Неизвестная видеокарта: ${r.gpu_id}`);
  if (!knownSources.has(r.source_id)) errors.push(`Неизвестный источник: ${r.source_id}`);
  if (game && r.ray_tracing && !game.supportsRayTracing) errors.push("Игра не поддерживает трассировку лучей");
  if (game && r.upscaler && !game.upscalers.includes(r.upscaler)) errors.push(`Игра не поддерживает ${r.upscaler}`);
  if (game && r.frame_gen && game.frameGen.length === 0) errors.push("Игра не поддерживает генерацию кадров");
  return errors;
}

export function toRecord(r: ImportRow, id: string, batchId?: string): BenchmarkRecord {
  return {
    id,
    gameId: r.game_id,
    gameVersion: r.game_version,
    cpuId: r.cpu_id,
    gpuId: r.gpu_id,
    settings: { resolution: r.resolution, preset: r.preset, rayTracing: r.ray_tracing, upscaling: r.upscaling, upscaler: r.upscaler ?? null, frameGen: r.frame_gen },
    avgFps: r.avg_fps,
    low1Fps: r.low1_fps,
    minFps: r.min_fps,
    minFpsMethod: r.min_fps_method,
    cpuUtil: r.cpu_util,
    gpuUtil: r.gpu_util,
    ramGb: r.ram_gb,
    ramType: r.ram_type,
    os: r.os,
    driver: r.driver,
    source: { kind: "dataset", label: r.source_label, url: r.source_url },
    sourceId: r.source_id,
    testDate: r.test_date,
    method: r.method,
    testConfig: r.test_config,
    notes: r.notes,
    sampleCount: r.sample_count,
    verification: "unverified",
    importBatchId: batchId,
  };
}

/** Same test = same configuration, settings, source URL and date. */
export function dedupeKey(r: BenchmarkRecord): string {
  const s = r.settings;
  return [r.gameId, r.cpuId, r.gpuId, s.resolution, s.preset, s.rayTracing, s.upscaling, s.upscaler ?? "", Boolean(s.frameGen), r.source.url ?? "", r.testDate].join("|");
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). First row = header. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (quoted) throw new Error("Незакрытые кавычки в CSV");
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((cells) => Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? "").trim()])));
}

export interface ImportPreview {
  total: number;
  valid: { row: number; record: BenchmarkRecord }[];
  errors: RowError[];
  duplicates: { row: number; reason: string }[];
}

/** Parses and validates an import payload against the catalogue and existing records. */
export function previewImport(
  payload: { format: "csv" | "json"; content: string },
  existing: BenchmarkRecord[],
  knownSources: Set<string>,
  makeId: (i: number) => string,
): ImportPreview {
  if (payload.content.length > IMPORT_LIMITS.maxBytes) throw new Error(`Файл больше ${IMPORT_LIMITS.maxBytes / 1_000_000} МБ`);
  let raw: unknown[];
  if (payload.format === "csv") raw = parseCsv(payload.content);
  else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload.content);
    } catch {
      throw new Error("Некорректный JSON");
    }
    if (!Array.isArray(parsed)) throw new Error("JSON должен быть массивом записей");
    raw = parsed;
  }
  if (raw.length > IMPORT_LIMITS.maxRows) throw new Error(`Больше ${IMPORT_LIMITS.maxRows} строк за один импорт`);

  const seen = new Set(existing.map(dedupeKey));
  const out: ImportPreview = { total: raw.length, valid: [], errors: [], duplicates: [] };
  raw.forEach((item, i) => {
    const row = i + 1;
    const parsed = importRowSchema.safeParse(item);
    if (!parsed.success) {
      out.errors.push({ row, messages: parsed.error.issues.map((iss) => `${iss.path.join(".") || "строка"}: ${iss.message}`) });
      return;
    }
    const refs = referenceErrors(parsed.data, knownSources);
    if (refs.length) {
      out.errors.push({ row, messages: refs });
      return;
    }
    const record = toRecord(parsed.data, makeId(i));
    const key = dedupeKey(record);
    if (seen.has(key)) {
      out.duplicates.push({ row, reason: "Такой тест (конфигурация, настройки, источник и дата) уже есть" });
      return;
    }
    seen.add(key);
    out.valid.push({ row, record });
  });
  return out;
}
