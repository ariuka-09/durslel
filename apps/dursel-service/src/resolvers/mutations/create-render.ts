import { requireUser } from '@/common/auth';
import { drizzleProvider } from '@/common/drizzle-provider';
import { renderTable, userTable } from '@/drizzle-config';
import { MutationResolvers } from '@/types/generated';

/**
 * Records a finished render.
 *
 * Idempotent on jobId. The render pipeline can retry the call after a network wobble, and a
 * second attempt at the same job must not fail on the unique constraint or create a twin.
 */
export const createRender: MutationResolvers['createRender'] = async (_, { input }, { env, userId }) => {
  const db = drizzleProvider(env);
  const creatorId = requireUser(userId);

  // renders.creator_id is a foreign key, so the user row has to exist first. Details are left to
  // upsertUser — what matters here is that a first-ever render cannot fail for lack of a profile.
  await db.insert(userTable).values({ id: creatorId }).onConflictDoNothing();

  const values = { ...input, creatorId, attempts: input.attempts ?? 1 };

  const [row] = await db
    .insert(renderTable)
    .values(values)
    .onConflictDoUpdate({ target: renderTable.jobId, set: { ...values, updatedAt: new Date() } })
    .returning();

  return row;
};
