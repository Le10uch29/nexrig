import type { BoardFormFactor, CaseSpec, FanPosition, RadiatorMount } from "@/types/hardware";
import { BLACK, price, slug, WHITE, withColorVariants } from "./shared";

/**
 * PC cases. Clearances, bays, expansion slots and radiator positions transcribed from public
 * data (unverified). Radiator positions/sizes can differ between revisions and depend on other
 * parts (e.g. RAM height for top mounts) — entries with less certain figures are "approximate".
 *
 * "Aquarium" (panoramic glass, dual-chamber) cases keep the PSU and drives behind the
 * motherboard tray and take intake fans at the bottom and side instead of the front.
 */
type Row = {
  brand: string;
  model: string;
  boards: BoardFormFactor[];
  sfx?: boolean;
  dims: [number, number, number]; // width, height, depth (mm)
  gpu: number;
  cooler: number;
  mounts: RadiatorMount[];
  slots: number;
  fans: number;
  /** Explicit fan slots per position; otherwise derived (rear, front, top, then bottom on the shroud). */
  fm?: Partial<Record<FanPosition, number>>;
  dual?: boolean;
  b25: number;
  b35: number;
  style: CaseSpec["style"];
  rub: number;
  color: string;
  accent: string;
  year: number;
  approximate?: boolean;
  /** The product is also sold in the other colour. */
  alt?: "white" | "black";
};

const ATX: BoardFormFactor[] = ["ATX", "mATX", "ITX"];
const MATX: BoardFormFactor[] = ["mATX", "ITX"];
const R = (position: RadiatorMount["position"], ...sizesMm: number[]): RadiatorMount => ({ position, sizesMm });
const W = WHITE.color;
const WA = WHITE.accent;

