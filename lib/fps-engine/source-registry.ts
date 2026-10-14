import "server-only";
import { allowedSourceUrl, catalogEntry, SOURCE_CATALOG, type SourceAudit } from "./catalog";
import type { DataSourceInfo } from "@/types/benchmark";
import { activeSources, MODEL_SOURCE } from "./sources";
import type { BenchmarkStore, SourceState } from "./store";

/**
 * Live view of the data sources: the audited catalogue + the stored state (enabled, URL, last
 * check) + how many verified, usable records each source actually has.
 *
 * Display status is derived, never assumed:
 *  - "disabled"  — switched off by an admin; its records are left out of every calculation;
 *  - "error"     — the last check failed (message kept, without secrets);
 *  - "active"    — enabled and has verified records in use (or is the NexRig base / catalogue);
 *  - "no-data"   — enabled manual-import source with no verified records yet;
 *  - "not-used"  — audited but unusable for FPS (e.g. synthetic scores).
 */
export type SourceDisplayStatus = "active" | "no-data" | "disabled" | "error" | "not-used";

export interface SourceOverview {
  audit: SourceAudit;
  enabled: boolean;
  baseUrl: string | null;
  status: SourceDisplayStatus;
  lastCheckAt: string | null;
  lastErrorAt: string | null;
  errorMessage: string | null;
  /** Verified records from this source; null when the count could not be read. */
  usableRecords: number | null;
}

const UNUSABLE = new Set(["3dmark"]);
const BUILT_IN = new Set(["nexrig", "manufacturer"]);

function defaultState(a: SourceAudit): SourceState {
  return {
    id: a.id,
    name: a.name,
    baseUrl: a.baseUrl,
    integration: a.integration,
    status: BUILT_IN.has(a.id) ? "active" : "not_configured",
    lastSyncAt: null,
    lastErrorAt: null,
    errorMessage: null,
    attribution: a.attribution,
    updateMode: "manual",
    notes: null,
  };
}

function displayStatus(a: SourceAudit, s: SourceState, usable: number | null): SourceDisplayStatus {
  if (s.status === "disabled") return "disabled";
  if (UNUSABLE.has(a.id)) return "not-used";
  const lastError = s.lastErrorAt ? Date.parse(s.lastErrorAt) : 0;
  const lastOk = s.lastSyncAt ? Date.parse(s.lastSyncAt) : 0;
  if (lastError && lastError >= lastOk) return "error";
  if (BUILT_IN.has(a.id)) return "active";
  return usable && usable > 0 ? "active" : "no-data";
}

export async function sourceOverview(store: BenchmarkStore): Promise<{ items: SourceOverview[]; stateError: string | null }> {
  let states: SourceState[] = [];
  let stateError: string | null = null;
  try {
    states = await store.sourceStates();
  } catch (e) {
    stateError = e instanceof Error && "status" in e ? e.message : "Состояние источников недоступно.";
  }
  const items = await Promise.all(
    SOURCE_CATALOG.map(async (a) => {
      const s = states.find((x) => x.id === a.id) ?? defaultState(a);
      const usable = a.id === "manufacturer" ? null : await store.count({ sourceId: a.id, verification: "verified" }).catch(() => null);
      return {
        audit: a,
        enabled: s.status !== "disabled",
        baseUrl: s.baseUrl ?? a.baseUrl,
        status: displayStatus(a, s, usable),
        lastCheckAt: s.lastSyncAt,
        lastErrorAt: s.lastErrorAt,
        errorMessage: s.errorMessage,
        usableRecords: usable,
      } satisfies SourceOverview;
    }),
  );
  return { items, stateError };
}

/** Sources whose records must not be used (switched off by an admin). */
export async function disabledSourceIds(store: BenchmarkStore): Promise<Set<string>> {
  const states = await store.sourceStates();
  return new Set(states.filter((s) => s.status === "disabled").map((s) => s.id));
}

async function currentState(store: BenchmarkStore, id: string): Promise<SourceState | null> {
  const a = catalogEntry(id);
  if (!a) return null;
  return (await store.sourceStates()).find((x) => x.id === id) ?? defaultState(a);
}

/** Admin: enable/disable a source or change its page URL (https, on the source's own domain). */
export async function updateSource(store: BenchmarkStore, id: string, patch: { enabled?: boolean; baseUrl?: string | null }): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const a = catalogEntry(id);
  const s = await currentState(store, id);
  if (!a || !s) return { ok: false, status: 404, error: "Источник не найден." };
  const next = { ...s };
  if (patch.baseUrl !== undefined) {
    if (patch.baseUrl !== null && !allowedSourceUrl(a, patch.baseUrl)) return { ok: false, status: 422, error: a.domain ? `Адрес должен быть https на домене ${a.domain}.` : "У этого источника нет внешнего адреса." };
    next.baseUrl = patch.baseUrl;
  }
  if (patch.enabled !== undefined) {
    if (BUILT_IN.has(id) && !patch.enabled) return { ok: false, status: 422, error: "Базу NexRig и каталог характеристик отключить нельзя." };
    next.status = patch.enabled ? (BUILT_IN.has(id) ? "active" : "not_configured") : "disabled";
  }
  await store.saveSourceState(next);
  return { ok: true };
}

