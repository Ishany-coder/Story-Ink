import type { BlogPost } from "./index";

export const post: BlogPost = {
  slug: "living-vs-memorial-mode",
  title: "Living vs. Memorial pet book: choosing the right tone for your story",
  excerpt:
    "Living mode makes an adventure book starring your pet. Memorial mode makes a gentle Rainbow Bridge or recollection book. Here's how to choose.",
  metaDescription:
    "Living mode makes an adventure book starring your pet. Memorial mode makes a gentle Rainbow Bridge or recollection book. How to pick the right tone.",
  keywords: [
    "pet memorial book",
    "personalized pet adventure book",
    "Rainbow Bridge book",
    "Living vs Memorial mode",
    "pet storybook tone",
  ],
  publishedAt: "2026-05-08",
  readMinutes: 6,
  author: "The StoryInk Team",
  body: [
    {
      type: "paragraph",
      content:
        "Every StoryInk book starts the same way: you tell us about a pet, you write a one-line idea, and you pick a mode. There are exactly two — Living and Memorial — and the choice is not cosmetic. It changes the prompt the AI receives, the narrative paths it is allowed to take, the dedication pages we add to the print interior, and the emotional weight we ask the writer to carry on every page.",
    },
    {
      type: "paragraph",
      content:
        "We want to be transparent about what that choice does so you can pick on purpose.",
    },
    {
      type: "heading",
      content: "What a ‘pet memorial book’ actually is",
    },
    {
      type: "paragraph",
      content:
        "A pet memorial book is a short printed keepsake about an animal who is no longer with you. It is not a biography. It is six to eight pages — one feeling, written gently — that gives a family something to hold and re-read. The two narrative shapes we use, recollection and Rainbow Bridge, are described in detail below.",
    },
    {
      type: "heading",
      content: "Living mode: a personalized pet adventure book",
    },
    {
      type: "paragraph",
      content:
        "Living mode treats your pet as the protagonist of an ordinary, lovely day. The AI is told to lean into the small adventures that real pets actually have — a walk somewhere new, a stolen sock, a thunderstorm, a nap in a sunbeam. Stakes stay low. Nothing genuinely scary happens. Your dog does not run away forever. Your cat does not get hurt. Page seven is always a happy ending.",
    },
    {
      type: "paragraph",
      content:
        "This is the right mode for a gift, a birthday book, a kid who wants to read about their own dog, or a holiday keepsake. It is also the right mode if you are not sure which one you want — Living is the default tone for a reason.",
    },
    {
      type: "heading",
      content: "Memorial mode: a gentle pet memorial book, never blended",
    },
    {
      type: "paragraph",
      content:
        "Memorial mode is for pets who are no longer with you. The AI is given a different set of instructions. There is no peril. There are no surprises that hurt. Instead the story is allowed to take one of two narrative paths, and only one of them, never both at once:",
    },
    {
      type: "list",
      content: [
        "Recollection — a quiet remembering of an everyday moment the pet was part of. A walk, a window seat, a morning. The pet is present and alive throughout. The ending is fond, not final.",
        "Rainbow Bridge — a soft, symbolic Rainbow Bridge farewell using the language of crossing over. The pet is not in pain. The crossing is gentle. The ending is peaceful and complete.",
      ],
    },
    {
      type: "paragraph",
      content:
        "These two paths exist because they do different emotional work, and blending them produces something dishonest — a story that tries to be both alive-in-the-present and saying-goodbye at the same time. We learned the hard way that this never reads well. So Memorial mode picks one, commits to it, and stays inside that frame.",
    },
    {
      type: "heading",
      content: "How the modes change the dedication pages",
    },
    {
      type: "paragraph",
      content:
        "Memorial books include a front-matter dedication page and a closing dedication page in the print interior — short, plain spaces for the pet's full name, the years they were with you, and a sentence of your own choosing. Living books skip them. The intent is that the memorial volume can sit on a shelf as something more than a story; it doubles as the keepsake object the family keeps from the pet's life.",
    },
    {
      type: "paragraph",
      content:
        "Living books leave those pages out because adding them to a happy adventure feels strange — like writing an in memoriam for a dog who is still in the next room.",
    },
    {
      type: "heading",
      content: "How to tell which one you want",
    },
    {
      type: "paragraph",
      content:
        "Most of the time the answer is obvious. If you are making a book for a pet who is currently asleep at your feet, you want Living. If you are making a book a few months or years after a loss, you want Memorial.",
    },
    {
      type: "paragraph",
      content:
        "The edge cases tend to be these. A pet who is older and slowing down, but who is still here — we recommend Living. The story-as-record matters more during a pet's actual life than after. A pet who you lost only weeks ago — Memorial is the structurally honest choice, but we gently suggest waiting a bit. Grief that is very fresh tends to want a different kind of attention than a book can give. We have written more about that in [the memorial-mode essay](/blog/memorializing-a-pet).",
    },
    {
      type: "heading",
      content: "What the AI actually does differently",
    },
    {
      type: "paragraph",
      content:
        "If you are curious about the internals: when you pick Memorial, the system prepends a set of guardrails to your story idea before the AI sees it. Those guardrails forbid peril, forbid violent or unhappy events, forbid the blended-frame failure mode mentioned above, and pick one of the two narrative paths based on the cues in your idea. (If your one-liner mentions a rainbow, a goodbye, or a crossing, we steer toward Rainbow Bridge. Otherwise the default is Recollection.)",
    },
    {
      type: "paragraph",
      content:
        "Living mode prepends a much shorter set of guardrails: keep stakes low, keep it warm, no real danger, no real loss. Then the AI writes whatever your idea actually calls for.",
    },
    {
      type: "heading",
      content: "It is okay to make both",
    },
    {
      type: "paragraph",
      content:
        "Some families end up with two volumes for the same pet — [a Living book made during the pet's life](/blog/pet-storybook-vs-photo-album), and a Memorial book made some time after. They sit on the same shelf and they read very differently. That is the version we quietly hope for: a record of who your animal was, made while you still had them, plus a goodbye written in your own voice when you were ready.",
    },
    {
      type: "paragraph",
      content:
        "Whichever you start with, the mode picker on the create page is the single most important decision you will make in the flow. Pick it on purpose.",
    },
  ],
};
