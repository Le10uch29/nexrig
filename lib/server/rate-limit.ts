import "server-only";

/**
 * In-memory sliding-window limiter, per server instance. On Vercel each function instance keeps its
 * own window, so this is a brake against bursts and accidental loops, not a global quota.
 * Keys are kept only in memory and only for the window.
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    /** Records a hit; false when the key is over the limit (the hit is not counted then). */
    take(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterS: number } {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { ok: false, retryAfterS: Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000)) };
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
      return { ok: true };
    },
  };
}

/** Client key for limits: the first forwarded address (set by the platform), else a shared bucket. */
export function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || request.headers.get("x-real-ip") || "anonymous";
}
