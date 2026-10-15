import "server-only";
import { storeErrorResponse } from "@/lib/fps-engine/store";
import { readLimitedText, sameOrigin } from "@/lib/server/admin-auth";
import { createRateLimiter } from "@/lib/server/rate-limit";
import type { Outcome, Viewer } from "./service";

/** Helpers shared by the community API routes. */
export async function currentViewer(): Promise<Viewer> {
  const { getSessionUser } = await import("@/lib/supabase/server");
  const u = await getSessionUser().catch(() => null);
  return u ? { id: u.id, isAdmin: u.isAdmin } : null;
}

export const respond = <T>(o: Outcome<T>, okStatus = 200) => (o.ok ? Response.json(o.value, { status: okStatus }) : Response.json({ error: o.error }, { status: o.status }));

/** Short bursts per user (per instance); the hourly comment limit is enforced in the database. */
const burst = createRateLimiter(6, 30_000);

/**
 * Checks a state-changing request: signed in, same origin, not bursting; returns the parsed body.
 * `viewer` is injectable for tests.
 */
export async function writeGuard(request: Request, opts: { maxBytes?: number; body?: boolean; viewer?: Viewer } = {}): Promise<{ ok: true; viewer: NonNullable<Viewer>; json: unknown } | { ok: false; response: Response }> {
  const viewer = opts.viewer !== undefined ? opts.viewer : await currentViewer();
  if (!viewer) return { ok: false, response: Response.json({ error: "Войдите в аккаунт." }, { status: 401 }) };
  if (!sameOrigin(request)) return { ok: false, response: Response.json({ error: "Запрос отклонён: другой источник (Origin)." }, { status: 403 }) };
  const limit = burst.take(viewer.id);
  if (!limit.ok) return { ok: false, response: Response.json({ error: `Слишком часто. Повторите через ${limit.retryAfterS} с.` }, { status: 429 }) };
  if (opts.body === false) return { ok: true, viewer, json: null };
  const text = await readLimitedText(request, opts.maxBytes ?? 16_000);
  if (!text.ok) return { ok: false, response: text.response };
  try {
    return { ok: true, viewer, json: JSON.parse(text.text) };
  } catch {
    return { ok: false, response: Response.json({ error: "Ожидается JSON." }, { status: 400 }) };
  }
}

export async function guarded(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    return storeErrorResponse(e);
  }
}
