CREATE TABLE `customer_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`pos_id` text NOT NULL,
	`phone` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`customer_id` text,
	`seller_id` text,
	`first_order_at` text,
	`last_order_at` text,
	`first_assigned_at` text,
	`orders` integer DEFAULT 0 NOT NULL,
	`closed_orders` integer DEFAULT 0 NOT NULL,
	`success_orders` integer DEFAULT 0 NOT NULL,
	`success_gross` integer DEFAULT 0 NOT NULL,
	`success_net` integer DEFAULT 0 NOT NULL,
	`success_quantity` integer DEFAULT 0 NOT NULL,
	`returned_orders` integer DEFAULT 0 NOT NULL,
	`cancelled_orders` integer DEFAULT 0 NOT NULL,
	`first_success_at` text,
	`last_success_at` text,
	`product_kinds` integer DEFAULT 0 NOT NULL,
	`products_json` text DEFAULT '[]' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_customer_stats_pos_last_success` ON `customer_stats` (`pos_id`,`last_success_at`);--> statement-breakpoint
CREATE INDEX `idx_customer_stats_pos_seller` ON `customer_stats` (`pos_id`,`seller_id`);