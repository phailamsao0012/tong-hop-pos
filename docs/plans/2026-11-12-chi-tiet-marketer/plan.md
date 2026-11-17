# Chi tiết từng marketer: số của marketer + từng Sale chốt cho marketer đó (anh Vũ 12/11/2026)

Yêu cầu (nguyên văn): "tôi muốn xem chi tiết từng người mkt, ví dụ mkt a hôm nay có bao nhiêu đơn, doanh thu bao nhiêu, tỉ lệ chốt bao nhiêu, bạn sale a chốt cho doanh thu bao nhiêu, tỉ lệ chốt bao nhiêu, aov,.... bạn sale b .... mỗi bạn đấy có kí hiệu ở pos nào,....".

**Trạng thái: anh Vũ chốt 12/11 16:39. Chưa code.** Người làm: Claude.
- Bấm tên marketer mở khung chi tiết; hồ sơ làm việc là một nút trong khung.
- Ký hiệu POS: SVG (Siêu Vô Gạo), APEX (MGT - APEX), TS (Thủy sản), BN (Bio Nano), ROOT (Megaroot), OXY (Oxytetra).

## Kết quả cần có

### Cách mở

Bấm tên marketer ở bất kỳ bảng Marketing nào (bảng gộp, Xếp hạng marketer, bảng chéo) để mở **khung "Chi tiết marketer"** (ngăn trượt bên phải; điện thoại: toàn màn hình).
- Hiện nay bấm tên đang mở hồ sơ làm việc. Hồ sơ vẫn giữ, có nút "Hồ sơ" ở đầu khung.
- Lọc kỳ có sẵn: Hôm nay · Hôm qua · 7 ngày · Tháng này · theo kỳ đang chọn trên trang.
- Theo quy tắc POS: chỉ tính POS đang chọn.

### Phần 1: số của marketer (một hàng ô số)

- Data mới (SĐT)
- Đơn tạo
- Đơn chốt
- TL chốt (đỏ nếu < 40%)
- Doanh thu: DT New · DT CSKH
- AOV
- Đơn đi · Tỉ lệ đi · Tỉ lệ hoàn · Tỉ lệ hủy
- Chi phí · ROAS · CP/đơn (chi phí chỉ hiện ở phần marketer, theo quy tắc chi phí của MKT)
- So với kỳ trước (mũi tên ▲▼ nhỏ)

### Phần 2: bảng "Sale chốt cho marketer này"

Mỗi dòng là một Sale, tính theo **người bấm xác nhận đơn** như đã chốt.

- **Cột:** Sale (+ ký hiệu POS) | Team Sale | SĐT nhận | Đơn chốt | TL chốt (đỏ < 40%) | Doanh thu | AOV | Đơn đi | Tỉ lệ đi | Tỉ lệ hoàn | Tỉ lệ hủy | % DT của marketer.
- **Ký hiệu POS cạnh tên mỗi Sale:** chip ngắn theo POS mà tài khoản đó thuộc, ví dụ `BN` Bio Nano, `SVG` Siêu Võ Gạo, `OXY` Oxytetra, `TS` Thủy sản. Màu chip theo màu POS đang dùng ở thanh chọn POS. Một người có tài khoản ở nhiều POS thì tách thành các dòng theo từng POS, gom lại dưới tên người, có tổng.
- **Dòng riêng:**
  - "Chưa xác nhận" (đơn tạo nhưng chưa ai xác nhận, chỉ đếm SĐT / đơn tạo theo Sale được gán).
  - "Người xác nhận ngoài team Sale".
- **Dòng Tổng** = số của marketer ở Phần 1.
- Sắp xếp được theo mọi cột. Mặc định theo Doanh thu.
- Bấm số đơn thì mở danh sách đơn (dùng lại `/api/marketing/orders`).

### Phần 3 (nhỏ): theo ngày

Khi kỳ dài hơn 1 ngày, có bảng nhỏ thu gọn, mỗi dòng là 1 ngày: đơn, DT, TL chốt. Mặc định đóng.

## Cách làm

1. **API mới `/api/marketing/marketer-detail?marketerId&start&end&posIds&basis`:**
   - Một lượt đọc `GROUP BY pos_id, first_confirmed_by` cho đơn của marketer trong kỳ.
   - Đơn chưa xác nhận đếm theo `seller_id`.
   - Một lượt cho kỳ trước.
   - Một lượt theo ngày.
   - Dùng bảng tính sẵn nếu có (`stats_daily_mkt`), không quét đơn gốc quá nhiều.
2. **Ký hiệu POS:** thêm `short` vào danh sách POS (`lib/shared/report-model.ts` → `POS`).
3. **UI:** `app/mkt-marketer-detail.tsx`, dùng `Th` tự co giãn, `closeRateClass`, chip POS.
4. **Test:**
   - Tổng các dòng Sale = số marketer.
   - Tách dòng theo POS cộng lại đúng.
   - Định nghĩa đơn đi / hoàn / hủy giống bảng Xếp hạng.
5. **Kiểm trên DB thật** (bản thử PC): chọn một marketer hôm nay, số khớp bảng Xếp hạng marketer cùng kỳ. Chụp ảnh gửi anh.

## Câu hỏi

1. Bấm tên marketer: mở khung chi tiết này (đề xuất) hay vẫn mở hồ sơ như hiện nay, còn khung chi tiết mở bằng nút riêng?
2. Ký hiệu POS: dùng chữ tắt (BN, SVG, OXY, TS…) hay anh có ký hiệu riêng đang dùng trong công ty?
