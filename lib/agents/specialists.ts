import { GAMES } from "@/data/games";
import { checkBuild, evaluateCandidate } from "@/features/compatibility/engine";
import { getPerformance, memoryOf } from "@/lib/benchmark-engine/estimate";
import { estimatePeakPower, recommendedPsuWattage } from "@/lib/hardware/power";
import { hardwareRepository, resolveBuild, totalPrice, type ResolvedBuild } from "@/lib/hardware/repository";
import { formatPrice, getMessages } from "@/lib/i18n";
import { cpuValue, gpuValue, rubPerPoint } from "@/lib/pricing/value";
import type { AgentResult } from "@/types/agents";
import type { BenchmarkRecord, Game, GameSettings, PerformanceResult } from "@/types/benchmark";
import type { BuildSelection } from "@/types/build";
import type { CpuSpec, GpuSpec } from "@/types/hardware";

const DATASET_SOURCE = "Локальный демо-набор спецификаций (data/components.ts), не живая база";
const MODEL_SOURCE = "Модель относительной производительности v0.1 (lib/benchmark-engine) — оценки, не замеры";
const PRICE_SOURCE = "Демо-цены от 2026-10-01 (не предложения магазинов)";

function describePerf(r: PerformanceResult) {
  if (r.kind === "unavailable") return r.reason;
  if (r.kind === "measured") return `${r.avgFps} FPS (замер, ${r.records.length} зап.)`;
  return `~${r.avgFps} FPS (оценка, диапазон ${r.rangeFps[0]}–${r.rangeFps[1]})`;
}

export function compatibilityAgent(selection: BuildSelection): AgentResult {
  const report = checkBuild(selection);
  const t = getMessages().status;
  const problems = report.checks.filter((c) => c.status !== "compatible");
  return {
    agent: "compatibility",
    title: "Агент совместимости",
    summary:
      problems.length === 0
        ? `Все ${report.checks.length} проверок пройдены.`
        : `Итог: ${t[report.overall].toLowerCase()}. Несовместимо: ${report.counts.incompatible}, требует проверки: ${report.counts.warning}, недостаточно данных: ${report.counts.unknown}.`,
    findings: problems.map((c) => ({
      severity: c.status === "incompatible" ? "critical" : c.status === "warning" ? "warning" : "info",
      text: `${c.title}: ${c.detail}${c.resolution ? ` Решение: ${c.resolution}` : ""}`,
    })),
    toolCalls: [
      {
        tool: "compatibility.checkBuild",
        input: Object.values(selection).flat().filter(Boolean).join(", "),
        outputSummary: `${report.checks.length} проверок, итог «${t[report.overall]}»`,
      },
    ],
    dataSources: [DATASET_SOURCE],
  };
}

export function benchmarkAgent(
  build: ResolvedBuild,
  game: Game,
  settings: GameSettings,
  measured: BenchmarkRecord[],
): AgentResult {
  const main = getPerformance({ game, cpu: build.cpu, gpu: build.gpu, settings, measured, memory: memoryOf(build.ram, build.ramCount) });
  const others = GAMES.filter((g) => g.id !== game.id).map((g) => ({
    g,
    r: getPerformance({ game: g, cpu: build.cpu, gpu: build.gpu, settings, measured, memory: memoryOf(build.ram, build.ramCount) }),
  }));
  const usedMeasured = main.kind === "measured" || others.some((o) => o.r.kind === "measured");
  const settingsLabel = `${settings.resolution}, ${getMessages().perf.presets[settings.preset]}${settings.rayTracing ? ", RT" : ""}${settings.upscaling !== "off" ? `, апскейлинг ${settings.upscaling}` : ""}`;
  return {
    agent: "benchmark",
    title: "Агент бенчмарков",
    summary: `${game.title} (${settingsLabel}): ${describePerf(main)}.`,
    findings: [
      ...(main.kind === "estimated"
        ? [
            { severity: "info" as const, text: `Ограничивающий компонент: ${getMessages().perf.bottlenecks[main.bottleneck].toLowerCase()}.` },
            { severity: "warning" as const, text: "Проверенных замеров для этой конфигурации нет — показана оценка модели с низкой достоверностью." },
          ]
        : []),
      ...others.map((o) => ({ severity: "info" as const, text: `${o.g.title}: ${describePerf(o.r)}` })),
    ],
    toolCalls: [
      {
        tool: "benchmarks.getPerformance",
        input: `${game.id} · ${build.cpu?.id ?? "—"} · ${build.gpu?.id ?? "—"} · ${settingsLabel}`,
        outputSummary: describePerf(main),
      },
      {
        tool: "benchmarks.getPerformance ×" + others.length,
        input: "остальные игры, те же настройки",
        outputSummary: `${others.filter((o) => o.r.kind !== "unavailable").length} результатов`,
      },
    ],
    dataSources: [
      MODEL_SOURCE,
      usedMeasured ? "Пользовательские замеры, сохранённые в браузере" : "Пользовательских замеров для этой пары нет",
    ],
  };
}

