// Server-side Supabase client that respects the user's auth session.
//
// Use this in server components and API routes when you want the
// authenticated user's identity to flow into queries — RLS policies on
// the database use auth.uid() to scope reads/writes to the owner.
//
// For unrestricted server work (Storage uploads, jobs table writes
// triggered by Inngest, mutating data on behalf of webhook events),
// keep using `supabaseAdmin()` from "@/lib/supabase". That client uses
// the service-role key and bypasses RLS.
//
// In Next.js App Router this client has to be async because it reads
// cookies via `next/headers` which is a Promise.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export async function getSupabaseServer(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          // In server components Next forbids cookie writes — those
          // calls throw silently here. The middleware refreshes
          // session cookies on every request, so an occasional
          // skipped write isn't a problem.
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // server component context — fine to ignore
          }
        },
      },
    }
  );
}

// Convenience: returns the currently signed-in user, or null. Use this
// at the top of server components / route handlers to gate access.
export async function getCurrentUser(): Promise<User | null> {
  const supa = await getSupabaseServer();
  const { data, error } = await supa.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

// Throw-style guard for API routes. Catches in your handler should turn
// an UnauthorizedError into a 401 response.
export class UnauthorizedError extends Error {
  constructor(message = "Sign in required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

// Throws when the story doesn't exist OR the caller doesn't own it.
// Returns the story's user_id and is_public so callers can decide on
// further behavior (e.g., allow read-only access for public stories).
//
// Uses the service-role admin client so the lookup isn't itself
// gated by RLS — the policy check is explicit here. Importing this
// helper from a route handler also implicitly requires this file to
// run server-side only, which is what we want.
import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

export interface StoryOwnership {
  user_id: string | null;
  is_public: boolean;
}

export async function fetchStoryOwnership(
  storyId: string
): Promise<StoryOwnership | null> {
  const { data, error } = await supabaseAdmin()
    .from("stories")
    .select("user_id, is_public")
    .eq("id", storyId)
    .maybeSingle<StoryOwnership>();
  if (error || !data) return null;
  return data;
}

export async function assertOwnsStory(
  storyId: string,
  userId: string
): Promise<NextResponse | null> {
  const ownership = await fetchStoryOwnership(storyId);
  if (!ownership) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }
  if (ownership.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
