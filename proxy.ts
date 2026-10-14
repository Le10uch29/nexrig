import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authConfigured, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

/**
 * Keeps the Supabase session fresh: getClaims() refreshes an expiring token, and the refreshed
 * cookies are written to both the request (for this render) and the response (for the browser),
 * together with the no-cache headers the library supplies. No redirects or access rules here —
 * authorization is checked where the data is (API routes, RLS).
 */
export async function proxy(request: NextRequest) {
  // Supabase falls back to the Site URL root when a redirect URL is not allow-listed:
  // send such links (/?code=…) to the callback that turns the code into a session.
  const code = request.nextUrl.searchParams.get("code");
  if (request.nextUrl.pathname === "/" && code) {
    const target = new URL("/auth/callback", request.url);
    target.searchParams.set("code", code);
    target.searchParams.set("next", "/builder");
    return NextResponse.redirect(target);
  }

  let response = NextResponse.next({ request });
  if (!authConfigured) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet, headers) {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });
  // Do not run code between client creation and getClaims(): it would race the refresh.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  // Everything except static files, image optimisation and public assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|models/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb|gltf)$).*)"],
};
