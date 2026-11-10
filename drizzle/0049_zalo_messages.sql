-- Giao việc dạng chat: lưu tin hai chiều với từng leader/nhân viên (tin bot/sếp gửi và tin họ nhắn bot trên Zalo). Chỉ thêm bảng mới, giữ 180 ngày.
CREATE TABLE IF NOT EXISTS `zalo_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `contact_id` text NOT NULL,              -- zalo_contacts.id
  `dir` text NOT NULL,                     -- 'in' người đó nhắn bot · 'out' bot/sếp gửi
  `kind` text NOT NULL DEFAULT 'text',     -- 'text' | 'task' | 'meeting' | 'status'
  `ref_no` integer,                        -- số việc/họp khi kind là task/meeting/status
  `body` text NOT NULL,
  `author_id` text,                        -- sếp gõ trên web; trống = bot tự gửi
  `delivered` integer NOT NULL DEFAULT 1,  -- 0 khi chưa nối Zalo hoặc gửi lỗi
  `created_at` text NOT NULL,
  `read_at` text                           -- chỉ dùng cho tin 'in'
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_zalo_messages_contact` ON `zalo_messages` (`contact_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_zalo_messages_unread` ON `zalo_messages` (`dir`,`read_at`);
--> statement-breakpoint
-- Nhóm tổng: sếp nhắn một lần, bot gửi riêng cho từng thành viên (Zalo Bot không vào được nhóm Zalo).
-- Tin nhóm lưu trong zalo_messages với contact_id = 'group:<id>' (ref_no = số người nhận, delivered = số người đã tới).
CREATE TABLE IF NOT EXISTS `zalo_groups` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `member_ids` text NOT NULL DEFAULT '[]', -- JSON mảng zalo_contacts.id
  `active` integer NOT NULL DEFAULT 1,
  `created_by` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
