"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { GAMES } from "@/data/games";
import { useAuth, useAuthDialog } from "@/features/auth/use-auth";
import { IMPORTABLE_SOURCE_IDS } from "@/lib/fps-engine/catalog";
import { hardwareRepository } from "@/lib/hardware/repository";
import type { BenchmarkRecord, VerificationStatus } from "@/types/benchmark";
import { Badge, Button, cx, EmptyState, Field, inputCls, SectionTitle, Select } from "@/components/ui/primitives";
import { BrowserResultsSection } from "./BrowserResultsAdmin";
import { SourcesSection } from "./SourcesAdmin";

/**
 * Admin console for global benchmark data. Every request carries the admin token; the server
 * checks it (lib/server/admin-auth.ts). The token is kept in sessionStorage only for this tab.
 */
const TOKEN_KEY = "nexrig.admin-token";
const SOURCES = [...IMPORTABLE_SOURCE_IDS];
const VERIFICATION_LABEL: Record<VerificationStatus, string> = { unverified: "не проверено", verified: "проверено", rejected: "отклонено" };
const VERIFICATION_TONE: Record<VerificationStatus, "neutral" | "cyan" | "warn"> = { unverified: "neutral", verified: "cyan", rejected: "warn" };

type ImportReport = {
  total: number;
  valid: number;
  errors: { row: number; messages: string[] }[];
  duplicates: { row: number; reason: string }[];
  sample?: { row: number; record: BenchmarkRecord }[];
  batchId?: string;
  skippedDuplicates?: number;
  error?: string;
};
type Batch = { id: string; sourceId: string; createdAt: string; rowCount: number; status: "committed" | "rolled_back"; notes?: string };

const CSV_TEMPLATE = `game_id,cpu_id,gpu_id,resolution,preset,ray_tracing,upscaling,upscaler,frame_gen,avg_fps,low1_fps,source_id,source_label,source_url,test_date,method,game_version,ram_gb,ram_type,driver,os,notes,sample_count
cyberpunk-2077,amd-ryzen-7-7800x3d,nvidia-founders-edition-rtx-4070,1440p,high,false,off,,false,,,nexrig,Название источника,https://example.com/review,2026-01-15,"встроенный бенчмарк, 3 прогона",2.21,32,DDR5,,Windows 11,,3`;

/** Token in sessionStorage as an external store: empty on the server, read on the client. */
const tokenListeners = new Set<() => void>();
const tokenStore = {
  subscribe(fn: () => void) {
    tokenListeners.add(fn);
    return () => tokenListeners.delete(fn);
  },
  get() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) ?? "";
    } catch {
      return "";
    }
  },
  set(value: string) {
    try {
      if (value) sessionStorage.setItem(TOKEN_KEY, value);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Storage unavailable (private mode): the token lasts until reload via the fallback below.
      memoryToken = value;
    }
    tokenListeners.forEach((fn) => fn());
  },
};
let memoryToken = "";

const nameOf = (id: string) => hardwareRepository.byId(id)?.name ?? id;
const gameOf = (id: string) => GAMES.find((g) => g.id === id)?.title ?? id;

