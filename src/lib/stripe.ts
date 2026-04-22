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
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(
  args: CreateCheckoutArgs
): Promise<{ sessionId: string; url: string }> {
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    // Currency + single line item covers print + ship + tax in one amount
    // since Lulu already computed the quote server-side with tax.
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Printed story: ${args.storyTitle.slice(0, 80)}`,
            description:
              "8.5×8.5 hardcover, full-color interior, shipped by Lulu.",
          },
          // Stripe wants the amount in the smallest currency unit (cents).
          unit_amount: Math.round(args.amountUsd * 100),
        },
        quantity: 1,
      },
    ],
    // We already collected the address on our side — but let Stripe
    // optionally re-confirm it on their checkout page so the user can
    // correct typos before paying.
    shipping_address_collection: {
      allowed_countries: ["US", "CA", "GB", "AU", "NZ", "IE", "DE", "FR", "NL", "ES", "IT", "SE", "NO", "DK", "FI", "JP", "SG"],
    },
    metadata: {
      story_id: args.storyId,
      // Our form-collected address is authoritative for the quote. The
      // Stripe success page carries this back so the Lulu print job uses
      // the exact address the quote was calculated for.
      address: packAddressMetadata(args.address),
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
