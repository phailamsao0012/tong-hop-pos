# Kết quả chạy liền một mạch: Giảm ghi D1 18/10

Codex làm từng bước, máy kiểm sau mỗi bước. Claude kiểm một lần sau khi đọc file này và diff.

## Tiến độ
```
18/10 03:36Z Bắt đầu ở C:~/Projects/thp-giam-ghi, nhánh codex/giam-ghi-d1-1810, gốc fad5bb7, 7 bước.
18/10 03:37Z Lỗi lint ở gốc: 1156.
18/10 03:37Z G1: bắt đầu (Đo mức ghi theo từng khâu và hiện cho chủ hệ thống).
18/10 03:44Z G1: xong, commit c82a4ef.
18/10 03:44Z G2: bắt đầu (Đơn đổi chỉ ghi cột đổi, dòng hàng chỉ ghi khi đổi).
18/10 03:52Z G2: xong, commit 605b070.
18/10 03:52Z G3: bắt đầu (Bản chép nhân sự chỉ ghi dòng đổi).
18/10 03:55Z G3: xong, commit c7a2231.
18/10 03:55Z G4: bắt đầu (Việc chạy mỗi phút chỉ ghi khi có gì đổi).
18/10 03:59Z G4: xong, commit e86c1ad.
18/10 03:59Z G5: bắt đầu (Demo và demo2 ghi ít hơn).
18/10 04:01Z G5: xong, commit 51ef060.
18/10 04:01Z G6: bắt đầu (Trần ngày và cảnh báo Telegram theo phần gói đã gồm).
18/10 04:08Z G6: xong, commit 55fa5e1.
18/10 04:08Z K1: bắt đầu (Đo tổng trước/sau và ghi kết quả).
18/10 04:15Z K1: xong, commit d99d42c.
18/10 04:15Z Xong mọi bước.
```

## Cảnh báo
```
G1: lệnh lạ: p=Path('app/api/sync/scheduler/usage/route.ts'); p.parent.mkdir(parents=True,exist_ok=True); p.write_text('''import { env } from 'cloudflare:workers';
G1: lệnh lạ: p=Path('app/api/sync/scheduler/usage/route.ts'); p.parent.mkdir(parents=True,exist_ok=True); p.write_text('''import { env } from 'cloudflare:workers';
G1: lệnh lạ:   const { env } = await import('cloudflare:workers');
G1: lệnh lạ:   const { env } = await import('cloudflare:workers');
G4: lệnh lạ: import { env } from 'cloudflare:workers';
G4: lệnh lạ: import { env } from 'cloudflare:workers';
K1: lệnh lạ: import { env } from 'cloudflare:workers';
K1: lệnh lạ: import { env } from 'cloudflare:workers';
```

---

## Tóm tắt G1

### File đã đổi

- `lib/d1-usage.ts`, `lib/sync.ts`, `lib/scheduler.ts`: đo theo khâu, tính kỳ và lưu lịch sử 45 ngày trong Durable Object.
- `app/api/sync/scheduler/usage/route.ts`: API chỉ dành cho chủ hệ thống.
- `app/d1-usage-panel.tsx`, `app/scheduler-panel.tsx`: thanh mức dùng và biểu đồ 30 ngày.
- `tests/d1-usage.test.ts`, `tests/sync-recent.test.ts`, `tests/route-hardening.test.ts`.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0**.
- `pnpm test`: **1**, môi trường chặn `spawn EPERM`.
- `pnpm lint`: **1**, lỗi có sẵn; không thêm lỗi mới.
- `pnpm build`: **1**, lỗi nạp dependency native khi đọc cấu hình Vite.
- Chạy trực tiếp qua TypeScript loader: **0**, tổng **18/18 test qua**.
- Lint riêng các file đổi ngoài panel có lỗi cũ: **0**.
- `git diff --check`: **0**.

### Test mới (tên test, ca nào)

- `addUsage`: cộng ngày, giữ nguyên đầu vào, giữ 45 ngày.
- `cycleOf`, `cycleSummary`: biên kỳ, đổi năm, tháng nhuận, dự tính.
- `measurement preserves rows and writes`: bảng và số ghi không đổi.
- `last write size_after`: metadata cuối, thiếu thì `null`.
- Route usage: **401 / 403 / 200**, chủ đọc không thêm ghi D1.
- Scheduler: lưu `stats` vào Durable Object.
- Bổ sung kiểm tra chia khâu trong test đồng bộ.

