// Central pricing knobs. All checkout flows import from here so the
// list price, per-page surcharge, and digital tier price live in
// exactly one file. Trivial to A/B test later — just edit a constant.

// Hardcover list price for stories up to 30 pages. Above 30, we add
// HARDCOVER_PER_PAGE_OVER_30_USD per extra page so a 60-page book
// doesn't get sold below cost.
//
// Shipping is bundled into the list price — there's no live shipping
// quote any more (admin fulfills manually and absorbs the diff). If
// you find the cost-of-shipping math no longer works out, raise the
// base or carve out a separate shipping line item in the checkout.
export const HARDCOVER_BASE_USD = 34.99;
export const HARDCOVER_PER_PAGE_OVER_30_USD = 0.5;

// Digital tier — the pet-photo-grounded story unlocked for online
// reading + PDF download. Net of Stripe ($0.59) + Gemini (~$1) at
// $9.99 leaves $8.40 per sale, ~84% margin. Premium positioning:
// matches Hekaya / Imagitime ebook tier. Bundled free with hardcover
// so customers who upgrade never see a separate digital charge.
export const DIGITAL_PRICE_USD = 9.99;

// Customer-facing per-copy price for a hardcover at the given page
// count. Multiply by quantity at the call site; the function returns
// the unit price.
export function priceHardcoverUsd(pageCount: number): number {
  return (
    HARDCOVER_BASE_USD +
    Math.max(0, pageCount - 30) * HARDCOVER_PER_PAGE_OVER_30_USD
  );
}
