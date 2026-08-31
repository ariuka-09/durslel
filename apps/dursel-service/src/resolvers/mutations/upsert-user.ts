import { drizzleProvider } from '@/common/drizzle-provider';
import { requireUser } from '@/common/auth';
import { userTable } from '@/drizzle-config';
import { MutationResolvers } from '@/types/generated';

/**
 * Creates the caller's row or refreshes the cached Clerk profile on it.
 *
 * The id comes from the verified session and never from the input, so this cannot be pointed at
 * another user. Written on sign-in rather than by webhook: one fewer endpoint to secure, and the
 * row is guaranteed present by the time the same request goes on to read anything.
 */
export const upsertUser: MutationResolvers['upsertUser'] = async (_, { input }, { env, userId }) => {
  const db = drizzleProvider(env);
  const id = requireUser(userId);

  const [row] = await db
    .insert(userTable)
    .values({ id, ...input })
    .onConflictDoUpdate({ target: userTable.id, set: { ...input, updatedAt: new Date() } })
    .returning();

  return row;
};
