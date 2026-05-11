import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";

// Admin: fetch all messages for one thread + mark it as read on the
// admin side. The read-mark fires on GET so opening a thread in the
// inbox UI is enough to clear its blue dot.

export const maxDuration = 10;

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, ctx: Ctx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { id } = await ctx.params;
  const admin = supabaseAdmin();

  const { data: thread } = await admin
    .from("support_threads")
    .select("id, user_id, created_at, last_message_at")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      user_id: string;
      created_at: string;
      last_message_at: string;
    }>();
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const { data: messages } = await admin
    .from("support_messages")
    .select("id, sender, body, created_at")
    .eq("thread_id", id)
    .order("created_at", { ascending: true })
    .returns<
      { id: string; sender: "user" | "admin"; body: string; created_at: string }[]
    >();

  // Mark read on the admin side so the blue dot in /admin/support
  // clears.
  await admin
    .from("support_threads")
    .update({ admin_last_read_at: new Date().toISOString() })
    .eq("id", id);

  let email: string | null = null;
  try {
    const { data } = await admin.auth.admin.getUserById(thread.user_id);
    email = data.user?.email ?? null;
  } catch {
    /* ignore */
  }

  return NextResponse.json({
    thread: { ...thread, email },
    messages: messages ?? [],
  });
}
