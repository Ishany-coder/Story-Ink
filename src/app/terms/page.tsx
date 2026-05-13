import Link from "next/link";
import { LAST_UPDATED, SUPPORT_EMAIL } from "@/lib/legal";

// Plain-language Terms of Service. The refund policy and governing-law
// section are written as sensible defaults; the operator should adjust
// the specifics (refund windows, jurisdiction) before high-stakes use.
// See the footer note at the bottom of the page for the caveat.

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

      <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
        Terms of Service
      </h1>
      <p className="mt-2 text-xs uppercase tracking-wider text-ink-500">
        Last updated: {LAST_UPDATED}
      </p>

      <section className="mt-8 space-y-8 text-sm leading-relaxed">
        <div>
          <p>
            These terms govern your use of StoryInk. By creating an
            account or using the service, you agree to them. We have
            tried to write them in plain English.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            1. Eligibility and your account
          </h2>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>
              You must be at least thirteen years old to hold a StoryInk
              account. If you are under the age of majority where you
              live, you should have a parent or guardian review these
              terms with you.
            </li>
            <li>
              You are responsible for keeping your sign-in credentials
              secure and for what happens on your account. Do not share
              your account; do not use someone else&rsquo;s.
            </li>
            <li>
              The information you provide at sign-up (email, profile
              details from the OAuth provider) should be accurate.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            2. Your content and the rights you give us
          </h2>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>
              You keep ownership of your pet photos, your prompts, and
              the personal details you upload. We do not claim any
              copyright in them.
            </li>
            <li>
              By uploading material to StoryInk you grant us a limited
              license to store it, process it, send it to our AI
              provider for generation, render it on screens for you,
              print it inside a hardcover book if you order one, and
              host it inside your account for as long as you keep it
              there.
            </li>
            <li>
              You confirm that you have the right to upload the material
              you upload — that the photos are yours (or yours to use)
              and that the content does not infringe anyone
              else&rsquo;s rights.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            3. AI-generated stories and illustrations
          </h2>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>
              Stories and illustrations are produced by an AI model. The
              output may be inaccurate, repetitive, surprising, or off-
              tone. You should review every page before ordering a
              printed copy or sharing the book with others.
            </li>
            <li>
              As between you and StoryInk, the generated output for your
              book is yours to use personally. You should know that
              under current US copyright law, purely AI-generated
              content is not eligible for copyright protection on its
              own; copyright attaches only to the human-authored or
              human-edited portions. This is the legal landscape as of
              today and may change.
            </li>
            <li>
              We are not responsible for downstream uses of the output —
              if you share, print, or remix the book outside StoryInk,
              the legal consequences of that use are on you.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            4. Orders and shipping
          </h2>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>
              When you order a hardcover, we charge the payment method
              you provide at checkout (processed by Stripe), build the
              print-ready PDFs, and either fulfill the order ourselves
              or pass the files to a print partner for production and
              shipping.
            </li>
            <li>
              Shipping times depend on the print and shipping path. We
              show estimated delivery windows at checkout where we can,
              but cannot guarantee a specific arrival date.
            </li>
            <li>
              You are responsible for entering a correct shipping
              address. If a package is returned because the address was
              wrong, reshipping may incur a new charge.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            5. Refunds
          </h2>
          <p>
            These are the defaults. The operator should adjust the
            specifics to match the actual fulfillment partner&rsquo;s
            terms before live launch.
          </p>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>
              <strong>Digital unlock</strong> — non-refundable once the
              full digital PDF has been generated for you. You can
              still preview the book before unlocking; the unlock fee
              applies once the full version is produced.
            </li>
            <li>
              <strong>Hardcover, before production begins</strong> —
              fully refundable. Production typically begins within a
              few minutes of checkout, when our system builds the
              print-ready PDFs. If you contact{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-moss-700 underline hover:text-moss-900"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              before the PDF build completes, we will cancel and
              refund.
            </li>
            <li>
              <strong>Hardcover, after production begins but before
              shipping</strong> — partial refund at our discretion;
              production costs may be deducted.
            </li>
            <li>
              <strong>Hardcover, after shipping</strong> — refunds are
              available only for defective or damaged products and for
              packages lost in transit. Email{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-moss-700 underline hover:text-moss-900"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              within thirty days of delivery (or expected delivery)
              with photos and we will make it right with a replacement
              or refund.
            </li>
            <li>
              Refunds are issued to the original Stripe payment method.
              If you refund the hardcover order entirely, the digital
              unlock that came with it is revoked as well.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            6. Acceptable use
          </h2>
          <p>You agree not to use StoryInk to create or store:</p>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>Content that depicts illegal acts.</li>
            <li>
              Sexual content involving minors, in any form. We treat
              this as an absolute prohibition.
            </li>
            <li>
              Content used to harass, threaten, defame, or dox another
              person.
            </li>
            <li>
              Malware, exploits, attempts to interfere with our service
              or other users.
            </li>
            <li>
              Content that infringes someone else&rsquo;s intellectual
              property or right of publicity.
            </li>
          </ul>
          <p className="mt-2">
            We may remove content and suspend or terminate accounts that
            violate these rules. Serious violations are reported to law
            enforcement where required.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            7. Changes to the service and these terms
          </h2>
          <p>
            We may add, change, or remove features as the product
            evolves. We may also update these terms — material changes
            will be announced inside the app and the &ldquo;Last
            updated&rdquo; date at the top of this page will be bumped.
            Continuing to use StoryInk after a material update means you
            accept the updated terms.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            8. Termination
          </h2>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>
              You can delete your account at any time from the{" "}
              <Link
                href="/account"
                className="text-moss-700 underline hover:text-moss-900"
              >
                Account page
              </Link>
              .
            </li>
            <li>
              We can suspend or terminate accounts that violate these
              terms, that we reasonably suspect of fraud or abuse, or
              when required by law.
            </li>
            <li>
              Sections of these terms that should outlive an account
              (refund liability, content licenses for already-shipped
              books, dispute resolution) continue after the account
              ends.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            9. Service is provided as is
          </h2>
          <p>
            StoryInk is provided on an &ldquo;as is&rdquo; and
            &ldquo;as available&rdquo; basis. We do not warrant that
            the service will be uninterrupted, error-free, or fit for a
            particular purpose. Outages happen. AI output sometimes
            disappoints. We will work in good faith to keep the service
            running and to make right anything that goes wrong with a
            printed order, but we cannot guarantee specific results.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            10. Limitation of liability
          </h2>
          <p>
            To the extent permitted by law, StoryInk&rsquo;s total
            liability to you for any claim arising out of your use of
            the service is limited to the greater of (a) the amount you
            paid us in the twelve months before the claim or (b) one
            hundred US dollars. We are not liable for indirect,
            incidental, consequential, or punitive damages.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            11. Governing law
          </h2>
          <p>
            {/*
              Operator: pick the US state whose law you want to govern
              this agreement before treating this clause as binding.
              The default below is a placeholder.
            */}
            These terms are governed by the laws of{" "}
            <span className="italic">[your state]</span>, without regard
            to its conflict-of-laws principles. Disputes are subject to
            the exclusive jurisdiction of state and federal courts
            located in{" "}
            <span className="italic">[your state]</span>, except where
            applicable consumer-protection law gives you the right to
            sue locally.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            12. Contact
          </h2>
          <p>
            Questions, support, or notice of a dispute:{" "}
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
