# Kết quả chạy liền một mạch: Giao việc Zalo 27/10

Codex làm từng bước, máy kiểm sau mỗi bước. Claude kiểm một lần sau khi đọc file này và diff.

## Tiến độ
```
27/10 02:44Z Bắt đầu ở ~/Projects/thp-giao-viec-zalo, nhánh codex/giao-viec-zalo-2710-wt, gốc 7aa9570, 4 bước.
27/10 02:44Z Lỗi lint ở gốc: 0.
27/10 02:44Z Z1: bắt đầu (Bảng, logic việc và họp, đọc lệnh Zalo).
27/10 03:04Z Bắt đầu ở ~/Projects/thp-giao-viec-zalo, nhánh codex/giao-viec-zalo-2710-wt, gốc 7aa9570, 4 bước.
27/10 03:04Z Lỗi lint ở gốc: 1162.
27/10 03:04Z Z1: bắt đầu (Bảng, logic việc và họp, đọc lệnh Zalo).
27/10 03:32Z Z1: xong, commit 64dbb45.
27/10 03:32Z Z2: bắt đầu (Bot Zalo: gửi, webhook, xử lý lệnh).
27/10 03:57Z Z2: xong, commit 5470012.
27/10 03:57Z Z3: bắt đầu (Trang Giao việc, Họp, Danh bạ Zalo trên web; dữ liệu demo).
27/10 04:24Z Z3: xong, commit 4204356.
27/10 04:24Z Z4: bắt đầu (Tin tự động: bản tin 8h, doanh số 12h/17h/22h, nhắc hạn, thiếu số, nhắc họp).
27/10 04:49Z Z4: xong, commit 816926f.
27/10 04:49Z Xong mọi bước.
```

## Cảnh báo
```
Z2: lệnh lạ: import { env } from 'cloudflare:workers';
Z2: lệnh lạ: import { env } from 'cloudflare:workers';
Z2: lệnh lạ: import { env } from 'cloudflare:workers';
Z2: lệnh lạ: import { env } from 'cloudflare:workers';
Z2: lệnh lạ: import { env } from 'cloudflare:workers';
Z2: lệnh lạ: import { env } from 'cloudflare:workers';
Z3: lệnh lạ: import { env } from 'cloudflare:workers';
Z3: lệnh lạ: import { env } from 'cloudflare:workers';
Z3: lệnh lạ: import { env } from 'cloudflare:workers';
Z3: lệnh lạ: import { env } from 'cloudflare:workers';
Z3: lệnh lạ: import { env } from 'cloudflare:workers';
Z3: lệnh lạ: import { env } from 'cloudflare:workers';
Z3: lệnh lạ: import { env } from 'cloudflare:workers';
Z3: lệnh lạ: import { env } from 'cloudflare:workers';
Z4: lệnh lạ: import { env } from 'cloudflare:workers';
Z4: lệnh lạ: p='app/api/giao-viec/zalo/thu/route.ts';s=open(p).read().replace(\"import { env }\", \"import { maybeZaloTick } from '@/lib/zalo-tick';\\nimport { env }\");s=s.
Z4: lệnh lạ: import { env } from 'cloudflare:workers';
Z4: lệnh lạ: p='app/api/giao-viec/zalo/thu/route.ts';s=open(p).read().replace(\"import { env }\", \"import { maybeZaloTick } from '@/lib/zalo-tick';\\nimport { env }\");s=s.
Z4: lệnh lạ: import { env } from 'cloudflare:workers';
Z4: lệnh lạ: import { env } from 'cloudflare:workers';
```

---

## Tóm tắt Z1

### File đã đổi

- `drizzle/0047_giao_viec_zalo.sql`: bảng và chỉ mục đúng plan.
- `lib/zalo-work.ts`: hàm thuần, danh bạ, mã nối, việc và họp.
- `tests/zalo-work.test.ts`: 53 test Z1.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0**.
- `pnpm test`: **1**, sandbox chặn socket nội bộ của `tsx`.
- Chạy toàn bộ test bằng `node --import tsx --import ./tests/support/register.mjs --test tests/*.test.ts`: **0**, 493/493 đạt.
- Chạy riêng test Z1 bản cuối bằng Node: **0**, 53/53 đạt.
- `pnpm lint`: **1**, 1.162 lỗi ngoài các file Z1.
- Lint riêng hai file TypeScript mới: **0**.
- `pnpm build` với telemetry tắt: **0**.
- `git diff --check`: **0**.

