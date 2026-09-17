CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `telegram_requests` (
	`chat_id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`username` text,
	`requested_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_at` text
);
--> statement-breakpoint
ALTER TABLE `telegram_chats` ADD `role` text DEFAULT 'member' NOT NULL;