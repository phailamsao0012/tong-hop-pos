CREATE INDEX IF NOT EXISTS `idx_raw_orders_pos_confirmed_status_money` ON `raw_pos_orders` (`pos_id`,`first_confirmed_at`,`status_code`,`seller_id`,`net_total`,`current_total`,`total_discount`);
