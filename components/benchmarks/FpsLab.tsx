"use client";

import Link from "next/link";
import { usePrice } from "@/features/settings/currency";
import { useMemo, useState } from "react";
import { GAMES } from "@/data/games";
import { useMeasuredBenchmarks } from "@/features/benchmarks/measured-store";
import { splitLabRecords } from "@/features/benchmarks/records";
import { requestInstall } from "@/features/build-state/install-action";
import { useBuildDerived } from "@/features/build-state/derived";
import { useSavedBuilds } from "@/features/build-state/saved-builds";
import { useBuildStore } from "@/features/build-state/store";
import { upgradeOptions } from "@/lib/agents/specialists";
import { getPerformance, memoryOf, targetVerdict, type MemoryConfig } from "@/lib/benchmark-engine/estimate";
import { fpsCaveats, LEVEL_LABEL, toFpsEstimate } from "@/lib/fps-engine/engine";
import { analyzeBalance } from "@/features/compatibility/balance";
import { BalancePanel } from "@/components/compatibility/BalancePanel";
import { hardwareRepository, resolveBuild } from "@/lib/hardware/repository";
import { useMessages } from "@/lib/i18n";
import { RESOLUTION_PIXELS, type FpsConfidenceLevel, type GameSettings, type GraphicsPreset, type PerformanceResult, type Resolution } from "@/types/benchmark";
import type { CpuSpec, GpuSpec } from "@/types/hardware";
import { ConflictDialog } from "@/components/builder/ConflictDialog";
import { Badge, Button, cx, EmptyState, Field, SectionTitle, Select } from "@/components/ui/primitives";
import { FpsBars } from "./FpsBars";
import { KIND_LABEL, KIND_TONE, TargetBadge } from "./FpsResult";
import { MeasuredRecords } from "./MeasuredRecords";
import { PerformanceControls } from "./PerformanceControls";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell, Surface } from "@/components/ui/studio";
import { FpsKpiBand } from "./FpsKpiBand";
import { useSourceStatuses, useVerifiedRecords } from "./useServerData";

const RESOLUTIONS: Resolution[] = ["1080p", "1440p", "4K"];
const PRESETS: GraphicsPreset[] = ["low", "medium", "high", "ultra"];
const LEVEL_TONE: Record<FpsConfidenceLevel, "cyan" | "violet" | "neutral" | "warn"> = { verified: "cyan", close: "violet", model: "neutral", insufficient: "neutral" };
const SOURCE_STATUS_LABEL = { active: "активен", not_configured: "не подключён", disabled: "отключён", error: "ошибка" } as const;

interface Rig {
  cpu?: CpuSpec;
  gpu?: GpuSpec;
  memory?: MemoryConfig;
  label: string;
}

/** Cheapest variant per GPU chip, for the alternative-GPU picker. */
function useChipOptions() {
  return useMemo(() => {
    const byChip = new Map<string, GpuSpec>();
    for (const g of hardwareRepository.byCategory("gpu")) {
      const prev = byChip.get(g.chip);
      if (!prev || g.price.amountRub < prev.price.amountRub) byChip.set(g.chip, g);
    }
    return [...byChip.values()].sort((a, b) => b.rasterIndex - a.rasterIndex);
  }, []);
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cx("rounded-[var(--radius-xl)] bg-panel p-5 ring-1 ring-white/[0.06]", className)}>{children}</section>;
}

function deltaText(a: PerformanceResult, b: PerformanceResult) {
  if (a.kind === "unavailable" || b.kind === "unavailable") return null;
  const d = b.avgFps - a.avgFps;
  const pct = Math.round((b.avgFps / a.avgFps - 1) * 100);
  return { d, pct, approximate: a.kind !== "measured" || b.kind !== "measured" };
}

