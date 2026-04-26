// Next.js middleware that runs before every request. Its only job is
// to refresh the Supabase session cookie if it's about to expire so
// users don't get unexpectedly signed out mid-session.
//
// We MUST call supabase.auth.getUser() here — it's what triggers the
// SDK to refresh the cookie when needed.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

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
  return response;
}

// Match every route except static assets. Keep this matcher in sync
// with the static asset paths Next.js serves directly so we don't add
// pointless overhead.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
