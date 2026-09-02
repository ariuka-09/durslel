import { and, eq } from 'drizzle-orm';
import { GraphQLError } from 'graphql';

import { requireUser } from '@/common/auth';
import { drizzleProvider } from '@/common/drizzle-provider';
import { renderTable } from '@/drizzle-config';
import { MutationResolvers } from '@/types/generated';

/**
 * Records how a render turned out.
 *
 * Called by the renderer once manim is done, authenticating as the service — the request that
 * started the job is long gone by then, so there is no session left to forward.
 *
 * Scoped to the creator like every other single-render write, so a renderer naming the wrong user
 * cannot overwrite somebody else's row.
 */
export const completeRender: MutationResolvers['completeRender'] = async (_, { jobId, input }, { env, userId }) => {
  const db = drizzleProvider(env);
  const creatorId = requireUser(userId);

  const [row] = await db
    .update(renderTable)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(renderTable.jobId, jobId), eq(renderTable.creatorId, creatorId)))
    .returning();

  if (!row) throw new GraphQLError(`Render not found: ${jobId}`, { extensions: { code: 'NOT_FOUND' } });

  return row;
};
