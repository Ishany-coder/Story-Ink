// Server-only Lulu Direct (xPress / Print API) helpers. Lulu is the print
// vendor — they produce and ship the physical book. Never import into
// client code; this reads LULU_CLIENT_KEY + LULU_CLIENT_SECRET.
//
// SKU locked to 8.5×8.5" color hardcover casewrap (LULU_DEFAULT_SKU). Swap
// via env LULU_PRODUCT_SKU without code changes if the book spec changes.

import { fetchWithTimeout } from "@/lib/http";

// Hard upper bound on any outbound Lulu call. Quotes and print-job
// creation should be <5s typical. 20s gives headroom without leaving
// the user waiting on a stuck vendor.
const LULU_TIMEOUT_MS = 20_000;

export class LuluError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "LuluError";
    this.status = status;
  }
}

// 0850X0850FCSTDCW060UW444GXX =
//   8.5"x8.5", Full-color, Standard paper, CaseWrap hardcover, 60# interior,
//   Uncoated White, minimum 444 page capacity, Gloss laminate cover finish.
// Used unless you override LULU_PRODUCT_SKU in env.
export const LULU_DEFAULT_SKU = "0850X0850FCSTDCW060UW444GXX";

function apiBase(): string {
  return process.env.LULU_ENV === "production"
    ? "https://api.lulu.com"
    : "https://api.sandbox.lulu.com";
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set. Add Lulu credentials from developers.lulu.com to .env.local.`
    );
  }
  return v;
}

function productSku(): string {
  return process.env.LULU_PRODUCT_SKU || LULU_DEFAULT_SKU;
}

// Lulu uses OAuth2 client-credentials. The token endpoint is inside the
// auth realm hosted on their main domain (not api.*).
//
// Tokens are cached in-memory for (expiry - 60s) so the common path of
// quote + checkout + later print-job creation doesn't do three auth
// round-trips. A 60s safety window avoids racing expiry mid-call. The
// cache is process-local; each serverless instance warms its own.
let _tokenCache: { value: string; expiresAt: number } | null = null;
const TOKEN_SAFETY_WINDOW_MS = 60_000;

async function getAccessToken(): Promise<string> {
  if (_tokenCache && _tokenCache.expiresAt > Date.now()) {
    return _tokenCache.value;
  }
  const authBase =
    process.env.LULU_ENV === "production"
      ? "https://api.lulu.com"
      : "https://api.sandbox.lulu.com";
  const clientKey = requireEnv("LULU_CLIENT_KEY");
  const clientSecret = requireEnv("LULU_CLIENT_SECRET");
  const basic = Buffer.from(`${clientKey}:${clientSecret}`).toString("base64");

  const res = await fetchWithTimeout(
    `${authBase}/auth/realms/glasstree/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    },
    LULU_TIMEOUT_MS
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LuluError(
      res.status,
      `lulu auth failed (${res.status}): ${text.slice(0, 300)}`
    );
  }
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) throw new LuluError(500, "lulu auth missing token");
  // Default to 5 min if expires_in isn't returned. Subtract a safety
  // window so we roll to a fresh token before it actually expires.
  const ttlMs = (json.expires_in ?? 300) * 1000;
  _tokenCache = {
    value: json.access_token,
    expiresAt: Date.now() + Math.max(ttlMs - TOKEN_SAFETY_WINDOW_MS, 30_000),
  };
  return json.access_token;
}

// ---------------------------------------------------------------------------
// Address / shipping types. Mirror Lulu's expected JSON shape exactly. We
// do NOT persist any of this — the address is passed straight through and
// dropped from memory when the request handler returns.
// ---------------------------------------------------------------------------

export interface ShippingAddress {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state_code: string; // 2-letter for US/CA, else province/state name
  country_code: string; // ISO 3166-1 alpha-2 (US, CA, GB, ...)
  postcode: string;
  phone_number: string;
  email?: string;
}

