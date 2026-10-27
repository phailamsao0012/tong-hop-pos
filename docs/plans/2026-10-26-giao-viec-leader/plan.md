# Giao việc và thông báo Zalo cho leader (plan bản 2, 27/10/2026)

Thread "Làm trang giao việc cho leader" viết. Bản 1 (26/10) bị thay hẳn bằng bản này vì anh Vũ mở rộng yêu cầu ngày 27/10.

Quy trình chung (AGENTS.md, luật 15/10): Codex làm liền các bước Z1 → Z4 trên PC, máy kiểm sau mỗi bước, Claude kiểm một lần cuối, lên demo cho anh xem. Anh ok mới lên web thật.

## Lời anh (nguyên văn, gom lại)

- 26/10 04:31Z: "làm 1 web nữa hoặc tích hợp trên web tổng quan, bạn xem cái nào ok hơn ... để làm web giao việc cho các đầu leader ấy". → Claude chọn **gắn vào web tổng**.
- 26/10 10:12Z: "hiện tại là chỉ a Nghĩa và tôi làm được cho leader ... tôi muốn công việc sau khi giao sẽ gửi về zalo". 10:24Z anh chọn **Zalo Bot (miễn phí)**.
- 27/10 01:49Z:
  - thông báo Zalo cho **5 đầu leader** (2 leader CSKH, 3 leader Sale; mỗi người cầm một team);
  - "thông báo họp ... về zalo, các đầu lead sẽ có chọn xác nhận tham gia hay k, nếu k thì lý do gì";
  - "giao task, khi làm trên web sẽ tự gửi tin nhắn tới người được giao task, ... đã nhận, đang triển khai, đã hoàn thành, chưa hoàn thành, tại sao lại chưa, có cảnh báo nếu đến hạn mà chưa hoàn thành. có thể theo các tuần trong tháng";
  - "cảnh báo chậm tiến độ của từng nhân sự mà leader quản lý";
  - "các đầu sale thiếu số thì sẽ cảnh báo";
  - "tổng hợp doanh số theo các khung giờ gửi cho các đầu lead, 8h(8-12h), 17h(12-17h). 22h(17-22)".
- 27/10 01:55Z (trả lời 4 câu hỏi):
  1. Thiếu số = "sale không có số điện thoại để gọi, không có data, ngồi không quá lâu".
  2. Chậm tiến độ đo "bằng việc leader sẽ giao cho nhân viên".
  3. Giờ gửi: 12h gửi số 8–12h, 17h gửi số 12–17h, 22h gửi số 17–22h. Claude đề xuất thêm bản tin 8h sáng (chờ anh ok, có công tắc tắt).
  4. "lead sẽ tự giao cho nhân viên, không mở web, lead chỉ báo cáo trong zalo, nhận về zalo".

## Hình dung tổng

- **Trên web (chỉ anh Vũ, anh Nghĩa):** giao việc cho leader, tạo lịch họp, xem trạng thái mọi việc (cả việc leader giao cho nhân viên) theo tuần trong tháng, xem ai xác nhận họp, sửa danh bạ Zalo và các ngưỡng cảnh báo.
- **Trên Zalo (leader, nhân viên, và cả hai sếp):** mọi người nói chuyện riêng với **một Zalo Bot** của công ty.
  - Leader nhận việc, nhận lịch họp, trả lời bằng tin ngắn.
  - Leader giao việc cho nhân viên trong team ngay trên Zalo, nhân viên cũng trả lời trên Zalo.
  - Bot gửi cảnh báo và tổng hợp doanh số theo giờ.
  - Sếp nhận tin khi leader trả lời, xong việc, báo chưa xong, không đi họp.
- Leader và nhân viên **không cần tài khoản web**. Khoá tài khoản 23/10 không ảnh hưởng.

## Zalo Bot: điều đã biết và điều chưa chắc

- API giống Telegram: `POST https://bot-api.zaloplatforms.com/bot<TOKEN>/<lệnh>`.
  - `sendMessage { chat_id, text }`, text 1–2000 ký tự.
  - `setWebhook { url, secret_token }`. Zalo gửi kèm header `X-Bot-Api-Secret-Token`.
  - Tin đến có `message.chat.id`, `message.text`, `message.from`.
- Bot chỉ nói chuyện riêng 1–1, không vào nhóm.
- **Chưa chắc:**
  - Bot có được nhắn trước cho người đã từng nhắn bot không (giả định là có, giống Telegram).
  - Giới hạn số tin mỗi phút.
  - Bot có nút bấm trong tin không.
- Cách làm: chỉ dùng tin chữ (không nút). Mọi lần gửi đi qua `lib/zalo.ts`, lỗi thì ghi nhật ký và **không** làm hỏng thao tác chính. Mỗi lượt gửi tối đa 30 tin, cách nhau 300 ms.
- Bước kiểm thật đầu tiên khi lên web thật: nối 1 người (anh Vũ), gửi thử, xác nhận bot nhắn trước được, rồi mới nối leader.

## Không được đổi

