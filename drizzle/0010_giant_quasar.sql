CREATE TABLE `alert_log` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`employee_id` text,
	`day` text NOT NULL,
	`sent_at` text NOT NULL,
	`message` text NOT NULL,
	`ok` integer DEFAULT true NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `idx_alert_log_owner_sent` ON `alert_log` (`owner_id`,`sent_at`);