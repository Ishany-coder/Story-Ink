// Durable wrappers around the Gemini pipeline. Each function:
//  - receives an event whose `data.jobId` ties it back to a jobs row,
//  - uses `step.run()` so each substantive unit of work retries
//    independently (Gemini 429s, Supabase hiccups, etc.),
//  - marks the job `done` with a result on success, or `failed` with an
//    error message on failure (including when Inngest's retry budget is
//    fully exhausted — see `onFailure`).
//
// The HTTP routes in /api/... create the job row and emit the event; the
// client polls /api/jobs/[id] for progress.

import { inngest, EVENTS } from "./client";
import { markDone, markFailed, markProgress, markRunning } from "@/lib/jobs";
import { reportError } from "@/lib/sentry";
import {
  assistRegenerateImage,
  assistRegenerateText,
  classifyAssistIntent,
  generatePageImage,
  generateStoryText,
  GeminiRateLimitError,
  GeminiSafetyBlockedError,
  regeneratePageText,
  type AssistTarget,
} from "@/lib/gemini";
import {
  supabaseAdmin,
  updateStoryPageFields,
  uploadGeneratedImage,
} from "@/lib/supabase";
import { buildInitialOverlays, DEFAULT_LAYOUT_ID } from "@/lib/layouts";
import {
  buildPetDescription,
  composePetStoryPrompt,
} from "@/lib/pet-prompt";
import type { Layer, Pet, Story, StoryPage } from "@/lib/types";

const TEXT_RETRIES = 2;
const IMAGE_RETRIES = 3;

// onFailure handlers receive a wrapped event whose `data.event.data` is the
// original event. We narrow just enough to pull the jobId out.
type WrappedFailureEvent = { data?: { event?: { data?: { jobId?: string } } } };
function extractJobId(wrappedEvent: unknown): string | undefined {
  return (wrappedEvent as WrappedFailureEvent)?.data?.event?.data?.jobId;
}

// Inngest wraps thrown errors so by the time we get to onFailure the
// original class identity is sometimes lost — we recognize a safety
// block by name + message instead. The error.name survives the wrap
// in current Inngest versions; the message check is a backstop for
// anything that re-serializes through JSON.
function isSafetyBlockError(err: unknown): boolean {
  if (err instanceof GeminiSafetyBlockedError) return true;
  if (err && typeof err === "object") {
    const e = err as { name?: unknown; message?: unknown };
    if (e.name === "GeminiSafetyBlockedError") return true;
    if (
      typeof e.message === "string" &&
      e.message.includes("safety filter")
    ) {
      return true;
    }
  }
  return false;
}

// User-facing copy for a safety block. Single source of truth so we
// don't drift between the thrown error and what the polling client
// reads from jobs.error. Echoes GeminiSafetyBlockedError's default
// message verbatim.
const SAFETY_BLOCK_USER_MESSAGE =
  "Your prompt was blocked by the safety filter. Please try a gentler wording — for example, avoid graphic injuries or distressing content.";

async function onInngestFailure(
  wrappedEvent: unknown,
  error: unknown
): Promise<void> {
  const jobId = extractJobId(wrappedEvent);
  // Inngest exhausted retries. Report to Sentry so we see it even
  // though the user-facing surface is the jobs row.
  reportError(error, "inngest.onFailure");
  if (!jobId) return;
  // Rewrite a safety-block error into the canonical user-facing
  // string before persisting to the jobs row. Without this, an
  // Inngest-wrapped error message ("Function exhausted retries: ...")
  // would leak into the UI.
  if (isSafetyBlockError(error)) {
    await markFailed(jobId, new Error(SAFETY_BLOCK_USER_MESSAGE));
    return;
  }
  await markFailed(jobId, error);
}

function composeSystemPrompt(
  global: string | null | undefined,
  perStory: string | null | undefined
): string | null {
  const g = global?.trim();
  const s = perStory?.trim();
  if (g && s) return `${g}\n\n${s}`;
  return g || s || null;
}

