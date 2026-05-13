"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Story } from "@/lib/types";

// Hardcover printing requires a 24-page minimum. Below that we offer
// the digital tier instead — the same number must match the schema
// CHECK and the /api/generate clamp in src/app/api/generate/route.ts.
const PRINT_MIN_PAGES = 24;

interface Props {
  story: Story;
  // Server-determined; admin sees a "Place free admin order" CTA
  // instead of "Pay with Stripe", and the underlying request hits
  // the same /api/ship/stripe/checkout endpoint which detects admin
  // server-side and routes to the bypass flow.
  isAdmin?: boolean;
  // Server-determined from BYPASS_STRIPE=1. When set, every user
  // skips Stripe — same code path as admin. For dev/testing only.
  bypassStripe?: boolean;
}

interface AddressState {
  name: string;
  street1: string;
  street2: string;
  city: string;
  state_code: string;
  country_code: string;
  postcode: string;
  phone_number: string;
  email: string;
}

interface Quote {
  printCostUsd: number;
  shippingCostUsd: number;
  taxUsd: number;
  totalUsd: number;
  currency: string;
}

function emptyAddress(): AddressState {
  return {
    name: "",
    street1: "",
    street2: "",
    city: "",
    state_code: "",
    country_code: "US",
    postcode: "",
    phone_number: "",
    email: "",
  };
}

function isComplete(a: AddressState): boolean {
  return (
    a.name.trim() !== "" &&
    a.street1.trim() !== "" &&
    a.city.trim() !== "" &&
    a.state_code.trim() !== "" &&
    a.country_code.trim() !== "" &&
    a.postcode.trim() !== "" &&
    a.phone_number.trim() !== ""
  );
}

function toPayload(a: AddressState) {
  return {
    name: a.name.trim(),
    street1: a.street1.trim(),
    ...(a.street2.trim() ? { street2: a.street2.trim() } : {}),
    city: a.city.trim(),
    state_code: a.state_code.trim(),
    country_code: a.country_code.trim().toUpperCase(),
    postcode: a.postcode.trim(),
    phone_number: a.phone_number.trim(),
    ...(a.email.trim() ? { email: a.email.trim() } : {}),
  };
}

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 10;

