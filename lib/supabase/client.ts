"use client";

import { createBrowserClient } from "@supabase/ssr";
import { authConfigured, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

/** Browser Supabase client (publishable key; the library keeps a single instance). Null when not configured. */
export function getBrowserSupabase() {
  if (!authConfigured) return null;
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
