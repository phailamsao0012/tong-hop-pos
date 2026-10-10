-- Vận đơn tính theo ngày gửi hàng (anh Vũ 10/10/2026): first_sent_at = lần đầu đơn giao cho đơn vị vận chuyển (trạng thái 2, 3, 16, 4, 15, 5).
-- Điền cho đơn đã có do bộ hẹn giờ làm dần (lib/scheduler.ts, fillSentAtMonth), không điền trong migration (bài học 7429 ngày 08/10/2026).
ALTER TABLE `raw_pos_orders` ADD COLUMN `first_sent_at` text;
