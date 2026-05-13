import type { BlogPost } from "./index";

export const post: BlogPost = {
  slug: "behind-the-illustrations",
  title: "Behind the illustrations: how StoryInk uses your pet photos",
  excerpt:
    "Why the same dog appears on every page. What page 1 is actually doing. What the AI gets right, what it gets wrong, and how to fix it.",
  publishedAt: "2026-05-01",
  readMinutes: 7,
  author: "The StoryInk Team",
  body: [
    {
      type: "paragraph",
      content:
        "The most common question we get from new users is some version of: how is my dog actually showing up on the page? It looks like the same dog from front to back. Is the model just trained on my photos? The answer is more interesting than that, and it explains why the book takes the time it takes to generate.",
    },
    {
      type: "heading",
      content: "We do not train on your photos",
    },
    {
      type: "paragraph",
      content:
        "First, the boring but important part. We never train a model on your pet photos. The reference photos you upload are sent to Google Gemini as inputs at generation time, used to make the illustrations for this one book, and then they sit in your account in your private Supabase storage. They are not pooled into anyone else's book and they are not used to fine-tune any model we run.",
    },
    {
      type: "paragraph",
      content:
        "What we do is more like character consistency than character training. The references are sitting next to the prompt, every time we ask the AI to draw a page, so the AI keeps redrawing the same character.",
    },
    {
      type: "heading",
      content: "Page 1 is the canonical character sheet",
    },
    {
      type: "paragraph",
      content:
        "When you generate a book in quality mode (the default for pet stories), page 1 is special. It is generated first, on its own, before any of the other pages exist. The prompt for that page is heavier than the others — it tells the AI to establish the character in a clear, full-body, well-lit pose, treating page 1 as the canonical look of your pet.",
    },
    {
      type: "paragraph",
      content:
        "Then, for page 2, we send the AI three things: your reference photos, page 1 as an image, and the page-2 text. Page 3 sees: references, page 1, page 2, and the page-3 text. Page 4 sees: references, page 1, page 3, and the page-4 text. And so on. Page 1 is in every prompt. The immediately-previous page is in every prompt. That is the trick that keeps the dog from turning into a different dog by page four.",
    },
    {
      type: "paragraph",
      content:
        "This is also why quality mode is serial — page 3 cannot start until page 2 is done, because page 2 is part of page 3's prompt. It is slower than firing them off in parallel. It is also the difference between a real keepsake and a book where the spaniel becomes a different spaniel partway through.",
    },
    {
      type: "heading",
      content: "Fast mode and when to use it",
    },
    {
      type: "paragraph",
      content:
        "There is also a fast mode. It fans every page out in parallel using only the reference photos — no page 1 grounding, no previous-page grounding. It is much faster (a couple of minutes instead of more like ten) and the trade-off is real: character consistency drops. The fur color tends to drift. The breed shape varies. It looks like the same dog if you squint.",
    },
    {
      type: "paragraph",
      content:
        "We use fast mode for the generic, non-pet stories where consistency matters less, and we use it as the fallback when quality mode keeps timing out. For pet books in particular we default to quality.",
    },
    {
      type: "heading",
      content: "What the AI gets right",
    },
    {
      type: "paragraph",
      content:
        "Within a single book, when the references are good, the AI is genuinely good at: keeping fur color and pattern consistent, keeping body shape consistent, keeping breed silhouette readable, putting the pet into varied poses (sitting, running, sleeping, looking up at the sky), and matching the time of day and weather described in the text.",
    },
    {
      type: "paragraph",
      content:
        "It is also genuinely good at composition. Pages where the character is the subject get framed like an illustration would be framed — the pet near the rule-of-thirds intersection, not stuck in the middle of every page.",
    },
    {
      type: "heading",
      content: "What the AI gets wrong",
    },
    {
      type: "paragraph",
      content:
        "Honest list, because pretending otherwise wastes everyone's time:",
    },
    {
      type: "list",
      content: [
        "Eye color. The model is unreliable about heterochromia and unusual eye colors. If your dog has one blue eye and one brown, expect to use the AI Assistant on the pages where it matters.",
        "Markings. Specific patches — a heart-shaped white spot, an asymmetric face mark — drift. The model gets the general fur pattern but specific shapes are not stable.",
        "Subtle breed mixes. A clear single-breed dog reads correctly. A mix of three breeds tends to settle into whichever breed the model is most confident drawing.",
        "Hands. If you ask for a page where a person is holding the pet, the person's hands can come out wrong. We try to crop those tightly. Sometimes one slips.",
        "Counting. If you write a prompt with 'three puppies,' you may get two or four. Specific counts above two are unreliable.",
      ],
    },
    {
      type: "paragraph",
      content:
        "These are the failure modes the AI Assistant was built for. You do not have to live with them.",
    },
    {
      type: "heading",
      content: "Fixing pages with the AI Assistant",
    },
    {
      type: "paragraph",
      content:
        "Inside the Studio, every page has an AI Assistant box. You can tell it what to change in plain English. The system reads your request, decides whether you are asking to change the text, the illustration, or both, and dispatches only what is needed.",
    },
    {
      type: "paragraph",
      content:
        "Requests that work well are specific and small. 'Make her eyes blue.' 'Change this scene to morning.' 'Move the dog to the right side of the frame.' 'Rewrite this page in a warmer tone.' Requests that work less well are vague and large. 'Make this better.' 'Try again.' 'I do not like this.'",
    },
    {
      type: "paragraph",
      content:
        "When in doubt, ask for one specific thing at a time. The Assistant is a precise tool, not a do-over button.",
    },
    {
      type: "heading",
      content: "Why we tell you all this",
    },
    {
      type: "paragraph",
      content:
        "Because AI products that pretend they are magic age badly. The mechanics are not actually that mystical. We are sending Gemini your reference photos and a careful prompt, page after page, keeping the previous output in context so the character holds. We made the system as good as we know how to make it. It is still going to have a bad day on the occasional page. The Assistant exists for those pages.",
    },
    {
      type: "paragraph",
      content:
        "Understanding what is happening under the hood makes you a better collaborator with the system. You will write better prompts. You will pick better reference photos. You will spot the kinds of errors the model is prone to, and you will fix them quickly. The book you end up with will be better than the book you would have gotten by treating it as a black box.",
    },
  ],
};
