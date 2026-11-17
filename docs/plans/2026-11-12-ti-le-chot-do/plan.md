# Tỉ lệ chốt dưới 40% tô đỏ ở mọi nơi (anh Vũ 12/11/2026)

Yêu cầu (nguyên văn): "sale dưới 40% là đỏ nhé, tỉ lệ chốt ấy, bất kì ở đâu cũng đỏ, ở mkt mà có sale chốt thấp cũng đỏ".

**Trạng thái: đang lên plan, chưa chốt, chưa code.** Người làm: Claude.

## Quy tắc

- Mọi ô hiện **tỉ lệ chốt** (TL chốt, TL XN cũ, Tỉ lệ chốt, % chốt) có giá trị **< 40%** thì chữ màu đỏ (`text-bad`).
- Áp ở mọi trang: Tổng quan, Sale, CSKH (nếu có tỉ lệ chốt), Marketing (bảng gộp, Xếp hạng marketer / team, bảng chéo Team Sale × Team MKT), Hồ sơ nhân sự, KPI, Giao việc, Báo cáo cuối tháng, app trên web điện thoại.
- Ở Marketing: ô tỉ lệ chốt của marketer / team MKT / cặp Team Sale × MKT dưới 40% cũng đỏ.
- Đúng 40% là không đỏ. Ô không có số (`—`) không tô.
- Dòng Tổng cũng áp quy tắc.
- Rê chuột vào ô đỏ: "Dưới mức 40%".

## Thêm 12/11 16:55: tỉ lệ hoàn, tỉ lệ hủy của Sale

Anh Vũ: "sale thì hoàn 7% đổ lên đỏ, hủy 5% đổ lên đỏ, ở tất cả nhé".

- **Tỉ lệ hoàn ≥ 7%** thì đỏ. **Tỉ lệ hủy ≥ 5%** thì đỏ. Ngưỡng có dấu "≥": đúng 7% / 5% là đỏ.
- Áp cho Sale và cho mọi bảng có tỉ lệ hoàn / hủy của đơn Sale chốt, ở tất cả các trang:
  - Sale, Tổng quan, Vận đơn;
  - Marketing (bảng Xếp hạng marketer, bảng chéo Team Sale × MKT, chi tiết marketer);
  - KPI, hồ sơ.
- Mẫu số theo định nghĩa đã chốt: tỉ lệ hoàn / hủy chia cho **Đơn đi**. Bảng nào cũ đang chia mẫu khác thì ghi rõ trong tooltip, không đổi số cũ khi chưa hỏi anh.
- Thêm vào `lib/shared/close-rate.ts`:
  - `RETURN_RATE_RED = 0.07`, `CANCEL_RATE_RED = 0.05`;
  - `returnRateClass`, `cancelRateClass`;
  - có test ở 6,99% / 7% và 4,99% / 5%.

## Cách làm

1. `lib/shared/close-rate.ts`: `CLOSE_RATE_RED = 0.4` và `closeRateClass(rate: number | null)` trả `'text-bad'` hoặc `''`. Tỉ lệ nhận dạng 0–1 hoặc 0–100, có tham số ghi rõ.
2. Tìm mọi chỗ hiện tỉ lệ chốt (`closeRateOf`, `closeRateOfMany`, `confirmationRate`, `rate`, `stageRate`, `TL chốt`…) trong `app/` rồi gắn `closeRateClass`.
   - Không đụng các tỉ lệ khác: tỉ lệ giao, hoàn, hủy, đi.
3. Nếu đã có ngưỡng màu cũ cho tỉ lệ chốt (ví dụ theo `target_rate` ở KPI) thì ngưỡng 40% đứng trên. Ô dưới 40% luôn đỏ, kể cả khi KPI tô màu khác.
4. Test:
   - `closeRateClass` ở 0,399 / 0,4 / null.
   - Một test quét `app/`: mọi `<td>` có dùng hàm tỉ lệ chốt phải có `closeRateClass`.
5. Chụp ảnh các trang có tỉ lệ chốt gửi anh. Gom vào đợt khởi động lại PC.

## Câu hỏi

- Ngưỡng 40% có cần sửa được trong Cấu hình không, hay cố định? Đề xuất: cố định 40%, sau này muốn đổi thì nói, tôi đổi một chỗ.
