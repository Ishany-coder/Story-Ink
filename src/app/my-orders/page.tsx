import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import { StatusBadge } from "../orders/page";
import CancelOrderButton from "@/components/CancelOrderButton";

export const revalidate = 0;
// Force a dynamic render on every request. revalidate=0 alone has been
// observed to occasionally serve a stale RSC payload after a status
// change; force-dynamic makes that impossible.
export const dynamic = "force-dynamic";

// Customer-facing order tracker. Lists every print_orders row for the
// signed-in user with a small audit timeline so they can see when the
// admin moved their order through the fulfillment funnel.
//
// RLS does the scoping — the user only sees their own orders. We use
// the regular server client (NOT service-role) on purpose so this
// route stays safe even if a future change forgets to filter by
// user_id.

interface OrderRow {
  id: string;
  status: string;
  amount_usd: number | null;
  created_at: string;
  story_id: string;
  quantity: number | null;
}

interface StoryRow {
  id: string;
  title: string;
  cover_image: string | null;
}

interface EventRow {
  id: string;
  order_id: string;
  status: string;
  note: string | null;
  created_at: string;
}

export default async function MyOrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/my-orders");

  const supa = await getSupabaseServer();

  // Hide cancelled orders from the customer view. The row stays in the
  // database (admin still sees it under the Cancelled filter, audit
  // trail is preserved) but the customer's tracker only shows live
  // orders.
  const { data: orders, error } = await supa
    .from("print_orders")
    .select("id, status, amount_usd, created_at, story_id, quantity")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .returns<OrderRow[]>();

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
        <p className="text-sm text-rose-600">
          Couldn&apos;t load your orders: {error.message}
        </p>
      </div>
    );
  }

  const list = orders ?? [];
  const storyIds = Array.from(new Set(list.map((o) => o.story_id)));
  const orderIds = list.map((o) => o.id);

  const [storiesRes, eventsRes] = await Promise.all([
    storyIds.length > 0
      ? supa
          .from("stories")
          .select("id, title, cover_image")
          .in("id", storyIds)
          .returns<StoryRow[]>()
      : Promise.resolve({ data: [] as StoryRow[] }),
    orderIds.length > 0
      ? supa
          .from("print_order_events")
          .select("id, order_id, status, note, created_at")
          .in("order_id", orderIds)
          .order("created_at", { ascending: false })
          .returns<EventRow[]>()
      : Promise.resolve({ data: [] as EventRow[] }),
  ]);

  const storyById = new Map<string, StoryRow>();
  for (const s of storiesRes.data ?? []) storyById.set(s.id, s);

  const eventsByOrder = new Map<string, EventRow[]>();
  for (const e of eventsRes.data ?? []) {
    const arr = eventsByOrder.get(e.order_id) ?? [];
    arr.push(e);
    eventsByOrder.set(e.order_id, arr);
  }

  return (
    <div className="animate-rise-in mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8 border-b border-cream-300 pb-4">
        <span className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
          Your orders
        </span>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink-900">
          Order tracker
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          We&apos;ll move your order through these steps as we get it ready.
        </p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 px-6 py-16 text-center">
          <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink-900">
            No orders yet.
          </p>
          <p className="mt-1 text-sm text-ink-500">
            Order a printed copy of one of your stories to start tracking it
            here.
          </p>
          <Link
            href="/read"
            className="mt-5 inline-block rounded-full bg-moss-700 px-5 py-2 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
          >
            Browse your library
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((order) => {
            const story = storyById.get(order.story_id) ?? null;
            const events = eventsByOrder.get(order.id) ?? [];
            return (
              <OrderCard
                key={order.id}
                order={order}
                story={story}
                events={events}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

const STATUS_HEADLINE: Record<string, string> = {
  building: "Getting your book ready",
  received: "Order received — building your book",
  paid: "Payment received",
  in_progress: "Sent to print",
  shipped: "On its way to you",
  delivered: "Delivered",
  failed:
    "Something went wrong. We're looking into it — your card has not been charged twice.",
  cancelled: "Cancelled",
};

function OrderCard({
  order,
  story,
  events,
}: {
  order: OrderRow;
  story: StoryRow | null;
  events: EventRow[];
}) {
  const headline = STATUS_HEADLINE[order.status] ?? order.status;
  return (
    <article className="overflow-hidden rounded-2xl border border-cream-300 bg-cream-50">
      <header className="flex flex-wrap items-start gap-4 border-b border-cream-200 p-5">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-cream-300 bg-cream-200">
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
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-[family-name:var(--font-display)] text-lg font-semibold text-ink-900">
              {story?.title ?? "Untitled story"}
            </h2>
            {order.quantity && order.quantity > 1 && (
              <span className="rounded-full bg-moss-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-moss-700">
                × {order.quantity} copies
              </span>
            )}
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-1 text-sm text-ink-700">{headline}</p>
          <p className="mt-2 text-xs text-ink-500">
            Ordered{" "}
            {new Date(order.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            {order.amount_usd != null && order.amount_usd > 0
              ? ` · $${order.amount_usd.toFixed(2)}`
              : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {order.status === "received" && (
            <CancelOrderButton orderId={order.id} />
          )}
          {story?.id && (
            <Link
              href={`/read/${story.id}`}
              className="rounded-full border border-cream-300 bg-cream-50 px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-moss-500 hover:bg-cream-100"
            >
              View story
            </Link>
          )}
        </div>
      </header>

      {events.length > 0 && (
        <div className="px-5 py-4">
          <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-ink-500">
            Timeline
          </h3>
          <ol className="space-y-2.5">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-3">
                <StatusBadge status={e.status} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-ink-500">
                    {new Date(e.created_at).toLocaleString()}
                  </div>
                  {e.note && !looksInternal(e.note) && (
                    <div className="mt-0.5 text-sm text-ink-700">{e.note}</div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <footer className="border-t border-cream-200 bg-cream-100 px-5 py-3 text-[11px] text-ink-300">
        Order ID:{" "}
        <span className="font-mono text-[11px] text-ink-700">{order.id}</span>
      </footer>
    </article>
  );
}

// Hide internal notes (admin/test annotations) from the customer view —
// only surface notes that look like genuine customer-facing copy. Cheap
// heuristic: anything containing certain admin keywords stays hidden.
function looksInternal(note: string): boolean {
  const n = note.toLowerCase();
  return (
    n.includes("admin order") ||
    n.includes("bypass_stripe") ||
    n.includes("test order") ||
    n.includes("manual fulfillment") ||
    n.includes("pdf generation failed")
  );
}