async function fetchStoryAndPage(
  storyId: string,
  pageNumber: number,
  expectedUserId: string | null
) {
  // Inngest workers run with no auth session, so the anon client
  // can't see private stories under the new RLS policies. Use the
  // service-role admin client — RLS bypassed, but we re-verify
  // ownership here defensively. The route handler already called
  // assertOwnsStory before firing the event, but the Inngest event
  // bus is its own trust boundary: anyone with INNGEST_EVENT_KEY can
  // fire arbitrary payloads, so we don't take the route's word for it.
  const { data, error } = await supabaseAdmin()
    .from("stories")
    .select(
      "id, title, prompt, pages, ai_system_prompt, image_style, user_id"
    )
    .eq("id", storyId)
    .single<
      Pick<
        Story,
        | "id"
        | "title"
        | "prompt"
        | "pages"
        | "ai_system_prompt"
        | "image_style"
      > & { user_id: string | null }
    >();
  if (error || !data) throw new Error("Story not found");
  if (
    expectedUserId &&
    data.user_id &&
    data.user_id !== expectedUserId
  ) {
    throw new Error("Story ownership mismatch");
  }
  const page = data.pages.find((p) => p.pageNumber === pageNumber);
  if (!page) throw new Error("Page not found");
  return { story: data, page };
}

// --------------------------------------------------------------------------
// story/generate.requested — full "make me a story" pipeline.
// --------------------------------------------------------------------------

