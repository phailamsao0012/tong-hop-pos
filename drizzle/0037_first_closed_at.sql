-- Đơn chốt thống nhất 3 giai đoạn (anh Vũ 08/10/2026): new → chốt (từ Chờ xác nhận trở đi) → chuyển hàng.
-- first_closed_at = lần đầu đơn vào Chờ xác nhận hoặc trạng thái sau đó (không tính Mới, Hủy, Xóa). first_confirmed_at giữ
-- nguyên nghĩa "đã xác nhận" cho báo cáo MKT. Đơn tháng 9 trở đi điền ngay ở đây, đơn cũ hơn bộ hẹn giờ điền dần (lib/scheduler.ts).
ALTER TABLE `raw_pos_orders` ADD COLUMN `first_closed_at` text;
CREATE INDEX IF NOT EXISTS `idx_raw_orders_pos_closed_status_money` ON `raw_pos_orders` (`pos_id`,`first_closed_at`,`status_code`,`seller_id`,`net_total`,`current_total`,`total_discount`);
UPDATE `raw_pos_orders` SET `first_closed_at` = COALESCE(
  (SELECT MIN(CASE WHEN h.key = 0 AND json_extract(h.value, '$.old_status') NOT IN (0, 6, 7) THEN `created_at`
      WHEN json_extract(h.value, '$.status') NOT IN (0, 6, 7) THEN json_extract(h.value, '$.updated_at') END) FROM json_each(`status_history_json`) h),
  `first_confirmed_at`, `updated_at`, `created_at`)
WHERE `created_at` >= '2026-08-31T17:00:00' AND `status_code` NOT IN (0, 6, 7);
