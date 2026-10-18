# Luật cho Codex: việc giao diện mới (trước đây là AGENTS.md của nhánh giao-dien-moi)

> Trên nhánh demo, AGENTS.md ở gốc repo là luật chung của cả repo. Việc giao diện đọc file này.

Dự án đang làm: **áp giao diện mới cho web tổng POS** trên nhánh `giao-dien-moi`.
Claude lên plan và nghiệm thu. Codex là người viết code. Nhiều tài khoản Codex làm nối tiếp nhau,
nên **mọi thứ cần biết nằm trong file, không nằm trong lịch sử chat**.

## Thứ tự đọc (bắt buộc, mỗi lần bắt đầu)

1. `docs/ai/HANDOFF.md`: người trước dừng ở đâu, việc kế tiếp là gì.
2. `docs/ai/PROGRESS.md`: dòng STATUS + checklist task.
3. `docs/ai/PLAN.md`: mô tả đầy đủ từng task, file được sửa, tiêu chí xong, cách kiểm.
4. `docs/ai/CONVENTIONS.md`: quy ước code và những thứ cấm chạm.

## Cách làm việc

- **Task loại `FIX-*` làm trước tiên** (Claude thêm vào khi nghiệm thu thấy lỗi). Sau đó mới tới task `T*` chưa xong, theo đúng thứ tự.
- **Làm một task một lần.** Không gộp, không làm trước task sau.
- Bắt đầu task: sửa dòng đầu `docs/ai/PROGRESS.md` thành
  `STATUS: RUNNING | <task id> | <giờ bắt đầu YYYY-MM-DD HH:MM> | <tài khoản nếu biết>`.
- Xong task (đã chạy đủ lệnh kiểm trong PLAN và đạt):
  1. Tích `[x]` task đó trong `PROGRESS.md`, ghi 1 dòng kết quả kiểm.
  2. Ghi đè `docs/ai/HANDOFF.md` theo mẫu có sẵn trong file.
  3. Commit **một commit cho một task**, message bắt đầu bằng id: `T3: đổi màu chart theo token`.
- **Trước khi dừng vì bất kỳ lý do gì** (hết lượt, hết hạn mức, xong việc): cập nhật `PROGRESS.md` + `HANDOFF.md` trước,
  để tài khoản sau làm tiếp được ngay. Việc đang dở thì ghi rõ file nào, dòng nào, còn thiếu gì.
- Hết task: đặt `STATUS: DONE | <task cuối> | <giờ>` rồi dừng.

## Khi gặp lỗi

- Tự sửa nếu lỗi nằm trong phạm vi task (typecheck/test/build đỏ do chính mình sửa).
- Không tự sửa được, hoặc lỗi nằm ngoài phạm vi: **DỪNG**, đặt
  `STATUS: BLOCKED | <task id> | <giờ>` và ghi vào `HANDOFF.md` mục "BLOCKED":
  lệnh đã chạy, **toàn bộ thông báo lỗi nguyên văn**, file/dòng nghi ngờ, những gì đã thử.
  Claude sẽ tìm nguyên nhân và chỉ cách sửa.
- Không "đoán cho qua", không tắt test, không xoá kiểm tra để cho xanh.

## Cấm tuyệt đối

- Sửa `docs/ai/PLAN.md` hoặc `docs/ai/CONVENTIONS.md` (đó là việc của Claude).
- Đụng `wrangler.jsonc` (đặc biệt `triggers.crons`), `drizzle/`, `db/`, `lib/` (logic nghiệp vụ), `scripts/`, `ios/`, `android/`, `.dev.vars`.
- Sửa file **ngoài repo này**, kể cả `C:\Users\PC\.codex\config.toml`.
- `npm install` (dùng `pnpm install --frozen-lockfile`). Thêm thư viện mới.
- `git push`, deploy, `npm run db:migrate` (remote). Đổi nhánh khác `giao-dien-moi`.
- Đổi số liệu, cách tính, tên nghiệp vụ, quyền xem.
