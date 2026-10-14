import type { CpuSocket, CpuSpec, MemoryType, PcieGen } from "@/types/hardware";
import { price, slug } from "./shared";

/**
 * Intel desktop CPUs, 2nd gen (Sandy Bridge, DDR3) → Core Ultra 200S.
 * Specs transcribed from public data (unverified). gamingIndex is an estimation-model parameter
 * (Ryzen 7 7800X3D = 100), not a benchmark. Peak power approximates PL2 / sustained turbo.
 */
interface Gen {
  family: string;
  socket: CpuSocket;
  memory: MemoryType[];
  /** Official (JEDEC) memory speed per type, MT/s — the speed Intel specifies without XMP. */
  memSpeed: Partial<Record<MemoryType, number>>;
  pcie: PcieGen;
}

const GEN: Record<string, Gen> = {
  g2: { family: "2-е поколение (Sandy Bridge)", socket: "LGA1155", memory: ["DDR3"], memSpeed: { DDR3: 1333 }, pcie: 2 },
  g3: { family: "3-е поколение (Ivy Bridge)", socket: "LGA1155", memory: ["DDR3"], memSpeed: { DDR3: 1600 }, pcie: 3 },
  g4: { family: "4-е поколение (Haswell)", socket: "LGA1150", memory: ["DDR3"], memSpeed: { DDR3: 1600 }, pcie: 3 },
  // Skylake and Kaby Lake also support DDR3L-1600 (low-voltage DDR3) per Intel ARK.
  g6: { family: "6-е поколение (Skylake)", socket: "LGA1151", memory: ["DDR4", "DDR3"], memSpeed: { DDR4: 2133, DDR3: 1600 }, pcie: 3 },
  g7: { family: "7-е поколение (Kaby Lake)", socket: "LGA1151", memory: ["DDR4", "DDR3"], memSpeed: { DDR4: 2400, DDR3: 1600 }, pcie: 3 },
  g8: { family: "8-е поколение (Coffee Lake)", socket: "LGA1151-v2", memory: ["DDR4"], memSpeed: { DDR4: 2666 }, pcie: 3 },
  g9: { family: "9-е поколение (Coffee Lake Refresh)", socket: "LGA1151-v2", memory: ["DDR4"], memSpeed: { DDR4: 2666 }, pcie: 3 },
  g10: { family: "10-е поколение (Comet Lake)", socket: "LGA1200", memory: ["DDR4"], memSpeed: { DDR4: 2933 }, pcie: 3 },
  g11: { family: "11-е поколение (Rocket Lake)", socket: "LGA1200", memory: ["DDR4"], memSpeed: { DDR4: 3200 }, pcie: 4 },
  g12: { family: "12-е поколение (Alder Lake)", socket: "LGA1700", memory: ["DDR4", "DDR5"], memSpeed: { DDR4: 3200, DDR5: 4800 }, pcie: 5 },
  g13: { family: "13-е поколение (Raptor Lake)", socket: "LGA1700", memory: ["DDR4", "DDR5"], memSpeed: { DDR4: 3200, DDR5: 5600 }, pcie: 5 },
  g14: { family: "14-е поколение (Raptor Lake Refresh)", socket: "LGA1700", memory: ["DDR4", "DDR5"], memSpeed: { DDR4: 3200, DDR5: 5600 }, pcie: 5 },
  u2: { family: "Core Ultra 200S (Arrow Lake)", socket: "LGA1851", memory: ["DDR5"], memSpeed: { DDR5: 6400 }, pcie: 5 },
};

// [model, gen, cores, threads, base GHz, boost GHz, TDP, peak W, year, gamingIndex, demo price RUB]
type Row = [string, keyof typeof GEN, number, number, number, number, number, number, number, number, number];

