# HANDOFF: ghi chú bàn giao (ghi đè mỗi lần dừng)

## Lần cập nhật cuối
- **Thời gian:** 2026-10-15 17:12
- **Người viết:** Codex
- **Nhánh / commit:** `giao-dien-moi`; HEAD `d8c7903`; T3 chưa commit theo PLAN mục 6.

## Đã xong
- T3: thêm --series-1/2/3 ở :root và .dark trong app/globals.css, đúng bảng màu chính thức; series 1 là accent.
- app/exec-blocks.tsx: ba series thực tế/dự báo/mục tiêu lần lượt dùng series 1/2/3 qua ChartContainer; TEAM_COLORS dùng cùng bộ token; lưới strokeDasharray="3 3", nét ba series 2px. Giữ nguyên dữ liệu và phép tính.
- app/ui-kit.tsx: STATUS_COLORS.new = #89988F, shipping = #C78700; toàn bộ STATUS_COLORS khớp token sáng. Không sửa POS_COLORS hoặc --pos-1..6.
- npm run typecheck: exit 0 (tsc --noEmit), đã chạy lại sau chỉnh sửa cuối.
- npm test: exit 1, Error: spawn EPERM; 28 file không khởi chạy được, chưa xác minh 112 test.
- npm run build: exit 1, failed to load config from vite.config.ts; [plugin externalize-deps] Error: spawn EPERM; kèm UNLOADABLE_DEPENDENCY oxide (stream did not contain valid UTF-8), UNRESOLVED_IMPORT lightningcss (Could not resolve '../pkg'), resolve react-dom cũng gặp spawn EPERM. Chưa có Build complete.
- Theo PLAN mục 6: test/build: spawn EPERM, chờ Claude chạy; không BLOCKED, không thử lách sandbox.
- Kiểm diff từ d8c7903: hex thêm/sửa chỉ trong token :root/.dark và STATUS_COLORS; exec-blocks.tsx không có hex; dữ liệu chart và POS giữ nguyên; git diff --check đạt.

## Đang dở
- Code T3 đã xong; ba file code và PROGRESS/HANDOFF chưa commit. Test/build chờ Claude xác minh ngoài sandbox.

## Việc kế tiếp
- Claude chạy test/build ngoài sandbox và commit T3 sau khi kiểm tra.
- Task tiếp theo là T4 theo PLAN.md. Lượt này chỉ làm T3, đã dừng, chưa làm T4.

## BLOCKED
- Không có; áp dụng ngoại lệ spawn EPERM và không git add/commit tại PLAN mục 6.

## Lưu ý cho người làm tiếp
- PROGRESS đặt READY | T4; T3 đã tích theo PLAN mục 6.
- Không push, không deploy. Không sửa PLAN.md hoặc CONVENTIONS.md.
