import { z } from "zod";
import { BENCH_VERSION } from "@/lib/browser-bench/config";
import { getBenchmarkStore, storeErrorResponse } from "@/lib/fps-engine/store";
import { readLimitedText, requireAdmin } from "@/lib/server/admin-auth";

/** Admin: review queue for published browser benchmark results. */
const listSchema = z.object({
  status: z.enum(["unverified", "verified", "rejected", "any"]).default("unverified"),
  version: z.string().max(40).optional(),
  preset: z.enum(["light", "medium", "heavy"]).optional(),
  backend: z.enum(["webgl2", "webgpu"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const parsed = listSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Некорректные параметры." }, { status: 400 });
  const { page, ...filter } = parsed.data;
  try {
    const result = await getBenchmarkStore().listBrowserResults(filter, page, 50);
    // Admins see who submitted only as "has author"; the id itself is not needed for review.
    return Response.json({ ...result, currentVersion: BENCH_VERSION, items: result.items.map(({ submittedBy, fingerprint: _f, reviewedBy, ...r }) => (void _f, { ...r, hasAuthor: Boolean(submittedBy), reviewedBySession: Boolean(reviewedBy) })) });
  } catch (e) {
    return storeErrorResponse(e);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const body = await readLimitedText(request, 2_000);
  if (!body.ok) return body.response;
  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return Response.json({ error: "Ожидается JSON." }, { status: 400 });
  }
  const parsed = z.object({ id: z.string().min(1).max(64), status: z.enum(["unverified", "verified", "rejected"]) }).safeParse(json);
  if (!parsed.success) return Response.json({ error: "Некорректные параметры." }, { status: 400 });
  try {
    // The reviewer is taken from the server-side admin check, never from the request body.
    const updated = await getBenchmarkStore().setBrowserResultStatus(parsed.data.id, parsed.data.status, auth.userId);
    return updated ? Response.json({ ok: true, status: updated.status }) : Response.json({ error: "Результат не найден." }, { status: 404 });
  } catch (e) {
    return storeErrorResponse(e);
  }
}
