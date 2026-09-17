CREATE TABLE `targets` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`scope` text NOT NULL,
	`ref_id` text NOT NULL,
	`revenue` integer DEFAULT 0 NOT NULL,
	`closed_orders` integer DEFAULT 0 NOT NULL,
	`updated_by` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_targets_month` ON `targets` (`month`,`scope`);