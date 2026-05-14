import type { BlogPost } from "./index";

export const post: BlogPost = {
  slug: "how-to-write-a-great-prompt",
  title: "How to write a great prompt for an AI pet storybook",
  excerpt:
    "The one-line prompt is the most important thing you write into an AI pet storybook. A field guide to writing prompts that produce a book worth keeping.",
  publishedAt: "2026-05-05",
  readMinutes: 6,
  author: "The StoryInk Team",
  body: [
    {
      type: "paragraph",
      content:
        "The prompt box on the create page is small. It is one line. It feels almost incidental compared with the form above it — the pet, the photos, the mode. We promise you it is the single most important thing you write into an AI pet storybook generator. The illustrations follow the words. The pages follow the words. A specific, evocative one-liner makes a specific, evocative book. A generic one-liner makes a generic book.",
    },
    {
      type: "paragraph",
      content:
        "This post is a short field guide to writing the prompt well, based on what we see actually work.",
    },
    {
      type: "heading",
      content: "What does not work",
    },
    {
      type: "paragraph",
      content:
        'Prompts that ask the AI to be creative on your behalf almost never produce the book you wanted. "Make a story about Bingo." "A cute book about my cat." "Something for my daughter\'s birthday." These come back as generic — friendly, technically competent, completely interchangeable with the next person\'s generic book.',
    },
    {
      type: "paragraph",
      content:
        "The reason is mechanical. The AI is good at filling in vivid detail when you give it a hook to hang detail on. With no hook, it averages. Average is the enemy of a keepsake. You want the book to be specific to your pet, which means the prompt has to be specific to your pet.",
    },
    {
      type: "heading",
      content: "What works",
    },
    {
      type: "paragraph",
      content:
        "A great prompt is a sentence with a setting, a pet, and an event. That is all. The shorter and more concrete, the better. Examples that consistently produce good books:",
    },
    {
      type: "list",
      content: [
        "A day at the beach with Bingo, who is afraid of the waves but figures it out.",
        "Luna helps unpack the moving boxes in the new apartment.",
        "Otis steals Dad's sock and the whole house tries to get it back.",
        "A snowy morning walk through the woods with Mabel.",
        "Ruby visits Grandma's farm and meets the chickens.",
      ],
    },
    {
      type: "paragraph",
      content:
        "Notice what each one does. There is a place. There is a small problem or a small event. The pet is named. There is room for the AI to invent the middle without inventing the whole thing.",
    },
    {
      type: "heading",
      content: "Use the pet's name. Always.",
    },
    {
      type: "paragraph",
      content:
        "The pet's name in the prompt is not redundant with the pet form. The name in the prompt signals to the AI that you want it on the page in dialogue, in narration, in the moments where a character is being addressed. Without it the AI tends to default to pronouns and generic phrases. With it the book reads like the book is about your specific dog, because the name is everywhere it should be.",
    },
    {
      type: "heading",
      content: "Lean on the quirks bank",
    },
    {
      type: "paragraph",
      content:
        "When you add a pet, you can tag quirks — things like loves the vacuum cleaner, scared of skateboards, eats grass, sneezes when happy. Those quirks are not decorative. They get fed into the prompt as facts the AI is encouraged to use. A single quirk can drive an entire page. (Quirks pull their weight in the prose; on the illustration side, what does most of the work is [the right reference photos](/blog/science-of-pet-reference-photos).)",
    },
    {
      type: "paragraph",
      content:
        "If your pet does something genuinely strange and specific — yells at the toaster, sleeps on the kitchen counter, only fetches if you say please — write it down. The AI will find a place for it, and that page is the page everyone will remember.",
    },
    {
      type: "heading",
      content: "Tone words help",
    },
    {
      type: "paragraph",
      content:
        'You can sneak a tone word into the prompt to steer the writing. "A cozy snowy evening with Mabel." "A silly chaotic morning with Otis." "A quiet rainy day with Luna." Words like cozy, silly, quiet, chaotic, dreamy, brave, gentle — they cost you nothing in the prompt and they change the whole tone of the prose. The AI is paying attention to them.',
    },
    {
      type: "paragraph",
      content:
        "Avoid adjectives that load up the pet itself (best, sweetest, smartest, most). Those tend to read as sentimental in the output. Use them about the day, not about the dog.",
    },
    {
      type: "heading",
      content: "One idea per book",
    },
    {
      type: "paragraph",
      content:
        'You will be tempted to cram in everything: "Bingo at the beach AND meeting Grandma AND the time he got skunked AND when he was a puppy." Resist this. Six to eight pages is enough for one event with a beginning and an end. Two events in one book read as rushed; three events read as a slideshow. Save the rest for a second book — it is okay to make more than one.',
    },
    {
      type: "heading",
      content: "Fixing an AI pet storybook draft page by page",
    },
    {
      type: "paragraph",
      content:
        "If the first generation is close-but-not-quite, do not start over. The AI Assistant in the Studio can rewrite a single page, [regenerate a single illustration](/blog/behind-the-illustrations), or do both at once. We have found that going page-by-page with small targeted instructions — change this character to a tabby, make this page indoors, tone down this paragraph — gets you the book you actually wanted faster than re-rolling the whole thing.",
    },
    {
      type: "paragraph",
      content:
        "If the first generation is genuinely wrong (the pet looks like a different animal, the mode picked the wrong narrative path, the setting is way off), regenerate from the create page with a tighter prompt. Add the missing detail. The system is responsive to what you actually write.",
    },
    {
      type: "heading",
      content: "A prompt template for your personalized pet book",
    },
    {
      type: "paragraph",
      content:
        "When you are stuck, the template that works for most people is this: one tone word, a place, the pet's name, a small problem.",
    },
    {
      type: "quote",
      content:
        "A cozy rainy afternoon at home with Bingo, who is convinced there is a squirrel on the porch.",
    },
    {
      type: "paragraph",
      content:
        "Place. Pet. Problem. Tone. Twelve seconds to write. The story it produces will feel like it was about your dog in particular, because it was.",
    },
  ],
};
