import { and, desc, eq } from 'drizzle-orm';

import { requireAdmin, requireUser } from '@/common/auth';
import { drizzleProvider } from '@/common/drizzle-provider';
import { renderTable } from '@/drizzle-config';
import { QueryResolvers } from '@/types/generated';

/**
 * Renders newest first — the one query both the history sidebar and the admin dashboard make.
 *
 * Defaults to the caller's own. Naming someone else is what the dashboard does, and is the only
 * thing here that needs more than a session, so it is the only thing gated: asking for your own
 * id explicitly is still just asking for your own.
 */
export const getRenders: QueryResolvers['getRenders'] = async (_, { creatorId }, ctx) => {
  const own = requireUser(ctx.userId);
  if (creatorId && creatorId !== own) requireAdmin(ctx);

  const db = drizzleProvider(ctx.env);
  const target = creatorId ?? own;

  return db.select().from(renderTable).where(eq(renderTable.creatorId, target)).orderBy(desc(renderTable.createdAt));
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
