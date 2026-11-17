# Báo cáo tổng quan cho sếp qua Zalo (plan, anh Vũ 14/11/2026)

Yêu cầu: "báo cáo cho sếp đặc biệt hơn, vì là báo cáo tổng quan, phải xem được toàn công ty: Sale, CSKH, MKT;
tạo ảnh cho sếp xem phải rõ ràng, chi tiết". Trạng thái: CHỜ ANH CHỐT MẪU, chưa code.

## Hiện trạng
- Người nhận loại `boss` (zalo_contacts.kind='boss') đang nhận ảnh gộp ca 12h/17h/22h (app/zalo-slot-image.tsx):
  chỉ là danh sách doanh số từng team + luỹ kế, không chia bộ phận, không có tỉ lệ, chi phí, KPI, POS.
- Ảnh vẽ bằng next/og (satori), lưu tạm 3 ngày ở app_settings `zalo_img:<mã>`, Zalo tải qua /api/zalo/anh/<mã>.
- Zalo của anh Chủ Hai đang gắn nhầm vào dòng "Leader Cũ – Leader Team 2" (team đã không còn → báo cáo rỗng 0 tr).

## Mẫu ảnh đề xuất (khổ điện thoại, rộng 1080px, chữ to, mỗi ảnh vừa 1–2 lần vuốt)
Ảnh luôn GIAO DIỆN SÁNG (anh Vũ 14/11: "giao diện sáng, không phải giao diện tối"): nền trắng, chữ đậm tối, màu
xanh/đỏ như web sáng; không đổi theo chế độ tối của điện thoại hay của web.
Ảnh 1 – TỔNG QUAN CÔNG TY
1. Đầu ảnh: "MEGATECH · Báo cáo tổng quan · 12h thứ Bảy 14/11 · số từ 0h tới 12h · tất cả POS".
2. 3 SỐ LỚN dễ nhìn nhất (anh Vũ 14/11): Doanh thu SALE · Doanh thu CSKH · Doanh thu MKT, mỗi số kèm so cùng giờ
   hôm qua. Tổng công ty, đơn chốt, TB đơn để dòng nhỏ bên dưới.
   Thẻ MKT (DT New) ở hàng 3 số lớn có thêm dòng SỐ ĐƯA VỀ (anh Vũ 14/11, ảnh mẫu): "Số đưa về 1.084 · KPI 1.200 ·
   −116" ngay dưới dòng KPI doanh thu, thiếu đỏ / dư xanh; thẻ Sale và CSKH giữ cùng chiều cao.
   Lưu ý: DT MKT = doanh thu đơn từ data MKT (ai chốt cũng tính), nên trùng một phần với DT Sale/CSKH; ghi rõ dưới số.
3. KPI tính THEO TỪNG BỘ PHẬN (anh Vũ 14/11): mỗi bộ phận Sale / CSKH / MKT có
   - KPI tháng của bộ phận, luỹ kế tháng, % đạt (thanh tiến độ);
   - KPI ngày của cả bộ phận (KPI tháng chia đúng số ngày trong tháng) và hôm nay đạt bao nhiêu % KPI ngày;
   - nhanh/chậm so với tiến độ, cần mỗi ngày còn lại bao nhiêu.
   KPI bộ phận = cộng KPI người/team của bộ phận đó (đã nhập ở trang KPI); MKT tính theo DT New.
   MKT thêm SỐ ĐƯA VỀ và KPI SỐ (anh Vũ 14/11): "số đưa về" = số SĐT khác nhau từ data MKT trong kỳ (đúng con số
   "Số (SĐT khác nhau)" ở trang Marketing). KPI số đặt theo tháng (team MKT / từng marketer), chia đều từng ngày theo đúng
   số ngày trong tháng như KPI doanh thu; ảnh hiện: số đưa về hôm nay / KPI số ngày (% đạt), luỹ kế tháng / KPI số tháng,
   nhanh/chậm so với tiến độ.
   Bố cục khối MKT (anh Vũ 14/11, xem ảnh mẫu): thẻ lớn chính vẫn là DOANH THU (DT New, thanh KPI doanh thu hôm nay,
   dòng tháng / KPI tháng, so tiến độ); thẻ SỐ ĐƯA VỀ đặt NGAY BÊN CẠNH, cùng cỡ, cùng kiểu (số tới giờ báo cáo, thanh
   KPI số hôm nay, thiếu/dư so KPI ngày, dòng tháng / KPI số tháng, so tiến độ). Hàng dưới: Chi phí QC · Chi phí/số ·
   ROAS · %CP/DT New.
   Hiện CHƯA có chỗ nhập KPI số cho MKT: thêm trường `leads` vào KPI2 (lib/kpi/kpi2.ts, app_settings target_kpi2:<tháng>,
   không cần migration) và ô nhập ở trang KPI cho team MKT và từng marketer. Chưa đặt thì ảnh ghi "chưa đặt KPI số".
