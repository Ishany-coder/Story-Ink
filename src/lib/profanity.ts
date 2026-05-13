// Thin wrapper around the `bad-words` package. We instantiate a single
// Filter once per process and re-use it — Filter holds a precompiled
// regex from its blocklist, so re-creating it on every request would
// be wasteful.
//
// Default dictionary only. The package's built-in list (English) is
// already aggressive — adding custom words risks more false positives
// than it catches. The task spec accepts over-blocking, so we keep
// the default list and leave a hook here if a real omission shows up
// later.

import { Filter } from "bad-words";

const filter = new Filter();

export function containsProfanity(text: string): boolean {
  if (!text) return false;
  // isProfane handles word-boundary splitting internally.
  return filter.isProfane(text);
}

// Stable copy of the customer-facing rejection message — keep route
// handlers in sync by importing this constant rather than copy-pasting
// the string at each call site.
export const PROFANITY_REJECTION_MESSAGE =
  "Your prompt contains language we can't use to generate a story. Please rephrase and try again.";
