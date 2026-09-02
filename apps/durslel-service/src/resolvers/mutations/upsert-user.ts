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
 *
 * This is also where the role Clerk holds gets mirrored into the table. It is taken from the same
 * verified session as the id, so it follows a promotion or a demotion in Clerk without a webhook
 * and cannot be set by the caller — `input` deliberately has no role field. The copy is for
 * display; every check is made against the token.
 */
export const upsertUser: MutationResolvers['upsertUser'] = async (_, { input }, { env, userId, role }) => {
  const db = drizzleProvider(env);
  const id = requireUser(userId);

  const [row] = await db
    .insert(userTable)
    .values({ id, ...input, role })
    .onConflictDoUpdate({ target: userTable.id, set: { ...input, role, updatedAt: new Date() } })
    .returning();

  return row;
};
