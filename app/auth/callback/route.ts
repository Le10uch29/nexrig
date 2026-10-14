import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Email confirmation / magic-link landing: exchanges the one-time code for a session cookie,
 * then sends the user back. `next` must be a same-site path (no open redirects).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/builder";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/builder";
  const supabase = await getServerSupabase();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(`${next}${next.includes("?") ? "&" : "?"}auth=confirmed`, url.origin));
  }
  return NextResponse.redirect(new URL("/builder?auth=error", url.origin));
}
