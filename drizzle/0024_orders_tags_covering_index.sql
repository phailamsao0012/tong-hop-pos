CREATE INDEX IF NOT EXISTS `idx_raw_orders_pos_status_phone_tags` ON `raw_pos_orders` (`pos_id`,`status_code`,`phone`,`created_at`,`tags_json`);
