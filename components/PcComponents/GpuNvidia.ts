import type { GpuSpec } from "@/types/hardware";
import { buildGpuCatalogue, type GpuChip, type GpuLine, type ReferenceCard } from "./gpu-shared";

/**
 * NVIDIA GeForce, GTX 1060 → RTX 5090.
 * Chip specs are reference values transcribed from public data (unverified). `raster` is an
 * estimation-model index (RTX 4070 = 100), not a benchmark. Prices are demo figures.
 */
const CHIPS: GpuChip[] = [
  // GeForce 10 (Pascal)
  { chip: "GTX 1060 3 ГБ", series: "GTX 10", arch: "Pascal", year: 2016, shaders: 1152, boostMhz: 1708, vramGb: 3, memType: "GDDR5", busBits: 192, tbpW: 120, psuW: 400, power: [["6pin", 1]], pcieGen: 3, lanes: 16, rt: false, raster: 28, basePrice: 7000 },
  { chip: "GTX 1060 6 ГБ", series: "GTX 10", arch: "Pascal", year: 2016, shaders: 1280, boostMhz: 1708, vramGb: 6, memType: "GDDR5", busBits: 192, tbpW: 120, psuW: 400, power: [["6pin", 1]], pcieGen: 3, lanes: 16, rt: false, raster: 31, basePrice: 9000 },
  { chip: "GTX 1070", series: "GTX 10", arch: "Pascal", year: 2016, shaders: 1920, boostMhz: 1683, vramGb: 8, memType: "GDDR5", busBits: 256, tbpW: 150, psuW: 500, power: [["8pin", 1]], pcieGen: 3, lanes: 16, rt: false, raster: 41, basePrice: 12000 },
  { chip: "GTX 1070 Ti", series: "GTX 10", arch: "Pascal", year: 2017, shaders: 2432, boostMhz: 1683, vramGb: 8, memType: "GDDR5", busBits: 256, tbpW: 180, psuW: 500, power: [["8pin", 1]], pcieGen: 3, lanes: 16, rt: false, raster: 46, basePrice: 14000 },
  { chip: "GTX 1080", series: "GTX 10", arch: "Pascal", year: 2016, shaders: 2560, boostMhz: 1733, vramGb: 8, memType: "GDDR5X", busBits: 256, tbpW: 180, psuW: 500, power: [["8pin", 1]], pcieGen: 3, lanes: 16, rt: false, raster: 50, basePrice: 16000 },
  { chip: "GTX 1080 Ti", series: "GTX 10", arch: "Pascal", year: 2017, shaders: 3584, boostMhz: 1582, vramGb: 11, memType: "GDDR5X", busBits: 352, tbpW: 250, psuW: 600, power: [["8pin", 1], ["6pin", 1]], pcieGen: 3, lanes: 16, rt: false, raster: 63, basePrice: 24000 },
  // GeForce 16 (Turing, no RT cores)
  { chip: "GTX 1650", series: "GTX 16", arch: "Turing", year: 2019, shaders: 896, boostMhz: 1665, vramGb: 4, memType: "GDDR5", busBits: 128, tbpW: 75, psuW: 300, power: [], pcieGen: 3, lanes: 16, rt: false, raster: 22, basePrice: 12000 },
  { chip: "GTX 1650 SUPER", series: "GTX 16", arch: "Turing", year: 2019, shaders: 1280, boostMhz: 1725, vramGb: 4, memType: "GDDR6", busBits: 128, tbpW: 100, psuW: 350, power: [["6pin", 1]], pcieGen: 3, lanes: 16, rt: false, raster: 29, basePrice: 14000 },
  { chip: "GTX 1660", series: "GTX 16", arch: "Turing", year: 2019, shaders: 1408, boostMhz: 1785, vramGb: 6, memType: "GDDR5", busBits: 192, tbpW: 120, psuW: 450, power: [["8pin", 1]], pcieGen: 3, lanes: 16, rt: false, raster: 33, basePrice: 17000 },
  { chip: "GTX 1660 SUPER", series: "GTX 16", arch: "Turing", year: 2019, shaders: 1408, boostMhz: 1785, vramGb: 6, memType: "GDDR6", busBits: 192, tbpW: 125, psuW: 450, power: [["8pin", 1]], pcieGen: 3, lanes: 16, rt: false, raster: 38, basePrice: 19000 },
  { chip: "GTX 1660 Ti", series: "GTX 16", arch: "Turing", year: 2019, shaders: 1536, boostMhz: 1770, vramGb: 6, memType: "GDDR6", busBits: 192, tbpW: 120, psuW: 450, power: [["8pin", 1]], pcieGen: 3, lanes: 16, rt: false, raster: 38, basePrice: 19000 },
  // GeForce RTX 20 (Turing)
  { chip: "RTX 2060", series: "RTX 20", arch: "Turing", year: 2019, shaders: 1920, boostMhz: 1680, vramGb: 6, memType: "GDDR6", busBits: 192, tbpW: 160, psuW: 500, power: [["8pin", 1]], pcieGen: 3, lanes: 16, rt: true, raster: 47, basePrice: 20000 },
  { chip: "RTX 2060 SUPER", series: "RTX 20", arch: "Turing", year: 2019, shaders: 2176, boostMhz: 1650, vramGb: 8, memType: "GDDR6", busBits: 256, tbpW: 175, psuW: 550, power: [["8pin", 1]], pcieGen: 3, lanes: 16, rt: true, raster: 54, basePrice: 25000 },
  { chip: "RTX 2070", series: "RTX 20", arch: "Turing", year: 2018, shaders: 2304, boostMhz: 1620, vramGb: 8, memType: "GDDR6", busBits: 256, tbpW: 175, psuW: 550, power: [["8pin", 1]], pcieGen: 3, lanes: 16, rt: true, raster: 57, basePrice: 26000 },
  { chip: "RTX 2070 SUPER", series: "RTX 20", arch: "Turing", year: 2019, shaders: 2560, boostMhz: 1770, vramGb: 8, memType: "GDDR6", busBits: 256, tbpW: 215, psuW: 650, power: [["8pin", 1], ["6pin", 1]], pcieGen: 3, lanes: 16, rt: true, raster: 64, basePrice: 30000 },
  { chip: "RTX 2080", series: "RTX 20", arch: "Turing", year: 2018, shaders: 2944, boostMhz: 1710, vramGb: 8, memType: "GDDR6", busBits: 256, tbpW: 215, psuW: 650, power: [["8pin", 1], ["6pin", 1]], pcieGen: 3, lanes: 16, rt: true, raster: 67, basePrice: 33000 },
  { chip: "RTX 2080 SUPER", series: "RTX 20", arch: "Turing", year: 2019, shaders: 3072, boostMhz: 1815, vramGb: 8, memType: "GDDR6", busBits: 256, tbpW: 250, psuW: 650, power: [["8pin", 1], ["6pin", 1]], pcieGen: 3, lanes: 16, rt: true, raster: 71, basePrice: 37000 },
  { chip: "RTX 2080 Ti", series: "RTX 20", arch: "Turing", year: 2018, shaders: 4352, boostMhz: 1545, vramGb: 11, memType: "GDDR6", busBits: 352, tbpW: 250, psuW: 650, power: [["8pin", 2]], pcieGen: 3, lanes: 16, rt: true, raster: 82, basePrice: 45000 },
  // GeForce RTX 30 (Ampere)
  { chip: "RTX 3050", series: "RTX 30", arch: "Ampere", year: 2022, shaders: 2560, boostMhz: 1777, vramGb: 8, memType: "GDDR6", busBits: 128, tbpW: 130, psuW: 550, power: [["8pin", 1]], pcieGen: 4, lanes: 8, rt: true, raster: 42, basePrice: 25000 },
  { chip: "RTX 3060", series: "RTX 30", arch: "Ampere", year: 2021, shaders: 3584, boostMhz: 1777, vramGb: 12, memType: "GDDR6", busBits: 192, tbpW: 170, psuW: 550, power: [["8pin", 1]], pcieGen: 4, lanes: 16, rt: true, raster: 57, basePrice: 32000 },
  { chip: "RTX 3060 Ti", series: "RTX 30", arch: "Ampere", year: 2020, shaders: 4864, boostMhz: 1665, vramGb: 8, memType: "GDDR6", busBits: 256, tbpW: 200, psuW: 600, power: [["8pin", 1]], pcieGen: 4, lanes: 16, rt: true, raster: 73, basePrice: 38000 },
  { chip: "RTX 3070", series: "RTX 30", arch: "Ampere", year: 2020, shaders: 5888, boostMhz: 1725, vramGb: 8, memType: "GDDR6", busBits: 256, tbpW: 220, psuW: 650, power: [["8pin", 2]], pcieGen: 4, lanes: 16, rt: true, raster: 82, basePrice: 45000 },
  { chip: "RTX 3070 Ti", series: "RTX 30", arch: "Ampere", year: 2021, shaders: 6144, boostMhz: 1770, vramGb: 8, memType: "GDDR6X", busBits: 256, tbpW: 290, psuW: 750, power: [["8pin", 2]], pcieGen: 4, lanes: 16, rt: true, raster: 87, basePrice: 50000 },
  { chip: "RTX 3080", series: "RTX 30", arch: "Ampere", year: 2020, shaders: 8704, boostMhz: 1710, vramGb: 10, memType: "GDDR6X", busBits: 320, tbpW: 320, psuW: 750, power: [["8pin", 2]], pcieGen: 4, lanes: 16, rt: true, raster: 101, basePrice: 60000 },
  { chip: "RTX 3080 Ti", series: "RTX 30", arch: "Ampere", year: 2021, shaders: 10240, boostMhz: 1665, vramGb: 12, memType: "GDDR6X", busBits: 384, tbpW: 350, psuW: 750, power: [["8pin", 2]], pcieGen: 4, lanes: 16, rt: true, raster: 113, basePrice: 75000 },
  { chip: "RTX 3090", series: "RTX 30", arch: "Ampere", year: 2020, shaders: 10496, boostMhz: 1695, vramGb: 24, memType: "GDDR6X", busBits: 384, tbpW: 350, psuW: 750, power: [["8pin", 2]], pcieGen: 4, lanes: 16, rt: true, raster: 116, basePrice: 95000 },
  { chip: "RTX 3090 Ti", series: "RTX 30", arch: "Ampere", year: 2022, shaders: 10752, boostMhz: 1860, vramGb: 24, memType: "GDDR6X", busBits: 384, tbpW: 450, psuW: 850, power: [["12V-2x6", 1]], pcieGen: 4, lanes: 16, rt: true, raster: 126, basePrice: 110000 },
  // GeForce RTX 40 (Ada Lovelace)
  { chip: "RTX 4060", series: "RTX 40", arch: "Ada Lovelace", year: 2023, shaders: 3072, boostMhz: 2460, vramGb: 8, memType: "GDDR6", busBits: 128, tbpW: 115, psuW: 550, power: [["8pin", 1]], pcieGen: 4, lanes: 8, rt: true, raster: 64, basePrice: 32000 },
  { chip: "RTX 4060 Ti 8 ГБ", series: "RTX 40", arch: "Ada Lovelace", year: 2023, shaders: 4352, boostMhz: 2535, vramGb: 8, memType: "GDDR6", busBits: 128, tbpW: 160, psuW: 550, power: [["8pin", 1]], pcieGen: 4, lanes: 8, rt: true, raster: 76, basePrice: 40000 },
  { chip: "RTX 4060 Ti 16 ГБ", series: "RTX 40", arch: "Ada Lovelace", year: 2023, shaders: 4352, boostMhz: 2535, vramGb: 16, memType: "GDDR6", busBits: 128, tbpW: 165, psuW: 550, power: [["8pin", 1]], pcieGen: 4, lanes: 8, rt: true, raster: 77, basePrice: 48000 },
  { chip: "RTX 4070", series: "RTX 40", arch: "Ada Lovelace", year: 2023, shaders: 5888, boostMhz: 2475, vramGb: 12, memType: "GDDR6X", busBits: 192, tbpW: 200, psuW: 650, power: [["8pin", 1]], pcieGen: 4, lanes: 16, rt: true, raster: 100, basePrice: 55000 },
  { chip: "RTX 4070 SUPER", series: "RTX 40", arch: "Ada Lovelace", year: 2024, shaders: 7168, boostMhz: 2475, vramGb: 12, memType: "GDDR6X", busBits: 192, tbpW: 220, psuW: 650, power: [["12V-2x6", 1]], pcieGen: 4, lanes: 16, rt: true, raster: 117, basePrice: 62000 },
  { chip: "RTX 4070 Ti", series: "RTX 40", arch: "Ada Lovelace", year: 2023, shaders: 7680, boostMhz: 2610, vramGb: 12, memType: "GDDR6X", busBits: 192, tbpW: 285, psuW: 700, power: [["12V-2x6", 1]], pcieGen: 4, lanes: 16, rt: true, raster: 122, basePrice: 75000 },
  { chip: "RTX 4070 Ti SUPER", series: "RTX 40", arch: "Ada Lovelace", year: 2024, shaders: 8448, boostMhz: 2610, vramGb: 16, memType: "GDDR6X", busBits: 256, tbpW: 285, psuW: 700, power: [["12V-2x6", 1]], pcieGen: 4, lanes: 16, rt: true, raster: 136, basePrice: 88000 },
  { chip: "RTX 4080", series: "RTX 40", arch: "Ada Lovelace", year: 2022, shaders: 9728, boostMhz: 2505, vramGb: 16, memType: "GDDR6X", busBits: 256, tbpW: 320, psuW: 750, power: [["12V-2x6", 1]], pcieGen: 4, lanes: 16, rt: true, raster: 155, basePrice: 110000 },
  { chip: "RTX 4080 SUPER", series: "RTX 40", arch: "Ada Lovelace", year: 2024, shaders: 10240, boostMhz: 2550, vramGb: 16, memType: "GDDR6X", busBits: 256, tbpW: 320, psuW: 750, power: [["12V-2x6", 1]], pcieGen: 4, lanes: 16, rt: true, raster: 158, basePrice: 115000 },
  { chip: "RTX 4090", series: "RTX 40", arch: "Ada Lovelace", year: 2022, shaders: 16384, boostMhz: 2520, vramGb: 24, memType: "GDDR6X", busBits: 384, tbpW: 450, psuW: 850, power: [["12V-2x6", 1]], pcieGen: 4, lanes: 16, rt: true, raster: 200, basePrice: 210000 },
  // GeForce RTX 50 (Blackwell)
  { chip: "RTX 5060", series: "RTX 50", arch: "Blackwell", year: 2025, shaders: 3840, boostMhz: 2497, vramGb: 8, memType: "GDDR7", busBits: 128, tbpW: 145, psuW: 550, power: [["8pin", 1]], pcieGen: 5, lanes: 8, rt: true, raster: 79, basePrice: 34000 },
  { chip: "RTX 5060 Ti 8 ГБ", series: "RTX 50", arch: "Blackwell", year: 2025, shaders: 4608, boostMhz: 2572, vramGb: 8, memType: "GDDR7", busBits: 128, tbpW: 180, psuW: 600, power: [["8pin", 1]], pcieGen: 5, lanes: 8, rt: true, raster: 88, basePrice: 42000 },
  { chip: "RTX 5060 Ti 16 ГБ", series: "RTX 50", arch: "Blackwell", year: 2025, shaders: 4608, boostMhz: 2572, vramGb: 16, memType: "GDDR7", busBits: 128, tbpW: 180, psuW: 600, power: [["8pin", 1]], pcieGen: 5, lanes: 8, rt: true, raster: 90, basePrice: 50000 },
  { chip: "RTX 5070", series: "RTX 50", arch: "Blackwell", year: 2025, shaders: 6144, boostMhz: 2512, vramGb: 12, memType: "GDDR7", busBits: 192, tbpW: 250, psuW: 650, power: [["12V-2x6", 1]], pcieGen: 5, lanes: 16, rt: true, raster: 118, basePrice: 62000 },
  { chip: "RTX 5070 Ti", series: "RTX 50", arch: "Blackwell", year: 2025, shaders: 8960, boostMhz: 2452, vramGb: 16, memType: "GDDR7", busBits: 256, tbpW: 300, psuW: 750, power: [["12V-2x6", 1]], pcieGen: 5, lanes: 16, rt: true, raster: 150, basePrice: 90000 },
  { chip: "RTX 5080", series: "RTX 50", arch: "Blackwell", year: 2025, shaders: 10752, boostMhz: 2617, vramGb: 16, memType: "GDDR7", busBits: 256, tbpW: 360, psuW: 850, power: [["12V-2x6", 1]], pcieGen: 5, lanes: 16, rt: true, raster: 172, basePrice: 125000 },
  { chip: "RTX 5090", series: "RTX 50", arch: "Blackwell", year: 2025, shaders: 21760, boostMhz: 2407, vramGb: 32, memType: "GDDR7", busBits: 512, tbpW: 575, psuW: 1000, power: [["12V-2x6", 1]], pcieGen: 5, lanes: 16, rt: true, raster: 260, basePrice: 280000 },
];

