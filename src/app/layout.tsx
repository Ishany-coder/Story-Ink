import type { Metadata } from "next";
import { Nunito, Fraunces } from "next/font/google";
import Navbar from "@/components/Navbar";
import { GOOGLE_FONTS_HREF } from "@/lib/fonts";
import "./globals.css";

// Nunito stays for body — friendly enough for the kid-facing reading
// surfaces (Read mode), readable enough for grieving copy. Fraunces
// is the new display face: a variable optical-size editorial serif
// that gives the brand an "art book / fine-print" feel rather than
// "kids' app."
//
// next/font/google requires either weight (for static cuts) OR axes
// (for variable cuts), but not both, and only Google-Fonts-exposed
// axes are accepted. Fraunces' wght is the default variable axis;
// listing it explicitly via `axes` is enough to get the full range.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
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
      className={`${nunito.variable} ${fraunces.variable} h-full`}
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
        <Navbar />
        <main className="pt-16">{children}</main>
      </body>
    </html>
  );
}
