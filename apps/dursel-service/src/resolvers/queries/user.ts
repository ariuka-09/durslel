import { eq } from 'drizzle-orm';

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
