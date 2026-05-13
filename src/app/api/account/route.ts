import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/supabase-server";

export const maxDuration = 30;

// DELETE /api/account
//
// Permanently delete the signed-in user's account and their data.
// Required body: { confirm: "DELETE" } — a small typed-confirmation
// guard so a stray fetch in dev tools can't nuke the account.
//
// Order matters:
//   1. Anonymize shipped print_orders (tax + Stripe records must
//      survive the deletion under retention rules; we keep the row
//      but strip the personal data — shipping_address and user_id).
//   2. Delete the rest of the print_orders rows that are still
//      pre-fulfillment (no tax/legal retention need).
//   3. Delete stories and pets (their FK cascades take care of
//      jobs, custom_layouts, support_threads, etc., per schema.sql).
//   4. Delete the auth user — Supabase auth.admin.deleteUser will
//      cascade-trigger the remaining ON DELETE CASCADE rows on
//      auth.users.id.
//
// We don't refund or otherwise touch Stripe charges from here. If a
// user wants a refund they have to contact support — deletion is
// independent of refund.
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    confirm?: string;
  };
  if (body.confirm !== "DELETE") {
    return NextResponse.json(
      { error: "Confirmation token mismatch. Send { confirm: \"DELETE\" }." },
      { status: 400 }
    );
  }

  const admin = supabaseAdmin();

  // Shipped orders are anonymized rather than hard-deleted. We need to
  // retain a record of the transaction (tax reporting, Stripe dispute
  // history, year-end accounting) but the user has the right to have
  // their personal data scrubbed from it. Stripe still holds its own
  // record under the original Stripe session id.
  const { error: anonErr } = await admin
    .from("print_orders")
    .update({ shipping_address: null, user_id: null })
    .eq("user_id", user.id)
    .eq("status", "shipped");
  if (anonErr) {
    console.error("[account/delete] anonymize shipped orders failed:", anonErr);
    return NextResponse.json(
      { error: "Failed to anonymize shipped orders" },
      { status: 500 }
    );
  }

  // Hard-delete any remaining print_orders (queued, paid, building,
  // received, refunded, expired, disputed). These haven't crossed the
  // fulfillment line yet, so there's no retention obligation.
  const { error: poErr } = await admin
    .from("print_orders")
    .delete()
    .eq("user_id", user.id);
  if (poErr) {
    console.error("[account/delete] delete unshipped orders failed:", poErr);
    return NextResponse.json(
      { error: "Failed to delete pending orders" },
      { status: 500 }
    );
  }

  const { error: storiesErr } = await admin
    .from("stories")
    .delete()
    .eq("user_id", user.id);
  if (storiesErr) {
    console.error("[account/delete] delete stories failed:", storiesErr);
    return NextResponse.json(
      { error: "Failed to delete stories" },
      { status: 500 }
    );
  }

  const { error: petsErr } = await admin
    .from("pets")
    .delete()
    .eq("user_id", user.id);
  if (petsErr) {
    console.error("[account/delete] delete pets failed:", petsErr);
    return NextResponse.json(
      { error: "Failed to delete pets" },
      { status: 500 }
    );
  }

  // Finally remove the auth user. Any remaining rows in tables that
  // reference auth.users(id) ON DELETE CASCADE (jobs, custom_layouts,
  // support_threads, etc.) will drop automatically.
  const { error: authErr } = await admin.auth.admin.deleteUser(user.id);
  if (authErr) {
    console.error("[account/delete] auth.admin.deleteUser failed:", authErr);
    return NextResponse.json(
      { error: "Failed to delete auth user" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
