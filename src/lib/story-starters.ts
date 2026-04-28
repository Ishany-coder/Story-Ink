// Story starter presets — short templated prompts that seed the AI
// with a specific premise. Lets users skip the blank-textarea phase
// of story creation; they pick a card, edit a couple words, hit go.
//
// Mode-aware: living-pet stories include adventure starters; memorial
// stories include celebratory recollection starters that follow the
// user's "celebratory recollection, not fan-fiction" rule.

import type { Pet, PetMode } from "@/lib/types";

export interface StoryStarter {
  id: string;
  emoji: string;
  label: string;
  // Function so the prompt can reference the pet's name. Returns the
  // user-facing prompt text — the actual system-prompt seeding (with
  // the full pet profile) happens server-side in the Inngest function.
  build: (pet: Pet) => string;
}

const LIVING_STARTERS: StoryStarter[] = [
  {
    id: "day-in-the-life",
    emoji: "\u{1F31E}",
    label: "A day in the life",
    build: (pet) =>
      `A storybook about a normal-looking day in the life of ${pet.name}, my ${pet.species}. Make it warm and observational — the small moments that make ${pet.name} who they are.`,
  },
  {
    id: "adventure",
    emoji: "\u{1F5FA}\u{FE0F}",
    label: "Adventure",
    build: (pet) =>
      `${pet.name} the ${pet.species} goes on a small adventure that turns surprisingly magical. Keep ${pet.name} the recognizable hero throughout.`,
  },
  {
    id: "if-they-could-talk",
    emoji: "\u{1F4AC}",
    label: "If they could talk",
    build: (pet) =>
      `A storybook imagining what ${pet.name}, my ${pet.species}, would say if they could talk for one day. Their voice, their opinions, their priorities.`,
  },
  {
    id: "holiday",
    emoji: "\u{1F384}",
    label: "Holiday memory",
    build: (pet) =>
      `${pet.name} the ${pet.species} experiencing a beloved holiday — pick the one that fits ${pet.name} best. Cozy and full of detail.`,
  },
  {
    id: "best-friend",
    emoji: "\u{1F495}",
    label: "Why we love them",
    build: (pet) =>
      `A storybook about all the small reasons we love ${pet.name}, my ${pet.species}. Think of it as a love letter for someone to read out loud.`,
  },
];

// Memorial starters split across two narrative paths:
//  - Recollection: past-tense celebration of who they were and what
//    they did with us. The original memorial mode.
//  - Rainbow Bridge: present-tense imagined adventure on the other
//    side, written as a letter or postcard from the pet. Provides
//    closure and comfort by giving the loss a beautiful elsewhere
//    to live. Encouraged for grief support; the prompt explicitly
//    keeps it gentle, no peril, no goodbye-as-tragedy.
//
// The system prompt for memorial mode (see lib/pet-prompt.ts) is
// permissive enough to handle either flavor — the user picks via
// the starter card.
const MEMORIAL_STARTERS: StoryStarter[] = [
  {
    id: "memorial-favorite-things",
    emoji: "\u{1F33F}",
    label: "Favorite things",
    build: (pet) =>
      `A celebration of ${pet.name}'s favorite things — places they loved, people they loved, the small habits that made them themselves. Past tense. Gentle, grateful, no jeopardy.`,
  },
  {
    id: "memorial-day-we-met",
    emoji: "\u{1F4DC}",
    label: "The day we met",
    build: (pet) =>
      `A storybook recalling the day ${pet.name}, my ${pet.species}, came into our lives. A celebration of beginnings. Warm and tender.`,
  },
  {
    id: "memorial-good-life",
    emoji: "\u{2728}",
    label: "A good life",
    build: (pet) =>
      `A retelling of the good life ${pet.name} had — moments worth remembering, told as a thank-you. Soft and full of light.`,
  },
  {
    id: "memorial-letter",
    emoji: "\u{1F48C}",
    label: "A letter to them",
    build: (pet) =>
      `A storybook in the form of a letter to ${pet.name}, my ${pet.species}, telling them what we want them to know. Tender, present-feeling, no goodbye-as-tragedy — more like a quiet thank-you.`,
  },
  {
    id: "rainbow-great-adventure",
    emoji: "\u{1F308}",
    label: "The great adventure",
    build: (pet) =>
      `A Rainbow Bridge story: ${pet.name} the ${pet.species} is on their great adventure now, in a sunny meadow at the end of a rainbow bridge where every pet eventually meets. Present tense. Show what their day looks like there — the friends they've made, the favorite spots they've found, who they're playing with, what they're chasing. Joyful, sun-warm, no peril, no scary. End on a soft note that they're happy and they remember us.`,
  },
  {
    id: "rainbow-postcard",
    emoji: "\u{1F4EC}",
    label: "A postcard home",
    build: (pet) =>
      `A storybook in the form of a postcard from ${pet.name} on the other side. Each page is a snapshot they want to send back: "Today I…", "I made a friend who…", "I found a spot that reminds me of…". Warm, present-tense, comforting. End with them telling us they're okay and that the love still travels both ways.`,
  },
  {
    id: "rainbow-meadow",
    emoji: "\u{1F33C}",
    label: "Meadow at the bridge",
    build: (pet) =>
      `A storybook describing the meadow where ${pet.name} is now — the smells, the sounds, the soft grass, the others who run with them. A gentle, present-tense tour of a peaceful place. Provide closure: ${pet.name} is whole, healthy, and happy here. No fear, no chase scenes, no dramatic peril.`,
  },
];

export function startersForMode(mode: PetMode): StoryStarter[] {
  return mode === "memorial" ? MEMORIAL_STARTERS : LIVING_STARTERS;
}
