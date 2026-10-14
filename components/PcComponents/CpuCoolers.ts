import type { CoolerSpec, CpuSocket } from "@/types/hardware";
import { BLACK, price, slug, withColorVariants } from "./shared";

/** White editions of real coolers: fins/shroud and fan frames in white. */
const WHITE_COOLER = { colorway: "white" as const, color: "#eceef2", accent: "#f4f5f7" };
const WHITE_EDITIONS = new Set([
  "deepcool-ak400",
  "deepcool-ak620",
  "deepcool-ls720",
  "thermalright-peerless-assassin-120-se",
  "thermalright-phantom-spirit-120-se",
  "arctic-freezer-36",
  "arctic-liquid-freezer-iii-240",
  "arctic-liquid-freezer-iii-280",
  "arctic-liquid-freezer-iii-360",
  "corsair-icue-h100i-elite-capellix-xt",
  "corsair-icue-h150i-elite-capellix-xt",
]);
/** Sold primarily in white, also in black. */
const BLACK_EDITIONS = new Set(["nzxt-kraken-240", "nzxt-kraken-360"]);

/**
 * CPU coolers: tower air coolers, low-profile and AIO liquid coolers.
 * Socket lists and heights transcribed from public data (unverified); some sockets need a
 * separately sold mounting kit — the compatibility check flags that as "verify" only when known.
 */
const S115X: CpuSocket[] = ["LGA1155", "LGA1150", "LGA1151", "LGA1151-v2", "LGA1200"];
const MODERN: CpuSocket[] = ["AM4", "AM5", "LGA1700", "LGA1851"];

interface Row {
  brand: string;
  model: string;
  kind: "air" | "aio";
  sockets: CpuSocket[];
  heightMm: number;
  radiatorMm?: number;
  maxRamHeightMm?: number;
  ratedTdpW?: number;
  rub: number;
  color: string;
  accent: string;
  year: number;
}

