import Link from "next/link";
import ShipSuccessConfirm from "@/components/ShipSuccessConfirm";

export const revalidate = 0;

// Two paths land here:
//   - Stripe redirect: ?session_id=cs_...   (customer paid; needs confirm)
//   - Admin bypass:    ?adminOrder=<orderId> (already built; just show)
//
// Customer path posts the Stripe session id to /api/ship/stripe/confirm
// to verify payment + finalize the order. Admin path skips that since
// the order was already created synchronously by /api/ship/stripe/checkout.

export default async function ShipSuccess({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const sessionId =
    typeof sp.session_id === "string" ? sp.session_id : undefined;
  const adminOrderId =
    typeof sp.adminOrder === "string" ? sp.adminOrder : undefined;

  if (sessionId) {
    return <ShipSuccessConfirm storyId={id} sessionId={sessionId} />;
  }

  if (adminOrderId) {
    return <AdminOrderConfirm storyId={id} orderId={adminOrderId} />;
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-ink-900">
        Missing order reference
      </h1>
      <p className="mt-2 text-sm text-ink-500">
        Open your story and try ordering again.
      </p>
      <Link
        href={`/read/${id}`}
        className="mt-6 inline-block rounded-full bg-moss-700 px-5 py-2 text-sm font-semibold text-cream-50 transition-colors hover:bg-moss-900"
      >
        Back to story
      </Link>
    </div>
  );
}

// Admin-bypass success — order already exists in /orders, no need
// for the client-side confirm dance. Just show a clean success state
// with a link straight into the order detail.
function AdminOrderConfirm({
  storyId,
  orderId,
}: {
  storyId: string;
  orderId: string;
}) {
  return (
    <div className="animate-rise-in mx-auto max-w-xl px-4 py-12">
      <div className="rounded-2xl border border-emerald-200 bg-cream-50 p-8 text-center shadow-[0_8px_24px_rgba(16,185,129,0.08)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-semibold text-ink-900">
          Admin order created
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          PDFs built and uploaded. Place the print order on your vendor of
          choice from /orders.
        </p>
        <div className="mt-6 space-y-1 rounded-xl bg-cream-100 px-4 py-3 text-left text-xs text-ink-500">
          <div>
            Order ID:{" "}
            <span className="font-mono text-[11px] text-ink-900">{orderId}</span>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href={`/orders/${orderId}`}
            className="rounded-full bg-moss-700 px-5 py-2 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
          >
            Open in /orders
          </Link>
          <Link
            href={`/read/${storyId}`}
            className="rounded-full border border-cream-300 bg-cream-50 px-5 py-2 text-sm font-medium text-ink-700 hover:bg-cream-100"
          >
            Back to story
          </Link>
        </div>
      </div>
    </div>
  );
}
