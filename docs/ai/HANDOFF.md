# HANDOFF: ghi chú bàn giao (ghi đè mỗi lần dừng)

## Lần cập nhật cuối
- **Thời gian:** 2026-10-15 17:21 (giờ máy local)
- **Người viết:** Codex
- **Nhánh / commit:** giao-dien-moi; HEAD e0524fa; T5 chưa commit theo PLAN mục 6.

## Đã xong
- Chỉ làm T5: app/dashboard.tsx dùng max-w-[1360px], px-4 / md:px-6 cho main; giữ nguyên nhánh presenting.
- Sáu nhóm menu dùng lần lượt --primary, --t-blue, --warn, --t-teal, --t-orange, --ink-3. Màu chỉ dùng trực tiếp làm background chip, không có phép ghép hex cần đổi cách pha.
- app/globals.css: nhãn tab 11px; topbar padding ngang 24px, min-height 56px mọi kích thước (bỏ ghi đè responsive 16/12px và 52px).
- npm run typecheck: exit 0 (tsc --noEmit).
- npm test: exit 1, Error: spawn EPERM; 28 file không khởi chạy, chưa xác minh 112 test.
- npm run build: exit 1, failed to load config from vite.config.ts; [plugin externalize-deps] Error: spawn EPERM; kèm UNLOADABLE_DEPENDENCY oxide (stream did not contain valid UTF-8), UNRESOLVED_IMPORT lightningcss (Could not resolve '../pkg'), resolve react-dom cũng gặp spawn EPERM. Chưa có Build complete.
- test/build: spawn EPERM, chờ Claude chạy. Áp dụng PLAN mục 6, không BLOCKED, không thử lách sandbox.
- git diff --check đạt; kiểm hex diff so với e0524fa chỉ có sáu dòng hex bị xóa trong NAV_GROUPS, không có hex mới.
- Không cài gói vì node_modules sẵn có. Không git add/commit.

## Đang dở
- Code T5 đã xong; app/dashboard.tsx, app/globals.css và PROGRESS/HANDOFF chưa commit. Test/build và nghiệm thu trực quan chờ Claude kiểm tra ngoài sandbox.

## Việc kế tiếp
- Claude chạy test/build ngoài sandbox, kiểm tra khung trang và commit T5 sau khi đạt.
- Task kế tiếp là T6 theo PLAN.md. Lượt này chỉ làm T5; chưa làm T6.

## BLOCKED
- Không có; áp dụng ngoại lệ spawn EPERM và không git add/commit tại PLAN mục 6.

## Lưu ý cho người làm tiếp
- PROGRESS đặt READY | T6; T5 đã tích theo PLAN mục 6.
- Working tree sạch khi bắt đầu lượt này, HEAD e0524fa (khác HEAD ghi trong bàn giao trước).
- Không sửa dữ liệu, nghiệp vụ, quyền hoặc nhánh presenting. Không sửa PLAN.md / CONVENTIONS.md. Không push/deploy.