- Số liệu, cách tính, tên số, quyền xem các trang khác. Doanh số gửi qua Zalo **phải trùng** số ô Doanh số của trang Tổng quan Sale/CSKH khi lọc đúng team đó và đúng khung giờ (dùng lại hàm sẵn có, không viết câu tính mới).
- Tên số theo AGENTS.md: doanh số chỉ tính người có hậu tố MKT/CSKH/SALE (hàm sẵn có đã lo). Không gọi số Vận đơn là doanh số.
- `WORLD_VERSION`, các `*_EPOCH`, `wrangler*.json*` (cron mỗi phút đã có sẵn, không thêm cron), `.github/**`, `scripts/**`, `lib/auth.ts`, khoá tài khoản 23/10.
- Chia số (`lib/dispatch*.ts`): không đụng. Cảnh báo thiếu số chỉ **đọc**.
- "Việc của tôi" hiện có (`lib/my-tasks.ts`, `/api/tasks`): giữ nguyên.
- Chỉ thêm **một** migration: `drizzle/0047_giao_viec_zalo.sql`. Không sửa `drizzle/meta/**`, `db/schema.ts`. Không tạo chỉ mục mới trên bảng có sẵn (nhất là `raw_pos_orders`).
- **Repo công khai:** không ghi tên thật của leader, nhân viên vào code, test, plan, demo. Tên thật chỉ nằm trong D1 web thật, do anh nhập trên web.

## Hiện trạng (nhánh demo `claude/project-thread-3ujeoc`, 4588cea)

- Vai trò, quyền: `lib/access.ts` (`canView`, `scopeApi`, `OWNER_ONLY`, nhánh mentor). Webhook không cần đăng nhập đang được cho qua ở `scopeApi` (dòng có `/api/telegram/webhook`).
- Telegram bot mẫu để làm theo: `lib/telegram.ts` (gửi tin, chặn gửi ở demo), `app/api/telegram/webhook/route.ts` (kiểm secret bằng so sánh thời gian hằng `sameSecret`).
- Cron mỗi phút: `worker.ts` hàm `scheduled` (đã gọi `maybeStuckAlert`, `maybeReviewTick`, `maybeForecastTick`). Thêm một lời gọi `maybeZaloTick`.
- Team: `/api/teams?list=1` (`app/api/teams/route.ts`) trả danh sách team Sale/CSKH (mã, tên, mentor, tên thành viên). Lọc số theo một team: `resolveHrUnit` trong `lib/hr-unit.ts` với tham số `hrTeam=<mã team>`.
- Doanh số: `overviewReport` / `periodReport` trong `lib/overview-report.ts`. Trang Tổng quan Sale/CSKH gọi qua `/api/reports/overview`. Số hôm nay tính tới giờ hiện tại.
- Số được chia cho sale: `raw_pos_orders.seller_id`, `seller_assigned_at`; chỉ mục sẵn có `idx_raw_orders_pos_assignment (pos_id, seller_assigned_at, seller_id)`. Bảng "Data được cấp" và `lib/sale-analytics.ts` đã đếm số được chia theo giờ: dùng lại cách đếm đó.
- Giờ Việt Nam: `todayVn`, `vnDayStartUtc`, `VN_OFFSET_HOURS` trong `lib/report-time.ts`.
- D1 giả cho test: `tests/support/d1-sqlite.ts`.
- Demo: `lib/demo/mode.ts` (`ensureDemoSeed`, `DEMO_ACCOUNTS`, `demoBlocked`), team và nhân viên ảo trong `lib/demo/world.ts`.

## Thiết kế

### 1. Dữ liệu: `drizzle/0047_giao_viec_zalo.sql`

Chỉ `CREATE TABLE IF NOT EXISTS` và `CREATE INDEX IF NOT EXISTS` trên bảng mới.

```sql
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
```

- `zalo_tasks.status`: `moi` (Mới giao, chưa nhận), `da_nhan` (Đã nhận), `dang_lam` (Đang triển khai), `xong` (Đã hoàn thành), `chua_xong` (Chưa hoàn thành, bắt buộc có lý do), `huy` (Đã huỷ).
- Số ngắn `no`: `SELECT COALESCE(MAX(no),0)+1` trong cùng `db.batch` với `INSERT`; trùng thì thử lại tối đa 3 lần.
- Cài đặt nhỏ để ở `app_settings` (không bảng mới):
  - `zalo_settings_v1` JSON: `{ morningBrief: true, slotReports: true, idleMinutes: 60, idleFrom: "08:30", idleTo: "21:30", remindBeforeMeetingMin: 60 }`.
  - `zalo_pair_v1` JSON: mã nối đang chờ `{ "<mã 6 số>": { contactId, exp } }`, tối đa 50 mã, mã hết hạn bị dọn mỗi lần ghi.
  - `zalo_tick_v1` JSON: mốc đã chạy để không gửi lặp `{ morning: "YYYY-MM-DD", slot12: "...", slot17: "...", slot22: "...", overdue: "...", snap: { "<teamId>": { "08": số, "12": số, "17": số } } }`.
  - `zalo_idle_v1` JSON: `{ "<sellerId>": "<ISO lần cảnh báo cuối>" }` để không báo một người quá 1 lần / khoảng trống.

