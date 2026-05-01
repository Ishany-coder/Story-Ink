import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { quotePrintAndShipping, LuluError, friendlyLuluMessage } from "@/lib/lulu";
import { assertOwnsStory, getCurrentUser } from "@/lib/supabase-server";
import type { Story, StoryPage } from "@/lib/types";

// Live quote from Lulu for the given address + story. The address is sent
// to Lulu to compute shipping but NOT persisted anywhere on our side — this
// route reads the body, forwards it, and returns the cost breakdown.

export const maxDuration = 20;

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

function isAddress(v: unknown): v is {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state_code: string;
  country_code: string;
  postcode: string;
  phone_number: string;
  email?: string;
} {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  const str = (k: string) => typeof a[k] === "string" && (a[k] as string).trim();
  return !!(
    str("name") &&
    str("street1") &&
    str("city") &&
    str("state_code") &&
    str("country_code") &&
    str("postcode") &&
    str("phone_number")
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Body;
  const storyId = typeof body.storyId === "string" ? body.storyId : "";
  if (!storyId) {
    return NextResponse.json({ error: "storyId is required" }, { status: 400 });
  }
  if (!isAddress(body.address)) {
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

  try {
    const quote = await quotePrintAndShipping({
      pageCount: (story.pages as StoryPage[]).length,
      quantity: parseQuantity(body.quantity),
      address: body.address,
    });
    return NextResponse.json(quote);
  } catch (err) {
    if (err instanceof LuluError) {
      console.error("[ship/quote] lulu error:", err);
      // 400 = bad customer input (bad address); anything else is upstream.
      const status = err.status === 400 ? 400 : 502;
      return NextResponse.json({ error: friendlyLuluMessage(err) }, { status });
    }
    console.error("[ship/quote] unexpected:", err);
    return NextResponse.json(
      { error: "Quote failed" },
      { status: 500 }
    );
  }
}