// Lulu offers several shipping tiers: MAIL (cheapest, no tracking on some
// lanes), PRIORITY_MAIL, GROUND, EXPEDITED, EXPRESS. MAIL is cheapest and
// best matches "affordable" — we default to it and can fall back to GROUND
// for markets where MAIL isn't available.
export type ShippingLevel =
  | "MAIL"
  | "PRIORITY_MAIL"
  | "GROUND"
  | "EXPEDITED"
  | "EXPRESS";

// ---------------------------------------------------------------------------
// Cost calculation — call before checkout to show the customer a price.
// ---------------------------------------------------------------------------

export interface QuoteArgs {
  pageCount: number;
  quantity: number;
  address: ShippingAddress;
  shippingLevel?: ShippingLevel;
}

export interface LuluQuote {
  printCostUsd: number;
  shippingCostUsd: number;
  taxUsd: number;
  totalUsd: number;
  currency: string;
  shippingLevel: ShippingLevel;
}

export async function quotePrintAndShipping(
  args: QuoteArgs
): Promise<LuluQuote> {
  const token = await getAccessToken();
  const level: ShippingLevel = args.shippingLevel ?? "MAIL";

  const body = {
    line_items: [
      {
        page_count: Math.max(args.pageCount, 24),
        pod_package_id: productSku(),
        quantity: args.quantity,
      },
    ],
    shipping_address: args.address,
    shipping_option: level,
  };

  const res = await fetchWithTimeout(
    `${apiBase()}/print-job-cost-calculations/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    LULU_TIMEOUT_MS
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LuluError(
      res.status,
      `lulu quote failed (${res.status}): ${text.slice(0, 400)}`
    );
  }
  const json = (await res.json()) as {
    line_item_costs?: { total_cost_incl_tax?: string; total_cost_excl_tax?: string }[];
    shipping_cost?: { total_cost_incl_tax?: string };
    total_tax?: string;
    total_cost_incl_tax?: string;
    currency?: string;
  };

  const printCost = Number(
    json.line_item_costs?.[0]?.total_cost_excl_tax ??
      json.line_item_costs?.[0]?.total_cost_incl_tax ??
      "0"
  );
  const shippingCost = Number(json.shipping_cost?.total_cost_incl_tax ?? "0");
  const tax = Number(json.total_tax ?? "0");
  const total = Number(json.total_cost_incl_tax ?? "0");

  return {
    printCostUsd: printCost,
    shippingCostUsd: shippingCost,
    taxUsd: tax,
    totalUsd: total,
    currency: json.currency ?? "USD",
    shippingLevel: level,
  };
}

// ---------------------------------------------------------------------------
// Print job creation — fires after PayPal capture succeeds.
// ---------------------------------------------------------------------------

export interface CreatePrintJobArgs {
  interiorPdfUrl: string;
  coverPdfUrl: string;
  pageCount: number;
  quantity: number;
  address: ShippingAddress;
  shippingLevel?: ShippingLevel;
  externalId: string; // our internal order id, echoed back on webhooks
}

export interface CreatePrintJobResult {
  luluJobId: string;
  status: string;
}

export async function createPrintJob(
  args: CreatePrintJobArgs
): Promise<CreatePrintJobResult> {
  const token = await getAccessToken();

  const body = {
    external_id: args.externalId,
    contact_email: args.address.email ?? "",
    line_items: [
      {
        external_id: `${args.externalId}-item-1`,
        title: "StoryInk printed book",
        cover: {
          source_url: args.coverPdfUrl,
        },
        interior: {
          source_url: args.interiorPdfUrl,
        },
        pod_package_id: productSku(),
        quantity: args.quantity,
        page_count: Math.max(args.pageCount, 24),
      },
    ],
    shipping_address: args.address,
    shipping_level: args.shippingLevel ?? "MAIL",
  };

  const res = await fetchWithTimeout(
    `${apiBase()}/print-jobs/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    LULU_TIMEOUT_MS
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LuluError(
      res.status,
      `lulu print job failed (${res.status}): ${text.slice(0, 400)}`
    );
  }
  const json = (await res.json()) as { id?: number; status?: { name?: string } };
  if (json.id == null) throw new LuluError(500, "print job response missing id");
  return { luluJobId: String(json.id), status: json.status?.name ?? "CREATED" };
}
