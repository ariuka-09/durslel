import { sql } from 'drizzle-orm';
import { index, int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

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
 * This table records renders that succeeded. A failed job leaves its trace in storage and in the
 * render log, not here — there is no video to list, watch or share.
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
    url: text('url').notNull(),

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