const CHECK_TIMEOUT_MS = 10_000;
const USER_AGENT = "NexRig-SourceCheck/1.0 (+https://nexrig-fpeg.vercel.app; one request per admin check)";

/**
 * Admin "check": one request, nothing parsed into data.
 *  - NexRig base: the store answers and its schema is in place;
 *  - external sources: their public feed (or page) responds with HTTP 2xx on the source's domain.
 * Redirects are followed only within the source's domain.
 */
export async function checkSource(store: BenchmarkStore, id: string, fetcher: typeof fetch = fetch): Promise<{ ok: boolean; message: string } | null> {
  const a = catalogEntry(id);
  const s = await currentState(store, id);
  if (!a || !s) return null;
  let ok = false;
  let message: string;
  if (id === "nexrig") {
    try {
      await store.ping();
      ok = true;
      message = "Хранилище отвечает.";
    } catch (e) {
      message = e instanceof Error && "status" in e ? e.message : "Хранилище недоступно.";
    }
  } else if (id === "manufacturer") {
    ok = true;
    message = "Локальный каталог — проверять нечего.";
  } else {
    const target = a.feedUrl ?? s.baseUrl ?? a.baseUrl;
    if (!target || !allowedSourceUrl(a, target)) {
      message = "Нет адреса для проверки.";
    } else {
      try {
        const res = await fetcher(target, { method: "GET", redirect: "follow", headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, text/html;q=0.8" }, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS), cache: "no-store" });
        await res.body?.cancel().catch(() => undefined);
        if (res.url && !allowedSourceUrl(a, res.url)) message = "Адрес перенаправил на другой домен.";
        else if (res.ok) {
          ok = true;
          message = a.feedUrl ? `Лента отвечает (HTTP ${res.status}). Данные FPS вносятся только ручным импортом.` : `Страница отвечает (HTTP ${res.status}).`;
        } else message = `Источник ответил HTTP ${res.status}.`;
      } catch (e) {
        message = e instanceof Error && e.name === "TimeoutError" ? "Нет ответа за 10 с." : "Сетевая ошибка при обращении к источнику.";
      }
    }
  }
  const now = new Date().toISOString();
  const usable = await store.count({ sourceId: id, verification: "verified" }).catch(() => 0);
  await store.saveSourceState({
    ...s,
    status: s.status === "disabled" ? "disabled" : !ok ? "error" : BUILT_IN.has(id) || usable > 0 ? "active" : "not_configured",
    lastSyncAt: ok ? now : s.lastSyncAt,
    lastErrorAt: ok ? s.lastErrorAt : now,
    errorMessage: ok ? null : message,
  });
  return { ok, message };
}

/**
 * Sources shown to users. External (editorial) sources appear only when they are enabled and have
 * verified records in use — and always as "ручной импорт", never as a connected integration.
 */
export async function publicSources(store: BenchmarkStore) {
  const adapters = activeSources(store);
  const builtIn = await Promise.all(
    adapters.map(async (a) => {
      const s = await a.getSourceStatus();
      return { ...a.info, ...s, lastErrorAt: s.status === "error" ? new Date().toISOString() : a.info.lastErrorAt };
    }),
  );
  const overview = await sourceOverview(store).catch(() => null);
  const external: DataSourceInfo[] = (overview?.items ?? [])
    .filter((o) => !adapters.some((a) => a.info.id === o.audit.id) && o.status === "active")
    .map((o) => ({
      id: o.audit.id,
      name: o.audit.name,
      baseUrl: o.baseUrl,
      integration: o.audit.integration,
      integrationLabel: o.audit.integrationLabel,
      status: "active",
      lastSyncAt: o.lastCheckAt,
      lastErrorAt: null,
      errorMessage: null,
      attribution: o.audit.attribution,
      updateMode: "manual",
      description: `${o.audit.data} Автоматического подключения нет: результаты внесены администратором вручную со ссылкой на источник.`,
      usableRecords: o.usableRecords,
    }));
  const disabled = new Set((overview?.items ?? []).filter((o) => o.status === "disabled").map((o) => o.audit.id));
  const items = builtIn.map((b) => ({ ...b, usableRecords: overview?.items.find((o) => o.audit.id === b.id)?.usableRecords ?? null }));
  const verified = await store.count({ verification: "verified" }).catch(() => null);
  return { items: [...items, ...external, MODEL_SOURCE], verifiedRecords: verified, storage: store.kind, disabledSources: [...disabled] };
}
