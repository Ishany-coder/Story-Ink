import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";

export const revalidate = 0;

// Admin-only orders queue. Lists every paid + admin print order
// across all customers so the admin can fulfill them manually.
//
// Non-admins get a 404 (not 403) — leaks no info about the route's
// existence.

interface OrderRow {
  id: string;
  status: string;
  amount_usd: number | null;
  stripe_session_id: string | null;
  created_at: string;
  story_id: string;
  user_id: string | null;
  interior_pdf_url: string | null;
  quantity: number | null;
}

interface StoryRow {
  id: string;
  title: string;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isAdmin())) notFound();

  const sp = await searchParams;
  const filter =
    typeof sp.status === "string" ? sp.status : "active"; // active | all

  const admin = supabaseAdmin();
  let query = admin
    .from("print_orders")
    .select(
      "id, status, amount_usd, stripe_session_id, created_at, story_id, user_id, interior_pdf_url, quantity"
    )
    .order("created_at", { ascending: false });
  if (filter === "active") {
    query = query.in("status", ["received", "in_progress"]);
  } else if (filter === "shipped") {
    query = query.eq("status", "shipped");
  } else if (filter === "delivered") {
    query = query.eq("status", "delivered");
  } else if (filter === "failed") {
    query = query.eq("status", "failed");
  } else if (filter === "cancelled") {
    query = query.eq("status", "cancelled");
  }
  const { data: orders, error } = (await query) as {
    data: OrderRow[] | null;
    error: { message: string } | null;
  };
  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
        <p className="text-sm text-rose-600">
          Couldn&apos;t load orders: {error.message}
        </p>
      </div>
    );
  }

  // Resolve story titles + customer emails in parallel.
  const storyIds = Array.from(new Set((orders ?? []).map((o) => o.story_id)));
  const userIds = Array.from(
    new Set(
      (orders ?? [])
        .map((o) => o.user_id)
        .filter((u): u is string => typeof u === "string")
    )
  );

  const [storiesRes, emailsByUserId] = await Promise.all([
    storyIds.length > 0
      ? admin
          .from("stories")
          .select("id, title")
          .in("id", storyIds)
      : Promise.resolve({ data: [] as StoryRow[] }),
    fetchEmailsByUserId(userIds),
  ]);
  const storyTitle = new Map<string, string>();
  for (const s of (storiesRes.data ?? []) as StoryRow[]) {
    storyTitle.set(s.id, s.title);
  }

  return (
    <div className="animate-rise-in mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3 border-b border-cream-300 pb-4">
        <div>
          <span className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
            Admin
          </span>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink-900">
            Orders
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Print orders waiting for manual fulfillment. Click an order to
            download its PDFs and view shipping details.
          </p>
        </div>
      </div>

      <FilterBar current={filter} />

      {(orders ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 px-6 py-16 text-center">
          <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink-900">
            No orders here.
          </p>
          <p className="mt-1 text-sm text-ink-500">
            New paid + admin orders will land in &ldquo;Active&rdquo;.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-cream-300 bg-cream-50">
          <table className="w-full text-sm">
            <thead className="bg-cream-100 text-left text-[11px] font-medium uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Story</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {(orders ?? []).map((o) => (
                <tr key={o.id} className="hover:bg-cream-100/60">
                  <td className="whitespace-nowrap px-4 py-3 text-ink-500">
                    {new Date(o.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-ink-700">
                    {o.user_id ? emailsByUserId.get(o.user_id) ?? "—" : "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-900">
                    {storyTitle.get(o.story_id) ?? "—"}
                    {o.quantity && o.quantity > 1 ? (
                      <span className="ml-2 rounded-full bg-cream-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-700">
                        × {o.quantity}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs text-ink-700">
                    {o.amount_usd != null
                      ? `$${o.amount_usd.toFixed(2)}`
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link
                      href={`/orders/${o.id}`}
                      className="rounded-full border border-cream-300 bg-cream-50 px-3 py-1 text-xs font-medium text-ink-700 hover:border-moss-500 hover:bg-cream-100"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterBar({ current }: { current: string }) {
  const filters: { id: string; label: string }[] = [
    { id: "active", label: "Active" },
    { id: "shipped", label: "Shipped" },
    { id: "delivered", label: "Delivered" },
    { id: "failed", label: "Failed" },
    { id: "cancelled", label: "Cancelled" },
    { id: "all", label: "All" },
  ];
  return (
    <div className="mb-6 flex flex-wrap gap-1.5">
      {filters.map((f) => {
        const active = f.id === current;
        return (
          <Link
            key={f.id}
            href={`/orders?status=${f.id}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "bg-ink-900 text-cream-50"
                : "bg-cream-50 text-ink-500 border border-cream-300 hover:border-moss-500 hover:text-ink-900"
            }`}
          >
            {f.label}
          </Link>
        );
      })}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid: {
      label: "paid",
      cls: "bg-cream-200 text-ink-700",
    },
    building: {
      label: "building",
      cls: "bg-cream-200 text-ink-700",
    },
    received: {
      label: "received",
      cls: "bg-gold-100 text-gold-900",
    },
    in_progress: {
      label: "in progress",
      cls: "bg-moss-100 text-moss-700",
    },
    shipped: {
      label: "shipped",
      cls: "bg-emerald-100 text-emerald-700",
    },
    delivered: {
      label: "delivered",
      cls: "bg-emerald-200 text-emerald-800",
    },
    failed: {
      label: "failed",
      cls: "bg-rose-100 text-rose-700",
    },
    cancelled: {
      label: "cancelled",
      cls: "bg-cream-200 text-ink-500",
    },
  };
  const meta = map[status] ?? { label: status, cls: "bg-cream-200 text-ink-700" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

// Look up auth.users.email for a list of user_ids using the
// service-role client. Wrapping in a helper because the auth admin
// API isn't exposed via the regular query builder; we use the
// dedicated admin endpoint.
async function fetchEmailsByUserId(
  userIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  const admin = supabaseAdmin();
  // Batch via auth.admin.getUserById — there's no list-by-ids API,
  // so we fetch each. Order count is bounded by the page size of
  // /orders so this is fine.
  await Promise.all(
    userIds.map(async (id) => {
      try {
        const { data } = await admin.auth.admin.getUserById(id);
        const email = data.user?.email;
        if (email) out.set(id, email);
      } catch (err) {
        console.warn("[orders] failed to resolve email for", id, err);
      }
    })
  );
  return out;
}
