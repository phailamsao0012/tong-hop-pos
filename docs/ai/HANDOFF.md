# HANDOFF: ghi chú bàn giao (ghi đè mỗi lần dừng)

## Lần cập nhật cuối
- **Thời gian:** 2026-10-15 17:15
- **Người viết:** Codex
- **Nhánh / commit:** giao-dien-moi; HEAD de30981; FIX-T3 chưa commit theo PLAN mục 6.

## Đã xong
- FIX-T3: chỉ sửa app/exec-blocks.tsx dòng 59, config ChartContainer trong MonthPace: forecast.color = 'var(--series-1)', target.color = 'var(--ink-3)'. actual giữ --series-1.
- Giữ nguyên TEAM_COLORS, lưới dashed, nét 2px, nét đứt/độ mờ dự báo và toàn bộ dữ liệu/phép tính.
- npm run typecheck: exit 0 (tsc --noEmit).
- npm test: exit 1, Error: spawn EPERM; 28 file không khởi chạy, chưa xác minh 112 test.
- npm run build: exit 1, failed to load config from vite.config.ts; [plugin externalize-deps] Error: spawn EPERM; kèm UNLOADABLE_DEPENDENCY oxide (stream did not contain valid UTF-8), UNRESOLVED_IMPORT lightningcss (Could not resolve '../pkg'), resolve react-dom cũng gặp spawn EPERM. Chưa có Build complete.
- test/build: spawn EPERM, chờ Claude chạy. Áp dụng PLAN mục 6, không BLOCKED, không thử lách sandbox.
- git diff --check đạt. Diff code so với de30981 chỉ có hai giá trị màu nêu trên; kiểm hex không có kết quả.

## Đang dở
- Code FIX-T3 đã xong; app/exec-blocks.tsx và PROGRESS/HANDOFF chưa commit. Test/build chờ Claude xác minh ngoài sandbox.

## Việc kế tiếp
- Claude chạy test/build ngoài sandbox và commit FIX-T3 sau khi kiểm tra.
- Task kế tiếp là T4 theo PLAN.md. Lượt này chỉ làm FIX-T3; chưa làm T4.

## BLOCKED
- Không có; áp dụng ngoại lệ spawn EPERM và không git add/commit tại PLAN mục 6.

## Lưu ý cho người làm tiếp
- PROGRESS đặt READY | T4; FIX-T3 đã tích theo PLAN mục 6.
- Không push, không deploy. Không sửa PLAN.md hoặc CONVENTIONS.md.
