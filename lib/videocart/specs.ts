import type { GpuSpec } from "@/types/hardware";

/** Path of the spec table inside the project (served from /public as well). */
export const VIDEOCART_FILE = "public/videocart/graphics_cards_specs.xlsx";

/** One row of graphics_cards_specs.xlsx, as written in the table. */
export interface VideocartRow {
  vendor: string;
  model: string;
  architecture: string;
  /** Memory as written, e.g. "3 ГБ / 6 ГБ". */
  memory: string;
  memoryType: string;
  /** Memory variants parsed from `memory`, in GB, ascending. */
  memoryOptionsGb: number[];
}

const COLUMNS: Record<keyof Omit<VideocartRow, "memoryOptionsGb">, string> = {
  vendor: "Производитель",
  model: "Модель",
  architecture: "Архитектура",
  memory: "Объем памяти",
  memoryType: "Тип памяти",
};

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

/**
 * Rows of the sheet → typed records, located by header names (column order may change).
 * Rows without a model are skipped. The image column holds search links, not images, and is ignored.
 */
export function parseVideocartRows(rows: string[][]): VideocartRow[] {
  const [header, ...body] = rows;
  if (!header) return [];
  const idx = Object.fromEntries(Object.entries(COLUMNS).map(([k, title]) => [k, header.findIndex((h) => norm(h) === norm(title))])) as Record<keyof typeof COLUMNS, number>;
  if (idx.model < 0) throw new Error(`В таблице нет столбца «${COLUMNS.model}»`);
  const cell = (r: string[], k: keyof typeof COLUMNS) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "");
  return body
    .filter((r) => cell(r, "model"))
    .map((r) => {
      const memory = cell(r, "memory");
      const memoryOptionsGb = [...memory.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:ГБ|GB)/gi)].map((m) => Number(m[1].replace(",", "."))).sort((a, b) => a - b);
      return { vendor: cell(r, "vendor"), model: cell(r, "model"), architecture: cell(r, "architecture"), memory, memoryType: cell(r, "memoryType"), memoryOptionsGb };
    });
}

/** "GeForce GTX 1060" → "GTX 1060"; "Radeon RX 5700 XT" → "RX 5700 XT". */
export function chipKey(model: string) {
  return model.replace(/^(nvidia|amd)\s+/i, "").replace(/^(geforce|radeon)\s+/i, "").trim();
}

/**
 * The catalog card that represents a table row: same chip (with the largest listed memory variant
 * when the catalog splits it, e.g. "GTX 1060 6 ГБ"), preferring the reference design.
 */
export function matchCatalogGpu(row: VideocartRow, gpus: GpuSpec[]): GpuSpec | undefined {
  const key = norm(chipKey(row.model));
  const sizes = row.memoryOptionsGb.length ? [...row.memoryOptionsGb].reverse() : [undefined];
  for (const gb of sizes) {
    const candidates = gpus.filter((g) => {
      const chip = norm(g.chip);
      if (chip === key) return gb === undefined || g.vramGb === gb;
      return gb !== undefined && chip === norm(`${key} ${gb} ГБ`);
    });
    if (candidates.length) return candidates.find((g) => /founders|reference/i.test(g.line)) ?? candidates[0];
  }
  return undefined;
}