const ROWS: Row[] = [
  ["Core i3-2100", "g2", 2, 4, 3.1, 3.1, 65, 65, 2011, 18, 1500],
  ["Core i5-2500K", "g2", 4, 4, 3.3, 3.7, 95, 95, 2011, 28, 2500],
  ["Core i7-2600K", "g2", 4, 8, 3.4, 3.8, 95, 100, 2011, 31, 3500],
  ["Core i3-3220", "g3", 2, 4, 3.3, 3.3, 55, 55, 2012, 20, 1500],
  ["Core i5-3570K", "g3", 4, 4, 3.4, 3.8, 77, 85, 2012, 31, 3000],
  ["Core i7-3770K", "g3", 4, 8, 3.5, 3.9, 77, 90, 2012, 34, 4500],
  ["Core i3-4130", "g4", 2, 4, 3.4, 3.4, 54, 54, 2013, 22, 1500],
  ["Core i5-4590", "g4", 4, 4, 3.3, 3.7, 84, 84, 2014, 32, 2500],
  ["Core i5-4690K", "g4", 4, 4, 3.5, 3.9, 88, 90, 2014, 34, 3500],
  ["Core i7-4770K", "g4", 4, 8, 3.5, 3.9, 84, 95, 2013, 36, 5000],
  ["Core i7-4790K", "g4", 4, 8, 4.0, 4.4, 88, 105, 2014, 39, 6500],
  ["Core i3-6100", "g6", 2, 4, 3.7, 3.7, 51, 51, 2015, 28, 2500],
  ["Core i5-6600K", "g6", 4, 4, 3.5, 3.9, 91, 95, 2015, 38, 4000],
  ["Core i7-6700K", "g6", 4, 8, 4.0, 4.2, 91, 105, 2015, 42, 6500],
  ["Core i5-7400", "g7", 4, 4, 3.0, 3.5, 65, 65, 2017, 38, 3500],
  ["Core i5-7600K", "g7", 4, 4, 3.8, 4.2, 91, 100, 2017, 43, 5000],
  ["Core i7-7700K", "g7", 4, 8, 4.2, 4.5, 91, 110, 2017, 46, 7500],
  ["Core i3-8100", "g8", 4, 4, 3.6, 3.6, 65, 65, 2017, 33, 3000],
  ["Core i5-8400", "g8", 6, 6, 2.8, 4.0, 65, 90, 2017, 44, 4500],
  ["Core i5-8600K", "g8", 6, 6, 3.6, 4.3, 95, 120, 2017, 48, 5500],
  ["Core i7-8700K", "g8", 6, 12, 3.7, 4.7, 95, 150, 2017, 55, 8000],
  ["Core i3-9100F", "g9", 4, 4, 3.6, 4.2, 65, 70, 2019, 35, 3500],
  ["Core i5-9400F", "g9", 6, 6, 2.9, 4.1, 65, 90, 2019, 45, 5000],
  ["Core i5-9600K", "g9", 6, 6, 3.7, 4.6, 95, 125, 2018, 49, 6500],
  ["Core i7-9700K", "g9", 8, 8, 3.6, 4.9, 95, 150, 2018, 57, 9500],
  ["Core i9-9900K", "g9", 8, 16, 3.6, 5.0, 95, 190, 2018, 60, 13000],
  ["Core i3-10100F", "g10", 4, 8, 3.6, 4.3, 65, 90, 2020, 41, 4500],
  ["Core i5-10400F", "g10", 6, 12, 2.9, 4.3, 65, 135, 2020, 52, 6500],
  ["Core i5-10600K", "g10", 6, 12, 4.1, 4.8, 125, 180, 2020, 57, 9000],
  ["Core i7-10700K", "g10", 8, 16, 3.8, 5.1, 125, 229, 2020, 62, 14000],
  ["Core i9-10900K", "g10", 10, 20, 3.7, 5.3, 125, 250, 2020, 65, 19000],
  ["Core i5-11400F", "g11", 6, 12, 2.6, 4.4, 65, 154, 2021, 58, 7500],
  ["Core i5-11600K", "g11", 6, 12, 3.9, 4.9, 125, 182, 2021, 63, 10000],
  ["Core i7-11700K", "g11", 8, 16, 3.6, 5.0, 125, 251, 2021, 66, 15000],
  ["Core i9-11900K", "g11", 8, 16, 3.5, 5.3, 125, 251, 2021, 68, 19000],
  ["Core i3-12100F", "g12", 4, 8, 3.3, 4.3, 58, 89, 2022, 56, 7000],
  ["Core i5-12400F", "g12", 6, 12, 2.5, 4.4, 65, 117, 2022, 68, 10000],
  ["Core i5-12600K", "g12", 10, 16, 3.7, 4.9, 125, 150, 2021, 74, 15000],
  ["Core i7-12700K", "g12", 12, 20, 3.6, 5.0, 125, 190, 2021, 79, 22000],
  ["Core i9-12900K", "g12", 16, 24, 3.2, 5.2, 125, 241, 2021, 82, 30000],
  ["Core i5-13400F", "g13", 10, 16, 2.5, 4.6, 65, 148, 2023, 70, 14000],
  ["Core i5-13600K", "g13", 14, 20, 3.5, 5.1, 125, 181, 2022, 82, 22000],
  ["Core i7-13700K", "g13", 16, 24, 3.4, 5.4, 125, 253, 2022, 89, 30000],
  ["Core i9-13900K", "g13", 24, 32, 3.0, 5.8, 125, 253, 2022, 92, 42000],
  ["Core i5-14400F", "g14", 10, 16, 2.5, 4.7, 65, 148, 2024, 71, 15000],
  ["Core i5-14600K", "g14", 14, 20, 3.5, 5.3, 125, 181, 2023, 83, 24900],
  ["Core i7-14700K", "g14", 20, 28, 3.4, 5.6, 125, 253, 2023, 89, 34900],
  ["Core i9-14900K", "g14", 24, 32, 3.2, 6.0, 125, 253, 2023, 93, 48900],
  ["Core Ultra 5 245K", "u2", 14, 14, 4.2, 5.2, 125, 159, 2024, 75, 25000],
  ["Core Ultra 7 265K", "u2", 20, 20, 3.9, 5.5, 125, 250, 2024, 82, 32900],
  ["Core Ultra 9 285K", "u2", 24, 24, 3.7, 5.7, 125, 250, 2024, 88, 52000],
];

