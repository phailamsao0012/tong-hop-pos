-- Số giao theo đợt (app/api/reports/batches): lọc theo ngày giao đầu, trước quét cả bảng khách (0,8–2,2 s mỗi lần).
-- (Bản đầu của tệp này còn tạo chỉ mục rộng trên raw_pos_orders: trên web thật 5,5 GB việc tạo quá hạn D1 (7429) nên bỏ;
-- 0041 trả demo về đúng chỉ mục như web thật.)
CREATE INDEX IF NOT EXISTS `idx_customer_stats_pos_assigned` ON `customer_stats` (`pos_id`,`first_assigned_at`,`seller_id`,`success_orders`,`success_net`);
