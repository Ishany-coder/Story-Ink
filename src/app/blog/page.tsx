import type { Metadata } from "next";
import Link from "next/link";
import { POSTS } from "@/content/blog";

// Public-facing blog listing. Pure server component — the post list is
// a compile-time constant (see src/content/blog/index.ts) so there is
// nothing to fetch at request time. Posts are already sorted newest-
// first by the registry.

export const metadata: Metadata = {
  title: "Blog — StoryInk",
  description:
    "Notes from the team on pet storytelling, the craft of personalized children's books, and how StoryInk works under the hood.",
  openGraph: {
    title: "Blog — StoryInk",
    description:
      "Notes from the team on pet storytelling, the craft of personalized children's books, and how StoryInk works under the hood.",
    type: "website",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog — StoryInk",
    description:
      "Notes from the team on pet storytelling, the craft of personalized children's books, and how StoryInk works under the hood.",
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

export default function BlogIndexPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 text-ink-700">
      <header className="text-center">
        <span className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
          StoryInk Journal
        </span>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
          Blog
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-ink-500">
          Notes from the team on pet storytelling, the craft of personalized
          children&rsquo;s books, and how StoryInk works under the hood.
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
