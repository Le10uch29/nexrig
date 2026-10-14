import { GAMES } from "@/data/games";
import { estimateFps, memoryOf } from "@/lib/benchmark-engine/estimate";
import { estimatePeakPower } from "@/lib/hardware/power";
import type { ResolvedBuild } from "@/lib/hardware/repository";
import type { GameSettings } from "@/types/benchmark";
import type { ComponentCategory } from "@/types/hardware";

/**
 * Build balance: how well pairs of parts suit each other, as a percentage with an explanation.
 *
 * This is NOT a compatibility pass/fail (that is rules.ts) and NOT a measurement. Each score comes
 * either from the relative-performance model (CPU↔GPU, averaged over the game list) or from simple
 * documented rules (PSU load, cooler rating, PCIe bandwidth, memory configuration). 100% means
 * "neither part holds the other back noticeably"; the text says what limits what.
 */

export type BalanceStatus = "good" | "fair" | "poor" | "unknown";
export type BalanceBasis = "model" | "rule";

export interface BalanceItem {
  id: string;
  title: string;
  categories: ComponentCategory[];
  /** 0–100, or null when the data needed is missing. */
  scorePct: number | null;
  status: BalanceStatus;
  /** One-line verdict. */
  summary: string;
  /** Why, with the numbers behind the score. */
  detail: string;
  /** What to change to improve it (only when not good). */
  advice?: string;
  basis: BalanceBasis;
  /** CPU↔GPU only: which side sets the frame rate. */
  limiter?: "cpu" | "gpu";
}

export interface BalanceReport {
  items: BalanceItem[];
  /** Weakest-link aware overall score (null when nothing could be scored). */
  overallPct: number | null;
  settings: GameSettings;
}

const usable = (n: number | undefined | null): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/**
 * Overall score: 60% weighted mean of the scored pairs + 40% the weakest pair (so one very bad
 * pair is not hidden by several good ones). Weights: CPU↔GPU 3, memory 2, PSU 2, VRAM 1.5,
 * cooler 1, PCIe 1, storage 0.5. Unknown pairs are left out, not counted as 0 or 100.
 */
export const OVERALL_FORMULA = "60% × взвешенное среднее пар + 40% × худшая пара (веса: CPU↔GPU 3, память 2, БП 2, видеопамять 1,5, кулер 1, PCIe 1, накопитель 0,5; пары без данных не учитываются)";

const statusOf = (pct: number | null): BalanceStatus => (pct === null ? "unknown" : pct >= 85 ? "good" : pct >= 65 ? "fair" : "poor");
const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export const BALANCE_DEFAULT_SETTINGS: GameSettings = { resolution: "1440p", preset: "high", rayTracing: false, upscaling: "off", upscaler: null, frameGen: false };

/** CPU ↔ GPU: how much of each side's FPS ceiling the other lets you use, averaged over the game list. */
function cpuGpu(b: ResolvedBuild, settings: GameSettings): BalanceItem {
  const base = { id: "cpu-gpu", title: "Процессор ↔ видеокарта", categories: ["cpu", "gpu"] as ComponentCategory[], basis: "model" as const };
  if (!b.cpu || !b.gpu) {
    return { ...base, scorePct: null, status: "unknown", summary: "Нужны процессор и видеокарта.", detail: "Без обеих деталей баланс не оценить." };
  }
  if (!usable(b.cpu.gamingIndex) || !usable(b.gpu.rasterIndex)) {
    return { ...base, scorePct: null, status: "unknown", summary: "Нет индекса производительности для этой детали.", detail: "Баланс не оценивается без параметров модели — значение не подставляется." };
  }
  const memory = memoryOf(b.ram, b.ramCount);
  const per = GAMES.map((game) => estimateFps({ game, cpu: b.cpu!, gpu: b.gpu!, settings, memory }));
  // Geometric mean of the ceilings' ratio keeps a few extreme games from dominating.
  const geo = (xs: number[]) => Math.exp(xs.reduce((s, x) => s + Math.log(x), 0) / xs.length);
  const ratio = geo(per.map((r) => r.cpuBoundFps / r.gpuBoundFps));
  const gpuUse = clampPct(geo(per.map((r) => r.utilization.gpu)) * 100);
  const cpuUse = clampPct(geo(per.map((r) => r.utilization.cpu)) * 100);
  // Asymmetric on purpose: an idle graphics card (CPU-bound) is the expensive mismatch and counts
  // fully; spare CPU headroom in a GPU-bound game is normal and counts at half weight (square root).
  const pct = clampPct((ratio < 1 ? ratio : Math.sqrt(1 / ratio)) * 100);
  const res = `${settings.resolution}, ${settings.preset === "high" ? "высокие" : settings.preset}`;
  const cpuLimits = ratio < 1;
  const lost = clampPct(100 - (cpuLimits ? ratio : 1 / ratio) * 100);
  const summary =
    pct >= 85
      ? "Сбалансированная пара: ни одна деталь заметно не сдерживает другую."
      : cpuLimits
        ? `Процессор сдерживает видеокарту: по модели она раскрывается примерно на ${gpuUse}%.`
        : `Видеокарта — ограничивающее звено: потенциал процессора используется примерно на ${cpuUse}%.`;
  return {
    ...base,
    limiter: cpuLimits ? "cpu" : "gpu",
    scorePct: pct,
    status: statusOf(pct),
    summary,
    detail: `Оценка модели по ${GAMES.length} играм (${res}): потенциал ${cpuLimits ? b.gpu.chip : b.cpu.name} используется примерно на ${100 - lost}%. Доля используемого потенциала по модели: GPU ~${gpuUse}%, CPU ~${cpuUse}% — это расчёт, а не измеренная загрузка в мониторинге. Оценка баланса (${pct}%) показывает, насколько пара подходит друг другу, и считается иначе: недогруз видеокарты штрафуется полностью, запас процессора — вдвое мягче. В лёгких или CPU-зависимых играх и на других разрешениях картина другая.`,
    advice:
      pct >= 85
        ? undefined
        : cpuLimits
          ? "Более быстрый процессор (и платформа) даст больше, чем видеокарта мощнее. На 4K и с трассировкой лучей ограничение процессором слабее."
          : "Для этого процессора видеокарта мощнее даст ощутимый прирост; либо снизьте разрешение/настройки.",
  };
}

