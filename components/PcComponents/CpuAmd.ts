import type { CpuSocket, CpuSpec, MemoryType, PcieGen } from "@/types/hardware";
import { price, slug } from "./shared";

/**
 * AMD desktop CPUs, FX (AM3+, DDR3) → Ryzen 9000.
 * Specs transcribed from public data (unverified). gamingIndex is an estimation-model parameter
 * (Ryzen 7 7800X3D = 100), not a benchmark. Peak power approximates PPT.
 */
interface Fam {
  family: string;
  socket: CpuSocket;
  memory: MemoryType[];
  pcie: PcieGen;
  igpu: boolean;
}

const FAM: Record<string, Fam> = {
  fx: { family: "FX (Piledriver)", socket: "AM3+", memory: ["DDR3"], pcie: 2, igpu: false },
  r1: { family: "Ryzen 1000", socket: "AM4", memory: ["DDR4"], pcie: 3, igpu: false },
  r2: { family: "Ryzen 2000", socket: "AM4", memory: ["DDR4"], pcie: 3, igpu: false },
  r3g: { family: "Ryzen 3000G (APU)", socket: "AM4", memory: ["DDR4"], pcie: 3, igpu: true },
  r3: { family: "Ryzen 3000", socket: "AM4", memory: ["DDR4"], pcie: 4, igpu: false },
  r5: { family: "Ryzen 5000", socket: "AM4", memory: ["DDR4"], pcie: 4, igpu: false },
  r5g: { family: "Ryzen 5000G (APU)", socket: "AM4", memory: ["DDR4"], pcie: 3, igpu: true },
  r7: { family: "Ryzen 7000", socket: "AM5", memory: ["DDR5"], pcie: 5, igpu: true },
  r8g: { family: "Ryzen 8000G (APU)", socket: "AM5", memory: ["DDR5"], pcie: 4, igpu: true },
  r9: { family: "Ryzen 9000", socket: "AM5", memory: ["DDR5"], pcie: 5, igpu: true },
};

// [model, family, cores, threads, base GHz, boost GHz, TDP, peak W, year, gamingIndex, demo price RUB]
type Row = [string, keyof typeof FAM, number, number, number, number, number, number, number, number, number];

