import type { PriceInfo } from "@/types/hardware";

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
