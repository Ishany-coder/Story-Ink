// Helpers for turning a Pet row into the prompt fragments the Gemini
// pipeline needs. Kept in one place so commit 5's memorial guardrails
// only need to touch the system prompt builder, not the call sites.

import type { Pet } from "@/lib/types";

// Compact human-readable description of the pet. Used both in the
// image prompt (so the model knows what to draw when references fail
// to fetch) and in the text prompt (as part of the seeded context).
export function buildPetDescription(pet: Pet): string {
  const parts: string[] = [];
  parts.push(`${pet.name}, a ${pet.species}`);
  if (pet.breed) parts.push(`(${pet.breed})`);
  if (pet.age) parts.push(`age ${pet.age}`);
  return parts.join(" ");
}

// Pet story system prompt. Seeded into generateStoryText for pet
// stories so the AI starts grounded in the pet's profile.
//
// Memorial guardrails (per question 7): celebratory recollection,
// not fan-fiction. We explicitly forbid putting the pet in danger
// or rewriting their species/identity in memorial mode.
export function buildPetStorySystemPrompt(pet: Pet): string {
  const lines: string[] = [];
  lines.push(
    `This is a children's storybook about a real pet the user loves: ${buildPetDescription(
      pet
    )}.`
  );
  if (pet.personality_notes) {
    lines.push(`Things the user wrote about ${pet.name}: ${pet.personality_notes}`);
  }

  // Structured "DNA" — the user filled in answers to specific
  // personality questions (some from our curated bank, some custom).
  // We render them as Q&A so the AI can pull on a single trait per
  // page (head tilt → a moment of confusion, hides socks → the
  // entire plot, scared of the vacuum → the antagonist). Treat
  // these as authoritative character truths, not flavor.
  const quirkLines: string[] = [];
  for (const q of pet.quirks ?? []) {
    if (!q.prompt?.trim() || !q.answer?.trim()) continue;
    quirkLines.push(`  • ${q.prompt.trim()} — ${q.answer.trim()}`);
  }
  if (quirkLines.length > 0) {
    lines.push(
      `${pet.name}'s personality DNA — these are real specific traits the user provided. Drive the story from these whenever possible. A single quirk can be the whole plot of a page (head tilt → moment of confusion, hides socks → entire mystery, scared of vacuum → recurring antagonist). Avoid generic "good dog" beats when a specific quirk would do:\n${quirkLines.join("\n")}`
    );
  }

  if (pet.mode === "memorial") {
    lines.push(
      `IMPORTANT: ${pet.name} has passed away${
        pet.passed_at ? ` on ${pet.passed_at}` : ""
      }. This book is for someone grieving. Goal: provide closure and comfort — never reopen the wound.`
    );
    lines.push(
      `Two narrative paths are valid for memorial books, and the user's prompt below tells you which one to write. Match it. Do not blend them.`
    );
    lines.push(
      `Path A — Recollection: past-tense celebration of who ${pet.name} was and what they did with us. Stay grounded in real moments. No new adventures, no fantasy.`
    );
    lines.push(
      `Path B — Rainbow Bridge: present-tense story of ${pet.name} on the other side, in a peaceful meadow at the end of a rainbow bridge. They are whole, healthy, and happy. Show their adventure there — friends they've met, places they've found, things they love. This is comforting fiction designed to give the reader somewhere lovely to picture their pet now. ${pet.name} is the only ${pet.species} from our world in this place; everyone else is other passed pets they've met.`
    );
    lines.push(
      `Across BOTH paths: gentle, full of light, no peril, no scary villains, no fear, no goodbye-as-tragedy, no plot tension that could feel painful. The death itself never happens on the page — only love, only beauty, only thanks. End on warmth.`
    );
  } else {
    lines.push(
      `${pet.name} is alive and well. Stories should be warm, observational, and rooted in the kind of small details the user would recognize. ${pet.name} is the recognizable hero throughout — same name, same species, same character, on every page.`
    );
  }

  lines.push(
    `Always use ${pet.name}'s actual name. Don't rename them. Don't change their species.`
  );
  return lines.join("\n\n");
}

// User-prompt augmentation: we pass the user's freeform request as
// the primary instruction but prepend the system prompt as guidance.
// The Gemini call in generateStoryText accepts only a single string,
// so we concatenate.
export function composePetStoryPrompt(userPrompt: string, pet: Pet): string {
  return [
    buildPetStorySystemPrompt(pet),
    "",
    "User's idea for this storybook:",
    userPrompt,
  ].join("\n");
}
