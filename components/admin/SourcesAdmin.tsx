"use client";

import { useEffect, useState } from "react";
import type { SourceAudit } from "@/lib/fps-engine/catalog";
import { Badge, Button, cx, inputCls, SectionTitle } from "@/components/ui/primitives";

type Api = (path: string, init?: RequestInit) => Promise<Response>;

/** Mirrors SourceOverview from lib/fps-engine/source-registry (server-only module). */
interface SourceRow {
  audit: SourceAudit;
  enabled: boolean;
  baseUrl: string | null;
  status: "active" | "no-data" | "disabled" | "error" | "not-used";
  lastCheckAt: string | null;
  lastErrorAt: string | null;
  errorMessage: string | null;
  usableRecords: number | null;
}

const STATUS: Record<SourceRow["status"], { label: string; tone: "cyan" | "neutral" | "warn" }> = {
  active: { label: "данные используются", tone: "cyan" },
  "no-data": { label: "нет данных", tone: "neutral" },
  disabled: { label: "отключён", tone: "neutral" },
  error: { label: "ошибка проверки", tone: "warn" },
  "not-used": { label: "не используется", tone: "neutral" },
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ru-RU") : "—");

/**
 * Source management: enable/disable, page URL, integration type, status, last check, last error and
 * the number of verified records each source contributes. Editorial sources are "ручной импорт":
 * the check only confirms their public feed or page answers — nothing is downloaded into the base.
 */
export function SourcesSection({ api }: { api: Api }) {
  const [rows, setRows] = useState<SourceRow[] | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; url: string } | null>(null);

  useEffect(() => {
    api("/api/admin/sources")
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { items?: SourceRow[]; stateError?: string | null; error?: string };
        setRows(body.items ?? []);
        setStateError(body.stateError ?? body.error ?? null);
      })
      .catch(() => setRows([]));
  }, [api, nonce]);

  const act = async (id: string, init: RequestInit, done: (body: { ok?: boolean; message?: string; error?: string }) => string) => {
    setBusy(id);
    setMessage(null);
    try {
      const r = await api("/api/admin/sources", init);
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      setMessage(r.ok ? done(body) : (body.error ?? `Ошибка ${r.status}`));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ошибка запроса");
    } finally {
      setBusy(null);
      setNonce((n) => n + 1);
    }
  };

  return (
    <section className="rounded-[var(--radius-lg)] border border-line bg-panel p-4">
      <SectionTitle aside={<Button size="sm" variant="ghost" onClick={() => setNonce((n) => n + 1)}>Обновить</Button>}>Источники</SectionTitle>
      <p className="mt-1 text-[12px] text-fg-3">
        API и разрешения на автоматический сбор нет ни у одного редакционного сайта. Их результаты вносятся только ручным импортом со ссылкой на статью. «Проверить» делает один запрос к публичной ленте или странице источника.
      </p>
      {stateError && <p className="mt-2 text-[12px] text-warn">{stateError}</p>}
      {message && (
        <p className="mt-2 text-[12px] text-fg-2" aria-live="polite">
          {message}
        </p>
      )}
      {!rows ? (
        <p className="mt-2 text-[12px] text-fg-3">Загрузка…</p>
      ) : (
        <ul className="mt-3 grid gap-2 lg:grid-cols-2">
          {rows.map((s) => (
            <li key={s.audit.id} className={cx("rounded-[var(--radius-md)] border p-3 text-[12px]", s.enabled ? "border-line bg-panel-2/40" : "border-dashed border-line opacity-80")}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">{s.audit.name}</span>
                <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                <Badge tone="neutral">{s.audit.integrationLabel}</Badge>
              </div>
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[11.5px]">
                <dt className="text-fg-3">Записей в расчётах</dt>
                <dd className="num">{s.usableRecords ?? "—"}</dd>
                <dt className="text-fg-3">Последняя проверка</dt>
                <dd>{fmt(s.lastCheckAt)}</dd>
                <dt className="text-fg-3">Последняя ошибка</dt>
                <dd className={s.errorMessage ? "text-warn" : undefined}>{s.lastErrorAt ? `${fmt(s.lastErrorAt)} — ${s.errorMessage ?? ""}` : "—"}</dd>
                <dt className="text-fg-3">Адрес</dt>
                <dd className="truncate">
                  {editing?.id === s.audit.id ? (
                    <form
                      className="flex gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const url = editing.url.trim();
                        setEditing(null);
                        void act(s.audit.id, { method: "PATCH", body: JSON.stringify({ id: s.audit.id, baseUrl: url || null }) }, () => "Адрес сохранён.");
                      }}
                    >
                      <input className={cx(inputCls, "h-7 text-xs")} value={editing.url} onChange={(e) => setEditing({ id: s.audit.id, url: e.target.value })} aria-label="Адрес источника" />
                      <Button size="sm" type="submit">
                        OK
                      </Button>
                    </form>
                  ) : s.baseUrl ? (
                    <a href={s.baseUrl} target="_blank" rel="noopener noreferrer" className="text-violet hover:underline">
                      {s.baseUrl}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </dl>
              <details className="mt-2 text-[11.5px]">
                <summary className="cursor-pointer text-fg-2">Аудит источника</summary>
                <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-fg-2">
                  <dt className="text-fg-3">Данные</dt>
                  <dd>{s.audit.data}</dd>
                  <dt className="text-fg-3">Доступ</dt>
                  <dd>{s.audit.access}</dd>
                  <dt className="text-fg-3">Авторизация</dt>
                  <dd>{s.audit.auth}</dd>
                  <dt className="text-fg-3">Права</dt>
                  <dd>{s.audit.rights}</dd>
                  <dt className="text-fg-3">Обновления</dt>
                  <dd>{s.audit.updates}</dd>
                  <dt className="text-fg-3">Ограничения</dt>
                  <dd>{s.audit.limits}</dd>
                </dl>
              </details>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" disabled={busy === s.audit.id} onClick={() => act(s.audit.id, { method: "POST", body: JSON.stringify({ id: s.audit.id, action: "check" }) }, (b) => `${s.audit.name}: ${b.message ?? (b.ok ? "доступен" : "ошибка")}`)}>
                  Проверить
                </Button>
                {s.audit.id !== "nexrig" && s.audit.id !== "manufacturer" && (
                  <Button size="sm" variant={s.enabled ? "danger" : "secondary"} disabled={busy === s.audit.id} onClick={() => act(s.audit.id, { method: "PATCH", body: JSON.stringify({ id: s.audit.id, enabled: !s.enabled }) }, () => (s.enabled ? "Источник отключён: его записи не используются в расчётах." : "Источник включён."))}>
                    {s.enabled ? "Отключить" : "Включить"}
                  </Button>
                )}
                {s.audit.domain && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ id: s.audit.id, url: s.baseUrl ?? "" })}>
                    Изменить адрес
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
