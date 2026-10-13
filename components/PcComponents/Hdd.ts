import type { StorageSpec } from "@/types/hardware";
import { price, slug } from "./shared";

/** 3.5″ SATA hard drives. Spindle speed and sustained transfer per vendor spec (unverified). */
interface HddLine {
  brand: string;
  line: string;
  year: number;
  nas?: boolean;
  /** [capacity TB, rpm, sustained MB/s] */
  sizes: [number, number, number][];
}

const LINES: HddLine[] = [
  { brand: "Seagate", line: "BarraCuda", year: 2016, sizes: [[1, 7200, 210], [2, 7200, 220], [4, 5400, 190]] },
  { brand: "WD", line: "Blue", year: 2016, sizes: [[1, 7200, 150], [2, 5400, 180], [4, 5400, 180]] },
  { brand: "WD", line: "Black", year: 2018, sizes: [[2, 7200, 220], [4, 7200, 250]] },
  { brand: "Toshiba", line: "P300", year: 2015, sizes: [[1, 7200, 190], [2, 7200, 190], [3, 7200, 190]] },
  { brand: "Seagate", line: "IronWolf", year: 2018, nas: true, sizes: [[4, 5900, 180], [8, 7200, 210]] },
  { brand: "WD", line: "Red Plus", year: 2020, nas: true, sizes: [[4, 5400, 180], [8, 5640, 215]] },
];

export const HDD: StorageSpec[] = LINES.flatMap((l) =>
  l.sizes.map(([tb, rpm, mbps]): StorageSpec => ({
    id: slug(`${l.brand}-${l.line}-${tb}tb-hdd`),
    category: "storage",
    brand: l.brand,
    model: `${l.line} ${tb} ТБ, ${rpm} об/мин`,
    name: `${l.brand} ${l.line} ${tb} ТБ (HDD)`,
    price: price((tb * 2000 + 2500) * (l.nas ? 1.2 : 1)),
    dataQuality: "manufacturer-unverified",
    visual: { color: "#8a8f99", accent: "#2a2c31" },
    releaseYear: l.year,
    kind: "hdd",
    interface: "SATA",
    formFactor: "3.5in",
    capacityGb: tb * 1000,
    readMBps: mbps,
    writeMBps: mbps,
    rpm,
  })),
).sort((a, b) => a.brand.localeCompare(b.brand) || a.capacityGb - b.capacityGb);
