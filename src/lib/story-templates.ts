// Story template definitions for the first-run experience.
// Each template seeds the story creation form with a kind, starter
// prompt, and placeholder text so users skip the blank-canvas phase.
//
// "pet" templates use the existing serial quality image generation and
// quirk-bank pipeline. All other templates map to the "generic" path
// (fast parallel image generation, no pet profile required).

export interface StoryTemplate {
  id: string;
  emoji: string;
  label: string;
  description: string;
  kind: "pet" | "generic";
  /** Pre-filled prompt text (uses […] placeholders the user edits). */
  starterPrompt?: string;
  promptPlaceholder: string;
}

export const STORY_TEMPLATES: StoryTemplate[] = [
  {
    id: "pet",
    emoji: "🐾",
    label: "Your pet",
    description:
      "Adventures starring your furry, feathered, or scaly best friend",
    kind: "pet",
    promptPlaceholder: "What should your pet's story be about?",
  },
  {
    id: "kids",
    emoji: "🌟",
    label: "Your kids",
    description: "A personalized storybook with your child as the hero",
    kind: "generic",
    starterPrompt:
      "A storybook starring [child's name], a curious and adventurous [age]-year-old. [Describe their personality or a special interest.] Make it whimsical, age-appropriate, and full of wonder.",
    promptPlaceholder:
      "Describe your child and what their story should be about…",
  },
  {
    id: "family",
    emoji: "🏡",
    label: "Your family",
    description: "Celebrate your family's story, traditions, and memories",
    kind: "generic",
    starterPrompt:
      "A warm storybook about the [family name] family. [Describe a memory, tradition, or adventure you'd like to capture.] Make it personal, full of heart, and fun for all ages.",
    promptPlaceholder: "Describe your family and the story you want to tell…",
  },
  {
    id: "memorial",
    emoji: "🌈",
    label: "Memorial / tribute",
    description: "A loving tribute to someone who meant the world to you",
    kind: "generic",
    // This template covers memorials for people (not pets). Pet
    // memorials are handled by the "pet" template with mode="memorial"
    // which activates the dedicated guardrails in pet-prompt.ts
    // (Rainbow Bridge, no peril, celebratory-recollection framing).
    // Human memorials use the generic path intentionally — the pet
    // system prompt is species-specific and would be a poor fit.
    starterPrompt:
      "A celebratory tribute storybook honoring [name]. [Describe who they were and what made them special — their laugh, their hobbies, a memory that captures them perfectly.] Focus on joy, love, and the light they brought — celebratory, not sad.",
    promptPlaceholder:
      "Describe the person you're honoring and what made them special…",
  },
  {
    id: "coworker",
    emoji: "🎉",
    label: "Coworker / farewell",
    description: "A farewell gift that celebrates a colleague's journey",
    kind: "generic",
    starterPrompt:
      "A fun farewell storybook for [name], who is [leaving the team / retiring / moving on to their next adventure]. Capture their legendary [describe their workplace personality, a running joke, or their superpower]. Warm, funny, and full of heart.",
    promptPlaceholder: "Describe the colleague and what makes them memorable…",
  },
  {
    id: "wedding",
    emoji: "💍",
    label: "Wedding / anniversary",
    description: "Celebrate a love story from beginning to forever",
    kind: "generic",
    starterPrompt:
      "A romantic storybook about [names]'s love story. [Describe how they met, a shared adventure, or what makes their relationship magical.] Warm, heartfelt, and beautifully illustrated — a keepsake they'll treasure.",
    promptPlaceholder: "Describe the couple and their love story…",
  },
  {
    id: "birthday",
    emoji: "🎂",
    label: "Birthday",
    description: "A personalized birthday book they'll treasure forever",
    kind: "generic",
    starterPrompt:
      "A birthday storybook for [name] turning [age]. [Describe what they love, who they are, or a dream adventure you'd plan for them.] Joyful, warm, and full of celebration.",
    promptPlaceholder: "Describe the birthday person and what they love…",
  },
  {
    id: "custom",
    emoji: "✨",
    label: "Custom / from scratch",
    description:
      "Start with a blank canvas — you imagine it, we illustrate it",
    kind: "generic",
    promptPlaceholder: "Describe the story you'd like to make…",
  },
];
