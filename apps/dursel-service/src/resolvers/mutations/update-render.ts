import { and, eq } from 'drizzle-orm';
import { GraphQLError } from 'graphql';

import { requireUser } from '@/common/auth';
import { drizzleProvider } from '@/common/drizzle-provider';
import { renderTable } from '@/drizzle-config';
import { MutationResolvers } from '@/types/generated';

/** Renaming is the only edit: everything else on a render is a fact about what was rendered. */
export const updateRender: MutationResolvers['updateRender'] = async (_, { id, input }, { env, userId }) => {
  const db = drizzleProvider(env);
  const creatorId = requireUser(userId);

  const [row] = await db
    .update(renderTable)
    .set({ ...input, updatedAt: new Date() })
    // The creator predicate is part of the WHERE, not a check afterwards, so another account's
    // render is never even read, let alone written.
    .where(and(eq(renderTable.id, id), eq(renderTable.creatorId, creatorId)))
    .returning();

  if (!row) throw new GraphQLError(`Render not found: ${id}`, { extensions: { code: 'NOT_FOUND' } });

  return row;
};
