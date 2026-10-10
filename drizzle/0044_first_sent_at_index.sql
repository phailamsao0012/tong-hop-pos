-- Chỉ mục cho Vận đơn theo ngày gửi, cùng dạng 0038 (đã tạo được trên web thật). Tách riêng khỏi 0043 để lỗi tạo chỉ mục không chặn cột mới.
CREATE INDEX IF NOT EXISTS `idx_raw_orders_pos_sent_status_money` ON `raw_pos_orders` (`pos_id`,`first_sent_at`,`status_code`,`seller_id`,`net_total`,`current_total`,`total_discount`);
