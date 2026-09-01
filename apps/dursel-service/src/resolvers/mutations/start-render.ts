import { eq } from 'drizzle-orm';

import { requireUser } from '@/common/auth';
import { drizzleProvider } from '@/common/drizzle-provider';
import { makeJobId, makeTitle } from '@/common/job-id';
import { startRendering } from '@/common/renderer';
import { renderTable, userTable } from '@/drizzle-config';
import { MutationResolvers, RenderStatus } from '@/types/generated';

/**
 * Requests a render.
 *
 * Returns the moment the row is written, not when manim finishes — a render runs for minutes, and
 * a request held open that long is cut by every timeout between here and the browser. The client
 * polls the PENDING row instead, which also means closing the tab no longer loses the result.
 */
export const startRender: MutationResolvers['startRender'] = async (_, { prompt }, { env, userId, waitUntil }) => {
  const db = drizzleProvider(env);
  const creatorId = requireUser(userId);

  // renders.creator_id is a foreign key, so the user row has to exist first.
  await db.insert(userTable).values({ id: creatorId }).onConflictDoNothing();

  const jobId = makeJobId(prompt);

  const [row] = await db
    .insert(renderTable)
    .values({ jobId, title: makeTitle(prompt), prompt, creatorId, status: RenderStatus.Pending })
    .returning();

  // Handed off rather than awaited. A renderer that cannot be reached marks the row FAILED here,
  // because otherwise the client would poll forever on a job nobody is doing.
  waitUntil(
    startRendering(env, { jobId, prompt, userId: creatorId }).catch((error: unknown) =>
      db
        .update(renderTable)
        .set({
          status: RenderStatus.Failed,
          error: error instanceof Error ? error.message : String(error),
          updatedAt: new Date(),
        })
        .where(eq(renderTable.jobId, jobId)),
    ),
  );

  return row;
};
