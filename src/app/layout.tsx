import type { Metadata } from "next";
import { Nunito, Fredoka } from "next/font/google";
import Navbar from "@/components/Navbar";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StoryInk — Make Your Own Storybooks!",
  description:
    "Create amazing illustrated storybooks with AI! Just describe your adventure and watch the magic happen.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${nunito.variable} ${fredoka.variable} h-full`}>
      <body className="min-h-full bg-[#fffbf5] font-[family-name:var(--font-nunito)] text-[#2d1b69] antialiased">
        <Navbar />
        <main className="pt-16">{children}</main>
      </body>
    </html>
  );
}
