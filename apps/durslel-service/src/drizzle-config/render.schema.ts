import { sql } from 'drizzle-orm';
import { index, int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import { RenderStatus } from '@/types/generated';

import { userTable } from './user.schema';

/**
 * One finished render.
 *
 * Two identifiers on purpose. `id` is this table's own and is what the API exposes. `jobId` is the
 * storage key — the R2 prefix holding out.mp4, scene.py, prompt.txt and manim.log — and is what
 * makes a row resolvable to its artifacts. Collapsing them would either leak a storage detail into
 * the API or leave a row unable to find its own video.
 *
 * `url` is derivable from `jobId` today, and is stored anyway: it is what was actually handed to
 * the user, so a later change to how videos are served cannot silently invalidate old rows.
 *
 * Rows are written when a render is requested rather than when it completes, so a job in flight
 * and a job that failed are both visible. `status` says which.
 */
export const renderTable = sqliteTable(
  'renders',
  {
    id: text('id')
      .$defaultFn(() => nanoid())
      .primaryKey()
      .notNull(),

    jobId: text('job_id').notNull().unique(),
    title: text('title').notNull(),

    /**
     * Null until the render finishes. A row is created the moment one is requested, so the UI has
     * something to show a progress bar against; the video only exists at the end.
     */
    url: text('url'),

    /**
     * PENDING while manim runs, then OK or FAILED. This is what the client polls on — without it
     * a caller cannot tell a render still working from one that died.
     */
    status: text('status').$type<RenderStatus>().default(RenderStatus.Pending).notNull(),

    /** Why it failed, when it did. Null on every other status. */
    error: text('error'),

    creatorId: text('creator_id')
      .notNull()
      .references(() => userTable.id),

    // The prompt as typed. `title` is a display-length version of it, so keeping both means the
    // original survives even after the title is shortened or edited.
    prompt: text('prompt').notNull(),

    // Which manim Scene class was rendered, and how many generation attempts it took. Both come
    // straight off the render and are the first things looked at when output disappoints.
    sceneClass: text('scene_class'),
    attempts: int('attempts').default(1).notNull(),
    durationMs: int('duration_ms'),

    createdAt: int('created_at', { mode: 'timestamp_ms' })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
    updatedAt: int('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
  },
  // The sidebar's only query is "this user's renders, newest first".
  (table) => [index('renders_creator_created_idx').on(table.creatorId, table.createdAt)],
);
