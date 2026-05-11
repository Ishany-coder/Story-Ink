import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";

// Admin replies to a support thread. Inserts a message with
// sender='admin' (bypassing the user-only insert RLS policy via the
// service-role client) and bumps last_message_at + admin_last_read_at.

export const maxDuration = 10;

interface Body {
  body?: unknown;
}

interface Ctx {
  params: Promise<{ id: string }>;
}

const MAX_LEN = 4000;

export async function POST(request: Request, ctx: Ctx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { id: threadId } = await ctx.params;
  const json = (await request.json().catch(() => ({}))) as Body;
  const rawBody = typeof json.body === "string" ? json.body.trim() : "";
  if (!rawBody) {
    return NextResponse.json(
      { error: "Reply body is required" },
      { status: 400 }
    );
  }
  const body = rawBody.slice(0, MAX_LEN);

  const admin = supabaseAdmin();

  const { data: thread } = await admin
    .from("support_threads")
    .select("id")
    .eq("id", threadId)
    .maybeSingle<{ id: string }>();
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { data: message, error } = await admin
    .from("support_messages")
    .insert({ thread_id: threadId, sender: "admin", body })
    .select("id, sender, body, created_at")
    .single();
  if (error || !message) {
    console.error("[admin/support/reply] insert failed:", error);
    return NextResponse.json(
      { error: "Couldn't send reply" },
      { status: 500 }
    );
  }

  await admin
    .from("support_threads")
    .update({ last_message_at: now, admin_last_read_at: now })
    .eq("id", threadId);

  return NextResponse.json({ message });
}