### Test mới (tên test, ca nào)

- `parseCommand`: 39 ca lệnh, dấu, hoa thường, thiếu lý do và tin rác.
- `canMove`: đủ bảng chuyển và vai trò.
- Ngày hạn, tuần trong tháng, tuần 6, tháng 2.
- Mã nối: hết hạn, dùng lại, đổi chat, khoá một giờ, giới hạn 50 và dùng đồng thời.
- Việc: cách ly team, phân quyền, chống ghi đè, event, lọc và tổng hợp.
- Họp, migration chạy lại, định dạng tiếng Việt và giới hạn 2.000 ký tự.

### Đã thử trên pnpm dev (Z3, Z4)

Không áp dụng cho Z1.

### Chỗ làm khác plan và lý do

- `listTasks` bắt buộc có `actor` để lọc quyền ngay trong truy vấn.
- Mã nối lưu thêm bộ đếm và phiên bản để chống dùng mã đồng thời.
- Dùng Node thay `tsx` CLI do giới hạn sandbox.

### Câu hỏi còn lại

Không có. Chưa commit; chỉ thay đổi ba file Z1.
---

## Tóm tắt Z2

### File đã đổi

- `lib/zalo.ts`: gửi tin, HMAC webhook, hộp thư demo, giới hạn 30 tin/lượt.
- `lib/zalo-work.ts`: xử lý lệnh dùng chung và thông báo việc/họp.
- `app/api/zalo/webhook/route.ts`: xác thực secret, xử lý tin đến.
- `lib/access.ts`: thêm ngoại lệ webhook.
- `db/env.d.ts`: khai báo token.
- `tests/zalo.test.ts`: 14 test mới.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0**.
- `pnpm test`: **1**, sandbox chặn socket IPC của tsx.
- Chạy toàn bộ test bằng `node --import tsx --import ./tests/support/register.mjs --test tests/*.test.ts`: **0**, 510/510 qua.
- Chạy lại riêng Z1–Z2 sau hai test bổ sung: **0**, 67/67 qua.
- `pnpm lint`: **1**, lỗi có sẵn ngoài phần Z2.
- Oxlint riêng 6 file đã đổi: **0**.
- `pnpm build`: **0**.
- `git diff --check`: **0**.

### Test mới (tên test, ca nào)

14 test bao phủ: HMAC/webhook 401–200; ngoại lệ `scopeApi`; nối mã và khoá dò mã; thông báo trạng thái/ghi chú; giao việc theo team; thiếu lý do; sửa/đổi người/huỷ việc; mời/trả lời/huỷ họp; lỗi gửi; hộp thư demo; transport giả; giới hạn và khoảng cách gửi; thêm nhân viên; webhook tích hợp và chặn nhân viên sửa việc người khác.

### Đã thử trên pnpm dev (Z3, Z4)

Không áp dụng cho Z2.

### Chỗ làm khác plan và lý do

`worker.ts:290` còn lớp bắt đăng nhập riêng. Thêm ngoại lệ trong `scopeApi` theo plan chưa đủ để webhook nhận request ẩn danh qua Worker. Giữ nguyên `worker.ts` vì Z2 không cho phép sửa.

### Câu hỏi còn lại

Claude cần bổ sung việc cho phép `/api/zalo/webhook` qua lớp đăng nhập tại `worker.ts:290` vào phạm vi plan trước khi webhook hoạt động qua Worker.
---

## Tóm tắt Z3

### File đã đổi

- Thêm 3 trang: `app/giao-viec-view.tsx`, `app/giao-viec-hop-view.tsx`, `app/giao-viec-zalo-view.tsx`.
- Thêm 8 route trong `app/api/giao-viec/` và seed `lib/demo/zalo-work.ts`.
- Sửa `app/dashboard.tsx`, `lib/nav-structure.ts`, `lib/access.ts`, `lib/zalo-work.ts`, `lib/demo/mode.ts`.
- Thêm `tests/zalo-web.test.ts`; sửa `tests/access.test.ts`, `tests/nav-structure.test.ts`.