export function BenchmarkAdmin() {
  const stored = useSyncExternalStore(tokenStore.subscribe, tokenStore.get, () => "");
  const token = stored || memoryToken;
  const setToken = tokenStore.set;
  const [draftToken, setDraftToken] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const auth = useAuth();
  const showAuth = useAuthDialog((s) => s.show);
  // A signed-in admin uses the session cookie (checked on the server); the token is a fallback for scripts.
  const sessionAdmin = auth.status === "signed-in" && Boolean(auth.user?.isAdmin);

  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const headers: Record<string, string> = { ...((init.headers as Record<string, string>) ?? {}), "Content-Type": "application/json" };
      if (!sessionAdmin && token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(path, { ...init, headers, credentials: "same-origin" });
      if (res.status === 401 || res.status === 403 || res.status === 503) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setAuthError(body.error ?? `HTTP ${res.status}`);
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res;
    },
    [token, sessionAdmin],
  );

  if (auth.status === "loading") {
    return <p className="mx-auto max-w-md px-4 py-10 text-[13px] text-fg-3">Проверяем вход…</p>;
  }

  if (!sessionAdmin && !token) {
    return (
      <div className="mx-auto max-w-md space-y-3 px-4 py-10">
        <h1 className="text-xl font-semibold">Администрирование бенчмарков</h1>
        {auth.status === "signed-in" ? (
          <p className="rounded-[var(--radius-md)] border border-warn/40 bg-warn-soft p-3 text-[12.5px] text-warn">
            Вы вошли как {auth.user?.email}, но у этой учётной записи нет роли администратора.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-[12.5px] text-fg-3">Войдите учётной записью администратора.</p>
            <Button onClick={() => showAuth("login")} disabled={auth.status === "unavailable"}>
              Войти
            </Button>
          </div>
        )}
        <p className="pt-3 text-[12px] text-fg-3">Или токен администратора (переменная сервера NEXRIG_ADMIN_TOKEN) — для скриптов. Хранится только в этой вкладке.</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setAuthError(null);
            setToken(draftToken);
          }}
        >
          <input type="password" autoComplete="off" className={inputCls} value={draftToken} onChange={(e) => setDraftToken(e.target.value)} aria-label="Токен администратора" />
          <Button type="submit" disabled={draftToken.length < 8}>
            Войти
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-5 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Бенчмарки · администрирование</h1>
          <p className="text-sm text-fg-3">Импорт, проверка и происхождение записей. В расчёты FPS попадают только записи со статусом «проверено».</p>
        </div>
        {sessionAdmin ? (
          <span className="text-[12px] text-fg-3">Администратор: {auth.user?.email}</span>
        ) : (
          <Button
            variant="secondary"
            onClick={() => {
              setToken("");
              setDraftToken("");
            }}
          >
            Забыть токен
          </Button>
        )}
      </header>
      {authError && (
        <p role="alert" className="rounded-[var(--radius-md)] border border-bad/40 bg-bad-soft p-3 text-[12.5px] text-bad">
          {authError}
        </p>
      )}
      <SourcesSection api={api} />
      <BrowserResultsSection api={api} />
      <RecordsSection api={api} />
      <ImportSection api={api} />
      <AddSection api={api} />
      <BatchesSection api={api} />
    </div>
  );
}

type Api = (path: string, init?: RequestInit) => Promise<Response>;

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-[var(--radius-lg)] border border-line bg-panel p-4">{children}</section>;
}