4. Ba khối bộ phận, mỗi khối 1 hàng thẻ:
   - SALE: DT New · đơn chốt · tỉ lệ chốt (dưới 40% đỏ) · tỉ lệ hoàn (≥7% đỏ) · tỉ lệ hủy (≥5% đỏ) · % KPI.
   - CSKH: DT CSKH · đơn chốt · tỉ lệ chốt · % KPI · số khách gọi/chăm.
     CSKH có chia team (anh Vũ 14/11: "cskh mà chia team thì cũng phải rõ từng team"): ngay dưới khối CSKH có
     từng team CSKH một dòng: DT · đơn chốt · tỉ lệ chốt · % KPI team, ô đỏ theo ngưỡng. Sale làm giống vậy.
   - MKT: chi phí QC · DT MKT · ROAS · CP/đơn New · %CP/DT New · số data (SĐT).
5. Theo POS: bảng nhỏ từng POS: doanh thu · đơn · so hôm qua (chỉ POS có số).

Ảnh 2 – CHI TIẾT & CẢNH BÁO
1. Bảng team Sale: DT · đơn · tỉ lệ chốt · % KPI, xếp từ cao xuống, ô đỏ theo ngưỡng.
2. Bảng team CSKH: tương tự.
3. Bảng team MKT: chi phí · DT · ROAS · tỉ lệ chốt của data.
4. Top 3 người (Sale, CSKH, MKT) và "cần kèm" (chốt thấp nhất có từ 20 số trở lên).
5. Cảnh báo (tối đa 6 dòng): team tỉ lệ chốt <40%, hoàn ≥7%, hủy ≥5%, MKT chi mà không ra đơn, việc quá hạn,
   POS không đồng bộ.
Kèm 1 tin chữ ngắn (5–6 dòng) làm bản dự phòng khi Zalo không tải được ảnh.

## Anh Vũ đã trả lời (14/11 08:45)
1. Giờ gửi: giữ 8h, 12h, 17h, 22h.
2. Tách 2 ảnh.
3. Ghi tên người Sale chốt thấp: có (ảnh 2, mục "Cần kèm" và dòng cảnh báo).
4. Người nhận: anh Chủ Hai và anh Vũ (2 người).
5. Chỉ số: đủ, không thêm/bỏ.
6. Người không thuộc team nào: gom vào 1 hàng riêng ("Ngoài team") ở mọi bảng team Sale / CSKH / MKT.
7. 14/11 08:49: CHỐT MẪU 2 ảnh (https://claude.ai/artifact/TyXGkhnrCa3f3NpneSPsMs); đồng ý nối Zalo anh Chủ Hai
   vào "báo cáo sếp" và tắt dòng "Leader Cũ – Team 2" (sao lưu trước).
8. Đặt KPI qua bot Zalo: có cả đặt theo NGÀY và theo THÁNG; đặt theo tháng thì tự chia đều từng ngày của tháng đó.
   Đặt được cho cả bộ phận, cho 1 team, cho 1 người. Bot trả bản xem trước, "OK" mới lưu; chỉ Zalo nối "báo cáo sếp".

## Phần việc
A. Ảnh báo cáo sếp (2 ảnh) + gửi 8/12/17/22h cho người nhận kind 'boss'.
B. KPI số MKT: trường `leads` trong KPI2 (team MKT + từng marketer), ô nhập ở trang KPI.
C. Lệnh bot Zalo đặt/xem KPI (doanh thu, số) theo ngày/tháng, có xác nhận, lưu vết.
D. Dữ liệu: nối Zalo anh Chủ Hai vào dòng boss, tắt dòng Team 2 cũ (sao lưu zalo_contacts trước).

## Quy tắc số (giữ như web)
- Đã chốt là chốt (ngày xác nhận); hoàn/hủy là tỉ lệ riêng, tính trên đơn đi.
- KPI chia theo đúng số ngày trong tháng; MKT tính theo DT New.
- Không dùng số AI; mọi số tính lại từ đơn gốc như trang Điều hành.

## Lịch gửi đề xuất
- 8h: số trọn ngày hôm qua + tháng.
- 12h / 17h / 22h: số từ 0h tới giờ đó + tháng.
- Bật/tắt từng ca ở Cài đặt báo cáo → "Báo cáo cho sếp" (đã có mục boss).

## Các bước làm (sau khi anh chốt mẫu)
1. lib/zalo/boss-report.ts: gom số (dùng lại hàm của Điều hành, Sale, CSKH, Marketing; không viết SQL mới nếu đã có).
2. app/zalo-boss-image.tsx: vẽ 2 ảnh theo mẫu đã chốt.
3. zalo-tick: ca của sếp gửi 2 ảnh mới thay ảnh gộp cũ; người nhận kind 'boss'.
4. Test: số trong ảnh khớp trang Điều hành cùng giờ; ngưỡng đỏ; team không có số; ngày đầu tháng.
5. Lên bản thử chụp ảnh gửi anh, anh ok mới lên web thật (build ở thư mục riêng, không build đè thư mục đang chạy).
6. Nối Zalo anh Nghĩa vào dòng "báo cáo sếp", tắt dòng Team 2 cũ (sao lưu trước, anh ok mới làm).

## Rủi ro
- Ảnh quá dài khó đọc trên điện thoại → tách 2 ảnh, giới hạn số dòng mỗi bảng (team nhỏ gộp "các team khác").
- Ảnh vẽ chậm/lỗi → luôn gửi kèm tin chữ.
- Quay lại: tắt "Báo cáo cho sếp" mới ở Cài đặt báo cáo là về ảnh gộp cũ.