export const generateStoryFn = inngest.createFunction(
  {
    id: "generate-story",
    retries: IMAGE_RETRIES,
    triggers: [{ event: EVENTS.generateStory }],
    onFailure: async ({ event, error }) => onInngestFailure(event, error),
  },
  async ({ event, step }) => {
    const {
      jobId,
      userId,
      prompt,
      pageCount,
      kind = "generic",
      petId = null,
      imageMode = "quality",
      isPublic = false,
      imageStyle = "watercolor",
    } = event.data as {
      jobId: string;
      userId: string;
      prompt: string;
      pageCount: number;
      kind?: "pet" | "generic";
      petId?: string | null;
      imageMode?: "fast" | "quality";
      isPublic?: boolean;
      imageStyle?: string;
    };
    await step.run("mark-running", () => markRunning(jobId));

    // Pet stories pull the full pet row up front so subsequent steps
    // can reference its photos + personality without an extra fetch.
    const pet = await step.run("fetch-pet", async (): Promise<Pet | null> => {
      if (kind !== "pet" || !petId) return null;
      const { data, error } = await supabaseAdmin()
        .from("pets")
        .select("*")
        .eq("id", petId)
        .eq("user_id", userId)
        .maybeSingle<Pet>();
      if (error) {
        console.error("[inngest.generate] pet fetch failed:", error);
        return null;
      }
      return data ?? null;
    });

    // For pet stories, prepend the pet's profile to the user prompt so
    // the AI plans the story around the actual character. Generic
    // stories pass the prompt through unchanged.
    const composedPrompt = pet
      ? composePetStoryPrompt(prompt, pet)
      : prompt;
    const petDescription = pet ? buildPetDescription(pet) : null;
    const memorial = pet?.mode === "memorial";

    const scriptData = await step.run("plan-story", async () => {
      const storyText = await generateStoryText(composedPrompt, pageCount);
      return {
        title: storyText.title,
        pages: storyText.pages.map((p) => ({
          pageNumber: p.pageNumber,
          text: p.text,
        })),
      };
    });

    // Image generation strategy. For a pet story in Quality mode we
    // serialize pages so each one can pass the previous page's image
    // AND the first page's image back to Gemini — that's how we lock
    // the character's look across the whole book instead of letting it
    // drift page-to-page. Fast mode (and all generic stories) fan out
    // in parallel and only use reference photos.
    const imageContextBase = {
      referencePhotos: pet?.photos ?? [],
      petDescription,
      memorial,
      styleId: imageStyle,
    };

    let imageUrls: string[];
    if (kind === "pet" && imageMode === "quality") {
      // Quality mode: page 1 establishes the canonical character sheet
      // and MUST finish before anything else. Page 2 then anchors
      // continuation tone with page 1 as its reference and MUST finish
      // before pages 3+. From page 3 onward we fan out in parallel
      // batches; every page 3..N anchors on page 1 (identity) AND
      // page 2 (style continuity) instead of its immediate
      // predecessor. The audit's tradeoff: a small drift cost vs. an
      // ~N/batch speedup on wall-clock time for a 20+ page book.
      //
      // The batch size is tunable via GEMINI_PARALLEL_BATCH; default
      // 4 keeps us well under Gemini's per-minute image quota for
      // tier-1 keys but still cuts a 24-page generate from ~8min to
      // ~2-3min.
      const parsedBatch = Number.parseInt(
        process.env.GEMINI_PARALLEL_BATCH ?? "",
        10
      );
      const PARALLEL_BATCH =
        Number.isFinite(parsedBatch) && parsedBatch > 0 ? parsedBatch : 4;

      const pages = scriptData.pages;
      imageUrls = new Array<string>(pages.length).fill("");

      // Helper that does the per-page generate+upload inside its own
      // step.run so Inngest retries each page independently — a single
      // failed page can't kill the batch.
      async function generateOne(
        pageNumber: number,
        text: string,
        firstPageUrl: string | null,
        previousPageUrl: string | null
      ): Promise<string> {
        return step
          .run(`generate-page-image-${pageNumber}`, async () => {
            const dataUri = await generatePageImage(text, scriptData.title, {
              ...imageContextBase,
              firstPageUrl,
              previousPageUrl,
            });
            if (!dataUri) return "";
            try {
              return await uploadGeneratedImage(dataUri);
            } catch (err) {
              console.error(
                `[inngest.generate] page ${pageNumber} upload failed:`,
                err
              );
              return "";
            }
          })
          .catch((err: unknown) => {
            console.error(
              `[inngest.generate] page ${pageNumber} gave up after retries:`,
              err
            );
            return "";
          });
      }

      // Page 1 (canonical character sheet). No anchors — the
      // reference photos do the grounding.
      await step.run("progress-1", () =>
        markProgress(jobId, {
          current: 1,
          total: pages.length,
          phase: "image",
        })
      );
      const page1 = pages[0];
      const page1Url = page1
        ? await generateOne(page1.pageNumber, page1.text, null, null)
        : "";
      if (page1) imageUrls[0] = page1Url;

      // Page 2 (continuation anchor). References page 1 as both the
      // canonical character and the immediate predecessor.
      if (pages.length > 1) {
        await step.run("progress-2", () =>
          markProgress(jobId, {
            current: 2,
            total: pages.length,
            phase: "image",
          })
        );
        const page2 = pages[1];
        const page2Url = await generateOne(
          page2.pageNumber,
          page2.text,
          page1Url || null,
          page1Url || null
        );
        imageUrls[1] = page2Url;
      }

      const page2Url = imageUrls[1] || null;

      // Pages 3..N in parallel batches. Each page anchors on page 1
      // (identity) and page 2 (style/tone continuation) instead of its
      // immediate predecessor — a coherent identity signal that lets
      // batches run concurrently.
      for (let i = 2; i < pages.length; i += PARALLEL_BATCH) {
        const batch = pages.slice(i, i + PARALLEL_BATCH);
        await step.run(`progress-${i + 1}`, () =>
          markProgress(jobId, {
            current: i + 1,
            total: pages.length,
            phase: "image",
          })
        );
        const results = await Promise.all(
          batch.map((p) =>
            generateOne(
              p.pageNumber,
              p.text,
              page1Url || null,
              page2Url
            )
          )
        );
        for (let j = 0; j < results.length; j++) {
          imageUrls[i + j] = results[j];
        }
      }
    } else {
      imageUrls = await Promise.all(
        scriptData.pages.map((p) =>
          step
            .run(`generate-page-image-${p.pageNumber}`, async () => {
              const dataUri = await generatePageImage(
                p.text,
                scriptData.title,
                imageContextBase
              );
              if (!dataUri) return "";
              try {
                return await uploadGeneratedImage(dataUri);
              } catch (err) {
                console.error(
                  `[inngest.generate] page ${p.pageNumber} upload failed:`,
                  err
                );
                return "";
              }
            })
            .catch((err: unknown) => {
              console.error(
                `[inngest.generate] page ${p.pageNumber} gave up after retries:`,
                err
              );
              return "";
            })
        )
      );
    }

    const storyRow = await step.run("save-story", async () => {
      const pages: StoryPage[] = scriptData.pages.map((page, i) => {
        const imageUrl = imageUrls[i];
        return {
          pageNumber: page.pageNumber,
          text: page.text,
          imageUrl,
          layoutId: DEFAULT_LAYOUT_ID,
          overlays: buildInitialOverlays(imageUrl, page.text),
        };
      });
      const { data, error } = await supabaseAdmin()
        .from("stories")
        .insert({
          title: scriptData.title,
          prompt,
          page_count: pageCount,
          pages,
          cover_image: pages[0]?.imageUrl || null,
          user_id: userId,
          is_public: isPublic,
          kind,
          pet_id: petId,
          image_style: imageStyle,
        })
        .select("id")
        .single();
      if (error || !data) {
        throw new Error(`Supabase insert failed: ${error?.message}`);
      }
      return { storyId: data.id as string };
    });

    await step.run("mark-done", () =>
      markDone(jobId, { storyId: storyRow.storyId })
    );
    return storyRow;
  }
);

