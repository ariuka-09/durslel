import { and, desc, eq } from 'drizzle-orm';

import { requireUser } from '@/common/auth';
import { drizzleProvider } from '@/common/drizzle-provider';
import { renderTable } from '@/drizzle-config';
import { QueryResolvers } from '@/types/generated';

/** The caller's renders, newest first — the one query the history sidebar makes. */
export const getRenders: QueryResolvers['getRenders'] = async (_, __, { env, userId }) => {
  const db = drizzleProvider(env);
  const creatorId = requireUser(userId);

  return db.select().from(renderTable).where(eq(renderTable.creatorId, creatorId)).orderBy(desc(renderTable.createdAt));
};

/**
 * Every single-render lookup is scoped to the caller, so another account's id reads as absent
 * rather than forbidden. Confirming that someone else's render exists is itself a leak.
 */
export const getRender: QueryResolvers['getRender'] = async (_, { id }, { env, userId }) => {
  const db = drizzleProvider(env);
  const creatorId = requireUser(userId);

  const [row] = await db
    .select()
    .from(renderTable)
    .where(and(eq(renderTable.id, id), eq(renderTable.creatorId, creatorId)));

  return row ?? null;
};

export const getRenderByJobId: QueryResolvers['getRenderByJobId'] = async (_, { jobId }, { env, userId }) => {
  const db = drizzleProvider(env);
  const creatorId = requireUser(userId);

  const [row] = await db
    .select()
    .from(renderTable)
    .where(and(eq(renderTable.jobId, jobId), eq(renderTable.creatorId, creatorId)));

  return row ?? null;
};
