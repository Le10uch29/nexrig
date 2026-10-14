import type { BenchmarkRecord, GameSettings } from "@/types/benchmark";

/**
 * Extensible FPS data layer. A source returns real measurement records; the estimate model is
 * listed for transparency but never produces records.
 *
 * To add an external provider: implement BenchmarkSource on the server (API route), keep any key
 * in server env vars, and merge its records with the user's before calling getPerformance().
 * None is configured in this build — the UI states that instead of simulating one.
 */
export interface BenchmarkQuery {
  gameId?: string;
  cpuId?: string;
  gpuId?: string;
  settings?: GameSettings;
}

export interface BenchmarkSource {
  id: string;
  fetchRecords(query: BenchmarkQuery): Promise<BenchmarkRecord[]>;
}

export interface BenchmarkSourceInfo {
  id: string;
  label: string;
  tier: "measured" | "estimated";
  status: "active" | "not-configured";
  description: string;
}

export const BENCHMARK_SOURCES: BenchmarkSourceInfo[] = [
  {
    id: "user",
    label: "Ваши замеры",
    tier: "measured",
    status: "active",
    description: "Реальные результаты, введённые вами; хранятся в этом браузере. Точное совпадение конфигурации заменяет оценку, остальные калибруют модель для той же видеокарты.",
  },
  {
    id: "model",
    label: "Модель относительной производительности",
    tier: "estimated",
    status: "active",
    description: "Индексы CPU/GPU и параметры игр заданы вручную. Даёт примерные оценки с диапазоном ±25%, а не результаты тестов.",
  },
  {
    id: "external",
    label: "Внешний источник бенчмарков",
    tier: "measured",
    status: "not-configured",
    description: "Интерфейс BenchmarkSource готов (lib/benchmark-engine/sources.ts), схема хранения — в supabase/migrations. Провайдер не подключён.",
  },
];
