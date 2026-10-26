# Giao việc cho leader trên web tổng (26/10/2026)

Thread "Làm trang giao việc cho leader" viết. Anh Vũ nhắn 26/10 04:31Z: "tôi muốn làm 1 web nữa hoặc tích hợp trên web tổng quan, bạn xem cái nào ok hơn, thì triển khai, để làm web giao việc cho các đầu leader ấy".

Quy trình chung (AGENTS.md, luật 15/10): Codex làm liền các bước V1 → V3 trên PC, máy kiểm sau mỗi bước, Claude kiểm một lần cuối, lên demo cho anh xem. Anh ok mới lên web thật.

## Chọn cách làm: gắn vào web tổng, không làm web riêng

| | Gắn vào web tổng (chọn) | Web riêng |
|---|---|---|
| Đăng nhập | Dùng chung tài khoản, 2 lớp, khoá tài khoản sẵn có | Phải làm lại đăng nhập hoặc nối qua handoff |
| Leader / team | Có sẵn: `users.role` (lead, mentor), `users.manager_id`, team trên web | Phải chép sang |
| Chi phí Cloudflare | 2 bảng nhỏ trong D1 sẵn có, không thêm Worker | Thêm Worker + D1, thêm một chỗ phải canh |
| Gắn với số liệu | Sau này bấm từ một con số ra "giao việc" được ngay | Phải gọi chéo |

## Mục tiêu (lời anh)

1. Sếp (chủ hệ thống, giám đốc) **giao việc cho từng leader** trên web tổng: tên việc, nội dung, hạn chót, mức gấp.
2. Leader vào web là **thấy ngay việc được giao**. Leader bấm Bắt đầu / Xong và ghi tiến độ ngắn.
3. Sếp nhìn **một trang** là biết ai đang ôm bao nhiêu việc, việc nào quá hạn, việc nào xong.
4. Gọn, xanh lá `#17684b`, bộ lọc hiện sẵn dạng nút (không gom vào ô thả xuống), ghi chú để cuối trang.

**Câu đã hỏi anh, chưa có trả lời:** chỉ sếp giao cho leader, hay leader cũng giao tiếp xuống nhân viên? V1–V3 làm phần sếp → leader. Nếu anh muốn leader giao xuống thì làm thêm V4 (đã viết sẵn ở cuối, chưa chạy).

## Không được đổi

- Số liệu, cách tính, tên số, quyền xem các trang khác. Trang giao việc không đọc bảng đơn hay số liệu.
- `WORLD_VERSION`, các `*_EPOCH`, `wrangler*.json*`, `.github/**`, `scripts/**`.
- Khoá tài khoản 23/10 (`lib/auth.ts` `LOCKED_MESSAGE`, `loginBlocked`): không đụng.
- "Việc của tôi" hiện có (`lib/my-tasks.ts`, `/api/tasks`): giữ nguyên cách tính đơn kẹt / khách cần gọi. Chỉ **thêm** một khối mới phía trên.
- Chỉ được thêm **một** file migration: `drizzle/0047_leader_tasks.sql` (nội dung đúng như mục Thiết kế). Không sửa `drizzle/meta/**`, không sửa `db/schema.ts`.

## Hiện trạng (nhánh demo `claude/project-thread-3ujeoc`, 4588cea)

- Vai trò: `lib/access.ts:5` (`owner | director | lead | mentor | staff`). `canView` ở `lib/access.ts:61`. Mentor bị khoá trong `scopeApi` (`lib/access.ts` nhánh `a.role === 'mentor'`): chỉ gọi được `MENTOR_REPORTS`, `/api/targets`, `/api/auth/*`, `/api/prefs/metrics`.
- Người dùng: bảng `users` (`db/schema.ts:173`) có `id, email, name, role, disabled, title, manager_id`.
- Phiên: `getSessionUser()` trong `lib/auth.ts` trả `SessionUser` (`userId, displayName, role, title, ...`).
- "Việc của tôi": `app/tasks-view.tsx`, `lib/my-tasks.ts`, `app/api/tasks/route.ts`. Hiện dưới Tổng quan Sale/CSKH (`app/dashboard.tsx` dòng có chú thích "Việc của tôi nằm dưới Tổng quan").
- Thanh bộ phận trên cùng: `DEPT_LAYOUT` trong `lib/nav-structure.ts`. Trang được đăng ký trong `app/dashboard.tsx` (kiểu `View`, mảng `navigation`, `SELF_HEADED`, chỗ render `{!gated && view === ...}`).
- Demo: tài khoản ảo trong `lib/demo/mode.ts` `DEMO_ACCOUNTS` (có `leader.sale@demo…`, `leader.cskh@demo…`, `truongphong@demo…`, `mentor@demo…`). `demoBlocked` không chặn đường dẫn mới, nên demo ghi được.
- Kiểu giờ: `todayVn()` trong `lib/report-time.ts` trả ngày `YYYY-MM-DD` giờ Việt Nam.
- Nhật ký: `audit()` trong `lib/audit.ts`.
- UI dùng lại: `app/ui-kit.tsx` (`KpiCard`, `StatusChip`, `EmptyState`, `ErrorBox`, `Avatar`, `toast`), `components/ui/` (`sheet`, `dialog`, `textarea`, `input`, `button`, `native-select`, `calendar`).

