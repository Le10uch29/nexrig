import type { MemoryType, RamSpec } from "@/types/hardware";
import { BLACK, price, slug, WHITE, withColorVariants } from "./shared";

/**
 * Memory modules DDR3 → DDR5. One entry = ONE module; the number of modules is chosen in the build.
 * Lines and their typical capacities/speeds are real; each individual capacity × speed combination
 * is generated from the line template and must be checked against the vendor's SKU list.
 */
interface RamLine {
  brand: string;
  line: string;
  type: MemoryType;
  heightMm: number;
  rgb: boolean;
  color: string;
  accent: string;
  sizes: number[];
  /** [MT/s, CAS latency] */
  speeds: [number, number][];
  premium?: boolean;
  /** The line is also sold in this colour. */
  alt?: "white" | "black";
}

const LINES: RamLine[] = [
  // DDR3
  { brand: "Kingston", line: "HyperX Fury", type: "DDR3", heightMm: 33, rgb: false, color: "#1a1b1f", accent: "#2f6fd6", sizes: [4, 8], speeds: [[1600, 10], [1866, 10]] },
  { brand: "Corsair", line: "Vengeance LP", type: "DDR3", heightMm: 34, rgb: false, color: "#141518", accent: "#2a2c31", sizes: [4, 8], speeds: [[1600, 9], [1866, 10]] },
  { brand: "G.Skill", line: "Ripjaws X", type: "DDR3", heightMm: 40, rgb: false, color: "#8a1c24", accent: "#2a2c31", sizes: [4, 8], speeds: [[1600, 9], [1866, 9], [2133, 9]] },
  { brand: "Crucial", line: "Ballistix Sport", type: "DDR3", heightMm: 39, rgb: false, color: "#3b3f46", accent: "#d0d3da", sizes: [4, 8], speeds: [[1600, 9]] },
  // DDR4
  { brand: "Corsair", line: "Vengeance LPX", type: "DDR4", heightMm: 34, rgb: false, color: "#141518", accent: "#2a2c31", sizes: [8, 16, 32], speeds: [[2666, 16], [3200, 16], [3600, 18]] },
  { brand: "Corsair", line: "Vengeance RGB Pro", type: "DDR4", heightMm: 51, rgb: true, color: "#141518", accent: "#8b8fff", sizes: [8, 16], speeds: [[3200, 16], [3600, 18]], premium: true },
  { brand: "Kingston", line: "FURY Beast", type: "DDR4", heightMm: 34, rgb: false, color: "#18191c", accent: "#3b3e45", sizes: [8, 16, 32], speeds: [[3200, 16], [3600, 17]] },
  { brand: "G.Skill", line: "Ripjaws V", type: "DDR4", heightMm: 42, rgb: false, color: "#8a1c24", accent: "#2a2c31", sizes: [8, 16, 32], speeds: [[3200, 16], [3600, 18]] },
  { brand: "G.Skill", line: "Trident Z Neo", type: "DDR4", heightMm: 44, rgb: true, color: "#c9ccd2", accent: "#8b8fff", sizes: [16, 32], speeds: [[3600, 16], [4000, 18]], premium: true },
  { brand: "Crucial", line: "Basics", type: "DDR4", heightMm: 31, rgb: false, color: "#1d4d3a", accent: "#2a2c31", sizes: [8, 16, 32], speeds: [[2666, 19], [3200, 22]] },
  // DDR5
  { brand: "Corsair", line: "Vengeance", type: "DDR5", heightMm: 35, rgb: false, alt: "white", color: "#141518", accent: "#2a2c31", sizes: [16, 24, 32, 48], speeds: [[5600, 36], [6000, 30], [6400, 32]] },
  { brand: "Corsair", line: "Vengeance RGB", type: "DDR5", heightMm: 44, rgb: true, alt: "white", color: "#141518", accent: "#8b8fff", sizes: [16, 32], speeds: [[6000, 30], [6400, 32], [7200, 34]], premium: true },
  { brand: "Kingston", line: "FURY Beast", type: "DDR5", heightMm: 35, rgb: false, alt: "white", color: "#18191c", accent: "#3b3e45", sizes: [16, 32], speeds: [[5600, 40], [6000, 36], [6400, 32]] },
  { brand: "Kingston", line: "FURY Renegade", type: "DDR5", heightMm: 39, rgb: false, color: "#202226", accent: "#c4304a", sizes: [16, 24, 32, 48], speeds: [[6400, 32], [7200, 38], [8000, 38]], premium: true },
  { brand: "G.Skill", line: "Trident Z5 RGB", type: "DDR5", heightMm: 44, rgb: true, alt: "white", color: "#c9ccd2", accent: "#8b8fff", sizes: [16, 24, 32, 48], speeds: [[6000, 30], [6400, 32], [7200, 34], [8000, 38]], premium: true },
  { brand: "G.Skill", line: "Flare X5", type: "DDR5", heightMm: 33, rgb: false, color: "#141518", accent: "#c4304a", sizes: [16, 24, 32], speeds: [[6000, 30]] },
  { brand: "Crucial", line: "Pro", type: "DDR5", heightMm: 39, rgb: false, color: "#2a2c31", accent: "#9aa0aa", sizes: [16, 24, 32, 48], speeds: [[5600, 46], [6000, 36]] },
  { brand: "TeamGroup", line: "T-Force Delta RGB", type: "DDR5", heightMm: 47, rgb: true, alt: "black", color: "#e9eaee", accent: "#8b8fff", sizes: [16, 32], speeds: [[6000, 30], [6400, 32]] },
];

