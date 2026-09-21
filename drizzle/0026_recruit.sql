CREATE TABLE IF NOT EXISTS `recruit_candidates` (
  `id` text PRIMARY KEY NOT NULL,
  `file_id` text NOT NULL,
  `file_name` text NOT NULL DEFAULT '',
  `tab` text NOT NULL DEFAULT '',
  `row_num` integer NOT NULL DEFAULT 0,
  `name` text NOT NULL DEFAULT '',
  `phone` text,
  `position` text,
  `team` text,
  `handler` text,
  `birth_year` text,
  `received_on` text,
  `cv_url` text,
  `cv_file_id` text,
  `status` text NOT NULL DEFAULT 'new',
  `data_json` text NOT NULL DEFAULT '{}',
  `first_seen_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `deleted_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_recruit_candidates_file_tab` ON `recruit_candidates` (`file_id`,`tab`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `recruit_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `candidate_id` text NOT NULL,
  `kind` text NOT NULL,
  `changes_json` text NOT NULL DEFAULT '[]',
  `created_at` text NOT NULL,
  `notified_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_recruit_events_pending` ON `recruit_events` (`notified_at`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_recruit_events_candidate` ON `recruit_events` (`candidate_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `recruit_cv` (
  `candidate_id` text PRIMARY KEY NOT NULL,
  `drive_file_id` text NOT NULL,
  `name` text NOT NULL DEFAULT '',
  `mime` text NOT NULL DEFAULT '',
  `size` integer NOT NULL DEFAULT 0,
  `telegram_file_id` text,
  `sent_at` text,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `recruit_sources` (
  `file_id` text PRIMARY KEY NOT NULL,
  `file_name` text NOT NULL DEFAULT '',
  `tabs_json` text NOT NULL DEFAULT '[]',
  `last_snapshot_at` text NOT NULL,
  `last_change_at` text
);
