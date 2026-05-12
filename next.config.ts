import type { NextConfig } from "next";

// Restrict the next/image proxy host allowlist to the project's Supabase
// host (parsed from NEXT_PUBLIC_SUPABASE_URL) plus any hosts listed in
// ALLOWED_IMAGE_HOSTS. Previously this was set to "**" which let
// next/image proxy any HTTPS host on the internet — wasted bandwidth
// and a free SSRF amplifier.
function imageRemotePatterns(): NonNullable<
  NextConfig["images"]
>["remotePatterns"] {
  const patterns: NonNullable<
    NextConfig["images"]
  >["remotePatterns"] = [];
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supaUrl) {
    try {
      const host = new URL(supaUrl).host;
      patterns.push({ protocol: "https", hostname: host });
    } catch {
      // ignore — config-validation will catch a malformed env value
    }
  }
  const extra = process.env.ALLOWED_IMAGE_HOSTS;
  if (extra) {
    for (const raw of extra.split(",")) {
      const h = raw.trim();
      if (h) patterns.push({ protocol: "https", hostname: h });
    }
  }
  return patterns;
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Conservative starter CSP. Allows inline + eval because Next has not
  // emitted CSP-friendly nonces by default; tighten further once a
  // nonce strategy is in place. Storage host is allowed for images.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: imageRemotePatterns(),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
