"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b-4 border-yellow-300 bg-white/90 backdrop-blur-md shadow-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight"
        >
          <span className="text-purple-500">Story</span>
          <span className="text-pink-500">Ink</span>
          <span className="ml-1 inline-block animate-wiggle text-2xl">&#9997;&#65039;</span>
        </Link>
        <div className="flex gap-2">
          <Link
            href="/"
            className={`rounded-full px-5 py-2 text-sm font-bold transition-all ${
              pathname === "/"
                ? "bg-gradient-to-r from-purple-400 to-pink-400 text-white shadow-md shadow-purple-200"
                : "bg-purple-50 text-purple-400 hover:bg-purple-100 hover:text-purple-600"
            }`}
          >
            Create
          </Link>
          <Link
            href="/read"
            className={`rounded-full px-5 py-2 text-sm font-bold transition-all ${
              pathname.startsWith("/read")
                ? "bg-gradient-to-r from-purple-400 to-pink-400 text-white shadow-md shadow-purple-200"
                : "bg-purple-50 text-purple-400 hover:bg-purple-100 hover:text-purple-600"
            }`}
          >
            Read
          </Link>
          <Link
            href="/canvas"
            className={`rounded-full px-5 py-2 text-sm font-bold transition-all ${
              pathname.startsWith("/canvas")
                ? "bg-gradient-to-r from-purple-400 to-pink-400 text-white shadow-md shadow-purple-200"
                : "bg-purple-50 text-purple-400 hover:bg-purple-100 hover:text-purple-600"
            }`}
          >
            Studio
          </Link>
        </div>
      </div>
    </nav>
  );
}
