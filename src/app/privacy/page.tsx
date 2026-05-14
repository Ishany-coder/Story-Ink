import Link from "next/link";
import { LAST_UPDATED, SUPPORT_EMAIL } from "@/lib/legal";

// Plain-language privacy policy. Drafted to match what the app
// actually does — collected data categories, third-party processors,
// rights, retention behavior all reflect the implemented code paths.
// See the footer note at the bottom of the page for the caveat.

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

      <section className="mt-8 space-y-8 text-sm leading-relaxed">
        <div>
          <p>
            This policy describes what information StoryInk collects when
            you use the service, how we use it, who we share it with, and
            what choices you have. We have tried to write it in plain
            English. If anything is unclear, email{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-moss-700 underline hover:text-moss-900"
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            1. What we collect
          </h2>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>
              <strong>Account info.</strong> Your email address and
              password. Authentication is handled by Supabase Auth —
              passwords are hashed by Supabase before storage; we never
              see, log, or store the plaintext.
            </li>
            <li>
              <strong>Pet info.</strong> Names, photos, traits, quirks,
              and any other details you enter when creating a pet.
            </li>
            <li>
              <strong>Story content.</strong> The one-line ideas you
              write, the generated stories, the AI Assistant prompts
              you send, and any per-story system prompts you save.
            </li>
            <li>
              <strong>Order info.</strong> If you buy a hardcover, we
              collect the shipping address you enter at checkout and
              record the Stripe session and order status. We never see
              or store your card number — Stripe processes the payment
              and we receive only a charge identifier and metadata you
              provided.
            </li>
            <li>
              <strong>Usage telemetry.</strong> Basic information about
              page visits and errors, used to keep the service running
              and to debug problems. We do not maintain advertising
              profiles.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            2. How we use it
          </h2>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>
              To generate the stories you ask for. Your prompt text and
              pet reference photos are sent to Google Gemini at
              generation time so the model can produce the story and
              illustrations.
            </li>
            <li>To process and ship hardcover orders.</li>
            <li>
              To respond when you contact{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-moss-700 underline hover:text-moss-900"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              or use the in-app support chat.
            </li>
            <li>
              To debug and improve the service, including diagnosing
              errors and tuning the AI prompts we send to Gemini.
            </li>
            <li>
              To send transactional email (order confirmations,
              fulfillment updates). We do not send marketing email
              without a separate opt-in.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            3. Third parties we share data with
          </h2>
          <p>
            We share data only with the providers we need to run the
            service. Each operates under its own privacy policy.
          </p>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>
              <strong>Supabase</strong> — hosts our database (Postgres),
              authentication, and file storage (your pet photos and
              generated illustrations live here).
            </li>
            <li>
              <strong>Google Gemini</strong> — receives your prompt text
              and reference photos at generation time and returns the
              story text and illustrations. We use the paid Gemini API
              tier.
            </li>
            <li>
              <strong>Stripe</strong> — processes payments. Stripe
              receives your card details directly (we never see them);
              we only receive a session identifier, a charge identifier,
              and the shipping address you provided at checkout.
            </li>
            <li>
              <strong>Resend</strong> — delivers transactional email
              (order confirmations, shipping updates) on our behalf.
            </li>
            <li>
              <strong>Sentry</strong> — receives error reports if we
              have a Sentry DSN configured. Reports may include the
              page URL, error message, and stack trace; we try not to
              attach personal content but exceptional cases may include
              fragments of error context.
            </li>
          </ul>
          <p className="mt-2">
            We do not sell personal information. We do not share data
            with advertising networks.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            4. Cookies and similar technology
          </h2>
          <p>
            We use a small number of strictly necessary cookies:
          </p>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>
              <strong>Supabase auth cookies</strong> — keep you signed
              in across page loads. Without these, the service does not
              work.
            </li>
            <li>
              <strong>Cookie consent preference</strong> — stores your
              choice on the cookie banner so we do not show it on every
              visit.
            </li>
          </ul>
          <p className="mt-2">
            We do not use third-party analytics or advertising cookies.
            If that ever changes, we will update this policy and ask for
            consent before setting them.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            5. Your rights and choices
          </h2>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>
              <strong>Access and export.</strong> The{" "}
              <Link
                href="/account"
                className="text-moss-700 underline hover:text-moss-900"
              >
                Account page
              </Link>{" "}
              includes a self-serve export of your data — pets, stories,
              and order history — so you can download a copy at any
              time.
            </li>
            <li>
              <strong>Correction.</strong> You can edit pets, stories,
              and individual pages directly inside the app.
            </li>
            <li>
              <strong>Deletion.</strong> You can delete your account from
              the Account page. Deletion cascades through your pets,
              stories, and generated content. For tax and audit reasons
              we retain anonymized order records (no name, no email, no
              shipping address) tied to the original Stripe charge.
            </li>
            <li>
              <strong>Withdraw consent.</strong> You can stop using the
              service at any time. Deleting your account is the most
              complete way to withdraw consent.
            </li>
            <li>
              Depending on where you live (EU/UK, California, and other
              jurisdictions with similar laws) you may have additional
              statutory rights — to object to certain processing, to
              restrict processing, to receive your data in a portable
              format, and to lodge a complaint with a regulator. Email{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-moss-700 underline hover:text-moss-900"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              and we will respond within thirty days.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            6. Retention
          </h2>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>
              <strong>Pets, stories, and generated content</strong> are
              kept as long as your account exists. They are removed
              when you delete a pet, a story, or your whole account.
            </li>
            <li>
              <strong>Order records</strong> are retained for tax and
              audit purposes. When you delete your account, your name,
              email, and shipping address are removed from the order
              record; the order id, amount, and Stripe charge id remain
              for accounting.
            </li>
            <li>
              <strong>Operational logs</strong> (error traces, request
              logs) are kept for short retention windows by the
              providers above and are not exposed back to us beyond what
              we need to diagnose problems.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            7. International data transfers
          </h2>
          <p>
            StoryInk is operated from the United States. Our
            infrastructure runs on Supabase, Stripe, Google Gemini, and
            Resend, which may process data in the US and other
            jurisdictions. If you are using the service from outside the
            US, you are agreeing to your data being processed in those
            locations. We rely on the contractual protections each
            provider offers (standard contractual clauses where
            applicable) for transfers out of the EU/UK.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            8. Children
          </h2>
          <p>
            StoryInk is intended for adults who create stories for and
            about themselves, their families, and their pets. You must
            be at least thirteen years old to hold an account. The
            stories themselves are designed to be enjoyed by children of
            any age, with adult supervision; the account that creates
            and pays for them is held by an adult or older teen.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            9. Security
          </h2>
          <p>
            We use industry-standard practices: transport encryption
            (HTTPS) on all traffic, row-level security in our database
            so users can only see their own data, server-only secrets
            kept out of the browser bundle, and limited access controls
            on infrastructure. No system is perfectly secure. If you
            suspect a breach affecting your account, email{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-moss-700 underline hover:text-moss-900"
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            10. Governing law
          </h2>
          <p>
            This policy and any dispute about how we handle your
            personal information are governed by the laws of the State
            of Washington, without regard to its conflict-of-laws
            principles. Any such dispute will be brought in the state
            or federal courts located in King County, Washington, and
            you consent to the personal jurisdiction of those courts —
            except where the data-protection or consumer-protection law
            of your home jurisdiction gives you the right to sue or
            complain locally.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            11. Changes to this policy
          </h2>
          <p>
            We may update this policy as the product evolves. Material
            changes will be announced inside the app. The &ldquo;Last
            updated&rdquo; date at the top of this page is bumped
            whenever the text materially changes.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            12. Contact
          </h2>
          <p>
            Questions, requests, or complaints:{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-moss-700 underline hover:text-moss-900"
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </div>

        <div className="mt-10 rounded-2xl border border-cream-300 bg-cream-50 p-4 text-xs text-ink-500">
          These policies were drafted with the help of AI based on what
          the app actually does. We recommend reviewing them with
          counsel before treating them as binding for high-stakes
          disputes. Questions?{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-moss-700 underline hover:text-moss-900"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </div>
      </section>
    </article>
  );
}
