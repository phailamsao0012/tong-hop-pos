CREATE TABLE `alert_rules` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`threshold` integer DEFAULT 40 NOT NULL,
	`min_received` integer DEFAULT 20 NOT NULL,
	`cooldown_minutes` integer DEFAULT 60 NOT NULL,
	`shift_start` text DEFAULT '08:00' NOT NULL,
	`shift_end` text DEFAULT '12:00' NOT NULL,
	`repeat` integer DEFAULT false NOT NULL,
	`chat_id` text,
	`employee_ids_json` text DEFAULT '[]' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`pos_id` text NOT NULL,
	`phone` text NOT NULL,
	`employee_id` text NOT NULL,
	`assigned_at` text NOT NULL,
	`batch_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_assignments_period_employee` ON `assignments` (`assigned_at`,`employee_id`);--> statement-breakpoint
CREATE INDEX `idx_assignments_pos_phone` ON `assignments` (`pos_id`,`phone`);--> statement-breakpoint
CREATE TABLE `customers` (
	`key` text PRIMARY KEY NOT NULL,
	`pos_id` text NOT NULL,
	`phone` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_customers_pos_phone` ON `customers` (`pos_id`,`phone`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`pos_id` text NOT NULL,
	`phone` text NOT NULL,
	`closer_id` text NOT NULL,
	`created_at` text NOT NULL,
	`confirmed_at` text,
	`delivered_at` text,
	`status` text NOT NULL,
	`hot_value` integer DEFAULT 0 NOT NULL,
	`current_value` integer DEFAULT 0 NOT NULL,
	`net_merchandise` integer DEFAULT 0 NOT NULL,
	`return_value` integer DEFAULT 0 NOT NULL,
	`items_json` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_orders_confirmed_closer` ON `orders` (`confirmed_at`,`closer_id`);--> statement-breakpoint
CREATE INDEX `idx_orders_created_status` ON `orders` (`created_at`,`status`);--> statement-breakpoint
CREATE INDEX `idx_orders_pos_phone` ON `orders` (`pos_id`,`phone`);--> statement-breakpoint
CREATE TABLE `pos_shops` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`shop_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_sync_at` text,
	`history_start` text,
	`last_error` text,
	`cursor` text
);
--> statement-breakpoint
CREATE TABLE `report_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`config_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_report_presets_owner` ON `report_presets` (`owner_id`);--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`pos_id` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`records` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `idx_sync_runs_pos_started` ON `sync_runs` (`pos_id`,`started_at`);