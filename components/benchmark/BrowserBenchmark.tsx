"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth, useAuthDialog } from "@/features/auth/use-auth";
import { clearHistory, saveRun, setBenchConsent, useBenchConsent, useBenchHistory, type BenchRun } from "@/features/browser-bench/history";
import { chooseBackend, detectCapabilities, type BackendInfo, type Capabilities } from "@/lib/browser-bench/capabilities";
import { BENCH_MODES, BENCH_PRESETS, BENCH_VERSION, type BackendId, type BenchMode, type BenchPresetId } from "@/lib/browser-bench/config";
import { BenchAborted, runBenchmark } from "@/lib/browser-bench/runner";
import { assess, ISSUE_TEXT } from "@/lib/browser-bench/stats";
import type { DisposableRenderer } from "@/lib/browser-bench/webgl2";
import { IconAlert, IconCheck, IconX } from "@/components/ui/icons";
import { Badge, Button, cx, Dialog, Segmented, Switch } from "@/components/ui/primitives";

const BACKEND_LABEL: Record<BackendId, string> = { webgl2: "WebGL2", webgpu: "WebGPU" };

type RunState =
  | { status: "idle" }
  | { status: "preparing"; note?: string }
  | { status: "running"; phase: "warmup" | "measure"; elapsedMs: number; totalMs: number; frames: number; fps: number | null; backend: BackendId; note?: string }
  | { status: "stopped" }
  | { status: "error"; message: string };

const fmtDate = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function BackendRow({ name, info, chosen }: { name: string; info: BackendInfo | undefined; chosen: boolean }) {
  return (
    <li className="flex items-start gap-2 text-[12px]">
      {info?.supported ? <IconCheck width={14} height={14} className="mt-0.5 shrink-0 text-ok" /> : <IconX width={14} height={14} className="mt-0.5 shrink-0 text-bad" />}
      <div className="min-w-0">
        <p className="font-medium">
          {name} {chosen && <Badge tone="cyan">будет использован</Badge>} {info?.software && <Badge tone="warn">программный рендеринг</Badge>}
        </p>
        <p className="text-fg-3">
          {!info ? "Проверяется…" : info.supported ? `Устройство: ${info.renderer && !info.masked ? info.renderer : "скрыто браузером (неизвестно)"}` : info.reason}
        </p>
      </div>
    </li>
  );
}