// --------------------------------------------------------------------------
// story/regen-text.requested — rewrite a single page's narration.
// --------------------------------------------------------------------------

export const regenTextFn = inngest.createFunction(
  {
    id: "regen-page-text",
    retries: TEXT_RETRIES,
    triggers: [{ event: EVENTS.regenText }],
    onFailure: async ({ event, error }) => onInngestFailure(event, error),
  },
  async ({ event, step }) => {
    const { jobId, userId, storyId, pageNumber } = event.data as {
      jobId: string;
      userId?: string;
      storyId: string;
      pageNumber: number;
    };
    await step.run("mark-running", () => markRunning(jobId));

    const { story } = await step.run("fetch", () =>
      fetchStoryAndPage(storyId, pageNumber, userId ?? null)
    );

    const text = await step.run("regenerate", () =>
      regeneratePageText(
        story.title,
        story.pages.map((p) => ({
          pageNumber: p.pageNumber,
          text: p.text,
        })),
        pageNumber
      )
    );

    await step.run("persist", async () => {
      // Atomic per-page update — only touches this page's slot in the
      // pages JSONB array so a concurrent overlays save on another page
      // can't be clobbered. We still need the overlays for THIS page to
      // mirror the new narration into any layout-source text layer, so
      // we work off the page we fetched above.
      const page = story.pages.find((p) => p.pageNumber === pageNumber);
      const overlays: Layer[] | undefined = page?.overlays?.map((l): Layer =>
        l.source === "layout" && l.type === "text" ? { ...l, text } : l
      );
      await updateStoryPageFields(storyId, pageNumber, {
        text,
        ...(overlays ? { overlays } : {}),
      });
    });

    await step.run("mark-done", () => markDone(jobId, { text }));
    return { text };
  }
);

// --------------------------------------------------------------------------
// assist/text.requested — forced text-only AI edit.
// --------------------------------------------------------------------------

