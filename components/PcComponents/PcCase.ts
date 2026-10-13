import type { BoardFormFactor, CaseSpec } from "@/types/hardware";
import { price, slug } from "./shared";

/**
 * PC cases. Clearances, bays and dimensions transcribed from public data (unverified;
 * entries marked approximate where figures vary between revisions).
 */
type Row = {
  brand: string;
  model: string;
  boards: BoardFormFactor[];
  sfx?: boolean;
  dims: [number, number, number]; // width, height, depth (mm)
  gpu: number;
  cooler: number;
  rads: number[];
  fans: number;
  b25: number;
  b35: number;
  style: CaseSpec["style"];
  rub: number;
  color: string;
  accent: string;
  year: number;
  approximate?: boolean;
};

const ATX: BoardFormFactor[] = ["ATX", "mATX", "ITX"];
const MATX: BoardFormFactor[] = ["mATX", "ITX"];

const ROWS: Row[] = [
  { brand: "Fractal Design", model: "North", boards: ATX, dims: [215, 469, 447], gpu: 355, cooler: 170, rads: [240, 280, 360], fans: 6, b25: 2, b35: 2, style: "mesh", rub: 13900, color: "#1b1d22", accent: "#6b4a2f", year: 2022 },
  { brand: "Fractal Design", model: "North XL", boards: ATX, dims: [240, 509, 503], gpu: 413, cooler: 185, rads: [240, 280, 360, 420], fans: 9, b25: 3, b35: 2, style: "mesh", rub: 17900, color: "#1b1d22", accent: "#6b4a2f", year: 2023 },
  { brand: "Fractal Design", model: "Meshify 2 Compact", boards: ATX, dims: [210, 474, 424], gpu: 360, cooler: 169, rads: [240, 280, 360], fans: 7, b25: 2, b35: 2, style: "mesh", rub: 11900, color: "#141518", accent: "#2b2f36", year: 2021 },
  { brand: "Fractal Design", model: "Pop Air", boards: ATX, dims: [215, 474, 454], gpu: 405, cooler: 170, rads: [240, 280, 360], fans: 6, b25: 2, b35: 2, style: "mesh", rub: 8500, color: "#141518", accent: "#2b2f36", year: 2022 },
  { brand: "Lian Li", model: "O11 Dynamic EVO", boards: ATX, dims: [285, 459, 465], gpu: 422, cooler: 167, rads: [240, 280, 360], fans: 10, b25: 4, b35: 2, style: "glass-showcase", rub: 15900, color: "#16181d", accent: "#8b8fff", year: 2022 },
  { brand: "Lian Li", model: "Lancool 216", boards: ATX, dims: [235, 491, 480], gpu: 392, cooler: 180, rads: [240, 280, 360], fans: 9, b25: 4, b35: 2, style: "mesh", rub: 9500, color: "#141518", accent: "#2b2f36", year: 2023 },
  { brand: "Lian Li", model: "Lancool III", boards: ATX, dims: [238, 526, 530], gpu: 435, cooler: 187, rads: [240, 280, 360, 420], fans: 10, b25: 4, b35: 2, style: "mesh", rub: 14500, color: "#141518", accent: "#2b2f36", year: 2022 },
  { brand: "Corsair", model: "3000D Airflow", boards: ATX, dims: [230, 466, 462], gpu: 360, cooler: 170, rads: [240, 280, 360], fans: 8, b25: 2, b35: 2, style: "mesh", rub: 7500, color: "#121316", accent: "#2b2f36", year: 2023 },
  { brand: "Corsair", model: "4000D Airflow", boards: ATX, dims: [230, 466, 453], gpu: 360, cooler: 170, rads: [240, 280, 360], fans: 6, b25: 2, b35: 2, style: "mesh", rub: 9400, color: "#121316", accent: "#2b2f36", year: 2020 },
  { brand: "Corsair", model: "5000D Airflow", boards: ATX, dims: [245, 520, 520], gpu: 420, cooler: 170, rads: [240, 280, 360], fans: 10, b25: 4, b35: 2, style: "mesh", rub: 15000, color: "#121316", accent: "#2b2f36", year: 2020 },
  { brand: "NZXT", model: "H5 Flow", boards: ATX, dims: [227, 464, 446], gpu: 365, cooler: 165, rads: [240, 280], fans: 5, b25: 2, b35: 1, style: "mesh", rub: 8900, color: "#e9eaee", accent: "#c9ccd4", year: 2022 },
  { brand: "NZXT", model: "H7 Flow", boards: ATX, dims: [230, 505, 480], gpu: 400, cooler: 185, rads: [240, 280, 360], fans: 9, b25: 2, b35: 2, style: "mesh", rub: 13000, color: "#1b1c20", accent: "#c9ccd4", year: 2022 },
  { brand: "Phanteks", model: "Eclipse P400A", boards: ATX, dims: [210, 465, 470], gpu: 420, cooler: 160, rads: [240, 280, 360], fans: 6, b25: 2, b35: 2, style: "mesh", rub: 7500, color: "#141518", accent: "#2b2f36", year: 2020 },
  { brand: "be quiet!", model: "Pure Base 500DX", boards: ATX, dims: [232, 463, 450], gpu: 369, cooler: 190, rads: [240, 280, 360], fans: 5, b25: 5, b35: 2, style: "mesh", rub: 10500, color: "#141518", accent: "#e09a2b", year: 2020 },
  { brand: "Montech", model: "AIR 903 MAX", boards: ATX, dims: [230, 504, 488], gpu: 400, cooler: 180, rads: [240, 280, 360], fans: 9, b25: 2, b35: 2, style: "mesh", rub: 8500, color: "#141518", accent: "#2b2f36", year: 2023, approximate: true },
  { brand: "DeepCool", model: "CH560", boards: ATX, dims: [230, 467, 467], gpu: 380, cooler: 175, rads: [240, 280, 360], fans: 9, b25: 2, b35: 2, style: "mesh", rub: 7500, color: "#141518", accent: "#2b2f36", year: 2023, approximate: true },
  { brand: "Cooler Master", model: "MasterBox Q300L", boards: MATX, dims: [230, 387, 387], gpu: 360, cooler: 159, rads: [240], fans: 4, b25: 2, b35: 1, style: "mesh", rub: 4500, color: "#141518", accent: "#2b2f36", year: 2018, approximate: true },
  { brand: "Jonsbo", model: "D31 Mesh", boards: MATX, dims: [205, 410, 400], gpu: 400, cooler: 168, rads: [240, 280, 360], fans: 6, b25: 2, b35: 1, style: "mesh", rub: 7500, color: "#e9eaee", accent: "#c9ccd4", year: 2023, approximate: true },
  { brand: "Cooler Master", model: "MasterBox NR200P", boards: ["ITX"], sfx: true, dims: [185, 292, 376], gpu: 330, cooler: 155, rads: [240, 280], fans: 4, b25: 3, b35: 1, style: "compact", rub: 8700, color: "#1a1b1f", accent: "#3a3d45", year: 2020 },
];

export const PC_CASES: CaseSpec[] = ROWS.map((r): CaseSpec => ({
  id: slug(`${r.brand}-${r.model}`),
  category: "case",
  brand: r.brand,
  model: r.model,
  name: `${r.brand} ${r.model}`,
  price: price(r.rub),
  dataQuality: r.approximate ? "approximate" : "manufacturer-unverified",
  visual: { color: r.color, accent: r.accent },
  releaseYear: r.year,
  supportedBoards: r.boards,
  supportedPsu: r.sfx ? ["SFX"] : ["ATX"],
  maxGpuLengthMm: r.gpu,
  maxCpuCoolerHeightMm: r.cooler,
  radiatorSupportMm: r.rads,
  exteriorMm: { width: r.dims[0], height: r.dims[1], depth: r.dims[2] },
  fanSlots120: r.fans,
  drive25Bays: r.b25,
  drive35Bays: r.b35,
  style: r.style,
})).sort((a, b) => a.brand.localeCompare(b.brand) || a.price.amountRub - b.price.amountRub);
