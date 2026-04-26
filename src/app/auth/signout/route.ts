import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// POST-only signout — POST is required so the browser doesn't sign
// you out on a stray prefetch.

export async function POST(request: Request) {
  const supa = await getSupabaseServer();
  await supa.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