export interface UpgradeOption {
  kind: "gpu" | "cpu";
  component: GpuSpec | CpuSpec;
  fps: number | null;
  gainPct: number | null;
  priceRub: number;
  rubPerFps: number | null;
  compatibility: ReturnType<typeof evaluateCandidate>["status"];
  notes: string[];
}

export function upgradeOptions(selection: BuildSelection, game: Game, settings: GameSettings): { current: number | null; options: UpgradeOption[] } {
  const build = resolveBuild(selection);
  const cur = getPerformance({ game, cpu: build.cpu, gpu: build.gpu, settings, measured: [], memory: memoryOf(build.ram, build.ramCount) });
  const current = cur.kind === "unavailable" ? null : cur.avgFps;
  const options: UpgradeOption[] = [];

  // One candidate per GPU chip: the cheapest variant that is not incompatible with this build.
  const byChip = new Map<string, { gpu: GpuSpec; verdict: ReturnType<typeof evaluateCandidate> }>();
  for (const gpu of hardwareRepository.byCategory("gpu")) {
    if (gpu.chip === build.gpu?.chip) continue;
    const verdict = evaluateCandidate(selection, gpu);
    const prev = byChip.get(gpu.chip);
    const better =
      !prev ||
      (prev.verdict.status === "incompatible" && verdict.status !== "incompatible") ||
      ((prev.verdict.status === "incompatible") === (verdict.status === "incompatible") && gpu.price.amountRub < prev.gpu.price.amountRub);
    if (better) byChip.set(gpu.chip, { gpu, verdict });
  }

  for (const { gpu, verdict } of byChip.values()) {
    const perf = getPerformance({ game, cpu: build.cpu, gpu, settings, measured: [], memory: memoryOf(build.ram, build.ramCount) });
    const fps = perf.kind === "unavailable" ? null : perf.avgFps;
    const notes: string[] = [];
    const psuNeed = recommendedPsuWattage({ ...build, gpu });
    if (build.psu && psuNeed && build.psu.wattage < psuNeed) notes.push(`Нужен БП от ${psuNeed} Вт`);
    if (perf.kind === "estimated" && perf.bottleneck === "cpu") notes.push("Упрётся в процессор");
    options.push({
      kind: "gpu",
      component: gpu,
      fps,
      gainPct: fps !== null && current ? Math.round((fps / current - 1) * 100) : null,
      priceRub: gpu.price.amountRub,
      rubPerFps: fps !== null && current && fps > current ? Math.round(gpu.price.amountRub / (fps - current)) : null,
      compatibility: verdict.status,
      notes,
    });
  }

  if (build.gpu) {
    for (const cpu of hardwareRepository.byCategory("cpu")) {
      if (cpu.id === build.cpu?.id) continue;
      const verdict = evaluateCandidate(selection, cpu);
      const perf = getPerformance({ game, cpu, gpu: build.gpu, settings, measured: [], memory: memoryOf(build.ram, build.ramCount) });
      const fps = perf.kind === "unavailable" ? null : perf.avgFps;
      const notes: string[] = [];
      if (build.motherboard && cpu.socket !== build.motherboard.socket) notes.push(`Нужна новая плата (${cpu.socket})`);
      options.push({
        kind: "cpu",
        component: cpu,
        fps,
        gainPct: fps !== null && current ? Math.round((fps / current - 1) * 100) : null,
        priceRub: cpu.price.amountRub,
        rubPerFps: fps !== null && current && fps > current ? Math.round(cpu.price.amountRub / (fps - current)) : null,
        compatibility: verdict.status,
        notes,
      });
    }
  }
  return { current, options };
}

