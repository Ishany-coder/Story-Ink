import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BlogPostBody from "@/components/BlogPostBody";
import {
  getPostBySlug,
  getRelatedPosts,
  POSTS,
  type BlogPost,
} from "@/content/blog";

// Per-post page. Server component — there is no client-side state, all
// content is compile-time. Next.js 16 hands params/searchParams as a
// Promise, so each handler awaits it before use.

const SITE_BASE_URL = (
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://storyink.ai"
).replace(/\/$/, "");

// Pre-render every slug at build time so the route is static.
export async function generateStaticParams(): Promise<
  Array<{ slug: string }>
> {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) {
    return {
      title: "Not found — StoryInk Blog",
      description: "This post could not be found.",
    };
  }
  const ogImage = post.ogImage ?? "/og.png";
  const canonical = `${SITE_BASE_URL}/blog/${post.slug}`;
  return {
    title: `${post.title} — StoryInk Blog`,
    description: post.excerpt,
    alternates: { canonical },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url: canonical,
      type: "article",
      publishedTime: post.publishedAt,
      authors: [post.author],
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
      images: [ogImage],
    },
  };
}

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function buildJsonLd(post: BlogPost): string {
  const url = `${SITE_BASE_URL}/blog/${post.slug}`;
  const ogImage = post.ogImage
    ? new URL(post.ogImage, SITE_BASE_URL).toString()
    : `${SITE_BASE_URL}/og.png`;
  const data = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    author: { "@type": "Organization", name: post.author },
    publisher: {
      "@type": "Organization",
      name: "StoryInk",
      logo: { "@type": "ImageObject", url: `${SITE_BASE_URL}/og.png` },
    },
    image: [ogImage],
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
  } as const;
  // The result lives inside a <script type="application/ld+json"> tag so
  // standard JSON serialization is fine — but we still strip the
  // closing-tag sequence in case any field ever contains "</" which
  // would break the embedded script. Defense in depth, cheap.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();
  const related = getRelatedPosts(post.slug, 3);
  const jsonLd = buildJsonLd(post);

  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 text-ink-700">
      {/* JSON-LD for search engines. Inlined per Google's recommendation
          (the structured-data testing tool reads them straight off
          the rendered HTML). dangerouslySetInnerHTML is safe here
          because the payload is fully under our control + escaped. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />

      <Link
        href="/blog"
        className="text-sm font-medium text-ink-300 hover:text-moss-700"
      >
        &larr; Back to blog
      </Link>

      <header className="mt-4">
        <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-ink-500">
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
          <span aria-hidden="true">&middot;</span>
          <span>{post.readMinutes} min read</span>
          <span aria-hidden="true">&middot;</span>
          <span>{post.author}</span>
        </div>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-5xl">
          {post.title}
        </h1>
        <p className="mt-4 text-lg leading-7 text-ink-500">{post.excerpt}</p>
      </header>

      <hr className="my-8 border-cream-300" />

      <BlogPostBody blocks={post.body} />

      {/* Footer CTA */}
      <section className="mt-12 rounded-2xl border border-cream-300 bg-cream-50 px-5 py-6 sm:px-6 sm:py-7">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-ink-900">
          Make your own story
        </h2>
        <p className="mt-2 text-sm text-ink-500">
          Hand-illustrated keepsake storybooks starring your pet. Living
          adventures and memorial volumes, printed as real hardcovers.
        </p>
        <Link
          href="/create"
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-moss-700 px-4 py-2 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
        >
          Start a story &rarr;
        </Link>
      </section>

      {/* Related posts */}
      {related.length > 0 ? (
        <section className="mt-12">
          <h2 className="font-[family-name:var(--font-display)] text-xs font-medium uppercase tracking-[0.3em] text-moss-700">
            Keep reading
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/blog/${r.slug}`}
                  className="group flex h-full flex-col rounded-2xl border border-cream-300 bg-cream-50 p-4 transition-colors hover:border-cream-400 hover:bg-cream-100"
                >
                  <span className="text-[11px] uppercase tracking-wider text-ink-500">
                    {r.readMinutes} min read
                  </span>
                  <span className="mt-1 font-[family-name:var(--font-display)] text-base font-semibold text-ink-900 group-hover:text-moss-700">
                    {r.title}
                  </span>
                  <span className="mt-2 line-clamp-3 text-xs text-ink-500">
                    {r.excerpt}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