/** Memory: capacity, type/platform, channels and speed against the CPU's official speed. */
function memory(b: ResolvedBuild): BalanceItem {
  const base = { id: "ram", title: "Оперативная память ↔ платформа", categories: ["ram", "cpu", "motherboard"] as ComponentCategory[], basis: "rule" as const };
  if (!b.ram) return { ...base, scorePct: null, status: "unknown", summary: "Память не выбрана.", detail: "Нет данных о памяти." };
  if (!usable(b.ram.moduleSizeGb) || !usable(b.ram.speedMtps)) {
    return { ...base, scorePct: null, status: "unknown", summary: "Объём или частота памяти неизвестны.", detail: "Без этих характеристик соответствие не оценивается." };
  }
  const total = b.ram.moduleSizeGb * b.ramCount;
  const gpuTier = b.gpu?.rasterIndex ?? 0;
  const parts: { score: number; note: string }[] = [];
  // Capacity for current games (16 GB baseline, 32 GB comfortable with high-end cards).
  parts.push(
    total >= 32
      ? { score: 100, note: `${total} ГБ — с запасом для современных игр.` }
      : total >= 16
        ? { score: gpuTier >= 150 ? 85 : 95, note: `${total} ГБ — достаточно для большинства игр${gpuTier >= 150 ? "; с такой видеокартой в тяжёлых играх полезны 32 ГБ" : ""}.` }
        : total >= 12
          ? { score: 70, note: `${total} ГБ — в современных играх возможны подгрузки и просадки.` }
          : total >= 8
            ? { score: 55, note: `${total} ГБ — мало для современных игр: частые фризы и подгрузки.` }
            : { score: 35, note: `${total} ГБ — недостаточно для современных игр.` },
  );
  if (b.ram.type === "DDR3") {
    parts.push({
      score: gpuTier >= 120 ? 55 : gpuTier >= 70 ? 70 : 85,
      note: `DDR3 — платформа прошлых поколений: низкая пропускная способность памяти ограничивает процессор${gpuTier >= 120 ? ", а мощная видеокарта будет простаивать" : ""}.`,
    });
  } else if (b.ram.type === "DDR4" && b.cpu?.memorySupport.includes("DDR5")) {
    parts.push({ score: 92, note: "DDR4 на платформе с поддержкой DDR5: процессор теряет несколько процентов в играх." });
  }
  if (b.ramCount === 1) parts.push({ score: 70, note: "Один модуль — одноканальный режим: заметное падение FPS в CPU-зависимых играх." });
  if (b.ramCount === 3) parts.push({ score: 90, note: "Три модуля — несимметричные каналы." });
  const jedec = b.cpu?.memorySpeedMtps?.[b.ram.type];
  if (jedec && b.ram.speedMtps < jedec) parts.push({ score: 90, note: `${b.ram.speedMtps} МТ/с ниже официальной частоты процессора (${jedec} МТ/с).` });
  const pct = Math.min(...parts.map((p) => p.score));
  return {
    ...base,
    scorePct: pct,
    status: statusOf(pct),
    summary: pct >= 85 ? `${total} ГБ ${b.ram.type}-${b.ram.speedMtps}, ${b.ramCount} мод. — подходит.` : parts.filter((p) => p.score === pct)[0].note,
    detail: parts.map((p) => p.note).join(" "),
    advice: pct >= 85 ? undefined : "Двухканальный комплект 2×16 ГБ на актуальной платформе (DDR5 для новых систем).",
  };
}