/** NexRig benchmark, mode B: a real WebGL2/WebGPU workload measured in this browser. */
export function BrowserBenchmark() {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [backendPref, setBackendPref] = useState<BackendId | "auto">("auto");
  const [presetId, setPresetId] = useState<BenchPresetId>("medium");
  const [modeId, setModeId] = useState<BenchMode>("short");
  const [ackLoad, setAckLoad] = useState(false);
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const [result, setResult] = useState<BenchRun | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<AbortController | null>(null);
  const consent = useBenchConsent();
  const history = useBenchHistory();

  useEffect(() => {
    let alive = true;
    void detectCapabilities().then((c) => alive && setCaps(c));
    return () => {
      alive = false;
      ctrlRef.current?.abort();
    };
  }, []);

  const backend = caps ? chooseBackend(caps, backendPref) : null;
  const busy = run.status === "preparing" || run.status === "running";
  const mode = BENCH_MODES[modeId];
  const preset = BENCH_PRESETS[presetId];

  const start = async () => {
    if (!caps || !backend || busy) return;
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setResult(null);
    setRun({ status: "preparing" });
    let renderer: DisposableRenderer | null = null;
    let used: BackendId = backend;
    let note: string | undefined;
    try {
      // A canvas holds one context type for life: use a fresh one per run.
      const canvas = document.createElement("canvas");
      canvas.className = "h-auto w-full rounded-[var(--radius-md)] bg-black";
      canvas.setAttribute("aria-label", "Тестовая сцена NexRig");
      previewRef.current?.replaceChildren(canvas);
      if (backend === "webgpu") {
        try {
          const { createWebGPURenderer } = await import("@/lib/browser-bench/webgpu");
          renderer = await createWebGPURenderer(canvas, preset);
        } catch (e) {
          if (!caps.webgl2.supported) throw e;
          note = `WebGPU не запустился (${e instanceof Error ? e.message : "ошибка"}) — использован WebGL2.`;
          used = "webgl2";
          const fresh = document.createElement("canvas");
          fresh.className = canvas.className;
          previewRef.current?.replaceChildren(fresh);
          const { createWebGL2Renderer } = await import("@/lib/browser-bench/webgl2");
          renderer = createWebGL2Renderer(fresh, preset);
        }
      } else {
        const { createWebGL2Renderer } = await import("@/lib/browser-bench/webgl2");
        renderer = createWebGL2Renderer(canvas, preset);
      }
      let lastUi = 0;
      const res = await runBenchmark({
        renderer,
        warmupMs: mode.warmupMs,
        measureMs: mode.measureMs,
        windows: mode.windows,
        signal: ctrl.signal,
        onProgress: (p) => {
          const t = performance.now();
          if (t - lastUi < 200) return;
          lastUi = t;
          setRun({ status: "running", phase: p.phase, elapsedMs: p.elapsedMs, totalMs: p.totalMs, frames: p.frames, fps: p.lastFps, backend: used, note });
        },
      });
      const info = caps[used];
      const { valid, issues } = assess(res.stats, { hidden: res.hidden, stalled: res.stalled, software: info.software });
      const done: BenchRun = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        version: BENCH_VERSION,
        backend: used,
        preset: preset.id,
        mode: mode.id,
        width: preset.width,
        height: preset.height,
        stats: res.stats,
        valid,
        issues,
        software: info.software,
        renderer: info.masked ? null : info.renderer,
        browser: caps.browser,
        os: caps.os,
        logicalCores: caps.logicalCores,
      };
      setResult(done);
      saveRun(done);
      setRun({ status: "idle" });
    } catch (e) {
      setRun(e instanceof BenchAborted ? { status: "stopped" } : { status: "error", message: e instanceof Error ? e.message : "Тест не запустился." });
    } finally {
      renderer?.dispose();
      if (ctrlRef.current === ctrl) ctrlRef.current = null;
    }
  };

  const stop = () => ctrlRef.current?.abort();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
      <div className="space-y-6">
      <section className="rounded-[var(--radius-xl)] bg-panel p-5 ring-1 ring-white/[0.06]">
        <h2 className="text-[16px] font-semibold">Возможности браузера</h2>
        <ul className="mt-2 space-y-2">
          <BackendRow name="WebGPU" info={caps?.webgpu} chosen={backend === "webgpu"} />
          <BackendRow name="WebGL2" info={caps?.webgl2} chosen={backend === "webgl2"} />
        </ul>
        {caps && (
          <dl className="mt-4 grid gap-y-1.5 text-[13px]">
            <div className="flex gap-2">
              <dt className="text-fg-3">Браузер и ОС:</dt>
              <dd>
                {caps.browser}, {caps.os}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-fg-3">Логических потоков:</dt>
              <dd>{caps.logicalCores ?? "неизвестно"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-fg-3">Память (приблизительно):</dt>
              <dd>{caps.deviceMemoryGb ? `≥ ${caps.deviceMemoryGb} ГБ (браузер округляет)` : "неизвестно"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-fg-3">Модель CPU, частоты, температура, питание:</dt>
              <dd>неизвестно — браузер не сообщает</dd>
            </div>
          </dl>
        )}
        {caps && !backend && (
          <p className="mt-3 flex items-start gap-1.5 text-[12px] text-bad" role="alert">
            <IconAlert width={14} height={14} className="mt-0.5 shrink-0" /> Ни WebGPU, ни WebGL2 недоступны — тест в этом браузере невозможен.
          </p>
        )}
      </section>

      <section className="rounded-[var(--radius-xl)] bg-panel p-5 ring-1 ring-white/[0.06]">
        <div className="grid gap-4">
          <div>
            <p className="mb-1 text-[11px] text-fg-3">Графический API</p>
            <Segmented<BackendId | "auto">
              size="sm"
              label="Графический API"
              value={backendPref}
              onChange={setBackendPref}
              options={[
                { value: "auto", label: "Авто" },
                { value: "webgpu", label: "WebGPU" },
                { value: "webgl2", label: "WebGL2" },
              ]}
            />
          </div>
          <div>
            <p className="mb-1 text-[11px] text-fg-3">Нагрузка</p>
            <Segmented<BenchPresetId> size="sm" label="Пресет нагрузки" value={presetId} onChange={setPresetId} options={Object.values(BENCH_PRESETS).map((p) => ({ value: p.id, label: p.label }))} />
            <p className="mt-1 text-[10.5px] text-fg-3">
              {preset.width}×{preset.height}, {preset.instances.toLocaleString("ru-RU")} объектов, {preset.iterations} итераций шейдера
            </p>
          </div>
          <div>
            <p className="mb-1 text-[11px] text-fg-3">Режим</p>
            <Segmented<BenchMode>
              size="sm"
              label="Режим теста"
              value={modeId}
              onChange={(m) => {
                setModeId(m);
                setAckLoad(false);
              }}
              options={[
                { value: "short", label: "Короткий" },
                { value: "stability", label: "Устойчивость" },
              ]}
            />
            <p className="mt-1 text-[10.5px] text-fg-3">{mode.label}: прогрев 3 с, затем измерение.</p>
          </div>
        </div>
        {modeId === "stability" && (
          <div className="mt-3 rounded-[var(--radius-md)] border border-warn/30 bg-warn-soft/40 p-2.5 text-[12px]">
            <p className="flex items-start gap-1.5">
              <IconAlert width={14} height={14} className="mt-0.5 shrink-0 text-warn" /> 60 секунд полной нагрузки на видеокарту: ноутбук может нагреться и шуметь, батарея разряжается быстрее. Тест можно остановить в любой момент.
            </p>
            <div className="mt-2">
              <Switch checked={ackLoad} onChange={setAckLoad} label="Понимаю, запустить тест устойчивости" />
            </div>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {busy ? (
            <Button variant="danger" onClick={stop}>
              Остановить
            </Button>
          ) : (
            <Button variant="primary" onClick={start} disabled={!backend || (modeId === "stability" && !ackLoad)}>
              Проверить этот компьютер
            </Button>
          )}
          <p className="text-[11.5px] text-fg-3">Не переключайте вкладку во время теста — браузер замедляет фоновые вкладки, и результат будет помечен недостоверным.</p>
        </div>

        {run.status === "running" && (
          <div className="mt-3 space-y-1.5" aria-live="polite">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px]">
              <span>
                {run.phase === "warmup" ? "Прогрев (не учитывается)" : "Измерение"} · {BACKEND_LABEL[run.backend]}
              </span>
              <span className="num text-fg-3">
                {(Math.min(run.elapsedMs, run.totalMs) / 1000).toFixed(1)} / {run.totalMs / 1000} с · кадров {run.frames}
                {run.fps ? ` · сейчас ≈ ${Math.round(run.fps)} кадр/с` : ""}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-panel-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((100 * run.elapsedMs) / run.totalMs)}>
              <div className={cx("h-full rounded-full", run.phase === "warmup" ? "bg-fg-3" : "bg-violet")} style={{ width: `${Math.min(100, (100 * run.elapsedMs) / run.totalMs)}%` }} />
            </div>
            {run.note && <p className="text-[11.5px] text-warn">{run.note}</p>}
          </div>
        )}
        {run.status === "preparing" && <p className="mt-3 text-[12px] text-fg-3">Подготовка сцены и компиляция шейдеров…</p>}
        {run.status === "stopped" && <p className="mt-3 text-[12px] text-fg-3">Тест остановлен — результат не сохранён.</p>}
        {run.status === "error" && (
          <p className="mt-3 flex items-start gap-1.5 text-[12px] text-bad" role="alert">
            <IconAlert width={14} height={14} className="mt-0.5 shrink-0" /> Тест не запустился: {run.message}
          </p>
        )}
      </section>
      </div>

      <div className="min-w-0 space-y-6">
        {/* Stage: the live test scene (or a placeholder before the first run). */}
        <div className="overflow-hidden rounded-[var(--radius-xl)] bg-[radial-gradient(120%_90%_at_50%_0%,#1d2338_0%,#0c0f18_70%)] ring-1 ring-white/[0.06]">
          <div ref={previewRef} className={cx("[&>canvas]:block [&>canvas]:h-auto [&>canvas]:w-full [&>canvas]:rounded-none", !busy && !result && "hidden")} />
          {!busy && !result && (
            <div className="grid aspect-video place-items-center p-6 text-center">
              <div>
                <p className="text-[18px] font-semibold">Здесь появится тестовая сцена</p>
                <p className="mt-1 text-[14px] text-fg-3">
                  {preset.instances.toLocaleString("ru-RU")} объектов · {preset.width}×{preset.height} · {mode.label.toLowerCase()}
                </p>
              </div>
            </div>
          )}
        </div>
        {result && <ResultView run={result} />}
      </div>
      </div>

      <section className="rounded-[var(--radius-xl)] bg-panel p-5 ring-1 ring-white/[0.06]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[16px] font-semibold">История на этом устройстве</h2>
          <Switch checked={consent} onChange={setBenchConsent} label="Сохранять историю в этом браузере" />
        </div>
        <p className="mt-1 text-[11.5px] text-fg-3">Хранится только в localStorage этого браузера и никуда не отправляется. Выключение удаляет сохранённую историю.</p>
        {consent && history.length > 0 && (
          <>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[520px] text-[12px]">
                <thead className="text-[11px] text-fg-3">
                  <tr>
                    <th className="py-1 text-left font-medium">Дата</th>
                    <th className="py-1 text-left font-medium">API · нагрузка · режим</th>
                    <th className="py-1 text-left font-medium">Медиана, кадр/с</th>
                    <th className="py-1 text-left font-medium">1% худших отрезков</th>
                    <th className="py-1 text-left font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="num py-1">{fmtDate(h.at)}</td>
                      <td className="py-1">
                        {BACKEND_LABEL[h.backend]} · {BENCH_PRESETS[h.preset]?.label ?? h.preset} · {h.mode === "short" ? "короткий" : "устойчивость"}
                        {h.version !== BENCH_VERSION && <span className="text-fg-3"> (версия {h.version})</span>}
                      </td>
                      <td className="num py-1 font-semibold">{h.stats.measured === false ? "—" : h.stats.medianFps}</td>
                      <td className="num py-1">{h.stats.measured === false ? "—" : h.stats.p1LowFps}</td>
                      <td className="py-1">{h.valid ? (h.issues.length ? "с замечаниями" : "достоверно") : "недостоверно"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button className="mt-2" size="sm" variant="ghost" onClick={clearHistory}>
              Очистить историю
            </Button>
          </>
        )}
      </section>
    </div>
  );
}

function ResultView({ run }: { run: BenchRun }) {
  const s = run.stats;
  // Interrupted before anything was measured (e.g. tab hidden during warm-up): no figures at all.
  if (!s.measured) {
    return (
      <section className="space-y-2 rounded-[var(--radius-xl)] bg-panel p-5 ring-1 ring-warn/40" aria-live="polite">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Измерение не выполнено</p>
          <Badge tone="warn">недостоверно</Badge>
        </div>
        <ul className="space-y-1 text-[12px]">
          {run.issues.map((i) => (
            <li key={i} className="flex items-start gap-1.5 text-warn">
              <IconAlert width={13} height={13} className="mt-0.5 shrink-0" /> {ISSUE_TEXT[i]}
            </li>
          ))}
        </ul>
        <p className="text-[11.5px] text-fg-3">Запустите тест заново и не переключайте вкладку до конца.</p>
      </section>
    );
  }
  const max = Math.max(...s.windowFps, 1);
  const metrics: [string, string][] = [
    ["Медиана", `${s.medianFps} кадр/с`],
    ["1% худших отрезков по 50 мс", `${s.p1LowFps} кадр/с`],
    ["Среднее (кадры / время)", `${s.meanFps} кадр/с`],
    ["Время кадра (медиана / 99%)", `${s.medianMs} / ${s.p99Ms} мс`],
    ["Разброс между отрезками (CV)", `${Math.round(s.cv * 100)}%`],
    ["Кадров / отрезков / время", `${s.frames} / ${s.batches} / ${(s.durationMs / 1000).toFixed(1)} с`],
  ];
  if (s.drift !== null) metrics.push(["Изменение к концу теста", `${s.drift >= 0 ? "+" : ""}${Math.round(s.drift * 100)}%`]);
  return (
    <section className="space-y-4 rounded-[var(--radius-xl)] bg-panel p-5 ring-1 ring-white/[0.06] md:p-6" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] text-fg-3">
            {BENCH_VERSION} · {BACKEND_LABEL[run.backend]} · {BENCH_PRESETS[run.preset].label} ({run.width}×{run.height}) · {run.mode === "short" ? "короткий тест" : "тест устойчивости"}
          </p>
          <p className="num mt-1 text-[56px] leading-none font-semibold tracking-tight">
            {s.medianFps} <span className="font-sans text-[17px] font-normal text-fg-3">кадр/с в тестовой сцене</span>
          </p>
        </div>
        <Badge tone={run.valid ? (run.issues.length ? "warn" : "cyan") : "warn"}>{run.valid ? (run.issues.length ? "с замечаниями" : "достоверно") : "недостоверно"}</Badge>
      </div>
      <p className="text-[11.5px] text-fg-3">Это производительность фиксированной WebGL/WebGPU-сцены NexRig в этом браузере, а не FPS в CS2, Cyberpunk или других установленных играх. Кадры рендерятся подряд с ожиданием завершения на GPU и замеряются отрезками не короче 50 мс (так меньше влияет округление таймера браузера); частота монитора не ограничивает результат.</p>
      {run.issues.length > 0 && (
        <ul className="space-y-1 text-[12px]">
          {run.issues.map((i) => (
            <li key={i} className="flex items-start gap-1.5 text-warn">
              <IconAlert width={13} height={13} className="mt-0.5 shrink-0" /> {ISSUE_TEXT[i]}
            </li>
          ))}
        </ul>
      )}
      <dl className="grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
        {metrics.map(([k, v]) => (
          <div key={k} className="rounded-[var(--radius-sm)] border border-line px-2 py-1.5">
            <dt className="text-fg-3">{k}</dt>
            <dd className="num font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {s.windowFps.length > 1 && (
        <div>
          <p className="mb-1 text-[11px] text-fg-3">Медиана по отрезкам теста, кадр/с</p>
          <div className="flex h-24 items-end gap-1.5" role="img" aria-label={`Медиана по отрезкам: ${s.windowFps.join(", ")} кадров в секунду`}>
            {s.windowFps.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="num text-[10.5px] text-fg-2">{Math.round(v)}</span>
                <div className="w-full rounded-t-[4px] bg-violet" style={{ height: `${Math.max(4, (v / max) * 64)}px` }} />
              </div>
            ))}
          </div>
        </div>
      )}
      <PublicComparison run={run} />
    </section>
  );
}

