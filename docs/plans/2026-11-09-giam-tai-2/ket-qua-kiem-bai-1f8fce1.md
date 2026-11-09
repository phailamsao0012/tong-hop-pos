# Kết quả sửa kiểm bài 1f8fce1

Đã làm điểm 1 rồi điểm 2 trên nhánh `codex/giam-tai-2`. Không commit, không áp migration vào DB, không deploy.

- Điểm 1: đồng bộ chỉ INSERT marketer, giữ người cũ đến lượt dọn. `backfillMarketerIds` dọn sau khi ready, trong 00–05h VN, lưu ngày VN vào `marketer_ids_cleaned_day_v1`; upsert có điều kiện bỏ ghi giá trị không đổi. Trả tổng rows_written/changes của DELETE và cờ ngày; scheduler hiện có cộng kết quả vào writesUsed nên không cần sửa scheduler.
- Điểm 2: sửa thẳng 0052, tách trigger đổi POS và sửa cùng POS. Cùng POS không sửa notes, chỉ tính lại MIN khi dòng đầu bị đẩy về sau, MAX khi dòng cuối bị kéo về trước. `lib/reports/calls-coverage.ts` chỉ backfill, không tạo trigger nên không cần sửa.
- Khác giả định “fetched_at chỉ tăng” trong kiểm bài: `noteStatements` ở `lib/pancake/customers-sync.ts` gán trực tiếp `excluded.fetched_at` từ tham số `now`, không có điều kiện tăng. Lượt đồng bộ chồng nhau có thể ghi thời điểm cũ hơn. Giữ nhánh tính lại MAX khi giảm để khớp số cũ, đúng ngoại lệ plan đã cho phép.

## Kiểm tra

- `pnpm typecheck`: qua. `node node_modules/typescript/bin/tsc --noEmit`: qua sau sửa cuối.
- Native loader: `giam-tai-2.test.ts`, `stats-segment.test.ts`, `g4-writes.test.ts`: 18/18 qua. Sau sửa lint chạy lại hai file giam-tai-2/G4: 9/9 qua.
- Test MKT xác nhận giữ người cũ trước dọn, khớp DISTINCT sau dọn, lượt thứ hai cùng đêm không tạo DELETE và trả 0, đồng bộ lặp không đổi có 0 câu ghi. Test coverage so câu đếm cũ sau fetched_at tăng/giảm, created_at giảm/tăng ở dòng đầu, chuyển POS, xoá và rollback.
- `pnpm test`: không chạy được trong sandbox, runner báo `spawn EPERM` khi tạo tiến trình con; không phải kết quả fail assertion nghiệp vụ.
- `pnpm build`: không chạy xong trong môi trường này: `spawn EPERM` và lỗi nạp dependency native Tailwind oxide/lightningcss khi đọc Vite config.
- `pnpm lint`: lỗi có sẵn ở nhiều file ngoài phạm vi. Đã sửa lỗi spread phát sinh ở marketerStatements; `pnpm exec oxlint lib/teams/marketer-ids.ts tests/giam-tai-2.test.ts scripts/pc/do-cuoc-goi.ts` qua, không còn lỗi tại file sửa.
- Chạy `node --import ./tests/support/register-native.mjs scripts/pc/do-cuoc-goi.ts C:\thp\db-thu\thp.sqlite docs/plans/2026-11-09-giam-tai-2/do-cuoc-goi-kiem-bai.md --candidate`: exit 0. Cả 6 tổ hợp kỳ/team khớp Q4 và coverage cũ. Danh sách MKT sau điền từng POS, thêm ID ảo rồi dọn khớp DISTINCT cũ. Chỉ dùng bảng TEMP, không sửa DB nguồn; không xuất ID hay số liệu kinh doanh. Chi tiết thời gian/đường truy cập ở `do-cuoc-goi-kiem-bai.md`.