const all = () => true;
const since = (year: number) => (c: GpuChip) => c.year >= year;
const before = (year: number) => (c: GpuChip) => c.year < year;
const minTbp = (w: number) => (c: GpuChip) => c.tbpW >= w;

const LINES: GpuLine[] = [
  { brand: "ASUS", line: "ROG Strix", tier: "premium", color: "#1f2126", accent: "#c4304a", covers: all },
  { brand: "ASUS", line: "TUF Gaming", tier: "mid", color: "#2a2b2f", accent: "#9aa0aa", covers: since(2019) },
  { brand: "ASUS", line: "Dual", tier: "entry", color: "#25272c", accent: "#c9ccd2", covers: (c) => c.tbpW <= 250 },
  { brand: "MSI", line: "Gaming X", tier: "mid", color: "#1c1d21", accent: "#d23a3a", covers: all, lineName: (c) => (c.tbpW >= 220 && c.year >= 2019 ? "Gaming X Trio" : "Gaming X") },
  { brand: "MSI", line: "Ventus", tier: "entry", color: "#2b2d31", accent: "#8a8f99", covers: since(2018), lineName: (c) => (c.tbpW >= 220 ? "Ventus 3X" : "Ventus 2X") },
  { brand: "MSI", line: "Armor", tier: "entry", color: "#202226", accent: "#e0e0e0", covers: before(2018) },
  { brand: "Gigabyte", line: "AORUS", tier: "premium", color: "#18191d", accent: "#f08a24", covers: minTbp(120) },
  { brand: "Gigabyte", line: "Gaming OC", tier: "mid", color: "#202226", accent: "#f5a623", covers: all },
  { brand: "Gigabyte", line: "Eagle", tier: "entry", color: "#2c2e33", accent: "#5fb0ff", covers: since(2020), lineName: (c) => (c.year >= 2025 ? "Windforce" : "Eagle") },
  { brand: "Palit", line: "GamingPro", tier: "mid", color: "#1d1e22", accent: "#7a7f8a", covers: since(2018) },
  { brand: "Zotac", line: "Twin Edge", tier: "entry", color: "#26282c", accent: "#f2c230", covers: (c) => c.year >= 2020 && c.tbpW <= 300 },
  { brand: "Zotac", line: "AMP", tier: "premium", color: "#1b1c20", accent: "#f2c230", covers: minTbp(150) },
];

