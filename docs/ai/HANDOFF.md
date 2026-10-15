# HANDOFF: ghi chú bàn giao (ghi đè mỗi lần dừng)

## Lần cập nhật cuối
- **Thời gian:** 2026-10-15 17:17
- **Người viết:** Codex
- **Nhánh / commit:** giao-dien-moi; HEAD 73a3a2b; T4 chưa commit theo PLAN mục 6.

## Đã xong
- T4: chỉ sửa phần lưới trong app/center-view.tsx, khoảng dòng 477–550.
- Lưới ngoài lg:grid-cols-12; MonthPace/TeamsCompare 8/4; Xu hướng/Trạng thái 7/5; Xếp hạng POS/Vận hành đơn 7/5, Cảnh báo & đồng bộ toàn hàng; Nhân viên/Mua lại & data và Khách hàng/Khách lâu chưa mua 7/5.
- Bốn KPI đầu 3/3/3/3; ba KPI còn lại 6/3/3 để không còn hàng ba card bằng nhau. Dưới lg, KPI hai cột, các khối ngoài một cột. Giữ nguyên nội dung, dữ liệu, nút và quyền.
- npm run typecheck: exit 0 (tsc --noEmit).
- npm test: exit 1, Error: spawn EPERM; 28 file không khởi chạy, chưa xác minh 112 test.
- npm run build: exit 1, failed to load config from vite.config.ts; [plugin externalize-deps] Error: spawn EPERM; kèm UNLOADABLE_DEPENDENCY oxide (stream did not contain valid UTF-8), UNRESOLVED_IMPORT lightningcss (Could not resolve '../pkg'), resolve react-dom cũng gặp spawn EPERM. Chưa có Build complete.
- test/build: spawn EPERM, chờ Claude chạy. Áp dụng PLAN mục 6, không BLOCKED, không thử lách sandbox.
- git diff --check đạt; kiểm hex trên diff so với 73a3a2b không có kết quả. Không cài gói vì node_modules sẵn có.

## Đang dở
- Code T4 đã xong; app/center-view.tsx và PROGRESS/HANDOFF chưa commit. Test/build và nghiệm thu trực quan chờ Claude kiểm tra ngoài sandbox.

## Việc kế tiếp
- Claude chạy test/build ngoài sandbox, kiểm tra giao diện và commit T4 sau khi đạt.
- Task kế tiếp là T5 theo PLAN.md. Lượt này chỉ làm T4; chưa làm T5.

## BLOCKED
- Không có; áp dụng ngoại lệ spawn EPERM và không git add/commit tại PLAN mục 6.

## Lưu ý cho người làm tiếp
- PROGRESS đặt READY | T5; T4 đã tích theo PLAN mục 6.
- Không push, không deploy. Không sửa PLAN.md hoặc CONVENTIONS.md.
