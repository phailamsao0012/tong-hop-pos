-- Chỉ mục một phần, gần rỗng khi cột mới còn NULL.
CREATE INDEX IF NOT EXISTS `idx_raw_orders_pos_undeliverable` ON `raw_pos_orders` (`pos_id`,`first_undeliverable_at`,`status_code`) WHERE `first_undeliverable_at` IS NOT NULL;
