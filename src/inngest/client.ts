// Single Inngest client shared by every function in this app. The `id` is
// an app-scoped identifier Inngest uses to namespace functions — keep it
// stable across deploys.
//
// Local dev: run `npx inngest-cli@latest dev` alongside `next dev`, and
// open http://localhost:8288 to see events + function runs live.
//
// Production: set INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY in env so this
// client can talk to Inngest Cloud.

import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "storyink" });

// Event names used across the app. Importing from here keeps typos out of
// both the send sites (HTTP routes) and the function triggers.
export const EVENTS = {
  generateStory: "story/generate.requested",
  regenText: "story/regen-text.requested",
  assistText: "assist/text.requested",
  assistImage: "assist/image.requested",
  assistInfer: "assist/infer.requested",
} as const;
