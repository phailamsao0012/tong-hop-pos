-- Số sản phẩm tính sẵn theo (POS, ngày chốt, người bán, sản phẩm, tên): Xu hướng theo dòng sản phẩm và bảng sản phẩm ở Tổng quan
-- đọc bảng này thay vì nối đơn gốc với dòng sản phẩm mỗi lần mở trang. Dựng lại cùng stats_daily ở mỗi lượt đồng bộ (5 phút),
-- tháng cũ do bộ hẹn giờ điền dần (lib/scheduler.ts). Bảng mới, rỗng: tạo nhanh cả trên web thật.
CREATE TABLE IF NOT EXISTS `stats_daily_seller_product` (
	`id` text PRIMARY KEY NOT NULL,
	`pos_id` text NOT NULL,
	`day` text NOT NULL,
	`seller_id` text DEFAULT '' NOT NULL,
	`product_id` text DEFAULT '' NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`orders` integer DEFAULT 0 NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`closed_quantity` integer DEFAULT 0 NOT NULL,
	`closed_total` integer DEFAULT 0 NOT NULL,
	`delivered_quantity` integer DEFAULT 0 NOT NULL,
	`delivered_total` integer DEFAULT 0 NOT NULL,
	`returned_quantity` integer DEFAULT 0 NOT NULL,
	`sale_quantity` integer DEFAULT 0 NOT NULL,
	`sale_total` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_stats_daily_seller_product_pos_day` ON `stats_daily_seller_product` (`pos_id`,`day`);
