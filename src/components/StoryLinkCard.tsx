"use client";

import Link from "next/link";
import Image from "next/image";

// Read-only card used by /ship. Same visual language as BookCard but
// without the delete affordance, and accepting a destination href so
// the same component can drive different read-only contexts.

interface Props {
  id: string;
  title: string;
  prompt: string;
  coverImage: string | null;
  pageCount: number;
  createdAt: string;
  href: string;
  // Optional accent label shown in the corner (e.g. "Ship").
  badge?: string;
}

const FALLBACK_GRADIENTS = [
  "from-cream-200 via-cream-100 to-cream-50",
  "from-moss-100 via-cream-100 to-cream-50",
  "from-gold-100 via-cream-100 to-cream-50",
  "from-cream-300 via-cream-200 to-cream-100",
  "from-moss-200/40 via-cream-100 to-cream-50",
];

export default function StoryLinkCard({
  title,
  prompt,
  coverImage,
  pageCount,
  createdAt,
  href,
  badge,
}: Props) {
  const date = new Date(createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const colorIdx =
    Math.abs(title.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)) %
    FALLBACK_GRADIENTS.length;

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-[0_1px_2px_rgba(14,26,43,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-gold-500 hover:shadow-[0_12px_32px_rgba(14,26,43,0.10)]"
    >
      <div className="relative aspect-square overflow-hidden bg-cream-200">
        {coverImage ? (
          <Image
            src={coverImage}
            alt={title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            unoptimized
          />
        ) : (
          <div
            className={`h-full w-full bg-gradient-to-br ${FALLBACK_GRADIENTS[colorIdx]}`}
          />
        )}
        <div className="absolute right-3 top-3 rounded-full border border-cream-300 bg-cream-50/95 px-2.5 py-1 text-[11px] font-medium text-ink-500 shadow-sm">
          {pageCount} pages
        </div>
        {badge && (
          <div className="absolute left-3 top-3 rounded-full bg-moss-700 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-cream-50 shadow-sm">
            {badge}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink-900 line-clamp-1">
          {title}
        </h3>
        <p className="text-sm text-ink-500 line-clamp-2">{prompt}</p>
        <span className="mt-auto pt-2 text-xs text-ink-300">{date}</span>
      </div>
    </Link>
  );
}
