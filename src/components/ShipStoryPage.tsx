"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Story } from "@/lib/types";

interface Props {
  story: Story;
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

export default function ShipStoryPage({ story }: Props) {
  const [address, setAddress] = useState<AddressState>(emptyAddress());
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const addressComplete = isComplete(address);

  // Debounced live quote: fetch 600ms after the last address edit.
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
  ]);

  async function fetchQuote() {
    setQuoting(true);
    setQuoteError(null);
    try {
      const res = await fetch("/api/ship/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId: story.id, address: toPayload(address) }),
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
    if (!quote || !addressComplete) return;
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
          expectedAmountUsd: quote.totalUsd,
          address: toPayload(address),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Checkout failed");
      }
      const { url } = (await res.json()) as { url: string };
      // Full redirect — Stripe Checkout takes over the tab.
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
          <div className="aspect-square w-full overflow-hidden rounded-2xl bg-gradient-to-br from-cream-200 to-cream-100">
            {preview.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.cover}
                alt={story.title}
                className="h-full w-full object-cover"
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
            <div className="flex justify-between">
              <span>Quantity</span>
              <span>1</span>
            </div>
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
                  <span>Print</span>
                  <span>${quote.printCostUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span>${quote.shippingCostUsd.toFixed(2)}</span>
                </div>
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
            <p className="mb-3 text-[10px] font-bold text-ink-300">
              Stripe handles card entry on their hosted page. We never save
              your card or address.
            </p>
            <button
              type="button"
              onClick={startCheckout}
              disabled={!quote || checkoutPending}
              className="w-full rounded-full bg-moss-700 px-4 py-3 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checkoutPending ? "Redirecting to Stripe…" : "Pay with Stripe"}
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