### 2. Logic: `lib/zalo-work.ts` (không import React, không import `cloudflare:workers`; nhận `db` làm tham số)

Hàm thuần (test kĩ):
- `STATUS_LABELS = { moi: 'Mới giao', da_nhan: 'Đã nhận', dang_lam: 'Đang triển khai', xong: 'Đã hoàn thành', chua_xong: 'Chưa hoàn thành', huy: 'Đã huỷ' }`.
- `canMove(actor, task, to)`:
  - Người nhận: `moi→da_nhan`, `moi|da_nhan→dang_lam`, `da_nhan|dang_lam|chua_xong→xong`, `moi|da_nhan|dang_lam→chua_xong` (cần lý do), `chua_xong→dang_lam`, `xong→dang_lam` (làm lại).
  - Người giao (và chủ hệ thống trên web): mọi chuyển, kể cả `huy` và `huy→moi`.
  - Leader xem được việc của nhân viên mình (để nhắc), không đổi trạng thái thay nhân viên.
- `taskState(task, today)`: `done`, `cancelled`, `none` (không hạn), `overdue` (hạn < hôm nay và chưa xong), `today`, `soon` (≤ 2 ngày), `later`.
- `weekOfMonth(date)`: tuần trong tháng theo lịch thứ Hai đầu tuần; tuần 1 là tuần chứa ngày 1. Trả `{ month: 'YYYY-MM', week: 1..6, from, to }`.
- `parseCommand(text)`: đọc tin Zalo, bỏ dấu, không phân biệt hoa thường, bỏ khoảng trắng thừa. Trả một trong:
  - `{ cmd: 'pair', code }` khi tin chỉ có 6 chữ số.
  - `{ cmd: 'status', no, to, reason? }` với `V12 nhan`, `V12 dang`, `V12 xong`, `V12 chua <lý do>`. Cho phép viết `v12`, `12`, có dấu hoặc không (`nhận`, `đang`, `xong`, `chưa`).
  - `{ cmd: 'note', no, body }` với `V12 <chữ bất kì khác>`, ví dụ "V12 đã gọi 20 khách".
  - `{ cmd: 'meeting', no, answer, reason? }` với `H5 co`, `H5 khong <lý do>` (có dấu hoặc không).
  - `{ cmd: 'list' }` với `viec`; `{ cmd: 'team' }` với `team`; `{ cmd: 'week' }` với `tuan`; `{ cmd: 'help' }` với `?`, `hd`, `huong dan`.
  - `{ cmd: 'assign', who, title, due? }` với `giao <số thứ tự hoặc tên nhân viên> : <việc> [han dd/mm]`. Ví dụ `giao 2: gọi lại 30 khách cũ han 30/10`.
  - `{ cmd: 'unknown' }` còn lại.
- `formatTaskMessage`, `formatMeetingMessage`, `formatHelp(kind)`, `formatList`, `formatWeek`, `formatSlotReport`, `formatMorning`, `formatIdleAlert`, `formatOverdue`: ra chữ tiếng Việt có dấu, mỗi tin ≤ 2000 ký tự (dài hơn thì cắt và thêm "… gõ viec để xem đủ").
- Thiếu lý do khi `chua` hoặc `khong` thì trả lời "Anh/chị ghi thêm lý do, ví dụ: V12 chua khách không nghe máy".

Hàm D1:
- Danh bạ: `listContacts`, `saveContact` (kiểm `kind`, tên 1–60 ký tự), `deactivateContact`, `contactByChat(db, chatId)`, `teamStaff(db, leaderId)` (nhân viên đang hoạt động, thứ tự theo tên, đánh số 1..n cho lệnh `giao`).
- Nối Zalo: `createPairCode(db, contactId, now)` (6 chữ số ngẫu nhiên bằng `crypto.getRandomValues`, sống 24 giờ, mỗi contact chỉ giữ mã mới nhất), `redeemPairCode(db, code, chatId, now)` (mã sai hoặc hết hạn trả lỗi; một `chat_id` chỉ gắn một contact, nối lại thì gỡ chat cũ). Sai mã 5 lần liên tiếp từ cùng chat trong 1 giờ thì im lặng 1 giờ (đếm trong `zalo_pair_v1`).
- Việc: `createTask(db, actor, input, now)`; `moveTask(db, actor, no, to, reason, now)` (`UPDATE ... WHERE id=? AND status=?` chống đè, ghi 1 dòng event, `db.batch`); `addTaskNote`; `editTask` (người giao); `listTasks(db, filter)` với `filter = { assigneeId? , assignerId?, teamId?, month?, week?, status: 'open'|'closed'|'all' }`, `LIMIT 500`, việc đóng chỉ lấy 45 ngày gần nhất.
- Họp: `createMeeting(db, actor, { title, place, startAt, note, inviteeIds })`, `answerMeeting(db, contactId, no, answer, reason, now)`, `cancelMeeting`, `listMeetings(db, { from, to })` kèm đếm Có/Không/Chưa trả lời.
- Tổng hợp: `weekSummary(db, leaderId, today)` trả mỗi nhân viên: việc mở, quá hạn, xong trong tuần.

