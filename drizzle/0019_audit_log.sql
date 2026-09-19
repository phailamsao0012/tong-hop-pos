CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`user_id` text,
	`email` text,
	`name` text,
	`action` text NOT NULL,
	`target` text,
	`detail` text,
	`status` integer,
	`ip` text,
	`device` text,
	`user_agent` text
);--> statement-breakpoint
CREATE INDEX `idx_audit_at` ON `audit_log` (`at`);--> statement-breakpoint
CREATE INDEX `idx_audit_user_at` ON `audit_log` (`user_id`,`at`);--> statement-breakpoint
CREATE INDEX `idx_audit_action_at` ON `audit_log` (`action`,`at`);
