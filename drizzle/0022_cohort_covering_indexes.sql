CREATE INDEX IF NOT EXISTS `idx_raw_orders_pos_created_status_phone` ON `raw_pos_orders` (`pos_id`,`created_at`,`status_code`,`phone`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_customer_stats_pos_first_success_seller` ON `customer_stats` (`pos_id`,`first_success_at`,`seller_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_customer_stats_pos_seller_success` ON `customer_stats` (`pos_id`,`seller_id`,`success_orders`);
