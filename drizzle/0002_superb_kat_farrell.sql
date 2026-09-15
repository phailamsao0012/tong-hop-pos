CREATE TABLE `raw_pos_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`pos_id` text NOT NULL,
	`shop_id` text NOT NULL,
	`source_order_id` text NOT NULL,
	`phone` text,
	`created_at` text,
	`updated_at` text,
	`status_code` integer,
	`seller_id` text,
	`care_id` text,
	`current_total` integer,
	`first_confirmed_at` text,
	`first_confirmed_by` text,
	`status_history_json` text DEFAULT '[]' NOT NULL,
	`other_history_json` text DEFAULT '[]' NOT NULL,
	`item_json` text DEFAULT '[]' NOT NULL,
	`history_limited` integer DEFAULT false NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_raw_orders_pos_created` ON `raw_pos_orders` (`pos_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_raw_orders_pos_updated` ON `raw_pos_orders` (`pos_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_raw_orders_phone` ON `raw_pos_orders` (`pos_id`,`phone`);