"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface BookCardProps {
  id: string;
  title: string;
  prompt: string;
  coverImage: string | null;
  pageCount: number;
  createdAt: string;
}

// Soft fallback gradients for stories without a generated cover.
// Tonal pairs grounded in the Legacy palette — no purple/pink leftovers.
const FALLBACK_GRADIENTS = [
  "from-cream-200 via-cream-100 to-cream-50",
  "from-moss-100 via-cream-100 to-cream-50",
  "from-gold-100 via-cream-100 to-cream-50",
  "from-cream-300 via-cream-200 to-cream-100",
  "from-moss-200/40 via-cream-100 to-cream-50",
];

export default function BookCard({
  id,
  title,
  prompt,
  coverImage,
  pageCount,
  createdAt,
}: BookCardProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const date = new Date(createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const colorIdx =
    Math.abs(title.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)) %
    FALLBACK_GRADIENTS.length;

  async function handleDelete() {
    if (deleting) return;
    const ok = window.confirm(`Delete "${title}"? This can't be undone.`);
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/stories/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("Delete failed:", body);
        window.alert("Couldn't delete the story. Please try again.");
        setDeleting(false);
        return;
      }
      router.refresh();
    } catch (err) {
      console.error("Delete failed:", err);
      window.alert("Couldn't delete the story. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <div
      className={`group relative transition-opacity ${
        deleting ? "pointer-events-none opacity-50" : ""
      }`}
    >
      <Link
        href={`/read/${id}`}
        className="flex flex-col overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-[0_1px_2px_rgba(14,26,43,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-gold-500 hover:shadow-[0_12px_32px_rgba(14,26,43,0.10)]"
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
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4">
          <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink-900 line-clamp-1">
            {title}
          </h3>
          <p className="text-sm text-ink-500 line-clamp-2">{prompt}</p>
          <span className="mt-auto pt-2 text-xs text-ink-300">{date}</span>
        </div>
      </Link>

      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        aria-label={`Delete ${title}`}
        className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-cream-300 bg-cream-50/95 text-ink-500 opacity-0 shadow-sm transition-all hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 group-hover:opacity-100"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      </button>
    </div>
  );
}
