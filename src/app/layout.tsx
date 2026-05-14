import type { Metadata } from "next";
import Link from "next/link";
import { Nunito, Playfair_Display } from "next/font/google";
import Navbar from "@/components/Navbar";
import BetaBanner from "@/components/BetaBanner";
import SentryInit from "@/components/SentryInit";
import CookieConsent from "@/components/CookieConsent";
import CookieSettingsLink from "@/components/CookieSettingsLink";
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

// Centralised site descriptors so the same strings populate <title>,
// description, Open Graph, and Twitter cards without drift.
//
// NOTE: /og.png, /favicon.ico, and /apple-touch-icon.png are
// REFERENCED here but the bitmap assets don't yet live in public/.
// Drop the designed PNGs into that folder before launch; the routes
// will just 404 until then. See the commit body for the asset list.
const SITE_NAME = "StoryInk";
const SITE_TITLE = "StoryInk — The fine art of pet storytelling";
const SITE_DESCRIPTION =
  "Hand-illustrated keepsake storybooks starring your pet. Living adventures and Rainbow Bridge memorials, printed as museum-grade hardcovers.";
const SITE_BASE_URL = (
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://storyink.ai"
).replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_BASE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  // TODO(launch): drop the designed bitmaps into /public — see the
  // commit body. Until then these URLs 404, which is harmless.
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_BASE_URL,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
  },
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
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-4">
            {/* Popular posts. Sitewide internal-link surface — every
                non-blog page becomes a tiny inbound link to the three
                highest-value posts. Kept compact (no heading,
                middle-dot separator) so it reads as a footer aside,
                not a navigation block. */}
            <nav
              aria-label="Popular posts"
              className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] uppercase tracking-[0.18em] text-ink-300"
            >
              <span className="text-ink-300">Popular posts</span>
              <Link
                href="/blog/memorializing-a-pet"
                className="text-ink-500 hover:text-moss-700"
              >
                Pet memorial book guide
              </Link>
              <span aria-hidden="true">&middot;</span>
              <Link
                href="/blog/how-to-write-a-great-prompt"
                className="text-ink-500 hover:text-moss-700"
              >
                Writing prompts
              </Link>
              <span aria-hidden="true">&middot;</span>
              <Link
                href="/blog/science-of-pet-reference-photos"
                className="text-ink-500 hover:text-moss-700"
              >
                Reference photo guide
              </Link>
            </nav>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              <span>&copy; {new Date().getFullYear()} StoryInk</span>
              <Link href="/blog" className="hover:text-moss-700">
                Blog
              </Link>
              <Link href="/privacy" className="hover:text-moss-700">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-moss-700">
                Terms
              </Link>
              <Link href="/help" className="hover:text-moss-700">
                Help
              </Link>
              <CookieSettingsLink />
            </div>
          </div>
        </footer>
        <CookieConsent />
      </body>
    </html>
  );
}
