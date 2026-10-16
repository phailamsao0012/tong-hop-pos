# Kết quả Codex V5 — Vận hành đơn và Lãi thật

Ngày kiểm: 16/10/2026. Worktree `thp-vanhanh`, nhánh `codex/van-hanh-don-1510`, HEAD `a9762a0`. Trạng thái đầu bước sạch. V5 chỉ thêm báo cáo này; không sửa code, test, cấu hình, không commit hoặc đẩy nhánh.

## Đã làm từng bước

Các bước trước đã commit; danh sách dưới được đối chiếu lịch sử và diff, không phải kết luận rằng mọi ca kiểm đã chạy thành công trong V5.

| Bước | Commit | Nội dung đã có |
| --- | --- | --- |
| V1 | `e46c914` | Migration 0047/0048, trường vận chuyển, đồng bộ, điền đơn cũ, dữ liệu demo và test. |
| V2 | `53b8788` | Logic, API, giao diện Hoàn theo hãng, tỉnh; gắn menu và quyền. |
| V3 | `846e133` | Logic, API, giao diện Giao thất bại; che điện thoại, nhật ký truy cập, menu và quyền. |
| V4 | `60da2bb` | Logic histogram, API, giao diện Tốc độ xử lý; đơn kẹt, menu và quyền. |
| L1 | `6445627` | Migration 0049, giá vốn/phí hãng, đồng bộ, điền đơn cũ và demo. |
| L2 | `754b81c` | Logic và API Lãi thật, test công thức và quyền. |
| L3 | `a9762a0` | Giao diện Lãi thật, menu, quyền chỉ owner và test quyền. |
| V5 | Chưa commit | Chạy kiểm tra toàn nhánh, kiểm khả năng chụp ảnh, tổng hợp kết quả. |

## Lệnh đã chạy và kết quả

| Lệnh | Mã thoát | Kết quả |
| --- | --- | --- |
| `pnpm typecheck` | 0 | Qua. |
| `pnpm test` | 1 | Node test runner không tạo được tiến trình con: `spawn EPERM`; 52 file bị báo thất bại trước khi kiểm được các ca bên trong. Không kết luận lỗi assertion hay test qua. |
| `pnpm lint` | 1 | 1.161 dòng lỗi, bằng mốc gốc 1.161 đã ghi trong `ket-qua.md`. V5 không đổi file được lint. Chạy lại để đếm cho cùng kết quả, mã thoát 1. |
| `pnpm build` | 1 | Không nạp được `vite.config.ts`; có `spawn EPERM`, lỗi nạp binary Tailwind oxide (`stream did not contain valid UTF-8`), lỗi resolve `../pkg` của lightningcss và lỗi resolve dependency. Chưa xác định các lỗi dependency có còn khi chạy ngoài sandbox. |
| `pnpm exec playwright --version` | 1 | `Command "playwright" not found`. |
| `git diff --check 864d8e5 HEAD` | 0 | Diff của bảy bước trước không có lỗi whitespace. |

Các lệnh đọc git, plan và danh sách test đều mã thoát 0. Không cài package, không dùng mạng. Theo CODEX.md mục 5, không sửa code/cấu hình để xử lý `EPERM`; máy kiểm của script cần chạy lại ngoài sandbox. V5 chưa đạt tiêu chí cả bốn lệnh mã 0.

## Test mới và phạm vi

V5 không thêm test. Các test đã có từ những bước trước:

- `tests/ship-fields.test.ts` (6 ca): trích trường/chuỗi trắng/tiền tố tỉnh; lý do hoàn; upsert giữ hãng và giờ sớm nhất; backfill JSON hỏng/phạm vi/chạy lại; demo đủ hãng/tỉnh/giao thất bại; đối chiếu SQL với hàm thuần.
- `tests/return-breakdown.test.ts` (6 ca): tỷ lệ theo đơn và giá trị/mẫu rỗng; hãng thiếu/tỉnh nhỏ/ngưỡng; đơn nhiều loại; API demo và tổng theo hãng; giới hạn ngày; quyền overview/Vận đơn/Vận hành đơn.
- `tests/failed-delivery.test.ts` (4 ca): saved/lost/pending/saveRate; xếp đơn và hoursSince; API demo owner/lead và che điện thoại; ngày/quyền/nhật ký.
- `tests/order-speed.test.ts` (8 ca): percentile các ô và mẫu rỗng; gộp thời gian chờ; ngưỡng người/phạm vi POS/skipped; API bốn chặng và không dữ liệu khách; ngày/POS/quyền; SQL dùng chỉ mục và đơn kẹt; phạm vi POS kế thừa; khóa team.
- `tests/order-cost.test.ts` (6 ca): giá bình quân/dự phòng/combo/giá không hợp lệ; quà tặng/thiếu giá/số lượng 0; ưu tiên phí; upsert ba cột; backfill JSON hỏng/phạm vi/deadline/chạy lại; độ phủ giá vốn demo.
- `tests/profit.test.ts` (7 ca): nhận/hoàn/trên đường; thiếu giá vốn/phí; POS không đủ; chia loại đơn và tổng; API demo/công thức/ROAS cũ; ngày/POS/cờ sẵn sàng; chặn vai trò khác owner. Ca chia loại đơn cũng kiểm cảnh báo lãi âm.
- `tests/access.test.ts`: thêm ca “Lãi thật chỉ owner được xem, không thể cấp cho director, lead hay staff”.

Đây là kiểm kê từ mã test; V5 chưa chạy được các ca do `EPERM`.

## Ảnh demo

Bỏ ảnh theo điều kiện V5 vì lệnh Playwright không có sẵn. Không cài Playwright/Chromium, không khởi động demo, không đọc hoặc tạo `.dev.vars`. Chưa kiểm trực quan bốn trang ở 1280/390 px và sáng/tối; không có ảnh trong `anh/`.

## Chỗ làm khác plan và lý do

- Không thể xác nhận test/build thành công do giới hạn môi trường và các lỗi nạp dependency nêu trên. Lint vẫn có 1.161 lỗi sẵn, không tăng so với mốc gốc được ghi lại. Chỉ ghi nhận, không sửa file ngoài phạm vi V5.
- Diff các bước trước có sửa helper trong `tests/first-closed.test.ts`: đọc bind theo tên cột thay vì vị trí hai tham số cuối, vì INSERT thêm cột. Các giá trị mong đợi giữ nguyên. V5 chỉ ghi nhận, không sửa lại.
- Không chụp ảnh vì thiếu Playwright; đây là nhánh bỏ qua được V5 cho phép.

## Câu hỏi còn lại

Không cần câu trả lời giữa chừng. Các việc còn phải xác minh khi bàn giao: máy kiểm ngoài sandbox chạy lại cả bốn lệnh; nếu build vẫn lỗi native dependency thì cần xử lý môi trường trong phạm vi được giao riêng. Kiểm giao diện và ảnh demo còn thiếu. Chưa xác nhận JSON trang cũ trước/sau giống nhau hoặc toàn bộ truy vấn đạt kế hoạch chỉ mục bằng chạy thực tế; test hiện có chưa thực thi được. Không coi báo cáo này là xác nhận đủ điều kiện deploy.