### 3. Gửi và nhận Zalo

- `lib/zalo.ts`:
  - `sendZalo(token, chatId, text)`: timeout 10 giây.
  - `DEMO_MODE=1`: **không bao giờ** gọi mạng; ghi tin vào `app_settings` khoá `demo_zalo_outbox` (giữ 100 tin gần nhất: `{ to, name, text, at }`).
  - Thiếu `ZALO_BOT_TOKEN`: bỏ qua im lặng, trả `{ skipped: true }`.
  - `webhookSecret(token)` = HMAC-SHA256(token, `"zalo-webhook-v1"`) dạng hex. Không cần biến bí mật thứ hai.
  - `setWebhook(token, url)`.
- `app/api/zalo/webhook/route.ts`:
  - `POST`, kiểm header `X-Bot-Api-Secret-Token` bằng so sánh thời gian hằng (như Telegram). Sai trả 401.
  - Đọc `chat.id`, `text`. Chat chưa nối: tin 6 số thì `redeemPairCode`; tin khác thì trả lời "Chào anh/chị. Gửi mã 6 số được cấp để nối với hệ thống giao việc."
  - Chat đã nối: chạy `parseCommand`, làm việc, trả lời ngay một tin xác nhận ("Đã ghi: V12 Đang triển khai"). Lệnh sai thì gửi `formatHelp`.
  - Luôn trả 200 nhanh sau khi xử lý (Zalo không gửi lại).
  - `lib/access.ts`: thêm `/api/zalo/webhook` vào danh sách đường dẫn cho qua không cần đăng nhập, cạnh `/api/telegram/webhook`.
- Ai nhận tin gì:

| Việc xảy ra | Gửi cho |
|---|---|
| Sếp giao việc cho leader trên web | Leader: "📌 V12 · Việc mới từ <sếp>: <tên>\nHạn: 30/10 (Gấp)\n<nội dung ≤ 300 ký tự>\nTrả lời: V12 nhan · V12 dang · V12 xong · V12 chua <lý do>" |
| Leader giao nhân viên trên Zalo | Nhân viên: cùng mẫu. Leader: "Đã giao V13 cho <tên>." |
| Người nhận đổi trạng thái / ghi chú | Người giao (sếp hoặc leader). Nếu người nhận là nhân viên và báo `chua_xong`: báo leader. |
| Sửa hạn, đổi người, huỷ | Người nhận liên quan. |
| Sếp tạo họp | Mỗi leader được mời: "📅 H5 · Họp: <tên>\n<giờ dd/mm hh:mm>, <địa điểm>\n<ghi chú>\nTrả lời: H5 co · H5 khong <lý do>" |
| Leader trả lời họp | Sếp tạo họp: "<leader> tham gia H5" / "<leader> không tham gia H5: <lý do>" |
| Trước họp `remindBeforeMeetingMin` phút | Người chưa trả lời hoặc đã nhận "co": nhắc 1 lần. |
| Huỷ họp | Mọi người được mời. |

### 4. Tin tự động (gắn vào cron mỗi phút đã có, `maybeZaloTick(now)` trong `lib/zalo-tick.ts`)

Mỗi mốc chỉ chạy một lần mỗi ngày nhờ `zalo_tick_v1`. Chỉ chạy khi có token (web thật) hoặc `DEMO_MODE=1` (ghi hộp thư giả). Tick chỉ làm việc ở đúng phút cần; phút khác thoát ngay sau khi đọc **một** dòng `app_settings` (đọc dồn cả cài đặt và mốc trong một câu `WHERE key IN (...)`).

- **08:00 bản tin đầu ngày** (bật/tắt bằng `morningBrief`, mặc định bật, chờ anh xác nhận). Mỗi leader một tin:
  - doanh số hôm qua của team;
  - việc mở của leader và của nhân viên trong team, việc tới hạn hôm nay, việc quá hạn;
  - họp trong ngày.
  - Cùng lúc lưu mốc số `snap[team]["08"]` (số hôm nay tính tới 8:00) cho khung 8–12h.
- **12:00, 17:00, 22:00 tổng hợp doanh số theo khung** (bật/tắt bằng `slotReports`). Mỗi leader nhận số **của team mình**:
  - Số khung = doanh số hôm nay tính tới mốc giờ này − số đã lưu ở mốc trước (8h, 12h, 17h). Thiếu mốc trước (ví dụ web mới lên lúc 10h) thì ghi "từ đầu ngày tới 12h".
  - Một tin gồm:
    - dòng tiêu đề "Doanh số team <tên> khung 8h–12h";
    - tổng doanh số khung và luỹ kế hôm nay;
    - số đơn chốt;
    - 3 người cao nhất và người chưa có đơn trong khung (chỉ tên người có hậu tố đúng luật).
  - Hai sếp nhận một tin gộp 5 team.
  - Số lấy bằng `overviewReport` cho hôm nay, `posIds` mọi POS, `team` theo bộ phận của team, `unit` từ `resolveHrUnit` với `hrTeam=<team_id>`; lấy `current.total` và `byEmployee`. Cùng hàm với trang Tổng quan, nên số khớp ô Doanh số khi lọc team đó.
  - Ghi tên số đúng: "Doanh số" (không dùng "doanh thu" cho Vận đơn; ở đây là đơn chốt của Sale/CSKH).