export const assistTextFn = inngest.createFunction(
  {
    id: "assist-text",
    retries: TEXT_RETRIES,
    triggers: [{ event: EVENTS.assistText }],
    onFailure: async ({ event, error }) => onInngestFailure(event, error),
  },
  async ({ event, step }) => {
    const {
      jobId,
      userId,
      storyId,
      pageNumber,
      prompt,
      globalSystemPrompt,
      pageTextSnapshot,
    } = event.data as {
      jobId: string;
      userId?: string;
      storyId: string;
      pageNumber: number;
      prompt: string;
      globalSystemPrompt?: string | null;
      // Snapshot of page.text the client read at submit. We compare
      // against the DB value at handler pickup so the result payload
      // can carry a `stale` flag for the UI.
      pageTextSnapshot?: string | null;
    };
    await step.run("mark-running", () => markRunning(jobId));

    const { story, page } = await step.run("fetch", () =>
      fetchStoryAndPage(storyId, pageNumber, userId ?? null)
    );

    // Stale-edit detection. If the user supplied a snapshot AND the
    // DB's current page text differs from it, a manual edit landed
    // between submit and pickup — flag the result so the Studio can
    // warn before clobbering it on Apply.
    const stale =
      typeof pageTextSnapshot === "string" &&
      pageTextSnapshot !== page.text;

    const text = await step.run("generate", () =>
      assistRegenerateText({
        systemPrompt: composeSystemPrompt(
          globalSystemPrompt,
          story.ai_system_prompt
        ),
        storyTitle: story.title,
        storyPrompt: story.prompt,
        allPages: story.pages.map((p) => ({
          pageNumber: p.pageNumber,
          text: p.text,
        })),
        targetPageNumber: pageNumber,
        userPrompt: prompt,
        currentImageUrl: page.imageUrl,
      })
    );

    await step.run("mark-done", () =>
      markDone(jobId, {
        targets: ["text"],
        text,
        imageUrl: null,
        stale,
        currentText: stale ? page.text : null,
        snapshotText: stale ? pageTextSnapshot ?? null : null,
      })
    );
    return { text };
  }
);

// --------------------------------------------------------------------------
// assist/image.requested — forced image-only AI edit.
// --------------------------------------------------------------------------

export const assistImageFn = inngest.createFunction(
  {
    id: "assist-image",
    retries: IMAGE_RETRIES,
    triggers: [{ event: EVENTS.assistImage }],
    onFailure: async ({ event, error }) => onInngestFailure(event, error),
  },
  async ({ event, step }) => {
    const {
      jobId,
      userId,
      storyId,
      pageNumber,
      prompt,
      globalSystemPrompt,
      pageImageSnapshot,
    } = event.data as {
      jobId: string;
      userId?: string;
      storyId: string;
      pageNumber: number;
      prompt: string;
      globalSystemPrompt?: string | null;
      pageImageSnapshot?: string | null;
    };
    await step.run("mark-running", () => markRunning(jobId));

    const { story, page } = await step.run("fetch", () =>
      fetchStoryAndPage(storyId, pageNumber, userId ?? null)
    );

    // Stale-edit detection for image. If the user manually swapped a
    // page's image after submitting the regen, the DB's imageUrl no
    // longer matches the snapshot — flag stale so the Studio can warn
    // before overwriting on Apply.
    const stale =
      typeof pageImageSnapshot === "string" &&
      pageImageSnapshot !== (page.imageUrl ?? "");

    const imageUrl = await step.run("generate-and-upload", async () => {
      const dataUri = await assistRegenerateImage({
        systemPrompt: composeSystemPrompt(
          globalSystemPrompt,
          story.ai_system_prompt
        ),
        storyTitle: story.title,
        storyPrompt: story.prompt,
        pageText: page.text,
        userPrompt: prompt,
        currentImageUrl: page.imageUrl,
        styleId: story.image_style ?? null,
      });
      return uploadGeneratedImage(dataUri);
    });

    await step.run("mark-done", () =>
      markDone(jobId, {
        targets: ["image"],
        text: null,
        imageUrl,
        stale,
        currentImageUrl: stale ? page.imageUrl ?? null : null,
        snapshotImageUrl: stale ? pageImageSnapshot ?? null : null,
      })
    );
    return { imageUrl };
  }
);

// --------------------------------------------------------------------------
// assist/infer.requested — classifier + parallel text & image.
// --------------------------------------------------------------------------

