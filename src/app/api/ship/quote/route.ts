import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { assertOwnsStory, getCurrentUser } from "@/lib/supabase-server";
import { priceHardcoverUsd } from "@/lib/pricing";
import { isShippingAddress } from "@/lib/shipping";
import { enforceRateLimit, LIMITS, userKey } from "@/lib/rate-limit";
import type { Story, StoryPage } from "@/lib/types";

// Returns the customer-facing price for a hardcover of this story at
// the requested quantity. Static pricing — shipping is bundled into
// the list price and the admin fulfills the print order manually
// (Lulu auto-fulfillment has been removed). The address is still
// validated here so the client gets the same "this field is missing"
// errors before the user lands on Stripe Checkout.

export const maxDuration = 10;

interface Body {
  storyId?: unknown;
  address?: unknown;
  quantity?: unknown;
}

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 10;

function parseQuantity(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 1;
  const n = Math.trunc(raw);
  if (n < MIN_QUANTITY) return MIN_QUANTITY;
  if (n > MAX_QUANTITY) return MAX_QUANTITY;
  return n;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const limited = await enforceRateLimit({
    ...LIMITS.checkout,
    key: userKey("checkout", user.id),
  });
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as Body;
  const storyId = typeof body.storyId === "string" ? body.storyId : "";
  if (!storyId) {
    return NextResponse.json({ error: "storyId is required" }, { status: 400 });
  }
  if (!isShippingAddress(body.address)) {
    return NextResponse.json(
      { error: "Invalid shipping address" },
      { status: 400 }
    );
  }

  const denied = await assertOwnsStory(storyId, user.id);
  if (denied) return denied;

  const { data: story, error } = await supabaseAdmin()
    .from("stories")
    .select("id, pages")
    .eq("id", storyId)
    .single<Pick<Story, "id" | "pages">>();
  if (error || !story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  const pageCount = (story.pages as StoryPage[]).length;
  const quantity = parseQuantity(body.quantity);
  const unitUsd = priceHardcoverUsd(pageCount);
  const totalUsd = Math.round(unitUsd * quantity * 100) / 100;

  // Response shape matches what the legacy Lulu-quote route returned
  // (`printCostUsd` / `shippingCostUsd` / `taxUsd` / `totalUsd` /
  // `currency`) so existing ShipStoryPage consumers keep working
  // without a separate UI refactor. Shipping + tax are reported as 0
  // — they're bundled into the list price now.
  return NextResponse.json({
    pageCount,
    quantity,
    unitUsd,
    printCostUsd: totalUsd,
    shippingCostUsd: 0,
    taxUsd: 0,
    totalUsd,
    currency: "USD",
  });
}
