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

  if (pet.mode === "memorial") {
    lines.push(
      `IMPORTANT: ${pet.name} has passed away${
        pet.passed_at ? ` on ${pet.passed_at}` : ""
      }. This book is a celebration of their life — gentle, grateful, no jeopardy. Stay grounded in real moments worth remembering rather than putting ${pet.name} into a fantasy adventure. No peril, no scary villains, no plot tension that could feel painful. Past tense or present-feeling reflection both work; tender and full of light.`
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
