import { z } from "zod";
import { comparableResults, publishBrowserResult, toOwn } from "@/lib/browser-bench/publish";
import { getBenchmarkStore, storeErrorResponse } from "@/lib/fps-engine/store";
import { readLimitedText, sameOrigin } from "@/lib/server/admin-auth";
import { createRateLimiter } from "@/lib/server/rate-limit";
import { getSessionUser } from "@/lib/supabase/server";

/**
 * NexRig browser benchmark results.
 *  GET  ?preset&backend&mode[&version]  — verified results of one comparable group (no user ids;
 *                                         unverified ones only as a count);
 *  GET  ?mine=1                         — the signed-in user's own published results;
 *  POST                                 — publish one result (signed in, same origin), stored as
 *                                         "unverified" after server-side consistency checks.
 */
const publishLimiter = createRateLimiter(10, 60 * 60 * 1000);

const groupSchema = z.object({
  preset: z.enum(["light", "medium", "heavy"]),
  backend: z.enum(["webgl2", "webgpu"]),
  mode: z.enum(["short", "stability"]),
  version: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  try {
    if (params.mine) {
      const user = await getSessionUser().catch(() => null);
      if (!user) return Response.json({ error: "Войдите, чтобы увидеть свои результаты." }, { status: 401 });
      const page = await getBenchmarkStore().listBrowserResults({ submittedBy: user.id, status: "any" }, 1, 50);
      return Response.json({ ...page, items: page.items.map(toOwn) });
    }
    const parsed = groupSchema.safeParse(params);
    if (!parsed.success) return Response.json({ error: "Укажите пресет, графический API и режим — сравниваются только совместимые результаты." }, { status: 400 });
    const { page, ...group } = parsed.data;
    return Response.json(await comparableResults(getBenchmarkStore(), group, page), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return storeErrorResponse(e);
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser().catch(() => null);
  if (!user) return Response.json({ error: "Войдите, чтобы опубликовать результат." }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Запрос отклонён: другой источник (Origin)." }, { status: 403 });
  const limit = publishLimiter.take(user.id);
  if (!limit.ok) return Response.json({ error: `Слишком много публикаций. Повторите через ${limit.retryAfterS} с.` }, { status: 429 });
  const body = await readLimitedText(request, 8_000);
  if (!body.ok) return body.response;
  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return Response.json({ error: "Ожидается JSON." }, { status: 400 });
  }
  try {
    const out = await publishBrowserResult(getBenchmarkStore(), user.id, json);
    return out.ok ? Response.json(out, { status: 201 }) : Response.json({ error: out.error, errors: out.errors }, { status: out.status });
  } catch (e) {
    return storeErrorResponse(e);
  }
}