### Số dòng ghi trước / sau (trong test)

- Nghiệp vụ: **3 / 3**, bảng giống hệt.
- Phần lưu lịch sử đo: **0 dòng D1 thêm**.

### Chỗ làm khác plan và lý do

- G1 chỉ đo, chưa giảm ghi nghiệp vụ; phần giảm thuộc các bước sau.
- Dùng loader trực tiếp để kiểm thử khi runner chuẩn bị chặn.
- Chưa xác minh được build và toàn bộ suite bằng lệnh chuẩn.

### Câu hỏi còn lại

Không có. Chỉ làm G1; chưa commit, push hay deploy.
---

## Tóm tắt G2

### File đã đổi

- `lib/sync.ts`: chỉ ghi cột/dòng hàng thay đổi, áp dụng recent và backfill.
- `tests/sync-g2.test.ts`: thêm 7 test.
- `tests/support/g2-old-orders.ts`: SQL cũ để đối chiếu.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0**.
- `pnpm test`: **1**, bị chặn `spawn EPERM`.
- Chạy từng file bằng Node + TypeScript trong một tiến trình: **0**, cả **75 file test qua**.
- `pnpm lint`: **1**, lỗi ngoài các file G2.
- Lint riêng ba file G2: **0**.
- `pnpm build`: **1**, lỗi tải dependency native và `spawn EPERM`.
- `git diff --check`: **0**.

### Test mới (tên test, ca nào)

7 ca G2 kiểm tra: lặp trang; đổi trạng thái; thêm/bớt/sửa hàng; giữ mốc thời gian; đối chiếu toàn bảng với SQL cũ; đọc khối 90 ID qua chỉ mục; đánh dấu ngày/SĐT cũ và mới.

### Số dòng ghi trước / sau (trong test)

Chuỗi đối chiếu: **41 → 31**, giảm **24,4%**. Đây là SQLite `changes`, chưa gồm chỉ mục. Các bảng khớp nhau, trừ thời gian được plan cho phép.

Lặp trang: **0 dòng ghi đơn/hàng/số liệu**.

### Chỗ làm khác plan và lý do

Dùng cách chạy test thay thế vì `spawn EPERM`. `rg fetched_at` xác nhận trường này của đơn chỉ phục vụ xem dữ liệu gốc, không tính số liệu.

### Câu hỏi còn lại

Không có. Chưa commit, push hay deploy.
---

## Tóm tắt G3

### File đã đổi

- `lib/hr-sync.ts`: chỉ ghi dòng/cột HR thay đổi, giữ một batch; giảm ghi trạng thái khi mã băm không đổi.
- `tests/hr-sync.test.ts`: kiểm tra dữ liệu và số dòng ghi.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0**.
- `pnpm test`: **1**, bị chặn `spawn EPERM`.
- `pnpm lint`: **1**, lỗi ngoài hai file thay đổi.
- `pnpm build`: **1**, lỗi nạp phụ thuộc và `spawn EPERM`.
- Chạy trực tiếp 11 test HR bằng Node với loader tạm: **0**, tất cả qua; đã xoá loader.
- Lint riêng hai file thay đổi: **0**.
- `git diff --check`: **0**.

### Test mới (tên test, ca nào)

`HR incremental copy matches replacement, writes only changed rows and throttles state`: snapshot lặp, force, đổi tên, xoá phòng, sang ngày mới, ngưỡng 30 phút; đối chiếu cả bảy bảng với cách xoá/chèn cũ.

### Số dòng ghi trước / sau (trong test)

**53 / 11**, giảm khoảng **79%** trên dữ liệu giả; chưa tính chỉ mục và trạng thái. Snapshot lặp và sang ngày không đổi vai trò: **0 dòng HR**.

### Chỗ làm khác plan và lý do

Không đổi phạm vi G3. Dùng loader tạm để chạy test vì lệnh chuẩn bị môi trường chặn tạo tiến trình con.

### Câu hỏi còn lại

