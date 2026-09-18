CREATE TABLE `customer_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`pos_id` text NOT NULL,
	`customer_id` text,
	`phone` text,
	`author_id` text,
	`author_name` text,
	`message` text DEFAULT '' NOT NULL,
	`order_id` text,
	`created_at` text NOT NULL,
	`updated_at` text,
	`fetched_at` text NOT NULL,
	`source` text DEFAULT 'customer' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_customer_notes_author_created` ON `customer_notes` (`author_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_customer_notes_pos_created` ON `customer_notes` (`pos_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_customer_notes_customer` ON `customer_notes` (`pos_id`,`customer_id`);--> statement-breakpoint
CREATE TABLE `pos_customers` (
	`id` text PRIMARY KEY NOT NULL,
	`pos_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`phone` text,
	`phones_json` text DEFAULT '[]' NOT NULL,
	`assigned_user_id` text,
	`level` text,
	`order_count` integer DEFAULT 0 NOT NULL,
	`succeed_order_count` integer DEFAULT 0 NOT NULL,
	`purchased_amount` integer DEFAULT 0 NOT NULL,
	`last_order_at` text,
	`inserted_at` text,
	`updated_at` text,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`note_count` integer DEFAULT 0 NOT NULL,
	`last_note_at` text,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pos_customers_assigned` ON `pos_customers` (`pos_id`,`assigned_user_id`);--> statement-breakpoint
CREATE INDEX `idx_pos_customers_phone` ON `pos_customers` (`pos_id`,`phone`);--> statement-breakpoint
CREATE INDEX `idx_pos_customers_updated` ON `pos_customers` (`pos_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `pos_shops` ADD `customers_synced_at` text;--> statement-breakpoint
ALTER TABLE `pos_shops` ADD `customer_cursor` text;