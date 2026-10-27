-- Danh bạ Zalo: mọi người nói chuyện với bot (sếp, leader, nhân viên). Tên do chủ hệ thống / leader nhập.
CREATE TABLE IF NOT EXISTS `zalo_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,               -- 'boss' | 'leader' | 'staff'
	`user_id` text,                      -- tài khoản web (chỉ boss)
	`team_id` text,                      -- mã team web (leader và staff)
	`team_name` text NOT NULL DEFAULT '',
	`dept` text NOT NULL DEFAULT '',     -- 'sale' | 'cskh' | ''
	`leader_id` text,                    -- staff: leader quản lý (zalo_contacts.id)
	`pos_seller_ids` text NOT NULL DEFAULT '[]', -- staff: mã người bán POS (JSON) để báo thiếu số
	`chat_id` text,                      -- Zalo chat id, NULL = chưa nối
	`linked_at` text,
	`active` integer NOT NULL DEFAULT 1,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_zalo_contacts_chat` ON `zalo_contacts` (`chat_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_zalo_contacts_leader` ON `zalo_contacts` (`leader_id`,`active`);
--> statement-breakpoint
-- Việc: sếp giao leader (web) hoặc leader giao nhân viên (Zalo).
CREATE TABLE IF NOT EXISTS `zalo_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`no` integer NOT NULL,               -- số việc ngắn để gõ trên Zalo (V12)
	`title` text NOT NULL,
	`detail` text NOT NULL DEFAULT '',
	`assignee_id` text NOT NULL,         -- zalo_contacts.id
	`assigner_id` text NOT NULL,         -- zalo_contacts.id
	`parent_id` text,                    -- việc leader tách ra từ việc sếp giao (không bắt buộc)
	`urgent` integer NOT NULL DEFAULT 0,
	`due_date` text,                     -- YYYY-MM-DD giờ VN
	`status` text NOT NULL DEFAULT 'moi',
	`reason` text NOT NULL DEFAULT '',   -- lý do chưa hoàn thành gần nhất
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`done_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_zalo_tasks_no` ON `zalo_tasks` (`no`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_zalo_tasks_assignee` ON `zalo_tasks` (`assignee_id`,`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_zalo_tasks_assigner` ON `zalo_tasks` (`assigner_id`,`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_zalo_tasks_due` ON `zalo_tasks` (`status`,`due_date`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `zalo_task_events` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`author_id` text NOT NULL,           -- zalo_contacts.id
	`kind` text NOT NULL,                -- 'status' | 'note' | 'edit'
	`body` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_zalo_task_events_task` ON `zalo_task_events` (`task_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `zalo_meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`no` integer NOT NULL,               -- số họp ngắn (H5)
	`title` text NOT NULL,
	`place` text NOT NULL DEFAULT '',
	`start_at` text NOT NULL,            -- ISO UTC
	`note` text NOT NULL DEFAULT '',
	`created_by` text NOT NULL,          -- zalo_contacts.id của sếp
	`cancelled_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_zalo_meetings_no` ON `zalo_meetings` (`no`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_zalo_meetings_start` ON `zalo_meetings` (`start_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `zalo_meeting_invites` (
	`meeting_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`answer` text,                       -- NULL | 'co' | 'khong'
	`reason` text NOT NULL DEFAULT '',
	`answered_at` text,
	`reminded_at` text,
	PRIMARY KEY (`meeting_id`,`contact_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_zalo_invites_contact` ON `zalo_meeting_invites` (`contact_id`);
