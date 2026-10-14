import type { GpuPowerConnector, GpuSpec, PcieGen } from "@/types/hardware";
import { GENERATED_VARIANT_NOTE, price, slug } from "./shared";

/** Reference chip specification (transcribed, unverified) plus estimation-model parameters. */
export interface GpuChip {
  chip: string;
  series: string;
  arch: string;
  year: number;
  shaders: number;
  boostMhz: number;
  vramGb: number;
  memType: string;
  busBits: number;
  tbpW: number;
  psuW: number;
  power: [GpuPowerConnector, number][];
  pcieGen: PcieGen;
  lanes: 4 | 8 | 16;
  rt: boolean;
  /** Relative raster index, RTX 4070 = 100 (model parameter, not a measurement). */
  raster: number;
  /** Indicative demo price of a base partner card, RUB. */
  basePrice: number;
}

export type LineTier = "entry" | "mid" | "premium";

export interface GpuLine {
  brand: string;
  line: string;
  tier: LineTier;
  color: string;
  accent: string;
  /** Which chips this line plausibly covers. */
  covers: (c: GpuChip) => boolean;
  /** Optional per-chip line naming (e.g. MSI Ventus 2X/3X). */
  lineName?: (c: GpuChip) => string;
  /** Whether the line has RGB/ARGB lighting. */
  rgb?: boolean;
}

/** Reference / Founders Edition cards with known dimensions. */
export interface ReferenceCard {
  chip: string;
  brand: string;
  line: string;
  lengthMm: number;
  slots: number;
  power?: [GpuPowerConnector, number][];
  /** Fan count of the reference design (1 = blower). */
  fans?: number;
  color: string;
  accent: string;
}

/** RT throughput relative to raster, per architecture (model parameter). */
const RT_FACTOR: Record<string, number> = {
  Turing: 0.8,
  Ampere: 0.95,
  "Ada Lovelace": 1.0,
  Blackwell: 1.04,
  "RDNA 2": 0.62,
  "RDNA 3": 0.72,
  "RDNA 4": 0.9,
};

const TIER = {
  entry: { lenAdd: 0, slotAdd: 0, priceMul: 1.0 },
  mid: { lenAdd: 15, slotAdd: 0.5, priceMul: 1.08 },
  premium: { lenAdd: 32, slotAdd: 0.75, priceMul: 1.2 },
} as const;

function baseLength(tbp: number) {
  if (tbp <= 80) return 175;
  if (tbp <= 130) return 210;
  if (tbp <= 180) return 245;
  if (tbp <= 230) return 270;
  if (tbp <= 300) return 295;
  if (tbp <= 380) return 318;
  return 336;
}

function baseSlots(tbp: number) {
  if (tbp <= 180) return 2;
  if (tbp <= 300) return 2.5;
  return 3;
}

function upscalersFor(c: GpuChip, vendor: "NVIDIA" | "AMD"): GpuSpec["upscalers"] {
  if (vendor === "NVIDIA") return c.rt ? ["DLSS", "FSR", "XeSS"] : ["FSR", "XeSS"];
  // XeSS DP4a path needs DP4a; Polaris/Vega lack it.
  return c.arch === "GCN 4" || c.arch === "GCN 5" ? ["FSR"] : ["FSR", "XeSS"];
}

function card(
  c: GpuChip,
  vendor: "NVIDIA" | "AMD",
  brand: string,
  line: string,
  dims: { lengthMm: number; slots: number },
  priceMul: number,
  visual: { color: string; accent: string },
  generated: boolean,
  power?: [GpuPowerConnector, number][],
  look: { fans: number; rgb: boolean } = { fans: 2, rgb: false },
): GpuSpec {
  const vendorLabel = vendor === "NVIDIA" ? "GeForce" : "Radeon";
  return {
    id: slug(`${brand}-${line}-${c.chip}`),
    category: "gpu",
    brand,
    // Chips with several memory sizes carry it in the name ("RTX 4060 Ti 16 ГБ").
    model: `${line} ${vendorLabel} ${c.chip}${c.chip.includes("ГБ") ? "" : ` ${c.vramGb} ГБ`}`,
    name: `${brand} ${line} ${c.chip}`,
    price: price(c.basePrice * priceMul),
    dataQuality: generated ? "approximate" : "manufacturer-unverified",
    variantNote: generated ? GENERATED_VARIANT_NOTE : undefined,
    visual,
    releaseYear: c.year,
    chipVendor: vendor,
    chip: c.chip,
    line,
    series: c.series,
    architecture: c.arch,
    shaderUnits: c.shaders,
    boostClockMhz: c.boostMhz,
    vramGb: c.vramGb,
    memoryType: c.memType,
    busWidthBits: c.busBits,
    lengthMm: dims.lengthMm,
    slots: dims.slots,
    boardPowerW: c.tbpW,
    powerConnectors: (power ?? c.power).map(([type, count]) => ({ type, count })),
    recommendedPsuW: c.psuW,
    pcieGen: c.pcieGen,
    pcieLanes: c.lanes,
    rayTracing: c.rt,
    rasterIndex: c.raster,
    rtIndex: c.rt ? Math.round(c.raster * (RT_FACTOR[c.arch] ?? 0.8)) : 0,
    upscalers: upscalersFor(c, vendor),
    fans: look.fans,
    rgb: look.rgb,
  };
}

/** Typical fan count for a partner design of this length and tier (template value). */
function partnerFans(tier: LineTier, lengthMm: number, lineName: string) {
  if (/2X/.test(lineName)) return 2;
  if (/3X|Trio/.test(lineName)) return 3;
  if (lengthMm < 190) return 1;
  if (tier === "entry") return lengthMm > 285 ? 3 : 2;
  return lengthMm > 255 ? 3 : 2;
}

/** Expands chips × partner lines (+ reference cards) into a sorted list of cards. */
export function buildGpuCatalogue(vendor: "NVIDIA" | "AMD", chips: GpuChip[], lines: GpuLine[], refs: ReferenceCard[]): GpuSpec[] {
  const out: GpuSpec[] = [];
  for (const c of chips) {
    for (const ref of refs.filter((r) => r.chip === c.chip)) {
      out.push(
        card(c, vendor, ref.brand, ref.line, { lengthMm: ref.lengthMm, slots: ref.slots }, 1.0, { color: ref.color, accent: ref.accent }, false, ref.power, {
          fans: ref.fans ?? 2,
          rgb: false,
        }),
      );
    }
    for (const l of lines) {
      if (!l.covers(c)) continue;
      const t = TIER[l.tier];
      const lengthMm = Math.min(360, baseLength(c.tbpW) + t.lenAdd);
      const slots = Math.min(4, baseSlots(c.tbpW) + t.slotAdd);
      const name = l.lineName?.(c) ?? l.line;
      out.push(
        card(c, vendor, l.brand, name, { lengthMm, slots }, t.priceMul, { color: l.color, accent: l.accent }, true, undefined, {
          fans: partnerFans(l.tier, lengthMm, name),
          rgb: Boolean(l.rgb),
        }),
      );
    }
  }
  // Newest generation first, then fastest chip, then cheapest variant.
  return out.sort((a, b) => (b.releaseYear ?? 0) - (a.releaseYear ?? 0) || b.rasterIndex - a.rasterIndex || a.price.amountRub - b.price.amountRub);
}
