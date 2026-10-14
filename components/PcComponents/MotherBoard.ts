import type { BoardFormFactor, CpuSocket, MemoryType, MotherboardSpec, PcieGen } from "@/types/hardware";
import { AMD_FAMILIES as A } from "./CpuAmd";
import { INTEL_FAMILIES as I } from "./CpuIntel";
import { price, slug } from "./shared";

/**
 * Motherboards, DDR3 → DDR5 (ASUS, MSI, Gigabyte, ASRock).
 * Model names are real products. Per-board slot/port counts are derived from chipset profiles and
 * therefore approximate — verify against the manufacturer's spec page.
 */
interface Chipset {
  chipset: string;
  socket: CpuSocket;
  memory: MemoryType;
  pcie: PcieGen;
  m2: number;
  m2Gen: PcieGen;
  sata: number;
  /** Max RAM with all 4 DIMM slots populated. */
  maxMemGb: number;
  year: number;
  bios?: string[];
  unsupported?: string[];
  /** false = memory runs at the CPU's official speed only (Intel H/B chipsets before the 500 series). */
  memOc?: boolean;
}

const AM4_OLD_BIOS = [A.r2, A.r3, A.r3g, A.r5, A.r5g];

const CHIPSETS: Record<string, Chipset> = {
  H61: { chipset: "H61", socket: "LGA1155", memory: "DDR3", pcie: 2, m2: 0, m2Gen: 2, sata: 4, maxMemGb: 32, year: 2011, bios: [I.g3], memOc: false },
  Z77: { chipset: "Z77", socket: "LGA1155", memory: "DDR3", pcie: 3, m2: 0, m2Gen: 2, sata: 6, maxMemGb: 32, year: 2012 },
  H81: { chipset: "H81", socket: "LGA1150", memory: "DDR3", pcie: 3, m2: 0, m2Gen: 2, sata: 4, maxMemGb: 32, year: 2013, memOc: false },
  B85: { chipset: "B85", socket: "LGA1150", memory: "DDR3", pcie: 3, m2: 0, m2Gen: 2, sata: 6, maxMemGb: 32, year: 2013, memOc: false },
  Z87: { chipset: "Z87", socket: "LGA1150", memory: "DDR3", pcie: 3, m2: 0, m2Gen: 2, sata: 6, maxMemGb: 32, year: 2013 },
  Z97: { chipset: "Z97", socket: "LGA1150", memory: "DDR3", pcie: 3, m2: 1, m2Gen: 2, sata: 6, maxMemGb: 32, year: 2014 },
  "970": { chipset: "AMD 970", socket: "AM3+", memory: "DDR3", pcie: 2, m2: 0, m2Gen: 2, sata: 6, maxMemGb: 32, year: 2011 },
  Z170: { chipset: "Z170", socket: "LGA1151", memory: "DDR4", pcie: 3, m2: 1, m2Gen: 3, sata: 6, maxMemGb: 64, year: 2015, bios: [I.g7] },
  Z270: { chipset: "Z270", socket: "LGA1151", memory: "DDR4", pcie: 3, m2: 2, m2Gen: 3, sata: 6, maxMemGb: 64, year: 2017 },
  Z370: { chipset: "Z370", socket: "LGA1151-v2", memory: "DDR4", pcie: 3, m2: 2, m2Gen: 3, sata: 6, maxMemGb: 64, year: 2017, bios: [I.g9] },
  B360: { chipset: "B360", socket: "LGA1151-v2", memory: "DDR4", pcie: 3, m2: 2, m2Gen: 3, sata: 6, maxMemGb: 64, year: 2018, bios: [I.g9], memOc: false },
  B365: { chipset: "B365", socket: "LGA1151-v2", memory: "DDR4", pcie: 3, m2: 2, m2Gen: 3, sata: 6, maxMemGb: 64, year: 2019, memOc: false },
  Z390: { chipset: "Z390", socket: "LGA1151-v2", memory: "DDR4", pcie: 3, m2: 2, m2Gen: 3, sata: 6, maxMemGb: 128, year: 2018 },
  B460: { chipset: "B460", socket: "LGA1200", memory: "DDR4", pcie: 3, m2: 2, m2Gen: 3, sata: 6, maxMemGb: 128, year: 2020, unsupported: [I.g11], memOc: false },
  Z490: { chipset: "Z490", socket: "LGA1200", memory: "DDR4", pcie: 3, m2: 2, m2Gen: 3, sata: 6, maxMemGb: 128, year: 2020, bios: [I.g11] },
  B560: { chipset: "B560", socket: "LGA1200", memory: "DDR4", pcie: 4, m2: 2, m2Gen: 4, sata: 6, maxMemGb: 128, year: 2021 },
  Z590: { chipset: "Z590", socket: "LGA1200", memory: "DDR4", pcie: 4, m2: 3, m2Gen: 4, sata: 6, maxMemGb: 128, year: 2021 },
  B660D4: { chipset: "B660", socket: "LGA1700", memory: "DDR4", pcie: 4, m2: 2, m2Gen: 4, sata: 4, maxMemGb: 128, year: 2022, bios: [I.g13, I.g14] },
  Z690D4: { chipset: "Z690", socket: "LGA1700", memory: "DDR4", pcie: 5, m2: 4, m2Gen: 4, sata: 6, maxMemGb: 128, year: 2021, bios: [I.g13, I.g14] },
  B760D4: { chipset: "B760", socket: "LGA1700", memory: "DDR4", pcie: 4, m2: 2, m2Gen: 4, sata: 4, maxMemGb: 128, year: 2023 },
  Z690: { chipset: "Z690", socket: "LGA1700", memory: "DDR5", pcie: 5, m2: 4, m2Gen: 4, sata: 6, maxMemGb: 128, year: 2021, bios: [I.g13, I.g14] },
  B760: { chipset: "B760", socket: "LGA1700", memory: "DDR5", pcie: 4, m2: 2, m2Gen: 4, sata: 4, maxMemGb: 192, year: 2023 },
  Z790: { chipset: "Z790", socket: "LGA1700", memory: "DDR5", pcie: 5, m2: 4, m2Gen: 5, sata: 4, maxMemGb: 192, year: 2022 },
  Z890: { chipset: "Z890", socket: "LGA1851", memory: "DDR5", pcie: 5, m2: 4, m2Gen: 5, sata: 4, maxMemGb: 256, year: 2024 },
  B860: { chipset: "B860", socket: "LGA1851", memory: "DDR5", pcie: 5, m2: 3, m2Gen: 5, sata: 4, maxMemGb: 256, year: 2025 },
  A320: { chipset: "A320", socket: "AM4", memory: "DDR4", pcie: 3, m2: 1, m2Gen: 3, sata: 4, maxMemGb: 64, year: 2017, bios: AM4_OLD_BIOS },
  B350: { chipset: "B350", socket: "AM4", memory: "DDR4", pcie: 3, m2: 1, m2Gen: 3, sata: 6, maxMemGb: 64, year: 2017, bios: AM4_OLD_BIOS },
  X370: { chipset: "X370", socket: "AM4", memory: "DDR4", pcie: 3, m2: 2, m2Gen: 3, sata: 6, maxMemGb: 64, year: 2017, bios: AM4_OLD_BIOS },
  B450: { chipset: "B450", socket: "AM4", memory: "DDR4", pcie: 3, m2: 2, m2Gen: 3, sata: 6, maxMemGb: 128, year: 2018, bios: [A.r3, A.r3g, A.r5, A.r5g] },
  X470: { chipset: "X470", socket: "AM4", memory: "DDR4", pcie: 3, m2: 2, m2Gen: 3, sata: 6, maxMemGb: 128, year: 2018, bios: [A.r3, A.r3g, A.r5, A.r5g] },
  B550: { chipset: "B550", socket: "AM4", memory: "DDR4", pcie: 4, m2: 2, m2Gen: 4, sata: 6, maxMemGb: 128, year: 2020, bios: [A.r5, A.r5g], unsupported: [A.r1, A.r2, A.r3g] },
  X570: { chipset: "X570", socket: "AM4", memory: "DDR4", pcie: 4, m2: 2, m2Gen: 4, sata: 6, maxMemGb: 128, year: 2019, bios: [A.r5, A.r5g], unsupported: [A.r1] },
  A620: { chipset: "A620", socket: "AM5", memory: "DDR5", pcie: 4, m2: 1, m2Gen: 4, sata: 4, maxMemGb: 192, year: 2023, bios: [A.r9] },
  B650: { chipset: "B650", socket: "AM5", memory: "DDR5", pcie: 4, m2: 2, m2Gen: 4, sata: 4, maxMemGb: 192, year: 2022, bios: [A.r8g, A.r9] },
  B650E: { chipset: "B650E", socket: "AM5", memory: "DDR5", pcie: 5, m2: 3, m2Gen: 5, sata: 4, maxMemGb: 192, year: 2022, bios: [A.r8g, A.r9] },
  X670: { chipset: "X670", socket: "AM5", memory: "DDR5", pcie: 4, m2: 4, m2Gen: 5, sata: 6, maxMemGb: 192, year: 2022, bios: [A.r8g, A.r9] },
  X670E: { chipset: "X670E", socket: "AM5", memory: "DDR5", pcie: 5, m2: 4, m2Gen: 5, sata: 6, maxMemGb: 192, year: 2022, bios: [A.r8g, A.r9] },
  B850: { chipset: "B850", socket: "AM5", memory: "DDR5", pcie: 4, m2: 3, m2Gen: 5, sata: 4, maxMemGb: 256, year: 2025 },
  X870: { chipset: "X870", socket: "AM5", memory: "DDR5", pcie: 5, m2: 4, m2Gen: 5, sata: 4, maxMemGb: 256, year: 2024 },
  X870E: { chipset: "X870E", socket: "AM5", memory: "DDR5", pcie: 5, m2: 4, m2Gen: 5, sata: 4, maxMemGb: 256, year: 2024 },
};

