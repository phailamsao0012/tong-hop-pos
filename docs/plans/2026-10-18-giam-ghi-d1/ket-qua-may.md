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
18/10 13:57Z Bắt đầu ở C:~/Projects/thp-giam-ghi, nhánh codex/giam-ghi-d1-1810, gốc 8f82f4e, 1 bước.
18/10 13:58Z Lỗi lint ở gốc: 1156.
18/10 13:58Z K3: bắt đầu (Đo lại với số trang thật và vòng khách mới).
18/10 14:36Z K3: xong, commit 9cbbb40.
18/10 14:36Z Xong mọi bước.
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

## Tóm tắt K3

### File đã đổi

- `tests/k3-writes.test.ts`
- `docs/plans/2026-10-18-giam-ghi-d1/do-ghi.md`

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0**.
- `pnpm test`: **1**, sandbox chặn `spawn EPERM`.
- `pnpm lint`: **1**, lỗi ngoài K3.
- `pnpm build`: **1**, `spawn EPERM`.
- Node local K3: **3/3 test qua**; PowerShell bọc trả **1** do cảnh báo stderr.
- Node local G2/G3/G7/G8/G9: **0**, 17/17 qua.
- Lint riêng K3 và `git diff --check`: **0**.

### Test mới (tên test, ca nào)

- **K3 correctness:** cùng lịch cũ, 2 POS, đủ 1.440 phút và số trang thật; mọi bảng **0 dòng lệch**.
- **K3 writes:** 6 POS, lịch cũ 23 vòng/POS, mới 2 vòng/POS; mọi bảng phải đối chiếu **0 dòng lệch**.

### Số dòng ghi trước / sau (trong test)

- Tổng 24 giờ sau nạp: **352.126 → 313.599**, giảm **10,94%**.
- Gồm nạp ban đầu: **366.112 → 327.585**, giảm **10,52%**.
- Bảng từng khâu đã ghi trong `do-ghi.md`.

### Chỗ làm khác plan và lý do

Tách hai phép kiểm theo chỉ dẫn bổ sung của Claude; phần đúng dữ liệu dùng 2 POS. Không sửa mã nghiệp vụ.

### Câu hỏi còn lại

Không có. Kiểm tra toàn repo còn lỗi môi trường/lint nêu trên. Đã dọn file tạm; chưa commit, push hay triển khai.