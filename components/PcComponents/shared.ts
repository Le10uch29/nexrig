import type { Colorway, HardwareComponent, PriceInfo } from "@/types/hardware";

/**
 * LOCAL DEMONSTRATION CATALOGUE — shared helpers.
 * Specs are transcribed from public manufacturer data (unverified) or derived from templates
 * (marked "approximate" with a variantNote). Prices are indicative demo figures in RUB, not offers;
 * for discontinued models they approximate the second-hand market.
 */
export const DEMO_PRICE_DATE = "2026-10-01";

export const price = (amountRub: number): PriceInfo => ({
  amountRub: Math.round(amountRub / 100) * 100,
  source: "demo",
  asOf: DEMO_PRICE_DATE,
});

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\+/g, "plus")
    .replace(/[^a-z0-9а-я]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const GENERATED_VARIANT_NOTE =
  "Партнёрская версия сформирована по шаблону линейки: наличие конкретной модели, габариты и цена приблизительны — сверяйте со страницей производителя.";

export const COLORWAY_LABEL: Record<Colorway, string> = { black: "Чёрный", white: "Белый" };
const COLORWAY_SUFFIX: Record<Colorway, string> = { black: "Black", white: "White" };

export interface ColorVariant {
  colorway: Colorway;
  color: string;
  accent?: string;
  /** Price relative to the primary SKU (white editions usually cost a little more). */
  priceMul?: number;
  /** Mark when the colour version's availability per configuration is not confirmed. */
  approximate?: boolean;
}

/**
 * Adds colour siblings of real products (e.g. a white edition of a case). The primary item keeps
 * its id; each sibling gets `${id}-${colorway}`. Siblings share `variantGroup` so the UI can offer
 * a colour switch instead of listing them as unrelated products.
 */
export function withColorVariants<T extends HardwareComponent>(items: T[], variantsFor: (item: T) => { base: Colorway; variants: ColorVariant[] } | undefined): T[] {
  return items.flatMap((item) => {
    const spec = variantsFor(item);
    if (!spec || spec.variants.length === 0) return [item];
    const primary = { ...item, colorway: spec.base, variantGroup: item.id } as T;
    const siblings = spec.variants.map(
      (v) =>
        ({
          ...item,
          id: `${item.id}-${v.colorway}`,
          name: `${item.name} ${COLORWAY_SUFFIX[v.colorway]}`,
          model: `${item.model} ${COLORWAY_SUFFIX[v.colorway]}`,
          price: price(item.price.amountRub * (v.priceMul ?? 1.05)),
          visual: { color: v.color, accent: v.accent ?? item.visual.accent },
          colorway: v.colorway,
          variantGroup: item.id,
          ...(v.approximate ? { dataQuality: "approximate" as const } : {}),
        }) as T,
    );
    return [primary, ...siblings];
  });
}

/** White finish used for white editions (body, accent). */
export const WHITE = { color: "#e9eaee", accent: "#c9ccd4" } as const;
export const BLACK = { color: "#16171b", accent: "#2b2f36" } as const;