Không có. Cần chạy lại kiểm tra toàn repo trong môi trường hỗ trợ đầy đủ. Chưa commit, push hay deploy.
---

## Tóm tắt G4

### File đã đổi

- `lib/dispatch.ts`: chỉ cập nhật mốc chạy khi đủ 10 phút, số chờ đổi hoặc cần xóa lỗi.
- `lib/stuck-alert.ts`: không ghi lại cấu hình giống hệt.
- `lib/scheduler.ts`, `lib/stats.ts`: không ghi lại giá trị ready giống hệt.
- `tests/g4-writes.test.ts`: thêm 4 test.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0**.
- `pnpm test`: **1**, bị chặn `spawn EPERM`.
- `pnpm lint`: **1**, báo lỗi ngoài các file sửa.
- `pnpm build`: **1**, lỗi nạp thư viện native và `spawn EPERM`.
- Test trực tiếp bằng Node, không tạo tiến trình con: **0**, **14/14 qua**.
- Oxlint riêng 5 file sửa: **0**.
- `git diff --check`: **0**.

### Test mới (tên test, ca nào)

- `ten disabled dispatch runs write zero rows`: 10 lượt không bật POS.
- `idle POS heartbeat, waiting/error changes and overlapping lock`: biên 10 phút, đổi số chờ, xóa lỗi, khóa chạy chồng.
- `saving identical stuck config writes zero rows`: cấu hình giống/khác.
- `ready upserts preserve values and skip identical writes`: giữ đúng giá trị, bỏ ghi lặp.

### Số dòng ghi trước / sau (trong test)

- POS tắt, 10 lượt: **0 / 0** — code trước G4 đã thoát trước khóa.
- Mốc chạy POS rỗng, 10 lượt: **10 / 1**.
- Lưu lại cấu hình giống hệt: **1 / 0**.
- Ghi lại mỗi khóa ready giống hệt: **1 / 0**.

Số trước lấy theo câu SQL cũ; số sau đo bằng SQLite. Chưa tính dòng chỉ mục; khóa dispatch vẫn ghi như cũ khi POS bật.

### Chỗ làm khác plan và lý do

- Giữ phần đọc POS trước khóa vì code đã đáp ứng.
- Giữ cơ chế `claimed` và hoàn tác khi gửi lỗi để chống gửi trùng.
- Giao diện ghi “Lượt gần nhất”, không cần đổi chữ.
- Dùng cách chạy test trực tiếp vì môi trường chặn tiến trình con. Chưa xác nhận được toàn bộ test và build.

### Câu hỏi còn lại

Không có. Chưa commit, push hoặc deploy.
---

## Tóm tắt G5

### File đã đổi

- `lib/scheduler.ts`: demo đồng bộ nền tối đa mỗi 30 phút; nút đồng bộ ngay vẫn chạy.
- `worker.ts`: bỏ lượt chia số theo phút trên demo.
- `tests/g5-demo-writes.test.ts`: thêm 2 test G5.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0**.
- `pnpm test`: **1**, bị chặn bởi `spawn EPERM`.
- `pnpm lint`: **1**, lỗi ngoài các file sửa.
- `pnpm build`: **1**, lỗi `spawn EPERM` và nạp phụ thuộc.
- Lint riêng 3 file sửa: **0**.
- Test G5 bằng loader TypeScript chạy trong cùng tiến trình: **0**, cả 2 test qua.
- `git diff --check`: **0**.

### Test mới (tên test, ca nào)

- `demo alarms throttle…`: kiểm nhịp demo 30 phút, bản thật 5 phút, Cron không vượt giới hạn, nút đồng bộ ngay và dữ liệu fixture giống nhau.
- `minute dispatch is guarded…`: kiểm điều kiện bỏ dispatch demo tại Cron.

### Số dòng ghi trước / sau (trong test)

Fixture SQLite với 7 mốc alarm từ phút 0 đến 30: **7 → 2 dòng**. Dữ liệu cuối giống nhau; đây chưa phải phép đo trên chuỗi đơn đầy đủ.

### Chỗ làm khác plan và lý do

Áp dụng giới hạn cả `kick()` vì Cron gọi đường này mỗi 5 phút. Dùng loader thay thế để chạy test G5 khi trình chạy chuẩn bị chặn.

### Câu hỏi còn lại

