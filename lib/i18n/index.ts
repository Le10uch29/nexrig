import { ru, type Messages } from "./ru";

/** Single active locale for now. Swap to a context/provider when more locales are added. */
const ACTIVE: Messages = ru;

export function getMessages(): Messages {
  return ACTIVE;
}

/** Hook form so components don't need to change when locale switching arrives. */
export function useMessages(): Messages {
  return ACTIVE;
}

const rub = new Intl.NumberFormat(ru.locale, { style: "currency", currency: ru.currency, maximumFractionDigits: 0 });
const num = new Intl.NumberFormat(ru.locale);

export function formatPrice(amountRub: number): string {
  return rub.format(amountRub);
}

export function formatNumber(n: number): string {
  return num.format(n);
}

export type { Messages };