// [brand, model, chipset key, form factor, demo price RUB, DIMM slots override]
type Row = [string, string, keyof typeof CHIPSETS, BoardFormFactor, number, number?];

const ROWS: Row[] = [
  // DDR3 — Intel LGA1155 / LGA1150, AMD AM3+
  ["ASUS", "P8H61-M LX", "H61", "mATX", 3500, 2],
  ["ASUS", "P8Z77-V", "Z77", "ATX", 6000],
  ["MSI", "Z77A-G45", "Z77", "ATX", 5000],
  ["Gigabyte", "GA-Z77X-D3H", "Z77", "ATX", 5000],
  ["ASRock", "Z77 Extreme4", "Z77", "ATX", 5000],
  ["ASUS", "H81M-K", "H81", "mATX", 3000, 2],
  ["ASRock", "B85M Pro4", "B85", "mATX", 4000],
  ["ASUS", "Z87-A", "Z87", "ATX", 5500],
  ["ASUS", "Z97-A", "Z97", "ATX", 6500],
  ["MSI", "Z97 GAMING 5", "Z97", "ATX", 6500],
  ["Gigabyte", "GA-Z97X-Gaming 5", "Z97", "ATX", 6500],
  ["ASUS", "M5A97 R2.0", "970", "ATX", 4500],
  ["Gigabyte", "GA-970A-DS3P", "970", "ATX", 4000],
  ["MSI", "970 GAMING", "970", "ATX", 4500],
  // DDR4 — Intel
  ["ASUS", "Z170-A", "Z170", "ATX", 6500],
  ["MSI", "Z170A GAMING M5", "Z170", "ATX", 6500],
  ["ASUS", "PRIME Z270-A", "Z270", "ATX", 7000],
  ["MSI", "Z270 GAMING PRO CARBON", "Z270", "ATX", 7500],
  ["ASUS", "PRIME Z370-A", "Z370", "ATX", 8000],
  ["MSI", "Z370 GAMING PLUS", "Z370", "ATX", 7000],
  ["ASUS", "PRIME B360M-A", "B360", "mATX", 5500],
  ["MSI", "B360M MORTAR", "B360", "mATX", 5500],
  ["ASUS", "PRIME B365M-A", "B365", "mATX", 6000],
  ["ASUS", "ROG STRIX Z390-E GAMING", "Z390", "ATX", 11000],
  ["MSI", "MPG Z390 GAMING PLUS", "Z390", "ATX", 8500],
  ["Gigabyte", "Z390 AORUS PRO", "Z390", "ATX", 10000],
  ["ASRock", "Z390 Pro4", "Z390", "ATX", 8000],
  ["ASUS", "TUF GAMING B460M-PLUS", "B460", "mATX", 7000],
  ["MSI", "MAG B460M MORTAR", "B460", "mATX", 7000],
  ["ASUS", "PRIME Z490-A", "Z490", "ATX", 12000],
  ["MSI", "MAG Z490 TOMAHAWK", "Z490", "ATX", 12000],
  ["Gigabyte", "Z490 AORUS ELITE AC", "Z490", "ATX", 12000],
  ["ASUS", "PRIME B560M-A", "B560", "mATX", 8000],
  ["MSI", "MAG B560 TOMAHAWK WIFI", "B560", "ATX", 10000],
  ["Gigabyte", "B560M DS3H", "B560", "mATX", 7000],
  ["ASUS", "ROG STRIX Z590-E GAMING WIFI", "Z590", "ATX", 18000],
  ["MSI", "PRO Z690-A DDR4", "Z690D4", "ATX", 14000],
  ["ASUS", "TUF GAMING B660M-PLUS WIFI D4", "B660D4", "mATX", 11000],
  ["Gigabyte", "B660M DS3H DDR4", "B660D4", "mATX", 9000],
  ["MSI", "PRO B760M-A DDR4 II", "B760D4", "mATX", 10900],
  ["ASUS", "PRIME B760M-A D4", "B760D4", "mATX", 10500],
  // DDR4 — AMD AM4
  ["MSI", "A320M-A PRO", "A320", "mATX", 4500, 2],
  ["ASUS", "PRIME B350-PLUS", "B350", "ATX", 6000],
  ["MSI", "B350 TOMAHAWK", "B350", "ATX", 6000],
  ["Gigabyte", "GA-AB350-Gaming 3", "B350", "ATX", 6000],
  ["ASUS", "ROG STRIX X370-F GAMING", "X370", "ATX", 9000],
  ["ASUS", "ROG STRIX B450-F GAMING", "B450", "ATX", 8500],
  ["MSI", "B450 TOMAHAWK MAX", "B450", "ATX", 8000],
  ["Gigabyte", "B450 AORUS ELITE", "B450", "ATX", 8000],
  ["ASRock", "B450M Pro4", "B450", "mATX", 7000],
  ["MSI", "X470 GAMING PLUS", "X470", "ATX", 8500],
  ["ASUS", "TUF GAMING B550-PLUS", "B550", "ATX", 11000],
  ["ASUS", "ROG STRIX B550-F GAMING WIFI II", "B550", "ATX", 15900],
  ["MSI", "MAG B550 TOMAHAWK", "B550", "ATX", 12000],
  ["Gigabyte", "B550 AORUS ELITE V2", "B550", "ATX", 12000],
  ["ASRock", "B550M Steel Legend", "B550", "mATX", 11000],
  ["MSI", "B550M PRO-VDH WIFI", "B550", "mATX", 9000],
  ["ASUS", "ROG STRIX X570-E GAMING", "X570", "ATX", 20000],
  ["Gigabyte", "X570 AORUS ELITE", "X570", "ATX", 14000],
  ["MSI", "MPG X570 GAMING PLUS", "X570", "ATX", 12000],
  // DDR5 — Intel
  ["ASUS", "PRIME Z690-P", "Z690", "ATX", 15000],
  ["MSI", "MAG Z690 TOMAHAWK WIFI", "Z690", "ATX", 20000],
  ["Gigabyte", "Z690 AORUS ELITE AX", "Z690", "ATX", 19000],
  ["MSI", "PRO B760M-A WIFI", "B760", "mATX", 12500],
  ["ASUS", "ROG STRIX B760-F GAMING WIFI", "B760", "ATX", 19000],
  ["Gigabyte", "B760M DS3H AX", "B760", "mATX", 11500],
  ["ASUS", "TUF GAMING Z790-PLUS WIFI", "Z790", "ATX", 25000],
  ["ASUS", "ROG STRIX Z790-E GAMING WIFI", "Z790", "ATX", 39900],
  ["MSI", "MAG Z790 TOMAHAWK WIFI", "Z790", "ATX", 27000],
  ["Gigabyte", "Z790 AORUS ELITE AX", "Z790", "ATX", 25000],
  ["ASRock", "Z790 Steel Legend WiFi", "Z790", "ATX", 23000],
  ["MSI", "MAG Z890 TOMAHAWK WIFI", "Z890", "ATX", 32900],
  ["ASUS", "ROG STRIX Z890-E GAMING WIFI", "Z890", "ATX", 52000],
  ["Gigabyte", "Z890 AORUS ELITE WIFI7", "Z890", "ATX", 33000],
  ["ASUS", "PRIME B860-PLUS WIFI", "B860", "ATX", 18000],
  // DDR5 — AMD AM5
  ["ASUS", "PRIME A620M-K", "A620", "mATX", 9000, 2],
  ["MSI", "PRO A620M-E", "A620", "mATX", 8500, 2],
  ["ASUS", "TUF GAMING B650-PLUS WIFI", "B650", "ATX", 18900],
  ["MSI", "PRO B650M-A WIFI", "B650", "mATX", 14500],
  ["MSI", "MAG B650 TOMAHAWK WIFI", "B650", "ATX", 21000],
  ["Gigabyte", "B650 AORUS ELITE AX", "B650", "ATX", 20000],
  ["ASRock", "B650M Pro RS", "B650", "mATX", 13000],
  ["ASUS", "ROG STRIX B650E-F GAMING WIFI", "B650E", "ATX", 26000],
  ["ASUS", "ROG STRIX B650E-I GAMING WIFI", "B650E", "ITX", 27900],
  ["ASUS", "ROG STRIX X670E-E GAMING WIFI", "X670E", "ATX", 45000],
  ["MSI", "MPG X670E CARBON WIFI", "X670E", "ATX", 42000],
  ["Gigabyte", "X670 AORUS ELITE AX", "X670", "ATX", 28000],
  ["ASUS", "TUF GAMING B850-PLUS WIFI", "B850", "ATX", 21000],
  ["MSI", "MAG B850 TOMAHAWK MAX WIFI", "B850", "ATX", 24000],
  ["Gigabyte", "B850 AORUS ELITE WIFI7", "B850", "ATX", 23000],
  ["MSI", "MAG X870 TOMAHAWK WIFI", "X870", "ATX", 29900],
  ["ASUS", "ROG STRIX X870E-E GAMING WIFI", "X870E", "ATX", 55000],
  ["Gigabyte", "X870 AORUS ELITE WIFI7", "X870", "ATX", 31000],
];

