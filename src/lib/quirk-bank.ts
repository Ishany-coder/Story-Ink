// Five universal personality-DNA prompts shown by default in the
// PetForm. Picked because every pet has *some* answer to each — they
// don't presume a species, breed, or living situation. Anything more
// specific belongs as a user-added custom quirk.
//
// Stored on Pet.quirks as { prompt, answer } so users can also write
// their own questions (the "+ Add custom" path in the form). The
// AI doesn't care whether a prompt came from this bank or the user;
// both render the same way in the system prompt.

export interface QuirkPrompt {
  // The question shown above the input. Stored verbatim on the pet
  // when the user fills it in, so renaming a prompt here does not
  // invalidate existing data.
  prompt: string;
  // Inline placeholder shown when the field is empty. Concrete
  // examples encourage concrete answers.
  placeholder: string;
  // Curated clickable pill options. Tapping a pill adds it as a
  // removable chip; the free-text input remains available for anything
  // not on the list.
  pills?: string[];
}

export const QUIRK_BANK: QuirkPrompt[] = [
  {
    prompt: "What's their most distinctive habit or quirk?",
    placeholder: "e.g. tilts her head whenever I say 'cheese'",
    pills: [
      "zoomies after baths",
      "steals socks",
      "snores loudly",
      "leans on people",
      "circles before lying down",
      "chases their tail",
      "talks back",
      "carries toys to greet visitors",
      "hogs the bed",
      "stares at walls",
    ],
  },
  {
    prompt: "What do they love most in the world?",
    placeholder: "e.g. a half-deflated tennis ball named Mr. Ball",
    pills: [
      "fetch",
      "belly rubs",
      "car rides",
      "cuddles",
      "treats",
      "swimming",
      "playing with other dogs",
      "chasing squirrels",
      "watching TV",
      "napping in the sun",
    ],
  },
  {
    prompt: "What scares or annoys them?",
    placeholder: "e.g. plastic bags, the vacuum, the mailman's truck",
    pills: [
      "thunderstorms",
      "the vacuum",
      "fireworks",
      "the doorbell",
      "baths",
      "men in hats",
      "skateboards",
      "plastic bags",
      "the vet",
      "loud noises",
    ],
  },
  {
    prompt: "Who's their favorite person, and why?",
    placeholder: "e.g. my partner — sighs dramatically when he leaves the room",
    pills: [
      "mom",
      "dad",
      "the kids",
      "grandparent",
      "roommate",
      "the dog walker",
      "everyone equally",
      "me — they follow me everywhere",
    ],
  },
  {
    prompt: "What's a moment that shows exactly who they are?",
    placeholder: "e.g. the day she stole a whole loaf of bread off the counter",
    pills: [
      "stole food off the counter",
      "escaped the yard",
      "made a new best friend instantly",
      "comforted me when I was sad",
      "destroyed a beloved toy",
      "greeted a stranger like a long-lost friend",
    ],
  },
];
