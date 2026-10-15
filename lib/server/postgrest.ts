import "server-only";
import { StoreError } from "@/lib/fps-engine/store";

/**
 * Minimal PostgREST client for server-side stores (secret key, never sent to the browser).
 * Errors become StoreError with safe messages — no keys, URLs or raw responses.
 */
export function createPostgrest(baseUrl: string, secretKey: string, missingSchemaMessage: string) {
  const rest = `${baseUrl}/rest/v1`;
  async function call(path: string, init: RequestInit & { prefer?: string; range?: string } = {}) {
    const headers: Record<string, string> = { apikey: secretKey, Authorization: `Bearer ${secretKey}`, Accept: "application/json" };
    if (init.body) headers["Content-Type"] = "application/json";
    if (init.prefer) headers.Prefer = init.prefer;
    if (init.range) headers.Range = init.range;
    let res: Response;
    try {
      res = await fetch(`${rest}/${path}`, { ...init, headers, cache: "no-store" });
    } catch {
      throw new StoreError("База данных недоступна (ошибка сети).");
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      if (body.code === "PGRST205" || body.code === "PGRST200" || body.code === "42703" || body.code === "42P01") throw new StoreError(missingSchemaMessage);
      if (body.code === "23505") throw new StoreError("Такая запись уже есть.", 409);
      if (body.code === "23503") throw new StoreError("Связанная запись не найдена.", 422);
      if (body.code === "23514") throw new StoreError("Значения не прошли проверку базы данных.", 422);
      if (res.status === 401 || res.status === 403) throw new StoreError("Нет доступа к базе: проверьте серверный ключ Supabase.");
      throw new StoreError(`Ошибка базы данных (HTTP ${res.status}).`);
    }
    return res;
  }
  const json = async <T>(res: Response) => (res.status === 204 ? (null as T) : ((await res.json()) as T));
  const total = (res: Response) => {
    const n = Number(res.headers.get("content-range")?.split("/")[1] ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  return { call, json, total };
}
