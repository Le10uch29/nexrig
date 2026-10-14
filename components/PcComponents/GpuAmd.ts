import type { GpuSpec } from "@/types/hardware";
import { buildGpuCatalogue, type GpuChip, type GpuLine, type ReferenceCard } from "./gpu-shared";

/**
 * AMD Radeon, RX 580 → RX 9070 XT.
 * Chip specs are reference values transcribed from public data (unverified). `raster` is an
 * estimation-model index (RTX 4070 = 100), not a benchmark. Prices are demo figures.
 */
const CHIPS: GpuChip[] = [
  // Polaris / Vega
  { chip: "RX 580", series: "RX 500", arch: "GCN 4", year: 2017, shaders: 2304, boostMhz: 1340, vramGb: 8, memType: "GDDR5", busBits: 256, tbpW: 185, psuW: 500, power: [["8pin", 1]], pcieGen: 3, lanes: 16, rt: false, raster: 31, basePrice: 8000 },
  { chip: "RX 590", series: "RX 500", arch: "GCN 4", year: 2018, shaders: 2304, boostMhz: 1545, vramGb: 8, memType: "GDDR5", busBits: 256, tbpW: 225, psuW: 500, power: [["8pin", 1], ["6pin", 1]], pcieGen: 3, lanes: 16, rt: false, raster: 34, basePrice: 9500 },
  { chip: "RX Vega 56", series: "RX Vega", arch: "GCN 5", year: 2017, shaders: 3584, boostMhz: 1471, vramGb: 8, memType: "HBM2", busBits: 2048, tbpW: 210, psuW: 650, power: [["8pin", 2]], pcieGen: 3, lanes: 16, rt: false, raster: 41, basePrice: 11000 },
  { chip: "RX Vega 64", series: "RX Vega", arch: "GCN 5", year: 2017, shaders: 4096, boostMhz: 1546, vramGb: 8, memType: "HBM2", busBits: 2048, tbpW: 295, psuW: 750, power: [["8pin", 2]], pcieGen: 3, lanes: 16, rt: false, raster: 47, basePrice: 13000 },
  { chip: "Radeon VII", series: "RX Vega", arch: "GCN 5", year: 2019, shaders: 3840, boostMhz: 1750, vramGb: 16, memType: "HBM2", busBits: 4096, tbpW: 300, psuW: 750, power: [["8pin", 2]], pcieGen: 3, lanes: 16, rt: false, raster: 58, basePrice: 22000 },
  // RDNA 1
  { chip: "RX 5500 XT", series: "RX 5000", arch: "RDNA 1", year: 2019, shaders: 1408, boostMhz: 1845, vramGb: 8, memType: "GDDR6", busBits: 128, tbpW: 130, psuW: 450, power: [["8pin", 1]], pcieGen: 4, lanes: 8, rt: false, raster: 32, basePrice: 11000 },
  { chip: "RX 5600 XT", series: "RX 5000", arch: "RDNA 1", year: 2020, shaders: 2304, boostMhz: 1560, vramGb: 6, memType: "GDDR6", busBits: 192, tbpW: 150, psuW: 550, power: [["8pin", 1]], pcieGen: 4, lanes: 16, rt: false, raster: 48, basePrice: 15000 },
  { chip: "RX 5700", series: "RX 5000", arch: "RDNA 1", year: 2019, shaders: 2304, boostMhz: 1725, vramGb: 8, memType: "GDDR6", busBits: 256, tbpW: 180, psuW: 600, power: [["8pin", 1], ["6pin", 1]], pcieGen: 4, lanes: 16, rt: false, raster: 53, basePrice: 17000 },
  { chip: "RX 5700 XT", series: "RX 5000", arch: "RDNA 1", year: 2019, shaders: 2560, boostMhz: 1905, vramGb: 8, memType: "GDDR6", busBits: 256, tbpW: 225, psuW: 600, power: [["8pin", 1], ["6pin", 1]], pcieGen: 4, lanes: 16, rt: false, raster: 59, basePrice: 19000 },
  // RDNA 2
  { chip: "RX 6500 XT", series: "RX 6000", arch: "RDNA 2", year: 2022, shaders: 1024, boostMhz: 2815, vramGb: 4, memType: "GDDR6", busBits: 64, tbpW: 107, psuW: 400, power: [["6pin", 1]], pcieGen: 4, lanes: 4, rt: true, raster: 24, basePrice: 14000 },
  { chip: "RX 6600", series: "RX 6000", arch: "RDNA 2", year: 2021, shaders: 1792, boostMhz: 2491, vramGb: 8, memType: "GDDR6", busBits: 128, tbpW: 132, psuW: 450, power: [["8pin", 1]], pcieGen: 4, lanes: 8, rt: true, raster: 56, basePrice: 22000 },
  { chip: "RX 6600 XT", series: "RX 6000", arch: "RDNA 2", year: 2021, shaders: 2048, boostMhz: 2589, vramGb: 8, memType: "GDDR6", busBits: 128, tbpW: 160, psuW: 500, power: [["8pin", 1]], pcieGen: 4, lanes: 8, rt: true, raster: 63, basePrice: 25000 },
  { chip: "RX 6650 XT", series: "RX 6000", arch: "RDNA 2", year: 2022, shaders: 2048, boostMhz: 2635, vramGb: 8, memType: "GDDR6", busBits: 128, tbpW: 180, psuW: 500, power: [["8pin", 1]], pcieGen: 4, lanes: 8, rt: true, raster: 65, basePrice: 27000 },
  { chip: "RX 6700 XT", series: "RX 6000", arch: "RDNA 2", year: 2021, shaders: 2560, boostMhz: 2581, vramGb: 12, memType: "GDDR6", busBits: 192, tbpW: 230, psuW: 650, power: [["8pin", 1], ["6pin", 1]], pcieGen: 4, lanes: 16, rt: true, raster: 75, basePrice: 32000 },
  { chip: "RX 6750 XT", series: "RX 6000", arch: "RDNA 2", year: 2022, shaders: 2560, boostMhz: 2600, vramGb: 12, memType: "GDDR6", busBits: 192, tbpW: 250, psuW: 650, power: [["8pin", 1], ["6pin", 1]], pcieGen: 4, lanes: 16, rt: true, raster: 79, basePrice: 35000 },
  { chip: "RX 6800", series: "RX 6000", arch: "RDNA 2", year: 2020, shaders: 3840, boostMhz: 2105, vramGb: 16, memType: "GDDR6", busBits: 256, tbpW: 250, psuW: 650, power: [["8pin", 2]], pcieGen: 4, lanes: 16, rt: true, raster: 92, basePrice: 42000 },
  { chip: "RX 6800 XT", series: "RX 6000", arch: "RDNA 2", year: 2020, shaders: 4608, boostMhz: 2250, vramGb: 16, memType: "GDDR6", busBits: 256, tbpW: 300, psuW: 750, power: [["8pin", 2]], pcieGen: 4, lanes: 16, rt: true, raster: 100, basePrice: 48000 },
  { chip: "RX 6900 XT", series: "RX 6000", arch: "RDNA 2", year: 2020, shaders: 5120, boostMhz: 2250, vramGb: 16, memType: "GDDR6", busBits: 256, tbpW: 300, psuW: 850, power: [["8pin", 2]], pcieGen: 4, lanes: 16, rt: true, raster: 107, basePrice: 55000 },
  { chip: "RX 6950 XT", series: "RX 6000", arch: "RDNA 2", year: 2022, shaders: 5120, boostMhz: 2310, vramGb: 16, memType: "GDDR6", busBits: 256, tbpW: 335, psuW: 850, power: [["8pin", 2]], pcieGen: 4, lanes: 16, rt: true, raster: 114, basePrice: 60000 },
  // RDNA 3
  { chip: "RX 7600", series: "RX 7000", arch: "RDNA 3", year: 2023, shaders: 2048, boostMhz: 2655, vramGb: 8, memType: "GDDR6", busBits: 128, tbpW: 165, psuW: 550, power: [["8pin", 1]], pcieGen: 4, lanes: 8, rt: true, raster: 62, basePrice: 28000 },
  { chip: "RX 7600 XT", series: "RX 7000", arch: "RDNA 3", year: 2024, shaders: 2048, boostMhz: 2755, vramGb: 16, memType: "GDDR6", busBits: 128, tbpW: 190, psuW: 600, power: [["8pin", 2]], pcieGen: 4, lanes: 8, rt: true, raster: 65, basePrice: 34000 },
  { chip: "RX 7700 XT", series: "RX 7000", arch: "RDNA 3", year: 2023, shaders: 3456, boostMhz: 2544, vramGb: 12, memType: "GDDR6", busBits: 192, tbpW: 245, psuW: 700, power: [["8pin", 2]], pcieGen: 4, lanes: 16, rt: true, raster: 86, basePrice: 45000 },
  { chip: "RX 7800 XT", series: "RX 7000", arch: "RDNA 3", year: 2023, shaders: 3840, boostMhz: 2430, vramGb: 16, memType: "GDDR6", busBits: 256, tbpW: 263, psuW: 700, power: [["8pin", 2]], pcieGen: 4, lanes: 16, rt: true, raster: 103, basePrice: 54000 },
  { chip: "RX 7900 GRE", series: "RX 7000", arch: "RDNA 3", year: 2024, shaders: 5120, boostMhz: 2245, vramGb: 16, memType: "GDDR6", busBits: 256, tbpW: 260, psuW: 700, power: [["8pin", 2]], pcieGen: 4, lanes: 16, rt: true, raster: 112, basePrice: 62000 },
  { chip: "RX 7900 XT", series: "RX 7000", arch: "RDNA 3", year: 2022, shaders: 5376, boostMhz: 2400, vramGb: 20, memType: "GDDR6", busBits: 320, tbpW: 315, psuW: 750, power: [["8pin", 2]], pcieGen: 4, lanes: 16, rt: true, raster: 133, basePrice: 80000 },
  { chip: "RX 7900 XTX", series: "RX 7000", arch: "RDNA 3", year: 2022, shaders: 6144, boostMhz: 2500, vramGb: 24, memType: "GDDR6", busBits: 384, tbpW: 355, psuW: 800, power: [["8pin", 2]], pcieGen: 4, lanes: 16, rt: true, raster: 155, basePrice: 104000 },
  // RDNA 4
  { chip: "RX 9060 XT 8 ГБ", series: "RX 9000", arch: "RDNA 4", year: 2025, shaders: 2048, boostMhz: 3130, vramGb: 8, memType: "GDDR6", busBits: 128, tbpW: 150, psuW: 450, power: [["8pin", 1]], pcieGen: 5, lanes: 16, rt: true, raster: 78, basePrice: 33000 },
  { chip: "RX 9060 XT 16 ГБ", series: "RX 9000", arch: "RDNA 4", year: 2025, shaders: 2048, boostMhz: 3130, vramGb: 16, memType: "GDDR6", busBits: 128, tbpW: 160, psuW: 450, power: [["8pin", 1]], pcieGen: 5, lanes: 16, rt: true, raster: 80, basePrice: 40000 },
  { chip: "RX 9070", series: "RX 9000", arch: "RDNA 4", year: 2025, shaders: 3584, boostMhz: 2520, vramGb: 16, memType: "GDDR6", busBits: 256, tbpW: 220, psuW: 650, power: [["8pin", 2]], pcieGen: 5, lanes: 16, rt: true, raster: 128, basePrice: 65000 },
  { chip: "RX 9070 XT", series: "RX 9000", arch: "RDNA 4", year: 2025, shaders: 4096, boostMhz: 2970, vramGb: 16, memType: "GDDR6", busBits: 256, tbpW: 304, psuW: 750, power: [["8pin", 2]], pcieGen: 5, lanes: 16, rt: true, raster: 145, basePrice: 75000 },
];

