-- Canh gác 24/7 (11/10/2026): nhật ký sự cố hệ thống (đồng bộ, chia số, D1, bộ hẹn giờ, sao lưu) để xem lại trên trang Cấu hình.
-- Chỉ là nhật ký, ghi được thì ghi: trạng thái mở / đã báo / đã đóng nằm ở bộ nhớ Durable Object (QA 11/10 điểm 7), D1 lỗi vẫn gửi tin.
-- id = key@opened_at (một key mở lại sau khi đóng là dòng mới). Không chứa SĐT khách hay chat id.
CREATE TABLE IF NOT EXISTS `ops_incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`detail` text,
	`opened_at` text NOT NULL,
	`notified_at` text,
	`resolved_at` text,
	`resolved_notified_at` text,
	`notify_count` integer DEFAULT 0 NOT NULL,
	`channel` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ops_incidents_opened` ON `ops_incidents` (`opened_at`);
