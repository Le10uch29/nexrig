import type { FanSpec } from "@/types/hardware";
import { BLACK, price, slug, WHITE, withColorVariants } from "./shared";

/**
 * 120 mm case fan packs (specs per vendor, unverified). Reverse-blade versions are made for
 * bottom/side intake in aquarium cases: the clean blade side faces the glass.
 */
type Row = [brand: string, model: string, count: number, rgb: boolean, maxRpm: number, rub: number, color: string, accent: string, opts?: { reverse?: boolean; alt?: "white" | "black" }];

const ROWS: Row[] = [
  ["ARCTIC", "P12 PWM PST", 3, false, 1800, 2400, "#141518", "#2a2c31", { alt: "white" }],
  ["ARCTIC", "P12 PWM PST", 5, false, 1800, 3700, "#141518", "#2a2c31", { alt: "white" }],
  ["Thermalright", "TL-C12C", 3, false, 1500, 1800, "#141518", "#3a3d45"],
  ["be quiet!", "Silent Wings 4", 3, false, 1600, 7500, "#141518", "#e09a2b"],
  ["Noctua", "NF-A12x25 PWM", 2, false, 2000, 6900, "#d8c3a5", "#6b3a2e"],
  ["Noctua", "NF-A12x25 PWM", 3, false, 2000, 10200, "#d8c3a5", "#6b3a2e"],
  ["Lian Li", "UNI FAN SL120 V2", 3, true, 2100, 8900, "#141518", "#8b8fff", { alt: "white" }],
  ["Lian Li", "UNI FAN SL-INF 120 Reverse Blade", 3, true, 2100, 10500, "#141518", "#8b8fff", { reverse: true, alt: "white" }],
  ["Lian Li", "UNI FAN TL120", 3, true, 2600, 9900, "#e9eaee", "#8b8fff", { alt: "black" }],
  ["Lian Li", "UNI FAN TL120 Reverse Blade", 3, true, 2600, 10500, "#e9eaee", "#8b8fff", { reverse: true, alt: "black" }],
  ["Corsair", "iCUE LINK RX120 RGB", 3, true, 2100, 11000, "#141518", "#8b8fff", { alt: "white" }],
  ["Corsair", "iCUE LINK RX120 RGB Reverse", 3, true, 2100, 11500, "#141518", "#8b8fff", { reverse: true, alt: "white" }],
  ["Thermalright", "TL-C12C", 5, false, 1500, 2800, "#141518", "#3a3d45", { alt: "white" }],
];

const ALT = new Map<string, "white" | "black" | undefined>();

const BASE: FanSpec[] = ROWS.map(([brand, model, count, rgb, maxRpm, rub, color, accent, opts]): FanSpec => {
  const id = slug(`${brand}-${model}-x${count}`);
  ALT.set(id, opts?.alt);
  return {
  id,
  category: "fans",
  brand,
  model: `${model} (${count} шт.)`,
  name: `${brand} ${model} ×${count}`,
  price: price(rub),
  dataQuality: "manufacturer-unverified",
  visual: { color, accent },
  sizeMm: 120,
  count,
  rgb,
  maxRpm,
  ...(opts?.reverse ? { reverse: true } : {}),
  };
});

export const CASE_FANS: FanSpec[] = withColorVariants(BASE, (f) => {
  const alt = ALT.get(f.id);
  if (!alt) return undefined;
  return alt === "white" ? { base: "black", variants: [{ colorway: "white", ...WHITE }] } : { base: "white", variants: [{ colorway: "black", ...BLACK }] };
}).sort((a, b) => a.price.amountRub - b.price.amountRub);
