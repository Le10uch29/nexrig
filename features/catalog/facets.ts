import type { ComponentCategory, ComponentOf, HardwareComponent } from "@/types/hardware";

/**
 * Step-by-step catalogue navigation: each category is narrowed through ordered facets
 * (e.g. motherboard → brand → memory generation → chipset → models).
 */
export interface Facet {
  key: string;
  label: string;
  value: (c: HardwareComponent) => string;
  /** How option chips are ordered. */
  order: "newest" | "numeric-asc" | "numeric-desc" | "alpha";
}

const f = <C extends ComponentCategory>(
  key: string,
  label: string,
  value: (c: ComponentOf<C>) => string,
  order: Facet["order"] = "alpha",
): Facet => ({ key, label, value: value as (c: HardwareComponent) => string, order });

const BOARD_ORDER = ["ATX", "mATX", "ITX"];

export const FACETS: Record<ComponentCategory, Facet[]> = {
  case: [
    f<"case">("brand", "Бренд", (c) => c.brand),
    f<"case">("board", "Максимальный формат платы", (c) => BOARD_ORDER.find((b) => c.supportedBoards.includes(b as never)) ?? "ATX", "alpha"),
  ],
  motherboard: [
    f<"motherboard">("brand", "Бренд", (c) => c.brand),
    f<"motherboard">("memory", "Поколение памяти", (c) => c.memoryType, "numeric-desc"),
    f<"motherboard">("chipset", "Чипсет", (c) => c.chipset, "newest"),
  ],
  cpu: [
    f<"cpu">("brand", "Производитель", (c) => c.brand),
    f<"cpu">("series", "Серия", (c) => c.series, "alpha"),
    f<"cpu">("family", "Поколение", (c) => c.family, "newest"),
  ],
  cooler: [
    f<"cooler">("kind", "Тип охлаждения", (c) => (c.kind === "aio" ? "Жидкостное (СЖО)" : c.heightMm < 70 ? "Низкопрофильное" : "Башенное воздушное")),
    f<"cooler">("brand", "Бренд", (c) => c.brand),
  ],
  ram: [
    f<"ram">("type", "Тип памяти", (c) => c.type, "numeric-desc"),
    f<"ram">("brand", "Бренд", (c) => c.brand),
    f<"ram">("size", "Объём модуля", (c) => `${c.moduleSizeGb} ГБ`, "numeric-asc"),
  ],
  gpu: [
    f<"gpu">("brand", "Бренд", (c) => c.brand),
    f<"gpu">("line", "Линейка", (c) => c.line),
    f<"gpu">("series", "Серия", (c) => c.series, "newest"),
  ],
  storage: [
    f<"storage">("kind", "Тип накопителя", (c) => (c.kind === "hdd" ? "HDD 3.5″" : c.interface === "NVMe" ? `NVMe SSD (PCIe ${c.pcieGen}.0)` : "SATA SSD 2.5″"), "numeric-desc"),
    f<"storage">("brand", "Бренд", (c) => c.brand),
  ],
  psu: [
    f<"psu">("watts", "Мощность", (c) => `${c.wattage} Вт`, "numeric-asc"),
    f<"psu">("brand", "Бренд", (c) => c.brand),
  ],
  fans: [f<"fans">("brand", "Бренд", (c) => c.brand)],
};

const num = (s: string) => parseFloat(s.replace(/[^\d.]/g, "")) || 0;

export interface FacetOption {
  value: string;
  count: number;
  compatibleCount: number;
}

/** Distinct values of `facet` among `items`, with counts, in the facet's preferred order. */
export function facetOptions(facet: Facet, items: HardwareComponent[], isCompatible: (c: HardwareComponent) => boolean): FacetOption[] {
  const map = new Map<string, { count: number; compatibleCount: number; newest: number }>();
  for (const c of items) {
    const v = facet.value(c);
    const e = map.get(v) ?? { count: 0, compatibleCount: 0, newest: 0 };
    e.count++;
    if (isCompatible(c)) e.compatibleCount++;
    e.newest = Math.max(e.newest, c.releaseYear ?? 0);
    map.set(v, e);
  }
  const opts = [...map.entries()].map(([value, e]) => ({ value, ...e }));
  opts.sort((a, b) => {
    switch (facet.order) {
      case "newest":
        return b.newest - a.newest || a.value.localeCompare(b.value, "ru", { numeric: true });
      case "numeric-asc":
        return num(a.value) - num(b.value);
      case "numeric-desc":
        return num(b.value) - num(a.value) || a.value.localeCompare(b.value, "ru");
      default:
        return a.value.localeCompare(b.value, "ru", { numeric: true });
    }
  });
  return opts.map(({ value, count, compatibleCount }) => ({ value, count, compatibleCount }));
}

/** Items matching every chosen facet value. */
export function applyFacetPath(category: ComponentCategory, items: HardwareComponent[], path: string[]): HardwareComponent[] {
  const facets = FACETS[category];
  return items.filter((c) => path.every((v, i) => facets[i]?.value(c) === v));
}

/** Facet values that lead to `component` (used to jump straight to a searched item). */
export function pathFor(component: HardwareComponent): string[] {
  return FACETS[component.category].map((facet) => facet.value(component));
}