export function FpsLab() {
  const formatPrice = usePrice();
  const t = useMessages();
  const { resolved, report } = useBuildDerived();
  const perf = useBuildStore((s) => s.perf);
  const selection = useBuildStore((s) => s.selection);
  const setPerf = useBuildStore((s) => s.setPerf);
  const ownRecords = useMeasuredBenchmarks((s) => s.records);
  const saved = useSavedBuilds((s) => s.builds);
  const chips = useChipOptions();
  const target = perf.targetFps ?? 144;
  const settings = perf.settings;
  const game = GAMES.find((g) => g.id === perf.gameId) ?? GAMES[0];

  const current: Rig = { cpu: resolved.cpu, gpu: resolved.gpu, memory: memoryOf(resolved.ram, resolved.ramCount), label: "Текущая сборка" };

  // Alternative: a saved build, or the current build with another GPU and/or CPU.
  const [altSaved, setAltSaved] = useState("");
  const [altGpu, setAltGpu] = useState("");
  const [altCpu, setAltCpu] = useState("");
  const alt: Rig | null = useMemo(() => {
    if (altSaved) {
      const b = saved.find((x) => x.id === altSaved);
      if (!b) return null;
      const r = resolveBuild(b.selection);
      return { cpu: r.cpu, gpu: r.gpu, memory: memoryOf(r.ram, r.ramCount), label: b.name };
    }
    if (!altGpu && !altCpu) return null;
    const gpu = altGpu ? (hardwareRepository.byId(altGpu) as GpuSpec | undefined) : resolved.gpu;
    const cpu = altCpu ? (hardwareRepository.byId(altCpu) as CpuSpec | undefined) : resolved.cpu;
    return { cpu, gpu, memory: current.memory, label: "Альтернатива" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [altSaved, altGpu, altCpu, saved, resolved]);

  const server = useVerifiedRecords([current.gpu?.id, alt?.gpu?.id]);
  const sources = useSourceStatuses();
  // Only verified records from the NexRig base go into the calculation. The user's own (local,
  // unverified) records are shown next to it, never counted as a confirmed test.
  const { forCalculation: measured, ownMatching } = splitLabRecords(ownRecords, server.records, { gameId: game.id, cpuId: current.cpu?.id, gpuId: current.gpu?.id, settings });
  const perfFor = (rig: Rig, g = game, s: GameSettings = settings) => getPerformance({ game: g, cpu: rig.cpu, gpu: rig.gpu, settings: s, measured, memory: rig.memory });
  const main = perfFor(current);
  const altMain = alt ? perfFor(alt) : null;

  const provenance = toFpsEstimate(main, game);
  const presetGroups = PRESETS.map((preset) => ({
    label: t.perf.presets[preset],
    values: [perfFor(current, game, { ...settings, preset }), ...(alt ? [perfFor(alt, game, { ...settings, preset })] : [])],
  }));
  const balance = analyzeBalance(resolved, settings);

  const resolutionGroups = RESOLUTIONS.map((res) => ({
    label: res,
    values: [perfFor(current, game, { ...settings, resolution: res }), ...(alt ? [perfFor(alt, game, { ...settings, resolution: res })] : [])],
  }));

  // The React Compiler memoizes this; no manual useMemo needed.
  const upgrades = (() => {
    const { current: cur, options } = upgradeOptions(selection, game, settings);
    return {
      cur,
      top: options
        .filter((o) => o.gainPct !== null && o.gainPct >= 5 && o.compatibility !== "incompatible")
        .sort((a, b) => (b.gainPct ?? 0) - (a.gainPct ?? 0))
        .slice(0, 3),
    };
  })();

  const cpuOptions = hardwareRepository.byCategory("cpu").sort((a, b) => b.gamingIndex - a.gamingIndex);
  const bottleneckAdvice =
    main.kind === "estimated" || main.kind === "calibrated"
      ? main.bottleneck === "gpu"
        ? `Видеокарта упирается в свой предел (~${main.gpuBoundFps} FPS), процессор мог бы дать ~${main.cpuBoundFps}. Наибольший прирост даст более быстрая видеокарта или апскейлинг.`
        : main.bottleneck === "cpu"
          ? `Процессор и память ограничивают FPS (~${main.cpuBoundFps}), видеокарта могла бы дать ~${main.gpuBoundFps}. Повышение разрешения или настроек почти не снизит FPS; прирост даст более быстрый CPU${resolved.ramCount === 1 ? " и второй модуль памяти" : ""}.`
          : "CPU и видеокарта загружены сбалансированно — прирост потребует апгрейда обоих или снижения настроек."
      : null;

  const rig: [string, string | undefined][] = [
    ["Процессор", resolved.cpu?.name],
    ["Видеокарта", resolved.gpu?.name],
    ["Память", resolved.ram ? `${resolved.ramCount} × ${resolved.ram.moduleSizeGb} ГБ ${resolved.ram.type}-${resolved.ram.speedMtps}` : undefined],
  ];
  return (
    <PageShell className="space-y-8">
      <PageHeader
        section="Производительность"
        title="FPS Lab"
        description="Ожидаемая производительность вашей сборки в играх: средний FPS, 1% low и узкое место — с честной пометкой, где замер, а где расчёт модели."
        aside={
          <Surface as="div" className="grid w-full gap-x-8 gap-y-3 p-4 sm:w-auto sm:grid-cols-[repeat(3,minmax(0,auto))_auto] sm:items-end">
            {rig.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <p className="eyebrow">{k}</p>
                <p className={cx("max-w-[220px] truncate text-[14px] font-medium", !v && "text-fg-3 italic")}>{v ?? "не выбрано"}</p>
              </div>
            ))}
            <Link href="/builder" className="text-[13px] text-violet hover:underline">
              Изменить
            </Link>
          </Surface>
        }
      />

      <Surface className="p-5 md:p-6" aria-label="Сценарий">
        <PerformanceControls
          layout="row"
          gameId={perf.gameId}
          settings={settings}
          gpu={resolved.gpu}
          onGame={(gameId) => setPerf({ gameId })}
          onSettings={(s) => setPerf({ settings: s })}
          target={target}
          onTarget={(targetFps) => setPerf({ targetFps })}
        />
      </Surface>

      {fpsCaveats(report.checks).slice(0, 2).map((c) => (
        <p key={c} role="alert" className="rounded-[var(--radius-lg)] border border-bad/40 bg-bad-soft p-3 text-[13px] text-bad">
          {c}
        </p>
      ))}

      <FpsKpiBand result={main} target={target} scenario={`${game.title} · ${RESOLUTION_PIXELS[settings.resolution]} · ${t.perf.presets[settings.preset]}`} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 self-start md:grid-cols-2">
          <Panel>
            <FpsBars caption="Разрешения · средний FPS (линия — диапазон)" groups={resolutionGroups} series={[{ key: "cur", label: current.label }, ...(alt ? [{ key: "alt", label: alt.label }] : [])]} target={target} />
          </Panel>
          <Panel>
            <FpsBars caption={`Пресеты · ${settings.resolution}`} groups={presetGroups} series={[{ key: "cur", label: current.label }, ...(alt ? [{ key: "alt", label: alt.label }] : [])]} target={target} />
          </Panel>
          {bottleneckAdvice && (
            <Panel className="text-[14px] leading-relaxed text-fg-2 md:col-span-2">
              <p className="eyebrow mb-1.5">Узкое место</p>
              {bottleneckAdvice}
            </Panel>
          )}
        </div>
        <div className="space-y-6">
          <Panel className="space-y-2 text-[12px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Происхождение результата</p>
              <Badge tone={LEVEL_TONE[provenance.level]}>{LEVEL_LABEL[provenance.level]}</Badge>
            </div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
              <dt className="text-fg-3">Источник</dt>
              <dd className="text-fg-2">
                {provenance.sources.length === 0 ? (
                  (provenance.dataSource ?? "—")
                ) : (
                  <ul className="space-y-0.5">
                    {provenance.sources.map((s, i) => (
                      <li key={`${s.url ?? s.label}-${s.date}-${i}`}>
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noreferrer noopener nofollow" className="text-violet hover:underline">
                            {s.label}
                          </a>
                        ) : (
                          s.label
                        )}
                        <span className="text-fg-3">
                          {" "}
                          · {s.date}
                          {s.community ? " · замер пользователя, проверен" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
              <dt className="text-fg-3">Дата теста</dt>
              <dd className="text-fg-2">{provenance.benchmarkDate ?? "— (не замер)"}</dd>
              <dt className="text-fg-3">Версия игры</dt>
              <dd className="text-fg-2">{provenance.gameVersion ?? "неизвестна"}</dd>
              <dt className="text-fg-3">Метод</dt>
              <dd className="text-fg-2">{provenance.calculationMethod}</dd>
            </dl>
            <ul className="list-disc space-y-0.5 pl-4 text-[11.5px] text-fg-3">
              {provenance.confidenceReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {server.error && <p className="text-[11px] text-warn">База NexRig недоступна ({server.error}) — расчёт без её замеров.</p>}
            {ownMatching.length > 0 && (
              <div className="rounded-[var(--radius-sm)] border border-dashed border-line p-2 text-[11.5px]">
                <p className="font-medium text-fg-2">Ваши замеры этой конфигурации — не проверены, в расчёт не входят</p>
                <ul className="mt-1 space-y-0.5 text-fg-3">
                  {ownMatching.map((r) => (
                    <li key={r.id}>
                      {r.avgFps} FPS{r.low1Fps ? `, 1% low ${r.low1Fps}` : ""} · {r.testDate} · {r.source.label}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-fg-3">Отправьте замер на проверку в разделе ниже — после подтверждения администратором он попадёт в общую базу.</p>
              </div>
            )}
          </Panel>
          <Panel>
            <SectionTitle>Наибольший прирост · {game.title}</SectionTitle>
            {upgrades.top.length === 0 ? (
              <p className="mt-2 text-xs text-fg-3">Апгрейдов с оценочным приростом ≥5% не найдено (или в сборке нет CPU/GPU).</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {upgrades.top.map((o) => (
                  <li key={o.component.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-[12.5px]">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{o.component.name}</p>
                      <p className="num text-[11px] text-fg-3">
                        {upgrades.cur} → ~{o.fps} FPS · <span className="text-ok">+{o.gainPct}%</span> · {formatPrice(o.priceRub)}
                        {o.notes.length ? ` · ${o.notes.join("; ")}` : ""}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => requestInstall(o.component)}>
                      Установить
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[10.5px] text-fg-3">Прирост — оценка модели; сравнение приблизительное.</p>
          </Panel>
        </div>
      </div>

      <Panel>
        <BalancePanel report={balance} />
      </Panel>

      <Link href="/benchmark" className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-xl)] bg-violet-soft/40 px-5 py-4 text-[14px] ring-1 ring-violet/30 hover:ring-violet/50">
        <span>
          <span className="font-semibold">NexRig Benchmark</span>
          <span className="text-fg-2"> — анализ всех игр и разрешений с источниками или реальный замер WebGPU/WebGL2 в вашем браузере.</span>
        </span>
        <span className="text-violet">Открыть →</span>
      </Link>

      <section className="space-y-3">
        <SectionTitle>Все игры · {RESOLUTION_PIXELS[settings.resolution]}, {t.perf.presets[settings.preset]}</SectionTitle>
        {!resolved.cpu || !resolved.gpu ? (
          <EmptyState title="Недостаточно данных для точной оценки">Добавьте процессор и видеокарту в сборку.</EmptyState>
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {GAMES.map((g) => {
              const r = perfFor(current, g);
              const active = g.id === game.id;
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setPerf({ gameId: g.id })}
                    aria-pressed={active}
                    className={cx(
                      "w-full rounded-[var(--radius-md)] border p-3 text-left transition-colors",
                      active ? "border-violet/60 bg-violet-soft/40" : "border-line bg-panel hover:border-line-strong",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[13px] leading-tight font-semibold">{g.title}</span>
                      {r.kind !== "unavailable" && <Badge tone={KIND_TONE[r.kind]}>{KIND_LABEL[r.kind].split(" ")[0]}</Badge>}
                    </div>
                    {r.kind === "unavailable" ? (
                      <p className="mt-2 text-xs text-fg-3">Недостаточно данных</p>
                    ) : (
                      <>
                        <p className="num mt-2 text-2xl font-semibold">
                          {r.kind === "measured" ? "" : "~"}
                          {r.avgFps}
                          <span className="ml-1 text-[11px] font-normal text-fg-3">{r.rangeFps ? `${r.rangeFps[0]}–${r.rangeFps[1]}` : ""}</span>
                        </p>
                        <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[11px]">
                          <TargetBadge result={r} target={target} />
                          {r.kind !== "measured" && <span className="text-fg-3">{r.bottleneck === "gpu" ? "GPU-bound" : r.bottleneck === "cpu" ? "CPU-bound" : "смешанный"}</span>}
                        </div>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Panel>
        <SectionTitle>Сравнение с альтернативой</SectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Сохранённая сборка">
            <Select
              label="Сохранённая сборка"
              value={altSaved}
              onChange={(v) => {
                setAltSaved(v);
                setAltGpu("");
                setAltCpu("");
              }}
              options={[{ value: "", label: saved.length ? "— не выбрана —" : "нет сохранённых" }, ...saved.map((b) => ({ value: b.id, label: b.name }))]}
            />
          </Field>
          <Field label="Или другая видеокарта">
            <Select
              label="Другая видеокарта"
              value={altGpu}
              onChange={(v) => {
                setAltGpu(v);
                setAltSaved("");
              }}
              options={[{ value: "", label: "— как в сборке —" }, ...chips.map((g) => ({ value: g.id, label: `${g.chipVendor === "NVIDIA" ? "GeForce" : "Radeon"} ${g.chip}` }))]}
            />
          </Field>
          <Field label="И/или другой процессор">
            <Select
              label="Другой процессор"
              value={altCpu}
              onChange={(v) => {
                setAltCpu(v);
                setAltSaved("");
              }}
              options={[{ value: "", label: "— как в сборке —" }, ...cpuOptions.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </Field>
        </div>
        {alt && altMain ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12.5px]">
              <thead className="text-left text-[11px] text-fg-3">
                <tr>
                  <th className="py-1.5 font-medium">Игра</th>
                  <th className="py-1.5 text-right font-medium">{current.label}</th>
                  <th className="py-1.5 text-right font-medium">{alt.label}</th>
                  <th className="py-1.5 text-right font-medium">Разница</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {GAMES.map((g) => {
                  const a = perfFor(current, g);
                  const b = perfFor(alt, g);
                  const d = deltaText(a, b);
                  return (
                    <tr key={g.id}>
                      <td className="py-1.5">{g.title}</td>
                      <td className="num py-1.5 text-right">{a.kind === "unavailable" ? "—" : `~${a.avgFps}`}</td>
                      <td className="num py-1.5 text-right">{b.kind === "unavailable" ? "—" : `~${b.avgFps}`}</td>
                      <td className={cx("num py-1.5 text-right", d && d.d > 0 ? "text-ok" : d && d.d < 0 ? "text-bad" : "text-fg-3")}>
                        {d ? `${d.d > 0 ? "+" : ""}${d.d} (${d.pct > 0 ? "+" : ""}${d.pct}%)` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-[10.5px] text-fg-3">
              {deltaText(main, altMain)?.approximate ?? true ? "Сравнение приблизительное: хотя бы одна сторона — оценка модели, а не замер." : "Обе стороны — реальные замеры."}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-fg-3">Выберите сохранённую сборку или замените видеокарту/процессор, чтобы увидеть разницу по каждой игре.</p>
        )}
      </Panel>

      <MeasuredRecords />

      <Panel>
        <SectionTitle aside={sources.data ? <span className="text-[11px] text-fg-3">Проверенных замеров в базе: {sources.data.verifiedRecords}</span> : undefined}>Источники данных</SectionTitle>
        {sources.error && <p className="mt-2 text-[11.5px] text-warn">Не удалось получить статусы источников ({sources.error}).</p>}
        {!sources.data && !sources.error && <p className="mt-2 text-[11.5px] text-fg-3">Проверяем источники…</p>}
        <ul className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          <li className="rounded-[var(--radius-md)] border border-line bg-panel-2/60 p-3 text-[12px]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">Открытые замеры пользователей</span>
              <Badge tone="cyan">активен</Badge>
            </div>
            <p className="mt-1.5 leading-relaxed text-fg-3">Реальные результаты, которые пользователи NexRig отправляют ниже. После проверки администратором они видны всем и используются в расчётах.</p>
          </li>
          {sources.data?.items.map((src) => (
            <li key={src.id} className="rounded-[var(--radius-md)] border border-line bg-panel-2/60 p-3 text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{src.name}</span>
                <Badge tone={src.status === "active" ? "cyan" : src.status === "error" ? "warn" : "neutral"}>{SOURCE_STATUS_LABEL[src.status]}</Badge>
              </div>
              <p className="mt-1.5 leading-relaxed text-fg-3">{src.description}</p>
              {src.errorMessage && <p className="mt-1 text-[11px] text-bad">{src.errorMessage}</p>}
              {src.baseUrl && (
                <a href={src.baseUrl} target="_blank" rel="noreferrer noopener" className="mt-1 inline-block text-[11px] text-violet hover:underline">
                  {new URL(src.baseUrl).hostname}
                </a>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-fg-3">
          Целевой FPS «держит» только если нижняя граница диапазона не ниже цели: {targetVerdict(main, target) ? "оценка учитывает неопределённость." : "оценка недоступна."}
        </p>
      </Panel>
      <ConflictDialog />
    </PageShell>
  );
}