- **08:00 cảnh báo việc**:
  - Việc tới hạn hôm nay chưa xong: nhắc người nhận.
  - Việc quá hạn: nhắc người nhận, và báo người giao danh sách quá hạn. Leader nhận "Chậm tiến độ team: <tên NV> 2 việc quá hạn (V13, V15)…". Sếp nhận danh sách quá hạn của leader.
- **Cảnh báo thiếu số** (chỉ team Sale), mỗi 15 phút trong khoảng `idleFrom`–`idleTo`:
  - Với mỗi sale trong team: nếu hôm nay đã được chia ít nhất 1 số **và** lần chia gần nhất đã quá `idleMinutes` phút → báo leader team: "⚠️ <tên sale> chưa có số mới 75 phút (lần cuối 9:40)".
  - Mỗi khoảng trống chỉ báo 1 lần; có số mới thì mở lại.
  - Đọc: một câu mỗi POS trên chỉ mục `idx_raw_orders_pos_assignment`:
    ```sql
    SELECT seller_id, MAX(seller_assigned_at) AS last, COUNT(*) AS n
    FROM raw_pos_orders
    WHERE pos_id=? AND seller_assigned_at>=?
    GROUP BY seller_id
    ```
    với mốc là đầu ngày hôm nay (UTC). Người bán lấy theo thành viên team (cùng cách `/api/teams` lấy). Nếu `seller_assigned_at` trên web thật hay trống thì Codex ghi vào "Chỗ làm khác plan" và dùng cùng nguồn với cột "Số được chia" của trang Data được cấp.
- **Nhắc họp** trước giờ họp: mỗi phút kiểm `zalo_meetings` có `start_at` trong 60 phút tới (chỉ mục `idx_zalo_meetings_start`).

### 5. Web (chỉ chủ hệ thống và người trong danh sách được giao việc)

- Danh sách người được giao việc: `app_settings` khoá `zalo_bosses_v1` = mảng `users.id`. Chủ hệ thống luôn có quyền; chủ hệ thống thêm anh Nghĩa trên web.
  - Mỗi sếp có một `zalo_contacts kind='boss'` gắn `user_id` (tạo tự động khi thêm vào danh sách) để nhận tin Zalo.
- `lib/access.ts`: `VIEW_LABELS['giao-viec'] = 'Giao việc'`.
  - `canView(a,'giao-viec')` không đọc D1 được, nên: `app/dashboard.tsx` gọi `/api/giao-viec/me` **một lần** khi vào web (trả `{ boss: boolean }`), chỉ hiện mục "Giao việc" khi `boss` là `true`. `canView` trả `true` cho owner, director, lead (để không chặn sếp có vai trò khác), còn quyền thật nằm ở route.
  - Mọi `/api/giao-viec*` route tự kiểm `isBoss(db, user)`. Không phải sếp thì trả 403.
- Thanh bộ phận trên cùng (`lib/nav-structure.ts`): thêm mục `{ key: 'giao-viec', label: 'Giao việc', sections: [{ key: 'reports', tabs: [['giao-viec','Tổng quan'], ['giao-viec-hop','Họp'], ['giao-viec-zalo','Danh bạ Zalo']] }] }` đứng trước "Cài đặt". Mở mục là vào Tổng quan trước (luật anh 21/10).
- **Tổng quan** (`app/giao-viec-view.tsx`):
  1. Một dòng: chữ "Giao việc" + nút xanh "+ Giao việc".
  2. Hàng nút tuần trong tháng: `Tháng 10: Tuần 1 · Tuần 2 · … · Cả tháng` (mặc định tuần hiện tại), lọc theo hạn của việc.
  3. Bốn ô số: Đang mở · Quá hạn (đỏ) · Chưa hoàn thành (vàng, kèm lý do khi bấm) · Đã hoàn thành trong kỳ (xanh). Bấm ô là lọc.
  4. Hàng nút leader (5 leader + "Tất cả"), mỗi nút có số việc mở và chấm đỏ nếu có quá hạn. Hiện sẵn, không ô thả xuống.
  5. Bảng theo leader: mỗi leader một khối, bên trong là việc sếp giao, rồi dòng "Nhân viên" liệt kê từng nhân viên với số việc mở / quá hạn / xong. Bấm nhân viên thì mở danh sách việc của họ.
  6. Thẻ việc giống bản 1: chấm màu hạn, tên, nhãn Gấp, người nhận, trạng thái, lý do chưa xong (nếu có), ghi chú mới nhất. Bấm mở Sheet chi tiết: dòng thời gian sự kiện, đổi trạng thái, sửa, huỷ.
  7. Form giao việc (Sheet): chọn leader bằng lưới nút, tên, nội dung, hạn (nút nhanh Hôm nay / Mai / Cuối tuần / Chọn ngày / Không hạn), Gấp. Giao xong `toast('Đã giao V12 cho <tên>, đã gửi Zalo')` (hoặc "chưa nối Zalo" nếu leader chưa nối).
  8. Cuối trang, chữ nhỏ: "Quá hạn: qua ngày hạn mà chưa Đã hoàn thành. Tuần tính từ thứ Hai."
