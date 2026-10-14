import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { GAMES } from "@/data/games";
import { hardwareRepository } from "@/lib/hardware/repository";
import type { BenchmarkRecord, DataSourceInfo, Resolution, VerificationStatus } from "@/types/benchmark";
import { catalogEntry } from "./catalog";
import { dedupeKey } from "./validation";

/**
 * Server-side store for global benchmark records and import batches.
 *
 * Two implementations behind one interface:
 *  - Supabase (production): selected only when SUPABASE_SECRET_KEY and a valid project URL are
 *    set on the server. Uses PostgREST with the secret key; requires the migrations in
 *    supabase/migrations (including 20261015000000_fps_data_engine.sql).
 *  - Local JSON file (development fallback): `.data/fps-benchmarks.json`. Lost on redeploys and
 *    read-only on serverless hosts — not suitable for production data.
 *
 * Errors are StoreError with a safe, user-facing message (no keys, URLs or stack traces).
 */

export interface ImportBatch {
  id: string;
  sourceId: string;
  createdAt: string;
  rowCount: number;
  status: "committed" | "rolled_back";
  notes?: string;
}

export interface BenchmarkFilter {
  submittedBy?: string;
  gameId?: string;
  cpuId?: string;
  gpuId?: string;
  resolution?: Resolution;
  sourceId?: string;
  /** Leave out records of these sources (switched off by an admin). */
  excludeSources?: string[];
  verification?: VerificationStatus | "any";
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RecordPatch {
  avgFps?: number;
  low1Fps?: number;
  notes?: string;
  method?: string;
  gameVersion?: string;
  verification?: VerificationStatus;
}

/** Stored state of a data source (data_sources table). */
export type SourceState = Omit<DataSourceInfo, "description"> & { notes?: string | null };

export interface BenchmarkStore {
  kind: "supabase" | "file";
  /** Checks the store is reachable and its schema is in place. */
  ping(): Promise<void>;
  list(filter: BenchmarkFilter, page?: number, pageSize?: number): Promise<Page<BenchmarkRecord>>;
  /** All matching records — for server-side calculation only, never sent wholesale. */
  query(filter: BenchmarkFilter): Promise<BenchmarkRecord[]>;
  count(filter: BenchmarkFilter): Promise<number>;
  /** Records sharing game and GPU with the given pairs (duplicate detection for imports). */
  similar(pairs: { gameId: string; gpuId: string }[]): Promise<BenchmarkRecord[]>;
  get(id: string): Promise<BenchmarkRecord | null>;
  /** Inserts a batch; rows whose dedupe key already exists are skipped and counted. */
  insertBatch(records: BenchmarkRecord[], batch: ImportBatch): Promise<{ batch: ImportBatch; inserted: number; skippedDuplicates: number }>;
  update(id: string, patch: RecordPatch): Promise<BenchmarkRecord | null>;
  remove(id: string): Promise<boolean>;
  batches(): Promise<ImportBatch[]>;
  /** Removes the batch's records that were not modified after the import; edited ones are kept. */
  rollback(batchId: string): Promise<{ removed: number; kept: number } | null>;
  /** A user's own measurement (no import batch). Returns false if the same test already exists. */
  insertSubmission(record: BenchmarkRecord): Promise<boolean>;
  /** Stored source states (enable/disable, URL, last check). */
  sourceStates(): Promise<SourceState[]>;
  /** Inserts or updates one source state. */
  saveSourceState(state: SourceState): Promise<void>;
}

export class StoreError extends Error {
  constructor(
    message: string,
    readonly status = 503,
  ) {
    super(message);
  }
}

/**
 * Verified records for a calculation. If the store fails, the calculation still runs on the model
 * alone and the caller gets a warning to show — records are never invented to fill the gap.
 */
export async function recordsForCalculation(filter: BenchmarkFilter): Promise<{ records: BenchmarkRecord[]; warning: string | null }> {
  try {
    const store = getBenchmarkStore();
    const disabled = (await store.sourceStates()).filter((s) => s.status === "disabled").map((s) => s.id);
    return { records: await store.query({ ...filter, excludeSources: disabled, verification: "verified" }), warning: null };
  } catch (e) {
    const reason = e instanceof StoreError ? e.message : "Хранилище замеров недоступно.";
    return { records: [], warning: `База проверенных замеров недоступна (${reason}) — результат рассчитан без неё.` };
  }
}

/** JSON error response for store failures (message is already safe to show). */
export function storeErrorResponse(e: unknown) {
  if (e instanceof StoreError) return Response.json({ error: e.message }, { status: e.status });
  return Response.json({ error: "Хранилище замеров недоступно." }, { status: 503 });
}

const matches = (r: BenchmarkRecord, f: BenchmarkFilter) =>
  (!f.submittedBy || r.submittedBy === f.submittedBy) &&
  (!f.gameId || r.gameId === f.gameId) &&
  (!f.cpuId || r.cpuId === f.cpuId) &&
  (!f.gpuId || r.gpuId === f.gpuId) &&
  (!f.resolution || r.settings.resolution === f.resolution) &&
  (!f.sourceId || r.sourceId === f.sourceId) &&
  (!f.excludeSources?.length || !r.sourceId || !f.excludeSources.includes(r.sourceId)) &&
  (!f.verification || f.verification === "any" || (r.verification ?? "unverified") === f.verification);

/** A record counts as "modified after import" when its last change is later than the import. */
const MODIFIED_SLACK_MS = 1000;
const modifiedAfterImport = (r: { createdAt?: string; updatedAt?: string }) =>
  Boolean(r.createdAt && r.updatedAt && Date.parse(r.updatedAt) - Date.parse(r.createdAt) > MODIFIED_SLACK_MS);

type StoredRecord = BenchmarkRecord & { updatedAt?: string };

/* ------------------------------------------------------------------ file store (development) */

interface StoreData {
  records: StoredRecord[];
  batches: ImportBatch[];
  sources?: SourceState[];
}

export function createFileStore(file: string): BenchmarkStore {
  let cache: StoreData | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  async function load(): Promise<StoreData> {
    if (cache) return cache;
    try {
      const parsed = JSON.parse(await readFile(/*turbopackIgnore: true*/ file, "utf8")) as Partial<StoreData>;
      cache = { records: parsed.records ?? [], batches: parsed.batches ?? [], sources: parsed.sources ?? [] };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw new StoreError("Хранилище замеров повреждено или недоступно для чтения.");
      cache = { records: [], batches: [] };
    }
    return cache;
  }

  async function persist(data: StoreData) {
    await mkdir(/*turbopackIgnore: true*/ dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(/*turbopackIgnore: true*/ tmp, JSON.stringify(data, null, 1), "utf8");
    await rename(/*turbopackIgnore: true*/ tmp, /*turbopackIgnore: true*/ file);
  }

  /** Serialised read-modify-write; on a failed write the in-memory state is restored. */
  function mutate<T>(fn: (d: StoreData) => T): Promise<T> {
    const run = queue.then(async () => {
      const data = await load();
      const snapshot = structuredClone(data);
      const result = fn(data);
      try {
        await persist(data);
      } catch {
        cache = snapshot;
        throw new StoreError("Не удалось сохранить данные: файловое хранилище недоступно для записи. Для production подключите Supabase.");
      }
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  }

  return {
    kind: "file",
    async ping() {
      await load();
    },
    async list(filter, page = 1, pageSize = 50) {
      const size = Math.min(100, Math.max(1, pageSize));
      const all = (await load()).records.filter((r) => matches(r, filter)).sort((a, b) => b.testDate.localeCompare(a.testDate));
      return { items: all.slice((page - 1) * size, page * size), total: all.length, page, pageSize: size };
    },
    async query(filter) {
      return (await load()).records.filter((r) => matches(r, filter));
    },
    async count(filter) {
      return (await load()).records.filter((r) => matches(r, filter)).length;
    },
    async similar(pairs) {
      const keys = new Set(pairs.map((p) => `${p.gameId}|${p.gpuId}`));
      return (await load()).records.filter((r) => keys.has(`${r.gameId}|${r.gpuId}`));
    },
    async get(id) {
      return (await load()).records.find((r) => r.id === id) ?? null;
    },
    insertBatch(records, batch) {
      return mutate((d) => {
        // Re-check duplicates under the write lock: two concurrent imports cannot both insert a row.
        const seen = new Set(d.records.map(dedupeKey));
        const fresh: StoredRecord[] = [];
        for (const r of records) {
          const key = dedupeKey(r);
          if (seen.has(key)) continue;
          seen.add(key);
          fresh.push({ ...r, importBatchId: batch.id, createdAt: batch.createdAt, updatedAt: batch.createdAt });
        }
        const stored = { ...batch, rowCount: fresh.length };
        d.records.push(...fresh);
        d.batches.unshift(stored);
        return { batch: stored, inserted: fresh.length, skippedDuplicates: records.length - fresh.length };
      });
    },
    update(id, patch) {
      return mutate((d) => {
        const r = d.records.find((x) => x.id === id);
        if (!r) return null;
        Object.assign(r, patch, { updatedAt: new Date().toISOString() });
        return r;
      });
    },
    remove(id) {
      return mutate((d) => {
        const before = d.records.length;
        d.records = d.records.filter((r) => r.id !== id);
        return before !== d.records.length;
      });
    },
    async batches() {
      return (await load()).batches;
    },
    insertSubmission(record) {
      return mutate((d) => {
        if (d.records.some((r) => dedupeKey(r) === dedupeKey(record))) return false;
        const now = new Date().toISOString();
        d.records.push({ ...record, createdAt: now, updatedAt: now });
        return true;
      });
    },
    async sourceStates() {
      return (await load()).sources ?? [];
    },
    saveSourceState(state) {
      return mutate((d) => {
        d.sources = [...(d.sources ?? []).filter((x) => x.id !== state.id), state];
      });
    },
    rollback(batchId) {
      return mutate((d) => {
        const batch = d.batches.find((b) => b.id === batchId);
        if (!batch || batch.status === "rolled_back") return null;
        const inBatch = d.records.filter((r) => r.importBatchId === batchId);
        const keep = new Set(inBatch.filter(modifiedAfterImport).map((r) => r.id));
        d.records = d.records.filter((r) => r.importBatchId !== batchId || keep.has(r.id));
        batch.status = "rolled_back";
        return { removed: inBatch.length - keep.size, kept: keep.size };
      });
    },
  };
}

/* ------------------------------------------------------------------ Supabase store (production) */

type Row = Record<string, unknown>;

function toRow(r: BenchmarkRecord, batchId: string | null): Row {
  const s = r.settings;
  return {
    game_id: r.gameId,
    game_version: r.gameVersion ?? null,
    cpu_id: r.cpuId,
    gpu_id: r.gpuId,
    resolution: s.resolution,
    preset: s.preset,
    ray_tracing: s.rayTracing,
    upscaling: s.upscaling,
    upscaler: s.upscaling === "off" ? null : (s.upscaler ?? null),
    frame_gen: Boolean(s.frameGen),
    avg_fps: r.avgFps,
    low1_fps: r.low1Fps ?? null,
    min_fps: r.minFps ?? null,
    min_fps_method: r.minFpsMethod ?? null,
    cpu_util: r.cpuUtil ?? null,
    gpu_util: r.gpuUtil ?? null,
    ram_gb: r.ramGb ?? null,
    ram_type: r.ramType ?? null,
    os: r.os ?? null,
    driver: r.driver ?? null,
    source_id: r.sourceId ?? "nexrig",
    source_label: r.source.label,
    source_url: r.source.url ?? null,
    test_date: r.testDate,
    method: r.method ?? null,
    test_config: r.testConfig ?? null,
    conditions: r.conditions ?? null,
    notes: r.notes ?? null,
    sample_count: r.sampleCount,
    verification_status: r.verification ?? "unverified",
    import_batch_id: batchId,
    submitted_by: r.submittedBy ?? null,
  };
}

const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));
const str = (v: unknown) => (v === null || v === undefined ? undefined : String(v));

function fromRow(x: Row): StoredRecord {
  return {
    id: String(x.id),
    gameId: String(x.game_id),
    gameVersion: str(x.game_version),
    cpuId: String(x.cpu_id),
    gpuId: String(x.gpu_id),
    settings: {
      resolution: x.resolution as Resolution,
      preset: x.preset as BenchmarkRecord["settings"]["preset"],
      rayTracing: Boolean(x.ray_tracing),
      upscaling: x.upscaling as BenchmarkRecord["settings"]["upscaling"],
      upscaler: (x.upscaler as BenchmarkRecord["settings"]["upscaler"]) ?? null,
      frameGen: Boolean(x.frame_gen),
    },
    avgFps: Number(x.avg_fps),
    low1Fps: num(x.low1_fps),
    minFps: num(x.min_fps),
    minFpsMethod: str(x.min_fps_method),
    cpuUtil: num(x.cpu_util),
    gpuUtil: num(x.gpu_util),
    ramGb: num(x.ram_gb),
    ramType: x.ram_type as BenchmarkRecord["ramType"],
    os: str(x.os),
    driver: str(x.driver),
    source: { kind: "dataset", label: String(x.source_label), url: str(x.source_url) },
    sourceId: str(x.source_id),
    testDate: String(x.test_date),
    method: str(x.method),
    testConfig: str(x.test_config),
    conditions: str(x.conditions),
    notes: str(x.notes),
    sampleCount: Number(x.sample_count ?? 1),
    verification: (x.verification_status as VerificationStatus) ?? "unverified",
    importBatchId: str(x.import_batch_id),
    submittedBy: str(x.submitted_by),
    createdAt: str(x.created_at),
    updatedAt: str(x.updated_at),
  };
}

const enc = encodeURIComponent;

function filterQuery(f: BenchmarkFilter) {
  const q: string[] = [];
  if (f.submittedBy) q.push(`submitted_by=eq.${enc(f.submittedBy)}`);
  if (f.gameId) q.push(`game_id=eq.${enc(f.gameId)}`);
  if (f.cpuId) q.push(`cpu_id=eq.${enc(f.cpuId)}`);
  if (f.gpuId) q.push(`gpu_id=eq.${enc(f.gpuId)}`);
  if (f.resolution) q.push(`resolution=eq.${enc(f.resolution)}`);
  if (f.sourceId) q.push(`source_id=eq.${enc(f.sourceId)}`);
  // NULL source ids are kept (NOT IN alone would drop them).
  if (f.excludeSources?.length) q.push(`or=(source_id.is.null,source_id.not.in.(${f.excludeSources.map((s) => enc(s.replace(/[^a-z0-9_-]/gi, ""))).join(",")}))`);
  if (f.verification && f.verification !== "any") q.push(`verification_status=eq.${enc(f.verification)}`);
  return q.join("&");
}

export function createSupabaseStore(baseUrl: string, secretKey: string): BenchmarkStore {
  const rest = `${baseUrl}/rest/v1`;

  async function call(path: string, init: RequestInit & { prefer?: string; range?: string } = {}) {
    const headers: Record<string, string> = { apikey: secretKey, Authorization: `Bearer ${secretKey}`, Accept: "application/json" };
    if (init.body) headers["Content-Type"] = "application/json";
    if (init.prefer) headers.Prefer = init.prefer;
    if (init.range) headers.Range = init.range;
    let res: Response;
    try {
      res = await fetch(`${rest}/${path}`, { ...init, headers, cache: "no-store" });
    } catch {
      throw new StoreError("База данных недоступна (ошибка сети).");
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      // Map PostgREST/Postgres codes to safe messages; never echo the raw response.
      if (body.code === "PGRST205" || body.code === "42703" || body.code === "42P01") {
        throw new StoreError("Схема базы не обновлена: примените миграцию supabase/migrations/20261015000000_fps_data_engine.sql.");
      }
      if (body.code === "23505") throw new StoreError("Такая запись уже есть в базе (дубликат).", 409);
      if (body.code === "23503") throw new StoreError("Запись ссылается на отсутствующую игру или комплектующее.", 422);
      if (body.code === "23514") throw new StoreError("Значения не прошли проверку базы данных.", 422);
      if (res.status === 401 || res.status === 403) throw new StoreError("Нет доступа к базе: проверьте серверный ключ Supabase.");
      throw new StoreError(`Ошибка базы данных (HTTP ${res.status}).`);
    }
    return res;
  }

  const json = async <T>(res: Response) => (res.status === 204 ? (null as T) : ((await res.json()) as T));

  async function queryAll(filter: string): Promise<StoredRecord[]> {
    const out: StoredRecord[] = [];
    for (let from = 0; ; from += 1000) {
      const rows = await json<Row[]>(await call(`benchmark_records?select=*${filter ? `&${filter}` : ""}&order=id.asc`, { range: `${from}-${from + 999}` }));
      out.push(...rows.map(fromRow));
      if (rows.length < 1000) return out;
    }
  }

  /** Catalogue ids are text slugs from the app; make sure referenced rows exist (FK targets). */
  async function ensureReferences(records: BenchmarkRecord[], extraSourceIds: string[] = []) {
    // Sources from the audited catalogue are created on first use (existing rows are left as they are).
    const sources = [...new Set([...records.map((r) => r.sourceId ?? "nexrig"), ...extraSourceIds])].flatMap((id) => {
      const s = catalogEntry(id);
      return s ? [{ id: s.id, name: s.name, base_url: s.baseUrl, integration: s.integration, status: id === "nexrig" || id === "manufacturer" ? "active" : "not_configured", attribution: s.attribution, update_mode: "manual" }] : [];
    });
    if (sources.length) await call("data_sources?on_conflict=id", { method: "POST", body: JSON.stringify(sources), prefer: "resolution=ignore-duplicates,return=minimal" });
    const gameIds = [...new Set(records.map((r) => r.gameId))];
    const games = gameIds.flatMap((id) => {
      const g = GAMES.find((x) => x.id === id);
      return g ? [{ id: g.id, title: g.title, version: g.version, supports_rt: g.supportsRayTracing, upscalers: g.upscalers, frame_gen: g.frameGen }] : [];
    });
    if (games.length) await call("games?on_conflict=id", { method: "POST", body: JSON.stringify(games), prefer: "resolution=ignore-duplicates,return=minimal" });
    const compIds = [...new Set(records.flatMap((r) => [r.cpuId, r.gpuId]))];
    const comps = compIds.flatMap((id) => {
      const c = hardwareRepository.byId(id);
      if (!c) return [];
      const { id: cid, category, brand, model, name, visual, dataQuality, price: _price, ...specs } = c;
      void _price;
      return [{ id: cid, category, brand, model, name, visual, specs, data_quality: dataQuality }];
    });
    if (comps.length) await call("components?on_conflict=id", { method: "POST", body: JSON.stringify(comps), prefer: "resolution=ignore-duplicates,return=minimal" });
  }

  return {
    kind: "supabase",
    async ping() {
      // data_sources exists only after the FPS Data Engine migration.
      await call("data_sources?select=id&limit=1");
      await call("benchmark_records?select=verification_status&limit=1");
    },
    async list(filter, page = 1, pageSize = 50) {
      const size = Math.min(100, Math.max(1, pageSize));
      const from = (page - 1) * size;
      const q = filterQuery(filter);
      const res = await call(`benchmark_records?select=*${q ? `&${q}` : ""}&order=test_date.desc,id.desc`, { range: `${from}-${from + size - 1}`, prefer: "count=exact" });
      const total = Number(res.headers.get("content-range")?.split("/")[1] ?? 0);
      return { items: (await json<Row[]>(res)).map(fromRow), total: Number.isFinite(total) ? total : 0, page, pageSize: size };
    },
    query: (filter) => queryAll(filterQuery(filter)),
    async count(filter) {
      const q = filterQuery(filter);
      const res = await call(`benchmark_records?select=id${q ? `&${q}` : ""}`, { range: "0-0", prefer: "count=exact" });
      return Number(res.headers.get("content-range")?.split("/")[1] ?? 0) || 0;
    },
    async similar(pairs) {
      const unique = [...new Map(pairs.map((p) => [`${p.gameId}|${p.gpuId}`, p])).values()];
      const out: StoredRecord[] = [];
      for (const p of unique) out.push(...(await queryAll(`game_id=eq.${enc(p.gameId)}&gpu_id=eq.${enc(p.gpuId)}`)));
      return out;
    },
    async get(id) {
      if (!/^\d+$/.test(id)) return null;
      const rows = await json<Row[]>(await call(`benchmark_records?select=*&id=eq.${id}`));
      return rows[0] ? fromRow(rows[0]) : null;
    },
    async insertBatch(records, batch) {
      await ensureReferences(records, [batch.sourceId]);
      // Skip rows already present (the unique index would reject them anyway).
      const existing = new Set((await this.similar(records.map((r) => ({ gameId: r.gameId, gpuId: r.gpuId })))).map(dedupeKey));
      const seen = new Set<string>();
      const fresh = records.filter((r) => {
        const k = dedupeKey(r);
        if (existing.has(k) || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const stored = { ...batch, rowCount: fresh.length };
      await call("benchmark_import_batches", {
        method: "POST",
        body: JSON.stringify({ id: batch.id, source_id: batch.sourceId, row_count: fresh.length, status: "committed", notes: batch.notes ?? null }),
        prefer: "return=minimal",
      });
      try {
        for (let i = 0; i < fresh.length; i += 500) {
          await call("benchmark_records", { method: "POST", body: JSON.stringify(fresh.slice(i, i + 500).map((r) => toRow(r, batch.id))), prefer: "return=minimal" });
        }
      } catch (e) {
        // Compensate: remove what this batch inserted, then the batch row itself.
        await call(`benchmark_records?import_batch_id=eq.${batch.id}`, { method: "DELETE" }).catch(() => undefined);
        await call(`benchmark_import_batches?id=eq.${batch.id}`, { method: "DELETE" }).catch(() => undefined);
        throw e;
      }
      return { batch: stored, inserted: fresh.length, skippedDuplicates: records.length - fresh.length };
    },
    async update(id, patch) {
      if (!/^\d+$/.test(id)) return null;
      const row: Row = { updated_at: new Date().toISOString() };
      if (patch.avgFps !== undefined) row.avg_fps = patch.avgFps;
      if (patch.low1Fps !== undefined) row.low1_fps = patch.low1Fps;
      if (patch.notes !== undefined) row.notes = patch.notes;
      if (patch.method !== undefined) row.method = patch.method;
      if (patch.gameVersion !== undefined) row.game_version = patch.gameVersion;
      if (patch.verification !== undefined) {
        row.verification_status = patch.verification;
        row.verified_at = patch.verification === "verified" ? new Date().toISOString() : null;
      }
      const rows = await json<Row[]>(await call(`benchmark_records?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(row), prefer: "return=representation" }));
      return rows[0] ? fromRow(rows[0]) : null;
    },
    async remove(id) {
      if (!/^\d+$/.test(id)) return false;
      const rows = await json<Row[]>(await call(`benchmark_records?id=eq.${id}`, { method: "DELETE", prefer: "return=representation" }));
      return rows.length > 0;
    },
    async batches() {
      const rows = await json<Row[]>(await call("benchmark_import_batches?select=*&order=created_at.desc&limit=100"));
      return rows.map((b) => ({
        id: String(b.id),
        sourceId: String(b.source_id ?? "nexrig"),
        createdAt: String(b.created_at),
        rowCount: Number(b.row_count),
        status: b.status as ImportBatch["status"],
        notes: str(b.notes),
      }));
    },
    async insertSubmission(record) {
      await ensureReferences([record]);
      const existing = await this.similar([{ gameId: record.gameId, gpuId: record.gpuId }]);
      if (existing.some((r) => dedupeKey(r) === dedupeKey(record))) return false;
      try {
        await call("benchmark_records", { method: "POST", body: JSON.stringify(toRow(record, null)), prefer: "return=minimal" });
        return true;
      } catch (e) {
        // A concurrent identical submission hit the unique index.
        if (e instanceof StoreError && e.status === 409) return false;
        throw e;
      }
    },
    async sourceStates() {
      const rows = await json<Row[]>(await call("data_sources?select=*&order=id.asc"));
      return rows.map((x) => ({
        id: String(x.id),
        name: String(x.name),
        baseUrl: str(x.base_url) ?? null,
        integration: x.integration as SourceState["integration"],
        status: x.status as SourceState["status"],
        lastSyncAt: str(x.last_sync_at) ?? null,
        lastErrorAt: str(x.last_error_at) ?? null,
        errorMessage: str(x.error_message) ?? null,
        attribution: str(x.attribution) ?? "",
        updateMode: (x.update_mode as SourceState["updateMode"]) ?? "manual",
        notes: str(x.notes) ?? null,
      }));
    },
    async saveSourceState(s) {
      const row = {
        id: s.id,
        name: s.name,
        base_url: s.baseUrl,
        integration: s.integration,
        status: s.status,
        last_sync_at: s.lastSyncAt,
        last_error_at: s.lastErrorAt,
        error_message: s.errorMessage?.slice(0, 500) ?? null,
        attribution: s.attribution,
        update_mode: s.updateMode,
        notes: s.notes ?? null,
      };
      await call("data_sources?on_conflict=id", { method: "POST", body: JSON.stringify(row), prefer: "resolution=merge-duplicates,return=minimal" });
    },
    async rollback(batchId) {
      if (!/^[0-9a-f-]{36}$/i.test(batchId)) return null;
      const batches = await json<Row[]>(await call(`benchmark_import_batches?select=status&id=eq.${batchId}`));
      if (!batches[0] || batches[0].status === "rolled_back") return null;
      const rows = await json<Row[]>(await call(`benchmark_records?select=id,created_at,updated_at&import_batch_id=eq.${batchId}`));
      const toDelete = rows.filter((r) => !modifiedAfterImport({ createdAt: str(r.created_at), updatedAt: str(r.updated_at) })).map((r) => String(r.id));
      for (let i = 0; i < toDelete.length; i += 200) {
        await call(`benchmark_records?id=in.(${toDelete.slice(i, i + 200).join(",")})`, { method: "DELETE" });
      }
      await call(`benchmark_import_batches?id=eq.${batchId}`, { method: "PATCH", body: JSON.stringify({ status: "rolled_back" }), prefer: "return=minimal" });
      return { removed: toDelete.length, kept: rows.length - toDelete.length };
    },
  };
}

/* ------------------------------------------------------------------ selection */

/**
 * Supabase settings from server env. Accepts the project URL with or without "/rest/v1".
 * Returns null (→ file store) unless both URL and a SECRET key are present and well-formed —
 * a publishable/anon key is never used for writes.
 */
export function supabaseConfig(env: Record<string, string | undefined> = process.env): { url: string; key: string } | null {
  const rawUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !key) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const isSecret =
    key.startsWith("sb_secret_") ||
    (() => {
      try {
        return JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString()).role === "service_role";
      } catch {
        return false;
      }
    })();
  if (!isSecret) return null;
  return { url: `${url.origin}`, key };
}

/**
 * A store that refuses every operation with a clear reason. Used where no durable store exists,
 * so a misconfiguration is visible instead of silently writing to a disposable file.
 */
export function createUnconfiguredStore(reason: string): BenchmarkStore {
  const fail = async (): Promise<never> => {
    throw new StoreError(reason);
  };
  return {
    kind: "file",
    insertSubmission: fail,
    ping: fail,
    list: fail,
    query: fail,
    count: fail,
    similar: fail,
    get: fail,
    insertBatch: fail,
    update: fail,
    remove: fail,
    batches: fail,
    rollback: fail,
    sourceStates: fail,
    saveSourceState: fail,
  };
}

/** Picks the store for this deployment (see selectStore). */
export function selectStore(env: Record<string, string | undefined> = process.env, cwd = process.cwd()): BenchmarkStore {
  const forceFile = env.NEXRIG_BENCHMARK_BACKEND === "file";
  const cfg = forceFile ? null : supabaseConfig(env);
  if (cfg) return createSupabaseStore(cfg.url, cfg.key);
  // Vercel functions have a read-only, per-instance filesystem: a JSON file there is neither
  // writable nor persistent, so production on Vercel must use Supabase.
  if (env.VERCEL) {
    return createUnconfiguredStore("Хранилище замеров не настроено: на Vercel нужен Supabase (SUPABASE_SECRET_KEY и NEXT_PUBLIC_SUPABASE_URL).");
  }
  return createFileStore(env.NEXRIG_BENCHMARK_STORE ?? join(cwd, ".data", "fps-benchmarks.json"));
}

let selected: BenchmarkStore | null = null;

export function getBenchmarkStore(): BenchmarkStore {
  selected ??= selectStore();
  return selected;
}
