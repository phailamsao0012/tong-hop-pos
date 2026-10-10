-- Đồng bộ khách tra ghi chú theo (pos_id, customer_id): trước chỉ có chỉ mục bắt đầu bằng pos_id nên mỗi lần quét cả POS
-- (web thật 03–10/10/2026: 0,43 s và 150.000 dòng mỗi lần, 1.566 lần/tuần, câu tốn D1 nhiều nhất).
CREATE INDEX IF NOT EXISTS `idx_pos_customers_customer` ON `pos_customers` (`pos_id`,`customer_id`);
