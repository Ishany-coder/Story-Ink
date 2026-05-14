import type { Metadata } from "next";
import Link from "next/link";
import { POSTS } from "@/content/blog";

// Public-facing blog listing. Pure server component — the post list is
// a compile-time constant (see src/content/blog/index.ts) so there is
// nothing to fetch at request time. Posts are already sorted newest-
// first by the registry.

const SITE_BASE_URL = (
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://storyink.ai"
).replace(/\/$/, "");

const LISTING_DESCRIPTION =
  "Notes on personalized pet storybooks, AI illustration, and making a keepsake book about your dog or cat — from the StoryInk team.";

export const metadata: Metadata = {
  title: "StoryInk Journal — personalized pet storybooks & AI illustration",
  description: LISTING_DESCRIPTION,
  alternates: { canonical: `${SITE_BASE_URL}/blog` },
  openGraph: {
    title: "StoryInk Journal — personalized pet storybooks & AI illustration",
    description: LISTING_DESCRIPTION,
    type: "website",
    url: `${SITE_BASE_URL}/blog`,
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "StoryInk Journal — personalized pet storybooks & AI illustration",
    description: LISTING_DESCRIPTION,
    images: ["/og.png"],
  },
};

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

// JSON-LD for the listing page itself. The Blog node references every
// post by its canonical URL so Google can attribute them to the same
// publication; individual posts re-emit their own BlogPosting node on
// their slug page (no need to duplicate full bodies here).
function buildListingJsonLd(): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${SITE_BASE_URL}/blog`,
    name: "StoryInk Journal",
    description: LISTING_DESCRIPTION,
    url: `${SITE_BASE_URL}/blog`,
    inLanguage: "en-US",
    publisher: {
      "@type": "Organization",
      name: "StoryInk",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_BASE_URL}/og.png`,
      },
    },
    blogPost: POSTS.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `${SITE_BASE_URL}/blog/${p.slug}`,
      datePublished: p.publishedAt,
      description: p.metaDescription ?? p.excerpt,
    })),
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default function BlogIndexPage() {
  const jsonLd = buildListingJsonLd();
  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 text-ink-700">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />

      <header className="text-center">
        <span className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
          StoryInk Journal
        </span>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
          StoryInk Journal: notes on personalized pet storybooks
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-ink-500">
          Notes on personalized pet storybooks, AI illustration, and
          making a keepsake book about your dog or cat.
        </p>
      </header>

      <ul className="mt-12 space-y-8">
        {POSTS.map((post) => (
          <li key={post.slug}>
            <Link
              href={`/blog/${post.slug}`}
              className="group block rounded-2xl border border-cream-300 bg-cream-50 px-5 py-5 transition-colors hover:border-cream-400 hover:bg-cream-100 sm:px-6 sm:py-6"
            >
              <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-ink-500">
                <time dateTime={post.publishedAt}>
                  {formatDate(post.publishedAt)}
                </time>
                <span aria-hidden="true">&middot;</span>
                <span>{post.readMinutes} min read</span>
              </div>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-ink-900 transition-colors group-hover:text-moss-700 sm:text-3xl">
                {post.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink-500">
                {post.excerpt}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-moss-700 group-hover:text-moss-900">
                Read &rarr;
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
