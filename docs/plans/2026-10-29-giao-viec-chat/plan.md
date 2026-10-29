# Giao việc dạng chat (29/10/2026)

Hình mẫu anh đã xem: Artifact 3uTQHDJeRcjSaips57j3LK (tên và số trong hình là ví dụ).

## 1. Mục tiêu (lời anh)
- 29/10 00:03Z: "Tại sao không làm phần giao việc như dạng chat trong video nhỉ, rồi các thẻ cuộc họp, các thẻ giao việc,…. Khi nhân sự trả lời trong zalo thì tin nhắn cũng xuất hiện ở chat trên web"
- 29/10 00:18Z, khi hỏi chat thay tab cũ hay thêm tab: "Thêm trước, ok thì ẩn cái cũ sau."

Kết quả anh thấy được:
- Mục Giao việc có thêm tab **Chat**, đặt đầu tiên, bên cạnh các tab cũ. Tab Giao việc, Họp, Danh bạ Zalo cũ giữ nguyên.
- Cột trái: danh sách leader và nhân viên đã có trong Danh bạ Zalo.
  - Mỗi dòng có tin cuối, giờ, số tin chưa đọc, nhãn "N việc mở", "N quá hạn", "Họp HH:MM", "Chờ trả lời".
  - Trên cùng là ô tìm và các bộ lọc: Tất cả / Chưa đọc / Quá hạn / Leader / Nhân viên.
- Giữa: khung chat với người đang chọn, xếp theo thời gian, có dòng chia ngày.
  - Tin người đó nhắn bot trên Zalo nằm bên trái, có chữ nhỏ "Zalo".
  - Tin bot hoặc sếp gửi nằm bên phải, có dấu "đã gửi Zalo ✓", hoặc "chưa nối Zalo" nếu người đó chưa nối.
  - Thẻ việc: số việc, tên, thời gian (`timeLabel`), người giao, Gấp, chip trạng thái, thanh 4 nấc (Mới giao, Đã nhận, Đang làm, Xong; Chưa xong tô cam). Nút: Nhắc tiến độ, Sửa việc (mở Sheet sửa có sẵn), Huỷ.
  - Thẻ họp: số họp, tên, giờ, nơi, đếm đi / không / chưa trả lời. Nút: Nhắc trả lời.
  - Dòng hệ thống (căn giữa, viền đứt) khi trạng thái việc đổi.
- Dưới: các nút câu soạn sẵn (Nhắc tiến độ, Hỏi lý do, Cảm ơn tốt lắm, Báo cáo cuối ngày, Gọi cho anh), nút "+ Giao việc / Họp" và ô nhắn. Gõ xong bấm gửi thì bot gửi Zalo cho người đó.
- Cột phải (ẩn khi màn hẹp): số việc đang mở / quá hạn / xong tuần, danh sách việc đang mở, họp sắp tới.
- Tin mới tự hiện khi đang mở trang: hỏi lại mỗi 20 giây; tab trình duyệt bị ẩn thì dừng hỏi.

## 2. Không được đổi
- Số liệu, cách tính, quyền xem. Chỉ người qua `bossRoute` (anh Vũ, anh Nghĩa, chủ hệ thống) xem và nhắn được.
- Lệnh bot (`parseCommand`), mẫu tin bot gửi, lịch cron, tab cũ. Không sửa `wrangler*`, `.github/workflows/*`.
- Migration chỉ thêm bảng mới `0049`, không sửa bảng cũ.
- Không lên demo (anh cấm). Kiểm bằng `pnpm dev` với `DEMO_MODE=1`, chụp ảnh.

## 3. Hiện trạng (main 552d078)
- Gửi Zalo: `lib/zalo.ts` `sendZalo()` (mọi tin đi qua đây), `createZaloSender()`. Ở demo, tin ghi vào `app_settings.demo_zalo_outbox`.
- Nhận tin: `lib/zalo-work.ts` `handleZaloUpdate()` (từ cron `lib/zalo-poll.ts`, webhook `app/api/zalo/webhook/route.ts`, nút thử `app/api/giao-viec/zalo/thu/route.ts`).
- Tin gửi người: `notifyContact()` / `safeSend()` trong `lib/zalo-work.ts`. `createTask`, `moveTask`, `addTaskNote`, `editTask`, `createMeeting`, `answerMeeting`, `cancelMeeting` gọi nó.
- Tab: `app/dashboard.tsx` dòng ~426–429 (`giao-viec`, `giao-viec-hop`, `giao-viec-zalo`), lazy import dòng ~126, render dòng ~1723, danh sách `SELF_HEADED`.
- Giao diện mẫu: `app/giao-viec-view.tsx` (Sheet giao/sửa việc, `workApi`, `vnToday`), `app/giao-viec-ui.tsx` (`TaskChip`, `workDate`).
- Demo: `lib/demo/zalo-work.ts` `seedZaloWork()`.

