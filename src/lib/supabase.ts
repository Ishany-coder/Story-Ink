import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser-safe client. Uses the public anon key. RLS policies on the
// stories table apply.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Server-only admin client. Uses the service role key, which bypasses RLS
// entirely — must NEVER be imported into client code. Use this in /api
// route handlers and server components for any operation that needs to
// write to Storage or do unrestricted DB work.
//
// Lazily initialized so the rest of the app keeps working in dev even if
// the env var hasn't been set yet — only Storage uploads will fail with a
// clear error message.
let _admin: SupabaseClient | null = null;
export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Get it from Supabase dashboard → Project Settings → API → service_role, and add it to .env.local, then restart `next dev`."
    );
  }
  _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  return _admin;
}
