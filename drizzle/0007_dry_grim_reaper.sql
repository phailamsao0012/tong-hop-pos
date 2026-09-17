CREATE TABLE IF NOT EXISTS `stats_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`pos_id` text NOT NULL,
	`day` text NOT NULL,
	`seller_id` text DEFAULT '' NOT NULL,
	`orders` integer DEFAULT 0 NOT NULL,
	`deleted_orders` integer DEFAULT 0 NOT NULL,
	`gross` integer DEFAULT 0 NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`net` integer DEFAULT 0 NOT NULL,
	`shipping_fee` integer DEFAULT 0 NOT NULL,
	`cod` integer DEFAULT 0 NOT NULL,
	`closed_orders` integer DEFAULT 0 NOT NULL,
	`closed_gross` integer DEFAULT 0 NOT NULL,
	`closed_discount` integer DEFAULT 0 NOT NULL,
	`closed_net` integer DEFAULT 0 NOT NULL,
	`closed_shipping_fee` integer DEFAULT 0 NOT NULL,
	`closed_quantity` integer DEFAULT 0 NOT NULL,
	`new_orders` integer DEFAULT 0 NOT NULL,
	`new_net` integer DEFAULT 0 NOT NULL,
	`confirmed_orders` integer DEFAULT 0 NOT NULL,
	`confirmed_net` integer DEFAULT 0 NOT NULL,
	`shipping_orders` integer DEFAULT 0 NOT NULL,
	`shipping_net` integer DEFAULT 0 NOT NULL,
	`delivered_orders` integer DEFAULT 0 NOT NULL,
	`delivered_net` integer DEFAULT 0 NOT NULL,
	`returned_orders` integer DEFAULT 0 NOT NULL,
	`returned_net` integer DEFAULT 0 NOT NULL,
	`cancelled_orders` integer DEFAULT 0 NOT NULL,
	`cancelled_net` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_stats_daily_pos_day` ON `stats_daily` (`pos_id`,`day`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stats_daily_product` (
	`id` text PRIMARY KEY NOT NULL,
	`pos_id` text NOT NULL,
	`day` text NOT NULL,
	`product_id` text DEFAULT '' NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`orders` integer DEFAULT 0 NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`closed_quantity` integer DEFAULT 0 NOT NULL,
	`closed_total` integer DEFAULT 0 NOT NULL,
	`delivered_quantity` integer DEFAULT 0 NOT NULL,
	`delivered_total` integer DEFAULT 0 NOT NULL,
	`returned_quantity` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_stats_daily_product_pos_day` ON `stats_daily_product` (`pos_id`,`day`);