type Group = { verified: { count: number; medianFps: number | null }; unverified: { count: number }; items: { id: string; medianFps: number; status: string; gpuRenderer: string | null; browser: string | null; software: boolean }[]; total: number };

function PublicComparison({ run }: { run: BenchRun }) {
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [publishing, setPublishing] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/benchmark/browser-results?preset=${run.preset}&backend=${run.backend}&mode=${run.mode}&version=${encodeURIComponent(run.version)}`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
        setGroup(body as Group);
        setError(null);
      })
      .catch((e: Error) => !ctrl.signal.aborted && setError(e.message));
    return () => ctrl.abort();
  }, [run.preset, run.backend, run.mode, run.version, nonce]);
  return (
    <div className="rounded-[var(--radius-md)] border border-line p-3 text-[12px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Сравнение с опубликованными результатами (та же версия, нагрузка, API и режим)</p>
        <Button size="sm" onClick={() => setPublishing(true)} disabled={!run.valid}>
          Опубликовать результат…
        </Button>
      </div>
      {!run.valid && <p className="mt-1 text-fg-3">Недостоверный прогон опубликовать нельзя.</p>}
      {error ? (
        <p className="mt-1 text-fg-3">Сравнение недоступно: {error}</p>
      ) : !group ? (
        <p className="mt-1 text-fg-3">Загрузка…</p>
      ) : group.total === 0 ? (
        <p className="mt-1 text-fg-3">
          Проверенных совместимых результатов пока нет.{group.unverified.count > 0 && ` Ожидают проверки: ${group.unverified.count}.`}
        </p>
      ) : (
        <div className="mt-1 space-y-1">
          <p>
            Проверенные: {group.verified.count}
            {group.verified.medianFps !== null && `, медиана ${group.verified.medianFps} кадр/с`}
            {group.unverified.count > 0 && ` · ожидают проверки: ${group.unverified.count}`}
          </p>
          <p className="text-fg-3">Сравнение — только с результатами, которые проверил администратор; непроверенные не показываются и не учитываются. Программный рендеринг в медиану не входит.</p>
        </div>
      )}
      <PublishDialog run={run} open={publishing} onClose={() => setPublishing(false)} onDone={() => setNonce((n) => n + 1)} />
    </div>
  );
}

function PublishDialog({ run, open, onClose, onDone }: { run: BenchRun; open: boolean; onClose: () => void; onDone: () => void }) {
  const auth = useAuth();
  const showAuth = useAuthDialog((s) => s.show);
  const [withGpu, setWithGpu] = useState(false);
  const [state, setState] = useState<{ busy: boolean; message: string | null; ok: boolean }>({ busy: false, message: null, ok: false });
  const payload = {
    version: run.version,
    backend: run.backend,
    preset: run.preset,
    mode: run.mode,
    width: run.width,
    height: run.height,
    stats: {
      measured: run.stats.measured,
      frames: run.stats.frames,
      batches: run.stats.batches,
      durationMs: run.stats.durationMs,
      wallMs: run.stats.wallMs,
      medianMs: run.stats.medianMs,
      medianFps: run.stats.medianFps,
      meanFps: run.stats.meanFps,
      p1LowFps: run.stats.p1LowFps,
      cv: run.stats.cv,
      drift: run.stats.drift,
      windowFps: run.stats.windowFps,
    },
    issues: run.issues,
    software: run.software,
    gpuRenderer: withGpu ? run.renderer : null,
    browser: run.browser,
    os: run.os,
    logicalCores: run.logicalCores,
  };
  const publish = async () => {
    setState({ busy: true, message: null, ok: false });
    try {
      const res = await fetch("/api/benchmark/browser-results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), credentials: "same-origin" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setState({ busy: false, message: "Опубликовано со статусом «не проверено». Администратор проверит результат.", ok: true });
      onDone();
    } catch (e) {
      setState({ busy: false, message: e instanceof Error ? e.message : "Не удалось опубликовать.", ok: false });
    }
  };
  const rows: [string, string][] = [
    ["Версия теста, API, нагрузка, режим", `${run.version}, ${BACKEND_LABEL[run.backend]}, ${BENCH_PRESETS[run.preset].label}, ${run.mode === "short" ? "короткий" : "устойчивость"}`],
    ["Статистика", `медиана ${run.stats.medianFps}, 1% худших отрезков ${run.stats.p1LowFps}, среднее ${run.stats.meanFps} кадр/с; кадров ${run.stats.frames}, отрезков ${run.stats.batches}; CV ${run.stats.cv}`],
    ["Браузер и ОС", `${run.browser}, ${run.os}`],
    ["Логических потоков", String(run.logicalCores ?? "неизвестно")],
    ["Видеокарта", withGpu ? (run.renderer ?? "скрыта браузером — не отправляется") : "не отправляется"],
  ];
  return (
    <Dialog open={open} onClose={onClose} title="Опубликовать результат в NexRig" className="w-[min(560px,calc(100vw-24px))]">
      <div className="space-y-3 text-[12.5px]">
        <p className="text-fg-2">Будет опубликовано:</p>
        <dl className="space-y-1">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[160px_minmax(0,1fr)] gap-2">
              <dt className="text-fg-3">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <Switch checked={withGpu} onChange={setWithGpu} label="Публиковать название видеокарты" disabled={!run.renderer} />
        <p className="text-[11.5px] text-fg-3">Не отправляются: IP-адрес, местоположение, полный User-Agent, история тестов. Ваш аккаунт хранится только для модерации и не показывается. Результат получит статус «не проверено»; эталоном он станет только после проверки администратором.</p>
        {state.message && <p className={state.ok ? "text-ok" : "text-bad"}>{state.message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
          {auth.status === "signed-in" ? (
            <Button variant="primary" onClick={publish} disabled={state.busy || state.ok}>
              Опубликовать
            </Button>
          ) : (
            <Button variant="primary" onClick={() => showAuth("login")} disabled={auth.status === "unavailable"}>
              Войти, чтобы опубликовать
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