function RecordsSection({ api }: { api: Api }) {
  const [filter, setFilter] = useState({ gameId: "", gpuId: "", cpuId: "", resolution: "", preset: "", rayTracing: "", frameGen: "", sourceId: "", verification: "any" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: BenchmarkRecord[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const qs = new URLSearchParams({ page: String(page), pageSize: "25" });
    for (const [k, v] of Object.entries(filter)) if (v) qs.set(k, v);
    api(`/api/admin/benchmarks?${qs}`)
      .then(async (r) => (r.ok ? setData(await r.json()) : setError((await r.json()).error ?? `HTTP ${r.status}`)))
      .catch((e: Error) => setError(e.message));
  }, [api, filter, page, nonce]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    const r = await api("/api/admin/benchmarks", { method: "PATCH", body: JSON.stringify({ id, ...body }) });
    if (!r.ok) setError((await r.json()).error ?? `HTTP ${r.status}`);
    setNonce((n) => n + 1);
  };
  const remove = async (id: string) => {
    if (!window.confirm("Удалить запись безвозвратно?")) return;
    const r = await api(`/api/admin/benchmarks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!r.ok) setError((await r.json()).error ?? `HTTP ${r.status}`);
    setNonce((n) => n + 1);
  };
  const edit = async (r: BenchmarkRecord) => {
    const avg = window.prompt("Средний FPS", String(r.avgFps));
    if (avg === null) return;
    const low = window.prompt("1% low (пусто — без изменений)", r.low1Fps ? String(r.low1Fps) : "");
    const notes = window.prompt("Заметки", r.notes ?? "");
    await patch(r.id, { avgFps: Number(avg), ...(low ? { low1Fps: Number(low) } : {}), ...(notes !== null ? { notes } : {}) });
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <Panel>
      <SectionTitle aside={data ? <span className="text-[11px] text-fg-3">Всего: {data.total}</span> : undefined}>Записи</SectionTitle>
      <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Field label="Игра">
          <Select label="Игра" value={filter.gameId} onChange={(gameId) => (setPage(1), setFilter({ ...filter, gameId }))} options={[{ value: "", label: "все" }, ...GAMES.map((g) => ({ value: g.id, label: g.title }))]} />
        </Field>
        <Field label="GPU (id)">
          <input className={inputCls} value={filter.gpuId} onChange={(e) => (setPage(1), setFilter({ ...filter, gpuId: e.target.value.trim() }))} placeholder="nvidia-founders-edition-rtx-4070" />
        </Field>
        <Field label="CPU (id)">
          <input className={inputCls} value={filter.cpuId} onChange={(e) => (setPage(1), setFilter({ ...filter, cpuId: e.target.value.trim() }))} placeholder="amd-ryzen-7-7800x3d" />
        </Field>
        <Field label="Разрешение">
          <Select label="Разрешение" value={filter.resolution} onChange={(resolution) => (setPage(1), setFilter({ ...filter, resolution }))} options={[{ value: "", label: "все" }, ...["1080p", "1440p", "4K"].map((v) => ({ value: v, label: v }))]} />
        </Field>
        <Field label="Пресет">
          <Select label="Пресет" value={filter.preset} onChange={(preset) => (setPage(1), setFilter({ ...filter, preset }))} options={[{ value: "", label: "все" }, ...["low", "medium", "high", "ultra"].map((v) => ({ value: v, label: v }))]} />
        </Field>
        <Field label="Ray tracing">
          <Select label="Ray tracing" value={filter.rayTracing} onChange={(rayTracing) => (setPage(1), setFilter({ ...filter, rayTracing }))} options={[{ value: "", label: "все" }, { value: "true", label: "RT вкл." }, { value: "false", label: "RT выкл." }]} />
        </Field>
        <Field label="Генерация кадров">
          <Select label="Генерация кадров" value={filter.frameGen} onChange={(frameGen) => (setPage(1), setFilter({ ...filter, frameGen }))} options={[{ value: "", label: "все" }, { value: "true", label: "FG вкл." }, { value: "false", label: "FG выкл." }]} />
        </Field>
        <Field label="Источник">
          <Select label="Источник" value={filter.sourceId} onChange={(sourceId) => (setPage(1), setFilter({ ...filter, sourceId }))} options={[{ value: "", label: "все" }, ...SOURCES.map((v) => ({ value: v, label: v }))]} />
        </Field>
        <Field label="Статус">
          <Select
            label="Статус"
            value={filter.verification}
            onChange={(verification) => (setPage(1), setFilter({ ...filter, verification }))}
            options={[{ value: "any", label: "все" }, ...(Object.keys(VERIFICATION_LABEL) as VerificationStatus[]).map((v) => ({ value: v, label: VERIFICATION_LABEL[v] }))]}
          />
        </Field>
      </div>
      {error && <p className="mt-3 text-[12px] text-bad">{error}</p>}
      {!data ? (
        <p className="mt-3 text-[12px] text-fg-3">Загрузка…</p>
      ) : data.items.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="Записей нет">Импортируйте CSV/JSON или добавьте запись вручную.</EmptyState>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-[12px]">
            <thead className="text-left text-[11px] text-fg-3">
              <tr>
                {["Игра", "CPU / GPU", "Настройки", "FPS (1% low)", "Источник", "Дата", "Статус", ""].map((h) => (
                  <th key={h} className="py-1.5 pr-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((r) => {
                const status = r.verification ?? "unverified";
                return (
                  <tr key={r.id} className="align-top">
                    <td className="py-1.5 pr-2">{gameOf(r.gameId)}</td>
                    <td className="py-1.5 pr-2">
                      <div>{nameOf(r.cpuId)}</div>
                      <div className="text-fg-3">{nameOf(r.gpuId)}</div>
                    </td>
                    <td className="py-1.5 pr-2 text-fg-2">
                      {r.settings.resolution} · {r.settings.preset}
                      {r.settings.rayTracing ? " · RT" : ""}
                      {r.settings.upscaling !== "off" ? ` · ${r.settings.upscaler ?? ""} ${r.settings.upscaling}` : ""}
                      {r.settings.frameGen ? " · FG" : ""}
                    </td>
                    <td className="num py-1.5 pr-2">
                      {r.avgFps} {r.low1Fps ? <span className="text-fg-3">({r.low1Fps})</span> : null}
                    </td>
                    <td className="py-1.5 pr-2">
                      {r.source.url ? (
                        <a href={r.source.url} target="_blank" rel="noreferrer noopener" className="text-violet hover:underline">
                          {r.source.label}
                        </a>
                      ) : (
                        r.source.label
                      )}
                    </td>
                    <td className="num py-1.5 pr-2">{r.testDate}</td>
                    <td className="py-1.5 pr-2">
                      <Badge tone={VERIFICATION_TONE[status]}>{VERIFICATION_LABEL[status]}</Badge>
                    </td>
                    <td className="py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {status !== "verified" && (
                          <Button size="sm" onClick={() => patch(r.id, { verification: "verified" })}>
                            Подтвердить
                          </Button>
                        )}
                        {status !== "rejected" && (
                          <Button size="sm" variant="ghost" onClick={() => patch(r.id, { verification: "rejected" })}>
                            Отклонить
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => edit(r)}>
                          Изменить
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                          Происхождение
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => remove(r.id)}>
                          Удалить
                        </Button>
                      </div>
                      {open === r.id && (
                        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[11px] text-fg-3">
                          {[
                            ["id", r.id],
                            ["Источник (id)", r.sourceId],
                            ["Партия импорта", r.importBatchId],
                            ["Отправил пользователь", r.submittedBy ? `${r.submittedBy.slice(0, 8)}… (замер сообщества)` : undefined],
                            ["Добавлено", r.createdAt],
                            ["Метод", r.method],
                            ["Версия игры", r.gameVersion],
                            ["Тестовая система", r.testConfig],
                            ["RAM", r.ramGb ? `${r.ramGb} ГБ ${r.ramType ?? ""}` : undefined],
                            ["ОС / драйвер", [r.os, r.driver].filter(Boolean).join(" / ") || undefined],
                            ["Прогонов", String(r.sampleCount)],
                            ["Заметки", r.notes],
                          ].map(([k, v]) => (
                            <div key={k} className="contents">
                              <dt>{k}</dt>
                              <dd className="text-fg-2">{v ?? "—"}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3 flex items-center justify-end gap-2 text-[12px]">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Назад
            </Button>
            <span className="num text-fg-3">
              {page} / {pages}
            </span>
            <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Вперёд →
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

function ImportSection({ api }: { api: Api }) {
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [sourceId, setSourceId] = useState("nexrig");
  const [content, setContent] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (mode: "preview" | "commit") => {
    setBusy(true);
    try {
      const r = await api("/api/admin/benchmarks/import", { method: "POST", body: JSON.stringify({ format, content, mode, sourceId }) });
      setReport(await r.json());
    } catch (e) {
      setReport({ total: 0, valid: 0, errors: [], duplicates: [], error: e instanceof Error ? e.message : "ошибка" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <SectionTitle>Импорт CSV / JSON</SectionTitle>
      <p className="mt-1 text-[11.5px] text-fg-3">
        До 1 МБ и 5000 строк. Импортированные записи получают статус «не проверено» — подтвердите их после сверки с источником. Не импортируйте данные без разрешения правообладателя.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Field label="Формат">
          <Select label="Формат" value={format} onChange={(v) => setFormat(v as "csv" | "json")} options={[{ value: "csv", label: "CSV" }, { value: "json", label: "JSON (массив)" }]} />
        </Field>
        <Field label="Источник">
          <Select label="Источник" value={sourceId} onChange={setSourceId} options={SOURCES.map((v) => ({ value: v, label: v }))} />
        </Field>
        <Field label="Файл">
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="text-[12px]"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 1_000_000) {
                setReport({ total: 0, valid: 0, errors: [], duplicates: [], error: "Файл больше 1 МБ" });
                return;
              }
              setFormat(file.name.toLowerCase().endsWith(".json") ? "json" : "csv");
              setContent(await file.text());
            }}
          />
        </Field>
      </div>
      <textarea className={cx(inputCls, "mt-2 h-40 font-mono text-[11px]")} value={content} onChange={(e) => setContent(e.target.value)} placeholder={CSV_TEMPLATE} aria-label="Содержимое импорта" />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => (setFormat("csv"), setContent(CSV_TEMPLATE))}>
          Вставить шаблон CSV
        </Button>
        <Button size="sm" variant="secondary" disabled={!content || busy} onClick={() => run("preview")}>
          Проверить
        </Button>
        <Button size="sm" disabled={!content || busy || !report || report.valid === 0 || Boolean(report.batchId)} onClick={() => run("commit")}>
          Импортировать {report && !report.batchId ? `(${report.valid})` : ""}
        </Button>
      </div>
      {report && (
        <div className="mt-3 space-y-2 text-[12px]" aria-live="polite">
          {report.error && <p className="text-bad">{report.error}</p>}
          <p className="text-fg-2">
            Строк: {report.total} · корректных: <span className="text-ok">{report.valid}</span> · с ошибками: <span className="text-bad">{report.errors.length}</span> · дубликатов: {report.duplicates.length}
            {report.batchId && <> · импортировано, партия <span className="num">{report.batchId.slice(0, 8)}</span></>}
            {report.skippedDuplicates ? <> · пропущено дубликатов при записи: {report.skippedDuplicates}</> : null}
          </p>
          {report.errors.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-[var(--radius-sm)] border border-line p-2">
              {report.errors.map((e) => (
                <li key={e.row}>
                  <span className="num text-fg-3">Строка {e.row}:</span> {e.messages.join("; ")}
                </li>
              ))}
            </ul>
          )}
          {report.duplicates.length > 0 && (
            <ul className="max-h-32 space-y-1 overflow-y-auto rounded-[var(--radius-sm)] border border-line p-2 text-fg-3">
              {report.duplicates.map((d) => (
                <li key={d.row}>
                  Строка {d.row}: {d.reason}
                </li>
              ))}
            </ul>
          )}
          {report.sample && report.sample.length > 0 && (
            <p className="text-fg-3">
              Пример: {gameOf(report.sample[0].record.gameId)} · {nameOf(report.sample[0].record.gpuId)} · {report.sample[0].record.settings.resolution} — {report.sample[0].record.avgFps} FPS
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

function AddSection({ api }: { api: Api }) {
  const [json, setJson] = useState("");
  const [result, setResult] = useState<string | null>(null);
  return (
    <Panel>
      <SectionTitle>Добавить запись вручную</SectionTitle>
      <p className="mt-1 text-[11.5px] text-fg-3">Одна запись в формате JSON с полями как в CSV (game_id, cpu_id, gpu_id, resolution, preset, …). Проверка та же, что при импорте.</p>
      <textarea
        className={cx(inputCls, "mt-2 h-28 font-mono text-[11px]")}
        value={json}
        onChange={(e) => setJson(e.target.value)}
        placeholder='{"game_id":"cyberpunk-2077","cpu_id":"amd-ryzen-7-7800x3d","gpu_id":"nvidia-founders-edition-rtx-4070","resolution":"1440p","preset":"high","ray_tracing":false,"avg_fps":0,"source_label":"…","source_url":"https://…","test_date":"2026-01-15"}'
        aria-label="Запись JSON"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          disabled={!json}
          onClick={async () => {
            try {
              JSON.parse(json);
            } catch {
              setResult("Некорректный JSON");
              return;
            }
            const r = await api("/api/admin/benchmarks", { method: "POST", body: json });
            const body = await r.json();
            setResult(r.ok ? "Добавлено (статус «не проверено»)." : `${body.error ?? r.status} ${body.errors ? body.errors.flatMap((e: { messages: string[] }) => e.messages).join("; ") : ""}`);
          }}
        >
          Добавить
        </Button>
        {result && <span className="text-[12px] text-fg-2">{result}</span>}
      </div>
    </Panel>
  );
}

function BatchesSection({ api }: { api: Api }) {
  const [items, setItems] = useState<Batch[] | null>(null);
  const [nonce, setNonce] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    api("/api/admin/benchmarks/batches")
      .then(async (r) => (r.ok ? setItems((await r.json()).items) : setItems([])))
      .catch(() => setItems([]));
  }, [api, nonce]);
  return (
    <Panel>
      <SectionTitle aside={<Button size="sm" variant="ghost" onClick={() => setNonce((n) => n + 1)}>Обновить</Button>}>Партии импорта</SectionTitle>
      {message && (
        <p className="mt-2 text-[12px] text-fg-2" aria-live="polite">
          {message}
        </p>
      )}
      {!items ? (
        <p className="mt-2 text-[12px] text-fg-3">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-[12px] text-fg-3">Импортов ещё не было.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line text-[12px]">
          {items.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span>
                <span className="num">{b.id.slice(0, 8)}</span> · {b.sourceId} · {new Date(b.createdAt).toLocaleString("ru-RU")} · строк: {b.rowCount}
                {b.notes ? ` · ${b.notes}` : ""}
              </span>
              {b.status === "rolled_back" ? (
                <Badge tone="neutral">отменена</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    if (!window.confirm(`Откатить партию: удалить ${b.rowCount} записей?`)) return;
                    const r = await api(`/api/admin/benchmarks/batches?id=${encodeURIComponent(b.id)}`, { method: "DELETE" });
                    const body = (await r.json().catch(() => ({}))) as { removed?: number; kept?: number; error?: string };
                    setMessage(
                      r.ok
                        ? `Удалено записей: ${body.removed ?? 0}. Сохранено (изменены или подтверждены после импорта): ${body.kept ?? 0}.`
                        : (body.error ?? `Ошибка ${r.status}`),
                    );
                    setNonce((n) => n + 1);
                  }}
                >
                  Откатить
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
