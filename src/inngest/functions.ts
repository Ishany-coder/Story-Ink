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
import { markDone, markFailed, markRunning } from "@/lib/jobs";
import {
  assistRegenerateImage,
  assistRegenerateText,
  classifyAssistIntent,
  generatePageImage,
  generateStoryText,
  GeminiRateLimitError,
  regeneratePageText,
  type AssistTarget,
} from "@/lib/gemini";
import {
  supabase,
  supabaseAdmin,
  updateStoryPageFields,
  uploadGeneratedImage,
} from "@/lib/supabase";
import { buildInitialOverlays, DEFAULT_LAYOUT_ID } from "@/lib/layouts";
import type { Layer, Story, StoryPage } from "@/lib/types";

const TEXT_RETRIES = 2;
const IMAGE_RETRIES = 3;

// onFailure handlers receive a wrapped event whose `data.event.data` is the
// original event. We narrow just enough to pull the jobId out.
type WrappedFailureEvent = { data?: { event?: { data?: { jobId?: string } } } };
function extractJobId(wrappedEvent: unknown): string | undefined {
  return (wrappedEvent as WrappedFailureEvent)?.data?.event?.data?.jobId;
}

async function onInngestFailure(
  wrappedEvent: unknown,
  error: unknown
): Promise<void> {
  const jobId = extractJobId(wrappedEvent);
  if (jobId) await markFailed(jobId, error);
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

async function fetchStoryAndPage(storyId: string, pageNumber: number) {
  const { data, error } = await supabase
    .from("stories")
    .select("id, title, prompt, pages, ai_system_prompt")
    .eq("id", storyId)
    .single<
      Pick<Story, "id" | "title" | "prompt" | "pages" | "ai_system_prompt">
    >();
  if (error || !data) throw new Error("Story not found");
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
    const { jobId, prompt, pageCount } = event.data as {
      jobId: string;
      prompt: string;
      pageCount: number;
    };
    await step.run("mark-running", () => markRunning(jobId));

    const scriptData = await step.run("plan-story", async () => {
      const storyText = await generateStoryText(prompt, pageCount);
      return {
        title: storyText.title,
        pages: storyText.pages.map((p) => ({
          pageNumber: p.pageNumber,
          text: p.text,
        })),
      };
    });

    // Per-page image steps. Splitting one step per page gives us two
    // properties the old bundled version lacked:
    //   1. Resumability. Inngest memoizes step results — if page 7 fails
    //      after pages 1–6 succeeded, a retry re-runs only page 7 and
    //      the final save step, not all generations from scratch.
    //   2. Independent failure handling. Promise.allSettled means one
    //      page that exhausts its retries becomes an empty-string image
    //      (the downstream save-story step already tolerates that) and
    //      the rest of the book still ships.
    //
    // The calls fan out via Promise.all so images still run in parallel
    // end-to-end wall-clock-wise. Each step.run is its own retry scope.
    const imageUrls: string[] = await Promise.all(
      scriptData.pages.map((p) =>
        step
          .run(`generate-page-image-${p.pageNumber}`, async () => {
            const dataUri = await generatePageImage(p.text, scriptData.title);
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
            // After Inngest's retry budget for this step is exhausted,
            // record the failure and move on with an empty image URL so
            // the story still gets saved for the user to fix in Studio.
            console.error(
              `[inngest.generate] page ${p.pageNumber} gave up after retries:`,
              err
            );
            return "";
          })
      )
    );

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
    const { jobId, storyId, pageNumber } = event.data as {
      jobId: string;
      storyId: string;
      pageNumber: number;
    };
    await step.run("mark-running", () => markRunning(jobId));

    const { story } = await step.run("fetch", () =>
      fetchStoryAndPage(storyId, pageNumber)
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
    const { jobId, storyId, pageNumber, prompt, globalSystemPrompt } =
      event.data as {
        jobId: string;
        storyId: string;
        pageNumber: number;
        prompt: string;
        globalSystemPrompt?: string | null;
      };
    await step.run("mark-running", () => markRunning(jobId));

    const { story, page } = await step.run("fetch", () =>
      fetchStoryAndPage(storyId, pageNumber)
    );

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
      markDone(jobId, { targets: ["text"], text, imageUrl: null })
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
    const { jobId, storyId, pageNumber, prompt, globalSystemPrompt } =
      event.data as {
        jobId: string;
        storyId: string;
        pageNumber: number;
        prompt: string;
        globalSystemPrompt?: string | null;
      };
    await step.run("mark-running", () => markRunning(jobId));

    const { story, page } = await step.run("fetch", () =>
      fetchStoryAndPage(storyId, pageNumber)
    );

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
      });
      return uploadGeneratedImage(dataUri);
    });

    await step.run("mark-done", () =>
      markDone(jobId, { targets: ["image"], text: null, imageUrl })
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
      storyId,
      pageNumber,
      prompt,
      globalSystemPrompt,
      targets: overrideTargets,
    } = event.data as {
      jobId: string;
      storyId: string;
      pageNumber: number;
      prompt: string;
      globalSystemPrompt?: string | null;
      targets?: AssistTarget[];
    };
    await step.run("mark-running", () => markRunning(jobId));

    const { story, page } = await step.run("fetch", () =>
      fetchStoryAndPage(storyId, pageNumber)
    );
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
              });
              return uploadGeneratedImage(dataUri);
            })
            .catch((err: unknown) => {
              console.error("[inngest.infer] image failed:", err);
              return null;
            })
        : Promise.resolve(null),
    ]);

    await step.run("mark-done", () =>
      markDone(jobId, { targets, text, imageUrl })
    );
    return { targets, text, imageUrl };
  }
);

export const allFunctions = [
  generateStoryFn,
  regenTextFn,
  assistTextFn,
  assistImageFn,
  assistInferFn,
];
