-- Giao việc: chọn khoảng thời gian (từ ngày → đến ngày) và giờ tuỳ chọn. Chỉ thêm cột, việc cũ giữ nguyên (cột để trống).
ALTER TABLE `zalo_tasks` ADD COLUMN `start_date` text;   -- YYYY-MM-DD giờ VN, trống = không ghi ngày bắt đầu
--> statement-breakpoint
ALTER TABLE `zalo_tasks` ADD COLUMN `start_time` text;   -- HH:MM giờ VN, chỉ có khi tích "Chọn giờ"
--> statement-breakpoint
ALTER TABLE `zalo_tasks` ADD COLUMN `due_time` text;     -- HH:MM giờ VN của hạn (due_date)