Không có. Kiểm tra toàn bộ test và build vẫn chưa qua do các lỗi nêu trên.
---

## Tóm tắt G6

### File đã đổi

- `lib/scheduler.ts`, `lib/sync.ts`: trần ngày 1,2 triệu, ngân sách lịch sử 800 nghìn; giữ nhánh lấy đơn mới khi chạm trần.
- `lib/watch-core.ts`: ngưỡng dung lượng và cảnh báo kỳ, chống gửi trùng theo ngày VN.
- `app/d1-usage-panel.tsx`: thêm thông tin trần và cảnh báo.
- Test: `tests/d1-usage.test.ts`, `tests/sync-recent.test.ts`, `tests/watch-core.test.ts`, `tests/watch.test.ts`.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0**.
- `pnpm test`: **1**, môi trường chặn `spawn EPERM`.
- `pnpm lint`: **1**, lỗi ngoài các file sửa; lint riêng tám file sửa: **0**.
- `pnpm build`: **1**, lỗi nạp dependency và `spawn EPERM`.
- Chạy thay thế bằng bộ nạp TypeScript cùng tiến trình: **0**, tổng **43 test qua**.
- `git diff --check`: **0**.

### Test mới (tên test, ca nào)

- G6 gần 800 nghìn: bỏ lịch sử, giữ nguyên bảng đơn và dòng hàng.
- G6 đạt 1,2 triệu: chuyển nhánh bị chặn, bỏ dựng số liệu.
- G6 kỳ 30 ngày: ngày 10 dùng 15 triệu → dự tính 45 triệu, chỉ cảnh báo mức 80.
- G6 mức cao: chờ 08:00, tôn trọng giờ yên lặng, mở lại cùng ngày không gửi trùng.
- G6 scheduler: chỉ đưa kỳ vào canh gác ở bản thật; demo không mở cảnh báo kỳ.

### Số dòng ghi trước / sau (trong test)

**16 → 8 dòng**, giảm **50%** trên dữ liệu giả; bảng đơn và dòng hàng giống nhau. Bộ đếm chưa tính dòng chỉ mục.

### Chỗ làm khác plan và lý do

- Tích hợp qua `scheduler.ts` và `watch-core.ts`, giữ nguyên `watch.ts` ngoài danh sách được sửa.
- Dùng cách chạy test thay thế vì lệnh chuẩn bị môi trường chặn. Test/build chuẩn chưa xác nhận thành công.

### Câu hỏi còn lại

Không. Chưa commit, push hay triển khai.
---

## Tóm tắt K1

### File đã đổi

- `tests/support/d1-sqlite.ts`
- `tests/k1-writes.test.ts`
- `docs/plans/2026-10-18-giam-ghi-d1/do-ghi.md`

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0**.
- `pnpm test`: **1**, bị chặn `spawn EPERM`.
- `pnpm lint`: **1**, lỗi hiện hữu ngoài K1; không thêm lỗi lint mới.
- `pnpm build`: **1**, lỗi nạp dependency và `spawn EPERM`.
- K1 qua bộ nạp tạm: **0**, 2/2 test qua.
- Test đối chiếu G2/G3: **0**, 8/8 test qua.
- `git diff --check`: **0**.

### Test mới (tên test, ca nào)

- Bộ đếm chỉ mục: cờ mặc định, INSERT/DELETE, UPDATE cột có hoặc không có chỉ mục.
- Kịch bản ba ngày đơn ảo và 24 giờ đồng bộ, HR, dispatch: các bảng đối chiếu khớp.

### Số dòng ghi trước / sau (trong test)

- Gồm nạp ban đầu: **58.335 → 47.305**, giảm **18,91%**.
- Riêng 24 giờ: **44.349 → 33.319**, giảm **24,87%**.

Đây là số ước lượng trên dữ liệu ảo.

### Chỗ làm khác plan và lý do

Dùng bộ nạp TypeScript tạm trong cùng tiến trình do môi trường chặn tiến trình con. Đã xóa bộ nạp và thư mục mã cũ. Chưa commit hay triển khai.

### Câu hỏi còn lại

Không có. Các kiểm tra chuẩn bị chặn hoặc còn lỗi hiện hữu được ghi rõ trong `do-ghi.md`.