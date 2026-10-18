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
18/10 04:15Z Đã đẩy lên codex/giam-ghi-d1-1810 (664f98c).
18/10 04:25Z Bắt đầu ở C:~/Projects/thp-giam-ghi, nhánh codex/giam-ghi-d1-1810, gốc eb94779, 2 bước.
18/10 04:25Z Lỗi lint ở gốc: 1156.
18/10 04:25Z G7: bắt đầu (Mọi khâu đồng bộ chạy lại trên dữ liệu không đổi thì ghi 0 dòng; số liệu khách và số liệu ngày ghi ít chỉ mục hơn).
18/10 04:34Z G7: xong, commit 83c8504.
18/10 04:34Z K2: bắt đầu (Đo lại cả ngày, đủ các khâu).
18/10 04:49Z K2: máy kiểm báo lỗi, giao lại vòng 1.
18/10 04:58Z K2: xong, commit e9dc47b.
18/10 04:58Z Xong mọi bước.
18/10 04:58Z Đã đẩy lên codex/giam-ghi-d1-1810 (330d28c).
18/10 05:12Z Bắt đầu ở C:~/Projects/thp-giam-ghi, nhánh codex/giam-ghi-d1-1810, gốc f978126, 3 bước.
18/10 05:12Z Lỗi lint ở gốc: 1153.
18/10 05:12Z G8: bắt đầu (Sửa lệch dữ liệu khi một lượt gom nhiều trang).
18/10 05:56Z G8: xong, commit 00bc085.
18/10 05:56Z G9: bắt đầu (Giãn vòng duyệt hết khách).
18/10 06:14Z G9: xong, commit 14b6b0b.
18/10 06:14Z K3: bắt đầu (Đo lại với số trang thật và vòng khách mới).
18/10 06:48Z K3: máy kiểm báo lỗi, giao lại vòng 1.
18/10 07:04Z K3: máy kiểm báo lỗi, giao lại vòng 2.
18/10 07:21Z K3: máy kiểm báo lỗi, giao lại vòng 3.
18/10 07:38Z DỪNG ở k3: Hết 3 vòng sửa mà máy kiểm vẫn báo lỗi (xem ~/codex-viec/giam-ghi-d1-1810/k3-loi-vong4.txt).
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

## Tóm tắt G8

### File đã đổi

- `lib/sync.ts`, `lib/customers-sync.ts`: so với trạng thái mới nhất trong lượt, cập nhật map ngay khi tạo câu ghi.
- `lib/demo/world.ts`: trả số tổng của khách, độc lập cửa sổ truy vấn.
- `tests/g8-pending.test.ts`, `tests/k2-writes.test.ts`, `tests/support/d1-sqlite.ts`: bổ sung hồi quy, chạy nhiều trang và cache metadata bộ đếm.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0**.
- `pnpm test`: **1**, môi trường chặn `spawn EPERM`.
- `pnpm lint`: **1**, lỗi ngoài phần sửa; lint sáu file thay đổi: **0**.
- `pnpm build`: **1**, lỗi nạp binding Tailwind.
- Test thay thế bằng loader Node: **34 test qua**, mã thoát **0**.
- `git diff --check`: **0**.

### Test mới (tên test, ca nào)

- `G8: repeated existing/new customers and orders…`: khách và đơn lặp, đổi rồi trả về giá trị cũ; kiểm mốc thời gian, dòng hàng và không đọc lại ID giữa các trang.
- `G8: demo customer fields are identical…`: dữ liệu khách giống nhau giữa các cửa sổ và kích thước trang.
- K2 chạy lại với **12 trang khách/lượt**: toàn bộ bảng so với `fad5bb7` có **0 dòng lệch**.

### Số dòng ghi trước / sau (trong test)

Ước lượng gồm chỉ mục, dùng dữ liệu giả:

| Ca | Trước | Sau |
|---|---:|---:|
| Khách gần đây | 39 | 30 |
| Khách lịch sử | 95 | 62 |
| Đơn lịch sử | 5.423 | 68 |
| Đơn gần đây | 126 | 68 |
| K2 — 24 giờ sau nạp | 351.115 | 314.078 |