const ROWS: Row[] = [
  ["FX-6300", "fx", 6, 6, 3.5, 4.1, 95, 95, 2012, 18, 2000],
  ["FX-8350", "fx", 8, 8, 4.0, 4.2, 125, 125, 2012, 22, 3000],
  ["Ryzen 5 1600", "r1", 6, 12, 3.2, 3.6, 65, 88, 2017, 38, 4000],
  ["Ryzen 7 1700", "r1", 8, 16, 3.0, 3.7, 65, 90, 2017, 40, 5000],
  ["Ryzen 7 1800X", "r1", 8, 16, 3.6, 4.0, 95, 128, 2017, 42, 6000],
  ["Ryzen 5 2600", "r2", 6, 12, 3.4, 3.9, 65, 88, 2018, 44, 5000],
  ["Ryzen 7 2700X", "r2", 8, 16, 3.7, 4.3, 105, 142, 2018, 47, 7000],
  ["Ryzen 3 3200G", "r3g", 4, 4, 3.6, 4.0, 65, 88, 2019, 38, 4500],
  ["Ryzen 5 3400G", "r3g", 4, 8, 3.7, 4.2, 65, 88, 2019, 42, 6000],
  ["Ryzen 5 3600", "r3", 6, 12, 3.6, 4.2, 65, 88, 2019, 55, 7000],
  ["Ryzen 7 3700X", "r3", 8, 16, 3.6, 4.4, 65, 88, 2019, 57, 10000],
  ["Ryzen 9 3900X", "r3", 12, 24, 3.8, 4.6, 105, 142, 2019, 59, 15000],
  ["Ryzen 9 3950X", "r3", 16, 32, 3.5, 4.7, 105, 142, 2019, 60, 20000],
  ["Ryzen 5 5500", "r5", 6, 12, 3.6, 4.2, 65, 88, 2022, 58, 7000],
  ["Ryzen 5 5600", "r5", 6, 12, 3.5, 4.4, 65, 76, 2022, 64, 9000],
  ["Ryzen 5 5600X", "r5", 6, 12, 3.7, 4.6, 65, 76, 2020, 66, 10900],
  ["Ryzen 7 5700X", "r5", 8, 16, 3.4, 4.6, 65, 76, 2022, 69, 12000],
  ["Ryzen 7 5800X", "r5", 8, 16, 3.8, 4.7, 105, 142, 2020, 71, 14000],
  ["Ryzen 7 5800X3D", "r5", 8, 16, 3.4, 4.5, 105, 142, 2022, 84, 22000],
  ["Ryzen 9 5900X", "r5", 12, 24, 3.7, 4.8, 105, 142, 2020, 73, 20000],
  ["Ryzen 9 5950X", "r5", 16, 32, 3.4, 4.9, 105, 142, 2020, 74, 28000],
  ["Ryzen 5 5600G", "r5g", 6, 12, 3.9, 4.4, 65, 88, 2021, 58, 9000],
  ["Ryzen 7 5700G", "r5g", 8, 16, 3.8, 4.6, 65, 88, 2021, 62, 12000],
  ["Ryzen 5 7600", "r7", 6, 12, 3.8, 5.1, 65, 88, 2023, 76, 16900],
  ["Ryzen 5 7600X", "r7", 6, 12, 4.7, 5.3, 105, 142, 2022, 79, 19000],
  ["Ryzen 7 7700X", "r7", 8, 16, 4.5, 5.4, 105, 142, 2022, 84, 25000],
  ["Ryzen 7 7800X3D", "r7", 8, 16, 4.2, 5.0, 120, 162, 2023, 100, 36900],
  ["Ryzen 9 7900X", "r7", 12, 24, 4.7, 5.6, 170, 230, 2022, 86, 35000],
  ["Ryzen 9 7950X", "r7", 16, 32, 4.5, 5.7, 170, 230, 2022, 88, 48000],
  ["Ryzen 9 7950X3D", "r7", 16, 32, 4.2, 5.7, 120, 162, 2023, 99, 55000],
  ["Ryzen 5 8600G", "r8g", 6, 12, 4.3, 5.0, 65, 88, 2024, 66, 17000],
  ["Ryzen 7 8700G", "r8g", 8, 16, 4.2, 5.1, 65, 88, 2024, 70, 23000],
  ["Ryzen 5 9600X", "r9", 6, 12, 3.9, 5.4, 65, 88, 2024, 84, 22000],
  ["Ryzen 7 9700X", "r9", 8, 16, 3.8, 5.5, 65, 88, 2024, 88, 30000],
  ["Ryzen 7 9800X3D", "r9", 8, 16, 4.7, 5.2, 120, 162, 2024, 110, 52900],
  ["Ryzen 9 9900X", "r9", 12, 24, 4.4, 5.6, 120, 162, 2024, 90, 40000],
  ["Ryzen 9 9950X", "r9", 16, 32, 4.3, 5.7, 170, 230, 2024, 92, 59900],
  ["Ryzen 9 9950X3D", "r9", 16, 32, 4.3, 5.7, 170, 230, 2025, 108, 70000],
];

function seriesOf(model: string) {
  const m = model.match(/Ryzen (\d)/);
  return m ? `Ryzen ${m[1]}` : "FX";
}

export const CPU_AMD: CpuSpec[] = ROWS.map(([model, f, cores, threads, base, boost, tdp, peak, year, idx, rub]) => {
  const fam = FAM[f];
  return {
    id: slug(`amd-${model}`),
    category: "cpu",
    brand: "AMD",
    model,
    name: `AMD ${model}`,
    price: price(rub),
    dataQuality: "manufacturer-unverified",
    visual: { color: "#b8bcc4" },
    releaseYear: year,
    socket: fam.socket,
    series: seriesOf(model),
    family: fam.family,
    cores,
    threads,
    baseClockGhz: base,
    boostClockGhz: boost,
    tdpW: tdp,
    peakPowerW: peak,
    memorySupport: fam.memory,
    pcieGen: fam.pcie,
    integratedGraphics: fam.igpu,
    gamingIndex: idx,
  } satisfies CpuSpec;
}).sort((a, b) => (b.releaseYear ?? 0) - (a.releaseYear ?? 0) || b.gamingIndex - a.gamingIndex);

export const AMD_FAMILIES = Object.fromEntries(Object.entries(FAM).map(([k, v]) => [k, v.family])) as Record<keyof typeof FAM, string>;
