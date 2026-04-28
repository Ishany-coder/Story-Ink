// Curated personality "DNA" prompts. The user answers any subset; the
// answers get folded into the system prompt so Gemini can drive plot
// from the pet's actual specific traits ("tilts head when confused",
// "hides socks under the couch") instead of generic "good dog" beats.
//
// Designing principles:
//  - Specific > general. "What sound do they make when happy?" beats
//    "Describe their personality."
//  - Plot-fertile. Each prompt should suggest a story moment the AI
//    could plausibly use. "Hides socks" is a scene; "Likes naps" is
//    not.
//  - Optional. Users skip whatever doesn't apply.
//  - Stable ids. Copy can change without invalidating answers.

export interface QuirkPrompt {
  id: string;
  // Heading shown above the input.
  prompt: string;
  // Inline placeholder shown when the field is empty. Concrete
  // examples encourage concrete answers.
  placeholder: string;
  // Bucket label used to group prompts in the form.
  category: QuirkCategory;
}

export type QuirkCategory =
  | "moves"
  | "sounds"
  | "habits"
  | "loves"
  | "fears"
  | "people";

export const QUIRK_CATEGORIES: { id: QuirkCategory; label: string }[] = [
  { id: "moves", label: "Moves & expressions" },
  { id: "sounds", label: "Sounds" },
  { id: "habits", label: "Daily habits" },
  { id: "loves", label: "What they love" },
  { id: "fears", label: "What they avoid" },
  { id: "people", label: "Their people" },
];

export const QUIRK_BANK: QuirkPrompt[] = [
  // ---- Moves & expressions ------------------------------------------------
  {
    id: "head-tilt",
    prompt: "Do they tilt their head?",
    placeholder: "e.g. only when I say 'cheese'",
    category: "moves",
  },
  {
    id: "zoom-style",
    prompt: "How do they zoom around?",
    placeholder: "e.g. tucks his butt and runs sideways",
    category: "moves",
  },
  {
    id: "spin-before-lying",
    prompt: "What's their pre-nap ritual?",
    placeholder: "e.g. spins three times before settling",
    category: "moves",
  },
  {
    id: "greeting-move",
    prompt: "How do they greet you when you come home?",
    placeholder: "e.g. brings me a sock as a gift",
    category: "moves",
  },

  // ---- Sounds -------------------------------------------------------------
  {
    id: "happy-sound",
    prompt: "What sound do they make when they're happy?",
    placeholder: "e.g. a low rumble like a tiny motor",
    category: "sounds",
  },
  {
    id: "want-something-sound",
    prompt: "What sound do they make when they want something?",
    placeholder: "e.g. a single sharp 'boop'",
    category: "sounds",
  },
  {
    id: "magic-word",
    prompt: "What word makes them perk up the most?",
    placeholder: "e.g. 'walk' — even spelled out",
    category: "sounds",
  },

  // ---- Daily habits -------------------------------------------------------
  {
    id: "morning-routine",
    prompt: "What's their morning routine?",
    placeholder: "e.g. wakes me up at 6:32 sharp by sitting on my chest",
    category: "habits",
  },
  {
    id: "sleep-spot",
    prompt: "Where do they actually sleep?",
    placeholder: "e.g. starts on the dog bed, ends up on my pillow",
    category: "habits",
  },
  {
    id: "hiding-spot",
    prompt: "Where do they hide?",
    placeholder: "e.g. under the couch when the vacuum starts",
    category: "habits",
  },
  {
    id: "stolen-thing",
    prompt: "What do they steal?",
    placeholder: "e.g. socks — collects them in a pile behind the chair",
    category: "habits",
  },

  // ---- What they love -----------------------------------------------------
  {
    id: "favorite-toy",
    prompt: "Favorite toy or object?",
    placeholder: "e.g. a half-deflated tennis ball named 'Mr. Ball'",
    category: "loves",
  },
  {
    id: "favorite-treat",
    prompt: "Favorite treat?",
    placeholder: "e.g. cheese — and they know the fridge sound",
    category: "loves",
  },
  {
    id: "favorite-place",
    prompt: "Favorite place to go?",
    placeholder: "e.g. the riverbank where they chase pigeons",
    category: "loves",
  },
  {
    id: "favorite-game",
    prompt: "Favorite game?",
    placeholder: "e.g. tug-of-war with a knotted rope",
    category: "loves",
  },

  // ---- What they avoid ----------------------------------------------------
  {
    id: "main-fear",
    prompt: "What scares them?",
    placeholder: "e.g. plastic bags, blowing leaves, the mailman's truck",
    category: "fears",
  },
  {
    id: "avoids",
    prompt: "What do they refuse to do?",
    placeholder: "e.g. step on tile floors with bare paws",
    category: "fears",
  },

  // ---- Their people -------------------------------------------------------
  {
    id: "best-friend",
    prompt: "Who's their favorite person in the household?",
    placeholder: "e.g. my partner — they sigh dramatically when he leaves",
    category: "people",
  },
  {
    id: "rival",
    prompt: "Anyone they've decided is their nemesis?",
    placeholder: "e.g. the squirrel that lives in the oak tree",
    category: "people",
  },
  {
    id: "relationship-with-other-pet",
    prompt: "How do they get along with other pets?",
    placeholder: "e.g. ignores the cat unless food is involved",
    category: "people",
  },
];

// Lookup helper — returns null for unknown ids so a stale answer
// doesn't crash anything if a prompt is removed from the bank.
export function getQuirkPrompt(id: string): QuirkPrompt | null {
  return QUIRK_BANK.find((q) => q.id === id) ?? null;
}
