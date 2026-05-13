import type { MetadataRoute } from "next";
import { supabaseAdmin } from "@/lib/supabase";
import { isBetaTesting } from "@/lib/beta-flag";
import { POSTS } from "@/content/blog";

// Next.js 16 sitemap. App Router picks this up automatically and serves
// it at /sitemap.xml. Keep it dynamic — the public-stories list grows
// as users mark their books shareable.
//
// During closed beta we return an empty sitemap: no SEO surface should
// expose the unfinished site to crawlers until the public-launch
// switch is flipped.

export const revalidate = 3600;

interface PublicStoryRow {
  id: string;
  created_at: string;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (isBetaTesting()) return [];

  const baseUrl = (
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://storyink.ai"
  ).replace(/\/$/, "");

  const now = new Date();

  // Static, always-public pages. Anything the marketing site would
  // want a crawler to index belongs here. Auth-gated routes
  // (/account, /pets, /create's interior, etc.) are not indexed.
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/help`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/create`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/account`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
  ];

  // Per-post entries. Pulled from the compile-time post registry so
  // adding a new post to src/content/blog automatically surfaces it
  // here on the next build.
  const blogEntries: MetadataRoute.Sitemap = POSTS.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(`${post.publishedAt}T00:00:00Z`),
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  // Public storybooks. Best-effort: if the admin client isn't
  // configured (e.g. someone running a static build without secrets)
  // we just return the static entries rather than failing.
  let publicEntries: MetadataRoute.Sitemap = [];
  try {
    const { data } = await supabaseAdmin()
      .from("stories")
      .select("id, created_at")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(5000)
      .returns<PublicStoryRow[]>();
    publicEntries = (data ?? []).map((row) => ({
      url: `${baseUrl}/read/${row.id}`,
      lastModified: row.created_at ? new Date(row.created_at) : now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch (err) {
    console.warn("[sitemap] couldn't load public stories:", err);
  }

  return [...staticEntries, ...blogEntries, ...publicEntries];
}