- **Họp** (`app/giao-viec-hop-view.tsx`):
  - Nút "+ Tạo họp": tên, giờ, địa điểm, ghi chú, chọn leader (mặc định cả 5).
  - Danh sách họp sắp tới và 14 ngày qua. Mỗi họp có hàng chip từng leader: xanh "Tham gia", đỏ "Không: <lý do>", xám "Chưa trả lời". Có nút "Huỷ họp".
- **Danh bạ Zalo** (`app/giao-viec-zalo-view.tsx`):
  - Bảng người: tên, vai trò (Sếp / Leader / Nhân viên), team, trạng thái nối Zalo (đã nối / chưa nối).
  - Nút "Tạo mã nối" hiện mã 6 số + câu hướng dẫn để anh gửi cho người đó: "Mở Zalo, tìm bot <tên bot>, nhắn mã 123456".
  - Thêm leader: chọn team từ `/api/teams?list=1` (team Sale/CSKH), gõ tên.
  - Thêm nhân viên: chọn leader, gõ tên, chọn người bán POS tương ứng (từ thành viên team, để báo thiếu số). Leader cũng thêm nhân viên được bằng Zalo: gõ `them <tên>`, bot trả mã nối cho nhân viên đó.
  - Ô cài đặt: công tắc Bản tin 8h, Tổng hợp doanh số 12h/17h/22h; ô số "Báo thiếu số sau ... phút" (mặc định 60), khung giờ báo (8:30–21:30).
  - Chỉ chủ hệ thống: "Người được giao việc" (thêm anh Nghĩa), nút "Nối webhook Zalo" (gọi `setWebhook`), dòng trạng thái "Bot: đã có mã / chưa có mã".
  - Demo: thêm khối "Hộp thư Zalo (demo)" hiện 30 tin gần nhất trong `demo_zalo_outbox`, và ô "Thử nhắn như <người>" (chọn người, gõ tin, gửi vào cùng hàm xử lý webhook) để anh thử lệnh `V12 xong`, `H5 khong ...`, `giao 2: ...` ngay trên demo.
- API (route mỏng, gọi `lib/zalo-work.ts`): `/api/giao-viec` (GET danh sách, POST tạo), `/api/giao-viec/[id]` (GET, PATCH), `/api/giao-viec/me`, `/api/giao-viec/hop` (GET, POST), `/api/giao-viec/hop/[id]` (PATCH huỷ), `/api/giao-viec/zalo` (GET danh bạ + cài đặt, POST/PATCH người, POST mã nối, PUT cài đặt), `/api/giao-viec/zalo/webhook-setup` (POST, chỉ owner), `/api/giao-viec/zalo/thu` (POST, chỉ khi `DEMO_MODE=1`). Mọi thao tác ghi gọi `audit()` (không ghi nội dung việc).
- Dữ liệu demo `lib/demo/zalo-work.ts` (chỉ chạy khi bảng `zalo_contacts` rỗng):
  - 2 sếp ảo gắn `chu@demo…`, `giamdoc@demo…`;
  - 5 leader ảo gắn 5 team ảo có sẵn trong demo (2 CSKH, 3 Sale);
  - mỗi team 3 nhân viên ảo, gắn người bán ảo của team;
  - 10 việc đủ trạng thái (2 quá hạn, 1 chưa hoàn thành có lý do);
  - 2 cuộc họp (1 sắp tới có 3 trả lời, 1 hôm qua);
  - tất cả `chat_id` dạng `demo-<n>`;
  - tên ảo lấy từ `lib/demo/world.ts`.

## Ước chi phí Cloudflare (gói 5 USD: 25 tỷ dòng đọc, 50 triệu dòng ghi, 5 GB mỗi tháng)

Giả định rộng tay: 2 sếp, 5 leader, 50 nhân viên; 100 việc mới + 500 lần trả lời mỗi ngày.

| Phần | Cách tính | Mỗi tháng |
|---|---|---|
| Cron mỗi phút, phút không có việc | 1.440 lần × 2 dòng `app_settings` | ~90 nghìn đọc |
| Cảnh báo thiếu số | 56 lần/ngày × 6 POS × ≤ 3.000 dòng chỉ mục số chia trong ngày | ~30 triệu đọc (0,12%) |
| Tổng hợp doanh số 4 mốc × 5 team | mỗi lần như một lần mở Tổng quan một team | ~ bằng 600 lần mở trang |
| Web sếp | 2 người × 50 lần mở/ngày × ≤ 600 dòng | ~2 triệu đọc |
| Webhook Zalo | 600 tin/ngày × ~10 dòng đọc, ~4 dòng ghi | ~0,2 triệu đọc, ~70 nghìn ghi |
| Ghi việc, họp, sự kiện | ~1.500 dòng/ngày gồm chỉ mục | ~45 nghìn ghi (0,1%) |
| Dung lượng | | < 20 MB/năm |

