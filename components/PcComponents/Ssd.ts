import type { PcieGen, StorageSpec } from "@/types/hardware";
import { price, slug } from "./shared";

/** Solid-state drives: NVMe PCIe 3.0/4.0/5.0 and SATA 2.5″. Sequential speeds per vendor spec (unverified). */
interface SsdLine {
  brand: string;
  line: string;
  iface: "NVMe" | "SATA";
  gen?: PcieGen;
  year: number;
  rubPerTb: number;
  color: string;
  accent: string;
  /** [capacity GB, read MB/s, write MB/s] */
  sizes: [number, number, number][];
}

const LINES: SsdLine[] = [
  { brand: "Samsung", line: "970 EVO Plus", iface: "NVMe", gen: 3, year: 2019, rubPerTb: 6000, color: "#141518", accent: "#e46a2b", sizes: [[500, 3500, 3200], [1000, 3500, 3300], [2000, 3500, 3300]] },
  { brand: "WD", line: "Blue SN570", iface: "NVMe", gen: 3, year: 2021, rubPerTb: 4800, color: "#141518", accent: "#3a8fd8", sizes: [[500, 3500, 2300], [1000, 3500, 3000], [2000, 3500, 3500]] },
  { brand: "Crucial", line: "P3", iface: "NVMe", gen: 3, year: 2022, rubPerTb: 4600, color: "#141518", accent: "#9ea3ac", sizes: [[500, 3500, 1900], [1000, 3500, 3000], [2000, 3500, 3000]] },
  { brand: "Kingston", line: "NV2", iface: "NVMe", gen: 4, year: 2022, rubPerTb: 4700, color: "#141518", accent: "#c4304a", sizes: [[500, 3500, 2100], [1000, 3500, 2100], [2000, 3500, 2800]] },
  { brand: "WD", line: "Blue SN580", iface: "NVMe", gen: 4, year: 2023, rubPerTb: 5400, color: "#141518", accent: "#3a8fd8", sizes: [[500, 4000, 3600], [1000, 4150, 4150], [2000, 4150, 4150]] },
  { brand: "Samsung", line: "980 PRO", iface: "NVMe", gen: 4, year: 2020, rubPerTb: 7500, color: "#141518", accent: "#e46a2b", sizes: [[500, 6900, 5000], [1000, 7000, 5000], [2000, 7000, 5100]] },
  { brand: "Samsung", line: "990 PRO", iface: "NVMe", gen: 4, year: 2022, rubPerTb: 8000, color: "#141518", accent: "#e46a2b", sizes: [[1000, 7450, 6900], [2000, 7450, 6900], [4000, 7450, 6900]] },
  { brand: "WD", line: "WD_BLACK SN850X", iface: "NVMe", gen: 4, year: 2022, rubPerTb: 7800, color: "#141518", accent: "#c9ccd2", sizes: [[1000, 7300, 6300], [2000, 7300, 6600], [4000, 7300, 6600]] },
  { brand: "Kingston", line: "KC3000", iface: "NVMe", gen: 4, year: 2021, rubPerTb: 7000, color: "#141518", accent: "#c4304a", sizes: [[512, 7000, 3900], [1024, 7000, 6000], [2048, 7000, 7000]] },
  { brand: "Crucial", line: "T500", iface: "NVMe", gen: 4, year: 2023, rubPerTb: 7200, color: "#141518", accent: "#9ea3ac", sizes: [[1000, 7300, 6800], [2000, 7400, 7000]] },
  { brand: "Crucial", line: "T700", iface: "NVMe", gen: 5, year: 2023, rubPerTb: 13000, color: "#141518", accent: "#9ea3ac", sizes: [[1000, 11700, 9500], [2000, 12400, 11800]] },
  { brand: "Crucial", line: "T705", iface: "NVMe", gen: 5, year: 2024, rubPerTb: 14500, color: "#141518", accent: "#9ea3ac", sizes: [[1000, 13600, 10200], [2000, 14500, 12700]] },
  { brand: "Samsung", line: "9100 PRO", iface: "NVMe", gen: 5, year: 2025, rubPerTb: 15000, color: "#141518", accent: "#e46a2b", sizes: [[1000, 14700, 13300], [2000, 14700, 13400], [4000, 14800, 13400]] },
  { brand: "Kingston", line: "A400", iface: "SATA", year: 2017, rubPerTb: 4500, color: "#202226", accent: "#c4304a", sizes: [[240, 500, 350], [480, 500, 450], [960, 500, 450]] },
  { brand: "Samsung", line: "860 EVO", iface: "SATA", year: 2018, rubPerTb: 6000, color: "#202226", accent: "#d0d3da", sizes: [[250, 550, 520], [500, 550, 520], [1000, 550, 520]] },
  { brand: "Crucial", line: "MX500", iface: "SATA", year: 2018, rubPerTb: 5500, color: "#202226", accent: "#9ea3ac", sizes: [[250, 560, 510], [500, 560, 510], [1000, 560, 510], [2000, 560, 510]] },
  { brand: "Samsung", line: "870 EVO", iface: "SATA", year: 2021, rubPerTb: 6500, color: "#202226", accent: "#d0d3da", sizes: [[250, 560, 530], [500, 560, 530], [1000, 560, 530], [2000, 560, 530]] },
];

const capLabel = (gb: number) => (gb >= 1000 ? `${gb % 1000 === 0 ? gb / 1000 : (gb / 1000).toFixed(gb % 1024 === 0 ? 0 : 1)} ТБ` : `${gb} ГБ`);

export const SSD: StorageSpec[] = LINES.flatMap((l) =>
  l.sizes.map(([gb, read, write]): StorageSpec => ({
    id: slug(`${l.brand}-${l.line}-${gb}gb`),
    category: "storage",
    brand: l.brand,
    model: `${l.line} ${capLabel(gb)}${l.iface === "SATA" ? " (SATA)" : ""}`,
    name: `${l.brand} ${l.line} ${capLabel(gb)}`,
    price: price((gb / 1000) * l.rubPerTb + 1200),
    dataQuality: "manufacturer-unverified",
    visual: { color: l.color, accent: l.accent },
    releaseYear: l.year,
    kind: "ssd",
    interface: l.iface,
    formFactor: l.iface === "NVMe" ? "M.2 2280" : "2.5in",
    pcieGen: l.gen,
    capacityGb: gb,
    readMBps: read,
    writeMBps: write,
  })),
).sort((a, b) => (b.pcieGen ?? 0) - (a.pcieGen ?? 0) || a.brand.localeCompare(b.brand) || a.capacityGb - b.capacityGb);
