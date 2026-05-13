import type { MetadataRoute } from "next";
import { isBetaTesting } from "@/lib/beta-flag";

// Next.js 16 robots.txt. App Router serves this from /robots.txt.
//
// During closed beta we hard-disallow everything — crawlers should
// not be indexing an unfinished site. After launch, the static
// marketing routes + the public-stories sitemap are indexable; the
// API, admin, and order surfaces stay walled off.

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://storyink.ai"
  ).replace(/\/$/, "");

  if (isBetaTesting()) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
      sitemap: `${baseUrl}/sitemap.xml`,
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/help", "/privacy", "/terms", "/create", "/account", "/read/"],
        disallow: ["/api/", "/admin/", "/orders/", "/my-orders/", "/canvas/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