const ROWS: Row[] = [
  // Classic layout (PSU shroud, front intake)
  { brand: "Fractal Design", model: "North", boards: ATX, dims: [215, 469, 447], gpu: 355, cooler: 170, mounts: [R("front", 240, 280, 360), R("top", 240)], slots: 7, fans: 6, b25: 2, b35: 2, style: "mesh", rub: 13900, color: "#1b1d22", accent: "#6b4a2f", year: 2022, alt: "white" },
  { brand: "Fractal Design", model: "North XL", boards: ATX, dims: [240, 509, 503], gpu: 413, cooler: 185, mounts: [R("front", 240, 280, 360, 420), R("top", 240, 280, 360)], slots: 7, fans: 9, b25: 3, b35: 2, style: "mesh", rub: 17900, color: "#1b1d22", accent: "#6b4a2f", year: 2023, alt: "white" },
  { brand: "Fractal Design", model: "Meshify 2 Compact", boards: ATX, dims: [210, 474, 424], gpu: 360, cooler: 169, mounts: [R("front", 240, 280, 360), R("top", 240, 280)], slots: 7, fans: 7, b25: 2, b35: 2, style: "mesh", rub: 11900, color: "#141518", accent: "#2b2f36", year: 2021, alt: "white" },
  { brand: "Fractal Design", model: "Pop Air", boards: ATX, dims: [215, 474, 454], gpu: 405, cooler: 170, mounts: [R("front", 240, 280, 360), R("top", 240, 280)], slots: 7, fans: 6, b25: 2, b35: 2, style: "mesh", rub: 8500, color: "#141518", accent: "#2b2f36", year: 2022, alt: "white" },
  { brand: "Lian Li", model: "Lancool 216", boards: ATX, dims: [235, 491, 480], gpu: 392, cooler: 180, mounts: [R("front", 240, 280, 360), R("top", 240, 280, 360)], slots: 7, fans: 9, b25: 4, b35: 2, style: "mesh", rub: 9500, color: "#141518", accent: "#2b2f36", year: 2023, alt: "white" },
  { brand: "Lian Li", model: "Lancool 207", boards: ATX, dims: [218, 442, 451], gpu: 375, cooler: 175, mounts: [R("front", 240, 280, 360), R("top", 240)], slots: 7, fans: 7, b25: 2, b35: 1, style: "mesh", rub: 8500, color: "#141518", accent: "#2b2f36", year: 2024, approximate: true, alt: "white" },
  { brand: "Lian Li", model: "Lancool 217", boards: ATX, dims: [238, 503, 482], gpu: 400, cooler: 180, mounts: [R("front", 240, 280, 360), R("top", 240, 280, 360)], slots: 7, fans: 10, b25: 4, b35: 2, style: "mesh", rub: 12500, color: "#141518", accent: "#6b4a2f", year: 2024, approximate: true, alt: "white" },
  { brand: "Lian Li", model: "Lancool III", boards: ATX, dims: [238, 526, 530], gpu: 435, cooler: 187, mounts: [R("front", 240, 280, 360, 420), R("top", 240, 280, 360, 420)], slots: 7, fans: 10, b25: 4, b35: 2, style: "mesh", rub: 14500, color: "#141518", accent: "#2b2f36", year: 2022, alt: "white" },
  { brand: "Corsair", model: "3000D Airflow", boards: ATX, dims: [230, 466, 462], gpu: 360, cooler: 170, mounts: [R("front", 240, 280, 360), R("top", 240, 280, 360)], slots: 7, fans: 8, b25: 2, b35: 2, style: "mesh", rub: 7500, color: "#121316", accent: "#2b2f36", year: 2023, alt: "white" },
  { brand: "Corsair", model: "4000D Airflow", boards: ATX, dims: [230, 466, 453], gpu: 360, cooler: 170, mounts: [R("front", 240, 280, 360), R("top", 240, 280)], slots: 7, fans: 6, b25: 2, b35: 2, style: "mesh", rub: 9400, color: "#121316", accent: "#2b2f36", year: 2020, alt: "white" },
  { brand: "Corsair", model: "5000D Airflow", boards: ATX, dims: [245, 520, 520], gpu: 420, cooler: 170, mounts: [R("front", 240, 280, 360), R("top", 240, 280, 360), R("side", 240, 280, 360)], slots: 7, fans: 10, b25: 4, b35: 2, style: "mesh", rub: 15000, color: "#121316", accent: "#2b2f36", year: 2020, alt: "white" },
  { brand: "NZXT", model: "H5 Flow", boards: ATX, dims: [227, 464, 446], gpu: 365, cooler: 165, mounts: [R("front", 240, 280), R("top", 240)], slots: 7, fans: 5, b25: 2, b35: 1, style: "mesh", rub: 8900, color: W, accent: WA, year: 2022, alt: "black" },
  { brand: "NZXT", model: "H7 Flow", boards: ATX, dims: [230, 505, 480], gpu: 400, cooler: 185, mounts: [R("front", 240, 280, 360), R("top", 240, 280, 360)], slots: 7, fans: 9, b25: 2, b35: 2, style: "mesh", rub: 13000, color: "#1b1c20", accent: "#c9ccd4", year: 2022, alt: "white" },
  { brand: "Phanteks", model: "Eclipse P400A", boards: ATX, dims: [210, 465, 470], gpu: 420, cooler: 160, mounts: [R("front", 240, 280, 360), R("top", 240)], slots: 7, fans: 6, b25: 2, b35: 2, style: "mesh", rub: 7500, color: "#141518", accent: "#2b2f36", year: 2020, approximate: true, alt: "white" },
  { brand: "Phanteks", model: "NV5", boards: ATX, dims: [245, 530, 520], gpu: 415, cooler: 175, mounts: [R("top", 240, 280, 360), R("side", 240, 280, 360)], slots: 7, fans: 10, fm: { top: 3, side: 3, bottom: 3, rear: 1 }, b25: 2, b35: 2, style: "glass-showcase", rub: 10500, color: "#141518", accent: "#2b2f36", year: 2023, approximate: true, alt: "white" },
  { brand: "be quiet!", model: "Pure Base 500DX", boards: ATX, dims: [232, 463, 450], gpu: 369, cooler: 190, mounts: [R("front", 240, 280, 360), R("top", 240, 280)], slots: 7, fans: 5, b25: 5, b35: 2, style: "mesh", rub: 10500, color: "#141518", accent: "#e09a2b", year: 2020, alt: "white" },
  { brand: "Montech", model: "AIR 903 MAX", boards: ATX, dims: [230, 504, 488], gpu: 400, cooler: 180, mounts: [R("front", 240, 280, 360), R("top", 240, 280, 360)], slots: 7, fans: 9, b25: 2, b35: 2, style: "mesh", rub: 8500, color: "#141518", accent: "#2b2f36", year: 2023, approximate: true, alt: "white" },
  { brand: "DeepCool", model: "CH560", boards: ATX, dims: [230, 467, 467], gpu: 380, cooler: 175, mounts: [R("front", 240, 280, 360), R("top", 240, 280, 360)], slots: 7, fans: 9, b25: 2, b35: 2, style: "mesh", rub: 7500, color: "#141518", accent: "#2b2f36", year: 2023, approximate: true, alt: "white" },
  { brand: "Cooler Master", model: "MasterBox Q300L", boards: MATX, dims: [230, 387, 387], gpu: 360, cooler: 159, mounts: [R("front", 240)], slots: 4, fans: 4, b25: 2, b35: 1, style: "mesh", rub: 4500, color: "#141518", accent: "#2b2f36", year: 2018, approximate: true },
  { brand: "Jonsbo", model: "D31 Mesh", boards: MATX, dims: [205, 410, 400], gpu: 400, cooler: 168, mounts: [R("side", 240, 280, 360), R("top", 240)], slots: 4, fans: 6, b25: 2, b35: 1, style: "mesh", rub: 7500, color: W, accent: WA, year: 2023, approximate: true, alt: "black" },
  { brand: "Lian Li", model: "A3-mATX", boards: MATX, dims: [193, 444, 406], gpu: 415, cooler: 165, mounts: [R("top", 240, 280, 360), R("side", 240, 360)], slots: 4, fans: 9, fm: { top: 3, side: 3, bottom: 2, rear: 1 }, b25: 2, b35: 0, style: "mesh", rub: 7500, color: "#141518", accent: "#2b2f36", year: 2024, approximate: true, alt: "white" },
  { brand: "Cooler Master", model: "MasterBox NR200P", boards: ["ITX"], sfx: true, dims: [185, 292, 376], gpu: 330, cooler: 155, mounts: [R("side", 240, 280), R("bottom", 240, 280)], slots: 3, fans: 4, fm: { top: 2, bottom: 2 }, b25: 3, b35: 1, style: "compact", rub: 8700, color: "#1a1b1f", accent: "#3a3d45", year: 2020, alt: "white" },

  // Dual-chamber "aquarium" cases: panoramic glass, PSU behind the tray, bottom + side intake
  { brand: "Lian Li", model: "O11 Dynamic EVO", boards: ATX, dims: [285, 459, 465], gpu: 422, cooler: 167, mounts: [R("top", 240, 280, 360), R("side", 240, 280, 360), R("bottom", 240, 280, 360)], slots: 7, fans: 10, fm: { top: 3, side: 3, bottom: 3, rear: 1 }, dual: true, b25: 4, b35: 2, style: "glass-showcase", rub: 15900, color: "#16181d", accent: "#8b8fff", year: 2022, alt: "white" },
  { brand: "Lian Li", model: "O11 Dynamic EVO XL", boards: ATX, dims: [304, 531, 522], gpu: 460, cooler: 167, mounts: [R("top", 240, 280, 360, 420), R("side", 240, 280, 360, 420), R("bottom", 240, 280, 360)], slots: 8, fans: 11, fm: { top: 3, side: 4, bottom: 3, rear: 1 }, dual: true, b25: 4, b35: 2, style: "glass-showcase", rub: 22900, color: "#16181d", accent: "#8b8fff", year: 2023, approximate: true, alt: "white" },
  { brand: "Lian Li", model: "O11 Vision", boards: ATX, dims: [304, 464, 450], gpu: 455, cooler: 167, mounts: [R("top", 240, 280, 360), R("side", 240, 280, 360), R("bottom", 240, 280, 360)], slots: 7, fans: 11, fm: { top: 3, side: 3, bottom: 3, rear: 2 }, dual: true, b25: 4, b35: 2, style: "glass-showcase", rub: 15500, color: "#16181d", accent: "#8b8fff", year: 2023, approximate: true, alt: "white" },
  { brand: "Lian Li", model: "O11D Mini", boards: ATX, dims: [269, 380, 420], gpu: 395, cooler: 170, mounts: [R("top", 240, 280), R("side", 240, 280), R("bottom", 240, 280)], slots: 7, fans: 7, fm: { top: 2, side: 2, bottom: 2, rear: 1 }, dual: true, b25: 4, b35: 2, style: "glass-showcase", rub: 11500, color: "#16181d", accent: "#8b8fff", year: 2020, approximate: true, alt: "white" },
  { brand: "Hyte", model: "Y60", boards: ATX, dims: [285, 462, 456], gpu: 375, cooler: 160, mounts: [R("top", 240, 280), R("side", 240, 280, 360), R("bottom", 240)], slots: 7, fans: 8, fm: { top: 2, side: 3, bottom: 2, rear: 1 }, dual: true, b25: 2, b35: 2, style: "glass-showcase", rub: 17500, color: "#141518", accent: "#c4304a", year: 2022, approximate: true, alt: "white" },
  { brand: "Hyte", model: "Y70", boards: ATX, dims: [320, 518, 470], gpu: 422, cooler: 180, mounts: [R("top", 240, 280, 360), R("side", 240, 280, 360), R("bottom", 240, 280, 360)], slots: 7, fans: 10, fm: { top: 3, side: 3, bottom: 3, rear: 1 }, dual: true, b25: 2, b35: 2, style: "glass-showcase", rub: 22000, color: "#141518", accent: "#c4304a", year: 2023, approximate: true, alt: "white" },
  { brand: "NZXT", model: "H6 Flow", boards: ATX, dims: [287, 435, 415], gpu: 365, cooler: 163, mounts: [R("top", 240, 280, 360), R("side", 240, 280, 360), R("bottom", 240, 280)], slots: 7, fans: 9, fm: { top: 3, side: 3, bottom: 2, rear: 1 }, dual: true, b25: 2, b35: 1, style: "glass-showcase", rub: 11500, color: "#141518", accent: "#c9ccd4", year: 2023, approximate: true, alt: "white" },
  { brand: "NZXT", model: "H9 Flow", boards: ATX, dims: [290, 495, 466], gpu: 435, cooler: 165, mounts: [R("top", 240, 280, 360), R("side", 240, 280, 360), R("bottom", 240, 280, 360)], slots: 7, fans: 10, fm: { top: 3, side: 3, bottom: 3, rear: 1 }, dual: true, b25: 2, b35: 2, style: "glass-showcase", rub: 16500, color: "#141518", accent: "#c9ccd4", year: 2023, approximate: true, alt: "white" },
  { brand: "Corsair", model: "6500X", boards: ATX, dims: [300, 485, 500], gpu: 400, cooler: 190, mounts: [R("top", 240, 280, 360), R("side", 240, 280, 360), R("bottom", 240, 280, 360)], slots: 7, fans: 10, fm: { top: 3, side: 3, bottom: 3, rear: 1 }, dual: true, b25: 2, b35: 2, style: "glass-showcase", rub: 19000, color: "#121316", accent: "#2b2f36", year: 2023, approximate: true, alt: "white" },
  { brand: "Corsair", model: "2500X", boards: MATX, dims: [304, 376, 469], gpu: 400, cooler: 180, mounts: [R("top", 240, 280, 360), R("side", 240), R("bottom", 240, 280, 360)], slots: 4, fans: 8, fm: { top: 3, side: 2, bottom: 2, rear: 1 }, dual: true, b25: 2, b35: 1, style: "glass-showcase", rub: 14500, color: "#121316", accent: "#2b2f36", year: 2023, approximate: true, alt: "white" },
  { brand: "Montech", model: "KING 95 PRO", boards: ATX, dims: [293, 475, 478], gpu: 420, cooler: 175, mounts: [R("top", 240, 280, 360), R("side", 240, 280, 360), R("bottom", 240, 280, 360)], slots: 7, fans: 10, fm: { top: 3, side: 3, bottom: 3, rear: 1 }, dual: true, b25: 2, b35: 2, style: "glass-showcase", rub: 11000, color: "#141518", accent: "#2b2f36", year: 2023, approximate: true, alt: "white" },
  { brand: "Phanteks", model: "NV7", boards: ATX, dims: [298, 586, 547], gpu: 450, cooler: 185, mounts: [R("top", 240, 280, 360, 420), R("side", 240, 280, 360, 420), R("bottom", 240, 280, 360)], slots: 8, fans: 12, fm: { top: 3, side: 4, bottom: 4, rear: 1 }, dual: true, b25: 4, b35: 2, style: "glass-showcase", rub: 21000, color: "#141518", accent: "#2b2f36", year: 2023, approximate: true, alt: "white" },
];

