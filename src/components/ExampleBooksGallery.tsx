// Sample storybook covers shown inside the wizard (Step 1) so first-
// time visitors can see what they're about to make. The covers here
// are designed mockups (gradients + display typography + a small SVG
// motif) rather than real generated covers — they read as
// publisher-curated samples instead of "look at all the books we've
// made for other people."
//
// Swap the SAMPLES list for real story IDs when a marketing surface
// with curated showcase covers exists; the wrapping <article> chrome
// is intentionally similar to BookCard so the swap is trivial.

import type { ReactNode } from "react";

interface SampleBook {
  id: string;
  title: string;
  blurb: string;
  mode: "living" | "memorial";
  // Tailwind gradient classes — drawn from the same palette
  // (cream/moss/gold) that the rest of the site uses, not new tones.
  gradient: string;
  accent: "moss" | "gold";
  motif: "paw" | "snowflake" | "leaf";
  pages: number;
}

const SAMPLES: SampleBook[] = [
  {
    id: "cooper",
    title: "Cooper and the Lost Sock",
    blurb:
      "A scrappy terrier follows his nose through the laundry room and finds a kingdom under the bed.",
    mode: "living",
    gradient: "from-moss-200/70 via-cream-100 to-cream-50",
    accent: "moss",
    motif: "paw",
    pages: 24,
  },
  {
    id: "bella",
    title: "Bella's Winter Wonderland",
    blurb:
      "When the first snow falls, a curious tabby slips outside to find the garden turned to sugar.",
    mode: "living",
    gradient: "from-gold-100 via-cream-100 to-cream-50",
    accent: "gold",
    motif: "snowflake",
    pages: 28,
  },
  {
    id: "mochi",
    title: "Always Mochi",
    blurb:
      "A keepsake of a beloved corgi's favorite places, favorite people, and the warm spot on the kitchen floor.",
    mode: "memorial",
    gradient: "from-cream-200 via-cream-100 to-cream-50",
    accent: "gold",
    motif: "leaf",
    pages: 32,
  },
];

interface Props {
  // Tighter card density for wizard contexts where the parent column
  // is narrower (max-w-3xl). Default false renders the same way the
  // gallery does on a marketing surface.
  compact?: boolean;
  heading?: string;
  subheading?: string;
}

export default function ExampleBooksGallery({
  compact = false,
  heading = "What they look like",
  subheading = "A few sample covers in the StoryInk house style. Yours will star your own cast.",
}: Props) {
  return (
    <section
      className={compact ? "mt-2" : "mx-auto mt-12 w-full max-w-5xl sm:mt-16"}
    >
      <div className="border-b border-cream-300 pb-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900 sm:text-2xl">
          {heading}
        </h2>
        <p className="mt-0.5 text-sm text-ink-500">{subheading}</p>
      </div>

      <div
        className={`mt-5 grid gap-4 ${
          compact ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6"
        }`}
      >
        {SAMPLES.map((s) => (
          <SampleBookCard key={s.id} book={s} compact={compact} />
        ))}
      </div>
    </section>
  );
}

function SampleBookCard({
  book,
  compact,
}: {
  book: SampleBook;
  compact: boolean;
}) {
  const accentText = book.accent === "moss" ? "text-moss-900" : "text-gold-900";
  const titleSize = compact ? "text-lg" : "text-2xl";
  return (
    <article
      aria-label={`Sample storybook: ${book.title}`}
      className="flex flex-col overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-[0_1px_2px_rgba(14,26,43,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-gold-500 hover:shadow-[0_12px_32px_rgba(14,26,43,0.10)]"
    >
      <div
        className={`relative aspect-square overflow-hidden bg-gradient-to-br ${book.gradient}`}
      >
        {/* Subtle paper-grain overlay so the gradient doesn't read as
            flat color. */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, #000 0px, #000 1px, transparent 1px, transparent 8px)",
          }}
        />

        {/* "Sample" badge — same chip shape as BookCard's "N pages"
            indicator so the card reads as part of the product. */}
        <div className="absolute right-3 top-3 rounded-full border border-cream-300 bg-cream-50/95 px-2.5 py-1 text-[11px] font-medium text-ink-500 shadow-sm">
          Sample
        </div>

        {/* Memorial eyebrow — only on memorial-mode samples. Sets the
            emotional register before the title lands. */}
        {book.mode === "memorial" && (
          <div className="absolute left-1/2 top-7 -translate-x-1/2 text-[10px] font-medium uppercase tracking-[0.3em] text-gold-900/80">
            In loving memory
          </div>
        )}

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-5 text-center">
          <Motif kind={book.motif} accent={book.accent} />
          <h3
            className={`font-[family-name:var(--font-display)] font-semibold leading-tight tracking-tight ${accentText} ${titleSize}`}
          >
            {book.title}
          </h3>
        </div>

        {/* Gold rule + "StoryInk" imprint mark — the publisher touch
            that lifts the card above placeholder-feel. */}
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
          <span className="block h-px w-10 bg-gold-500" />
          <span className="font-[family-name:var(--font-display)] text-[10px] font-medium uppercase tracking-[0.3em] text-ink-500">
            StoryInk
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <h4
          className={`font-[family-name:var(--font-display)] font-semibold text-ink-900 line-clamp-1 ${
            compact ? "text-base" : "text-lg"
          }`}
        >
          {book.title}
        </h4>
        <p className="text-sm text-ink-500 line-clamp-2">{book.blurb}</p>
        <span className="mt-auto pt-2 text-xs text-ink-300">
          {book.pages} pages &middot;{" "}
          {book.mode === "memorial" ? "Memorial" : "Living adventure"}
        </span>
      </div>
    </article>
  );
}

function Motif({
  kind,
  accent,
}: {
  kind: SampleBook["motif"];
  accent: SampleBook["accent"];
}): ReactNode {
  const colorClass = accent === "moss" ? "text-moss-700" : "text-gold-700";
  const common = `h-9 w-9 ${colorClass}`;

  if (kind === "paw") {
    return (
      <svg
        viewBox="0 0 32 32"
        fill="currentColor"
        aria-hidden="true"
        className={common}
      >
        <ellipse cx="16" cy="22" rx="6.5" ry="5" />
        <circle cx="7.5" cy="13" r="3" />
        <circle cx="24.5" cy="13" r="3" />
        <circle cx="11.5" cy="7" r="2.5" />
        <circle cx="20.5" cy="7" r="2.5" />
      </svg>
    );
  }
  if (kind === "snowflake") {
    return (
      <svg
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        aria-hidden="true"
        className={common}
      >
        <line x1="16" y1="3" x2="16" y2="29" />
        <line x1="3" y1="16" x2="29" y2="16" />
        <line x1="6" y1="6" x2="26" y2="26" />
        <line x1="26" y1="6" x2="6" y2="26" />
        <path d="M13 5 L16 8 L19 5" />
        <path d="M13 27 L16 24 L19 27" />
        <path d="M5 13 L8 16 L5 19" />
        <path d="M27 13 L24 16 L27 19" />
      </svg>
    );
  }
  // leaf
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden="true"
      className={common}
    >
      <path d="M24 4c-9 0-16 7-16 16 0 3 1 5 2 7 8-1 14-7 14-16 0-3 0-5 0-7Z" />
      <path
        d="M10 22 C 13 18, 17 14, 22 10"
        stroke="#fffaf2"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  );
}
