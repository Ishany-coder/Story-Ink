import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// Magic-link callback. Supabase's email link points here with a
// one-time `code` that we exchange for a session cookie via the SSR
// helper. The `next` param carries the user back to wherever they
// were trying to go before login bounced them here.

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";

  if (code) {
    const supa = await getSupabaseServer();
    const { error } = await supa.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] code exchange failed:", error.message);
      return NextResponse.redirect(
        new URL(
          `/login?error=${encodeURIComponent(error.message)}`,
          url.origin
        )
      );
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
