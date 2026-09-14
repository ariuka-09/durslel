import { sql } from 'drizzle-orm';
import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { Role, SubscriptionTier } from '@/types/generated';

/**
 * A person who has signed in.
 *
 * The id is Clerk's own (`user_...`) rather than a generated one: Clerk owns the identity, and
 * minting a second id here would mean every lookup from a session had to translate between the
 * two. Rows are written on demand from the session rather than by webhook, so a user exists here
 * from their first authenticated request onward.
 *
 * Name, email and role are a cache of what Clerk holds. They can go stale — Clerk remains the
 * source of truth — and are stored anyway so listing renders does not need a Clerk API call per
 * row.
 */
export const userTable = sqliteTable('users', {
  id: text('id').primaryKey().notNull(),

  email: text('email'),
  firstName: text('first_name'),
  lastName: text('last_name'),

  /**
   * Mirrored from the session token on every sign-in, never set from user input. Admin is decided
   * by Clerk's public metadata and enforced against the token, so a row edited here promotes
   * nobody — this copy exists so the admin list can show who is one without a Clerk call per row.
   */
  role: text('role').$type<Role>().default(Role.User).notNull(),

  /**
   * What was last paid for. Never cleared on expiry — `subscriptionUntil` is what decides whether
   * it is in force, and keeping the tier means a lapsed subscriber who pays again returns to the
   * plan they knew rather than to a blank.
   */
  subscription: text('subscription').$type<SubscriptionTier>().default(SubscriptionTier.Free).notNull(),

  /** End of the paid period. Null for someone who has never paid. */
  subscriptionUntil: int('subscription_until', { mode: 'timestamp_ms' }),

  /**
   * The PaymentIntent that last extended the subscription. Wire can deliver the same event twice,
   * and this column is what makes the second delivery a no-op instead of another 30 days.
   */
  subscriptionPayment: text('subscription_payment'),

  createdAt: int('created_at', { mode: 'timestamp_ms' })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
  updatedAt: int('updated_at', { mode: 'timestamp_ms' })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
});

/**
 * A user as the database holds one — no computed fields.
 *
 * Named here because codegen maps the GraphQL `User` onto it: resolvers return rows, and anything
 * the schema exposes that is not a column (subscription's expiry, dailyLimit) is filled in by a
 * field resolver. Without the mapping, adding a computed field to the schema breaks every
 * resolver that returns a row.
 */
export type UserRow = typeof userTable.$inferSelect;
