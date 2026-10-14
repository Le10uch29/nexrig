import { randomUUID } from "node:crypto";
import { z } from "zod";
import { SOURCE_IDS } from "@/lib/fps-engine/sources";
import { getBenchmarkStore, storeErrorResponse } from "@/lib/fps-engine/store";
import { previewImport } from "@/lib/fps-engine/validation";
import { readLimitedText, sameOrigin } from "@/lib/server/admin-auth";
import { getSessionUser } from "@/lib/supabase/server";

/**
 * Community measurements: a signed-in user submits a real result for review. It is stored as
 * "unverified" and is invisible to others until an admin verifies it. The author id is kept for
 * moderation but never returned by the public API.
 */
const MAX_PENDING_PER_USER = 10;

const submissionSchema = z.object({
  game_id: z.string().min(1).max(120),
  cpu_id: z.string().min(1).max(120),
  gpu_id: z.string().min(1).max(120),
  resolution: z.string(),
  preset: z.string(),
  ray_tracing: z.boolean(),
  upscaling: z.string().optional(),
  upscaler: z.string().nullable().optional(),
  frame_gen: z.boolean().optional(),
  avg_fps: z.number(),
  low1_fps: z.number().optional(),
  ram_gb: z.number().optional(),
  ram_type: z.string().optional(),
  test_date: z.string(),
  game_version: z.string().max(60).optional(),
  method: z.string().trim().min(3, "Укажите, чем и как измеряли (например, «MSI Afterburner, встроенный бенчмарк»)").max(200),
  test_config: z.string().max(300).optional(),
  source_url: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
  sample_count: z.number().int().optional(),
});

async function signedInUser(request: Request) {
  const user = await getSessionUser().catch(() => null);
  if (!user) return { error: Response.json({ error: "Войдите, чтобы отправлять замеры." }, { status: 401 }) };
  if (request.method !== "GET" && !sameOrigin(request)) return { error: Response.json({ error: "Запрос отклонён: другой источник (Origin)." }, { status: 403 }) };
  return { user };
}

/** The signed-in user's own submissions (any status). */
export async function GET(request: Request) {
  const auth = await signedInUser(request);
  if (auth.error) return auth.error;
  try {
    const page = await getBenchmarkStore().list({ submittedBy: auth.user.id, verification: "any" }, 1, 50);
    return Response.json(page);
  } catch (e) {
    return storeErrorResponse(e);
  }
}

/** Submit one measurement for review. */
export async function POST(request: Request) {
  const auth = await signedInUser(request);
  if (auth.error) return auth.error;
  const body = await readLimitedText(request, 10_000);
  if (!body.ok) return body.response;
  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return Response.json({ error: "Ожидается JSON." }, { status: 400 });
  }
  const parsed = submissionSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Некорректные данные." }, { status: 400 });
  try {
    const store = getBenchmarkStore();
    const pending = await store.count({ submittedBy: auth.user.id, verification: "unverified" });
    if (pending >= MAX_PENDING_PER_USER) {
      return Response.json({ error: `У вас уже ${pending} замеров на проверке. Дождитесь проверки, прежде чем отправлять новые.` }, { status: 429 });
    }
    // Same validation as imports; source is fixed server-side, the author comes from the session.
    const row = { ...parsed.data, upscaling: parsed.data.upscaling ?? "off", source_id: "nexrig", source_label: "Замер пользователя NexRig" };
    const preview = previewImport({ format: "json", content: JSON.stringify([row]) }, [], SOURCE_IDS, () => randomUUID());
    if (preview.errors.length) return Response.json({ error: preview.errors[0].messages.join("; ") }, { status: 422 });
    const record = { ...preview.valid[0].record, source: { kind: "user" as const, label: "Замер пользователя NexRig", url: preview.valid[0].record.source.url }, submittedBy: auth.user.id };
    const inserted = await store.insertSubmission(record);
    if (!inserted) return Response.json({ error: "Такой замер (та же конфигурация, настройки, ссылка и дата) уже есть." }, { status: 409 });
    return Response.json({ status: "unverified" }, { status: 201 });
  } catch (e) {
    return storeErrorResponse(e);
  }
}
