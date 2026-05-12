import Link from "next/link";

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

      <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-ink-900">
        Privacy Policy
      </h1>
      <p className="mt-2 text-xs uppercase tracking-wider text-ink-500">
        Last updated: <em>[fill in date]</em>
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
            4. Your rights and choices
          </h2>
          <p>
            You can delete your stories and pets from the app at any time.
            You can request a full export or deletion of your account data
            by emailing <em>[your support address]</em>.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            5. Contact
          </h2>
          <p>
            Questions: <em>[your contact email]</em>.
          </p>
        </div>
      </section>
    </article>
  );
}
