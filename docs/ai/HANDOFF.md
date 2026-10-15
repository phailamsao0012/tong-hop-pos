# HANDOFF: ghi chú bàn giao (ghi đè mỗi lần dừng)

## Lần cập nhật cuối
- **Thời gian:** 2026-10-15 17:19 (giờ máy local)
- **Người viết:** Codex
- **Nhánh / commit:** giao-dien-moi; HEAD f4851d6; FIX-T4 chưa commit theo PLAN mục 6.

## Đã xong
- Chỉ làm FIX-T4: tại app/center-view.tsx:478, thêm max-lg:col-span-2 khi i === 6 để KPI thứ 7 chiếm đủ 2 cột dưới lg; giữ nguyên các class lg: của T4.
- Không đổi nội dung, dữ liệu, nút hoặc quyền.
- npm run typecheck: exit 0 (tsc --noEmit).
- npm test: exit 1, Error: spawn EPERM; 28 file không khởi chạy, chưa xác minh 112 test.
- npm run build: exit 1, failed to load config from vite.config.ts; [plugin externalize-deps] Error: spawn EPERM; kèm UNLOADABLE_DEPENDENCY oxide (stream did not contain valid UTF-8), UNRESOLVED_IMPORT lightningcss (Could not resolve '../pkg'), resolve react-dom cũng gặp spawn EPERM. Chưa có Build complete.
- test/build: spawn EPERM, chờ Claude chạy. Áp dụng PLAN mục 6, không BLOCKED, không thử lách sandbox.
- git diff --check đạt; kiểm hex trên diff so với f4851d6 không có kết quả.
- Không cài gói vì node_modules sẵn có. Không git add/commit.

## Đang dở
- Code FIX-T4 đã xong; app/center-view.tsx và PROGRESS/HANDOFF chưa commit. Test/build và nghiệm thu trực quan chờ Claude kiểm tra ngoài sandbox.

## Việc kế tiếp
- Claude chạy test/build ngoài sandbox, kiểm tra KPI thứ 7 dưới lg và commit FIX-T4 sau khi đạt.
- Task kế tiếp là T5 theo PLAN.md. Lượt này chỉ làm FIX-T4; chưa làm T5.

## BLOCKED
- Không có; áp dụng ngoại lệ spawn EPERM và không git add/commit tại PLAN mục 6.

## Lưu ý cho người làm tiếp
- PROGRESS đặt READY | T5; FIX-T4 đã tích theo PLAN mục 6.
- Trước lượt này PROGRESS.md đã có thay đổi chưa commit; đã giữ nguyên các nội dung khác.
- Giờ máy local lúc bắt đầu là 2026-10-15 17:18, sớm hơn timestamp READY 17:50 có sẵn; dùng giờ máy thực tế khi cập nhật.
- Không push, không deploy. Không sửa PLAN.md hoặc CONVENTIONS.md.