export const assistInferFn = inngest.createFunction(
  {
    id: "assist-infer",
    retries: IMAGE_RETRIES,
    triggers: [{ event: EVENTS.assistInfer }],
    onFailure: async ({ event, error }) => onInngestFailure(event, error),
  },
  async ({ event, step }) => {
    const {
      jobId,
      userId,
      storyId,
      pageNumber,
      prompt,
      globalSystemPrompt,
      targets: overrideTargets,
      pageTextSnapshot,
      pageImageSnapshot,
    } = event.data as {
      jobId: string;
      userId?: string;
      storyId: string;
      pageNumber: number;
      prompt: string;
      globalSystemPrompt?: string | null;
      targets?: AssistTarget[];
      pageTextSnapshot?: string | null;
      pageImageSnapshot?: string | null;
    };
    await step.run("mark-running", () => markRunning(jobId));

    const { story, page } = await step.run("fetch", () =>
      fetchStoryAndPage(storyId, pageNumber, userId ?? null)
    );

    // Stale-edit detection. The submit-time snapshots (text/image) are
    // compared against the DB's current page values. Either side may
    // diverge independently — a manual text edit or a manual image
    // swap during the regen — so we track them as separate flags and
    // surface them on the result. The handler continues regardless;
    // the client decides what to do at Apply time.
    const textStale =
      typeof pageTextSnapshot === "string" &&
      pageTextSnapshot !== page.text;
    const imageStale =
      typeof pageImageSnapshot === "string" &&
      pageImageSnapshot !== (page.imageUrl ?? "");
    const systemPrompt = composeSystemPrompt(
      globalSystemPrompt,
      story.ai_system_prompt
    );

    let targets: AssistTarget[];
    if (overrideTargets && overrideTargets.length > 0) {
      targets = overrideTargets;
    } else {
      targets = await step.run("classify", async () => {
        try {
          return await classifyAssistIntent({
            systemPrompt,
            storyPrompt: story.prompt,
            allPagesText: story.pages
              .map((p) => `Page ${p.pageNumber}: ${p.text}`)
              .join("\n"),
            pageText: page.text,
            userPrompt: prompt,
            currentImageUrl: page.imageUrl,
          });
        } catch (err) {
          if (err instanceof GeminiRateLimitError) {
            return ["text", "image"] as AssistTarget[];
          }
          throw err;
        }
      });
    }

    const [text, imageUrl] = await Promise.all([
      targets.includes("text")
        ? step
            .run("text", () =>
              assistRegenerateText({
                systemPrompt,
                storyTitle: story.title,
                storyPrompt: story.prompt,
                allPages: story.pages.map((p) => ({
                  pageNumber: p.pageNumber,
                  text: p.text,
                })),
                targetPageNumber: pageNumber,
                userPrompt: prompt,
                currentImageUrl: page.imageUrl,
              })
            )
            .catch((err: unknown) => {
              console.error("[inngest.infer] text failed:", err);
              return null;
            })
        : Promise.resolve(null),
      targets.includes("image")
        ? step
            .run("image", async () => {
              const dataUri = await assistRegenerateImage({
                systemPrompt,
                storyTitle: story.title,
                storyPrompt: story.prompt,
                pageText: page.text,
                userPrompt: prompt,
                currentImageUrl: page.imageUrl,
                styleId: story.image_style ?? null,
              });
              return uploadGeneratedImage(dataUri);
            })
            .catch((err: unknown) => {
              console.error("[inngest.infer] image failed:", err);
              return null;
            })
        : Promise.resolve(null),
    ]);

    // Only surface staleness for sides we actually regenerated — a
    // text-only run shouldn't warn about an image swap the user made,
    // and vice versa.
    const reportTextStale = textStale && targets.includes("text");
    const reportImageStale = imageStale && targets.includes("image");
    const stale = reportTextStale || reportImageStale;

    await step.run("mark-done", () =>
      markDone(jobId, {
        targets,
        text,
        imageUrl,
        stale,
        currentText: reportTextStale ? page.text : null,
        snapshotText: reportTextStale ? pageTextSnapshot ?? null : null,
        currentImageUrl: reportImageStale ? page.imageUrl ?? null : null,
        snapshotImageUrl: reportImageStale ? pageImageSnapshot ?? null : null,
      })
    );
    return { targets, text, imageUrl };
  }
);

