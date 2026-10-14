/**
 * Public Supabase settings (safe for the browser): project URL and the publishable key.
 * NEXT_PUBLIC_ variables must be read with literal names so Next.js can inline them.
 * The URL is accepted with or without a trailing "/rest/v1".
 */
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_KEY ?? "";

function normalizeUrl(u: string) {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1" ? url.origin : "";
  } catch {
    return "";
  }
}

export const SUPABASE_URL = normalizeUrl(rawUrl);
/** Only publishable/anon keys belong here; a secret key in a public variable is refused. */
export const SUPABASE_PUBLISHABLE_KEY = rawKey.startsWith("sb_secret_") ? "" : rawKey;

export const authConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
