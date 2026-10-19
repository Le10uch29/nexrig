import "server-only";
import path from "node:path";
import { readFirstSheet } from "@/lib/server/xlsx";
import { parseVideocartRows, type VideocartRow } from "./specs";

/** Reads graphics_cards_specs.xlsx. Synchronous, so the page is prerendered with the table's contents. */
export function loadVideocart(): { rows: VideocartRow[]; error: string | null } {
  try {
    // Literal segments (not VIDEOCART_FILE) let the bundler trace just this file.
    return { rows: parseVideocartRows(readFirstSheet(path.join(process.cwd(), "public", "videocart", "graphics_cards_specs.xlsx"))), error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "Не удалось прочитать таблицу" };
  }
}
