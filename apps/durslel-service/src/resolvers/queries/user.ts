import { desc, eq } from 'drizzle-orm';

import { requireAdmin } from '@/common/auth';
import { drizzleProvider } from '@/common/drizzle-provider';
import { userTable } from '@/drizzle-config';
import { QueryResolvers } from '@/types/generated';

/**
 * Null rather than an error for an anonymous caller: the app asks who is signed in before it
 * knows whether anyone is, and "nobody" is a normal answer to that.
 */
export const me: QueryResolvers['me'] = async (_, __, { env, userId }) => {
  if (!userId) return null;

  const db = drizzleProvider(env);
  const [row] = await db.select().from(userTable).where(eq(userTable.id, userId));

  return row ?? null;
};

/**
 * Everyone who has signed in — the admin dashboard's left-hand list.
 *
 * Newest first, so the people who have just arrived are the ones on screen without scrolling.
 * The gate is the session token's role, not the `role` column being read out here: the column is
 * a mirror of Clerk, and letting a row grant the right to read every row would make the mirror
 * the thing that decides.
 */
export const users: QueryResolvers['users'] = async (_, __, ctx) => {
  requireAdmin(ctx);

  const db = drizzleProvider(ctx.env);

  return db.select().from(userTable).orderBy(desc(userTable.createdAt));
};
