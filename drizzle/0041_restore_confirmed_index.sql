-- Chỉ có tác dụng ở bản demo (đã chạy bản đầu của 0040): bỏ chỉ mục rộng có marketer_id, dựng lại chỉ mục cũ như web thật.
-- Web thật chưa từng có chỉ mục rộng và vẫn còn chỉ mục cũ nên cả hai lệnh không làm gì.
DROP INDEX IF EXISTS `idx_raw_orders_pos_confirmed_mkt_money`;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_raw_orders_pos_confirmed_status_money` ON `raw_pos_orders` (`pos_id`,`first_confirmed_at`,`status_code`,`seller_id`,`net_total`,`current_total`,`total_discount`);
