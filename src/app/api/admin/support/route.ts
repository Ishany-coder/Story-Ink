import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";

// Admin inbox: every support thread + a preview of the latest
// message + whether it's unread on the admin's side. Sorted by
// last_message_at desc so the most active threads bubble up.
//
// Non-admins get a 404 (not 403) so the route's existence isn't
// leaked.

export const maxDuration = 10;

interface ThreadRow {
  id: string;
  user_id: string;
  created_at: string;
  last_message_at: string;
  admin_last_read_at: string;
}

interface LatestMessageRow {
  thread_id: string;
  sender: "user" | "admin";
  body: string;
  created_at: string;
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admin = supabaseAdmin();
  const { data: threads, error } = await admin
    .from("support_threads")
    .select(
      "id, user_id, created_at, last_message_at, admin_last_read_at"
    )
    .order("last_message_at", { ascending: false })
    .returns<ThreadRow[]>();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = threads ?? [];
  if (list.length === 0) {
    return NextResponse.json({ threads: [] });
  }

  // Pull the latest message per thread + a per-thread unread check
  // in parallel. For tens of threads the naive approach is fine.
  const ids = list.map((t) => t.id);
  const [latestRes, unreadRes, emails] = await Promise.all([
    admin
      .from("support_messages")
      .select("thread_id, sender, body, created_at")
      .in("thread_id", ids)
      .order("created_at", { ascending: false })
      .returns<LatestMessageRow[]>(),
    // Any user message newer than admin_last_read_at → unread.
    // We fetch user-sender messages and filter in memory; the
    // alternative (one query per thread) is N round-trips.
    admin
      .from("support_messages")
      .select("thread_id, created_at")
      .in("thread_id", ids)
      .eq("sender", "user")
      .returns<{ thread_id: string; created_at: string }[]>(),
    fetchEmailsByUserId(list.map((t) => t.user_id)),
  ]);

  const latestByThread = new Map<string, LatestMessageRow>();
  for (const m of latestRes.data ?? []) {
    if (!latestByThread.has(m.thread_id)) latestByThread.set(m.thread_id, m);
  }

  const lastUserMessageAt = new Map<string, string>();
  for (const m of unreadRes.data ?? []) {
    const cur = lastUserMessageAt.get(m.thread_id);
    if (!cur || m.created_at > cur) {
      lastUserMessageAt.set(m.thread_id, m.created_at);
    }
  }

  const out = list.map((t) => {
    const last = latestByThread.get(t.id);
    const lastUserAt = lastUserMessageAt.get(t.id);
    const unread =
      !!lastUserAt && lastUserAt > t.admin_last_read_at;
    return {
      id: t.id,
      userId: t.user_id,
      email: emails.get(t.user_id) ?? null,
      createdAt: t.created_at,
      lastMessageAt: t.last_message_at,
      lastMessage: last
        ? { sender: last.sender, body: last.body, createdAt: last.created_at }
        : null,
      unread,
    };
  });

  return NextResponse.json({ threads: out });
}

async function fetchEmailsByUserId(
  userIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  const admin = supabaseAdmin();
  await Promise.all(
    userIds.map(async (id) => {
      try {
        const { data } = await admin.auth.admin.getUserById(id);
        const email = data.user?.email;
        if (email) out.set(id, email);
      } catch (err) {
        console.warn("[admin/support] email lookup failed for", id, err);
      }
    })
  );
  return out;
}
