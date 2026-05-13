import Link from "next/link";

// PLACEHOLDER terms of service. Replace the body of this page with the
// real legal text reviewed by counsel before launching to live users.
// The outline below is a non-binding starting point.

export const metadata = {
  title: "Terms of Service — StoryInk",
  description:
    "The terms governing your use of StoryInk's story generation, reading, and print-on-demand service.",
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 text-ink-700">
      <Link
        href="/"
        className="text-sm font-medium text-ink-300 hover:text-moss-700"
      >
        &larr; Back home
      </Link>

      <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-ink-900">
        Terms of Service
      </h1>
      <p className="mt-2 text-xs uppercase tracking-wider text-ink-500">
        Last updated: <em>[fill in date]</em>
      </p>

      <div className="mt-6 rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Placeholder content.</p>
        <p className="mt-1">
          Replace this entire page with real Terms of Service reviewed by
          counsel before launching publicly. The sections below are an
          outline of what your terms should cover — they are{" "}
          <strong>not legal text</strong>.
        </p>
      </div>

      <section className="mt-8 space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            1. Your account
          </h2>
          <p>
            You&rsquo;re responsible for keeping your account credentials
            secure. Don&rsquo;t share your account, don&rsquo;t use
            someone else&rsquo;s.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            2. What you can upload
          </h2>
          <p>
            Only upload pet photos, prompts, and story content that you
            have the right to use. Don&rsquo;t upload content that
            infringes someone else&rsquo;s rights, depicts real people
            without consent, or violates applicable laws.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            3. AI-generated content
          </h2>
          <p>
            The stories and illustrations are generated automatically by
            an AI model. They may occasionally be inaccurate, repetitive,
            or surprising. You&rsquo;re responsible for reviewing the
            output before ordering a printed copy or sharing it.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            4. Orders, refunds, returns
          </h2>
          <p>
            Hardcover books are printed on demand. Once production starts
            we can&rsquo;t cancel. If a book arrives damaged or
            incorrect, contact <em>[your support email]</em> within 30
            days and we&rsquo;ll make it right.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            5. Acceptable use
          </h2>
          <p>
            Don&rsquo;t use the service to generate content that depicts
            illegal acts, sexual content involving minors, harassment,
            doxxing, malware, or anything else unlawful.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            6. Changes and termination
          </h2>
          <p>
            We may update these terms occasionally; material changes will
            be announced in the app. We can suspend accounts that violate
            these terms.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            7. Contact
          </h2>
          <p>
            Questions: <em>[your contact email]</em>.
          </p>
        </div>
      </section>
    </article>
  );
}