function psu(b: ResolvedBuild): BalanceItem {
  const base = { id: "psu", title: "Блок питания ↔ нагрузка", categories: ["psu", "cpu", "gpu"] as ComponentCategory[], basis: "rule" as const };
  const peak = estimatePeakPower(b);
  if (!b.psu || !peak || !usable(b.psu.wattage)) return { ...base, scorePct: null, status: "unknown", summary: "Нужны блок питания и процессор.", detail: "Пиковое потребление не оценить." };
  const load = peak / b.psu.wattage;
  const loadPct = Math.round(load * 100);
  const pct = load <= 0.7 ? 100 : load <= 0.85 ? 85 : load <= 1 ? 60 : 20;
  return {
    ...base,
    scorePct: pct,
    status: statusOf(pct),
    summary: `Пиковая нагрузка ~${loadPct}% мощности (${peak} из ${b.psu.wattage} Вт).`,
    detail: "Оптимум — до 70% мощности в пике: тише вентилятор, выше КПД, запас на скачки нагрузки видеокарты. Пик оценён по TDP/мощности деталей, это не замер.",
    advice: pct >= 85 ? undefined : `Блок питания на ${Math.ceil((peak / 0.7) / 50) * 50} Вт или больше.`,
  };
}

function cooler(b: ResolvedBuild): BalanceItem {
  const base = { id: "cooler", title: "Охлаждение ↔ процессор", categories: ["cooler", "cpu"] as ComponentCategory[], basis: "rule" as const };
  if (!b.cooler || !b.cpu) return { ...base, scorePct: null, status: "unknown", summary: "Нужны кулер и процессор.", detail: "Нет данных для оценки." };
  const rated = b.cooler.kind === "aio" ? (usable(b.cooler.radiatorMm) ? b.cooler.radiatorMm * 0.85 : undefined) : b.cooler.ratedTdpW;
  if (!usable(rated) || !usable(b.cpu.peakPowerW)) {
    return { ...base, scorePct: null, status: "unknown", summary: "Производитель не публикует теплоотвод кулера.", detail: `Пиковая мощность процессора ~${b.cpu.peakPowerW} Вт; без паспортного значения запас не оценить.` };
  }
  const pct = clampPct((rated / b.cpu.peakPowerW) * 100);
  return {
    ...base,
    scorePct: pct,
    status: statusOf(pct),
    summary: pct >= 100 ? "Теплоотвод с запасом." : `Теплоотвод ~${pct}% от пиковой мощности процессора.`,
    detail: `Процессор до ~${b.cpu.peakPowerW} Вт, кулер ~${Math.round(rated)} Вт${b.cooler.kind === "aio" ? " (ориентир по размеру радиатора, не паспорт)" : " (паспорт производителя)"}. При нехватке процессор снижает частоты под длительной нагрузкой.`,
    advice: pct >= 85 ? undefined : "Кулер с большим теплоотводом или СЖО 280–360 мм.",
  };
}

/** PCIe link: older slot generations and narrow (x8/x4) cards lose bandwidth. Rule-of-thumb impact. */
function pcie(b: ResolvedBuild): BalanceItem {
  const base = { id: "pcie", title: "Слот PCIe ↔ видеокарта", categories: ["motherboard", "gpu", "cpu"] as ComponentCategory[], basis: "rule" as const };
  if (!b.gpu || !b.motherboard) return { ...base, scorePct: null, status: "unknown", summary: "Нужны плата и видеокарта.", detail: "Нет данных." };
  if (!usable(b.gpu.pcieGen) || !usable(b.gpu.pcieLanes) || !usable(b.motherboard.pcieX16Gen)) {
    return { ...base, scorePct: null, status: "unknown", summary: "Поколение PCIe неизвестно.", detail: "Без данных о слоте и карте потери не оцениваются." };
  }
  const slotGen = Math.min(b.motherboard.pcieX16Gen, b.cpu?.pcieGen ?? b.motherboard.pcieX16Gen);
  const link = Math.min(slotGen, b.gpu.pcieGen);
  const genGap = b.gpu.pcieGen - link;
  // Rough, published-review-style magnitudes: x16 cards barely notice one generation down; x8 cards do.
  const impact = genGap <= 0 ? 0 : b.gpu.pcieLanes >= 16 ? Math.min(6, genGap * 2) : b.gpu.pcieLanes === 8 ? Math.min(15, genGap * 6) : Math.min(25, genGap * 10);
  const pct = 100 - impact;
  return {
    ...base,
    scorePct: pct,
    status: statusOf(pct),
    summary: genGap <= 0 ? `PCIe ${link}.0 x${b.gpu.pcieLanes} — без ограничений.` : `Карта PCIe ${b.gpu.pcieGen}.0 x${b.gpu.pcieLanes} работает как PCIe ${link}.0: потери ~${impact}%.`,
    detail: "Ориентир по обзорам масштабирования PCIe: у карт x16 один шаг поколения почти незаметен, у карт x8/x4 потери выше, особенно при нехватке видеопамяти.",
    advice: impact >= 5 ? "Плата и процессор с более новым поколением PCIe." : undefined,
  };
}

