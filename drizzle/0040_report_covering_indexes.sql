-- Web thật 08–10/10/2026: "MKT theo ngày" (lib/trends-report.ts) mất 6,6 s mỗi lần vì chỉ mục theo ngày xác nhận thiếu marketer_id,
-- phải đọc từng dòng đơn gốc (dòng có JSON nặng). Thay bằng chỉ mục có thêm marketer_id: các báo cáo MKT (xu hướng, Tổng quan MKT,
-- Chi phí & ROAS, khối MKT ở Tổng quan POS) đọc trọn trong chỉ mục. Chỉ mục cũ cùng tiền tố nên bỏ để không ghi hai lần khi đồng bộ.
CREATE INDEX IF NOT EXISTS `idx_raw_orders_pos_confirmed_mkt_money` ON `raw_pos_orders` (`pos_id`,`first_confirmed_at`,`status_code`,`marketer_id`,`seller_id`,`net_total`,`current_total`,`total_discount`);--> statement-breakpoint
DROP INDEX IF EXISTS `idx_raw_orders_pos_confirmed_status_money`;--> statement-breakpoint
-- Số giao theo đợt (app/api/reports/batches): lọc theo ngày giao đầu, trước quét cả bảng khách (0,8–2,2 s mỗi lần).
CREATE INDEX IF NOT EXISTS `idx_customer_stats_pos_assigned` ON `customer_stats` (`pos_id`,`first_assigned_at`,`seller_id`,`success_orders`,`success_net`);