const FE = { color: "#2b2d31", accent: "#9ea3ac" };
/** Founders Edition cards with published dimensions. */
const REFS: ReferenceCard[] = [
  { chip: "GTX 1060 6 ГБ", lengthMm: 250, slots: 2 },
  { chip: "GTX 1070", lengthMm: 267, slots: 2 },
  { chip: "GTX 1070 Ti", lengthMm: 267, slots: 2 },
  { chip: "GTX 1080", lengthMm: 267, slots: 2 },
  { chip: "GTX 1080 Ti", lengthMm: 267, slots: 2 },
  { chip: "RTX 2060", lengthMm: 229, slots: 2 },
  { chip: "RTX 2060 SUPER", lengthMm: 229, slots: 2 },
  { chip: "RTX 2070", lengthMm: 229, slots: 2 },
  { chip: "RTX 2070 SUPER", lengthMm: 267, slots: 2 },
  { chip: "RTX 2080", lengthMm: 267, slots: 2 },
  { chip: "RTX 2080 SUPER", lengthMm: 267, slots: 2 },
  { chip: "RTX 2080 Ti", lengthMm: 267, slots: 2 },
  { chip: "RTX 3060 Ti", lengthMm: 242, slots: 2, power: [["12V-2x6", 1]] },
  { chip: "RTX 3070", lengthMm: 242, slots: 2, power: [["12V-2x6", 1]] },
  { chip: "RTX 3070 Ti", lengthMm: 267, slots: 2, power: [["12V-2x6", 1]] },
  { chip: "RTX 3080", lengthMm: 285, slots: 2, power: [["12V-2x6", 1]] },
  { chip: "RTX 3080 Ti", lengthMm: 285, slots: 2, power: [["12V-2x6", 1]] },
  { chip: "RTX 3090", lengthMm: 313, slots: 3, power: [["12V-2x6", 1]] },
  { chip: "RTX 3090 Ti", lengthMm: 313, slots: 3 },
  { chip: "RTX 4060 Ti 8 ГБ", lengthMm: 244, slots: 2 },
  { chip: "RTX 4070", lengthMm: 244, slots: 2, power: [["12V-2x6", 1]] },
  { chip: "RTX 4070 SUPER", lengthMm: 244, slots: 2 },
  { chip: "RTX 4080", lengthMm: 310, slots: 3 },
  { chip: "RTX 4080 SUPER", lengthMm: 310, slots: 3 },
  { chip: "RTX 4090", lengthMm: 304, slots: 3 },
  { chip: "RTX 5070", lengthMm: 242, slots: 2 },
  { chip: "RTX 5080", lengthMm: 304, slots: 2 },
  { chip: "RTX 5090", lengthMm: 304, slots: 2 },
].map((r) => ({ ...r, brand: "NVIDIA", line: "Founders Edition", ...FE }) as ReferenceCard);

export const GPU_NVIDIA: GpuSpec[] = buildGpuCatalogue("NVIDIA", CHIPS, LINES, REFS);
