// Admin identity + gate.
//
// Admin is identified by env vars, NEVER by client input. The check
// runs server-side on every admin route (the navbar tab also relies on
// the same check, so non-admins never even see "Orders" in the UI).
//
// Hardening:
//   - Both `ADMIN_EMAIL` and (optionally) `ADMIN_USER_ID` must match if
//     the latter is set. ADMIN_USER_ID is the Supabase auth.users.id
//     UUID — even if email auth got compromised somewhere upstream, the
//     UUID gate still holds.
//   - We require email_confirmed_at to be non-null. A fresh signup that
//     hasn't clicked the confirm link can't pass.
//   - Non-admins hitting an admin route get a 404, not 403, so the
//     route's existence isn't leaked.
//
// To set up:
//   1. Add ADMIN_EMAIL=ishanghosh0106@gmail.com to .env.local
//   2. (Recommended) Look up your auth.users.id in Supabase dashboard,
//      add ADMIN_USER_ID=<uuid> to .env.local for belt-and-suspenders.

import { NextResponse } from "next/server";
import {
  getCurrentUser,
  UnauthorizedError,
} from "@/lib/supabase-server";
import type { User } from "@supabase/supabase-js";

export class NotAdminError extends UnauthorizedError {
  constructor() {
    super("Not an admin");
    this.name = "NotAdminError";
  }
}

// Pure check — call from server contexts only. Returns false for any
// of: no env configured, no signed-in user, email mismatch, user UUID
// mismatch (when ADMIN_USER_ID is set), or unconfirmed email.
export function isAdminUser(user: User | null | undefined): boolean {
  if (!user) return false;

  const requiredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!requiredEmail) return false;

  const userEmail = user.email?.trim().toLowerCase() ?? "";
  if (userEmail !== requiredEmail) return false;

  // The auth user object exposes `email_confirmed_at` (Supabase Auth)
  // — a fresh signup that hasn't clicked the link yet has it as null.
  // We refuse to recognize an unconfirmed account as admin.
  if (!user.email_confirmed_at) return false;

  // Optional belt-and-suspenders UUID gate.
  const requiredId = process.env.ADMIN_USER_ID?.trim();
  if (requiredId && user.id !== requiredId) return false;

  return true;
}

// Convenience for server components / route handlers that want to
// gate behavior on admin status without throwing.
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return isAdminUser(user);
}

// Throw-style guard for API routes. Returns the admin user on
// success; throws NotAdminError otherwise. The catch in your handler
// should turn the error into a 404 response (never 403 — we don't
// leak the route's existence).
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!isAdminUser(user)) throw new NotAdminError();
  return user as User;
}

// Standard 404 response for non-admins hitting an admin API route.
// Use this in catch blocks: `if (err instanceof NotAdminError) return notFoundJson()`
export function notFoundJson(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
