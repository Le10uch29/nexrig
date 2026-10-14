import { DEFAULT_CURRENCY, formatMoney } from "@/lib/money";
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

const num = new Intl.NumberFormat(ru.locale);

/** Non-React contexts (agents, server) format in the default display currency (USD, fixed rate). */
export function formatPrice(amountRub: number): string {
  return formatMoney(amountRub, DEFAULT_CURRENCY);
}

export function formatNumber(n: number): string {
  return num.format(n);
}

export type { Messages };