## 4. Thiết kế

### 4.1 Dữ liệu: `drizzle/0049_zalo_messages.sql`
```sql
CREATE TABLE IF NOT EXISTS `zalo_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `contact_id` text NOT NULL,        -- zalo_contacts.id
  `dir` text NOT NULL,               -- 'in' (người đó nhắn bot) | 'out' (bot/sếp gửi)
  `kind` text NOT NULL DEFAULT 'text', -- 'text' | 'task' | 'meeting' | 'status'
  `ref_no` integer,                  -- số việc/họp khi kind là task/meeting/status
  `body` text NOT NULL,
  `author_id` text,                  -- zalo_contacts.id của sếp gõ trên web; null = bot tự gửi
  `delivered` integer NOT NULL DEFAULT 1, -- 0 khi người đó chưa nối Zalo hoặc gửi lỗi
  `created_at` text NOT NULL,
  `read_at` text                     -- chỉ dùng cho dir='in'
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_zalo_messages_contact` ON `zalo_messages` (`contact_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_zalo_messages_unread` ON `zalo_messages` (`dir`,`read_at`);
```

### 4.2 `lib/zalo-chat.ts` (mới, không import React)
- `logMessage(db, m)`: chèn 1 dòng. Không bao giờ ném lỗi ra ngoài; lỗi thì `console.error('zalo chat log failed')`.
- `listConversations(db)`: mỗi liên hệ active (leader, staff) có:
  - tin cuối (body cắt 80 ký tự, dir, giờ) và số tin `in` chưa đọc;
  - số việc mở và quá hạn (dùng `taskState` với giờ VN);
  - họp sắp tới trong 24 giờ chưa huỷ;
  - cờ "chờ trả lời": tin cuối là `out` và cũ hơn 2 giờ.
  - Một câu SQL gom theo `contact_id`, không N+1. Giới hạn 200 liên hệ.
- `listMessages(db, contactId, { before?, after?, limit=60 })`: theo `created_at`. Kèm `tasks` (các việc có `no` trong `ref_no` của các tin đó, lấy bằng `json_each`) và `meetings` (kèm đếm trả lời), để thẻ luôn hiện trạng thái mới nhất.
- `markRead(db, contactId, now)`: `UPDATE ... SET read_at=? WHERE contact_id=? AND dir='in' AND read_at IS NULL`.
- `sendChat(db, actor, contactId, text, now, send)`:
  - text 1–1000 ký tự sau `trim`;
  - người nhận phải active và là leader hoặc staff;
  - gửi bằng `send` nếu có `chat_id`;
  - log `out`, `author_id=actor.id`, `delivered=0` nếu chưa nối hoặc gửi lỗi.
- `pruneMessages(db, now)`: xoá tin cũ hơn 180 ngày, tối đa 500 dòng mỗi lần. Gọi từ `lib/zalo-tick.ts` lúc 02:xx giờ VN, mỗi ngày một lần (dùng khoá ngày trong `app_settings` như các mốc khác).

### 4.3 Ghi tin vào bảng
- **Tin đi:** `notifyContact()` và `safeSend()` nhận thêm tham số tuỳ chọn `meta?: { kind, refNo }` rồi gọi `logMessage` sau khi gửi.
  - Có `chat_id`: `delivered = 1` nếu gửi không lỗi.
  - Không có `chat_id`: vẫn log với `delivered = 0`, để sếp thấy trong chat là chưa tới.
  - Truyền `meta`:
    - `createTask`, `editTask` (khi gửi lại thẻ): `{ kind: 'task', refNo: t.no }`;
    - `createMeeting`: `{ kind: 'meeting', refNo }`, và nhắc họp trong `zalo-tick`;
    - `moveTask`, `answerMeeting`, `cancelMeeting`, `addTaskNote`: `{ kind: 'status', refNo }`;
    - báo cáo khung giờ, bản tin 8h, cảnh báo: `kind: 'text'`.
  - Không đổi nội dung tin.
- **Tin đến:** trong `handleZaloUpdate`, sau khi có `chatId`, `text` và `actor` (liên hệ đã nối), log `in`. `kind = 'status'` và `ref_no = command.no` nếu lệnh là status/note/meeting, còn lại `'text'`. Tin của người chưa nối và tin mã nối 6 số thì **không** log.
- Tin trả lời của bot cho chính người đó (ví dụ "Đã ghi: việc số 12 Đã nhận") cũng log `out` để chat đủ hai chiều.

