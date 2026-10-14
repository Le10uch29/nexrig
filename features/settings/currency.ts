"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { DEFAULT_CURRENCY, formatMoney, type Currency } from "@/lib/money";

export { CURRENCIES, DEFAULT_CURRENCY, RATES_AS_OF, RUB_PER_UNIT, convertFromRub, formatMoney, toRub, type Currency } from "@/lib/money";

interface CurrencyState {
  currency: Currency;
  setCurrency: (c: Currency) => void;
}

export const useCurrencyStore = create<CurrencyState>()(
  persist((set) => ({ currency: DEFAULT_CURRENCY, setCurrency: (currency) => set({ currency }) }), {
    name: "buildai.currency.v1",
    storage: createJSONStorage(() => localStorage),
    skipHydration: true,
    version: 1,
    // v0 allowed roubles; the UI now offers dollars and lari only.
    migrate: (state) => {
      const s = state as { currency?: Currency } | undefined;
      return { currency: s?.currency === "GEL" ? "GEL" : "USD" } as CurrencyState;
    },
  }),
);

/** Price formatter in the selected display currency. Server render and hydration use the default (USD). */
export function usePrice() {
  const currency = useCurrencyStore((s) => s.currency);
  return (amountRub: number) => formatMoney(amountRub, currency);
}

export function useCurrency() {
  return useCurrencyStore((s) => s.currency);
}
