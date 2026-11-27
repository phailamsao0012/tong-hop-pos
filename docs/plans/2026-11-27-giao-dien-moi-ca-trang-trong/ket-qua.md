# Giao diện mới cả trang trong: kết quả (27/11/2026)

Chỉ có hiệu lực khi cờ `THP_UI_MOI` bật (prop `uiMoi` từ `app/dashboard.tsx`). Cờ tắt: mọi trang vẽ đúng cây JSX cũ (kiểm bằng cách dán ngược khối chung `// [khối chung]` vào bố cục cũ rồi so với commit trước).

## Linh kiện dùng chung (`app/trang-moi.tsx`, `app/ui-kit.tsx`)
- `PageHeadMoi`: đầu trang một dòng. Hàng POS chỉ nằm cùng dòng khi đủ chỗ, không đủ thì xuống dòng riêng, không cắt.
- `CanXemStrip`: dải "Cần xem" một dòng, tối đa 4 nhãn (điện thoại 1 nhãn), còn lại là "+N mục khác". Mốc: Sale chốt < 40%, hoàn ≥ 7%, hủy ≥ 5%, xét POS hoặc người khi có từ 20 số.
- `tileGrid(n)`, `KPI_TIGHT`: một hàng ô số không ô trống, ghi chú tối đa 2 dòng.
- `DuoSpark`: đường nhỏ kỳ này / kỳ trước.
- `WhySheet`: khung giữa màn "Vì sao ra số này".
- `WhyTile`: ô bấm là lọc như cũ, nút "i" ở góc (chỗ biểu tượng) mở WhySheet.
- `FoldBlock`, `scrollToAnchor`: khối phụ thu gọn; bấm số trỏ tới khối đang thu gọn thì tự mở rồi cuộn tới.

## Trang đã dựng lại
- Đợt 1, Sale / CSKH: Tổng quan Sale, Tổng quan CSKH, Theo team, Nhân viên, Phân tích Sale, Chất lượng khách, Lý do hoàn, Tăng trưởng, Phân tích CSKH, Tự ups & từ MKT, Cuộc gọi, Trong ngày · chốt nóng, KPI Sale / KPI CSKH, Khách theo nhân viên, Hồ sơ nhân sự.
- Đợt 2: Tổng quan Marketing, Chi phí & ROAS, Tổng quan Vận đơn, Vận hành đơn, Tổng quan POS, Sản phẩm.
- Đợt 3: Khách hàng 360, Hồ sơ khách, Khách lâu chưa mua, Mua lại & Upsell, Báo cáo cuối tháng, Báo cáo tùy chỉnh, Doanh thu ngoài hậu tố, Giao việc, Họp, Danh bạ Zalo, Chat, Cài đặt báo cáo, KPI team, Nhật ký hoạt động, Bảo mật, Đơn nguồn, Cài đặt (Cấu hình).
- Chung: menu ngang ở 1366 gọn lại; ô tìm không bị kính lúp đè chữ; nút POS đang chọn không nền đen.

## Điểm còn khác bản cũ (khi cờ bật)
- Khối phụ (theo POS, cuộc gọi, xu hướng, gợi ý, cách tính…) thu gọn, bấm mới mở, chưa mở thì chưa tải số.
- Một số ô gộp hoặc dời vào khung "Vì sao":
  - Sale: "DT đóng hàng trở đi" nằm trong khung của ô Doanh thu; "Số được chia" nằm trong ô Tỷ lệ chốt.
  - CSKH: "Từ MKT" gộp vào ô Tự upsell.
  - Vận đơn: phần ghi chú dài của ô nằm trong khung.
- Danh sách hiện cạnh hoặc dưới bảng ở bản cũ nay mở ở khung giữa: khách của một Sale (Chất lượng khách), đơn (Tự ups & từ MKT, Doanh thu ngoài hậu tố, Đơn nguồn), ghi chú khách (Khách theo nhân viên), hồ sơ khách (Hồ sơ khách).
- Hồ sơ nhân sự: màn rộng tự mở người đầu danh sách; "Thành tích tốt nhất" thay bằng hàng ô số.
- Tổng quan POS có 2 hàng số: Doanh thu công ty, rồi hàng ô trạng thái đơn.
- Trang không có tỷ lệ chốt / hoàn / hủy thì không có dải "Cần xem": Lý do hoàn, Tăng trưởng, Phân tích CSKH, Tự ups, Cuộc gọi, Khách hàng, KPI team.
- Sản phẩm: "Cần xem" dùng mốc hoàn 7%, bảng cũ vẫn tô đỏ từ 8%.
- Chat: chiều cao 100dvh − 14rem (ước tính).
- Màn 2560 còn khoảng 80px mỗi bên do khung chung tối đa 2400px (luật vừa màn 2K của web thật).
