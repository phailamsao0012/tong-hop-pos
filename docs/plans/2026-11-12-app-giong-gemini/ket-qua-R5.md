# Kết quả R5: 08A Sale, 09A1 Từng nhân viên, 10 Một nhân viên

## Quy tắc màu
- Tỷ lệ chốt Sale: dưới 40% đỏ ▼, từ 40% xanh ✓ (`MTRateBadge`, trước là 42%; dòng ngưỡng ở trang KPI Sale cũng đổi thành 40%).
- Hoàn: ≥7% đỏ ▲, 5–7% vàng !, dưới 5% xanh ✓ (không đổi).
- Hủy: ≥5% đỏ ▲, dưới 5% xanh ✓ (badge "Hủy sau khi chốt" ở Đơn hàng).

## 08A Sale, thứ tự từ trên xuống
1. "‹ Phòng ban", tiêu đề Sale, nút mắt, pill lọc (kỳ, POS, team).
2. Segmented Nhân viên / Data / Trong ca nằm ngay dưới pill.
3. Hero "DOANH THU CHỐT · SALE": badge so kỳ trước, số lớn, số đơn chốt, 2 thanh Kỳ trước / Kỳ này.
4. Mỗi nhóm sản phẩm một bảng Nhân viên | Đơn chốt | Doanh thu, có dòng Tổng. Chạm số mở giải thích như trước.
5. "Hiệu suất đội ngũ":
   - lưới 2×2: Tổng nhân sự, Tổng đơn chia / chốt, Trung vị tỷ lệ chốt, Nổi bật · tên (badge);
   - 10 hàng nhân viên "Tên · chốt/chia … tiền ✓/▼ %", chạm mở trang một nhân viên.
6. Nút đầy "So sánh nhân viên ›", mở "Từng nhân viên".
7. Bảng nhân viên theo nhóm sản phẩm / so cùng kỳ (`StaffTableBlock`) giữ ở cuối. Khung không có, nhưng xác nhận kho (đoạn 12) và team (đoạn 13) dùng bảng này.

Bỏ khỏi trang Sale, chuyển sang "Từng nhân viên": định nghĩa dài ở đầu, thẻ KPI rời, thẻ nhân viên nổi bật, biểu đồ thanh 15 người, biểu đồ chấm, 3 khối xếp hạng, bảng chi tiết.

## 09A1 Từng nhân viên
- Mở từ nút "So sánh nhân viên ›" ở trang Sale, hoặc nút "Từng nhân viên" ở thẻ Sale trang Phòng ban (mới thêm). Route `.dept(.sale, page: "staff")`, lưu được để mở lại.
- "‹ Sale", tiêu đề "Từng nhân viên", pill lọc.
- Nội dung là toàn bộ phần phân tích cũ: hero doanh thu, KPI đội, bảng chi tiết cột đầu cố định (Doanh thu, Tỷ lệ chốt, Đơn chia, Đơn chốt, AOV, Kỳ trước), xếp hạng, biểu đồ.
- Không tải lại bảng nhóm sản phẩm và `StaffTableBlock` (đã có ở trang Sale).
- Khung có nút "So cùng kỳ ›" mở 09B; app đang để phần so cùng kỳ (`StaffTableBlock`) ở trang Sale. Chưa có trang 09B riêng.

## 10 Một nhân viên
- "‹ Phòng ban · Sale", tiêu đề "Tên · Sale", nút mắt, pill lọc. Đổi kỳ / POS ở pill thì tải lại số của người đó; trước đây kỳ cố định theo trang vừa bấm.
- Thẻ "TỶ LỆ CHỐT":
  - badge tỷ lệ (Sale dưới 40% đỏ), "N đã chốt / M đơn chia", so kỳ trước;
  - bên phải "Doanh thu chốt" số lớn, AOV, số SĐT;
  - nút đầy "Xem đơn chốt (N) ›";
  - 2 ô Đơn chia, Đơn tạo (chạm mở danh sách như trước).
- "Trạng thái đơn chia (Chưa chốt)": "Chưa chốt · N đơn", thanh 2 màu, ô Mới / Hủy (chạm để lọc), dòng đã chốt / tổng.
- "Lý do chưa chốt (N đơn)":
  - hàng lý do kèm "Mới a · Hủy b" (chạm để lọc), hàng "Thẻ khác trên đơn chưa chốt";
  - rồi các đơn "Đơn #mã · trạng thái" / "POS · marketer · giờ · lý do", tiền và ›.
- Bỏ: thẻ avatar riêng, lưới ô rời, dòng "Đang xem…".
- Hành trình làm việc, huy hiệu (chỉ chủ hệ thống) giữ ở cuối.

## R-POS
- Mọi số theo POS chọn ở pill: Sale, Từng nhân viên (`/api/reports/overview`, `product-groups`), một nhân viên (`staff-detail`).

## Tour 15
- Mốc `sale` chụp trang Sale (08A).
- Mốc `nhan-vien` chụp "Từng nhân viên" (09A1), mở chồng lên trang Sale.
- Mốc `nhan-vien-mot` chụp trang một nhân viên (10).
- Lệnh "nv-mo" chỉ trang trên cùng xử lý (trang Sale nằm dưới không mở thêm).

## Không có khối "—" mới.
