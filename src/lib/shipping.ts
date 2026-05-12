// Shared shipping types. Lives outside any specific vendor so that the
// shape can be reused by the Stripe checkout metadata and the admin
// fulfillment UI without dragging in vendor SDK code.
//
// Country codes follow ISO 3166-1 alpha-2, state codes follow ISO 3166-2.

export interface ShippingAddress {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state_code: string;
  country_code: string;
  postcode: string;
  phone_number: string;
  email?: string;
}

// Type guard for unvalidated body input. Trims-and-checks the required
// string fields. Used by /api/ship/quote and /api/ship/stripe/checkout.
export function isShippingAddress(v: unknown): v is ShippingAddress {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  const str = (k: string) =>
    typeof a[k] === "string" && (a[k] as string).trim().length > 0;
  return !!(
    str("name") &&
    str("street1") &&
    str("city") &&
    str("state_code") &&
    str("country_code") &&
    str("postcode") &&
    str("phone_number")
  );
}
