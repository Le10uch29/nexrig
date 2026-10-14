"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Display currency. Catalogue prices are stored in RUB (indicative demo figures); other
 * currencies are converted with FIXED reference rates entered by hand — no live exchange-rate
 * service is connected, so the converted figures are approximate.
 */
export type Currency = "RUB" | "USD" | "GEL";

export const CURRENCIES: { id: Currency; symbol: string; label: string }[] = [
  { id: "RUB", symbol: "₽", label: "Рубли" },
  { id: "USD", symbol: "$", label: "Доллары США" },
  { id: "GEL", symbol: "₾", label: "Грузинские лари" },
];

/** RUB per one unit of the currency. Reference values, edit here when updating. */
export const RUB_PER_UNIT: Record<Currency, number> = { RUB: 1, USD: 82, GEL: 30 };
export const RATES_AS_OF = "2026-10-01";

const formatters: Record<Currency, Intl.NumberFormat> = {
  RUB: new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }),
  USD: new Intl.NumberFormat("ru-RU", { style: "currency", currency: "USD", maximumFractionDigits: 0 }),
  GEL: new Intl.NumberFormat("ru-RU", { style: "currency", currency: "GEL", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }),
};

export function convertFromRub(amountRub: number, currency: Currency) {
  return amountRub / RUB_PER_UNIT[currency];
}

export function toRub(amount: number, currency: Currency) {
  return amount * RUB_PER_UNIT[currency];
}

export function formatMoney(amountRub: number, currency: Currency): string {
  return formatters[currency].format(convertFromRub(amountRub, currency));
}

interface CurrencyState {
  currency: Currency;
  setCurrency: (c: Currency) => void;
}

export const useCurrencyStore = create<CurrencyState>()(
  persist((set) => ({ currency: "RUB", setCurrency: (currency) => set({ currency }) }), {
    name: "buildai.currency.v1",
    storage: createJSONStorage(() => localStorage),
    skipHydration: true,
  }),
);

/** Price formatter in the selected display currency. Server render and hydration use RUB. */
export function usePrice() {
  const currency = useCurrencyStore((s) => s.currency);
  return (amountRub: number) => formatMoney(amountRub, currency);
}

export function useCurrency() {
  return useCurrencyStore((s) => s.currency);
}
