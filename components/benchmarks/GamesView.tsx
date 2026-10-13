"use client";

import { useMemo, useState } from "react";
import { GAMES } from "@/data/games";
import { useMeasuredBenchmarks } from "@/features/benchmarks/measured-store";
import { useBuildDerived } from "@/features/build-state/derived";
import { useBuildStore } from "@/features/build-state/store";
import { getPerformance } from "@/lib/benchmark-engine/estimate";
import { hardwareRepository } from "@/lib/hardware/repository";
import { formatPrice, useMessages } from "@/lib/i18n";
import { benchmarkInputSchema } from "@/lib/validation/schemas";
import type { GameSettings } from "@/types/benchmark";
import type { GpuSpec } from "@/types/hardware";
import { Badge, Button, cx, EmptyState, Field, inputCls, SectionTitle, Segmented, Select } from "@/components/ui/primitives";
import { IconTrash } from "@/components/ui/icons";
import { FpsResult } from "./FpsResult";
import { PerformanceControls } from "./PerformanceControls";

type Vendor = "all" | "NVIDIA" | "AMD";

export function GamesView() {
  const t = useMessages();
  const { resolved } = useBuildDerived();
  const perf = useBuildStore((s) => s.perf);
  const setPerf = useBuildStore((s) => s.setPerf);
  const measured = useMeasuredBenchmarks((s) => s.records);
  const [vendor, setVendor] = useState<Vendor>("all");
  const game = GAMES.find((g) => g.id === perf.gameId);
  const cpu = resolved.cpu;

  const rows = useMemo(() => {
    // One row per chip (cheapest variant); partner cards share the chip's estimate.
    const byChip = new Map<string, GpuSpec>();
    for (const g of hardwareRepository.byCategory("gpu")) {
      const prev = byChip.get(g.chip);
      if (!prev || g.price.amountRub < prev.price.amountRub) byChip.set(g.chip, g);
    }
    return [...byChip.values()]
      .filter((g) => vendor === "all" || g.chipVendor === vendor)
      .map((gpu) => ({ gpu, r: getPerformance({ game, cpu, gpu, settings: perf.settings, measured }) }))
      .sort((a, b) => (b.r.kind === "unavailable" ? 0 : b.r.avgFps) - (a.r.kind === "unavailable" ? 0 : a.r.avgFps));
  }, [vendor, game, cpu, perf.settings, measured]);
  const max = Math.max(1, ...rows.map((x) => (x.r.kind === "unavailable" ? 0 : (x.r.kind === "estimated" ? x.r.rangeFps[1] : x.r.avgFps))));

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 px-4 py-6 md:px-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{t.nav.games}</h1>
        <p className="max-w-3xl text-sm text-fg-3">
          Встроенных проверенных замеров нет. Значения ниже — оценки модели относительной производительности с диапазоном ±25%, пока для точной конфигурации не добавлен реальный замер.
        </p>
      </header>

      <section className="rounded-[var(--radius-lg)] border border-line bg-panel p-4">
        <PerformanceControls
          layout="row"
          gameId={perf.gameId}
          settings={perf.settings}
          gpu={resolved.gpu}
          onGame={(gameId) => setPerf({ gameId })}
          onSettings={(settings) => setPerf({ settings })}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="space-y-3">
          <SectionTitle>Текущая сборка</SectionTitle>
          <p className="text-xs text-fg-3">
            {cpu?.name ?? "CPU не выбран"} · {resolved.gpu?.name ?? "GPU не выбрана"}
          </p>
          <FpsResult result={getPerformance({ game, cpu, gpu: resolved.gpu, settings: perf.settings, measured })} />
        </section>

        <section className="space-y-3">
          <SectionTitle
            aside={
              <Segmented<Vendor>
                size="sm"
                label="Производитель GPU"
                value={vendor}
                onChange={setVendor}
                options={[
                  { value: "all", label: "Все" },
                  { value: "NVIDIA", label: "NVIDIA" },
                  { value: "AMD", label: "AMD" },
                ]}
              />
            }
          >
            Сравнение видеокарт · {cpu?.name ?? "без CPU"}
          </SectionTitle>
          {!cpu ? (
            <EmptyState title="Выберите процессор">Без процессора оценка производительности невозможна.</EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-line">
              <table className="w-full min-w-[640px] text-xs">
                <thead className="bg-panel-2 text-left text-[11px] text-fg-3">
                  <tr>
                    <th className="px-3 py-2 font-medium">Видеокарта</th>
                    <th className="w-[40%] px-3 py-2 font-medium">FPS (среднее · диапазон)</th>
                    <th className="px-3 py-2 text-right font-medium">1% low</th>
                    <th className="px-3 py-2 font-medium">Тип</th>
                    <th className="px-3 py-2 text-right font-medium">Цена от</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map(({ gpu, r }) => {
                    const current = gpu.chip === resolved.gpu?.chip;
                    return (
                      <tr key={gpu.id} className={cx(current && "bg-violet-soft/40")}>
                        <td className="px-3 py-2">
                          <span className="font-medium">
                            {gpu.chipVendor === "NVIDIA" ? "GeForce" : "Radeon"} {gpu.chip}
                          </span>
                          {current && <span className="ml-2 text-[10px] text-violet">в сборке</span>}
                        </td>
                        <td className="px-3 py-2">
                          {r.kind === "unavailable" ? (
                            <span className="text-fg-3">—</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="relative h-2 flex-1 rounded-full bg-bg-1">
                                {r.kind === "estimated" && (
                                  <div className="absolute h-full rounded-full bg-violet/25" style={{ left: `${(r.rangeFps[0] / max) * 100}%`, width: `${((r.rangeFps[1] - r.rangeFps[0]) / max) * 100}%` }} />
                                )}
                                <div className={cx("absolute top-1/2 h-3 w-0.5 -translate-y-1/2", r.kind === "measured" ? "bg-cyan" : "bg-violet")} style={{ left: `${(r.avgFps / max) * 100}%` }} />
                              </div>
                              <span className="num w-24 shrink-0 text-right">
                                {r.kind === "estimated" ? `~${r.avgFps} · ${r.rangeFps[0]}–${r.rangeFps[1]}` : r.avgFps}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="num px-3 py-2 text-right text-fg-2">{r.kind === "unavailable" ? "—" : r.low1Fps ?? "—"}</td>
                        <td className="px-3 py-2">{r.kind !== "unavailable" && <Badge tone={r.kind === "measured" ? "cyan" : "violet"}>{r.kind === "measured" ? t.perf.measured : t.perf.estimated}</Badge>}</td>
                        <td className="num px-3 py-2 text-right text-fg-2">{formatPrice(gpu.price.amountRub)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <MeasuredSection />
    </div>
  );
}

function MeasuredSection() {
  const t = useMessages();
  const { resolved } = useBuildDerived();
  const perf = useBuildStore((s) => s.perf);
  const records = useMeasuredBenchmarks((s) => s.records);
  const add = useMeasuredBenchmarks((s) => s.add);
  const remove = useMeasuredBenchmarks((s) => s.remove);
  const [filterGame, setFilterGame] = useState("all");
  const [form, setForm] = useState({ avgFps: "", low1Fps: "", sourceLabel: "", sourceUrl: "", testDate: "", conditions: "", sampleCount: "3" });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const canAdd = Boolean(resolved.cpu && resolved.gpu);
  const name = (id: string) => hardwareRepository.byId(id)?.name ?? id;
  const shown = records.filter((r) => filterGame === "all" || r.gameId === filterGame);
  const settingsLabel = (s: GameSettings) => `${s.resolution} · ${t.perf.presets[s.preset]}${s.rayTracing ? " · RT" : ""}${s.upscaling !== "off" ? ` · ${t.perf.upscalingModes[s.upscaling]}` : ""}`;

  return (
    <section className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
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
            conditions: form.conditions.trim() || undefined,
            sampleCount: Number(form.sampleCount),
          });
          if (!parsed.success) {
            setError("Проверьте поля: FPS — положительное число, источник — минимум 2 символа, ссылка — корректный URL.");
            return;
          }
          const d = parsed.data;
          add({
            gameId: d.gameId,
            cpuId: d.cpuId,
            gpuId: d.gpuId,
            settings: d.settings,
            avgFps: d.avgFps,
            low1Fps: d.low1Fps,
            source: { kind: "user", label: d.sourceLabel, url: d.sourceUrl || undefined },
            testDate: d.testDate,
            conditions: d.conditions,
            sampleCount: d.sampleCount,
          });
          setError(null);
          setOk(true);
          setForm((f) => ({ ...f, avgFps: "", low1Fps: "" }));
        }}
      >
        <SectionTitle>Добавить свой замер</SectionTitle>
        <p className="text-[11.5px] leading-relaxed text-fg-3">
          Для текущей пары CPU/GPU и выбранных выше игры и настроек: {GAMES.find((g) => g.id === perf.gameId)?.title}, {settingsLabel(perf.settings)}. Замеры хранятся в этом браузере и заменяют оценку при точном совпадении.
        </p>
        {!canAdd && <p className="text-xs text-warn">Нужны процессор и видеокарта в сборке.</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Средний FPS">
            <input inputMode="decimal" required className={inputCls} value={form.avgFps} onChange={(e) => setForm({ ...form, avgFps: e.target.value })} />
          </Field>
          <Field label="1% low">
            <input inputMode="decimal" className={inputCls} value={form.low1Fps} onChange={(e) => setForm({ ...form, low1Fps: e.target.value })} />
          </Field>
        </div>
        <Field label="Источник">
          <input required placeholder="Мой прогон, CapFrameX" className={inputCls} value={form.sourceLabel} onChange={(e) => setForm({ ...form, sourceLabel: e.target.value })} />
        </Field>
        <Field label="Ссылка (необязательно)">
          <input type="url" className={inputCls} value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Дата теста" hint="Пусто — сегодня">
            <input type="date" className={inputCls} value={form.testDate} onChange={(e) => setForm({ ...form, testDate: e.target.value })} />
          </Field>
          <Field label="Прогонов">
            <input type="number" min={1} max={100} required className={inputCls} value={form.sampleCount} onChange={(e) => setForm({ ...form, sampleCount: e.target.value })} />
          </Field>
        </div>
        <Field label="Условия (сцена, драйвер)">
          <input className={inputCls} value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} />
        </Field>
        {error && <p className="text-xs text-bad" role="alert">{error}</p>}
        {ok && <p className="text-xs text-ok" role="status">Замер добавлен.</p>}
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
          Замеры · {shown.length}
        </SectionTitle>
        {shown.length === 0 ? (
          <EmptyState title="Проверенных замеров нет">
            BuildAI не выдумывает результаты тестов. Добавьте собственный замер или подключите источник бенчмарков — тогда вместо оценки будет показано измерение.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {shown.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-line bg-panel p-3 text-xs">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium">
                    {GAMES.find((g) => g.id === r.gameId)?.title} · <span className="num text-cyan">{r.avgFps} FPS</span>
                    {r.low1Fps ? <span className="num text-fg-3"> · 1% {r.low1Fps}</span> : null}
                  </p>
                  <p className="truncate text-fg-3">
                    {name(r.cpuId)} · {name(r.gpuId)} · {settingsLabel(r.settings)}
                  </p>
                  <p className="text-fg-3">
                    {r.source.url ? (
                      <a href={r.source.url} target="_blank" rel="noreferrer noopener" className="text-violet hover:underline">
                        {r.source.label}
                      </a>
                    ) : (
                      r.source.label
                    )}{" "}
                    · {r.testDate} · {r.sampleCount} прогон(а){r.conditions ? ` · ${r.conditions}` : ""}
                  </p>
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