const ROWS: Row[] = [
  { brand: "Cooler Master", model: "Hyper 212 Black Edition", kind: "air", sockets: ["AM3+", "AM4", "AM5", ...S115X, "LGA1700"], heightMm: 159, ratedTdpW: 150, rub: 3000, color: "#1d1e22", accent: "#3a3d45", year: 2019 },
  { brand: "DeepCool", model: "AG400", kind: "air", sockets: ["AM4", "AM5", ...S115X, "LGA1700"], heightMm: 150, ratedTdpW: 220, rub: 2200, color: "#2a2c31", accent: "#9ea3ac", year: 2022 },
  { brand: "DeepCool", model: "AK400", kind: "air", sockets: ["AM4", "AM5", ...S115X, "LGA1700"], heightMm: 155, ratedTdpW: 220, rub: 2900, color: "#2a2c31", accent: "#9ea3ac", year: 2022 },
  { brand: "DeepCool", model: "AK620", kind: "air", sockets: [...MODERN, ...S115X], heightMm: 160, maxRamHeightMm: 43, ratedTdpW: 260, rub: 5500, color: "#2a2c31", accent: "#9ea3ac", year: 2022 },
  { brand: "Thermalright", model: "Assassin X 120 Refined SE", kind: "air", sockets: ["AM4", "AM5", ...S115X, "LGA1700"], heightMm: 148, rub: 1800, color: "#c9ccd2", accent: "#1d1f24", year: 2023 },
  { brand: "Thermalright", model: "Peerless Assassin 120 SE", kind: "air", sockets: [...MODERN, ...S115X], heightMm: 155, maxRamHeightMm: 46, rub: 3900, color: "#c9ccd2", accent: "#1d1f24", year: 2022 },
  { brand: "Thermalright", model: "Phantom Spirit 120 SE", kind: "air", sockets: [...MODERN, ...S115X], heightMm: 154, maxRamHeightMm: 46, rub: 4500, color: "#c9ccd2", accent: "#1d1f24", year: 2023 },
  { brand: "ARCTIC", model: "Freezer 34 eSports DUO", kind: "air", sockets: ["AM4", ...S115X], heightMm: 157, rub: 3500, color: "#1d1e22", accent: "#e6e6e6", year: 2018 },
  { brand: "ARCTIC", model: "Freezer 36", kind: "air", sockets: MODERN, heightMm: 159, rub: 3500, color: "#1d1e22", accent: "#e6e6e6", year: 2023 },
  { brand: "be quiet!", model: "Pure Rock 2", kind: "air", sockets: ["AM4", "AM5", ...S115X, "LGA1700"], heightMm: 155, ratedTdpW: 150, rub: 4500, color: "#2a2c31", accent: "#e09a2b", year: 2020 },
  { brand: "be quiet!", model: "Dark Rock 4", kind: "air", sockets: ["AM3+", "AM4", "AM5", ...S115X, "LGA1700"], heightMm: 159, ratedTdpW: 200, rub: 7500, color: "#141518", accent: "#3a3d45", year: 2018 },
  { brand: "be quiet!", model: "Dark Rock Pro 5", kind: "air", sockets: [...MODERN, ...S115X], heightMm: 168, maxRamHeightMm: 40, ratedTdpW: 270, rub: 10500, color: "#141518", accent: "#3a3d45", year: 2023 },
  { brand: "Noctua", model: "NH-U12S", kind: "air", sockets: [...MODERN, ...S115X], heightMm: 158, rub: 7900, color: "#d8c3a5", accent: "#6b3a2e", year: 2013 },
  { brand: "Noctua", model: "NH-D15", kind: "air", sockets: ["AM3+", ...MODERN, ...S115X], heightMm: 165, maxRamHeightMm: 32, rub: 11900, color: "#d8c3a5", accent: "#6b3a2e", year: 2014 },
  { brand: "Noctua", model: "NH-D15 G2", kind: "air", sockets: MODERN, heightMm: 168, maxRamHeightMm: 32, rub: 15900, color: "#d8c3a5", accent: "#6b3a2e", year: 2024 },
  { brand: "Noctua", model: "NH-L9a-AM5", kind: "air", sockets: ["AM4", "AM5"], heightMm: 37, rub: 5900, color: "#d8c3a5", accent: "#6b3a2e", year: 2022 },
  { brand: "Noctua", model: "NH-L9i-17xx", kind: "air", sockets: ["LGA1700", "LGA1851"], heightMm: 37, rub: 5900, color: "#d8c3a5", accent: "#6b3a2e", year: 2022 },
  { brand: "DeepCool", model: "LE520", kind: "aio", sockets: ["AM4", "AM5", ...S115X, "LGA1700"], heightMm: 50, radiatorMm: 240, rub: 6500, color: "#141518", accent: "#3c3f46", year: 2023 },
  { brand: "DeepCool", model: "LS720", kind: "aio", sockets: ["AM4", "AM5", ...S115X, "LGA1700"], heightMm: 50, radiatorMm: 360, rub: 10000, color: "#141518", accent: "#3c3f46", year: 2022 },
  { brand: "ARCTIC", model: "Liquid Freezer III 240", kind: "aio", sockets: MODERN, heightMm: 53, radiatorMm: 240, rub: 8500, color: "#141518", accent: "#3c3f46", year: 2024 },
  { brand: "ARCTIC", model: "Liquid Freezer III 280", kind: "aio", sockets: MODERN, heightMm: 53, radiatorMm: 280, rub: 9500, color: "#141518", accent: "#3c3f46", year: 2024 },
  { brand: "ARCTIC", model: "Liquid Freezer III 360", kind: "aio", sockets: MODERN, heightMm: 53, radiatorMm: 360, rub: 10900, color: "#141518", accent: "#3c3f46", year: 2024 },
  { brand: "Corsair", model: "iCUE H100i ELITE CAPELLIX XT", kind: "aio", sockets: [...MODERN, ...S115X], heightMm: 55, radiatorMm: 240, rub: 13000, color: "#141518", accent: "#8b8fff", year: 2022 },
  { brand: "Corsair", model: "iCUE H150i ELITE CAPELLIX XT", kind: "aio", sockets: [...MODERN, ...S115X], heightMm: 55, radiatorMm: 360, rub: 16000, color: "#141518", accent: "#8b8fff", year: 2022 },
  { brand: "NZXT", model: "Kraken 240", kind: "aio", sockets: [...MODERN, ...S115X], heightMm: 53, radiatorMm: 240, rub: 13000, color: "#e9eaee", accent: "#8b8fff", year: 2023 },
  { brand: "NZXT", model: "Kraken 360", kind: "aio", sockets: [...MODERN, ...S115X], heightMm: 53, radiatorMm: 360, rub: 17000, color: "#e9eaee", accent: "#8b8fff", year: 2023 },
];

const BASE: CoolerSpec[] = ROWS.map((r): CoolerSpec => ({
  id: slug(`${r.brand}-${r.model}`),
  category: "cooler",
  brand: r.brand,
  model: r.model,
  name: `${r.brand} ${r.model}`,
  price: price(r.rub),
  dataQuality: "manufacturer-unverified",
  visual: { color: r.color, accent: r.accent },
  releaseYear: r.year,
  kind: r.kind,
  sockets: r.sockets,
  heightMm: r.heightMm,
  radiatorMm: r.radiatorMm,
  maxRamHeightMm: r.maxRamHeightMm,
  ratedTdpW: r.ratedTdpW,
}));

export const CPU_COOLERS: CoolerSpec[] = withColorVariants(BASE, (c) =>
  WHITE_EDITIONS.has(c.id)
    ? { base: "black", variants: [WHITE_COOLER] }
    : BLACK_EDITIONS.has(c.id)
      ? { base: "white", variants: [{ colorway: "black", ...BLACK }] }
      : undefined,
).sort((a, b) => a.kind.localeCompare(b.kind) || a.price.amountRub - b.price.amountRub);
