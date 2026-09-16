CREATE INDEX `idx_raw_orders_pos_assignment`
ON `raw_pos_orders` (`pos_id`,`seller_assigned_at`,`seller_id`);
--> statement-breakpoint
CREATE INDEX `idx_raw_orders_pos_confirmation`
ON `raw_pos_orders` (`pos_id`,`first_confirmed_at`,`first_confirmed_by`);
