import { eq } from 'drizzle-orm';

import { drizzleProvider } from '@/common/drizzle-provider';
import { userTable } from '@/drizzle-config';
import { RenderResolvers } from '@/types/generated';

/**
 * Render.creator, resolved only when asked for. A client that just wants a list of titles pays
 * nothing for it, which is the point of putting the relation in the schema at all.
 *
 * ponytail: one query per render. Fine while getRenders is scoped to a single caller, so every
 * row in a response shares one creator — add a DataLoader if this ever serves a mixed-author feed.
 */
export const Render: RenderResolvers = {
  creator: async (parent, _, { env }) => {
    const db = drizzleProvider(env);
    const [row] = await db.select().from(userTable).where(eq(userTable.id, parent.creatorId));

    return row ?? null;
  },
};