## Thiết kế

### Dữ liệu: `drizzle/0047_leader_tasks.sql`

```sql
-- Giao việc cho leader (26/10/2026). Sếp giao, leader cập nhật. Không chứa SĐT hay tên khách.
CREATE TABLE IF NOT EXISTS `leader_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL DEFAULT '',
	`assignee_id` text NOT NULL,
	`assigned_by` text NOT NULL,
	`urgent` integer NOT NULL DEFAULT 0,
	`due_date` text,
	`status` text NOT NULL DEFAULT 'moi',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`done_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_leader_tasks_assignee` ON `leader_tasks` (`assignee_id`,`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_leader_tasks_status_due` ON `leader_tasks` (`status`,`due_date`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `leader_task_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`author_id` text NOT NULL,
	`kind` text NOT NULL DEFAULT 'note',
	`body` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_leader_task_notes_task` ON `leader_task_notes` (`task_id`,`created_at`);
```

- `status`: `moi` (Chưa làm), `dang_lam` (Đang làm), `xong` (Xong), `huy` (Đã huỷ).
- `due_date`: `YYYY-MM-DD` giờ Việt Nam, có thể trống.
- `kind` của ghi chú: `note` (người viết gõ), `status` (máy ghi khi đổi trạng thái, `body` là ví dụ `moi>dang_lam`), `edit` (sếp sửa tên/hạn/người nhận, `body` mô tả ngắn trường đã đổi).
- Không khoá ngoại (giống các bảng khác của repo). Tên người lấy bằng JOIN `users` khi đọc.

### `lib/leader-tasks.ts` (không import React, không import `cloudflare:workers`; nhận `db: D1Database` làm tham số để test được)

Kiểu:
```ts
export type LeaderTaskStatus = 'moi' | 'dang_lam' | 'xong' | 'huy';
export type LeaderTaskState = 'overdue' | 'today' | 'soon' | 'later' | 'none' | 'done' | 'cancelled';
export type LeaderTask = { id; title; detail; assigneeId; assigneeName; assigneeTitle; assignedById; assignedByName; urgent: boolean; dueDate: string | null; status; state: LeaderTaskState; createdAt; updatedAt; doneAt: string | null; lastNote: { body: string; authorName: string; at: string } | null };
export type LeaderTaskNote = { id; kind: 'note' | 'status' | 'edit'; body; authorName; at };
export type Assignee = { id; name; title; role: Role; open: number; overdue: number };
```

Hằng số và hàm thuần (test kĩ):
- `STATUS_LABELS = { moi: 'Chưa làm', dang_lam: 'Đang làm', xong: 'Xong', huy: 'Đã huỷ' }`.
- `taskState(task, today)`: `xong` → `done`; `huy` → `cancelled`; không hạn → `none`; `due < today` → `overdue`; `due === today` → `today`; `due <= today + 3 ngày` → `soon`; còn lại `later`.
- `canAssign(user)`: `owner` hoặc `director`.
- `assignableRoles(user)`: owner → `['director','lead','mentor']`; director → `['lead','mentor']`; người khác → `[]`.
- `canSeeTask(user, task)`: owner thấy hết; director thấy việc mình giao **và** việc giao cho mình; còn lại chỉ việc có `assigneeId === user.userId`.
- `canEditTask(user, task)`: owner, hoặc người giao (`assignedById === user.userId`). Sửa được: tên, nội dung, hạn, gấp, người nhận, huỷ / mở lại.
- `canMoveStatus(user, task, to)`: người nhận được `moi → dang_lam`, `dang_lam → xong`, `xong → dang_lam` (làm lại), `moi → xong`. Người giao / owner được mọi chuyển, kể cả `huy` và `huy → moi`. Ai khác: không.
- `canNote(user, task)`: người nhận, người giao, owner.
- `validateTaskInput(body, today)`: `title` trim 1–120 ký tự, không ký tự điều khiển; `detail` ≤ 2000; `dueDate` rỗng hoặc đúng `YYYY-MM-DD`, là ngày có thật, không trước `today` khi tạo mới (khi sửa thì cho giữ hạn cũ); `urgent` boolean; `assigneeId` chuỗi 1–100. Trả `{ value } | { error: string }` với lời tiếng Việt.
- `validateNote(body)`: trim 1–1000.
- `sortTasks(items)`: việc mở trước, trong việc mở: `overdue`, `today`, `soon`, `later`, `none`; cùng nhóm thì gấp trước, rồi hạn sớm trước, rồi `createdAt` cũ trước. Việc đóng (`done`, `cancelled`) sau cùng, `doneAt`/`updatedAt` mới trước.
- `summarize(items, today)`: `{ open, overdue, today, doneWeek }` (`doneWeek` = xong trong 7 ngày gần nhất tính theo ngày VN của `doneAt`).

Hàm D1 (chỉ câu có `?` bind, không nối chuỗi giá trị người dùng):
- `listAssignees(db, user)`: `SELECT id,name,title,role FROM users WHERE disabled=0 AND role IN (...) AND id<>? ORDER BY role, name` theo `assignableRoles`, kèm số việc mở / quá hạn mỗi người (một câu `GROUP BY assignee_id` trên `leader_tasks WHERE status IN ('moi','dang_lam')`).
- `listTasks(db, user, { scope, status, assigneeId }, today)`:
  - `scope='mine'` (mặc định cho người không giao được): `assignee_id=?`.
  - `scope='given'` (mặc định cho người giao được): owner → mọi việc; director → `assigned_by=? OR assignee_id=?`.
  - `status='open'` (mặc định) → `status IN ('moi','dang_lam')`; `status='closed'` → `status IN ('xong','huy')` **và** `updated_at >= now - 30 ngày`, `LIMIT 200`.
  - `assigneeId` chỉ áp khi người gọi giao được.
  - Ghi chú cuối: một câu con `(SELECT body ... ORDER BY created_at DESC LIMIT 1)` cho `kind='note'`; tên người JOIN `users`.
  - Trần cứng: `LIMIT 500` cho việc mở.
- `getTask(db, id)`, `listNotes(db, taskId)` (`ORDER BY created_at`, `LIMIT 200`).
- `createTask(db, user, input, now)`: kiểm `canAssign`, kiểm người nhận nằm trong `listAssignees` (cùng điều kiện role/disabled), chặn khi người gọi đã có **≥ 2000 việc mở** (trần chống lỗi vòng lặp). `id = crypto.randomUUID()`.
- `updateTask(db, user, id, patch, now)`: một `UPDATE` cho trường được đổi + một dòng `leader_task_notes kind='edit'`; chạy chung `db.batch`.
- `moveStatus(db, user, id, to, now)`: `UPDATE leader_tasks SET status=?, updated_at=?, done_at=? WHERE id=? AND status=?` (điều kiện `status=` trạng thái cũ để hai người bấm cùng lúc không đè nhau; 0 dòng đổi → trả lỗi "Việc vừa được người khác cập nhật, tải lại.") + một dòng note `kind='status'`; chung `db.batch`.
- `addNote(db, user, id, body, now)`: một `INSERT` + `UPDATE leader_tasks SET updated_at=?`.
- `countMine(db, userId, today)`: `{ open, overdue, givenOverdue }` cho huy hiệu trên thanh. Một câu trên chỉ mục `idx_leader_tasks_assignee` và một câu `assigned_by=? AND status IN ('moi','dang_lam') AND due_date<?`.

### API (route mỏng, kiểm quyền bằng hàm ở `lib/leader-tasks.ts`)

| Đường dẫn | Ai | Việc |
|---|---|---|
| `GET /api/giao-viec?scope=&status=&assignee=` | mọi người đăng nhập | danh sách + `summary` + `canAssign` |
| `POST /api/giao-viec` | owner, director | tạo việc |
| `GET /api/giao-viec/nguoi-nhan` | owner, director | danh sách người nhận + số việc mở/quá hạn |
| `GET /api/giao-viec/dem` | mọi người đăng nhập | `{ open, overdue, givenOverdue }`: việc mở / quá hạn giao cho mình, và số việc quá hạn mình đã giao (0 với người không giao được) |
| `GET /api/giao-viec/[id]` | ai `canSeeTask` | việc + ghi chú |
| `PATCH /api/giao-viec/[id]` | theo `canEditTask` / `canMoveStatus` | body `{ status }` hoặc `{ title?, detail?, dueDate?, urgent?, assigneeId? }` |
| `POST /api/giao-viec/[id]/ghi-chu` | ai `canNote` | thêm ghi chú |

- Không thấy việc → trả **404** (không lộ việc có tồn tại).
- Mọi `POST`/`PATCH` gọi `audit()` với hành động `leader_task.create|update|status|note`, `target` là mã việc. Không ghi nội dung việc vào nhật ký.
- `Cache-Control: private, no-store`.
- `lib/access.ts`:
  - `VIEW_LABELS` thêm `'giao-viec': 'Giao việc'`.
  - `canView(a, 'giao-viec')` = `true` với mọi vai trò **trừ** `staff` (owner, director, lead, mentor). Thêm vào nhánh mentor: mentor xem được `'giao-viec'`.
  - `scopeApi`: nhánh mentor cho qua mọi đường dẫn bắt đầu `/api/giao-viec` (route tự kiểm `canSeeTask`, không có tham số POS/team). Với vai trò khác, `/api/giao-viec` không nằm trong `VIEW_GATES` (route tự kiểm).
  - Staff gọi `/api/giao-viec*` → route trả 403 "Trang giao việc chỉ dành cho sếp và leader." (trừ `/dem` trả `{open:0,overdue:0}` để thanh không lỗi).
- Demo: `DEMO_MODE=1` dùng chung bảng thật của D1 demo (dữ liệu ảo). `lib/demo/leader-tasks.ts` có `seedDemoLeaderTasks(db, now)`: chỉ chạy khi `leader_tasks` rỗng; tạo 7 việc ảo do tài khoản `chu@demo…` / `giamdoc@demo…` giao cho `leader.sale@demo…`, `leader.cskh@demo…`, `truongphong@demo…`, `mentor@demo…`: 2 quá hạn (1 gấp), 1 hạn hôm nay, 2 đang làm có ghi chú, 1 xong hôm qua, 1 không hạn. Nội dung ảo kiểu "Rà lại khách hoàn tuần này của team", "Gửi danh sách khách cần gọi lại trước 17h". Gọi từ `ensureDemoSeed()` trong `lib/demo/mode.ts` (một dòng). Không đổi `WORLD_VERSION`.

### Giao diện

**Chỗ đặt.** Thêm một mục vào `DEPT_LAYOUT` (`lib/nav-structure.ts`), đứng **ngay trước** "Cài đặt":
```ts
{ key: 'giao-viec', label: 'Giao việc', sections: [{ key: 'today', tabs: [['giao-viec', 'Việc giao leader']] }] },
```
Bấm "Giao việc" trên thanh trên cùng là vào thẳng trang (chỉ một tab, nên đây chính là "tổng quan" của mục này). Đăng ký `'giao-viec'` trong `app/dashboard.tsx`: kiểu `View`, `SELF_HEADED`, render `{!gated && view === 'giao-viec' && canView(user,'giao-viec') && <LeaderTasksView user={user} />}` (lazy import như `TasksView`). Mentor: chỗ ép mentor về `'mentor'` (dòng `if (user.role === 'mentor') return ...`) cho thêm `'giao-viec'`. Huy hiệu trên mục "Giao việc": số việc mở của chính mình (người nhận) hoặc số việc quá hạn mình đã giao (người giao), đỏ khi có quá hạn; lấy từ `/api/giao-viec/dem`, tải một lần khi vào web và sau mỗi thao tác trên trang, **không** hỏi lại theo chu kỳ.

**`app/leader-tasks-view.tsx`** (một file, dùng `api-fetch.ts`):

1. **Một dòng đầu** (không khối tiêu đề to): chữ "Giao việc" cỡ `text-xl font-semibold`, bên phải nút xanh **"+ Giao việc"** (chỉ người `canAssign`). Người không giao được: chữ "Việc sếp giao".
2. **Bốn ô số** (`KpiCard`, một hàng, điện thoại 2×2): Đang mở · Quá hạn (đỏ khi > 0) · Hạn hôm nay (vàng) · Xong 7 ngày (xanh). Bấm ô = lọc danh sách theo ô đó (bấm lại bỏ lọc). Mỗi ô có `tip` ghi rõ phạm vi: "Việc anh/chị đã giao, chưa xong" hoặc "Việc giao cho anh/chị".
3. **Hàng nút lọc người nhận** (chỉ người giao): nút "Tất cả" + một nút mỗi leader có việc mở, dạng `Tên · 3` và chấm đỏ nếu có quá hạn. Hiện sẵn, cuộn ngang trên điện thoại, **không** ô thả xuống.
4. **Hàng nút trạng thái**: "Đang mở" (mặc định) · "Đã xong / huỷ (30 ngày)".
5. **Danh sách việc**: thẻ mỗi việc một khối gọn:
   - Dòng 1: chấm màu trạng thái hạn (đỏ quá hạn, vàng hôm nay, xanh lá còn hạn, xám không hạn) + tên việc (đậm) + nhãn "Gấp" đỏ nhỏ nếu gấp.
   - Dòng 2 (chữ nhỏ, xám): `Avatar` + tên người nhận (người giao xem) hoặc "Giao bởi <tên>" (leader xem) · "Hạn 28/10" hoặc "Quá hạn 2 ngày" · `StatusChip` trạng thái.
   - Dòng 3 (nếu có): ghi chú mới nhất, cắt 1 dòng, "— <tên>, 2 giờ trước".
   - Bên phải: nút nhanh theo vai trò. Người nhận: "Bắt đầu" (khi Chưa làm), "Xong" (khi Đang làm). Người giao: không nút nhanh.
   - Bấm thẻ → mở **Sheet** (`components/ui/sheet.tsx`, bên phải trên máy tính, từ dưới lên trên điện thoại) chi tiết việc.
6. **Sheet chi tiết**: tên, nội dung (giữ xuống dòng), hạn, gấp, người giao, người nhận; hàng nút đổi trạng thái theo `canMoveStatus`; dòng thời gian ghi chú (ghi chú `status` hiện dạng "Nam chuyển sang Đang làm · 10:20"); ô gõ ghi chú + nút Gửi. Người `canEditTask` có thêm nút "Sửa" (mở lại form) và "Huỷ việc" (hỏi xác nhận bằng `alert-dialog`).
7. **Form giao việc** (Sheet): Người nhận = **lưới nút** tên leader (tên + chức danh nhỏ + số việc đang mở), chọn một; Tên việc; Nội dung (textarea); Hạn chót = nút nhanh "Hôm nay", "Mai", "Cuối tuần", "Chọn ngày" (mở `calendar`), "Không hạn"; công tắc Gấp; nút "Giao việc". Sau khi giao: `toast('Đã giao việc cho <tên>')`, đóng form, tải lại danh sách và huy hiệu.
8. **Trống**: `EmptyState` "Chưa có việc nào. Bấm + Giao việc để bắt đầu." (người giao) hoặc "Sếp chưa giao việc nào cho anh/chị." (leader).
9. **Cuối trang** (chữ nhỏ xám, một dòng): "Quá hạn: qua ngày hạn mà chưa Xong. Xong 7 ngày: tính theo ngày bấm Xong."
10. Không chu kỳ tự tải lại. Có nút tải lại nhỏ cạnh hàng nút trạng thái.

**Khối trong "Việc của tôi"** (`app/tasks-view.tsx`): nếu người dùng có việc được giao đang mở (`/api/giao-viec/dem` → `open > 0`), hiện **một dòng** phía trên các ô hiện có: "Sếp giao: 3 việc đang mở · 1 quá hạn → Xem" (bấm chuyển sang trang `giao-viec`). Không có việc thì không hiện gì. Thêm prop `onOpenLeaderTasks?: () => void` cho `TasksView`; `dashboard.tsx` truyền `() => goTo('giao-viec')`.

## Ước chi phí Cloudflare (gói 5 USD: 25 tỷ dòng đọc, 50 triệu dòng ghi, 5 GB mỗi tháng)

Giả định rộng tay: 40 tài khoản dùng, mỗi người mở trang giao việc 30 lần/ngày, 500 việc mở cùng lúc, 100 việc mới + 400 ghi chú/đổi trạng thái mỗi ngày.

| | Cách tính | Mỗi tháng | % phần gói đã gồm |
|---|---|---|---|
| Đọc khi mở trang | 40 × 30 × (≤ 500 việc + ≤ 40 người) ≈ 650 nghìn/ngày | ~20 triệu | 0,08% |
| Đọc huy hiệu | 40 × 10 lần × ≤ 50 dòng chỉ mục | ~0,6 triệu | ~0 |
| Ghi | (100 việc × 3 dòng gồm chỉ mục) + (400 × 3) ≈ 1.500/ngày | ~45 nghìn | 0,09% |
| Dung lượng | ~1 KB/việc, ~0,3 KB/ghi chú | < 10 MB/năm | 0,2% |

Kết luận: **không phát sinh tiền thêm**; không thêm Worker, không thêm cron, không chạy nền. Trần cứng trong code: `LIMIT 500` việc mở, `LIMIT 200` việc đóng và ghi chú, tối đa 2000 việc mở mỗi người giao. Bộ canh D1 sẵn có (PR #88) vẫn đếm phần này.

## Các bước (nhánh `codex/giao-viec-leader-2610` từ nhánh demo; một bước = một commit do script làm)

**V1. Bảng và logic giao việc**
- File được sửa: `drizzle/0047_leader_tasks.sql` (mới), `lib/leader-tasks.ts` (mới), `tests/leader-tasks.test.ts` (mới), `tests/support/*` (nếu cần D1 giả).
- Việc: viết đúng migration ở mục Thiết kế; viết mọi hàm thuần và hàm D1 của `lib/leader-tasks.ts`.
- Tiêu chí xong:
  - Test hàm thuần: `taskState` đủ 7 trạng thái (ranh giới hôm nay, +3 ngày, không hạn); `canSeeTask` / `canEditTask` / `canMoveStatus` / `canNote` cho đủ 5 vai trò; `validateTaskInput` (tên rỗng, 121 ký tự, ký tự điều khiển, ngày 2026-02-30, ngày quá khứ khi tạo, giữ hạn cũ khi sửa); `sortTasks` đúng thứ tự; `summarize` đúng `doneWeek`.
  - Test D1 (dùng `tests/support/d1-sqlite.ts` như các test khác, chạy migration 0047 thật): tạo → danh sách `mine` của leader có 1 việc, `given` của director có 1 việc; leader khác không thấy; staff không tạo được; director không giao được cho director khác; `moveStatus` với trạng thái cũ sai trả lỗi và không ghi; mỗi lần đổi trạng thái có đúng 1 dòng note `status`; việc đóng quá 30 ngày không hiện.
- Cách kiểm: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`.

**V2. API, quyền, dữ liệu demo**
- File được sửa: `app/api/giao-viec/route.ts`, `app/api/giao-viec/nguoi-nhan/route.ts`, `app/api/giao-viec/dem/route.ts`, `app/api/giao-viec/[id]/route.ts`, `app/api/giao-viec/[id]/ghi-chu/route.ts` (đều mới), `lib/access.ts`, `lib/leader-tasks.ts`, `lib/demo/leader-tasks.ts` (mới), `lib/demo/mode.ts` (chỉ thêm một lời gọi seed trong `ensureDemoSeed`), `tests/*.test.ts`.
- Việc: route mỏng như bảng API; sửa `lib/access.ts` đúng như mục Thiết kế (không đổi quyền trang nào khác); seed demo.
- Tiêu chí xong:
  - `tests/access.test.ts` thêm ca: `canView` `'giao-viec'` đúng cho 5 vai trò; `scopeApi` mentor `GET/POST/PATCH /api/giao-viec...` không bị chặn; mentor vẫn bị chặn các API cũ như trước (ca cũ còn xanh).
  - Test seed demo: chạy 2 lần chỉ tạo 7 việc; không có SĐT/email ngoài `@demo.megatech.vn`.
  - Test route (gọi hàm handler với `Request` giả nếu repo đã có kiểu test này; không có thì test qua `lib`): staff nhận 403; việc người khác trả 404.
- Cách kiểm: bốn lệnh như V1.

**V3. Trang Giao việc, huy hiệu, dòng trong Việc của tôi**
- File được sửa: `app/leader-tasks-view.tsx` (mới), `app/dashboard.tsx`, `app/tasks-view.tsx`, `lib/nav-structure.ts`, `tests/nav-structure.test.ts`, `tests/*.test.ts`.
- Việc: giao diện đúng mục Giao diện (1–10), mục `DEPT_LAYOUT`, đăng ký view, huy hiệu, dòng "Sếp giao" trong Việc của tôi.
- Tiêu chí xong:
  - `tests/nav-structure.test.ts`: `'giao-viec'` nằm trong `DEPT_LAYOUT` ngay trước `'cai-dat'`; `layoutFor('giao-viec', can)` rỗng với staff.
  - Không chữ tiếng Anh hiện trên web; không màu xanh khác `#17684b` cho nút chính (dùng biến màu sẵn có).
  - Điện thoại 390px: không cuộn ngang trang (hàng nút lọc tự cuộn trong khung của nó).
  - Chạy `pnpm dev` với `DEMO_MODE=1`, đăng nhập `chu@demo.megatech.vn` / `giamdoc@…` / `leader.sale@…` / `mentor@…` (mật khẩu demo) và đi qua: giao việc mới, leader bấm Bắt đầu → Xong, viết ghi chú, sếp sửa hạn, huỷ việc. Ghi kết quả từng bước vào tóm tắt.
- Cách kiểm: bốn lệnh như V1.

**V4. (CHỈ CHẠY KHI ANH TRẢ LỜI "leader giao tiếp xuống nhân viên") Leader giao cho nhân viên dưới quyền**
- `assignableRoles(lead|mentor)` → `['staff']`, chỉ người có `users.manager_id = user.userId`; `canView('giao-viec')` mở cho staff (chỉ thấy việc của mình); đổi chữ "Việc sếp giao" thành "Việc được giao". Lưu ý: nhân viên phải có tài khoản web tổng mới nhận được việc.

## Kiểm thử của Claude (một lần, sau V3)

1. Đọc diff cả nhánh, đối chiếu "Không được đổi".
2. Gộp `codex/giao-viec-leader-2610` vào nhánh demo (báo điều phối trước, merge thường), demo tự deploy và tự chạy migration 0047 lên D1 demo.
3. Playwright trên demo.tonghopposmegatech.io.vn, máy tính 1280 và điện thoại 390: chụp trang của sếp, form giao việc, sheet chi tiết, trang của leader, dòng "Sếp giao" dưới Tổng quan. Ảnh gửi anh bằng Artifact.

## Lên web thật (khi anh ok demo)

- Nhánh từ `main`, cherry-pick các commit V1–V3 (không lấy commit demo khác), PR vào `main`. Merge là deploy tự chạy migration 0047 (chỉ tạo bảng mới, không đụng bảng cũ, không ghi dữ liệu).
- **Lưu ý cho anh:** từ 23/10 mọi tài khoản đang khoá trừ anh Vũ và anh Nghĩa. Leader chỉ dùng được khi anh bảo mở khoá tài khoản leader (probe khoa-mo).

## Rủi ro và cách lùi

- **Migration lỗi trên D1:** chỉ `CREATE TABLE/INDEX IF NOT EXISTS`, chạy lại an toàn. Lùi: revert commit giao diện là trang biến mất; bảng trống để lại không ảnh hưởng (xoá bảng chỉ làm khi anh đồng ý).
- **Lộ việc giữa các leader:** mọi đường đọc qua `canSeeTask`, việc không thấy trả 404; test V1/V2 phủ.
- **Mentor bị mở rộng quyền ngoài ý:** chỉ thêm tiền tố `/api/giao-viec`; ca test cũ của mentor phải còn xanh.
- **Hai người bấm cùng lúc:** `UPDATE ... WHERE status=?` chặn đè.
- **Đọc D1 phình:** không chu kỳ tự tải, trần `LIMIT`; bộ canh D1 sẵn có báo nếu vượt.
