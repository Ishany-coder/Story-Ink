import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdminUser } from "@/lib/admin";
import { getCurrentUser } from "@/lib/supabase-server";

// Admin-only: advance a print_orders row through the fulfillment
// state machine. Each transition writes an audit row to
// print_order_events with the actor (admin user id).
//
// Allowed transitions (server-enforced):
//   received    → in_progress | failed
//   in_progress → shipped     | failed
//   shipped     → delivered   | failed
//   failed      → received                (admin can retry)
//
// Non-admins get a 404 — never 403, so the route's existence isn't
// leaked to a curious client.

interface Ctx {
  params: Promise<{ id: string }>;
}

const TRANSITIONS: Record<string, ReadonlyArray<string>> = {
  received: ["in_progress", "failed"],
  in_progress: ["shipped", "failed"],
  shipped: ["delivered", "failed"],
  failed: ["received"],
};

interface Body {
  status?: unknown;
  note?: unknown;
}

export async function POST(request: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!isAdminUser(user)) {
    // Mirror NotAdminError's behavior — 404, no info leak.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as Body;
  const nextStatus = typeof body.status === "string" ? body.status : "";
  if (!nextStatus) {
    return NextResponse.json(
      { error: "status is required" },
      { status: 400 }
    );
  }

  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim().slice(0, 500)
      : null;

  const admin = supabaseAdmin();

  const { data: order, error: fetchErr } = await admin
    .from("print_orders")
    .select("id, status")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string }>();
  if (fetchErr || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const allowedNext = TRANSITIONS[order.status] ?? [];
  if (!allowedNext.includes(nextStatus)) {
    return NextResponse.json(
      {
        error: `Can't move from ${order.status} to ${nextStatus}`,
        allowed: allowedNext,
      },
      { status: 409 }
    );
  }

  const { error: updateErr } = await admin
    .from("print_orders")
    .update({ status: nextStatus })
    .eq("id", id)
    .eq("status", order.status); // CAS so concurrent updates don't trample

  if (updateErr) {
    console.error("[orders/status] update failed:", updateErr);
    return NextResponse.json(
      { error: "Couldn't update order" },
      { status: 500 }
    );
  }

  await admin.from("print_order_events").insert({
    order_id: id,
    status: nextStatus,
    note,
    actor_id: (user as { id: string }).id,
  });

  return NextResponse.json({ ok: true, status: nextStatus });
}
