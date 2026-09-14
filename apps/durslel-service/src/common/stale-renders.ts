import { and, eq, inArray } from 'drizzle-orm';

import { Db } from '@/common/drizzle-provider';
import { renderTable } from '@/drizzle-config';
import { RenderStatus } from '@/types/generated';

type Row = typeof renderTable.$inferSelect;

/**
 * How long a row may sit PENDING before it is presumed dead.
 *
 * A render's own ceiling is RENDER_BUDGET_MS — 240s in the container's Dockerfile — so anything
 * past that is not slow, it is gone. The margin on top covers a cold start of the 438 MB image
 * in front of the render, which the budget clock does not include.
 */
const STALE_MS = 6 * 60 * 1000;

const STALE_ERROR =
  'The renderer stopped before this finished. Nothing was rendered, and it does not count against the daily limit.';

/**
 * Marks abandoned renders failed, and returns the rows as they now stand.
 *
 * Renders run inside a container, detached from the request that started them, and the row is
 * written only when one ends. So when the container dies mid-render — a deploy rolling its
 * instance, an OOM, a hung upstream call — nothing is left to write a terminal status, and the
 * row stays PENDING forever: the browser polls a spinner that will never resolve, and the row
 * counts against the account's daily quota for a render that never happened. That is exactly
 * what happened on 2026-09-06.
 *
 * Reconciled here, on the read, rather than by a cron or a reaper: every path that can show a
 * pending render already comes through these queries, so this is the one place that catches all
 * of them, and it costs a write only on the rare read that finds one.
 *
 * `attempts: 0` is load-bearing — startRender's daily count skips rows that never ran, so this is
 * also what hands the render back.
 */
export const expireStale = async (db: Db, rows: Row[]): Promise<Row[]> => {
  const cutoff = Date.now() - STALE_MS;
  const dead = rows.filter((row) => row.status === RenderStatus.Pending && row.createdAt.getTime() < cutoff);
  if (!dead.length) return rows;

  const patch = {
    status: RenderStatus.Failed,
    error: STALE_ERROR,
    attempts: 0,
    durationMs: 0,
    updatedAt: new Date(),
  };

  // Still-PENDING is part of the condition, not just the filter above: a container that finished
  // between the select and this write has already put the real answer in the row, and overwriting
  // it with a failure would throw away a video that exists.
  await db
    .update(renderTable)
    .set(patch)
    .where(
      and(
        inArray(
          renderTable.id,
          dead.map((row) => row.id),
        ),
        eq(renderTable.status, RenderStatus.Pending),
      ),
    );

  const ids = new Set(dead.map((row) => row.id));

  return rows.map((row) => (ids.has(row.id) ? { ...row, ...patch } : row));
};
