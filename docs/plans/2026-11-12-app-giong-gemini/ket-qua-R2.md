# Kết quả R2: 01 Hôm nay, 14 Thông báo

## 01 Hôm nay (Trang chủ), thứ tự từ trên xuống
1. Dải mảnh "Mọi POS · từ 0h đến HH:MM · ● Đồng bộ OK".
2. Thẻ hero "DOANH THU HÔM NAY":
   - dòng nguồn ("Tổng thống kê Pancake · N POS");
   - vòng tỷ trọng theo POS bên trái, số lớn, "N đơn chốt · K POS", "Hôm qua cả ngày";
   - ô từng POS (doanh thu, số chốt);
   - nút (i) vuông mở bảng giải thích.
3. "Theo bộ phận": Sale, CSKH, Marketing. Mỗi hàng có badge so cùng giờ hôm qua, số tiền, 2 thanh "Hôm qua cùng giờ" / "Giờ này". Nút (i) gom cách tính các bộ phận.
4. "MKT hôm nay": lưới 2×2 (Số về, Chi phí QC, CP / số, CP / đơn) và nút › vuông.
5. "Vận đơn hôm nay": ô Doanh số chuyển đi (số đơn chuyển đi), ô "Đơn vào Chờ xác nhận: N" và "Đã XN · Chờ · Không XN"; nút › vuông.
6. "Cần xử lý · N": hàng một dòng có ›, link "Xem tất cả ›".
7. "Lối tắt": thẻ có lưới 4×2 nút icon.
8. "Ca đang chạy": 3 ô (Số đã nhận, Số đã chốt, Chốt nóng) và top 3 NV, link "Xem ca ›".

Đã bỏ:
- 4 ô nhỏ Sale, CSKH, Marketing, Doanh số chuyển đi kiểu cũ.
- Nút mắt riêng trong thẻ (nay ở đầu trang).
- Vòng Vận đơn có chú giải.

## 14 Thông báo, thứ tự từ trên xuống
1. "‹ Trang chủ", tiêu đề, nút vuông làm mới.
2. Hero "CẦN XỬ LÝ": vòng "N nhóm", "N việc", 4 dòng đếm (Đơn hàng, Chăm sóc, Nhân sự, Đồng bộ). Dòng Chăm sóc chỉ hiện với tài khoản xem được CSKH.
3. "Ưu tiên": Đơn mới chưa chốt, Khách quá 20 ngày chưa ghi chú, Yêu cầu nhân sự chờ duyệt, Đồng bộ lỗi / chậm. Các POS lỗi / chậm gom vào **một** hàng (cả ở Trang chủ và số trên chuông).
4. "Trong ca": % chốt nóng, số đã nhận / đã chốt, cảnh báo trong ca, nút "Điều hành trong ca ›".
5. "Đồng bộ Pancake": mỗi POS một hàng ✓ / ! / ? kèm giờ đồng bộ hoặc lỗi, nút "Tải lại".

## Khối chưa có số ("—" / bỏ)
- Thẻ Trong ca ở Thông báo: khung có "Còn lại: N · Còn đơn cần liên hệ lại". API ca chưa trả số này nên không hiện, không tự tính.
- Mọi khối khác dùng số API có sẵn. Thiếu số thì hiện "—" như trước.

## Lượt iOS preview đỏ ở db478b0 (đoạn 13, "loi-tai khi chờ sale-trong-ca")
- Mốc loi-tai đến từ `waitTeam` trong tour team. Vòng trang loi chú (thong-bao … cskh-cau-rieng) không chờ gì, nên app chạy trước workflow. Lần chờ hết hạn thật là chờ danh sách team (`TeamTourStatus.listReady`) sau lần chạm "team-mo" cuối, lúc đang ở trang Vận đơn. Workflow thấy dòng đó khi mới chờ tới mốc sale-trong-ca.
- Lúc đó web ảo rất chậm: van-don 45 giây rồi lỗi; marketing/analytics 72 giây; route khác 17–30 giây. Request `/api/teams?list=1` xếp hàng sau các request nặng của hàng loạt trang vừa mở, không về kịp 40 giây.
- Soát code R2 (Hôm nay, Thông báo): không thêm request nào. Hôm nay vẫn 5 nguồn như cũ, Thông báo vẫn `alerts.refresh` như cũ, request huỷ theo `.task` khi rời màn như cũ. Chưa đọc được log đầy đủ trên PC (gh chưa đăng nhập), nên phần "web ảo chậm" là theo log anh tổ app gửi.
- Chỗ gọi trùng tìm được và đã sửa ở app:
  - Mỗi lần mở bảng Team đều hỏi lại `/api/teams?list=1`. Tour mở 4 lần.
  - Khi pill lọc ở trang gốc Tổng quan và ở trang con cùng sống, một lần chạm mở hai bảng Team, mỗi bảng một request.
  - Sửa: `HrTeamCache` dùng chung danh sách team trong lần đăng nhập. Trong 5 phút không hỏi lại; nhiều bảng cùng lúc thì chờ chung một request; kéo để làm mới thì hỏi lại; đổi tài khoản thì bỏ.
- Không tăng thời gian chờ, không đổi workflow.

## Kiểm
- Tour 15 không đổi mốc: hom-nay, thong-bao vẫn chụp như R1. Thông báo mở ở tab Trang chủ.
- Không thêm trường API, không đổi DecodeSelfTest.
