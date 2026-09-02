import { sql } from 'drizzle-orm';
import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { Role } from '@/types/generated';

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

  createdAt: int('created_at', { mode: 'timestamp_ms' })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
  updatedAt: int('updated_at', { mode: 'timestamp_ms' })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
});
