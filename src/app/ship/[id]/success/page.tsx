import Link from "next/link";
import ShipSuccessConfirm from "@/components/ShipSuccessConfirm";

export const revalidate = 0;

// Stripe redirects customers here after Checkout succeeds with
// ?session_id=... in the URL. The confirm handshake (verify payment +
// fire Lulu print job) happens client-side via ShipSuccessConfirm so the
// user sees a live "processing" state instead of a blank SSR page.

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

  if (!sessionId) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-rose-600">
          Missing Stripe session
        </h1>
        <p className="mt-2 text-sm font-bold text-purple-400">
          Open your story and try ordering again.
        </p>
        <Link
          href={`/read/${id}`}
          className="mt-6 inline-block rounded-2xl bg-purple-500 px-5 py-2 text-sm font-black uppercase text-white hover:bg-purple-600"
        >
          Back to story
        </Link>
      </div>
    );
  }

  return <ShipSuccessConfirm storyId={id} sessionId={sessionId} />;
}
