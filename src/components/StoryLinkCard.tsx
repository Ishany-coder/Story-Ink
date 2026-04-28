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
  "from-purple-100 via-purple-50 to-pink-100",
  "from-sky-100 via-blue-50 to-indigo-100",
  "from-amber-100 via-orange-50 to-rose-100",
  "from-emerald-100 via-teal-50 to-cyan-100",
  "from-pink-100 via-rose-50 to-fuchsia-100",
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
      className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-stone-300 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)]"
    >
      <div className="relative aspect-square overflow-hidden bg-stone-100">
        {coverImage ? (
          <Image
            src={coverImage}
            alt={title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            unoptimized
          />
        ) : (
          <div
            className={`h-full w-full bg-gradient-to-br ${FALLBACK_GRADIENTS[colorIdx]}`}
          />
        )}
        <div className="absolute right-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
          {pageCount} pages
        </div>
        {badge && (
          <div className="absolute left-3 top-3 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white shadow-sm">
            {badge}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900 line-clamp-1">
          {title}
        </h3>
        <p className="text-sm text-slate-500 line-clamp-2">{prompt}</p>
        <span className="mt-auto pt-2 text-xs text-slate-400">{date}</span>
      </div>
    </Link>
  );
}
