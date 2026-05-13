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
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const [petsRes, storiesRes, ordersRes] = await Promise.all([
    admin.from("pets").select("*").eq("user_id", user.id),
    admin.from("stories").select("*").eq("user_id", user.id),
    admin.from("print_orders").select("*").eq("user_id", user.id),
  ]);

  if (petsRes.error || storiesRes.error || ordersRes.error) {
    console.error("[account/export] query failed:", {
      pets: petsRes.error,
      stories: storiesRes.error,
      orders: ordersRes.error,
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
