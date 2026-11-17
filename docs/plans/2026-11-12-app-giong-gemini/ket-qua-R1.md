# Kết quả R1: khung chung

## Đã đổi
- Đầu tab gốc (`TabHeader`, `TabPage`):
  - dòng nhỏ trên tiêu đề lớn: "Chào buổi sáng, … · Thứ …" ở Hôm nay; "Tháng MM/yyyy" (hoặc tên kỳ) ở Tổng quan, Đơn hàng;
  - nút vuông bo 12pt có nền: Hôm nay có làm mới/đồng bộ, mắt, chuông; Tổng quan, Đơn hàng chỉ có mắt; Phòng ban, Thêm không có nút.
- Màn con (`ChildHeader` + `childChrome()`): Sale, CSKH, Marketing (`DeptPage`), Vận đơn, Theo POS, Thông báo.
  - Ẩn nav bar; breadcrumb xanh "‹ <tab>" bấm để quay lại; vuốt mép trái vẫn quay lại.
  - Nút mắt bên phải (Thông báo không có).
- Lọc: `ScopeFilterPill` rộng hết màn, mở bottom sheet chọn kỳ, POS, nhóm đơn, team. Đầu sheet ghi phạm vi đầy đủ (kỳ, ngày, POS).
  - Thay dải chip và dòng "Đang xem…" ở: Tổng quan, Theo POS, Đơn hàng, Vận đơn, Marketing, Tổng quan CSKH, So sánh nhân viên, Cuộc gọi, Data.
- Segmented (`MTSegmentedControl`, `SubNav` ≤3 mục): phần chọn tô đặc, xanh ở nền tối, trắng ở nền sáng; các phần bằng nhau.
- Tab bar: `UIDesignRequiresCompatibility` để tab bar phẳng, rộng hết màn, dính đáy (không còn thanh nổi viên thuốc khi dựng bằng SDK iOS 26).
- Safe area: dải nền che vùng giờ/pin khi cuộn (tab gốc và màn con).
- Thông báo thuộc tab Trang chủ: chuông và ô đồng bộ mở Thông báo ở tab Trang chủ. Tour 15 mốc `thong-bao` cũng mở ở tab Trang chủ.

## Giữ nguyên
- Lớp lấy số, đăng nhập, Face ID, quyền xem, bộ lọc chung (AppNav).
- Đủ mốc `[UI] moc=` của đoạn 15; tour khác (kypos, chamso, team, mktnv, tìm) đặt bộ lọc thẳng vào AppNav nên không phụ thuộc chip cũ. Tour team vẫn mở được bảng Team qua pill (`team-mo`).

## Để bước sau
- Trang phụ ở Thêm (16A–H) vẫn dùng nav bar: R7.
- Nút mắt mới che số ở các thẻ đã đọc `thp_hide_money` (Hôm nay, Vận đơn, CSKH, POS); các màn khác theo từng bước R2–R7.
- R1 không thêm khối số mới nên không có khối "—".
