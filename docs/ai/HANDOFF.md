# HANDOFF: ghi chú bàn giao (ghi đè mỗi lần dừng)

## Lần cập nhật cuối
- **Thời gian:** 2026-10-15
- **Người viết:** Claude (khởi tạo)
- **Nhánh / commit:** `giao-dien-moi` @ `2817ffc` (+ commit thêm bộ docs/ai này)

## Đã xong
- Lưu nguyên trạng giao diện bước 1–3 vào commit `916820a` (chưa nghiệm thu đầy đủ, xem PLAN mục 5).
- Trả `wrangler.jsonc` crons về mỗi phút ở `2817ffc`.
- Viết `AGENTS.md`, `docs/ai/PLAN.md`, `CONVENTIONS.md`, `PROGRESS.md`, file này.

## Đang dở
- Không có.

## Việc kế tiếp
- Codex làm **T1** trong `PLAN.md`: chạy typecheck / test / build, ghi kết quả. Đỏ thì BLOCKED, không tự sửa.

## BLOCKED
_(trống. Nếu bị chặn: lệnh đã chạy, lỗi nguyên văn, file/dòng nghi ngờ, những gì đã thử)_

## Lưu ý cho người làm tiếp
- Chạy Codex trên máy này phải thêm `-c windows.sandbox="unelevated"`, nếu không Codex không chạy được lệnh (`helper_unknown_error: setup refresh had errors`).
- Tài khoản Codex: `C:\Users\PC\.codex` (tk1), `C:\Users\PC\.codex-2` (tk2), chọn bằng biến `CODEX_HOME`.
