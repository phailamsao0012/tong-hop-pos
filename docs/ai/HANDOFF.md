# HANDOFF: ghi chú bàn giao (ghi đè mỗi lần dừng)

## Lần cập nhật cuối
- **Thời gian:** 2026-10-15 23:14 (giờ máy local)
- **Người viết:** Codex
- **Nhánh / commit:** demo-gop / e0d3dd8; không stage/commit theo PLAN mục 6.

## Đã xong
- Chỉ làm POS-GON; đã đọc AGENTS.md, HANDOFF, PROGRESS, PLAN (gồm mục 6), CONVENTIONS.
- app/overview-view.tsx: hàm PosChips thay chip bằng một nút mở Popover; thêm import Popover và ChevronDown cần cho hàm. Badge POS đang chọn xếp chồng, nhãn theo số POS, aria-label/title đầy đủ; pill lỗi ưu tiên hơn lịch sử. Giữ scopedPos(useScope()), ẩn khi ≤1 POS, props/export và onChange dùng chung.
- Popover có Tất cả, từng dòng chọn/bỏ, chặn bỏ POS cuối (aria-disabled/title), trạng thái từ info và Chỉ POS này. Hai nút là anh em, không lồng button; Chỉ POS này hiện khi hover/focus-within và luôn hiện trên thiết bị cảm ứng.
- app/globals.css: thêm khối .pospick* ngay sau .poschip, chỉ dùng token; focus/viền mở popover, badge viền surface, ô tích 16px. Chừa chỗ phía dưới dòng cho Chỉ POS này để không che thông tin.
- npm run typecheck: exit 0 (tsc --noEmit), đã chạy lại sau rà nhãn tiếng Việt.
- npm test: exit 1; Error: spawn EPERM; 46 file không khởi chạy, pass 0/fail 46; chưa xác minh test nghiệp vụ.
- npm run build: exit 1; failed to load config from vite.config.ts; Build failed with 8 errors; plugin externalize-deps Error: spawn EPERM. Kèm UNLOADABLE_DEPENDENCY oxide (stream did not contain valid UTF-8), resolve react/react-dom gặp spawn EPERM; chưa có Build complete.
- test/build: spawn EPERM, chờ Claude chạy. Áp dụng PLAN mục 6, không BLOCKED, không thử lách sandbox.
- git diff --check: exit 0. Kiểm hex diff e0d3dd8 -- app components không có kết quả; PosChips không còn poschip trong JSX. Không cài gói.
- Đã tích POS-GON, đặt STATUS: DONE và dừng theo yêu cầu chỉ làm task này.

## Đang dở
- Không còn code đang sửa cho POS-GON.
- Chưa kiểm trực quan hoặc thao tác trên demo; chờ Claude nghiệm thu.

## Việc kế tiếp
- Claude chạy npm test + npm run build ngoài sandbox.
- Claude kiểm demo sáng/tối ở 390/1024/1280: một hàng, không cuộn ngang; chọn/bỏ, POS cuối, Chỉ POS này, Tất cả; dữ liệu trang thay theo lựa chọn và giữ khi chuyển trang; kiểm bàn phím/focus và trạng thái từ info.
- Claude nghiệm thu rồi commit POS-GON khi đạt. Codex không tự chạy task khác.

## BLOCKED
- Không có; spawn EPERM thuộc ngoại lệ PLAN mục 6.

## Lưu ý cho người làm tiếp
- Lượt này chỉ sửa app/overview-view.tsx, app/globals.css, docs/ai/PROGRESS.md và docs/ai/HANDOFF.md.
- PLAN.md và PROGRESS.md có thay đổi từ trước khi bắt đầu; giữ nguyên thay đổi có sẵn, không sửa PLAN/CONVENTIONS.
- Không chạy Git ghi, không push/deploy, không đổi nhánh.
