"use client";

import { useAuth } from "@clerk/nextjs";

import { Role } from "@/generated";

/**
 * Whether to show this browser the admin dashboard.
 *
 * Read from the same session-token claim the Worker enforces, rather than from the `role` on the
 * user's row, so the two can never disagree — offering a dashboard the service then refuses is
 * worse than offering no link at all. Cosmetic either way: this only decides what is drawn, and
 * every query it leads to is checked again server-side.
 *
 * False for everyone until the Clerk session-token claim described in durslel-service's
 * common/auth.ts is configured, which is the same direction the server fails.
 */
export function useIsAdmin(): boolean {
  const { sessionClaims } = useAuth();
  const metadata = sessionClaims?.metadata as { role?: unknown } | null | undefined;

  return (metadata?.role ?? sessionClaims?.role) === Role.Admin;
}