export function upgradeAgent(selection: BuildSelection, game: Game, settings: GameSettings, budgetRub?: number): AgentResult {
  const { current, options } = upgradeOptions(selection, game, settings);
  const viable = options
    .filter((o) => o.gainPct !== null && o.gainPct >= 5 && o.compatibility !== "incompatible")
    .filter((o) => (budgetRub ? o.priceRub <= budgetRub : true))
    .sort((a, b) => (a.rubPerFps ?? Infinity) - (b.rubPerFps ?? Infinity));
  const top = viable.slice(0, 4);
  return {
    agent: "upgrade",
    title: "Агент апгрейда",
    summary:
      current === null
        ? "Текущая производительность не оценивается (нет CPU или GPU) — рейтинг строится по абсолютной оценке."
        : top.length
          ? `Лучшее соотношение прироста к цене: ${top[0].component.name} (+${top[0].gainPct}% по оценке).`
          : "Апгрейдов с оценочным приростом ≥5% в заданном бюджете не найдено.",
    findings: top.map((o) => ({
      severity: o.compatibility === "warning" ? "warning" : "positive",
      text: `${o.kind.toUpperCase()} ${o.component.name}: ~${o.fps} FPS (+${o.gainPct}%), ${formatPrice(o.priceRub)}, ~${formatPrice(o.rubPerFps ?? 0)} за +1 FPS${o.notes.length ? ` — ${o.notes.join("; ")}` : ""}${o.compatibility === "warning" ? " — требует проверки совместимости" : ""}.`,
    })),
    toolCalls: [
      {
        tool: "upgrade.upgradeOptions",
        input: `${game.id}, ${settings.resolution}/${settings.preset}${budgetRub ? `, бюджет ${formatPrice(budgetRub)}` : ""}`,
        outputSummary: `${options.length} кандидатов, ${viable.length} с приростом ≥5%`,
      },
      { tool: "compatibility.evaluateCandidate ×" + options.length, input: "каждый кандидат в текущей сборке", outputSummary: `${options.filter((o) => o.compatibility === "incompatible").length} отклонено` },
    ],
    dataSources: [MODEL_SOURCE, PRICE_SOURCE, DATASET_SOURCE],
  };
}

export function priceAgent(build: ResolvedBuild): AgentResult {
  const total = totalPrice(build);
  const parts = [build.case, build.motherboard, build.cpu, build.cooler, build.ram, build.gpu, ...build.storage, build.psu, build.fans].filter(
    (c): c is NonNullable<typeof c> => Boolean(c),
  );
  const shares = parts
    .map((c) => ({ c, share: total ? c.price.amountRub / total : 0 }))
    .sort((a, b) => b.share - a.share);
  const findings: AgentResult["findings"] = shares.slice(0, 4).map(({ c, share }) => ({
    severity: "info",
    text: `${c.name}: ${formatPrice(c.price.amountRub)} (${Math.round(share * 100)}% бюджета).`,
  }));
  const gpus = hardwareRepository.byCategory("gpu").sort((a, b) => gpuValue(b) - gpuValue(a));
  const cpus = hardwareRepository.byCategory("cpu").sort((a, b) => cpuValue(b) - cpuValue(a));
  if (build.gpu) {
    const rank = gpus.findIndex((g) => g.id === build.gpu!.id) + 1;
    findings.push({
      severity: rank <= 3 ? "positive" : "info",
      text: `Видеокарта: ${formatPrice(Number(rubPerPoint(build.gpu.price.amountRub, build.gpu.rasterIndex)))} за пункт индекса — ${rank}-е место из ${gpus.length} по цене/производительности в наборе.`,
    });
  }
  if (build.cpu) {
    const rank = cpus.findIndex((c) => c.id === build.cpu!.id) + 1;
    findings.push({
      severity: rank <= 3 ? "positive" : "info",
      text: `Процессор: ${rank}-е место из ${cpus.length} по игровому индексу на единицу цены.`,
    });
  }
  const peak = estimatePeakPower(build);
  return {
    agent: "price",
    title: "Ценовой агент",
    summary: `Сумма по демо-ценам: ${formatPrice(total)}. Источники живых цен не подключены — сравнение предложений магазинов недоступно.`,
    findings,
    toolCalls: [
      { tool: "pricing.totalPrice", input: `${parts.length} компонентов`, outputSummary: formatPrice(total) },
      { tool: "pricing.gpuValue / cpuValue", input: "все GPU и CPU набора", outputSummary: `${gpus.length + cpus.length} позиций ранжировано` },
      ...(peak ? [{ tool: "power.estimatePeakPower", input: "текущая сборка", outputSummary: `~${peak} Вт` }] : []),
    ],
    dataSources: [PRICE_SOURCE],
  };
}
