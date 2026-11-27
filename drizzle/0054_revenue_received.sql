-- Doanh thu đã nhận (anh Vũ 27/11/2026): trong các đơn tính doanh thu (đã chốt trở đi, theo ngày tạo đơn), đơn đang ở Đã nhận / Đã thu tiền.
-- Chỉ thêm cột (mặc định 0); bộ hẹn giờ dựng lại toàn bộ khi tăng STATS_EPOCH 8 / SEGMENT_EPOCH 2. lib/reports/stats.ts ensureStatsSchema cũng tự thêm.
ALTER TABLE stats_daily ADD COLUMN received_orders INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE stats_daily ADD COLUMN received_net INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE stats_daily_segment ADD COLUMN received_orders INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE stats_daily_segment ADD COLUMN received_net INTEGER NOT NULL DEFAULT 0;
