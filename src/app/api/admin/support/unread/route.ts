import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";

// Lightweight "does any thread have an unread customer message?"
// check for the admin's Help-button blue dot. Polled every 30s
// while the admin is anywhere in the app outside /admin/support.

export const maxDuration = 5;

interface ThreadRow {
  id: string;
  admin_last_read_at: string;
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ unread: false });
  }

  const admin = supabaseAdmin();
  const { data: threads } = await admin
    .from("support_threads")
    .select("id, admin_last_read_at")
    .returns<ThreadRow[]>();

  const list = threads ?? [];
  if (list.length === 0) {
    return NextResponse.json({ unread: false });
  }

  // For each thread, is there any user-sent message newer than the
  // admin's last read? We check existence with a small batched query
  // — at the scale this app cares about (tens of threads) a single
  // round-trip is fine.
  const ids = list.map((t) => t.id);
  const { data: userMessages } = await admin
    .from("support_messages")
    .select("thread_id, created_at")
    .in("thread_id", ids)
    .eq("sender", "user")
    .returns<{ thread_id: string; created_at: string }[]>();

  const lastUserAt = new Map<string, string>();
  for (const m of userMessages ?? []) {
    const cur = lastUserAt.get(m.thread_id);
    if (!cur || m.created_at > cur) {
      lastUserAt.set(m.thread_id, m.created_at);
    }
  }

  const unread = list.some((t) => {
    const last = lastUserAt.get(t.id);
    return !!last && last > t.admin_last_read_at;
  });

  return NextResponse.json({ unread });
}
