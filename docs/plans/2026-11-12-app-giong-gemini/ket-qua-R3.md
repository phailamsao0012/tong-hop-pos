# Kết quả R3: 02–04 Tổng quan

## Khung chung
- Tiêu đề lớn đổi theo phần: "Tổng quan" (Bốn bộ phận), "Số liệu theo kỳ" (Số liệu & KH), "Tổng quan POS" (Theo POS). Dòng nhỏ "Tháng 11/2026".
- Pill lọc rồi segmented "Bốn bộ phận | Số liệu & KH | Theo POS", mặc định Bốn bộ phận (nhớ lựa chọn như cũ).
- Tour 15: mốc `tong-quan-pos` chụp phần Theo POS ngay trong Tổng quan, đúng khung 04. Trước đây mốc này mở trang "Tổng quan POS" riêng.

## 02 Bốn bộ phận, thứ tự
1. Banner vàng "Bảng bộ phận chưa lọc theo team", chỉ khi đang chọn team.
2. "Tiến độ tháng · Ba bộ phận theo tháng": Sale, CSKH, Marketing, mỗi bộ phận có số đơn và số đã đạt.
3. "Doanh thu · Sale": số lớn, 3 ô Đơn chốt, Tỷ lệ chốt (badge ✓/▼), AOV.
4. "CSKH": số lớn, "N đơn chốt · AOV" bên phải, ô Tự upsell / Từ MKT.
5. "Marketing": số lớn, "N đơn đã xác nhận", lưới 2×2 ROAS, Chi phí QC, Chi phí / số, Chi phí / đơn chốt, dòng Số về MKT.
6. "Vận đơn": "Tính riêng…", doanh số chuyển đi ở góc phải, bảng có cột Bộ phận cố định.

Bỏ: ô icon, dòng mô tả, mũi tên › trên thẻ (vẫn chạm cả thẻ để mở trang bộ phận), thanh chia Sale/CSKH của Vận đơn. Nút i giữ trên từng thẻ.

## 03 Số liệu & KH
1. Hero "DOANH THU ĐƠN CHỐT": badge so kỳ trước, số lớn, biểu đồ trong kỳ, lưới 2×2 (Đơn tạo mới (khách), Đơn chốt (Tỷ lệ chốt), Giá trị TB đơn (AOV), Giao thành công), ô Chốt nóng.
2. "Mục tiêu tháng · POS": Đã đạt / Mục tiêu (%), thanh, "Mốc cần đạt tới hôm nay", link "Xem KPI ›".
3. Các khối cũ giữ phía dưới: Số tham chiếu Pancake, Xu hướng 30 ngày, Trạng thái đơn, Vận hành đơn, Nhân viên, Mua lại & data, Khách hàng. Các neo của tour team và chamso giữ nguyên.

## 04 Theo POS
1. Hero "DOANH THU THEO POS": badge so kỳ trước, số lớn, mỗi POS một hàng "POS · N chốt / M đơn … tiền". Chạm một hàng để lọc riêng POS đó.
2. "Trong kỳ": biểu đồ đường.

## Tiến độ tháng: cộng KPI team (anh Vũ chọn 13/11/2026)
- KPI tháng của Sale, CSKH, Marketing = tổng KPI các team thuộc bộ phận đó.
  - Nguồn KPI: `/api/targets?month=` (scope `team`, refId = mã team).
  - Bộ phận của team: trường `dept` (sale / cskh / mkt) ở `/api/teams?list=1`, dùng chung bộ nhớ của bảng Team.
  - Không sửa máy chủ, không thêm migration.
- Số đã đạt: số tháng của bảng bộ phận (`/api/reports/sections`, MKT theo `/api/marketing/analytics`), khi đang xem kỳ Tháng này. Kỳ khác thì ghi "Chọn kỳ Tháng này…" và chỉ hiện KPI.
- Tiến độ = đã đạt ÷ KPI cộng, có thanh.
- Mốc tới hôm nay tính như web (`lib/kpi/kpi-pace.ts`): mỗi team KPI ngày = KPI ÷ số ngày làm (trống = số ngày của tháng), nhân số ngày đã qua, rồi cộng các team.
  - Đạt mốc thì "✓ Đúng tiến độ", chưa đạt thì "▼ Chậm tiến độ".
- Bộ phận không có KPI team nào: "—" và chữ nhỏ "Chưa giao KPI".
- Theo POS: team chưa gắn POS (`/api/teams` không có trường POS), nên KPI vẫn cộng theo bộ phận. Khi đang chọn 1 POS, khối ghi rõ đang so số của POS đó với KPI cả bộ phận.
  - **Câu hỏi:** team có gắn POS không, và gắn ở đâu (web nhân sự hay Chia team), để lọc KPI team theo POS.
- Bản ảo: đã có KPI team mẫu cho Sale, CSKH. Thêm KPI mẫu cho 2 team MKT ảo (Hà Nội, Thái Nguyên) ở `lib/demo/mode.ts`, từ doanh thu đơn có marketer của team, chỉ dữ liệu ảo.
- Tour 15 mốc `tong-quan` chờ thêm lượt tải `tien-do-thang`.

## Khối còn "—" vì máy chủ chưa có số
- Doanh thu · Sale: badge so kỳ trước, vì `/api/reports/sections` chưa trả kỳ trước. AOV của Sale cũng chưa có, ô AOV ghi "—".
- CSKH, Marketing: badge so kỳ trước (cùng lý do).
- CSKH: tỷ trọng % Tự upsell / Từ MKT chưa có từ máy chủ, chỉ ghi số đơn và tiền.
- Marketing: dòng "% Chi phí / DT New" chưa có.
- 03: "Mục tiêu tháng" dùng KPI tháng theo POS (Cấu hình). Khung ghi "KPI CSKH" nhưng app không có tổng KPI CSKH cho trang này.

## Tour 15 khi đổi sang nền tối (lượt CI c50bca8)
- Đã soát: không có vòng chờ vô hạn.
  - Chờ số mỗi màn tối đa 80 giây.
  - Chờ mốc màn tối đa 60 giây.
  - Mỗi request hết hạn sau 45 giây.
- Lượt đỏ do máy ảo tắt giữa chừng ("device is not booted"), không do app chờ.
