import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authConfigured, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

/**
 * Per-request server client bound to the auth cookies (publishable key — acts as the signed-in
 * user, so RLS applies). Never cache it across requests. Null when auth is not configured.
 */
export async function getServerSupabase() {
  if (!authConfigured) return null;
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(toSet) {
        // Route Handlers can write cookies; Server Components cannot — the proxy refreshes there.
        try {
          toSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: ignore, the proxy keeps the session fresh.
        }
      },
    },
  });
}

export interface SessionUser {
  id: string;
  email: string | null;
  isAdmin: boolean;
}

/**
 * The signed-in user from verified JWT claims (getClaims checks the signature), or null.
 * Authorization uses app_metadata.role — never user_metadata, which users can edit.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const claims = data.claims as { sub: string; email?: string; app_metadata?: { role?: string } };
  return { id: claims.sub, email: claims.email ?? null, isAdmin: claims.app_metadata?.role === "admin" };
}
