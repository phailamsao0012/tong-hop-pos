# HANDOFF: ghi chú bàn giao (ghi đè mỗi lần dừng)

## Lần cập nhật cuối
- **Thời gian:** 2026-10-15 17:23 (giờ máy local)
- **Người viết:** Codex
- **Nhánh / commit:** giao-dien-moi; HEAD 68f6248; FIX-T5 chưa commit theo PLAN mục 6.

## Đã xong
- Chỉ làm FIX-T5, code chỉ sửa app/globals.css hai dòng:
  - Dòng 574: thêm media ≤900px cho .topbar, min-height 52px và padding 0 16px. Giữ desktop 24px và gap 6px ở ≤1200px.
  - Dòng 728: thêm .dark .mod-chip { color: var(--sb); } cạnh các luật dark, ngoài @theme inline và .den-*. Giữ nguyên luật light.
- npm run typecheck: exit 0 (tsc --noEmit).
- npm test: exit 1, Error: spawn EPERM; 28 file không khởi chạy, chưa xác minh 112 test.
- npm run build: exit 1, failed to load config from vite.config.ts; [plugin externalize-deps] Error: spawn EPERM; kèm UNLOADABLE_DEPENDENCY oxide (stream did not contain valid UTF-8), UNRESOLVED_IMPORT lightningcss (Could not resolve '../pkg'), resolve react-dom cũng gặp spawn EPERM. Chưa có Build complete.
- test/build: spawn EPERM, chờ Claude chạy. Áp dụng PLAN mục 6, không BLOCKED, không thử lách sandbox.
- git diff --check đạt; kiểm hex diff so với 68f6248 không có kết quả, không thêm hex.
- Không cài gói vì node_modules sẵn có. Không git add/commit.

## Đang dở
- Code FIX-T5 đã xong; app/globals.css và PROGRESS/HANDOFF chưa commit. Test/build và nghiệm thu trực quan chờ Claude kiểm tra ngoài sandbox.

## Việc kế tiếp
- Claude chạy test/build ngoài sandbox, nghiệm thu FIX-T5 và commit sau khi đạt.
- Task kế tiếp là T6 theo PLAN.md. Lượt này chỉ làm FIX-T5, chưa làm T6.

## BLOCKED
- Không có; áp dụng ngoại lệ spawn EPERM và không git add/commit tại PLAN mục 6.

## Lưu ý cho người làm tiếp
- PROGRESS đặt READY | T6; FIX-T5 đã tích theo PLAN mục 6.
- Khi bắt đầu: HEAD 68f6248, chỉ docs/ai/PROGRESS.md đã có thay đổi của Claude (đưa FIX-T5 vào checklist); đã giữ nguyên nội dung đó và cập nhật trạng thái/kết quả.
- Không sửa PLAN.md / CONVENTIONS.md hoặc file ngoài phạm vi. Không push/deploy.
