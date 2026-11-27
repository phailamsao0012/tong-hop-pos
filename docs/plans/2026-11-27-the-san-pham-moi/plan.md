# Thẻ sản phẩm mới và bấm thẻ ra chi tiết

Anh Vũ duyệt 27/11/2026 8h38: "ok plan thẻ sản phẩm mới, sao lưu, tính lại thẻ ban đêm, build và lên web thật".

## Mục tiêu
1. Bộ thẻ nhóm đơn theo đúng hàng đang bán của từng POS; tắt thẻ SK GK (đã ngừng bán).
2. Bấm một thẻ thì ra chi tiết của thẻ đó.

## Không đổi
- Tổng doanh thu, tổng đơn, cách tính doanh thu, TL chốt, quyền xem. Chỉ đổi cách một đơn được xếp vào thẻ nào và tên thẻ.
- Không sửa `migrations/**`, `drizzle/**`. Nếu cần thêm cột hay bảng thì dừng, hỏi Đầu não.
- Không ghi số thật, tên nhân viên vào repo, test, commit.

## Hiện trạng
- Thẻ viết cứng trong `lib/pancake/order-segments.ts` (`segmentKeyExpr`, `segmentsFor`): gentadox ("Kháng sinh"), SK GK, Khác, Combo Oxytetra. Mỗi đơn một thẻ, xét theo tên món (SK GK thêm theo nhãn).
- Dùng chung ở: Tổng quan POS (lọc nhóm đơn), Tổng quan Sale (`app/sale-segment-block.tsx`, mỗi thẻ gọi `/api/reports/overview?productSegment=`), Vận đơn, bảng tính sẵn `stats_daily_segment`, tham số `productSegment`.
- Lỗi đã biết: chữ "kill" trong tên món diệt ruồi và sát trùng bị hiểu là "gk"; POS BIO NANO bán Doxytylo nhưng không có thẻ nên gần hết rơi vào Khác.
- Bấm ô thẻ hiện chưa ra chi tiết. API overview theo thẻ đã trả `byProduct`, `byEmployee`, chuỗi theo ngày, so kỳ trước. Chưa có thống kê combo.

## Thiết kế
### Bộ thẻ (theo thuốc chính của đơn, xét theo thứ tự; món đi kèm như men tỏi, detox, điện giải không quyết định thẻ)
- POS Siêu Vô Gạo: `gentadox` "Gentadox" (gồm các cỡ và mã cũ đang được nhận) → `oxytetra` "Combo Oxytetra + Bổ đậm đặc" (đơn có Oxytetra) → `sat-trung` "Sát trùng, Glucan, Điện giải" (đơn có Bencid, Glucan hoặc Gluco mà không có thuốc chính) → `khac`.
- POS BIO NANO: `doxytylo` "Doxytylo" (mọi cỡ) → `khac`.
- POS Oxytetra: `oxytetra` "Combo Oxytetra + Bổ đậm đặc".
- POS khác: `khac` cho tới khi có số.
- Bỏ thẻ SK GK và mọi luật nhận "sk", "gk", "godkill". Khoá thẻ cũ `gentadox`, `oxytetra`, `khac` giữ nguyên để đường dẫn và bộ lọc cũ còn dùng được; tham số `productSegment=skgk` cũ trả về như `khac`.
- Thẻ hiện theo POS đang chọn; chọn nhiều POS thì hợp các thẻ, không lặp.

### Chi tiết thẻ
- Ở khối thẻ Tổng quan Sale (và CSKH nếu khối dùng chung): bấm tên thẻ hoặc ô thẻ mở khung chi tiết: 4 ô số (doanh thu, đơn chốt, giá trị một đơn, phần trăm trong phạm vi đang xem; kèm so kỳ trước), biểu đồ theo ngày, bảng món trong thẻ (đơn, số lượng, doanh thu), bảng combo thực tế (tổ hợp món trong một đơn, 10 tổ hợp nhiều đơn nhất), bảng nhân viên của thẻ (đơn chốt, doanh thu, TL chốt).
- Dùng lại số API overview theo thẻ. Thêm một hàm trong `lib/` và một route mỏng cho combo: chỉ đọc, giới hạn theo kỳ và POS đang chọn, kỳ trên 62 ngày đi qua `longOrNow`. Kiểm quyền như API overview.
- Giữ luật: bấm số ra từng đơn, giữ bộ lọc.
- Có bản giả trong `lib/demo/` để demo có đủ các thẻ mới.

## Các bước
1. PC: sửa `order-segments.ts` + test xếp thẻ (bảng ví dụ tên món ảo cho từng luật, gồm ca "goodkill" không còn vào thẻ nào ngoài Khác hay Sát trùng).
2. PC: khung chi tiết thẻ + hàm combo + route + test hàm combo.
3. PC: lệnh tính lại `stats_daily_segment` theo từng tháng, có nghỉ, dừng khi web chậm; từ chối DB thật nếu thiếu cờ xác nhận; chạy thử trên DB ảo trong test.
4. Đầu não kiểm ở máy đám mây (typecheck, lint, build, test, chụp), dựng trong bản thử cho anh bấm.
5. Ban đêm sau 22h30, ngoài 30 phút quanh 22h và ngoài giờ sao lưu 02h20–03h10: sao lưu bảng `stats_daily_segment` ra file riêng, build bản mới ở thư mục riêng, khởi động lại web thật, tính lại các tháng cũ, so tổng doanh thu và tổng đơn từng tháng trước và sau (phải bằng nhau), gửi anh ảnh.

## Kiểm thử
- Test luật xếp thẻ; test tổng các thẻ bằng tổng không lọc trên dữ liệu ảo; test combo; test tham số thẻ cũ.
- Chụp Tổng quan Sale, Tổng quan POS, Vận đơn ở PC và điện thoại.

## Chi phí và rủi ro
- Không dùng Cloudflare D1 (web chạy trên PC). Tính lại bảng tính sẵn: ghi lại bảng nhỏ theo ngày, chạy đêm.
- Rủi ro: số theo thẻ của tháng cũ đổi cách chia (tổng không đổi); nơi dùng khoá thẻ cũ bị sót. Chặn bằng test tổng và tìm mọi chỗ dùng `skgk`.
- Lùi: trả file chạy cũ, khởi động lại; nạp lại bảng `stats_daily_segment` từ file sao lưu.
