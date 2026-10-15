"use client";

import { useCallback, useEffect, useState } from "react";
import { GAMES } from "@/data/games";
import { useAuth, useAuthDialog } from "@/features/auth/use-auth";
import { useMeasuredBenchmarks } from "@/features/benchmarks/measured-store";
import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore } from "@/features/build-state/store";
import { hardwareRepository } from "@/lib/hardware/repository";
import { useMessages } from "@/lib/i18n";
import { RESOLUTION_PIXELS, type BenchmarkRecord, type GameSettings, type VerificationStatus } from "@/types/benchmark";
import { IconTrash } from "@/components/ui/icons";
import { Badge, Button, cx, EmptyState, Field, inputCls, SectionTitle, Select } from "@/components/ui/primitives";

const EMPTY = { avgFps: "", low1Fps: "", sourceUrl: "", testDate: "", gameVersion: "", testConfig: "", method: "", notes: "", sampleCount: "3" };
const STATUS_LABEL: Record<VerificationStatus, string> = { unverified: "на проверке", verified: "подтверждён", rejected: "отклонён" };
const STATUS_TONE: Record<VerificationStatus, "neutral" | "cyan" | "warn"> = { unverified: "neutral", verified: "cyan", rejected: "warn" };

export function settingsLabel(s: GameSettings, presets: Record<string, string>, modes: Record<string, string>) {
  return [
    RESOLUTION_PIXELS[s.resolution],
    presets[s.preset],
    s.rayTracing ? "RT" : null,
    s.upscaling !== "off" ? `${s.upscaler ?? "апскейлинг"} ${modes[s.upscaling]}` : null,
    s.frameGen ? "генерация кадров" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

type Row = BenchmarkRecord & { community?: boolean };

/** Body for POST /api/fps/submissions (snake_case like imports). */
function toSubmission(r: Pick<BenchmarkRecord, "gameId" | "cpuId" | "gpuId" | "settings" | "avgFps" | "low1Fps" | "testDate" | "gameVersion" | "method" | "testConfig" | "notes" | "sampleCount"> & { url?: string; ram?: { gb: number; type: string } }) {
  return {
    game_id: r.gameId,
    cpu_id: r.cpuId,
    gpu_id: r.gpuId,
    resolution: r.settings.resolution,
    preset: r.settings.preset,
    ray_tracing: r.settings.rayTracing,
    upscaling: r.settings.upscaling,
    upscaler: r.settings.upscaling === "off" ? null : (r.settings.upscaler ?? null),
    frame_gen: Boolean(r.settings.frameGen),
    avg_fps: r.avgFps,
    low1_fps: r.low1Fps,
    test_date: r.testDate,
    game_version: r.gameVersion,
    method: r.method ?? "",
    test_config: r.testConfig,
    source_url: r.url,
    notes: r.notes,
    sample_count: r.sampleCount,
    ...(r.ram ? { ram_gb: r.ram.gb, ram_type: r.ram.type } : {}),
  };
}

async function submit(body: unknown): Promise<string | null> {
  const res = await fetch("/api/fps/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  if (res.ok) return null;
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  return j.error ?? `Ошибка ${res.status}`;
}

function RecordLine({ r, label, name, status, action }: { r: Row; label: (s: GameSettings) => string; name: (id: string) => string; status?: VerificationStatus; action?: React.ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-line bg-panel p-3 text-xs">
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium">
          {GAMES.find((g) => g.id === r.gameId)?.title}
          {r.gameVersion ? ` (${r.gameVersion})` : ""} · <span className="num text-cyan">{r.avgFps} FPS</span>
          {r.low1Fps ? <span className="num text-fg-3"> · 1% {r.low1Fps}</span> : null}
        </p>
        <p className="truncate text-fg-3">
          {name(r.cpuId)} · {name(r.gpuId)} · {label(r.settings)}
        </p>
        <p className="text-fg-3">
          {r.community ? "Замер пользователя" : r.source.url ? (
            <a href={r.source.url} target="_blank" rel="noreferrer noopener" className="text-violet hover:underline">
              {r.source.label}
            </a>
          ) : (
            r.source.label
          )}{" "}
          · {r.testDate} · {r.sampleCount} прогон(а)
          {r.method ? ` · ${r.method}` : ""}
          {r.testConfig ? ` · ${r.testConfig}` : ""}
        </p>
        {r.community && r.source.url && (
          <a href={r.source.url} target="_blank" rel="noreferrer noopener" className="text-[11px] text-violet hover:underline">
            подтверждение (ссылка автора)
          </a>
        )}
        {r.notes && <p className="text-fg-3 italic">{r.notes}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {status && <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>}
        {action}
      </div>
    </li>
  );
}

/**
 * Real measurements shared between users. Signed-in users submit their own results; an admin
 * verifies them; verified results from everyone feed FPS Lab (exact matches replace the estimate,
 * close ones calibrate the model). Older measurements saved only in this browser can be submitted.
 */
export function MeasuredRecords() {
  const t = useMessages();
  const auth = useAuth();
  const showAuth = useAuthDialog((s) => s.show);
  const { resolved } = useBuildDerived();
  const perf = useBuildStore((s) => s.perf);
  const localRecords = useMeasuredBenchmarks((s) => s.records);
  const removeLocal = useMeasuredBenchmarks((s) => s.remove);
  const [tab, setTab] = useState<"open" | "mine">("open");
  const [filterGame, setFilterGame] = useState(perf.gameId);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{ items: Row[]; total: number } | null>(null);
  const [mine, setMine] = useState<Row[] | null>(null);
  const [nonce, setNonce] = useState(0);
  const signedIn = auth.status === "signed-in";
  const canAdd = Boolean(resolved.cpu && resolved.gpu);
  const name = (id: string) => hardwareRepository.byId(id)?.name ?? id;
  const label = (s: GameSettings) => settingsLabel(s, t.perf.presets, t.perf.upscalingModes);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const opt = (v: string) => v.trim() || undefined;

  // Verified measurements from everyone (public API, verified only).
  useEffect(() => {
    const ctrl = new AbortController();
    const qs = new URLSearchParams({ pageSize: "50" });
    if (filterGame !== "all") qs.set("gameId", filterGame);
    fetch(`/api/fps/benchmarks?${qs}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { items: [], total: 0 }))
      .then((d) => setOpen(d))
      .catch(() => !ctrl.signal.aborted && setOpen({ items: [], total: 0 }));
    return () => ctrl.abort();
  }, [filterGame, nonce]);

  const loadMine = useCallback(() => {
    fetch("/api/fps/submissions", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items: Row[] }) => setMine(d.items))
      .catch(() => setMine([]));
  }, []);
  useEffect(() => {
    if (signedIn) loadMine();
  }, [signedIn, nonce, loadMine]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!resolved.cpu || !resolved.gpu) return;
    const avg = Number(form.avgFps);
    const low = form.low1Fps ? Number(form.low1Fps) : undefined;
    if (!(avg > 0) || (low !== undefined && !(low > 0))) return setError("FPS — положительное число.");
    if (low !== undefined && low > avg) return setError("1% low не может быть выше среднего FPS.");
    if (form.method.trim().length < 3) return setError("Укажите, чем и как измеряли (например, «MSI Afterburner, встроенный бенчмарк»).");
    setBusy(true);
    const err = await submit(
      toSubmission({
        gameId: perf.gameId,
        cpuId: resolved.cpu.id,
        gpuId: resolved.gpu.id,
        settings: perf.settings,
        avgFps: avg,
        low1Fps: low,
        testDate: form.testDate || new Date().toISOString().slice(0, 10),
        gameVersion: opt(form.gameVersion),
        method: form.method.trim(),
        testConfig: opt(form.testConfig),
        notes: opt(form.notes),
        sampleCount: Math.max(1, Math.min(100, Number(form.sampleCount) || 1)),
        url: opt(form.sourceUrl),
        ram: resolved.ram ? { gb: resolved.ram.moduleSizeGb * resolved.ramCount, type: resolved.ram.type } : undefined,
      }),
    ).catch(() => "Сервис недоступен. Попробуйте позже.");
    setBusy(false);
    if (err) return setError(err);
    setNotice("Замер отправлен на проверку. После подтверждения он станет виден всем и попадёт в расчёты FPS Lab.");
    setForm((f) => ({ ...f, avgFps: "", low1Fps: "", notes: "" }));
    setTab("mine");
    setNonce((n) => n + 1);
  };

  const submitLocal = async (r: BenchmarkRecord) => {
    setError(null);
    setNotice(null);
    const err = await submit(toSubmission({ ...r, method: r.method ?? r.source.label, url: r.source.url })).catch(() => "Сервис недоступен.");
    if (err) return setError(err);
    removeLocal(r.id);
    setNotice("Замер из браузера отправлен на проверку.");
    setNonce((n) => n + 1);
  };

  const shownOpen = open?.items ?? [];

  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[380px_minmax(0,1fr)]" aria-label="Реальные замеры">
      <div className="space-y-3 rounded-[var(--radius-lg)] border border-line bg-panel p-4">
        <SectionTitle>Отправить реальный замер</SectionTitle>
        <p className="text-[11.5px] leading-relaxed text-fg-3">
          Для текущей сборки, игры «{GAMES.find((g) => g.id === perf.gameId)?.title}» и настроек: {label(perf.settings)}. Замер проверит администратор; подтверждённые замеры видны всем и используются в расчётах.
        </p>
        {!signedIn ? (
          <div className="space-y-2 rounded-[var(--radius-md)] border border-line bg-panel-2/60 p-3">
            <p className="text-[12px] text-fg-2">Отправлять замеры могут вошедшие пользователи.</p>
            <Button onClick={() => showAuth("login")} disabled={auth.status === "loading" || auth.status === "unavailable"}>
              Войти
            </Button>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={onSubmit} noValidate>
            {!canAdd && <p className="text-xs text-warn">Нужны процессор и видеокарта в сборке.</p>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Средний FPS">
                <input inputMode="decimal" required className={inputCls} value={form.avgFps} onChange={set("avgFps")} />
              </Field>
              <Field label="1% low">
                <input inputMode="decimal" className={inputCls} value={form.low1Fps} onChange={set("low1Fps")} />
              </Field>
            </div>
            <Field label="Чем и как измеряли">
              <input required placeholder="MSI Afterburner, встроенный бенчмарк, 3 прогона" className={inputCls} value={form.method} onChange={set("method")} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Дата теста" hint="Пусто — сегодня">
                <input type="date" className={inputCls} value={form.testDate} onChange={set("testDate")} />
              </Field>
              <Field label="Прогонов">
                <input type="number" min={1} max={100} className={inputCls} value={form.sampleCount} onChange={set("sampleCount")} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Версия игры">
                <input className={inputCls} value={form.gameVersion} onChange={set("gameVersion")} />
              </Field>
              <Field label="Драйвер, ОС">
                <input className={inputCls} value={form.testConfig} onChange={set("testConfig")} />
              </Field>
            </div>
            <Field label="Ссылка на подтверждение (необязательно)" hint="Скриншот или видео, https">
              <input type="url" className={inputCls} value={form.sourceUrl} onChange={set("sourceUrl")} />
            </Field>
            <Field label="Примечания">
              <input className={inputCls} value={form.notes} onChange={set("notes")} />
            </Field>
            <Button type="submit" variant="primary" disabled={!canAdd || busy} className="w-full">
              {busy ? "Отправляем…" : "Отправить на проверку"}
            </Button>
          </form>
        )}
        {error && (
          <p className="text-xs text-bad" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="text-xs text-ok" role="status">
            {notice}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="tablist" aria-label="Замеры" className="flex rounded-[var(--radius-md)] border border-line bg-panel p-0.5 text-[12.5px]">
            {([
              ["open", `Открытые замеры${open ? ` · ${open.total}` : ""}`],
              ["mine", `Мои отправки${mine ? ` · ${mine.length}` : ""}`],
            ] as const).map(([id, text]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cx("h-8 rounded-[calc(var(--radius-md)-3px)] px-3 font-medium", tab === id ? "bg-panel-3 text-fg" : "text-fg-3 hover:text-fg")}
              >
                {text}
              </button>
            ))}
          </div>
          {tab === "open" && (
            <div className="w-52">
              <Select label="Фильтр по игре" value={filterGame} onChange={setFilterGame} options={[{ value: "all", label: "Все игры" }, ...GAMES.map((g) => ({ value: g.id, label: g.title }))]} />
            </div>
          )}
        </div>

        {tab === "open" ? (
          !open ? (
            <p className="text-xs text-fg-3">Загрузка…</p>
          ) : shownOpen.length === 0 ? (
            <EmptyState title="Подтверждённых замеров пока нет">
              Здесь появятся реальные результаты пользователей после проверки. Приложение не выдумывает замеры — пока их нет, FPS Lab показывает оценку модели.
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {shownOpen.map((r) => (
                <RecordLine key={r.id} r={r} label={label} name={name} />
              ))}
            </ul>
          )
        ) : !signedIn ? (
          <EmptyState title="Войдите, чтобы видеть свои отправки" />
        ) : !mine ? (
          <p className="text-xs text-fg-3">Загрузка…</p>
        ) : mine.length === 0 ? (
          <EmptyState title="Вы ещё не отправляли замеры" />
        ) : (
          <ul className="space-y-2">
            {mine.map((r) => (
              <RecordLine key={r.id} r={r} label={label} name={name} status={r.verification ?? "unverified"} />
            ))}
          </ul>
        )}

        {localRecords.length > 0 && (
          <div className="space-y-2 rounded-[var(--radius-md)] border border-line bg-panel-2/40 p-3">
            <p className="text-[12px] font-medium text-fg-2">Сохранены только в этом браузере · {localRecords.length}</p>
            <p className="text-[11px] text-fg-3">Используются только у вас. Отправьте их на проверку, чтобы они стали открытыми.</p>
            <ul className="space-y-2">
              {localRecords.map((r) => (
                <RecordLine
                  key={r.id}
                  r={r}
                  label={label}
                  name={name}
                  action={
                    <div className="flex gap-1">
                      {signedIn && (
                        <Button size="sm" onClick={() => submitLocal(r)}>
                          Отправить
                        </Button>
                      )}
                      <Button size="sm" variant="danger" onClick={() => removeLocal(r.id)} aria-label="Удалить замер">
                        <IconTrash width={13} height={13} />
                      </Button>
                    </div>
                  }
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
