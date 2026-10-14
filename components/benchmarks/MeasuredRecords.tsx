"use client";

import { useState } from "react";
import { GAMES } from "@/data/games";
import { useMeasuredBenchmarks } from "@/features/benchmarks/measured-store";
import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore } from "@/features/build-state/store";
import { hardwareRepository } from "@/lib/hardware/repository";
import { useMessages } from "@/lib/i18n";
import { benchmarkInputSchema } from "@/lib/validation/schemas";
import { RESOLUTION_PIXELS, type GameSettings } from "@/types/benchmark";
import { IconTrash } from "@/components/ui/icons";
import { Button, EmptyState, Field, inputCls, SectionTitle, Select } from "@/components/ui/primitives";

const EMPTY = { avgFps: "", low1Fps: "", sourceLabel: "", sourceUrl: "", testDate: "", gameVersion: "", testConfig: "", method: "", conditions: "", notes: "", sampleCount: "3" };

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

/** User-entered real measurements (stored in this browser). Exact matches replace estimates. */
export function MeasuredRecords() {
  const t = useMessages();
  const { resolved } = useBuildDerived();
  const perf = useBuildStore((s) => s.perf);
  const records = useMeasuredBenchmarks((s) => s.records);
  const add = useMeasuredBenchmarks((s) => s.add);
  const remove = useMeasuredBenchmarks((s) => s.remove);
  const [filterGame, setFilterGame] = useState("all");
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const canAdd = Boolean(resolved.cpu && resolved.gpu);
  const name = (id: string) => hardwareRepository.byId(id)?.name ?? id;
  const shown = records.filter((r) => filterGame === "all" || r.gameId === filterGame);
  const label = (s: GameSettings) => settingsLabel(s, t.perf.presets, t.perf.upscalingModes);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const opt = (v: string) => v.trim() || undefined;

  return (
    <section className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]" aria-label="Реальные замеры">
      <form
        className="space-y-3 rounded-[var(--radius-lg)] border border-line bg-panel p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setOk(false);
          if (!resolved.cpu || !resolved.gpu) return;
          const parsed = benchmarkInputSchema.safeParse({
            gameId: perf.gameId,
            cpuId: resolved.cpu.id,
            gpuId: resolved.gpu.id,
            settings: perf.settings,
            avgFps: Number(form.avgFps),
            low1Fps: form.low1Fps ? Number(form.low1Fps) : undefined,
            sourceLabel: form.sourceLabel.trim(),
            sourceUrl: form.sourceUrl.trim(),
            // Empty date means "today"; resolved at submit time rather than during render.
            testDate: form.testDate || new Date().toISOString().slice(0, 10),
            gameVersion: opt(form.gameVersion),
            testConfig: opt(form.testConfig),
            method: opt(form.method),
            conditions: opt(form.conditions),
            notes: opt(form.notes),
            sampleCount: Number(form.sampleCount),
          });
          if (!parsed.success) {
            setError("Проверьте поля: FPS — положительное число, источник — минимум 2 символа, ссылка — корректный URL.");
            return;
          }
          const d = parsed.data;
          add({
            gameId: d.gameId,
            gameVersion: d.gameVersion,
            cpuId: d.cpuId,
            gpuId: d.gpuId,
            settings: d.settings,
            avgFps: d.avgFps,
            low1Fps: d.low1Fps,
            source: { kind: "user", label: d.sourceLabel, url: d.sourceUrl || undefined },
            testDate: d.testDate,
            testConfig: d.testConfig,
            method: d.method,
            conditions: d.conditions,
            notes: d.notes,
            sampleCount: d.sampleCount,
          });
          setError(null);
          setOk(true);
          setForm((f) => ({ ...f, avgFps: "", low1Fps: "" }));
        }}
      >
        <SectionTitle>Добавить реальный замер</SectionTitle>
        <p className="text-[11.5px] leading-relaxed text-fg-3">
          Для текущей пары CPU/GPU, игры «{GAMES.find((g) => g.id === perf.gameId)?.title}» и настроек: {label(perf.settings)}. Замеры хранятся в этом браузере, заменяют оценку при точном совпадении и калибруют модель для этой видеокарты.
        </p>
        {!canAdd && <p className="text-xs text-warn">Нужны процессор и видеокарта в сборке.</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Средний FPS">
            <input inputMode="decimal" required className={inputCls} value={form.avgFps} onChange={set("avgFps")} />
          </Field>
          <Field label="1% low">
            <input inputMode="decimal" className={inputCls} value={form.low1Fps} onChange={set("low1Fps")} />
          </Field>
        </div>
        <Field label="Источник">
          <input required placeholder="Мой прогон" className={inputCls} value={form.sourceLabel} onChange={set("sourceLabel")} />
        </Field>
        <Field label="Ссылка (необязательно)">
          <input type="url" className={inputCls} value={form.sourceUrl} onChange={set("sourceUrl")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Дата теста" hint="Пусто — сегодня">
            <input type="date" className={inputCls} value={form.testDate} onChange={set("testDate")} />
          </Field>
          <Field label="Прогонов">
            <input type="number" min={1} max={100} required className={inputCls} value={form.sampleCount} onChange={set("sampleCount")} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Версия игры">
            <input className={inputCls} value={form.gameVersion} onChange={set("gameVersion")} />
          </Field>
          <Field label="Метод">
            <input placeholder="CapFrameX, 60 с" className={inputCls} value={form.method} onChange={set("method")} />
          </Field>
        </div>
        <Field label="Тестовая конфигурация">
          <input placeholder="RAM, драйвер, ОС" className={inputCls} value={form.testConfig} onChange={set("testConfig")} />
        </Field>
        <Field label="Сцена и условия">
          <input className={inputCls} value={form.conditions} onChange={set("conditions")} />
        </Field>
        <Field label="Примечания">
          <input className={inputCls} value={form.notes} onChange={set("notes")} />
        </Field>
        {error && (
          <p className="text-xs text-bad" role="alert">
            {error}
          </p>
        )}
        {ok && (
          <p className="text-xs text-ok" role="status">
            Замер добавлен.
          </p>
        )}
        <Button type="submit" variant="primary" disabled={!canAdd} className="w-full">
          Сохранить замер
        </Button>
      </form>

      <div className="space-y-3">
        <SectionTitle
          aside={
            <div className="w-52">
              <Select label="Фильтр по игре" value={filterGame} onChange={setFilterGame} options={[{ value: "all", label: "Все игры" }, ...GAMES.map((g) => ({ value: g.id, label: g.title }))]} />
            </div>
          }
        >
          Реальные замеры · {shown.length}
        </SectionTitle>
        {shown.length === 0 ? (
          <EmptyState title="Проверенных замеров нет">
            Встроенных результатов тестирования нет, и приложение их не выдумывает. Добавьте собственный замер — он заменит оценку для точной конфигурации и откалибрует модель для этой видеокарты.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {shown.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-line bg-panel p-3 text-xs">
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
                    {r.source.url ? (
                      <a href={r.source.url} target="_blank" rel="noreferrer noopener" className="text-violet hover:underline">
                        {r.source.label}
                      </a>
                    ) : (
                      r.source.label
                    )}{" "}
                    · {r.testDate} · {r.sampleCount} прогон(а)
                    {r.method ? ` · ${r.method}` : ""}
                    {r.testConfig ? ` · ${r.testConfig}` : ""}
                    {r.conditions ? ` · ${r.conditions}` : ""}
                  </p>
                  {r.notes && <p className="text-fg-3 italic">{r.notes}</p>}
                </div>
                <Button size="sm" variant="danger" onClick={() => remove(r.id)} aria-label="Удалить замер">
                  <IconTrash width={13} height={13} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
