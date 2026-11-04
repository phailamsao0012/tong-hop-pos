# Lọc POS ở mọi mục: chọn POS nào chỉ hiện người có tài khoản POS đó

Anh Vũ 04/11/2026: "khi tôi đang chọn pos siêu vô gạo vẫn còn người của pos khác, team khác; team 1 có 8 người chạy POS A,
2 người chạy POS B thì chọn POS A chỉ có tên 8 người". Marketing đã xong (#124). Plan này làm phần còn lại.

## Luật
- Người hiện trong bảng, ô chọn, xếp hạng = người đang có tài khoản (is_active) trên POS đang chọn (`usePosStaffFilter`, app/pos-store.ts).
- Số tổng của trang giữ nguyên (đơn nằm trên POS đó vẫn tính), chỉ bớt dòng người.
- Ô Team: đếm lại thành viên trong POS; team không còn ai trong POS và không có đơn thì ẩn (như hr-team-picker).
- Chọn "Tất cả POS" thì không lọc.

## Bước
1. **Mentor** (`lib/teams/staff-scope.ts` mentorReport): danh sách lấy từ hr_pos_team, chưa lọc POS, lại điền 0 cho người không đơn
   nên lọt rõ nhất. Sửa phía server: chỉ giữ người active trong `pos_users WHERE pos_id IN (posIds)`. Test mới trong tests/.
2. **Lỗ chung các bảng theo đơn**: người còn đơn cũ ở POS A nhưng nay chỉ còn tài khoản POS B vẫn hiện khi chọn POS A.
   Thêm hook `usePosRows(rows, key)` bọc usePosStaffFilter rồi gắn vào: team-overview (Theo nhân viên, số người gọi), overview,
   compare, center (top/low 5), monthly, sale-segment-block, custom-report, staff-compare, calls, shift, van-don (người lên đơn),
   sale-analytics, sale-quality, cskh-analytics, product-group-blocks, origin, pipeline, overview-trends, cskh-view (lô, mua lại), returns.
3. **Dự báo AI** (forecast-card ForecastReview): thanh người lọc theo POS.
4. **Trang Hoàn/Hủy**: bỏ ô "Nhân viên" cũ của thanh công cụ (đang lấy mọi người mọi POS, trang không dùng).
5. **Ô Team theo chi nhánh** (branch-switch): trả memberIds, ẩn team không có người trong POS.

## Kiểm
- 4 lệnh: typecheck, test, lint, build. Chạy cục bộ DEMO_MODE=1, chọn từng POS, chụp ảnh Sale / CSKH / Vận đơn / Mentor gửi anh (Artifact).
- Chi phí Cloudflare: bước 1 thêm một câu đọc pos_users nhỏ (vài trăm dòng/lần), các bước khác lọc trên máy người xem, không đọc thêm D1.

## Chưa làm, cần anh
- Giao việc / Chat Zalo không có POS: giữ nguyên, trừ khi anh muốn lọc.