const PER_GB: Record<MemoryType, number> = { DDR3: 120, DDR4: 170, DDR5: 240 };
const BASE_SPEED: Record<MemoryType, number> = { DDR3: 1600, DDR4: 2666, DDR5: 5600 };
const YEAR: Record<MemoryType, number> = { DDR3: 2012, DDR4: 2017, DDR5: 2022 };

const ALT = new Map<string, RamLine["alt"]>();

const BASE: RamSpec[] = LINES.flatMap((l) =>
  l.sizes.flatMap((size) =>
    l.speeds.map(([mt, cl]): RamSpec => {
      const speedPremium = 1 + Math.max(0, mt / BASE_SPEED[l.type] - 1) * 1.2;
      const rub = size * PER_GB[l.type] * speedPremium * (l.rgb ? 1.12 : 1) * (l.premium ? 1.1 : 1) + 600;
      const id = slug(`${l.brand}-${l.line}-${l.type}-${size}gb-${mt}-cl${cl}`);
      ALT.set(id, l.alt);
      return {
        id,
        category: "ram",
        brand: l.brand,
        model: `${l.line} ${l.type}-${mt} CL${cl}, 1 × ${size} ГБ`,
        name: `${l.brand} ${l.line} ${size} ГБ ${l.type}-${mt}`,
        price: price(rub),
        dataQuality: "approximate",
        variantNote: "Комбинация объёма и частоты сформирована по линейке производителя — проверьте наличие точного артикула.",
        visual: { color: l.color, accent: l.accent },
        releaseYear: YEAR[l.type],
        type: l.type,
        line: l.line,
        moduleSizeGb: size,
        speedMtps: mt,
        casLatency: cl,
        heightMm: l.heightMm,
        rgb: l.rgb,
      };
    }),
  ),
);

export const RAM: RamSpec[] = withColorVariants(BASE, (r) => {
  const alt = ALT.get(r.id);
  if (!alt) return undefined;
  return alt === "white" ? { base: "black", variants: [{ colorway: "white", ...WHITE }] } : { base: "white", variants: [{ colorway: "black", ...BLACK }] };
}).sort((a, b) => b.type.localeCompare(a.type) || a.moduleSizeGb - b.moduleSizeGb || a.speedMtps - b.speedMtps);