export default function ShipStoryPage({
  story,
  isAdmin = false,
  bypassStripe = false,
}: Props) {
  const skipPayment = isAdmin || bypassStripe;
  const [address, setAddress] = useState<AddressState>(emptyAddress());
  const [quantity, setQuantity] = useState<number>(1);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const addressComplete = isComplete(address);

  // Debounced live quote: fetch 600ms after the last address/quantity
  // edit. Quantity changes refetch immediately too — Lulu prices each
  // copy, and shipping cost can step up at certain thresholds.
  useEffect(() => {
    if (!addressComplete) return;
    const handle = setTimeout(() => {
      void fetchQuote();
    }, 600);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    address.name,
    address.street1,
    address.street2,
    address.city,
    address.state_code,
    address.country_code,
    address.postcode,
    address.phone_number,
    addressComplete,
    quantity,
  ]);

  async function fetchQuote() {
    setQuoting(true);
    setQuoteError(null);
    try {
      const res = await fetch("/api/ship/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId: story.id,
          address: toPayload(address),
          quantity,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Quote failed");
      }
      const q = (await res.json()) as Quote;
      setQuote(q);
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : "Quote failed");
      setQuote(null);
    } finally {
      setQuoting(false);
    }
  }

  async function startCheckout() {
    if (!addressComplete) return;
    // Bypass path skips the live quote check (server bypasses Stripe),
    // paid path still requires the quote so the drift guard works.
    if (!skipPayment && !quote) return;
    setCheckoutPending(true);
    setCheckoutError(null);
    try {
      const res = await fetch("/api/ship/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId: story.id,
          // Display-only drift check. Server ignores for the charge and
          // recomputes a fresh Lulu quote; sending it lets the server
          // reject with code=price_changed when the quote has drifted.
          ...(quote ? { expectedAmountUsd: quote.totalUsd } : {}),
          address: toPayload(address),
          quantity,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Checkout failed");
      }
      const { url } = (await res.json()) as { url: string };
      // Full redirect — either to Stripe's hosted page (customer) or
      // to /ship/[id]/success?adminOrder=... (admin bypass).
      window.location.href = url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Checkout failed");
      setCheckoutPending(false);
    }
  }

  const preview = useMemo(() => {
    const first = story.pages[0];
    return {
      cover: story.cover_image || first?.imageUrl || "",
      pageCount: story.pages.length,
    };
  }, [story]);

  // Short stories can't be printed as hardcovers — bail out of the
  // address/checkout flow entirely and show a focused "digital only"
  // notification with a deep link to the digital reader / unlock.
  if (preview.pageCount < PRINT_MIN_PAGES) {
    return <ShortStoryDigitalOnlyNotice story={story} />;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href={`/read/${story.id}`}
          className="text-sm font-bold text-ink-300 hover:text-moss-700"
        >
          &larr; Back to story
        </Link>
        <span className="rounded-full bg-moss-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-moss-700">
          Ship story book
        </span>
      </div>

      <h1 className="mb-1 font-[family-name:var(--font-display)] text-3xl font-bold text-ink-900">
        Ship &quot;{story.title}&quot;
      </h1>
      <p className="text-sm font-bold text-ink-300">
        8.5&quot; × 8.5&quot; hardcover, full-color interior, printed and
        shipped worldwide at cost.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-3xl border-4 border-cream-300 bg-cream-50 p-4 shadow-sm">
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-gradient-to-br from-cream-200 to-cream-100">
            {preview.cover ? (
              <Image
                src={preview.cover}
                alt={`Cover of "${story.title}"`}
                fill
                sizes="(max-width: 1024px) 100vw, 512px"
                className="object-cover"
                // Cover is the headline element of the ship page —
                // first thing the buyer sees, prioritize the fetch.
                priority
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-ink-300">
                No cover
              </div>
            )}
          </div>
          <div className="mt-4 space-y-1 text-xs font-bold text-ink-500">
            <div className="flex justify-between">
              <span>Pages</span>
              <span>{preview.pageCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Format</span>
              <span>8.5&quot; sq · hardcover · color</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Quantity</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setQuantity((q) => Math.max(MIN_QUANTITY, q - 1))
                  }
                  disabled={quantity <= MIN_QUANTITY}
                  aria-label="Decrease quantity"
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-cream-300 bg-cream-50 text-base text-ink-700 transition-colors hover:border-moss-500 hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  −
                </button>
                <span className="min-w-[1.5rem] text-center text-sm text-ink-900">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))
                  }
                  disabled={quantity >= MAX_QUANTITY}
                  aria-label="Increase quantity"
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-cream-300 bg-cream-50 text-base text-ink-700 transition-colors hover:border-moss-500 hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
            <p className="pt-1 text-[10px] font-medium text-ink-300">
              Up to {MAX_QUANTITY} copies per order. Same address for all.
            </p>
          </div>
        </div>

        <div className="rounded-3xl border-4 border-cream-300 bg-cream-50 p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-ink-500">
            Ship to
          </h2>
          <AddressForm address={address} onChange={setAddress} />

          <div className="my-5 rounded-2xl border-2 border-cream-300 bg-cream-200/40 px-4 py-3 text-xs">
            <h3 className="mb-2 text-[10px] font-black uppercase tracking-wider text-ink-300">
              Price
            </h3>
            {!addressComplete && (
              <p className="font-bold text-ink-300">
                Fill in your address to see the price.
              </p>
            )}
            {addressComplete && quoting && (
              <p className="font-bold text-ink-300">Getting price…</p>
            )}
            {addressComplete && !quoting && quoteError && (
              <p className="font-bold text-rose-500">{quoteError}</p>
            )}
            {addressComplete && !quoting && quote && (
              <div className="space-y-1 font-bold text-moss-700">
                <div className="flex justify-between">
                  <span>Hardcover</span>
                  <span>${quote.printCostUsd.toFixed(2)}</span>
                </div>
                {/* Shipping is bundled into the list price for now —
                    only render the line when it's a non-zero charge,
                    otherwise show a small "free shipping" hint. */}
                {quote.shippingCostUsd > 0 ? (
                  <div className="flex justify-between">
                    <span>Shipping</span>
                    <span>${quote.shippingCostUsd.toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-[11px] font-medium text-stone-500">
                    <span>Shipping</span>
                    <span>Free</span>
                  </div>
                )}
                {quote.taxUsd > 0 && (
                  <div className="flex justify-between">
                    <span>Tax</span>
                    <span>${quote.taxUsd.toFixed(2)}</span>
                  </div>
                )}
                <div className="mt-1 flex justify-between border-t border-cream-300 pt-1 text-[13px] font-black text-ink-900">
                  <span>Total</span>
                  <span>${quote.totalUsd.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border-2 border-dashed border-cream-300 bg-cream-50 p-3">
            {isAdmin ? (
              <p className="mb-3 text-[10px] font-bold text-ink-300">
                Admin account — no payment. The order goes straight to{" "}
                <span className="font-mono">/orders</span> with PDFs already
                built. Fulfill manually from there.
              </p>
            ) : bypassStripe ? (
              <p className="mb-3 text-[10px] font-bold text-ink-300">
                Test mode — Stripe is bypassed. The order is created with no
                charge.
              </p>
            ) : (
              <p className="mb-3 text-[10px] font-bold text-ink-300">
                Stripe handles card entry on their hosted page. We never save
                your card or address.
              </p>
            )}
            <button
              type="button"
              onClick={startCheckout}
              disabled={(!skipPayment && !quote) || !addressComplete || checkoutPending}
              className="w-full rounded-full bg-moss-700 px-4 py-3 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checkoutPending
                ? skipPayment
                  ? "Creating order…"
                  : "Redirecting to Stripe…"
                : isAdmin
                ? "Place free admin order"
                : bypassStripe
                ? "Place test order (no payment)"
                : "Pay with Stripe"}
            </button>
            {checkoutError && (
              <div className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-500">
                {checkoutError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddressForm({
  address,
  onChange,
}: {
  address: AddressState;
  onChange: (next: AddressState) => void;
}) {
  const set = (key: keyof AddressState, value: string) =>
    onChange({ ...address, [key]: value });
  return (
    <div className="space-y-2">
      <Field label="Full name">
        <input
          type="text"
          value={address.name}
          onChange={(e) => set("name", e.target.value)}
          autoComplete="name"
          className={inputCls}
        />
      </Field>
      <Field label="Street">
        <input
          type="text"
          value={address.street1}
          onChange={(e) => set("street1", e.target.value)}
          autoComplete="address-line1"
          className={inputCls}
        />
      </Field>
      <Field label="Apt / Unit (optional)">
        <input
          type="text"
          value={address.street2}
          onChange={(e) => set("street2", e.target.value)}
          autoComplete="address-line2"
          className={inputCls}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="City">
          <input
            type="text"
            value={address.city}
            onChange={(e) => set("city", e.target.value)}
            autoComplete="address-level2"
            className={inputCls}
          />
        </Field>
        <Field label="State / Region">
          <input
            type="text"
            value={address.state_code}
            onChange={(e) => set("state_code", e.target.value)}
            autoComplete="address-level1"
            maxLength={3}
            placeholder="CA"
            className={inputCls}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="ZIP / Postcode">
          <input
            type="text"
            value={address.postcode}
            onChange={(e) => set("postcode", e.target.value)}
            autoComplete="postal-code"
            className={inputCls}
          />
        </Field>
        <Field label="Country (ISO-2)">
          <input
            type="text"
            value={address.country_code}
            onChange={(e) => set("country_code", e.target.value.toUpperCase())}
            autoComplete="country"
            maxLength={2}
            placeholder="US"
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="Phone">
        <input
          type="tel"
          value={address.phone_number}
          onChange={(e) => set("phone_number", e.target.value)}
          autoComplete="tel"
          className={inputCls}
        />
      </Field>
      <Field label="Email (optional — for order updates)">
        <input
          type="email"
          value={address.email}
          onChange={(e) => set("email", e.target.value)}
          autoComplete="email"
          className={inputCls}
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-wider text-ink-300">
        {label}
      </span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border-2 border-cream-300 bg-cream-50 px-3 py-1.5 text-sm font-bold text-ink-900 outline-none focus:border-moss-700";

// Replacement view for /ship/<id> when the story has fewer pages than
// the hardcover floor (PRINT_MIN_PAGES). Explains why hardcover isn't
// available and routes the user toward the digital tier instead.
function ShortStoryDigitalOnlyNotice({ story }: { story: Story }) {
  const pageCount = story.pages.length;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/digital/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId: story.id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || "Checkout failed");
      }
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href={`/read/${story.id}`}
        className="text-sm font-bold text-ink-300 hover:text-moss-700"
      >
        &larr; Back to story
      </Link>

      <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-6">
        <div className="mb-2 flex items-start gap-3">
          <span aria-hidden="true" className="text-2xl leading-none">
            ⓘ
          </span>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-ink-900">
              Hardcover isn&rsquo;t available for short stories
            </h1>
            <p className="mt-2 text-sm text-ink-700">
              &ldquo;{story.title}&rdquo; is {pageCount} pages. Our hardcovers
              need at least {PRINT_MIN_PAGES} interior pages for the spine
              and binding to look right. You can still read it online or
              download it as a PDF.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-3xl border-2 border-cream-300 bg-cream-50 p-6 text-center shadow-sm">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
          Keep it digital
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Read all {pageCount} pages on any device, plus a downloadable PDF
          you can save and share.
        </p>
        <button
          type="button"
          onClick={unlock}
          disabled={pending}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-moss-700 px-6 py-3 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Opening checkout…" : "Unlock digital"}
        </button>
        {error && (
          <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>
        )}
        <p className="mt-4 text-[11px] text-ink-300">
          Want a hardcover? Regenerate this idea at {PRINT_MIN_PAGES}+
          pages.
        </p>
      </div>
    </div>
  );
}
