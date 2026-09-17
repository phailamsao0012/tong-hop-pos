ALTER TABLE `raw_pos_order_items` ADD `is_bonus` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `raw_pos_order_items` ADD `is_composite` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `raw_pos_order_items` ADD `one_time` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `raw_json` text;--> statement-breakpoint
ALTER TABLE `stats_daily` ADD `assigned_orders` integer DEFAULT 0 NOT NULL;