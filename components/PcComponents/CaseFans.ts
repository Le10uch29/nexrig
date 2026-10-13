import type { FanSpec } from "@/types/hardware";
import { price, slug } from "./shared";

/** 120 mm case fan packs (specs per vendor, unverified). */
type Row = [brand: string, model: string, count: number, rgb: boolean, maxRpm: number, rub: number, color: string, accent: string];

const ROWS: Row[] = [
  ["ARCTIC", "P12 PWM PST", 3, false, 1800, 2400, "#141518", "#2a2c31"],
  ["ARCTIC", "P12 PWM PST", 5, false, 1800, 3700, "#141518", "#2a2c31"],
  ["Thermalright", "TL-C12C", 3, false, 1500, 1800, "#141518", "#3a3d45"],
  ["be quiet!", "Silent Wings 4", 3, false, 1600, 7500, "#141518", "#e09a2b"],
  ["Noctua", "NF-A12x25 PWM", 2, false, 2000, 6900, "#d8c3a5", "#6b3a2e"],
  ["Noctua", "NF-A12x25 PWM", 3, false, 2000, 10200, "#d8c3a5", "#6b3a2e"],
  ["Lian Li", "UNI FAN SL120 V2", 3, true, 2100, 8900, "#141518", "#8b8fff"],
  ["Lian Li", "UNI FAN TL120", 3, true, 2600, 9900, "#e9eaee", "#8b8fff"],
  ["Corsair", "iCUE LINK RX120 RGB", 3, true, 2100, 11000, "#141518", "#8b8fff"],
];

export const CASE_FANS: FanSpec[] = ROWS.map(([brand, model, count, rgb, maxRpm, rub, color, accent]): FanSpec => ({
  id: slug(`${brand}-${model}-x${count}`),
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
})).sort((a, b) => a.price.amountRub - b.price.amountRub);