- Kết luận: dưới 0,3% phần gói đã gồm. **Không phát sinh tiền**, không thêm Worker, không thêm cron (dùng cron mỗi phút đã có), Zalo Bot miễn phí.
- Trần cứng trong code:
  - `LIMIT 500` cho danh sách việc;
  - tối đa 30 tin Zalo mỗi lượt cron;
  - cảnh báo thiếu số chỉ đọc số chia **trong ngày**;
  - tick thoát sớm ở phút không có việc.
- Bộ canh D1 sẵn có (PR #88) vẫn đếm phần này.

## Các bước (nhánh `codex/giao-viec-zalo-2710` từ nhánh demo; một bước = một commit do script làm)

**Z1. Bảng, logic việc và họp, đọc lệnh Zalo**
- File được sửa: `drizzle/0047_giao_viec_zalo.sql` (mới), `lib/zalo-work.ts` (mới), `tests/zalo-work.test.ts` (mới), `tests/support/*`.
- Việc: migration đúng mục 1; mọi hàm thuần và hàm D1 của mục 2.
- Tiêu chí xong:
  - `parseCommand`: ≥ 30 ca. Phải có:
    - có dấu và không dấu, hoa thường;
    - `12 xong`, `V12 xong`, `v12 chưa khách không nghe`, `V12 chua` (thiếu lý do);
    - `H5 co`, `H5 không bận việc nhà`;
    - `giao 2: gọi lại khách han 30/10`, `giao Lan: ...`;
    - tin 6 số; tin rác.
  - `canMove` đủ bảng chuyển cho người nhận, người giao, leader của nhân viên, người lạ.
  - `weekOfMonth`: tháng bắt đầu Chủ nhật, tháng 2, tuần 6.
  - Ghép mã:
    - đúng mã;
    - sai mã;
    - hết hạn;
    - dùng lại mã;
    - một chat nối lại người khác;
    - sai 5 lần thì khoá 1 giờ.
  - `moveTask` sai trạng thái cũ không ghi.
  - Leader A không thấy, không đổi việc của team B.
  - Nhân viên không đổi việc của nhân viên khác.
- Cách kiểm: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`.

**Z2. Bot Zalo: gửi, webhook, xử lý lệnh**
- File được sửa: `lib/zalo.ts` (mới), `lib/zalo-work.ts`, `app/api/zalo/webhook/route.ts` (mới), `lib/access.ts` (chỉ thêm đường dẫn webhook cho qua), `db/env.d.ts` (khai báo `ZALO_BOT_TOKEN?: string`), `tests/*.test.ts`, `tests/support/*`.
- Việc: mục 3 đầy đủ. Hàm xử lý một tin đến tách riêng `handleZaloUpdate(db, update, send, now)` để Z3 (ô thử demo) và test dùng chung.
- Tiêu chí xong:
  - Webhook sai mã bí mật trả 401 (so sánh thời gian hằng).
  - Chat chưa nối gửi mã đúng thì nối, gửi chữ thì nhận câu hướng dẫn.
  - Mỗi lệnh ở bảng "Ai nhận tin gì" gửi đúng người, đúng chữ (test bằng hàm `send` giả, đếm tin).
  - `DEMO_MODE=1` không gọi `fetch` (test thay `fetch` toàn cục bằng hàm ném lỗi).
  - Thiếu token thì không lỗi.
- Cách kiểm: bốn lệnh như Z1.

**Z3. Trang Giao việc, Họp, Danh bạ Zalo trên web; dữ liệu demo**
- File được sửa:
  - mới: `app/giao-viec-view.tsx`, `app/giao-viec-hop-view.tsx`, `app/giao-viec-zalo-view.tsx`, `app/api/giao-viec/**/route.ts`, `lib/demo/zalo-work.ts`;
  - sửa: `app/dashboard.tsx`, `lib/nav-structure.ts`, `lib/access.ts`, `lib/zalo-work.ts`, `lib/demo/mode.ts` (chỉ thêm một lời gọi seed trong `ensureDemoSeed`), `tests/*.test.ts`.
- Việc: mục 5 đầy đủ.
- Tiêu chí xong:
  - `tests/nav-structure.test.ts`: mục `giao-viec` đứng trước `cai-dat`, tab đầu là Tổng quan.
  - `tests/access.test.ts`: chỉ owner và người trong danh sách sếp gọi được `/api/giao-viec*`; mentor, lead, staff nhận 403; các ca cũ còn xanh.
  - Seed demo chạy 2 lần không nhân đôi; không có SĐT, email ngoài `@demo.megatech.vn`.
  - Chạy `pnpm dev` với `DEMO_MODE=1`, đăng nhập `chu@demo.megatech.vn` và thử: giao việc → thấy tin trong Hộp thư Zalo (demo); dùng ô "Thử nhắn như" gõ `V<n> nhan`, `V<n> chua bận`, `H<n> khong ốm`, `giao 1: thử han 31/10` → trạng thái trên trang đổi đúng. Ghi từng bước vào tóm tắt.
  - Điện thoại 390px không cuộn ngang trang.
- Cách kiểm: bốn lệnh như Z1.

**Z4. Tin tự động: bản tin 8h, doanh số 12h/17h/22h, nhắc hạn, thiếu số, nhắc họp**
- File được sửa: `lib/zalo-tick.ts` (mới), `lib/zalo-work.ts`, `worker.ts` (chỉ thêm đúng một lời gọi `maybeZaloTick` trong `scheduled`, bọc `ctx.waitUntil(...catch(...))` như các tick khác), `app/giao-viec-zalo-view.tsx` (nút "Chạy thử mốc 12h" chỉ ở demo), `app/api/giao-viec/zalo/**`, `tests/*.test.ts`, `tests/support/*`.
- Việc: mục 4 đầy đủ.
- Tiêu chí xong:
  - Test với đồng hồ giả:
    - 07:59 không gửi; 08:00 gửi bản tin 1 lần; 08:01 không gửi lại;
    - 12:00 gửi khung 8–12h với số = mốc 12h − mốc 8h;
    - thiếu mốc 8h thì ghi "từ đầu ngày";
    - 22:00 gửi khung 17–22h;
    - tắt `slotReports` thì không gửi.
  - **Số doanh số trong tin bằng đúng** `overviewReport` cùng phạm vi team (test gọi cả hai trên D1 giả có đơn mẫu).
  - Thiếu số:
    - sale có số lúc 9:00, tới 10:01 (ngưỡng 60) thì báo 1 lần;
    - 10:16 không báo lại;
    - có số lúc 10:20 rồi trống tới 11:21 thì báo lần 2;
    - sale chưa có số nào hôm nay thì không báo;
    - ngoài khung giờ thì không báo.
  - Nhắc quá hạn gửi đúng người giao, đúng người nhận.
  - Mỗi lượt không quá 30 tin.
  - Phút không có việc chỉ đọc ≤ 2 dòng D1 (đếm trong test).
- Cách kiểm: bốn lệnh như Z1.

## Kiểm thử của Claude (một lần, sau Z4)

1. Đọc diff cả nhánh, đối chiếu "Không được đổi" (nhất là số doanh số và không chỉ mục mới trên `raw_pos_orders`).
2. Báo điều phối, gộp `codex/giao-viec-zalo-2710` vào nhánh demo (merge thường). Demo tự deploy, tự chạy migration 0047.
3. Playwright trên demo (1280 và 390): trang Tổng quan giao việc, form, Sheet chi tiết, trang Họp có chip trả lời, Danh bạ Zalo, Hộp thư Zalo demo sau khi thử vài lệnh. So số trong tin "Chạy thử mốc 12h" với ô Doanh số Tổng quan Sale lọc cùng team. Ảnh gửi anh bằng Artifact.

## Lên web thật (khi anh ok demo)

1. Nhánh từ `main`, cherry-pick các commit Z1–Z4, PR vào `main`. Merge là deploy tự chạy migration 0047 (chỉ tạo bảng mới).
2. Anh tạo bot bằng ứng dụng **Zalo Bot Creator** trên Zalo của anh. Anh dán mã bot vào Secret `ZALO_BOT_TOKEN` của Worker `tong-hop-pos` (Claude hướng dẫn từng bước bằng ảnh).
3. Anh bấm "Nối webhook Zalo" trên trang Danh bạ Zalo.
4. Anh nối Zalo của chính anh trước, thử nhận một việc. Rồi thêm anh Nghĩa, 5 leader, nhân viên, gửi mã nối cho từng người.

## Rủi ro và cách lùi

- **Bot không nhắn trước được:** mọi người vẫn nhắn bot trước một lần khi nối (mã 6 số), nên phần lớn trường hợp vẫn ổn. Nếu Zalo chặn hẳn thì báo anh, cân nhắc ZNS.
- **Zalo giới hạn tần suất:** trần 30 tin mỗi lượt, cách 300 ms. Tin lỗi ghi nhật ký, không gửi lại liên tục.
- **Số doanh số lệch trang Tổng quan:** dùng chung `overviewReport`; test Z4 so trực tiếp.
- **Lộ việc giữa các team:** mọi lệnh Zalo kiểm người gửi theo `chat_id`; người lạ chỉ nhận câu hướng dẫn nối. Test Z1/Z2.
- **Lộ dữ liệu khách:** tin Zalo không chứa SĐT, tên khách. Chỉ tên nhân viên, số tổng.
- **Cảnh báo thiếu số báo sai** (ví dụ sale nghỉ giữa ca): ngưỡng và khung giờ chỉnh trên web; có công tắc tắt.
- **Lùi:** tắt công tắc trên web (không gửi gì nữa); xoá Secret `ZALO_BOT_TOKEN` là bot im hẳn; revert commit giao diện là trang biến mất. Bảng mới để lại không ảnh hưởng.
