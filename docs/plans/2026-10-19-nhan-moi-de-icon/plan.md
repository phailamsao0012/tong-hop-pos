# Sửa nhãn "Mới HH:MM" đè icon ở các ô số (19/10/2026)

Tổ web tổng viết. Anh Vũ báo trên web thật ngày 19/10 (kèm ảnh trang Điều hành): "cứ mới vào bị lỗi chồng icon ở các ô kìa". Quy trình chung: Codex sửa, Claude kiểm, lên demo, anh ok mới lên web thật.

## Hiện trạng (nhánh demo; dòng có thể lệch, tìm theo tên)
- `app/dashboard.tsx` (~1399–1409): sau mỗi lần làm mới số liệu, `main` có lớp `is-refreshing` (đang tải) rồi `is-refreshed` trong 6 giây, kèm biến CSS `--fresh-at` = giờ cập nhật.
- `app/globals.css` (~285–310): `.is-refreshing .kpi::after` hiện nhãn "● Đang cập nhật…", `.is-refreshed .kpi::after` hiện nhãn "✓ Mới HH:MM". Nhãn đặt `position: absolute; top: 10px; right: 10px; z-index: 2`, tức đúng góc phải trên của ô, nơi `KpiCard` (`app/ui-kit.tsx` ~109) đặt icon của ô. Kết quả:
  - nhãn đè icon ở mọi ô (Đơn tạo mới, Đơn chốt, Doanh thu, AOV, Giao thành công, Mục tiêu…);
  - ô có tiêu đề dài ("Chốt nóng ca sáng hôm nay") thì nhãn đè cả tiêu đề.
- Trang đã có sẵn ô chung "Đã cập nhật lúc HH:MM · số mới nhất" ở đầu trang (`refresh-chip`), nên nhãn trong từng ô là lặp lại.

## Không được đổi
- Số, cách tính, bộ lọc, quyền xem. Ô chung `refresh-chip` ở đầu trang, vạch chạy `refresh-bar`, logic `useRefreshStatus` / `justFresh`.
- Kiểu dáng ô số khác (màu, bo góc, icon, vị trí icon).

## Bước

**S1. Bỏ nhãn chữ trong từng ô, giữ dấu hiệu bằng viền**

File được sửa: `app/globals.css`, `app/dashboard.tsx`, `app/ui-kit.tsx`, `app/exec-blocks.tsx`, `app/overview-view.tsx`, `tests/*.test.ts`.

- `app/globals.css`: xoá hẳn hai quy tắc `::after` của `.kpi` khi `.is-refreshing` / `.is-refreshed` (nhãn "● Đang cập nhật…" và "✓ Mới HH:MM"), cùng phần dùng chung `position: absolute…` của chúng. Giữ:
  - `.is-refreshing`: ô mờ đi + viền vàng như đang có (nếu hiện chỉ có `::after` làm dấu, thêm `opacity` nhẹ cho nội dung ô như `.card`);
  - `.is-refreshed`: viền xanh + bóng `--good-bg` 6 giây như đang có.
- Không đặt nhãn chữ nào khác vào trong ô. Giờ cập nhật đã có ở ô chung đầu trang.
- Tìm mọi chỗ khác còn dùng `--fresh-at` hoặc vẽ nhãn tuyệt đối vào góc ô (`rg -n "fresh-at|is-refreshed|is-refreshing" app`); chỗ nào chỉ phục vụ nhãn vừa bỏ thì bỏ theo, chỗ khác giữ nguyên.
- Kiểm cả chế độ tối (`.dark …` ~764) và bản điện thoại.
- Test: thêm một test đọc `app/globals.css` khẳng định không còn quy tắc nào có `.kpi` kết hợp `::after` với `content:` chứa "Mới" hoặc "Đang cập nhật" (để lỗi không quay lại).
- Chụp ảnh (demo local `DEMO_MODE=1`) trang Điều hành ngay sau khi bấm "Tải lại" và 1 giây sau khi tải xong, ở bề rộng 1440px và 390px, sáng và tối. Ảnh để ngoài repo, ghi đường dẫn vào tóm tắt.
