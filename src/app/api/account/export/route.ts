import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/supabase-server";

export const maxDuration = 30;

// GDPR / CCPA self-serve data export. Returns the signed-in user's
// rows from every table they own as a single JSON file. Stripe
// payment-card data is never on our side so it can't appear here.
// Storage objects (uploaded photos, generated illustrations, print
// PDFs) are referenced by URL — the underlying objects in the
// `uploads` bucket aren't bundled into the JSON. If we need a full
// bundle later, fan out and presign each URL.
//
// Tables included (all user-owned, per supabase/schema.sql):
//   - pets, stories, print_orders            → keyed on user_id
//   - custom_layouts                         → keyed on user_id
//   - support_threads, support_messages      → thread keyed on
//                                              user_id; messages
//                                              joined via thread_id
//   - print_order_events                     → joined via order_id
//                                              from the user's print
//                                              orders
//
// Jobs table is excluded — it's a transient queue for our own
// processing, contains no personal data the user didn't already
// see surfaced in the resulting stories/orders, and is large.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const admin = supabaseAdmin();

  // Fan out the simple "WHERE user_id = ?" queries in parallel.
  const [
    petsRes,
    storiesRes,
    ordersRes,
    customLayoutsRes,
    supportThreadsRes,
  ] = await Promise.all([
    admin.from("pets").select("*").eq("user_id", user.id),
    admin.from("stories").select("*").eq("user_id", user.id),
    admin.from("print_orders").select("*").eq("user_id", user.id),
    admin.from("custom_layouts").select("*").eq("user_id", user.id),
    admin.from("support_threads").select("*").eq("user_id", user.id),
  ]);

  if (
    petsRes.error ||
    storiesRes.error ||
    ordersRes.error ||
    customLayoutsRes.error ||
    supportThreadsRes.error
  ) {
    console.error("[account/export] first-pass query failed:", {
      pets: petsRes.error,
      stories: storiesRes.error,
      orders: ordersRes.error,
      custom_layouts: customLayoutsRes.error,
      support_threads: supportThreadsRes.error,
    });
    return NextResponse.json(
      { error: "Failed to assemble export" },
      { status: 500 }
    );
  }

  // Second-pass joins — depend on ids from the first pass.
  const orderIds = (ordersRes.data ?? []).map((o: { id: string }) => o.id);
  const threadIds = (supportThreadsRes.data ?? []).map(
    (t: { id: string }) => t.id
  );

  const [eventsRes, messagesRes] = await Promise.all([
    orderIds.length > 0
      ? admin
          .from("print_order_events")
          .select("*")
          .in("order_id", orderIds)
      : Promise.resolve({ data: [], error: null as null | Error }),
    threadIds.length > 0
      ? admin.from("support_messages").select("*").in("thread_id", threadIds)
      : Promise.resolve({ data: [], error: null as null | Error }),
  ]);

  if (eventsRes.error || messagesRes.error) {
    console.error("[account/export] join query failed:", {
      print_order_events: eventsRes.error,
      support_messages: messagesRes.error,
    });
    return NextResponse.json(
      { error: "Failed to assemble export" },
      { status: 500 }
    );
  }

  const payload = {
    user: { id: user.id, email: user.email ?? null },
    pets: petsRes.data ?? [],
    stories: storiesRes.data ?? [],
    print_orders: ordersRes.data ?? [],
    print_order_events: eventsRes.data ?? [],
    custom_layouts: customLayoutsRes.data ?? [],
    support_threads: supportThreadsRes.data ?? [],
    support_messages: messagesRes.data ?? [],
    exported_at: new Date().toISOString(),
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="storyink-export-${date}.json"`,
    },
  });
}
