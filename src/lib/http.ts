// Small shared helpers for outbound HTTP: timeouts and an origin allowlist
// for URLs that come (directly or indirectly) from user input.
//
// Why an allowlist: we fetch "current illustration" URLs and PDF source
// images off the stories table to feed them to Gemini / pdf-lib. Those
// URLs are technically user-influenceable (anyone who inserts a story
// with a crafted imageUrl could point us at anything). Without a host
// guard, fetching e.g. `http://169.254.169.254/...` would let an
// attacker exfiltrate cloud-metadata from our server. Only allowing
// Supabase Storage and data: URIs closes that hole.

const DEFAULT_TIMEOUT_MS = 15_000;

// Fetch with a hard abort after `timeoutMs`. Always returns the fetch
// promise — use `.ok` like a normal fetch. Throws `AbortError` on
// timeout (and rethrows the original error otherwise).
export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Race a promise against a timeout. Use for SDK calls we can't thread an
// AbortSignal through (e.g. @google/generative-ai). The inner work keeps
// running in the background — we just stop waiting.
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}

// Is this URL safe to fetch as "trusted content" derived from stored
// story data? True for:
//   - data: URIs (parsed inline, no network request)
//   - Supabase Storage public URLs on our configured project
//
// Anything else (raw http(s) to arbitrary hosts, file://, internal
// network addresses, etc.) is rejected.
export function isAllowedContentUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("data:")) return true;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supaUrl) {
    try {
      const supaHost = new URL(supaUrl).host;
      // Supabase Storage lives on the same project host as the REST API
      // (typically <project>.supabase.co). Storage CDN URLs also use
      // *.supabase.co — allow any subdomain of the project's base domain
      // so /storage/v1/... and /storage/v1/render/... both pass.
      if (url.host === supaHost) return true;
      // Allow sibling hosts like <anything>.supabase.co if the env var
      // points there, for CDN/edge variants.
      const base = supaHost.split(".").slice(-2).join(".");
      if (base && url.host.endsWith(`.${base}`)) return true;
    } catch {
      // fall through to false
    }
  }

  // Extra allowlist via env for self-hosted Supabase or a CDN in front
  // of Storage. Comma-separated list of hostnames, e.g.
  // "cdn.example.com,assets.example.com".
  const extra = process.env.ALLOWED_IMAGE_HOSTS;
  if (extra) {
    const hosts = extra
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    if (hosts.includes(url.host.toLowerCase())) return true;
  }

  return false;
}
