import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/supabase-server";

// Customer-initiated cancel. Only works while the order is still in
// "received" — once the admin has marked it "in_progress" the print
// vendor has already been engaged and we can't pull it back.
//
// Why service-role: the regular RLS policy on print_orders only grants
// SELECT to owners, not UPDATE. We use the admin client here and gate
// access with an explicit user_id check before mutating.

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const admin = supabaseAdmin();

  const { data: order, error: fetchErr } = await admin
    .from("print_orders")
    .select("id, status, user_id")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string; user_id: string | null }>();
  if (fetchErr || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Ownership check. Without this the service-role client would happily
  // cancel anyone's order.
  if (order.user_id !== user.id) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status !== "received") {
    return NextResponse.json(
      {
        error:
          order.status === "cancelled"
            ? "Order is already cancelled."
            : "This order has already been started — it can't be cancelled now. Reply to the confirmation email if you need to make changes.",
      },
      { status: 409 }
    );
  }

  // CAS: only flip to cancelled if status is still received. Prevents
  // a race with the admin moving the order to in_progress at the same
  // time as the customer cancelling.
  const { data: updated, error: updateErr } = await admin
    .from("print_orders")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "received")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updateErr) {
    console.error("[my-orders/cancel] update failed:", updateErr);
    return NextResponse.json(
      { error: "Couldn't cancel the order" },
      { status: 500 }
    );
  }

  if (!updated) {
    return NextResponse.json(
      { error: "Order moved past received before we could cancel." },
      { status: 409 }
    );
  }

  await admin.from("print_order_events").insert({
    order_id: id,
    status: "cancelled",
    note: "Cancelled by customer.",
    actor_id: user.id,
  });

  return NextResponse.json({ ok: true, status: "cancelled" });
}
