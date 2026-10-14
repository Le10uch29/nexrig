import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Admin access for global data (benchmarks, imports). Two ways in, both checked on the server:
 *
 *  1. A Supabase session whose JWT has app_metadata.role = "admin" (signed-in admin in the UI).
 *     app_metadata is writable only with the secret key — users cannot grant it to themselves.
 *     Cookie-authenticated writes must come from this site (Origin check against CSRF).
 *  2. NEXRIG_ADMIN_TOKEN as `Authorization: Bearer <token>` (scripts/CI; server env only, 24+ chars).
 *
 * If neither is configured, every admin route answers 503 — nothing is writable by default.
 */
const MIN_TOKEN = 24;

const digest = (s: string) => createHash("sha256").update(s).digest();

export type AdminCheck = { ok: true; via: "token" | "session" } | { ok: false; response: Response };

const deny = (status: number, error: string): AdminCheck => ({ ok: false, response: Response.json({ error }, { status }) });

/** Same-site check for cookie-authenticated state changes. */
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
    return o.host === host;
  } catch {
    return false;
  }
}

export async function requireAdmin(request: Request, getUser: () => Promise<{ isAdmin: boolean } | null> = defaultSessionUser): Promise<AdminCheck> {
  const expected = process.env.NEXRIG_ADMIN_TOKEN;
  const tokenConfigured = Boolean(expected && expected.length >= MIN_TOKEN);
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  // An explicit token is judged on its own: a wrong token is never rescued by a cookie.
  if (token) {
    if (!tokenConfigured) return deny(503, "Вход по токену не настроен на сервере.");
    // Compare fixed-length digests in constant time.
    return timingSafeEqual(digest(token), digest(expected!)) ? { ok: true, via: "token" } : deny(401, "Нет прав администратора.");
  }

  const user = await getUser().catch(() => null);
  if (!user) return authConfiguredOnServer() || tokenConfigured ? deny(401, "Войдите как администратор.") : deny(503, "Администрирование не настроено на сервере.");
  if (!user.isAdmin) return deny(403, "Недостаточно прав: нужна роль администратора.");
  if (request.method !== "GET" && request.method !== "HEAD" && !sameOrigin(request)) return deny(403, "Запрос отклонён: другой источник (Origin).");
  return { ok: true, via: "session" };
}

function authConfiguredOnServer() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_KEY));
}

async function defaultSessionUser() {
  // Loaded lazily so code paths that only use tokens (and tests) do not need a request scope.
  const { getSessionUser } = await import("@/lib/supabase/server");
  return getSessionUser();
}

/**
 * Reads a request body up to maxBytes. The Content-Length header is checked first, and the stream
 * is also counted while reading, so a missing or false header cannot push a larger body into memory.
 */
export async function readLimitedText(request: Request, maxBytes: number): Promise<{ ok: true; text: string } | { ok: false; response: Response }> {
  const tooLarge = () => ({ ok: false as const, response: Response.json({ error: "Слишком большой запрос." }, { status: 413 }) });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return tooLarge();
  if (!request.body) return { ok: true, text: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return tooLarge();
    }
    chunks.push(value);
  }
  return { ok: true, text: new TextDecoder().decode(Buffer.concat(chunks)) };
}
