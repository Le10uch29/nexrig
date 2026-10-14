import { z } from "zod";
import { badRequest } from "@/lib/fps-engine/api-schemas";
import { checkSource, sourceOverview, updateSource } from "@/lib/fps-engine/source-registry";
import { getBenchmarkStore, storeErrorResponse } from "@/lib/fps-engine/store";
import { readLimitedText, requireAdmin } from "@/lib/server/admin-auth";

/** Admin: audited sources with their stored state and count of usable (verified) records. */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    return Response.json(await sourceOverview(getBenchmarkStore()), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return storeErrorResponse(e);
  }
}

const patchSchema = z.object({
  id: z.string().trim().min(1).max(40),
  enabled: z.boolean().optional(),
  baseUrl: z.string().trim().max(500).nullable().optional(),
});

async function body(request: Request) {
  const text = await readLimitedText(request, 4_000);
  if (!text.ok) return { ok: false as const, response: text.response };
  try {
    return { ok: true as const, json: JSON.parse(text.text) as unknown };
  } catch {
    return { ok: false as const, response: Response.json({ error: "Ожидается JSON." }, { status: 400 }) };
  }
}

/** Admin: enable/disable a source or change its page URL. */
export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const b = await body(request);
  if (!b.ok) return b.response;
  const parsed = patchSchema.safeParse(b.json);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const { id, ...patch } = parsed.data;
    const result = await updateSource(getBenchmarkStore(), id, patch);
    return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.error }, { status: result.status });
  } catch (e) {
    return storeErrorResponse(e);
  }
}

/** Admin: check a source now (one request to its public feed/page; nothing is imported). */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const b = await body(request);
  if (!b.ok) return b.response;
  const parsed = z.object({ id: z.string().trim().min(1).max(40), action: z.literal("check") }).safeParse(b.json);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const result = await checkSource(getBenchmarkStore(), parsed.data.id);
    return result ? Response.json(result) : Response.json({ error: "Источник не найден." }, { status: 404 });
  } catch (e) {
    return storeErrorResponse(e);
  }
}