function visualFor(brand: string, model: string) {
  if (/ROG/.test(model)) return { color: "#17181b", accent: "#c4304a" };
  if (/TUF/.test(model)) return { color: "#202226", accent: "#b9a046" };
  if (/AORUS/.test(model)) return { color: "#18191c", accent: "#f08a24" };
  if (/Steel Legend/.test(model)) return { color: "#2a2c30", accent: "#c9ccd2" };
  if (/MAG|MPG|TOMAHAWK|CARBON/.test(model)) return { color: "#1c1d20", accent: "#7c7f87" };
  if (brand === "MSI") return { color: "#25272b", accent: "#9aa0aa" };
  return { color: "#1f2125", accent: "#9aa0aa" };
}

export const MOTHERBOARDS: MotherboardSpec[] = ROWS.map(([brand, model, key, formFactor, rub, slotsOverride]) => {
  const c = CHIPSETS[key];
  const memorySlots = slotsOverride ?? (formFactor === "ITX" ? 2 : 4);
  const m2Slots = formFactor === "ITX" ? Math.min(c.m2, 2) : formFactor === "mATX" ? Math.min(c.m2, 2) : c.m2;
  return {
    id: slug(`${brand}-${model}`),
    category: "motherboard",
    brand,
    model,
    name: `${brand} ${model}`,
    price: price(rub),
    dataQuality: "approximate",
    variantNote: "Слоты, порты и максимальный объём памяти взяты из типового профиля чипсета — проверьте спецификацию конкретной платы.",
    visual: visualFor(brand, model),
    releaseYear: c.year,
    socket: c.socket,
    chipset: c.chipset,
    formFactor,
    memoryType: c.memory,
    memorySlots,
    maxMemoryGb: memorySlots === 2 ? c.maxMemGb / 2 : c.maxMemGb,
    m2Slots,
    m2MaxGen: c.m2Gen,
    sataPorts: formFactor === "ITX" ? Math.min(c.sata, 4) : c.sata,
    pcieX16Gen: c.pcie,
    biosUpdateFamilies: c.bios ?? [],
    unsupportedFamilies: c.unsupported ?? [],
    memoryOverclock: c.memOc ?? true,
  } satisfies MotherboardSpec;
}).sort((a, b) => (b.releaseYear ?? 0) - (a.releaseYear ?? 0) || a.price.amountRub - b.price.amountRub);
