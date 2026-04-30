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
}

export const QUIRK_BANK: QuirkPrompt[] = [
  {
    prompt: "What's their most distinctive habit or quirk?",
    placeholder: "e.g. tilts her head whenever I say 'cheese'",
  },
  {
    prompt: "What do they love most in the world?",
    placeholder: "e.g. a half-deflated tennis ball named Mr. Ball",
  },
  {
    prompt: "What scares or annoys them?",
    placeholder: "e.g. plastic bags, the vacuum, the mailman's truck",
  },
  {
    prompt: "Who's their favorite person, and why?",
    placeholder: "e.g. my partner — sighs dramatically when he leaves the room",
  },
  {
    prompt: "What's a moment that shows exactly who they are?",
    placeholder: "e.g. the day she stole a whole loaf of bread off the counter",
  },
];
