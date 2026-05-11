import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/supabase-server";

// Lightweight "does the user have an unread admin reply?" check.
// Powers the blue dot on the Help tab without loading the full
// message history. Polled at a slow cadence (every 30s while the
// app is open) — keep it cheap.

export const maxDuration = 5;

interface ThreadRow {
  id: string;
  user_last_read_at: string;
  last_message_at: string;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    // 200 with unread=false rather than 401 so the navbar component
    // doesn't have to special-case auth — signed-out viewers just
    // never see the dot.
    return NextResponse.json({ unread: false });
  }

  const admin = supabaseAdmin();
  const { data: thread } = await admin
    .from("support_threads")
    .select("id, user_last_read_at, last_message_at")
    .eq("user_id", user.id)
    .maybeSingle<ThreadRow>();
  if (!thread) {
    return NextResponse.json({ unread: false });
  }

  // Has the admin posted any message after the user's last-read
  // timestamp? Cheaper than counting messages: limit 1, just check
  // existence.
  const { data: hits } = await admin
    .from("support_messages")
    .select("id")
    .eq("thread_id", thread.id)
    .eq("sender", "admin")
    .gt("created_at", thread.user_last_read_at)
    .limit(1);

  return NextResponse.json({ unread: (hits?.length ?? 0) > 0 });
}
