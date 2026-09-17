CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `people_links` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`pos_id` text NOT NULL,
	`user_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_people_links_person` ON `people_links` (`person_id`);--> statement-breakpoint
CREATE INDEX `idx_people_links_pos_user` ON `people_links` (`pos_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `pos_products` (
	`id` text PRIMARY KEY NOT NULL,
	`pos_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variation_id` text NOT NULL,
	`product_name` text DEFAULT '' NOT NULL,
	`variation_name` text DEFAULT '' NOT NULL,
	`sku` text,
	`retail_price` integer,
	`category_json` text DEFAULT '[]' NOT NULL,
	`is_hidden` integer DEFAULT false NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pos_products_pos` ON `pos_products` (`pos_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `idx_pos_products_variation` ON `pos_products` (`pos_id`,`variation_id`);--> statement-breakpoint
CREATE TABLE `pos_users` (
	`id` text PRIMARY KEY NOT NULL,
	`pos_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`email` text,
	`phone` text,
	`is_active` integer DEFAULT true NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pos_users_pos` ON `pos_users` (`pos_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `raw_pos_order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`pos_id` text NOT NULL,
	`product_id` text,
	`variation_id` text,
	`name` text DEFAULT '' NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`returned_count` integer DEFAULT 0 NOT NULL,
	`retail_price` integer DEFAULT 0 NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`line_total` integer DEFAULT 0 NOT NULL,
	`seller_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_raw_items_order` ON `raw_pos_order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_raw_items_pos_product` ON `raw_pos_order_items` (`pos_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`user_agent` text
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_login_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `pos_shops` ADD `enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `pos_shops` ADD `users_synced_at` text;--> statement-breakpoint
ALTER TABLE `pos_shops` ADD `products_synced_at` text;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `customer_name` text;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `customer_id` text;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `total_discount` integer;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `shipping_fee` integer;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `cod` integer;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `money_to_collect` integer;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `total_quantity` integer;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `sub_status` integer;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `creator_id` text;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `last_editor_id` text;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `marketer_id` text;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `care_assigned_at` text;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `delivered_at` text;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `returned_at` text;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `cancelled_at` text;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `last_status_at` text;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `order_source` text;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `warehouse_id` text;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `tags_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `note` text;--> statement-breakpoint
ALTER TABLE `raw_pos_orders` ADD `is_removed` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_raw_orders_pos_status_created` ON `raw_pos_orders` (`pos_id`,`status_code`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_raw_orders_pos_customer` ON `raw_pos_orders` (`pos_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_raw_orders_pos_assignment` ON `raw_pos_orders` (`pos_id`,`seller_assigned_at`,`seller_id`);--> statement-breakpoint
CREATE INDEX `idx_raw_orders_pos_confirmation` ON `raw_pos_orders` (`pos_id`,`first_confirmed_at`,`first_confirmed_by`);