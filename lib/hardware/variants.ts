import type { Colorway, HardwareComponent } from "@/types/hardware";
import { hardwareRepository } from "./repository";

const ORDER: Record<Colorway, number> = { black: 0, white: 1 };
const groups = new Map<string, HardwareComponent[]>();

/** Colour editions of the same product (including `c`), black first. Empty when there are none. */
export function colorVariantsOf(c: HardwareComponent): HardwareComponent[] {
  if (!c.variantGroup) return [];
  let list = groups.get(c.variantGroup);
  if (!list) {
    list = (hardwareRepository.byCategory(c.category) as HardwareComponent[])
      .filter((x) => x.variantGroup === c.variantGroup)
      .sort((a, b) => ORDER[a.colorway ?? "black"] - ORDER[b.colorway ?? "black"]);
    groups.set(c.variantGroup, list);
  }
  return list.length > 1 ? list : [];
}

/**
 * One entry per product: colour editions collapse into a single representative — the installed
 * one, else the colour the user picked, else the first one that passed the current filter.
 */
export function collapseColorVariants<T extends HardwareComponent>(items: T[], preferred: (group: string) => string | undefined): T[] {
  const seen = new Map<string, T>();
  const out: T[] = [];
  for (const c of items) {
    if (!c.variantGroup) {
      out.push(c);
      continue;
    }
    const want = preferred(c.variantGroup);
    const prev = seen.get(c.variantGroup);
    if (!prev) {
      seen.set(c.variantGroup, c);
      out.push(c);
    } else if (want === c.id) {
      out[out.indexOf(prev)] = c;
      seen.set(c.variantGroup, c);
    }
  }
  return out;
}
