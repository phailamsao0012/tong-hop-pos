-- Sổ nhắc việc trong bot Zalo (anh Vũ duyệt plan bản 5, 15/11/2026): mỗi người nhận báo cáo sếp có một sổ riêng, chỉ thêm bảng mới.
CREATE TABLE IF NOT EXISTS `zalo_memos` (
  `id` text PRIMARY KEY NOT NULL,
  `contact_id` text NOT NULL,              -- zalo_contacts.id (chủ sổ)
  `no` integer NOT NULL,                   -- số thứ tự trong sổ của người đó
  `body` text NOT NULL,                    -- đúng câu người đó nhắn (không viết lại)
  `due_at` text,                           -- giờ hẹn (UTC ISO), trống = không hẹn
  `due_has_time` integer NOT NULL DEFAULT 0, -- 0 = chỉ có ngày (coi như 8h15 sáng ngày đó)
  `snooze_day` text,                       -- hoãn tới ngày (YYYY-MM-DD, giờ VN)
  `status` text NOT NULL DEFAULT 'mo',     -- 'mo' | 'xong' | 'bo'
  `sent` text NOT NULL DEFAULT '{}',       -- các mốc nhắc đã gửi / bỏ qua
  `created_at` text NOT NULL,
  `done_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_zalo_memos_no` ON `zalo_memos` (`contact_id`,`no`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_zalo_memos_open` ON `zalo_memos` (`status`,`contact_id`);
