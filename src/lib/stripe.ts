// Server-only Stripe helpers. Never import into client code — reads
// STRIPE_SECRET_KEY from env.
//
// We use Stripe Checkout (hosted page) instead of Elements so that no card
// data ever touches our server, and Stripe handles Apple Pay / Google Pay /
// saved-card UX for free.

import Stripe from "stripe";
import type { ShippingAddress } from "@/lib/lulu";

let _client: Stripe | null = null;

export function stripe(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Grab it from Stripe Dashboard → Developers → API keys and add to .env.local."
    );
  }
  _client = new Stripe(key);
  return _client;
}

// Shipping address flows from our form → Checkout Session metadata → back
// out on the success page. Checkout Session metadata has a 500 char per
// key limit, so we JSON-stringify into a single `address` key to stay
// within it (a US address is usually <300 chars).
export function packAddressMetadata(address: ShippingAddress): string {
  return JSON.stringify(address);
}

export function unpackAddressMetadata(raw: string): ShippingAddress | null {
  try {
    const parsed = JSON.parse(raw) as ShippingAddress;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface CreateCheckoutArgs {
  storyId: string;
  storyTitle: string;
  amountUsd: number;
  address: ShippingAddress;
  quantity: number;
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(
  args: CreateCheckoutArgs
): Promise<{ sessionId: string; url: string }> {
  // Stripe's per-unit price + quantity multiplies on their side. We
  // already have the *total* (print + ship + tax for N copies) from
  // the Lulu quote, so we charge it as a single line item with
  // quantity 1 and stash the actual book quantity in metadata for the
  // fulfillment pipeline. Avoids rounding mismatches between
  // (unit_amount × quantity) and the live quote.
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name:
              args.quantity > 1
                ? `${args.quantity} × printed story: ${args.storyTitle.slice(0, 70)}`
                : `Printed story: ${args.storyTitle.slice(0, 80)}`,
            description:
              "8.5×8.5 hardcover, full-color interior, shipped by Lulu.",
          },
          unit_amount: Math.round(args.amountUsd * 100),
        },
        quantity: 1,
      },
    ],
    shipping_address_collection: {
      allowed_countries: ["US", "CA", "GB", "AU", "NZ", "IE", "DE", "FR", "NL", "ES", "IT", "SE", "NO", "DK", "FI", "JP", "SG"],
    },
    metadata: {
      story_id: args.storyId,
      address: packAddressMetadata(args.address),
      quantity: String(args.quantity),
    },
    success_url: `${args.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: args.cancelUrl,
  });
  if (!session.url) {
    throw new Error("Stripe created a session without a redirect URL");
  }
  return { sessionId: session.id, url: session.url };
}

export async function retrieveCheckoutSession(
  sessionId: string
): Promise<Stripe.Checkout.Session> {
  return stripe().checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });
}

// Verify a raw webhook payload with Stripe's signing secret. Throws if
// the signature is missing, malformed, or doesn't match — which is the
// behavior we want: a 400 back to Stripe so they retry, and no side
// effects from forged traffic.
export function constructWebhookEvent(
  rawBody: string,
  signature: string,
  webhookSecret: string
): Stripe.Event {
  return stripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
}