const all = () => true;
const since = (year: number) => (c: GpuChip) => c.year >= year;
const until = (year: number) => (c: GpuChip) => c.year <= year;
const notVega = (c: GpuChip) => c.series !== "RX Vega";

const LINES: GpuLine[] = [
  { brand: "Sapphire", line: "Nitro+", tier: "premium", rgb: true, color: "#1b1c20", accent: "#3a8fd8", covers: notVega },
  { brand: "Sapphire", line: "Pulse", tier: "entry", color: "#1b1c20", accent: "#d0d3da", covers: notVega },
  { brand: "PowerColor", line: "Red Devil", tier: "premium", rgb: true, color: "#151518", accent: "#d21f2b", covers: (c) => notVega(c) && c.tbpW >= 150 },
  { brand: "PowerColor", line: "Hellhound", tier: "mid", rgb: true, color: "#1d1e22", accent: "#6aa8ff", covers: since(2022), lineName: () => "Hellhound" },
  { brand: "PowerColor", line: "Red Dragon", tier: "mid", color: "#1d1e22", accent: "#d21f2b", covers: (c) => c.year < 2022 && notVega(c) },
  { brand: "ASUS", line: "ROG Strix", tier: "premium", rgb: true, color: "#1f2126", accent: "#c4304a", covers: until(2022) },
  { brand: "ASUS", line: "TUF Gaming", tier: "mid", rgb: true, color: "#2a2b2f", accent: "#9aa0aa", covers: since(2020) },
  { brand: "ASUS", line: "Dual", tier: "entry", color: "#25272c", accent: "#c9ccd2", covers: (c) => c.tbpW <= 230 && notVega(c) },
  { brand: "MSI", line: "Gaming X", tier: "mid", rgb: true, color: "#1c1d21", accent: "#d23a3a", covers: (c) => until(2024)(c) && notVega(c), lineName: (c) => (c.tbpW >= 250 ? "Gaming X Trio" : "Gaming X") },
  { brand: "Gigabyte", line: "Gaming OC", tier: "mid", rgb: true, color: "#202226", accent: "#f5a623", covers: all },
  { brand: "XFX", line: "Speedster MERC", tier: "premium", rgb: true, color: "#16171a", accent: "#b9bcc4", covers: (c) => since(2020)(c) && c.tbpW >= 200 },
  { brand: "XFX", line: "Speedster SWFT", tier: "entry", color: "#202125", accent: "#b9bcc4", covers: since(2020) },
];