// --------------------------------------------------------------------------
// nightly-cleanup — daily housekeeping cron.
//
// Runs at 04:00 UTC every day. Three independent step.run blocks so
// each piece of work retries on its own and a transient failure in
// one doesn't block the others.
//
// Tasks:
//   1. Delete done / failed `jobs` rows older than 30 days. The jobs
//      table is essentially a transient queue; old rows just bloat
//      the table and slow down /api/jobs/[id] lookups.
//   2. Mark `print_orders` rows stuck in 'paid' or 'pending' for
//      more than 48h *with no stripe_session_id* as 'expired'. These
//      are orders the user abandoned or where Stripe didn't fire the
//      webhook in time — the admin needs to see them, so we never
//      delete, just status-transition.
//   3. (TODO) Storage orphan sweep — walk `uploads` bucket and delete
//      blobs that no story / pet row references. Skipped for now: no
//      cheap way to enumerate referenced URLs (they're embedded in
//      stories.pages JSONB + cover_image + pets.photos JSONB), and
//      a naive sweep risks deleting in-flight uploads. Revisit when
//      we have a content-addressed naming scheme.
// --------------------------------------------------------------------------

interface DeletedJobsRow {
  id: string;
}
interface ExpiredOrderRow {
  id: string;
}

export const nightlyCleanupFn = inngest.createFunction(
  {
    id: "nightly-cleanup",
    name: "Nightly cleanup",
    triggers: [{ cron: "0 4 * * *" }],
  },
  async ({ step }) => {
    // 1. Old terminal jobs.
    const jobsDeleted = await step.run("delete-old-jobs", async () => {
      const cutoff = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ).toISOString();
      const { data, error } = await supabaseAdmin()
        .from("jobs")
        .delete()
        .in("status", ["done", "failed"])
        .lt("updated_at", cutoff)
        .select("id")
        .returns<DeletedJobsRow[]>();
      if (error) {
        console.error("[nightly-cleanup] delete-old-jobs failed:", error);
        return 0;
      }
      return data?.length ?? 0;
    });

    // 2. Stuck pre-fulfillment print_orders. We only touch rows that
    // never got a stripe_session_id assigned — anything with a
    // session id has gone through (or is going through) the Stripe
    // webhook pipeline, and we don't want to second-guess that.
    const ordersExpired = await step.run(
      "expire-stuck-print-orders",
      async () => {
        const cutoff = new Date(
          Date.now() - 48 * 60 * 60 * 1000
        ).toISOString();
        const { data, error } = await supabaseAdmin()
          .from("print_orders")
          .update({ status: "expired" })
          .in("status", ["paid", "pending"])
          .is("stripe_session_id", null)
          .lt("created_at", cutoff)
          .select("id")
          .returns<ExpiredOrderRow[]>();
        if (error) {
          console.error(
            "[nightly-cleanup] expire-stuck-print-orders failed:",
            error
          );
          return 0;
        }
        const n = data?.length ?? 0;
        if (n > 0) {
          // Audit log so the admin queue surfaces the transition.
          await supabaseAdmin()
            .from("print_order_events")
            .insert(
              (data ?? []).map((r) => ({
                order_id: r.id,
                status: "expired",
                note: "Auto-expired by nightly cleanup (>48h with no Stripe session).",
              }))
            );
        }
        return n;
      }
    );

    // 3. Storage orphan sweep — TODO (see header comment).

    return { jobsDeleted, ordersExpired };
  }
);

export const allFunctions = [
  generateStoryFn,
  regenTextFn,
  assistTextFn,
  assistImageFn,
  assistInferFn,
  nightlyCleanupFn,
];
