// Central pricing knobs. All checkout flows import from here so the
// list price, per-page surcharge, margin floor, and digital tier
// price live in exactly one file. Trivial to A/B test later — just
// edit a constant.

// Hardcover list price for stories up to 30 pages. Above 30, we add
// HARDCOVER_PER_PAGE_OVER_30_USD per extra page so a 60-page book
// doesn't get sold below cost.
export const HARDCOVER_BASE_USD = 34.99;
export const HARDCOVER_PER_PAGE_OVER_30_USD = 0.5;

// Safety floor: never charge less than (Lulu cost × this multiplier)
// regardless of list price. Locks in a minimum 30% gross margin even
// if Lulu raises print/shipping costs faster than we update the list.
export const HARDCOVER_MARGIN_FLOOR = 1.3;

// Digital tier — the pet-photo-grounded story unlocked for online
// reading + PDF download. Net of Stripe ($0.44) + Gemini (~$1) at
// $4.99 leaves $3.55 per sale, ~71% margin. Strategic role is
// acquisition: cheap impulse buy that gets a customer in the door
// before upselling to the $34.99 hardcover keepsake.
export const DIGITAL_PRICE_USD = 4.99;

// Returns the customer-facing price for a hardcover at the given
// page count, given Lulu's just-quoted cost (print + shipping + tax).
// max(list, costFloor) so we never accidentally sell at a loss.
export function priceHardcoverUsd(
  pageCount: number,
  luluCostUsd: number
): number {
  const list =
    HARDCOVER_BASE_USD +
    Math.max(0, pageCount - 30) * HARDCOVER_PER_PAGE_OVER_30_USD;
  const floor = luluCostUsd * HARDCOVER_MARGIN_FLOOR;
  return Math.max(list, floor);
}