/** Classic cases: one rear exhaust, front intake column, top, then shroud-top bottom slots. */
function deriveFanMounts(r: Row): Partial<Record<FanPosition, number>> {
  if (r.fm) return r.fm;
  const front = Math.min(3, r.fans - 1);
  const top = Math.min(3, r.fans - 1 - front);
  const bottom = Math.max(0, r.fans - 1 - front - top);
  return { front, rear: 1, top, ...(bottom ? { bottom } : {}) };
}

const BASE: CaseSpec[] = ROWS.map((r): CaseSpec => ({
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
  radiatorSupportMm: [...new Set(r.mounts.flatMap((m) => m.sizesMm))].sort((a, b) => a - b),
  radiatorMounts: r.mounts,
  exteriorMm: { width: r.dims[0], height: r.dims[1], depth: r.dims[2] },
  fanSlots120: r.fans,
  fanMounts: deriveFanMounts(r),
  layout: r.dual ? "dual-chamber" : "classic",
  drive25Bays: r.b25,
  drive35Bays: r.b35,
  expansionSlots: r.slots,
  style: r.style,
}));

const ALT = new Map(ROWS.map((r) => [slug(`${r.brand}-${r.model}`), r.alt]));

export const PC_CASES: CaseSpec[] = withColorVariants(BASE, (c) => {
  const alt = ALT.get(c.id);
  if (!alt) return undefined;
  return alt === "white"
    ? { base: "black", variants: [{ colorway: "white", ...WHITE }] }
    : { base: "white", variants: [{ colorway: "black", ...BLACK }] };
}).sort((a, b) => a.brand.localeCompare(b.brand) || a.price.amountRub - b.price.amountRub);
