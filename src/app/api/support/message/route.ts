import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/supabase-server";

// User-side: post a new message into their own support thread.
// Creates the thread on first message if it doesn't exist yet.

export const maxDuration = 10;

interface Body {
  body?: unknown;
}

interface ThreadRow {
  id: string;
}

const MAX_LEN = 4000;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const json = (await request.json().catch(() => ({}))) as Body;
  const rawBody = typeof json.body === "string" ? json.body.trim() : "";
  if (!rawBody) {
    return NextResponse.json(
      { error: "Message body is required" },
      { status: 400 }
    );
  }
  const body = rawBody.slice(0, MAX_LEN);

  const admin = supabaseAdmin();

  // Get or create thread.
  let thread: ThreadRow | null = null;
  {
    const { data } = await admin
      .from("support_threads")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle<ThreadRow>();
    thread = data;
  }
  if (!thread) {
    const { data: inserted, error } = await admin
      .from("support_threads")
      .insert({ user_id: user.id })
      .select("id")
      .single<ThreadRow>();
    if (error || !inserted) {
      const { data: retry } = await admin
        .from("support_threads")
        .select("id")
        .eq("user_id", user.id)
        .single<ThreadRow>();
      thread = retry ?? null;
    } else {
      thread = inserted;
    }
  }
  if (!thread) {
    return NextResponse.json(
      { error: "Couldn't open support thread" },
      { status: 500 }
    );
  }

  const now = new Date().toISOString();
  const { data: message, error: insertErr } = await admin
    .from("support_messages")
    .insert({
      thread_id: thread.id,
      sender: "user",
      body,
    })
    .select("id, sender, body, created_at")
    .single();
  if (insertErr || !message) {
    console.error("[support/message] insert failed:", insertErr);
    return NextResponse.json(
      { error: "Couldn't send message" },
      { status: 500 }
    );
  }

  // Bump last_message_at and the user's read receipt — sending a
  // message implicitly marks the thread as read on their side.
  await admin
    .from("support_threads")
    .update({ last_message_at: now, user_last_read_at: now })
    .eq("id", thread.id);

  return NextResponse.json({ message });
}
