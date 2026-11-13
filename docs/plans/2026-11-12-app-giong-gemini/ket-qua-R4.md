# Kết quả R4: 05 Đơn hàng, 07 Phòng ban

## 05 Đơn hàng, thứ tự từ trên xuống
1. "Tháng 11/2026", tiêu đề, nút mắt, pill lọc (kỳ, POS). Đã có từ R1.
2. Hero "ĐƠN THEO BƯỚC":
   - số lớn = cộng 5 cột;
   - cột Mới, Xác nhận, Giao vận, Đã giao, Trả hàng có số trên đầu cột, chạm mở danh sách đơn của bước đó;
   - góc thẻ có menu nhỏ "Theo giờ chốt / Theo ngày tạo" (trước là segmented ở đầu trang);
   - dòng phụ: Giao thành công %, đã xuất, tổng đơn chốt. Trước là 2 thẻ riêng; giữ số, gộp thành một dòng.
3. "Đơn cần lưu ý": Chờ chuyển hàng, Đã xác nhận chưa đóng hàng (số ›); Hoàn / trả hàng, Hủy sau khi chốt kèm badge "▲ N (x%)".
   - Màu theo luật: ≥7% đỏ ▲, 5–7% vàng !, <5% xanh ✓.
   - Tỷ lệ = số đơn ÷ tổng đơn chốt trong kỳ, tính trên app từ số của `/api/reports/pipeline`.
4. "Danh sách đơn hàng":
   - ô tìm chuyển vào thẻ (vẫn tìm SĐT, mã, tên như kế hoạch 1.5; tour tìm 11 không đổi);
   - lọc trạng thái Tất cả / Mới / Xác nhận / Giao vận / Đã giao;
   - 8 đơn mới nhất, mỗi đơn 2 dòng (mã · trạng thái · POS; khách · người bán · giờ), tiền và ›;
   - "Xem tất cả ›".

Bỏ:
- segmented "Theo giờ chốt | Theo ngày tạo" ở đầu trang;
- chip POS riêng ở danh sách (POS chọn ở pill lọc);
- 2 thẻ KPI rời;
- SĐT ở dòng đơn trong danh sách gọn (vẫn có ở hồ sơ đơn).

R-POS: số các bước, đơn cần lưu ý, danh sách và tìm tên đều theo POS đang chọn (như trước).

## 07 Phòng ban
- Chỉ có tiêu đề, không nút đầu trang. Đã có từ R1.
- Thẻ Sale, CSKH, Marketing, Vận đơn, Nhân sự theo quyền:
  - tên đậm; Nhân sự có badge "N chờ duyệt";
  - link xanh bên phải: "Sale ›", "Tổng quan CSKH ›", "Phân tích ›", "Xem Vận đơn ›", "Tổng quan ›";
  - lưới 2 cột nút chữ căn giữa có ›.
- Tên nút theo khung:
  - Sale: Tổng quan & so sánh, Data được cấp, Trong ca;
  - CSKH: KPI CSKH, Cuộc gọi, Khách theo NV, Mua lại & Upsell, Khách lâu chưa mua;
  - Nhân sự: Danh sách nhân sự, Sơ đồ tổ chức, Duyệt thay đổi · N (chữ vàng khi có việc chờ), Tuyển dụng.
- Trang trùng với link ở góc (Tổng quan CSKH, Tổng quan Nhân sự) không lặp trong lưới.

Bỏ: icon vuông, dòng mô tả, nút tròn ›.

## Khác khung / chưa có
- Sale: khung có "Từng nhân viên" riêng; app chưa có trang riêng (danh sách nhân viên nằm trong "Tổng quan & so sánh"), nên không thêm nút.
- Marketing: khung có nút "Xếp hạng"; app chưa có đường mở riêng trang xếp hạng (nằm trong trang Marketing), nên Marketing chỉ có link "Phân tích ›".
- CSKH có thêm nút "Khách lâu chưa mua" (khung không có), giữ vì là trang có sẵn.
- Không có khối số nào phải hiện "—".
