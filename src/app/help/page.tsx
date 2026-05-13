import Link from "next/link";
import { Mail } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase-server";
import HelpChat from "@/components/HelpChat";

export const revalidate = 0;
export const dynamic = "force-dynamic";

// Dedicated full-page help / contact page at /help.
//
// Email is the FIRST contact option presented to every visitor —
// signed-in or not. Signed-in users also see the in-app support
// chat below the email card. Anonymous visitors get the email card
// plus a prompt to sign in for live chat.

const SUPPORT_EMAIL = "help@storyink.com";

export default async function HelpPage() {
  const user = await getCurrentUser();

  return (
    <>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pt-6">
        <section className="rounded-2xl border border-cream-300 bg-cream-50 px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex items-start gap-4">
            <div
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-moss-100 text-moss-700"
            >
              <Mail className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
                Contact
              </span>
              <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
                Email us anytime
              </h1>
              <p className="mt-1 text-sm text-ink-500">
                Email us anytime — we usually reply within one business day.
              </p>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-moss-700 px-4 py-2 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                {SUPPORT_EMAIL}
              </a>
            </div>
          </div>
        </section>
      </div>

      {user ? (
        <HelpChat />
      ) : (
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-6">
          <section className="rounded-2xl border border-cream-300 bg-cream-50 px-5 py-5 sm:px-6 sm:py-6">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink-900">
              Prefer live chat?
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Sign in to send us a message right inside StoryInk — we&apos;ll
              reply in the same thread.
            </p>
            <Link
              href="/login?next=/help"
              className="mt-3 inline-flex items-center rounded-full border border-cream-300 bg-cream-50 px-4 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-cream-400 hover:bg-cream-200"
            >
              Sign in to chat
            </Link>
          </section>
        </div>
      )}
    </>
  );
}
