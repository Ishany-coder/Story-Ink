import type { BlogBlock } from "@/content/blog";

// Renders the structured block array of a blog post into typographic
// HTML. Kept deliberately small — there is no MDX, no rehype, no
// runtime markdown parser. Each block type maps to one tagged element
// with palette-aware classes.
//
// If a post needs a richer block type later (image, embedded video,
// callout) add a new case here and a new variant to BlogBlock — the
// content layer stays declarative.

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
                {block.content}
              </p>
            );
          case "quote":
            return (
              <blockquote
                key={i}
                className="my-6 border-l-4 border-moss-300 bg-cream-50 px-5 py-3 font-[family-name:var(--font-display)] text-lg italic text-ink-700"
              >
                {block.content}
              </blockquote>
            );
          case "list":
            return (
              <ul
                key={i}
                className="ml-5 list-disc space-y-2 text-base leading-7 text-ink-700"
              >
                {block.content.map((item, j) => (
                  <li key={j}>{item}</li>
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
