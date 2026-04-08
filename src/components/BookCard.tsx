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

const CARD_COLORS = [
  "from-purple-100 to-pink-100",
  "from-blue-100 to-cyan-100",
  "from-orange-100 to-yellow-100",
  "from-green-100 to-teal-100",
  "from-pink-100 to-rose-100",
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
    Math.abs(
      title.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
    ) % CARD_COLORS.length;

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
        className="flex flex-col overflow-hidden rounded-3xl border-3 border-purple-200 bg-white shadow-md transition-all hover:-translate-y-2 hover:shadow-xl hover:shadow-purple-200/50"
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

      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        aria-label={`Delete ${title}`}
        className="absolute left-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-rose-500 opacity-0 shadow-md transition-all hover:scale-110 hover:bg-rose-500 hover:text-white focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 group-hover:opacity-100"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
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
