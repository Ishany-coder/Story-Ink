// Server-only transactional email helper. Wraps the Resend SDK with a
// lazy singleton + a no-op fallback for environments where the API key
// isn't configured (local dev without the secret, CI, etc.).
//
// The pattern mirrors the lazy clients elsewhere in the codebase
// (`src/lib/stripe.ts`, `src/lib/supabase.ts`): one `resend()` accessor
// that constructs on first use and throws if the env var is missing,
// plus `sendEmail()` which detects the missing-key case and logs
// instead of throwing — same approach `reportError()` takes for Sentry.
//
// Never import this from a `"use client"` module.

import { Resend } from "resend";
import { reportError } from "@/lib/sentry";

let _client: Resend | null = null;

// Build (or reuse) the Resend client. Throws a helpful error if
// RESEND_API_KEY isn't set — call sites that want a soft-fail should
// go through `sendEmail()` below instead.
export function resend(): Resend {
  if (_client) return _client;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set. Get one from resend.com → API Keys, then add it to .env.local."
    );
  }
  _client = new Resend(key);
  return _client;
}

// Default sender — pulled from EMAIL_FROM. Requires a Resend-verified
// domain (see resend.com → Domains). Falls back to a clearly-fake
// placeholder so a misconfigured boot fails loudly in the Resend
// dashboard instead of silently sending from "no-reply@".
function defaultFrom(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    "StoryInk <orders@storyink.com>"
  );
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  // Plain-text fallback. Strongly recommended (better deliverability,
  // accessibility), but optional — Resend will auto-generate a
  // bare-bones version from the HTML if omitted.
  text?: string;
  // Override the default sender for this send. Use sparingly; most
  // transactional mail should come from the same brand address so
  // users learn to trust it.
  from?: string;
}

// Send a transactional email. No-ops cleanly (with an info log) when
// RESEND_API_KEY is unset, so dev environments without the secret keep
// working. Errors are reported to Sentry but never thrown — callers
// shouldn't have to wrap every send-site in a try/catch just because
// the mail provider had a hiccup.
export async function sendEmail(args: SendEmailArgs): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.info(
      `[email] RESEND_API_KEY unset — skipping send to ${args.to} (subject: ${args.subject})`
    );
    return;
  }

  try {
    const client = resend();
    const result = await client.emails.send({
      from: args.from ?? defaultFrom(),
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (result.error) {
      reportError(result.error, "email.send");
    }
  } catch (err) {
    reportError(err, "email.send");
  }
}
