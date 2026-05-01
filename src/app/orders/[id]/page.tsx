import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import OrderStatusActions from "@/components/OrderStatusActions";
import { StatusBadge } from "../page";

export const revalidate = 0;

// Admin-only order detail. Shows everything you need to fulfill the
// order on a third-party vendor's site, plus status transition
// buttons that fire /api/orders/[id]/status under the hood.

interface OrderRow {
  id: string;
  status: string;
  amount_usd: number | null;
  stripe_session_id: string | null;
  created_at: string;
  story_id: string;
  user_id: string | null;
  shipping_address: string | null;
  interior_pdf_url: string | null;
  cover_pdf_url: string | null;
}

interface EventRow {
  id: string;
  status: string;
  note: string | null;
  created_at: string;
  actor_id: string | null;
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAdmin())) notFound();

  const { id } = await params;
  const admin = supabaseAdmin();

  const { data: order, error } = await admin
    .from("print_orders")
    .select(
      "id, status, amount_usd, stripe_session_id, created_at, story_id, user_id, shipping_address, interior_pdf_url, cover_pdf_url"
    )
    .eq("id", id)
    .maybeSingle<OrderRow>();
  if (error || !order) notFound();

  const [storyRes, eventsRes, customerEmail] = await Promise.all([
    admin
      .from("stories")
      .select("id, title, page_count, cover_image, kind")
      .eq("id", order.story_id)
      .maybeSingle<{
        id: string;
        title: string;
        page_count: number;
        cover_image: string | null;
        kind: string | null;
      }>(),
    admin
      .from("print_order_events")
      .select("id, status, note, created_at, actor_id")
      .eq("order_id", id)
      .order("created_at", { ascending: false })
      .returns<EventRow[]>(),
    order.user_id
      ? admin.auth.admin
          .getUserById(order.user_id)
          .then((r) => r.data.user?.email ?? null)
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  const story = storyRes.data ?? null;
  const events = eventsRes.data ?? [];

  // Parse the persisted address. Falls back to "—" if the JSON is
  // bad or the column is missing on a legacy row.
  let shipping: Record<string, string> | null = null;
  if (order.shipping_address) {
    try {
      shipping = JSON.parse(order.shipping_address);
    } catch {
      shipping = null;
    }
  }

  return (
    <div className="animate-rise-in mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-6">
        <Link
          href="/orders"
          className="text-sm font-medium text-moss-700 hover:text-ink-900"
        >
          ← Back to orders
        </Link>
      </div>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
            Admin · Order
          </span>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink-900">
            {story?.title ?? "Untitled story"}
          </h1>
          <p className="mt-1 font-mono text-xs text-ink-500">{order.id}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          {/* Story panel */}
          <section className="rounded-2xl border border-cream-300 bg-cream-50 p-5">
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Storybook
            </h2>
            <div className="flex items-start gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-cream-300 bg-cream-200">
                {story?.cover_image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={story.cover_image}
                    alt={story.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full" />
                )}
              </div>
              <div className="flex-1 space-y-1 text-sm">
                <div className="font-[family-name:var(--font-display)] text-base font-semibold text-ink-900">
                  {story?.title ?? "—"}
                </div>
                <div className="text-xs text-ink-500">
                  {story?.page_count ?? "?"} pages
                  {story?.kind === "pet" ? " · pet story" : ""}
                </div>
                <div>
                  <Link
                    href={`/read/${order.story_id}`}
                    className="text-xs font-medium text-moss-700 hover:text-ink-900"
                  >
                    View the storybook →
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* Customer + shipping */}
          <section className="rounded-2xl border border-cream-300 bg-cream-50 p-5">
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Customer
            </h2>
            <div className="text-sm">
              <div className="text-ink-900">
                {customerEmail ?? <span className="text-ink-300">unknown</span>}
              </div>
              {order.user_id && (
                <div className="mt-0.5 font-mono text-[11px] text-ink-300">
                  {order.user_id}
                </div>
              )}
            </div>
            <h2 className="mt-5 mb-3 text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Ship to
            </h2>
            {shipping ? (
              <address className="text-sm not-italic text-ink-700">
                <div className="font-medium text-ink-900">{shipping.name}</div>
                <div>{shipping.street1}</div>
                {shipping.street2 && <div>{shipping.street2}</div>}
                <div>
                  {shipping.city}, {shipping.state_code} {shipping.postcode}
                </div>
                <div>{shipping.country_code}</div>
                <div className="mt-2 text-xs text-ink-500">
                  {shipping.phone_number}
                  {shipping.email ? ` · ${shipping.email}` : ""}
                </div>
              </address>
            ) : (
              <p className="text-sm text-ink-300">Address unavailable.</p>
            )}
          </section>

          {/* PDF downloads */}
          <section className="rounded-2xl border border-cream-300 bg-cream-50 p-5">
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Print files
            </h2>
            <p className="mb-3 text-xs text-ink-500">
              Download these and upload them to your print vendor (Lulu,
              Blurb, etc.) to fulfill the order.
            </p>
            <div className="flex flex-wrap gap-2">
              {order.interior_pdf_url ? (
                <a
                  href={order.interior_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-cream-300 bg-cream-50 px-4 py-2 text-xs font-semibold text-ink-700 hover:border-moss-500 hover:bg-cream-100"
                >
                  Interior PDF ↗
                </a>
              ) : (
                <span className="rounded-full border border-cream-300 bg-cream-100 px-4 py-2 text-xs text-ink-300">
                  Interior PDF — pending
                </span>
              )}
              {order.cover_pdf_url ? (
                <a
                  href={order.cover_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-cream-300 bg-cream-50 px-4 py-2 text-xs font-semibold text-ink-700 hover:border-moss-500 hover:bg-cream-100"
                >
                  Cover PDF ↗
                </a>
              ) : (
                <span className="rounded-full border border-cream-300 bg-cream-100 px-4 py-2 text-xs text-ink-300">
                  Cover PDF — pending
                </span>
              )}
            </div>
          </section>

          {/* Audit log */}
          <section className="rounded-2xl border border-cream-300 bg-cream-50 p-5">
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-ink-500">
              History
            </h2>
            {events.length === 0 ? (
              <p className="text-sm text-ink-300">No events yet.</p>
            ) : (
              <ol className="space-y-3">
                {events.map((e) => (
                  <li key={e.id} className="flex items-start gap-3">
                    <StatusBadge status={e.status} />
                    <div className="flex-1">
                      <div className="text-xs text-ink-500">
                        {new Date(e.created_at).toLocaleString()}
                      </div>
                      {e.note && (
                        <div className="mt-0.5 text-sm text-ink-700">
                          {e.note}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Action sidebar */}
        <aside className="space-y-4">
          <section className="rounded-2xl border border-cream-300 bg-cream-50 p-5">
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Move status
            </h2>
            <OrderStatusActions
              orderId={order.id}
              currentStatus={order.status}
            />
          </section>

          <section className="rounded-2xl border border-cream-300 bg-cream-50 p-5 text-xs text-ink-500">
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Reference
            </h2>
            <dl className="space-y-1">
              <div className="flex justify-between gap-3">
                <dt>Created</dt>
                <dd className="text-right text-ink-700">
                  {new Date(order.created_at).toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Amount</dt>
                <dd className="text-right text-ink-700">
                  {order.amount_usd != null
                    ? `$${order.amount_usd.toFixed(2)}`
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Stripe session</dt>
                <dd className="text-right font-mono text-[11px] text-ink-700">
                  {order.stripe_session_id
                    ? order.stripe_session_id.slice(0, 14) + "…"
                    : "(admin)"}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
