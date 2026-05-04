import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { buildCoverPdf, buildInteriorPdf } from "@/lib/print-pdf";
import type { Pet, Story } from "@/lib/types";

// Admin-only on-demand PDF export. Streams a freshly-built interior or
// cover PDF directly to the browser so the admin can download the
// Lulu-spec print files without having to place an order first.
//
// The PDFs come from the same buildInteriorPdf / buildCoverPdf helpers
// the order pipeline uses, so anything that passes Lulu's preflight on
// a real order will pass here too. Only the upload-to-Storage step is
// skipped — we stream the bytes back instead of caching them.
//
// Non-admins get a 404, never 403, to avoid leaking the route's existence.

export const maxDuration = 60;

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, ctx: Ctx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id: storyId } = await ctx.params;
  const url = new URL(request.url);
  const type = url.searchParams.get("type") === "cover" ? "cover" : "interior";

  const admin = supabaseAdmin();
  const { data: story, error } = await admin
    .from("stories")
    .select("*")
    .eq("id", storyId)
    .single<Story & { pet_id?: string | null }>();
  if (error || !story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  // Memorial pets get dedication pages added to the interior PDF.
  let pet: Pet | null = null;
  if (story.pet_id) {
    const { data: petRow } = await admin
      .from("pets")
      .select("*")
      .eq("id", story.pet_id)
      .maybeSingle<Pet>();
    pet = petRow ?? null;
  }

  let bytes: Uint8Array;
  try {
    bytes =
      type === "cover"
        ? await buildCoverPdf(story)
        : await buildInteriorPdf(story, { pet });
  } catch (err) {
    console.error("[admin/export-pdf] build failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PDF build failed" },
      { status: 500 }
    );
  }

  const safeTitle =
    (story.title || "story")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "story";
  const filename = `${safeTitle}-${type}.pdf`;

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