function seriesOf(model: string) {
  const ultra = model.match(/Core Ultra (\d)/);
  if (ultra) return `Core Ultra ${ultra[1]}`;
  const core = model.match(/Core (i\d)/);
  return core ? `Core ${core[1]}` : "Core";
}

export const CPU_INTEL: CpuSpec[] = ROWS.map(([model, g, cores, threads, base, boost, tdp, peak, year, idx, rub]) => {
  const gen = GEN[g];
  // "F" models ship without integrated graphics ("KF" too).
  const integratedGraphics = !/\d+K?F$/.test(model);
  return {
    id: slug(`intel-${model}`),
    category: "cpu",
    brand: "Intel",
    model,
    name: `Intel ${model}`,
    price: price(rub),
    dataQuality: "manufacturer-unverified",
    visual: { color: "#c3c7ce" },
    releaseYear: year,
    socket: gen.socket,
    series: seriesOf(model),
    family: gen.family,
    cores,
    threads,
    baseClockGhz: base,
    boostClockGhz: boost,
    tdpW: tdp,
    peakPowerW: peak,
    memorySupport: gen.memory,
    memorySpeedMtps: gen.memSpeed,
    pcieGen: gen.pcie,
    integratedGraphics,
    gamingIndex: idx,
  } satisfies CpuSpec;
}).sort((a, b) => (b.releaseYear ?? 0) - (a.releaseYear ?? 0) || b.gamingIndex - a.gamingIndex);

export const INTEL_FAMILIES = Object.fromEntries(Object.entries(GEN).map(([k, v]) => [k, v.family])) as Record<keyof typeof GEN, string>;
