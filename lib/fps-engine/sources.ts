import { hardwareRepository } from "@/lib/hardware/repository";
import type { BenchmarkRecord, DataSourceInfo } from "@/types/benchmark";
import type { CpuSpec, GpuSpec } from "@/types/hardware";
import { IMPORTABLE_SOURCE_IDS } from "./catalog";
import { importRowSchema, type ImportRow } from "./validation";

/**
 * FPS data sources. Each adapter reports its real status; nothing is shown as connected unless it
 * works in this build. No adapter scrapes websites: external editorial databases are used only
 * through permitted/licensed data, imported with attribution (see the admin import).
 */
export interface BenchmarkQuery {
  gameId?: string;
  cpuId?: string;
  gpuId?: string;
}

export interface FpsDataSource {
  info: DataSourceInfo;
  getSourceStatus(): Promise<Pick<DataSourceInfo, "status" | "errorMessage">>;
  getGameBenchmarks?(q: BenchmarkQuery): Promise<BenchmarkRecord[]>;
  getGpuSpecifications?(): Promise<GpuSpec[]>;
  getCpuSpecifications?(): Promise<CpuSpec[]>;
  validateImportedRecord(row: unknown): { ok: true; row: ImportRow } | { ok: false; errors: string[] };
}

const validate: FpsDataSource["validateImportedRecord"] = (row) => {
  const r = importRowSchema.safeParse(row);
  return r.success ? { ok: true, row: r.data } : { ok: false, errors: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
};

const base = { lastSyncAt: null, lastErrorAt: null, errorMessage: null } as const;

/** Manufacturer specifications, transcribed into the local catalogue (unverified per item). */
export const MANUFACTURER: FpsDataSource = {
  info: {
    id: "manufacturer",
    name: "Спецификации производителей (локальный каталог)",
    baseUrl: null,
    integration: "local-catalogue",
    status: "active",
    ...base,
    attribution: "Характеристики перенесены с официальных страниц; у шаблонных партнёрских версий помечены как приблизительные.",
    updateMode: "manual",
    description: "Сокеты, типы памяти, размеры, мощность, разъёмы. Перенесены вручную и требуют сверки перед продакшеном — каталог показывает качество данных у каждой позиции.",
  },
  async getSourceStatus() {
    return { status: "active", errorMessage: null };
  },
  async getGpuSpecifications() {
    return hardwareRepository.byCategory("gpu") as GpuSpec[];
  },
  async getCpuSpecifications() {
    return hardwareRepository.byCategory("cpu") as CpuSpec[];
  },
  validateImportedRecord: validate,
};

/** The NexRig database: imported and manually entered records (server store). */
export function nexrigSource(store: { kind: "supabase" | "file"; ping(): Promise<void>; query(f: BenchmarkQuery & { verification: "verified" }): Promise<BenchmarkRecord[]> }): FpsDataSource {
  return {
    info: {
      id: "nexrig",
      name: "База NexRig (замеры пользователей и импорт)",
      baseUrl: null,
      integration: "manual-import",
      status: "active",
      ...base,
      attribution: "Источник, ссылка и дата указаны в каждой записи.",
      updateMode: "manual",
      description:
        store.kind === "supabase"
          ? "Проверенные результаты в базе Supabase: замеры пользователей после модерации и записи, импортированные администраторами. В расчётах — только записи со статусом «проверено»."
          : "Локальное файловое хранилище (режим разработки, не для production). В расчётах — только записи со статусом «проверено».",
    },
    async getSourceStatus() {
      try {
        await store.ping();
        return { status: "active", errorMessage: null };
      } catch (e) {
        // Store errors carry a safe, user-facing message (and a status); anything else stays generic.
        return { status: "error", errorMessage: e instanceof Error && "status" in e ? e.message : "Хранилище недоступно." };
      }
    },
    getGameBenchmarks: (q) => store.query({ ...q, verification: "verified" }),
    validateImportedRecord: validate,
  };
}

/** Sources shown to users: only ones that actually work (no "not connected" placeholders). */
export function activeSources(store: Parameters<typeof nexrigSource>[0]): FpsDataSource[] {
  return [nexrigSource(store), MANUFACTURER];
}

/** Source ids accepted in imports: the audited catalogue (see catalog.ts), except non-FPS sources. */
export const SOURCE_IDS = IMPORTABLE_SOURCE_IDS;

/** The estimation model, listed for transparency; it never produces records. */
export const MODEL_SOURCE: DataSourceInfo = {
  id: "model",
  name: "Модель относительной производительности NexRig",
  baseUrl: null,
  integration: "model",
  status: "active",
  ...base,
  attribution: "Параметры модели заданы вручную; результаты помечаются как оценка.",
  updateMode: "none",
  description: "Индексы CPU/GPU и базовые FPS игр — параметры модели, а не замеры. Используется, когда подходящих тестов нет; калибруется близкими проверенными замерами.",
};