Chỉ làm Z3; không commit, push hay deploy.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0**.
- `pnpm test`: **1**, lỗi mở IPC `EPERM`.
- Chạy tương đương bằng `node --import tsx --import ./tests/support/register.mjs --test tests/*.test.ts`: **0**, **517/517 test xanh**.
- `pnpm lint`: **1**, lỗi có sẵn; đối chiếu bản gốc không thêm lỗi lint trong phần thay đổi.
- `pnpm build`: **0**.
- `git diff --check`: **0**.
- `pnpm dev` với `DEMO_MODE=1`: **1**, bị chặn mở cổng 9229 (`EPERM`).

### Test mới (tên test, ca nào)

- **Giao việc: quyền thật ở route…**: owner, sếp được cấp quyền, thu hồi quyền; chặn mentor/staff/người chưa được cấp.
- **Giao việc đứng trước Cài đặt…**: thứ tự menu, Tổng quan là tab đầu.
- **Seed Z3 chạy hai lần…**: không nhân đôi; đủ 5 leader, 15 nhân viên, 10 việc, 2 họp.
- **Z3: giao việc ghi hộp thư…**: nhận việc, báo chưa xong, từ chối họp và giao nhân viên qua handler demo.
- **Z3: cài đặt có giới hạn…**: kiểm dữ liệu cài đặt và danh sách sếp.

### Đã thử trên pnpm dev (Z3, Z4)

Chưa đăng nhập và thao tác được trên trình duyệt vì server không khởi động được. Các luồng `V<n> nhan`, `V<n> chua bận`, `H<n> khong ốm`, `giao 1: thử han 31/10` đã qua test SQLite. **Chưa xác minh giao diện 390px.**

### Chỗ làm khác plan và lý do

- Truyền cấu hình demo qua biến tiến trình, không sửa `.dev.vars`.
- Chỉ cho director/lead trong danh sách sếp có quyền, ngoài owner; giữ chặn mentor/staff.
- Khi đối chiếu lint, pnpm tự thử cài lại dependencies; đã dừng và khôi phục bằng dữ liệu local.

### Câu hỏi còn lại

Không có câu hỏi nghiệp vụ. Còn kiểm tra thủ công trên trình duyệt và màn hình 390px ở môi trường mở được cổng local.
---

## Tóm tắt Z4

### File đã đổi

- `lib/zalo-tick.ts`: bản tin sáng, báo cáo doanh số, nhắc hạn, thiếu số và nhắc họp.
- `worker.ts`: thêm đúng một lời gọi tick trong `scheduled`.
- `app/api/giao-viec/zalo/thu/route.ts`: chạy thử mốc 12h trong demo.
- `app/giao-viec-zalo-view.tsx`: nút “Chạy thử mốc 12h”.
- `tests/zalo-tick.test.ts`: 7 test mới.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0**.
- `pnpm test`: **1**, sandbox chặn socket nội bộ của `tsx`.
- Chạy thay bằng `node --import tsx --import ./tests/support/register.mjs --test tests/*.test.ts`: **0**, **524/524 test qua**.
- `pnpm lint`: **1**, lỗi có sẵn ngoài phần thay đổi.
- Lint riêng 5 file thay đổi: **0**.
- `pnpm build`: **0**.
- `git diff --check`: **0**.

### Test mới (tên test, ca nào)

7 test bao phủ: mốc sáng và các khung giờ; thiếu snapshot và tắt thông báo; nhắc hạn đúng người; giới hạn 30 tin và đọc tối thiểu; doanh số bằng `overviewReport`; thiếu số báo lại sau lần chia mới; loại người từ chối họp, họp huỷ và người ngừng hoạt động.

### Đã thử trên pnpm dev (Z3, Z4)

`DEMO_MODE=1 pnpm dev`: **1**, sandbox chặn mở cổng `9229` (`EPERM`). Chưa kiểm được nút thử trên giao diện.

### Chỗ làm khác plan và lý do

- Snapshot lưu thêm số đơn và số từng nhân viên để tính chênh lệch trong khung.
- Kiểm thiếu số cách lần kiểm trước ít nhất 15 phút, đáp ứng ca 10:01 → 10:16 → 11:21.
- Dùng lệnh Node thay `pnpm test` để vượt lỗi socket của trình chạy test.

### Câu hỏi còn lại

Không có. Còn cần kiểm giao diện demo ở môi trường cho phép mở cổng.