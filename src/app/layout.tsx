import type { Metadata } from "next";
import Link from "next/link";
import { Nunito, Playfair_Display } from "next/font/google";
import Navbar from "@/components/Navbar";
import BetaBanner from "@/components/BetaBanner";
import SentryInit from "@/components/SentryInit";
import { GOOGLE_FONTS_HREF } from "@/lib/fonts";
import "./globals.css";

// Nunito stays for body — friendly enough for the kid-facing reading
// surfaces (Read mode), readable enough for grieving copy. Display
// face is Playfair Display, the standard premium-editorial serif —
// classic letterforms (clean f and j with no quirky stylistic-set
// alternates), used by Vogue / NYT-style mastheads, instantly reads
// "fine print" without surprising the reader.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "StoryInk — The fine art of pet storytelling",
  description:
    "Hand-illustrated keepsake storybooks starring your pet. Living adventures and Rainbow Bridge memorials, printed as museum-grade hardcovers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${playfair.variable} h-full`}
    >
      <head>
        {/* Google Fonts CDN. Single CSS import covering all 50
            families in src/lib/fonts.ts at weights 400 + 700. Font
            binaries only download when actually rendered — the cost
            of importing this on every page is just the small CSS
            file (cached aggressively by the browser). preconnect
            shaves ~100ms off first-paint of any used font. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      </head>
      <body className="min-h-full bg-cream-100 font-[family-name:var(--font-nunito)] text-ink-700 antialiased">
        <SentryInit />
        <Navbar />
        <main className="pt-16">
          <BetaBanner />
          {children}
        </main>
        <footer className="border-t border-cream-300 bg-cream-50 px-4 py-6 text-xs text-ink-500 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <span>&copy; {new Date().getFullYear()} StoryInk</span>
            <Link href="/privacy" className="hover:text-moss-700">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-moss-700">
              Terms
            </Link>
            <Link href="/help" className="hover:text-moss-700">
              Help
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
