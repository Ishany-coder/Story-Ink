import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import AdminSupportInbox from "@/components/AdminSupportInbox";

export const revalidate = 0;
export const dynamic = "force-dynamic";

// Admin support inbox. Server-gates non-admins to 404 (route's
// existence isn't leaked) and hands off to the client component
// that does the actual polling + reply flow.

export default async function AdminSupportPage() {
  if (!(await isAdmin())) notFound();
  return <AdminSupportInbox />;
}
