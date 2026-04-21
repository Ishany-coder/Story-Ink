"use client";

import Link from "next/link";
import Image from "next/image";

// Read-only card used by /ship and /listen. Unlike BookCard, this one has no
// delete action and takes the destination href so the same component can
// drive different contexts (ship / narrate) without duplicating layout.

interface Props {
  id: string;
  title: string;
  prompt: string;
  coverImage: string | null;
  pageCount: number;
  createdAt: string;
  href: string;
  // Optional accent label shown in the corner (e.g. "Ship" or "Listen").
  // Inherits the card's gradient so it reads as part of the visual.
  badge?: string;
}

const CARD_COLORS = [
  "from-purple-100 to-pink-100",
  "from-blue-100 to-cyan-100",
  "from-orange-100 to-yellow-100",
  "from-green-100 to-teal-100",
  "from-pink-100 to-rose-100",
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

  // Deterministic color pick so the same story always renders with the
  // same background when it has no cover image.
  const colorIdx =
    Math.abs(
      title.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
    ) % CARD_COLORS.length;

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-3xl border-3 border-purple-200 bg-white shadow-md transition-all hover:-translate-y-2 hover:shadow-xl hover:shadow-purple-200/50"
    >
      <div className="relative aspect-square overflow-hidden">
        {coverImage ? (
          <Image
            src={coverImage}
            alt={title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-110"
            unoptimized
          />
        ) : (
          <div
            className={`flex h-full items-center justify-center bg-gradient-to-br ${CARD_COLORS[colorIdx]}`}
          >
            <span className="text-7xl">&#128214;</span>
          </div>
        )}
        <div className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-purple-600 shadow-sm">
          {pageCount} pages
        </div>
        {badge && (
          <div className="absolute left-3 top-3 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-sm">
            {badge}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-5">
        <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-purple-700 line-clamp-1">
          {title}
        </h3>
        <p className="text-sm font-medium text-purple-300 line-clamp-2">
          {prompt}
        </p>
        <span className="mt-auto pt-2 text-xs font-bold text-purple-200">
          {date}
        </span>
      </div>
    </Link>
  );
}
