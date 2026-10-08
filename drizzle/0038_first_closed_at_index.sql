-- Chỉ mục cho báo cáo theo giờ chốt (giống 0027 cho first_confirmed_at).
CREATE INDEX IF NOT EXISTS `idx_raw_orders_pos_closed_status_money` ON `raw_pos_orders` (`pos_id`,`first_closed_at`,`status_code`,`seller_id`,`net_total`,`current_total`,`total_discount`);
