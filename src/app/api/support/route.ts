import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/supabase-server";

// Get the signed-in user's support thread (auto-creating if it
// doesn't exist) plus every message in chronological order. Marks
// the thread as read on the user's side so the blue dot clears.
//
// Service-role client throughout for two reasons:
//   1. UNIQUE(user_id) on support_threads means a parallel insert
//      from a doubled-up request can race; we want consistent
//      "select or create" semantics that don't 409.
//   2. The update for user_last_read_at touches a row the user owns
//      but the service role makes the read-current/write-new
//      operation simpler than juggling RLS-scoped clients.
// Ownership is enforced by selecting/updating with user_id = caller.

export const maxDuration = 10;

interface MessageRow {
  id: string;
  sender: "user" | "admin";
  body: string;
  created_at: string;
}

interface ThreadRow {
  id: string;
  user_id: string;
  created_at: string;
  last_message_at: string;
  user_last_read_at: string;
  admin_last_read_at: string;
}

async function getOrCreateThread(userId: string): Promise<ThreadRow> {
  const admin = supabaseAdmin();
  const { data: existing } = await admin
    .from("support_threads")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle<ThreadRow>();
  if (existing) return existing;

  const { data: inserted, error } = await admin
    .from("support_threads")
    .insert({ user_id: userId })
    .select("*")
    .single<ThreadRow>();
  if (error || !inserted) {
    // Race: another request inserted between our select and ours.
    // Re-fetch (UNIQUE constraint guarantees we'll find it).
    const { data: retry } = await admin
      .from("support_threads")
      .select("*")
      .eq("user_id", userId)
      .single<ThreadRow>();
    if (retry) return retry;
    throw new Error(error?.message || "Couldn't create support thread");
  }
  return inserted;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const thread = await getOrCreateThread(user.id);
  const admin = supabaseAdmin();

  const { data: messages } = await admin
    .from("support_messages")
    .select("id, sender, body, created_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true })
    .returns<MessageRow[]>();

  // Mark the user side as read — fixes the blue dot on the Help tab
  // immediately even though admin replies may still be polling in
  // for the panel.
  await admin
    .from("support_threads")
    .update({ user_last_read_at: new Date().toISOString() })
    .eq("id", thread.id);

  return NextResponse.json({
    threadId: thread.id,
    messages: messages ?? [],
  });
}
