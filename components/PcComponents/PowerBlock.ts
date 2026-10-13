import type { PsuSpec } from "@/types/hardware";
import { price, slug } from "./shared";

/**
 * Power supplies, 500 W and up. Line names, efficiency and ATX 3.x / 12V-2x6 status per vendor
 * (unverified). Native 8-pin PCIe counts are typical per wattage, not per exact SKU.
 */
interface PsuLine {
  brand: string;
  /** Model name template; "{w}" is replaced with the wattage. */
  model: string;
  watts: number[];
  efficiency: PsuSpec["efficiency"];
  atx3: boolean;
  modular: PsuSpec["modular"];
  sfx?: boolean;
  year: number;
  rubPerW: number;
  color: string;
  accent: string;
}

const LINES: PsuLine[] = [
  { brand: "Corsair", model: "CX{w}", watts: [550, 650, 750], efficiency: "80+ Bronze", atx3: false, modular: "none", year: 2017, rubPerW: 10, color: "#141518", accent: "#2a2c31" },
  { brand: "Corsair", model: "RM{w}e (ATX 3.0)", watts: [650, 750, 850], efficiency: "80+ Gold", atx3: true, modular: "full", year: 2023, rubPerW: 14.5, color: "#141518", accent: "#2a2c31" },
  { brand: "Corsair", model: "RM{w}x (ATX 3.1)", watts: [850, 1000, 1200], efficiency: "80+ Gold", atx3: true, modular: "full", year: 2024, rubPerW: 17, color: "#141518", accent: "#e8d36a" },
  { brand: "Corsair", model: "SF{w} Platinum", watts: [600, 750], efficiency: "80+ Platinum", atx3: false, modular: "full", sfx: true, year: 2018, rubPerW: 23, color: "#141518", accent: "#2a2c31" },
  { brand: "Seasonic", model: "FOCUS GX-{w} ATX 3.0", watts: [650, 750, 850, 1000], efficiency: "80+ Gold", atx3: true, modular: "full", year: 2023, rubPerW: 17.5, color: "#141518", accent: "#2a2c31" },
  { brand: "Seasonic", model: "PRIME TX-{w}", watts: [1000, 1300], efficiency: "80+ Titanium", atx3: true, modular: "full", year: 2023, rubPerW: 32, color: "#141518", accent: "#c9ccd2" },
  { brand: "be quiet!", model: "System Power 10 {w}W", watts: [550, 650, 750], efficiency: "80+ Bronze", atx3: false, modular: "none", year: 2021, rubPerW: 10.5, color: "#141518", accent: "#e09a2b" },
  { brand: "be quiet!", model: "Pure Power 12 M {w}W", watts: [550, 650, 750, 850, 1000], efficiency: "80+ Gold", atx3: true, modular: "full", year: 2023, rubPerW: 17.5, color: "#141518", accent: "#e09a2b" },
  { brand: "be quiet!", model: "Straight Power 12 {w}W", watts: [750, 850, 1000], efficiency: "80+ Platinum", atx3: true, modular: "full", year: 2023, rubPerW: 23, color: "#141518", accent: "#e09a2b" },
  { brand: "be quiet!", model: "Dark Power 13 {w}W", watts: [850, 1000], efficiency: "80+ Titanium", atx3: true, modular: "full", year: 2023, rubPerW: 30, color: "#141518", accent: "#e09a2b" },
  { brand: "Cooler Master", model: "MWE Gold {w} V2", watts: [550, 650, 750, 850], efficiency: "80+ Gold", atx3: false, modular: "full", year: 2020, rubPerW: 11.5, color: "#18191c", accent: "#3a3d45" },
  { brand: "DeepCool", model: "PK{w}D", watts: [550, 650, 750], efficiency: "80+ Bronze", atx3: false, modular: "none", year: 2022, rubPerW: 9, color: "#141518", accent: "#3a3d45" },
  { brand: "DeepCool", model: "PN{w}M", watts: [650, 750, 850], efficiency: "80+ Gold", atx3: true, modular: "full", year: 2024, rubPerW: 13, color: "#141518", accent: "#3a3d45" },
  { brand: "MSI", model: "MAG A{w}GL", watts: [650, 750, 850], efficiency: "80+ Gold", atx3: true, modular: "full", year: 2023, rubPerW: 13.5, color: "#141518", accent: "#d23a3a" },
  { brand: "Thermaltake", model: "Toughpower GF3 {w}W", watts: [850, 1000, 1200], efficiency: "80+ Gold", atx3: true, modular: "full", year: 2022, rubPerW: 16, color: "#141518", accent: "#3a3d45" },
  { brand: "ASUS", model: "TUF Gaming {w}W Gold", watts: [750, 850, 1000], efficiency: "80+ Gold", atx3: true, modular: "full", year: 2023, rubPerW: 15, color: "#202226", accent: "#b9a046" },
];

/** Typical native 6+2-pin count; ATX 3.x units trade some for the 12V-2x6 connector. */
function pcie8pinFor(watts: number, atx3: boolean) {
  if (watts <= 550) return 2;
  if (watts <= 650) return atx3 ? 2 : 2;
  if (watts <= 750) return atx3 ? 2 : 4;
  if (watts <= 850) return atx3 ? 3 : 4;
  if (watts <= 1000) return atx3 ? 4 : 6;
  return 6;
}

export const POWER_BLOCKS: PsuSpec[] = LINES.flatMap((l) =>
  l.watts.map((w): PsuSpec => {
    const model = l.model.replace("{w}", String(w));
    return {
      id: slug(`${l.brand}-${model}`),
      category: "psu",
      brand: l.brand,
      model,
      name: `${l.brand} ${model}`,
      price: price(w * l.rubPerW + 1500),
      dataQuality: "manufacturer-unverified",
      variantNote: "Количество 8-pin PCIe указано типовое для этой мощности — сверьте комплект кабелей конкретного блока.",
      visual: { color: l.color, accent: l.accent },
      releaseYear: l.year,
      wattage: w,
      formFactor: l.sfx ? "SFX" : "ATX",
      efficiency: l.efficiency,
      atx3: l.atx3,
      pcie8pin: pcie8pinFor(w, l.atx3),
      native12v2x6: l.atx3 ? 1 : 0,
      modular: l.modular,
    };
  }),
).sort((a, b) => a.wattage - b.wattage || a.price.amountRub - b.price.amountRub);