### 4.4 API (mỏng, qua `bossRoute` như `app/api/giao-viec/route.ts`)
- `GET  /api/giao-viec/chat` trả `{ conversations }`.
- `GET  /api/giao-viec/chat/[contactId]?after=ISO&before=ISO` trả `{ contact, messages, tasks, meetings }`. Khi không có `before` thì gọi `markRead`.
- `POST /api/giao-viec/chat/[contactId]` nhận `{ text }`, gọi `sendChat` với `createZaloSender(db)`.
- `POST /api/giao-viec/chat/[contactId]/nhac` nhận `{ kind: 'task'|'meeting', no }` và gửi câu nhắc mẫu:
  - việc: "Anh/chị cập nhật giúp việc số {no}: {tên}. Trả lời: nhận việc {no} · đang làm việc {no} · xong việc {no} · chưa xong việc {no}: lý do";
  - họp: "Anh/chị trả lời giúp họp số {no}: đi họp {no} · không đi họp {no}: lý do".
  - Log với `kind` tương ứng.

### 4.5 Giao diện: `app/giao-viec-chat-view.tsx` (mới)
- Dùng `workApi`, `vnToday`, Sheet giao/sửa việc. Tách Sheet giao việc trong `giao-viec-view.tsx` thành component xuất ra (ví dụ `TaskSheet`) để dùng chung, không chép thêm bản khác. Họp: nút mở tab Họp có sẵn.
- Dùng linh kiện có sẵn trong `components/ui/` và `app/ui-kit` (Avatar, StatusChip, Input, Textarea, Sheet, EmptyState, SkeletonTable).
- Màu: xanh `#17684b` (token sẵn có của web), nền chat chấm nhạt như hình mẫu, hai chế độ sáng/tối dùng biến có sẵn.
- Bố cục:
  - ≥1040px: 3 cột (300px | còn lại | 280px).
  - 700–1040px: 2 cột, ẩn cột phải.
  - <700px: chỉ danh sách; bấm vào người thì mở khung chat toàn màn, có nút "‹" quay lại.
- Hỏi tin mới mỗi 20 giây bằng `after=` tin cuối, chỉ khi `document.visibilityState === 'visible'`. Danh sách người làm mới mỗi 60 giây.
- Cuộn tới tin mới nhất khi mở. Kéo lên đầu thì tải thêm bằng `before=`.
- Enter gửi, Shift+Enter xuống dòng. Bấm nút câu soạn sẵn thì điền vào ô, không gửi ngay.
- Chữ trên web tiếng Việt. Cuối trang có 1 dòng ghi chú: "Tin Zalo về web chậm khoảng 1 phút. Chỉ lưu 180 ngày."

### 4.6 Tab
- `app/dashboard.tsx`: thêm view `giao-viec-chat` nhãn **Chat**, đặt trước `giao-viec`.
  - Thêm vào `View`, danh sách tab, `SELF_HEADED`, danh sách loại trừ ở dòng ~1610, lazy import và render `{!gated && workBoss && view === 'giao-viec-chat' && <GiaoViecChatView />}`.
  - Nhóm điều hướng Giao việc phải hiện tab mới. Xem cách `giao-viec-hop` được thêm và làm giống.
- Không ẩn tab cũ (anh: "ok thì ẩn cái cũ sau").

### 4.7 Demo
- `seedZaloWork()`: tạo sẵn khoảng 20 tin `in`/`out` cho 3 leader, có tin chưa đọc, dùng số việc/họp vừa tạo (tên lấy từ `lib/demo/world`, là tên ảo).
- Khi `DEMO_MODE=1`, `sendChat` vẫn ghi bảng (và `demo_zalo_outbox` như cũ).
- Nút "Gửi thử" ở Danh bạ Zalo (demo) đi qua `handleZaloUpdate` nên tự log `in`.

## 5. Các bước (mỗi bước một nhánh `codex/...`, PR vào `main`, KHÔNG gộp nhánh demo)

**C1. Dữ liệu + ghi tin** (`codex/chat-c1-du-lieu`)
- File:
  - `drizzle/0049_zalo_messages.sql`;
  - `lib/zalo-chat.ts`;
  - `lib/zalo-work.ts` (chỉ thêm `meta`, log in/out);
  - `lib/zalo-tick.ts` (prune và `meta`);
  - `lib/demo/zalo-work.ts`;
  - `tests/zalo-chat.test.ts`;
  - các test zalo hiện có (nạp thêm 0049 trong fixture).