const REF = { brand: "AMD", line: "Reference", color: "#1d1e22", accent: "#c4304a" };
const REFS: ReferenceCard[] = [
  // fans: 1 = blower reference design.
  { chip: "RX Vega 56", lengthMm: 267, slots: 2, fans: 1 },
  { chip: "RX Vega 64", lengthMm: 267, slots: 2, fans: 1 },
  { chip: "Radeon VII", lengthMm: 268, slots: 2.5, fans: 3 },
  { chip: "RX 5700", lengthMm: 268, slots: 2, fans: 1 },
  { chip: "RX 5700 XT", lengthMm: 268, slots: 2, fans: 1 },
  { chip: "RX 6700 XT", lengthMm: 267, slots: 2, fans: 2 },
  { chip: "RX 6800", lengthMm: 267, slots: 2, fans: 3 },
  { chip: "RX 6800 XT", lengthMm: 267, slots: 2.5, fans: 3 },
  { chip: "RX 6900 XT", lengthMm: 267, slots: 2.5, fans: 3 },
  { chip: "RX 6950 XT", lengthMm: 267, slots: 2.5, fans: 3 },
  { chip: "RX 7600", lengthMm: 204, slots: 2, fans: 2 },
  { chip: "RX 7700 XT", lengthMm: 267, slots: 2, fans: 2 },
  { chip: "RX 7800 XT", lengthMm: 267, slots: 2, fans: 2 },
  { chip: "RX 7900 GRE", lengthMm: 276, slots: 2.5, fans: 3 },
  { chip: "RX 7900 XT", lengthMm: 276, slots: 2.5, fans: 3 },
  { chip: "RX 7900 XTX", lengthMm: 287, slots: 2.5, fans: 3 },
].map((r) => ({ ...r, ...REF }) as ReferenceCard);

export const GPU_AMD: GpuSpec[] = buildGpuCatalogue("AMD", CHIPS, LINES, REFS);
