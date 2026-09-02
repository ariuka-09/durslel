PRAGMA foreign_keys=OFF;
CREATE TABLE `__new_renders` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`error` text,
	`creator_id` text NOT NULL,
	`prompt` text NOT NULL,
	`scene_class` text,
	`attempts` integer DEFAULT 1 NOT NULL,
	`duration_ms` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

-- drizzle-kit lists the NEW columns on both sides of this copy, which cannot work: `status` and
-- `error` do not exist on the old table, so the SELECT fails and the DROP below would run against
-- a half-migrated database. Every existing row is a render that already finished, so they are
-- backfilled as OK with no error rather than read from a column that is not there.
INSERT INTO `__new_renders`("id", "job_id", "title", "url", "status", "error", "creator_id", "prompt", "scene_class", "attempts", "duration_ms", "created_at", "updated_at") SELECT "id", "job_id", "title", "url", 'OK', NULL, "creator_id", "prompt", "scene_class", "attempts", "duration_ms", "created_at", "updated_at" FROM `renders`;
DROP TABLE `renders`;
ALTER TABLE `__new_renders` RENAME TO `renders`;
PRAGMA foreign_keys=ON;
CREATE UNIQUE INDEX `renders_job_id_unique` ON `renders` (`job_id`);
CREATE INDEX `renders_creator_created_idx` ON `renders` (`creator_id`,`created_at`);