### Chỗ làm khác plan và lý do

- Dùng loader Node vì môi trường chặn tiến trình con của test chuẩn.
- Tăng timeout K2 lên 30 phút sau lần đầu hết 10 phút; cache metadata chỉ mục trong bộ đếm test.
- Số khách/đơn/ghi chú trên demo được tính theo tổng lịch sử; đơn ảo và `WORLD_VERSION` giữ nguyên.
- Đã xoá mã nền và log tạm.

### Câu hỏi còn lại

Không.
---

## Tóm tắt G9

### File đã đổi

- `lib/sync.ts`: vòng khách mới đợi đủ 12 giờ từ `startedAt`; thêm chú thích độ trễ ghi chú.
- `tests/g9-rewalk.test.ts`: test lịch chạy, tiến độ và dòng ghi.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0**.
- `pnpm test`: **1**, bị chặn `spawn EPERM`.
- `pnpm lint`: **1**, lỗi có sẵn trong repo.
- `pnpm build`: **1**, lỗi nạp dependency native và `spawn EPERM`.
- Oxlint hai file G9: **0**.
- Test G9 bằng Node với `--experimental-transform-types`: **0**.
- `git diff --check`: **0**.

### Test mới (tên test, ca nào)

`G9: rewalk waits until startedAt + 12h, keeps initial progress, and saves writes with identical data`

Kiểm tra T+1 giờ chưa chạy lại; trước mốc 12 giờ vẫn đợi; đúng mốc thì chạy; vòng đầu chạy liên tục tới xong; giữ tiến độ và dữ liệu nghiệp vụ trong fixture.

### Số dòng ghi trước / sau (trong test)

Ước lượng SQLite có tính chỉ mục:

- Lịch sử khách: **5 → 0**.
- Tổng lượt: **7 → 2**.
- Các bảng dữ liệu đối chiếu giống nhau.

### Chỗ làm khác plan và lý do

Con trỏ thiếu `startedAt` dùng `completedAt` làm mốc dự phòng để tránh chạy lại quá sớm. Chạy riêng test bằng Node do trình chạy chuẩn bị chặn tiến trình con.

### Câu hỏi còn lại

Không có. Cần chạy lại test toàn bộ và build trong môi trường cho phép tạo tiến trình.
---

## Tóm tắt K3

### File đã đổi

- `docs/plans/2026-10-18-giam-ghi-d1/do-ghi.md`: bổ sung kết quả vòng 3/3.
- Giữ nguyên `tests/k3-writes.test.ts` đang làm dở.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

| Lệnh | Mã thoát | Kết quả |
|---|---:|---|
| `pnpm typecheck` | 0 | Qua |
| `pnpm test` | 1 | `spawn EPERM`, chưa chạy được assertion |
| `pnpm lint` | 1 | Lỗi ngoài file K3 |
| `pnpm build` | 1 | `spawn EPERM`, lỗi nạp dependency native |
| `git diff --check` | 0 | Qua |

### Test mới (tên test, ca nào)

Không thêm test. Giữ test K3 đo 24 giờ và so toàn bộ bảng với baseline.

### Số dòng ghi trước / sau (trong test)

Kết quả lần đo trước: **352.126 / 313.599** sau nạp, giảm **10,94%**; còn **72 dòng lệch**. Vòng này không đo lại.

### Chỗ làm khác plan và lý do

**K3 chưa đạt.** Nguồn demo đổi tổng mua, số đơn thành công và người phụ trách nhưng không đổi `updated_at`. Sửa nguồn nằm ngoài phạm vi K3; giữ nguyên assertion bảo toàn dữ liệu.

### Câu hỏi còn lại

Cần giao bước sửa nguồn giả `lib/demo/world.ts`, rồi đo lại K3 để xác nhận 0 dòng lệch. Chưa commit, push hoặc triển khai.