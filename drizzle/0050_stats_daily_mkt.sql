-- Số MKT tính sẵn theo (POS, ngày xác nhận giờ VN, Marketer, người bán) (anh Vũ 04/11/2026 "ok sửa"): Xu hướng và Điều hành đọc
-- bảng này thay vì quét đơn gốc theo first_confirmed_at (4–8 giây mỗi lần, làm các khối khác báo "Không tải được").
-- Dựng lại cùng stats_daily ở mỗi lượt đồng bộ, tháng cũ do bộ hẹn giờ điền dần (lib/reports/stats-mkt.ts). Bảng mới, rỗng: tạo nhanh cả trên web thật.
CREATE TABLE IF NOT EXISTS `stats_daily_mkt` (
	`id` text PRIMARY KEY NOT NULL,
	`pos_id` text NOT NULL,
	`day` text NOT NULL,
	`marketer_id` text NOT NULL,
	`seller_id` text DEFAULT '' NOT NULL,
	`orders` integer DEFAULT 0 NOT NULL,
	`net` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_stats_daily_mkt_pos_day` ON `stats_daily_mkt` (`pos_id`,`day`);
