import type { AnalysisReport } from "./analysis";

/** Stages of the "Протестировать ПК" run, shared by the API stream and the UI. */
export const ANALYSIS_STAGES = [
  { id: "freeze", label: "Фиксация конфигурации" },
  { id: "sources", label: "Проверка источников" },
  { id: "exact", label: "Точные тесты этой сборки" },
  { id: "gpu", label: "Тесты этой видеокарты" },
  { id: "cpu", label: "Тесты этого процессора" },
  { id: "similar", label: "Похожие системы и другие тесты игр" },
  { id: "normalize", label: "Сопоставление методик и настроек" },
  { id: "transfer", label: "Перенос результатов на вашу сборку" },
  { id: "reconcile", label: "Выбросы и согласованность" },
  { id: "report", label: "Расчёт FPS и отчёт" },
] as const;

export type StageId = (typeof ANALYSIS_STAGES)[number]["id"];
export type StageStatus = "pending" | "running" | "done" | "empty" | "error";

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  pending: "Ожидает",
  running: "Выполняется",
  done: "Завершён",
  empty: "Нет данных",
  error: "Ошибка",
};

/** One NDJSON line of /api/fps/analyze. */
export type AnalysisEvent =
  | { type: "start"; runId: string; buildVersion: string; configKey: string; cached: boolean; cachedAt: string | null }
  | { type: "stage"; id: StageId; status: StageStatus; detail?: string }
  | { type: "result"; report: AnalysisReport; cached: boolean; cachedAt: string | null; warnings: string[] }
  | { type: "fatal"; message: string };

/** Short, stable fingerprint (FNV-1a, 32 bit) of a JSON-serialisable value. Not a security hash. */
export function fingerprint(value: unknown): string {
  const s = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, "0");
}