- Xong khi:
  - `createTask` → 1 dòng `out` `kind='task'`;
  - tin "nhận việc 12" của leader đã nối → 1 dòng `in` `kind='status'` `ref_no=12` và 1 dòng `out` trả lời;
  - mã nối 6 số không log;
  - liên hệ chưa nối → `delivered=0`;
  - `listConversations` đúng số chưa đọc;
  - `markRead` về 0;
  - `pruneMessages` chỉ xoá tin >180 ngày;
  - mọi test cũ vẫn xanh.
- Kiểm: `pnpm test` (cả tests/zalo*.test.ts), `pnpm typecheck`.

**C2. API** (`codex/chat-c2-api`)
- File: `app/api/giao-viec/chat/route.ts`, `app/api/giao-viec/chat/[contactId]/route.ts`, `.../[contactId]/nhac/route.ts`, test quyền.
- Xong khi:
  - không phải sếp → 403;
  - gửi text rỗng hoặc dài hơn 1000 ký tự → 400 với lời tiếng Việt;
  - gửi cho `kind='boss'` → 400;
  - `after=` chỉ trả tin mới.
- Kiểm: test route theo mẫu `tests/zalo-web.test.ts`.

**C3. Giao diện tab Chat** (`codex/chat-c3-giao-dien`)
- File: `app/giao-viec-chat-view.tsx`, `app/giao-viec-view.tsx` (chỉ tách Sheet dùng chung), `app/dashboard.tsx` (thêm tab).
- Xong khi giống hình mẫu ở 3 bề rộng (1280, 900, 390) và cả hai chế độ sáng/tối:
  - thẻ việc đổi trạng thái sau khi "Gửi thử" lệnh ở Danh bạ Zalo (demo);
  - gửi tin hiện ngay bên phải.
- Kiểm: `pnpm dev` với `DEMO_MODE=1`, Playwright chụp 6 ảnh (3 bề rộng × sáng/tối) lưu `docs/plans/2026-10-29-giao-viec-chat/anh/`; đủ 4 lệnh.

## 6. Kiểm thử
- Đủ 4 lệnh: `pnpm typecheck`, `pnpm test`, `pnpm lint` (không thêm lỗi; hiện 1173 lỗi có sẵn), `pnpm build`.
- Ảnh C3 gửi anh bằng Artifact. Anh "ok lên" thì mới gộp `main`.

## 7. Ước chi phí Cloudflare (gói 5 USD)
- **Ghi:** mỗi tin 1 dòng cộng 2 chỉ mục. Ước 300 tin mỗi ngày, khoảng 900 lần ghi mỗi ngày, cỡ 27 nghìn mỗi tháng. Hạn mức gói là 50 triệu, tức khoảng 0,05%.
- **Đọc:**
  - Chat mở 8 giờ mỗi ngày, hỏi mỗi 20 giây: khoảng 1.440 lượt mỗi ngày. Mỗi lượt đọc vài chục dòng nhờ chỉ mục, cỡ 100 nghìn dòng mỗi tháng.
  - Danh sách người hỏi mỗi 60 giây, mỗi lượt đọc vài nghìn dòng: dưới 50 triệu dòng mỗi tháng. Gói cho 25 tỷ dòng mỗi tháng, tức dưới 0,2%.
- **Dung lượng:** 180 ngày × 300 tin × khoảng 300 byte, cỡ 16 MB.
- Không thêm Worker, cron hay dịch vụ nào.

## 8. Rủi ro và cách lùi
| Rủi ro | Cách xử lý |
|---|---|
| Log lỗi làm hỏng gửi Zalo | `logMessage` bọc try/catch, không ném lỗi ra ngoài |
| Đếm chưa đọc chậm khi bảng lớn | Chỉ mục `(dir, read_at)`, xoá tin cũ hơn 180 ngày |
| Tab mới lỗi | Tab cũ vẫn chạy; gỡ tab bằng cách bỏ 1 dòng trong `dashboard.tsx` |
| Bảng mới cần lùi lại | Bảng chỉ thêm mới, không đụng bảng cũ; có thể để nguyên |

## 9. Liên quan
- Plan KPI + báo cáo (nhánh `claude/giao-viec-kpi-bao-cao-2810`, `docs/plans/2026-10-28-giao-viec-kpi-bao-cao/plan.md`):
  - phần A (khoảng thời gian) và phần B (lệnh Zalo) **đã xong ở PR #100**, bỏ, không làm lại. Lệnh bot giữ kiểu chữ tiếng Việt anh đã chọn, không làm kiểu gõ số;
  - làm phần C (KPI) và D (báo cáo, ảnh) **sau** C3, dựng trên `main` mới.
