import Link from "next/link";
import { LAST_UPDATED, SUPPORT_EMAIL } from "@/lib/legal";

// PLACEHOLDER privacy policy. Replace the body of this page with the
// real legal text reviewed by counsel before launching to live users.
// The outline below is a non-binding starting point — it's not a real
// privacy policy.

export const metadata = {
  title: "Privacy Policy — StoryInk",
  description:
    "How StoryInk collects, uses, and protects information about you and your pets.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 text-ink-700">
      <Link
        href="/"
        className="text-sm font-medium text-ink-300 hover:text-moss-700"
      >
        &larr; Back home
      </Link>

      <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
        Privacy Policy
      </h1>
      <p className="mt-2 text-xs uppercase tracking-wider text-ink-500">
        Last updated: {LAST_UPDATED}
      </p>

      <div className="mt-6 rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Placeholder content.</p>
        <p className="mt-1">
          Replace this entire page with a real privacy policy reviewed by
          counsel before launching publicly. The sections below are an
          outline of what your policy should cover — they are{" "}
          <strong>not legal text</strong>.
        </p>
      </div>

      <section className="mt-8 space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            1. What we collect
          </h2>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>
              Account info from your sign-in (email, OAuth profile data
              from your auth provider).
            </li>
            <li>
              Content you create or upload: pet names, photos, traits,
              story prompts, and the generated stories themselves.
            </li>
            <li>
              Order info if you buy a hardcover (shipping address, order
              status). Payment card details are never stored by us —
              they go directly to Stripe.
            </li>
            <li>
              Basic usage telemetry (pages visited, errors) to keep the
              service running.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            2. How we use it
          </h2>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>
              To generate the stories you ask for — your prompts and pet
              photos are sent to our AI provider (Google Gemini).
            </li>
            <li>To process and fulfill orders.</li>
            <li>To respond to support requests.</li>
            <li>To debug and improve the product.</li>
          </ul>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            3. Third parties
          </h2>
          <p>
            We share data only with the providers we need to run the
            service: Supabase (database + auth + file storage), Google
            (Gemini AI generation), Stripe (payments). Each of those has
            their own privacy policy.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            4. Gemini AI processing
          </h2>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>
              Outline: which Gemini model(s) we call, what payload we
              send (prompt text, pet reference photos, previously
              generated illustrations for character continuity).
            </li>
            <li>
              Outline: Google&rsquo;s data-use commitments for the API
              tier we&rsquo;re on (training opt-out, retention window).
              Counsel must verify against Google&rsquo;s current terms
              before publishing.
            </li>
            <li>
              Outline: how long we retain prompts and generated
              artifacts on our side, and how a user requests deletion.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            5. Stripe and payment data
          </h2>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>
              Outline: card data is collected and processed by Stripe;
              we never see it. We only store a Stripe session/charge id
              and the shipping address you provide at checkout.
            </li>
            <li>
              Outline: what metadata we attach to a Stripe Checkout
              session (story id, address blob) and why.
            </li>
            <li>
              Outline: Stripe&rsquo;s role as a processor under
              GDPR/CCPA and link to Stripe&rsquo;s privacy notice.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            6. Your rights and choices (GDPR / CCPA)
          </h2>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>
              Outline: right of access — how to request a copy of your
              data (the /account page exposes a self-serve export).
            </li>
            <li>Outline: right to rectification.</li>
            <li>
              Outline: right to erasure — how to delete your account
              (self-serve from /account) and what is retained for legal
              / tax reasons (shipped order records, anonymized).
            </li>
            <li>Outline: right to restriction and objection.</li>
            <li>Outline: right to data portability (the export above).</li>
            <li>
              Outline: CCPA-specific disclosures — categories of personal
              information collected, sold (we don&rsquo;t sell), shared,
              and the right to opt-out / right to know.
            </li>
            <li>
              Outline: contact path for data-subject requests and the
              statutory response window.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            7. Contact
          </h2>
          <p>
            Questions:{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-moss-700 underline hover:text-moss-900"
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </div>
      </section>
    </article>
  );
}
