// Next.js middleware that runs before every request. Its only job is
// to refresh the Supabase session cookie if it's about to expire so
// users don't get unexpectedly signed out mid-session.
//
// We MUST call supabase.auth.getUser() here — it's what triggers the
// SDK to refresh the cookie when needed.
//
// Defensive note: Next 16 + Turbopack will surface a *runtime* error
// in middleware as a blanket 404 across every route (including
// /api/inngest), making the app look completely broken. We catch
// here so a malformed Supabase session cookie or a transient SDK
// blip can't take the whole site down — the worst case becomes
// "session not refreshed this request," not "every page 404s."

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (toSet) => {
            for (const { name, value, options } of toSet) {
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            }
          },
        },
      }
    );

    await supabase.auth.getUser();
  } catch (err) {
    console.error("[middleware] auth refresh failed:", err);
  }

  return response;
}

// Match every route except static assets and the Inngest dev-server
// callback path. Inngest probes /api/inngest with PUT requests on a
// tight loop in dev — running our auth refresh on those is wasted
// work and can mask real middleware errors in the logs.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/inngest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
