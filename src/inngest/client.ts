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

export const inngest = new Inngest({
  id: "storyink",
  // In dev, route to the local Inngest dev server (http://localhost:8288)
  // automatically — no INNGEST_DEV env var or event/signing keys required.
  // Production reads the real INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY.
  isDev: process.env.NODE_ENV !== "production",
});

// Event names used across the app. Importing from here keeps typos out of
// both the send sites (HTTP routes) and the function triggers.
export const EVENTS = {
  generateStory: "story/generate.requested",
  regenText: "story/regen-text.requested",
  assistText: "assist/text.requested",
  assistImage: "assist/image.requested",
  assistInfer: "assist/infer.requested",
} as const;

// Shared payload-shape documentation for the assist events. The HTTP
// routes inline their event.data shape and the Inngest handlers
// destructure with an inline cast — we don't have a generated event
// type system here — but these are the OPTIONAL fields the routes
// forward and the handlers honour:
//
//   pageTextSnapshot?: string | null
//     The client's view of page.text at the moment the user submitted
//     the regen request. The handler compares against the DB's current
//     page.text and emits `stale: true` on the result when they diverge,
//     so the Studio can warn before clobbering a manual edit made
//     between submit and Apply. Applies to: assistText, assistInfer.
//
//   pageImageSnapshot?: string | null
//     Same idea for page.imageUrl. Applies to: assistImage, assistInfer.
//
// These are advisory only — the handler always continues the regen and
// only flags the result; it never aborts based on staleness.
