import { z } from "zod";
import { hardwareRepository } from "@/lib/hardware/repository";
import type { BuildSelection } from "@/types/build";
import type { ComponentCategory } from "@/types/hardware";

/**
 * Input rules for community builds and comments (shared by the API and the UI).
 * Text is stored and shown as plain text (React escapes it); links are not turned into anchors.
 */
export const NICKNAME_RULE = "2–32 символа: буквы, цифры, пробел, точка, дефис или подчёркивание.";
const RESERVED = /^(admin|administrator|админ|администратор|moderator|модератор|nexrig|buildai|support|поддержка)$/i;

export const nicknameSchema = z
  .string()
  .trim()
  .min(2, NICKNAME_RULE)
  .max(32, NICKNAME_RULE)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u, NICKNAME_RULE)
  .refine((v) => !RESERVED.test(v.replace(/[ ._-]/g, "")), "Этот ник зарезервирован.");

/** Control characters other than newline/tab are dropped; runs of blank lines are collapsed. */
const cleanText = (v: string) =>
  v
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const id = z.string().trim().min(1).max(120);

export const selectionSchema = z.object({
  case: id.nullable(),
  motherboard: id.nullable(),
  cpu: id.nullable(),
  cooler: id.nullable(),
  ram: id.nullable(),
  ramCount: z.number().int().min(1).max(8),
  gpu: id.nullable(),
  storage: z.array(id).max(8),
  psu: id.nullable(),
  fans: id.nullable(),
  fanLayout: z.partialRecord(z.enum(["front", "side", "top", "rear", "bottom"]), z.number().int().min(0).max(8)).nullable().optional(),
});

export const publishBuildSchema = z.object({
  name: z.string().transform(cleanText).pipe(z.string().min(3, "Название — от 3 символов.").max(120)),
  description: z.string().max(4000).default("").transform(cleanText).pipe(z.string().max(2000, "Описание — до 2000 символов.")),
  nickname: nicknameSchema,
  selection: selectionSchema,
});

export const commentSchema = z.object({
  body: z.string().max(4000).transform(cleanText).pipe(z.string().min(1, "Комментарий пуст.").max(2000, "Комментарий — до 2000 символов.")),
  nickname: nicknameSchema,
  parentId: z.string().uuid().nullable().optional(),
});

const SINGLE: Exclude<ComponentCategory, "storage">[] = ["case", "motherboard", "cpu", "cooler", "ram", "gpu", "psu", "fans"];

/** Every id must exist in the catalogue under its slot; a published build needs at least CPU and GPU. */
export function selectionErrors(s: BuildSelection): string[] {
  const errors: string[] = [];
  for (const cat of SINGLE) {
    const v = s[cat];
    if (v === null) continue;
    const c = hardwareRepository.byId(v);
    if (!c || c.category !== cat) errors.push(`Неизвестный компонент в слоте «${cat}»: ${v}`);
  }
  for (const v of s.storage) {
    const c = hardwareRepository.byId(v);
    if (!c || c.category !== "storage") errors.push(`Неизвестный накопитель: ${v}`);
  }
  if (!s.cpu || !s.gpu) errors.push("Для публикации в сборке должны быть процессор и видеокарта.");
  return errors;
}