function vram(b: ResolvedBuild, settings: GameSettings): BalanceItem {
  const base = { id: "vram", title: "Видеопамять ↔ разрешение", categories: ["gpu"] as ComponentCategory[], basis: "rule" as const };
  if (!b.gpu) return { ...base, scorePct: null, status: "unknown", summary: "Видеокарта не выбрана.", detail: "Нет данных." };
  if (!usable(b.gpu.vramGb)) return { ...base, scorePct: null, status: "unknown", summary: "Объём видеопамяти неизвестен.", detail: "Нет данных." };
  const need = settings.resolution === "4K" ? 12 : settings.resolution === "1440p" ? (settings.preset === "ultra" || settings.rayTracing ? 10 : 8) : settings.preset === "low" ? 4 : 6;
  const pct = clampPct(Math.min(1, b.gpu.vramGb / need) * 100);
  return {
    ...base,
    scorePct: pct,
    status: statusOf(pct),
    summary: `${b.gpu.vramGb} ГБ при ориентире ~${need} ГБ для ${settings.resolution}.`,
    detail: "Ориентир по требованиям современных игр к видеопамяти при высоких текстурах; при нехватке — подгрузки, фризы и падение 1% low.",
    advice: pct >= 85 ? undefined : "Снизьте качество текстур/разрешение или выберите карту с большим объёмом памяти.",
  };
}

function storage(b: ResolvedBuild): BalanceItem {
  const base = { id: "storage", title: "Накопитель для игр", categories: ["storage"] as ComponentCategory[], basis: "rule" as const };
  if (b.storage.length === 0) return { ...base, scorePct: null, status: "unknown", summary: "Накопитель не выбран.", detail: "Нет данных." };
  const best = b.storage.some((s) => s.interface === "NVMe") ? "nvme" : b.storage.some((s) => s.kind === "ssd") ? "sata" : "hdd";
  const pct = best === "nvme" ? 100 : best === "sata" ? 90 : 45;
  return {
    ...base,
    scorePct: pct,
    status: statusOf(pct),
    summary: best === "nvme" ? "NVMe SSD — быстрые загрузки." : best === "sata" ? "SATA SSD — загрузки чуть дольше, чем с NVMe." : "Только HDD — долгие загрузки и подгрузки текстур.",
    detail: "Влияет на загрузки и подгрузку мира, на средний FPS — слабо. Многие новые игры требуют SSD.",
    advice: best === "hdd" ? "Добавьте SSD (NVMe) под систему и игры." : undefined,
  };
}

export function analyzeBalance(b: ResolvedBuild, settings: GameSettings = BALANCE_DEFAULT_SETTINGS): BalanceReport {
  const items = [cpuGpu(b, settings), memory(b), psu(b), cooler(b), pcie(b), vram(b, settings), storage(b)];
  const scored = items.filter((i) => i.scorePct !== null);
  if (scored.length === 0) return { items, overallPct: null, settings };
  // Weighted mean, pulled toward the weakest link (a 40% pair matters more than five 100% pairs).
  const weights: Record<string, number> = { "cpu-gpu": 3, ram: 2, psu: 2, cooler: 1, pcie: 1, vram: 1.5, storage: 0.5 };
  const wsum = scored.reduce((s, i) => s + weights[i.id], 0);
  const mean = scored.reduce((s, i) => s + i.scorePct! * weights[i.id], 0) / wsum;
  const min = Math.min(...scored.map((i) => i.scorePct!));
  return { items, overallPct: clampPct(mean * 0.6 + min * 0.4), settings };
}
