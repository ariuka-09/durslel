import { and, eq, gte } from 'drizzle-orm';
import { GraphQLError } from 'graphql';

import { requireUser } from '@/common/auth';
import { drizzleProvider } from '@/common/drizzle-provider';
import { makeJobId, makeTitle } from '@/common/job-id';
import { startRendering } from '@/common/renderer';
import { renderTable, userTable } from '@/drizzle-config';
import { MutationResolvers, RenderStatus, Role } from '@/types/generated';

/**
 * Renders one account may start per day. A render costs a container minutes long, so this is
 * the whole of the abuse story: without it one signed-in account can occupy the renderer
 * indefinitely at no cost to itself.
 *
 * Failed renders count. What is being rationed is renderer time, and a job that failed spent
 * it just the same.
 */
const DAILY_LIMIT = 3;

/**
 * Where the day boundary sits: midnight GMT+8, which is 16:00 UTC.
 *
 * A UTC day would reset mid-afternoon for everyone actually using this, and the fixed offset
 * avoids needing to know each caller's own zone — the quota resets at the same instant for
 * everyone, and that instant is a sensible hour where the users are.
 */
const RESET_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Requests a render.
 *
 * Returns the moment the row is written, not when manim finishes — a render runs for minutes, and
 * a request held open that long is cut by every timeout between here and the browser. The client
 * polls the PENDING row instead, which also means closing the tab no longer loses the result.
 */
export const startRender: MutationResolvers['startRender'] = async (
  _,
  { prompt },
  { env, userId, role, waitUntil },
) => {
  const db = drizzleProvider(env);
  const creatorId = requireUser(userId);

  // Admins are exempt. The limit rations renderer time between users, and the account that can
  // already read and delete everyone's renders is not the one it is guarding against — it is the
  // account that needs to reproduce a report without waiting for tomorrow.
  //
  // Read off the session token like every other admin check here, so revoking someone takes
  // effect on their next token refresh rather than needing anything updated in the database.
  if (role !== Role.Admin) {
    // ponytail: fixed GMT+8 offset, per-user timezone if anyone outside it complains.
    const dayStart = new Date(Math.floor((Date.now() + RESET_OFFSET_MS) / DAY_MS) * DAY_MS - RESET_OFFSET_MS);

    // Covered by renders_creator_created_idx, and at most DAILY_LIMIT-ish rows come back.
    // ponytail: read-then-write, so two simultaneous requests can both pass at the limit. A
    // Durable Object per user would close that; one extra render is not worth one.
    const today = await db
      .select({ id: renderTable.id })
      .from(renderTable)
      .where(and(eq(renderTable.creatorId, creatorId), gte(renderTable.createdAt, dayStart)));

    if (today.length >= DAILY_LIMIT) {
      throw new GraphQLError(`Daily limit reached — ${DAILY_LIMIT} renders per day. Try again tomorrow.`, {
        extensions: { code: 'RATE_LIMITED' },
      });
    }
  }

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
