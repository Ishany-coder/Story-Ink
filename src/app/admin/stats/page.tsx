import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { StatusBadge } from "../../orders/page";

export const revalidate = 0;
export const dynamic = "force-dynamic";

// Admin-only "how is the business doing" dashboard. Lives next to
// /orders so the admin has one place to see the health of the app.
//
// Everything is computed server-side from existing tables — no third
// party (PostHog/Helicone/etc), no schema changes, no chart library.
// Volumes are small enough that one round-trip + in-memory rollup is
// faster than building SQL aggregates.

interface OrderRow {
  id: string;
  status: string;
  amount_usd: number | null;
  stripe_session_id: string | null;
  created_at: string;
  shipping_address: string | null;
  quantity: number | null;
}

interface EventRow {
  order_id: string;
  status: string;
  created_at: string;
}

interface StoryRow {
  id: string;
  created_at: string;
}

const FUNNEL_STATUSES = [
  "received",
  "in_progress",
  "shipped",
  "delivered",
  "failed",
  "cancelled",
] as const;

const SPARKLINE_DAYS = 30;

export default async function AdminStatsPage() {
  if (!(await isAdmin())) notFound();

  const admin = supabaseAdmin();

  const [ordersRes, eventsRes, storiesRes, usersList] = await Promise.all([
    admin
      .from("print_orders")
      .select(
        "id, status, amount_usd, stripe_session_id, created_at, shipping_address, quantity"
      )
      .returns<OrderRow[]>(),
    admin
      .from("print_order_events")
      .select("order_id, status, created_at")
      .returns<EventRow[]>(),
    admin
      .from("stories")
      .select("id, created_at")
      .returns<StoryRow[]>(),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const orders = ordersRes.data ?? [];
  const events = eventsRes.data ?? [];
  const stories = storiesRes.data ?? [];
  const users = usersList.data?.users ?? [];

  const paidOrders = orders.filter(
    (o) => (o.amount_usd ?? 0) > 0 && o.stripe_session_id
  );
  const bypassOrders = orders.filter(
    (o) => (o.amount_usd ?? 0) === 0 || !o.stripe_session_id
  );
  const totalRevenue = paidOrders.reduce(
    (sum, o) => sum + (o.amount_usd ?? 0),
    0
  );
  const activeCount = orders.filter((o) =>
    ["received", "in_progress", "shipped"].includes(o.status)
  ).length;

  const statusCounts: Record<string, number> = {};
  for (const o of orders) {
    statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
  }
  const totalForFunnel = orders.length || 1;

  const dayBuckets = (rows: { created_at: string }[]): number[] => {
    const buckets = new Array(SPARKLINE_DAYS).fill(0);
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    for (const r of rows) {
      const t = new Date(r.created_at).getTime();
      const daysAgo = Math.floor((now - t) / dayMs);
      if (daysAgo >= 0 && daysAgo < SPARKLINE_DAYS) {
        buckets[SPARKLINE_DAYS - 1 - daysAgo]++;
      }
    }
    return buckets;
  };

  const ordersByDay = dayBuckets(orders);
  const storiesByDay = dayBuckets(stories);
  const signupsByDay = dayBuckets(
    users
      .map((u) => ({ created_at: u.created_at ?? "" }))
      .filter((u) => u.created_at)
  );

  // Time-in-stage: for each (from -> to) pair, find every order that
  // had both events and compute (later - earlier) in hours. Average +
  // median to give the admin a sense of slowness.
  const eventsByOrder = new Map<string, EventRow[]>();
  for (const e of events) {
    const arr = eventsByOrder.get(e.order_id) ?? [];
    arr.push(e);
    eventsByOrder.set(e.order_id, arr);
  }

  const stageDurations = (from: string, to: string) => {
    const hours: number[] = [];
    for (const evs of eventsByOrder.values()) {
      const a = evs.find((e) => e.status === from);
      const b = evs.find((e) => e.status === to);
      if (!a || !b) continue;
      const dt =
        (new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()) /
        (1000 * 60 * 60);
      if (dt > 0) hours.push(dt);
    }
    if (hours.length === 0) return null;
    const sorted = [...hours].sort((x, y) => x - y);
    const avg = hours.reduce((s, x) => s + x, 0) / hours.length;
    const med = sorted[Math.floor(sorted.length / 2)];
    return { avg, med, n: hours.length };
  };

  const stages = [
    { label: "Received → In progress", data: stageDurations("received", "in_progress") },
    { label: "In progress → Shipped", data: stageDurations("in_progress", "shipped") },
    { label: "Shipped → Delivered", data: stageDurations("shipped", "delivered") },
  ];

  // Country breakdown from parsed shipping_address JSON.
  const countryCounts: Record<string, number> = {};
  for (const o of orders) {
    if (!o.shipping_address) continue;
    try {
      const parsed = JSON.parse(o.shipping_address) as {
        country_code?: string;
      };
      const cc = parsed.country_code?.trim().toUpperCase();
      if (cc) countryCounts[cc] = (countryCounts[cc] ?? 0) + 1;
    } catch {
      // skip malformed
    }
  }
  const topCountries = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div className="animate-rise-in mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8 border-b border-cream-300 pb-4">
        <span className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
          Admin
        </span>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink-900">
          Stats
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          A snapshot of orders, users, and where things are going.
        </p>
      </div>

      {/* KPI row */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi
          label="Revenue"
          value={`$${totalRevenue.toFixed(2)}`}
          sub={
            bypassOrders.length > 0
              ? `${bypassOrders.length} test order${bypassOrders.length === 1 ? "" : "s"} ($0)`
              : undefined
          }
        />
        <Kpi label="Orders" value={String(orders.length)} />
        <Kpi
          label="Active"
          value={String(activeCount)}
          sub="received · in progress · shipped"
        />
        <Kpi label="Users" value={String(users.length)} />
        <Kpi label="Stories" value={String(stories.length)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Funnel */}
        <section className="rounded-2xl border border-cream-300 bg-cream-50 p-5">
          <h2 className="mb-4 text-[11px] font-medium uppercase tracking-wider text-ink-500">
            Order funnel
          </h2>
          <div className="space-y-2.5">
            {FUNNEL_STATUSES.map((s) => {
              const count = statusCounts[s] ?? 0;
              const pct = (count / totalForFunnel) * 100;
              return (
                <div key={s} className="flex items-center gap-3">
                  <div className="w-28 shrink-0">
                    <StatusBadge status={s} />
                  </div>
                  <div className="relative h-6 flex-1 overflow-hidden rounded-full bg-cream-200">
                    <div
                      className="h-full bg-moss-700 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-16 shrink-0 text-right font-mono text-xs text-ink-700">
                    {count}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Time in stage */}
        <section className="rounded-2xl border border-cream-300 bg-cream-50 p-5">
          <h2 className="mb-4 text-[11px] font-medium uppercase tracking-wider text-ink-500">
            Time in stage
          </h2>
          {stages.every((s) => !s.data) ? (
            <p className="text-sm text-ink-300">
              No completed transitions yet — move some orders through the
              funnel and the averages will show up here.
            </p>
          ) : (
            <div className="space-y-3">
              {stages.map((s) => (
                <div
                  key={s.label}
                  className="flex items-center justify-between gap-3 border-b border-cream-200 pb-2 last:border-b-0 last:pb-0"
                >
                  <span className="text-sm text-ink-700">{s.label}</span>
                  <span className="font-mono text-xs text-ink-500">
                    {s.data
                      ? `avg ${formatHours(s.data.avg)} · median ${formatHours(s.data.med)} · n=${s.data.n}`
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent activity (orders) */}
        <section className="rounded-2xl border border-cream-300 bg-cream-50 p-5">
          <h2 className="mb-4 text-[11px] font-medium uppercase tracking-wider text-ink-500">
            Orders, last 30 days
          </h2>
          <Sparkline buckets={ordersByDay} accent="moss" />
          <p className="mt-2 text-xs text-ink-500">
            {ordersByDay.reduce((s, x) => s + x, 0)} orders ·{" "}
            {storiesByDay.reduce((s, x) => s + x, 0)} stories
          </p>
        </section>

        {/* Signups */}
        <section className="rounded-2xl border border-cream-300 bg-cream-50 p-5">
          <h2 className="mb-4 text-[11px] font-medium uppercase tracking-wider text-ink-500">
            Signups, last 30 days
          </h2>
          <Sparkline buckets={signupsByDay} accent="ink" />
          <p className="mt-2 text-xs text-ink-500">
            {signupsByDay.reduce((s, x) => s + x, 0)} new accounts
          </p>
        </section>

        {/* Countries */}
        <section className="rounded-2xl border border-cream-300 bg-cream-50 p-5 lg:col-span-2">
          <h2 className="mb-4 text-[11px] font-medium uppercase tracking-wider text-ink-500">
            Where customers are shipping to
          </h2>
          {topCountries.length === 0 ? (
            <p className="text-sm text-ink-300">
              No shipping addresses on file yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {topCountries.map(([cc, n]) => (
                <div
                  key={cc}
                  className="flex items-center justify-between rounded-xl border border-cream-300 bg-cream-100 px-3 py-2"
                >
                  <span className="text-sm font-medium text-ink-900">
                    {flagFor(cc)} {cc}
                  </span>
                  <span className="font-mono text-xs text-ink-500">
                    {n} order{n === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-cream-300 bg-cream-50 px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
        {label}
      </div>
      <div className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold text-ink-900">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-ink-300">{sub}</div>}
    </div>
  );
}

function Sparkline({
  buckets,
  accent,
}: {
  buckets: number[];
  accent: "moss" | "ink";
}) {
  const max = Math.max(1, ...buckets);
  const fill = accent === "moss" ? "bg-moss-700" : "bg-ink-900";
  return (
    <div className="flex h-16 items-end gap-1">
      {buckets.map((n, i) => {
        const h = Math.max(2, (n / max) * 100);
        return (
          <div
            key={i}
            title={`${n} on day ${SPARKLINE_DAYS - i} ago`}
            className={`flex-1 rounded-sm ${n > 0 ? fill : "bg-cream-200"}`}
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

// Convert ISO 3166-1 alpha-2 country code to its flag emoji. Tiny
// helper — pure unicode arithmetic, no dependency.
function flagFor(cc: string): string {
  if (cc.length !== 2) return "🌐";
  const A = 0x1f1e6;
  const a = "A".charCodeAt(0);
  return String.fromCodePoint(
    A + (cc.charCodeAt(0) - a),
    A + (cc.charCodeAt(1) - a)
  );
}
