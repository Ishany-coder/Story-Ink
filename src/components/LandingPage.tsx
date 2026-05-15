import Link from "next/link";
import { isBetaTesting } from "@/lib/beta-flag";

// Full signed-out landing page. Leads with value and emotion — pricing
// is deferred to the bottom CTA so visitors understand the product
// before they see what it costs.
//
// Visual language: restrained, no decorative emoji, Legacy palette
// (cream / ink / moss / gold). Mirrors the conventions in HeroSection.tsx.

export default function LandingPage() {
  return (
    <div className="w-full">
      <LandingHero />
      <SampleBooksSection />
      <HowItWorksSection />
      <TestimonialsSection />
      <MemorialSection />
      <FAQSection />
      <FinalCTASection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function LandingHero() {
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center gap-8 px-4 pb-16 pt-20 text-center sm:px-6 lg:px-8">
      {/* Brand kicker */}
      <div className="flex flex-col items-center gap-2">
        <span className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
          The fine art of pet storytelling
        </span>
        <span className="block h-px w-12 bg-gold-500" />
      </div>

      {/* Headline */}
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
        Storybooks{" "}
        <em className="font-normal italic text-moss-700">starring your pet.</em>
      </h1>

      {/* Value prop — emotional hook first, pricing deferred to footer CTA */}
      <p className="max-w-xl text-base leading-relaxed text-ink-500 sm:text-lg">
        Upload your pet&rsquo;s photos and our AI crafts a fully illustrated
        storybook built around them — a living adventure or a Rainbow Bridge
        memorial you can hold forever.
      </p>

      {/* CTAs */}
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/login"
          className="rounded-full bg-moss-700 px-8 py-3 text-base font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
        >
          Create your first story
        </Link>
        <a
          href="#how-it-works"
          className="rounded-full border border-cream-300 bg-cream-50 px-8 py-3 text-base font-semibold text-ink-700 transition-colors hover:border-gold-500 hover:text-ink-900"
        >
          See how it works
        </a>
      </div>

      <p className="text-xs text-ink-300">
        Free to generate &mdash; no credit card required.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sample books — CSS-illustrated covers showing the product aesthetic
// ---------------------------------------------------------------------------

function SampleBooksSection() {
  const samples = [
    {
      title: "Max\u2019s Great Park Adventure",
      subtitle: "A golden retriever\u2019s day off",
      gradient: "from-gold-100 via-cream-100 to-moss-100",
      badge: "Living story",
      badgeClass: "bg-moss-100 text-moss-700",
      accentClass: "text-moss-700",
      illustration: <DogSilhouette />,
    },
    {
      title: "In Loving Memory of Luna",
      subtitle: "A tribute across the Rainbow Bridge",
      gradient: "from-indigo-200/50 via-cream-100 to-gold-100/40",
      badge: "Memorial",
      badgeClass: "bg-gold-100 text-gold-900",
      accentClass: "text-indigo-500",
      illustration: <StarConstellation />,
    },
    {
      title: "Mochi the Brave",
      subtitle: "A tiny cat who ruled the world",
      gradient: "from-rose-500/10 via-cream-100 to-gold-100/20",
      badge: "Living story",
      badgeClass: "bg-moss-100 text-moss-700",
      accentClass: "text-rose-500",
      illustration: <CatSilhouette />,
    },
  ];

  return (
    <section className="border-y border-cream-300 bg-cream-50 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <p className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
            Sample stories
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Every pet has a story worth telling
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-ink-500">
            From backyard adventures to heartfelt memorials, each book is
            uniquely illustrated to match your pet&rsquo;s personality.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {samples.map((s) => (
            <div
              key={s.title}
              className="overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-[0_1px_2px_rgba(14,26,43,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-gold-500 hover:shadow-[0_12px_32px_rgba(14,26,43,0.10)]"
            >
              {/* Illustrated cover */}
              <div
                className={`relative flex h-56 flex-col items-center justify-center overflow-hidden bg-gradient-to-br ${s.gradient} p-6`}
              >
                {/* Background illustration (subtle, decorative) */}
                <div className="absolute inset-0 flex items-center justify-center opacity-15">
                  {s.illustration}
                </div>

                {/* Cover text */}
                <div className="relative z-10 text-center">
                  <span
                    className={`mb-3 inline-block rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.15em] ${s.badgeClass}`}
                  >
                    {s.badge}
                  </span>
                  <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold leading-snug text-ink-900">
                    {s.title}
                  </h3>
                  <p className={`mt-1.5 text-xs font-medium ${s.accentClass}`}>
                    {s.subtitle}
                  </p>
                </div>
              </div>

              {/* Card footer */}
              <div className="flex items-center gap-2 border-t border-cream-300 px-4 py-3">
                <span className="h-1.5 w-1.5 rounded-full bg-gold-500" />
                <span className="text-xs text-ink-300">
                  AI-illustrated &middot; 24 pages
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How it works — 4-step flow
// ---------------------------------------------------------------------------

function HowItWorksSection() {
  const steps = [
    {
      num: "01",
      title: "Upload your pet\u2019s photos",
      body: "Add a few clear shots — the AI uses them to keep your pet\u2019s look consistent across every illustrated page.",
    },
    {
      num: "02",
      title: "Describe the story",
      body: "Choose a style and type a sentence or two, or pick from one of our ready-made starter ideas.",
    },
    {
      num: "03",
      title: "AI writes and illustrates",
      body: "Each page is written and illustrated to match your pet\u2019s likeness and personality. Takes about two minutes.",
    },
    {
      num: "04",
      title: "Read, edit, and print",
      body: "Read online, fine-tune any page in the Studio, then order a museum-grade hardcover keepsake.",
    },
  ];

  return (
    <section
      id="how-it-works"
      className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8"
    >
      <div className="mb-14 text-center">
        <p className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
          The process
        </p>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          How it works
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => (
          <div key={step.num} className="flex flex-col gap-4">
            <span className="font-[family-name:var(--font-display)] text-3xl font-semibold text-gold-300">
              {step.num}
            </span>
            <div className="h-px w-8 bg-gold-300" />
            <h3 className="text-base font-semibold text-ink-900">
              {step.title}
            </h3>
            <p className="text-sm leading-relaxed text-ink-500">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Testimonials — social proof
// ---------------------------------------------------------------------------

const TESTIMONIALS = [
  {
    quote:
      "I ordered a memorial book for our dog Charlie the week after he passed. Holding that hardcover — seeing his face on every page — made me cry the good kind of tears. Worth every penny.",
    name: "Sarah M.",
    detail: "Goldendoodle mom, Austin TX",
  },
  {
    quote:
      "I was skeptical an AI could capture Pepper\u2019s personality, but the illustrations looked just like her. My kids read it every night. We\u2019re on our third story now.",
    name: "James T.",
    detail: "Beagle dad, Portland OR",
  },
  {
    quote:
      "The memorial mode prompt was so thoughtful. It didn\u2019t feel generic at all — it felt like they knew Luna. I\u2019ve given copies to family members as gifts.",
    name: "Priya K.",
    detail: "Cat mom, Chicago IL",
  },
];

function TestimonialsSection() {
  return (
    <section className="border-y border-cream-300 bg-cream-50 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <p className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
            Stories from our readers
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            They made a book. Then another.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure
              key={t.name}
              className="flex flex-col gap-4 rounded-2xl border border-cream-300 bg-cream-100 p-6"
            >
              {/* Opening quote mark */}
              <span
                className="font-[family-name:var(--font-display)] text-4xl leading-none text-gold-300"
                aria-hidden="true"
              >
                &ldquo;
              </span>
              <blockquote className="flex-1 text-sm leading-relaxed text-ink-700">
                {t.quote}
              </blockquote>
              <figcaption>
                <p className="text-sm font-semibold text-ink-900">{t.name}</p>
                <p className="text-xs text-ink-400">{t.detail}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Memorial mode callout
// ---------------------------------------------------------------------------

function MemorialSection() {
  return (
    <section className="bg-gradient-to-br from-indigo-200/20 via-cream-100 to-gold-100/20 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <span className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-indigo-500">
          Memorial mode
        </span>
        <span className="mx-auto mt-3 block h-px w-12 bg-gold-500" />
        <h2 className="mt-6 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          For the ones who crossed{" "}
          <em className="font-normal italic text-indigo-500">
            the Rainbow Bridge.
          </em>
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-ink-500">
          Memorial mode creates a tender tribute — a storybook that celebrates
          who they were, the joy they brought, and the love that doesn&rsquo;t
          end. Printed as a hardcover you can hold, share, and keep forever.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="rounded-full bg-ink-900 px-7 py-3 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
          >
            Create a memorial book
          </Link>
          <Link
            href="/blog/memorializing-a-pet"
            className="text-sm font-medium text-ink-500 underline-offset-2 hover:text-moss-700 hover:underline"
          >
            Read our pet memorial guide
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

const FAQ_ITEMS = [
  {
    q: "Is it really free to try?",
    a: "Yes — your first story generation is free. No credit card needed to create and read online. Downloading the PDF or ordering a printed hardcover keepsake is a paid option.",
  },
  {
    q: "What is memorial mode?",
    a: "Memorial mode creates a gentle tribute for a pet who has passed. The AI uses a tender, celebratory tone — no peril, no sadness. You choose between a recollection style (favorite memories) or a Rainbow Bridge narrative.",
  },
  {
    q: "How realistic are the illustrations?",
    a: "The AI uses your pet\u2019s reference photos to keep their appearance consistent across every page — same coloring, markings, and character. The style is warm and illustrated, designed to feel like a premium picture book.",
  },
  {
    q: "Can I edit the story after it\u2019s generated?",
    a: "Yes. The Studio lets you drag, resize, and re-style every text and image layer on each page. You can also ask the AI assistant to rewrite any passage or regenerate any illustration.",
  },
  {
    q: "How long does printing take?",
    a: "Print orders are fulfilled within 5\u20137 business days plus shipping. We use museum-grade hardcover binding — the same quality you\u2019d expect from a fine-art photo book.",
  },
  {
    q: "What pets work best?",
    a: "Dogs and cats are the most common, but the AI works with any pet\u2014rabbits, birds, horses, and more. Clear, well-lit reference photos produce the most consistent illustrations.",
  },
];

function FAQSection() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="mb-12 text-center">
        <p className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
          Questions
        </p>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          Frequently asked
        </h2>
      </div>

      <dl className="divide-y divide-cream-300">
        {FAQ_ITEMS.map((item) => (
          <div key={item.q} className="py-6">
            <dt className="text-base font-semibold text-ink-900">{item.q}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-ink-500">
              {item.a}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Final CTA
// ---------------------------------------------------------------------------

function FinalCTASection() {
  const beta = isBetaTesting();
  return (
    <section className="border-t border-cream-300 bg-cream-50 px-4 py-20 text-center sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl">
        <span className="mx-auto mb-6 block h-px w-12 bg-gold-500" />
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          Ready to tell their story?
        </h2>
        <p className="mt-4 text-base leading-relaxed text-ink-500">
          Your first story is free. Upload your pet&rsquo;s photos and have a
          fully illustrated book in about two minutes.
        </p>
        <Link
          href="/login"
          className="mt-8 inline-block rounded-full bg-moss-700 px-8 py-3 text-base font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
        >
          Get started &mdash; it&rsquo;s free
        </Link>
        {!beta && (
          <p className="mt-3 text-xs text-ink-300">
            Read online or download for $9.99. Hardcover keepsakes from $34.99.
          </p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG illustrations for sample book covers
// ---------------------------------------------------------------------------

// Simple dog silhouette — used as a large faint watermark on the cover card
function DogSilhouette() {
  return (
    <svg
      viewBox="0 0 120 100"
      fill="currentColor"
      className="h-40 w-48 text-ink-700"
      aria-hidden="true"
    >
      {/* Body */}
      <ellipse cx="58" cy="62" rx="30" ry="22" />
      {/* Head */}
      <circle cx="90" cy="42" r="18" />
      {/* Snout */}
      <ellipse cx="104" cy="48" rx="9" ry="7" />
      {/* Ear */}
      <ellipse
        cx="84"
        cy="28"
        rx="9"
        ry="14"
        transform="rotate(-20 84 28)"
      />
      {/* Tail */}
      <path d="M28 55 Q12 40 16 26 Q20 14 28 20 Q22 32 28 46 Z" />
      {/* Front leg */}
      <rect x="74" y="80" width="9" height="20" rx="4" />
      <rect x="62" y="80" width="9" height="20" rx="4" />
      {/* Back leg */}
      <rect x="44" y="80" width="9" height="20" rx="4" />
      <rect x="32" y="80" width="9" height="20" rx="4" />
    </svg>
  );
}

// Star constellation — used as watermark on memorial cover card
function StarConstellation() {
  return (
    <svg
      viewBox="0 0 120 100"
      fill="currentColor"
      className="h-40 w-48 text-ink-700"
      aria-hidden="true"
    >
      {/* Stars of varying size */}
      <circle cx="60" cy="20" r="5" />
      <circle cx="85" cy="38" r="3" />
      <circle cx="75" cy="62" r="4" />
      <circle cx="45" cy="70" r="3" />
      <circle cx="30" cy="45" r="4" />
      <circle cx="50" cy="30" r="2.5" />
      <circle cx="95" cy="65" r="2" />
      <circle cx="20" cy="65" r="2.5" />
      {/* Constellation lines */}
      <line
        x1="60"
        y1="20"
        x2="85"
        y2="38"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      <line
        x1="85"
        y1="38"
        x2="75"
        y2="62"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      <line
        x1="75"
        y1="62"
        x2="45"
        y2="70"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      <line
        x1="45"
        y1="70"
        x2="30"
        y2="45"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      <line
        x1="30"
        y1="45"
        x2="60"
        y2="20"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
    </svg>
  );
}

// Simple cat silhouette — used as watermark on cat story cover card
function CatSilhouette() {
  return (
    <svg
      viewBox="0 0 120 100"
      fill="currentColor"
      className="h-40 w-48 text-ink-700"
      aria-hidden="true"
    >
      {/* Body */}
      <ellipse cx="58" cy="68" rx="26" ry="20" />
      {/* Head */}
      <circle cx="82" cy="44" r="16" />
      {/* Left ear */}
      <polygon points="70,32 66,14 80,28" />
      {/* Right ear */}
      <polygon points="88,28 96,14 98,30" />
      {/* Snout */}
      <ellipse cx="92" cy="50" rx="7" ry="5" />
      {/* Tail — curled */}
      <path
        d="M32 70 Q14 65 12 50 Q10 36 22 34 Q18 44 22 54 Q28 62 38 66 Z"
      />
      {/* Front paws */}
      <ellipse cx="74" cy="88" rx="8" ry="5" />
      <ellipse cx="60" cy="88" rx="8" ry="5" />
    </svg>
  );
}
