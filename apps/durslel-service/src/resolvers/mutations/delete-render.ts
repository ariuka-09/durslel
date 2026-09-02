import { and, eq } from 'drizzle-orm';
import { GraphQLError } from 'graphql';

import { requireUser } from '@/common/auth';
import { drizzleProvider } from '@/common/drizzle-provider';
import { renderTable } from '@/drizzle-config';
import { MutationResolvers, Response } from '@/types/generated';

/**
 * Forgets a render. The video and source stay in R2 — this removes the row that lists them, not
 * the artifacts, so deleting from the sidebar cannot destroy something a shared link still serves.
 */
export const deleteRender: MutationResolvers['deleteRender'] = async (_, { id }, { env, userId }) => {
  const db = drizzleProvider(env);
  const creatorId = requireUser(userId);

  const [row] = await db
    .delete(renderTable)
    .where(and(eq(renderTable.id, id), eq(renderTable.creatorId, creatorId)))
    .returning();

  if (!row) throw new GraphQLError(`Render not found: ${id}`, { extensions: { code: 'NOT_FOUND' } });

  return Response.Success;
};
