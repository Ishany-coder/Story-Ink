import Link from "next/link";
import type { ReactNode } from "react";
import type { BlogBlock } from "@/content/blog";

// Renders the structured block array of a blog post into typographic
// HTML. Kept deliberately small — there is no MDX, no rehype, no
// runtime markdown parser. Each block type maps to one tagged element
// with palette-aware classes.
//
// If a post needs a richer block type later (image, embedded video,
// callout) add a new case here and a new variant to BlogBlock — the
// content layer stays declarative.

// Lightweight inline-link parser. Recognises a single markdown-link
// form: `[anchor text](href)` where href is either an internal path
// (starts with "/") or an absolute https URL. No nesting, no other
// markdown — anything more than a flat link is overkill for the blog.
//
// Internal links render as Next <Link> so the client-side router
// picks them up. External links render as a plain anchor with
// `rel="noopener"` (no referrer-stripping — these are blog citations
// where keeping the referrer is fine).
const LINK_RE = /\[([^\]]+)\]\((\/[^)\s]*|https:\/\/[^)\s]+)\)/g;

function renderInline(text: string): ReactNode {
  // Fast path: no `[…](…)` at all. Avoids the regex split + array
  // construction for the overwhelming majority of paragraphs.
  if (!text.includes("](")) return text;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  // Fresh RegExp instance each call so `lastIndex` doesn't bleed across
  // renders. The shared module-level `LINK_RE` is a template — we use
  // `.matchAll`-style iteration via `exec` on a per-call copy.
  const re = new RegExp(LINK_RE.source, "g");
  while ((match = re.exec(text)) !== null) {
    const [whole, label, href] = match;
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }
    if (href.startsWith("/")) {
      nodes.push(
        <Link
          key={`${match.index}-${href}`}
          href={href}
          className="text-moss-700 underline decoration-moss-300 underline-offset-2 transition-colors hover:text-moss-900 hover:decoration-moss-700"
        >
          {label}
        </Link>,
      );
    } else {
      nodes.push(
        <a
          key={`${match.index}-${href}`}
          href={href}
          rel="noopener"
          className="text-moss-700 underline decoration-moss-300 underline-offset-2 transition-colors hover:text-moss-900 hover:decoration-moss-700"
        >
          {label}
        </a>,
      );
    }
    cursor = match.index + whole.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export default function BlogPostBody({ blocks }: { blocks: BlogBlock[] }) {
  return (
    <div className="space-y-6 text-base leading-relaxed text-ink-700">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading":
            return (
              <h2
                key={i}
                className="mt-10 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl"
              >
                {block.content}
              </h2>
            );
          case "paragraph":
            return (
              <p key={i} className="text-base leading-7 text-ink-700">
                {renderInline(block.content)}
              </p>
            );
          case "quote":
            return (
              <blockquote
                key={i}
                className="my-6 border-l-4 border-moss-300 bg-cream-50 px-5 py-3 font-[family-name:var(--font-display)] text-lg italic text-ink-700"
              >
                {renderInline(block.content)}
              </blockquote>
            );
          case "list":
            return (
              <ul
                key={i}
                className="ml-5 list-disc space-y-2 text-base leading-7 text-ink-700"
              >
                {block.content.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
