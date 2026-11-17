# Tổ app trả lời B1 (10/11/2026)

Đã đọc `doi-chieu.md` (e71686f). Duyệt bảng "Cần gọi thêm" đủ 7 dòng và các đề xuất ở bảng "Thiếu". Luật chung cho mọi câu: **giữ đúng nghĩa và số web trả**, không đổi cách tính, không ép số cho khớp hình. Hình chỉ là kiểu trình bày.

## Câu hỏi

1. **08A nhóm sản phẩm:** dùng nguyên nhóm và lời giải thích của web (`definitions`). Không vẽ vòng hay thanh chia đoạn cộng thành tổng Sale. Hiện từng nhóm như danh sách ô số, dòng phụ "Nhóm có thể giao nhau, không cộng lại" (chữ lấy từ web nếu web có câu này).
2. **09A2 đóng hàng:** giữ nghĩa web (đã qua bước đóng) và nhãn app 0.11. Không dùng nhãn "Đang đóng" của hình.
3. **11C cuộc gọi:** giữ nguồn và nghĩa web hiện có (ghi chú, khách được ghi chú), nhãn theo app 0.11 hoặc web. Không gọi là "cuộc gọi thành công" hay "hoàn tất liên hệ" khi web không gọi vậy.
4. **12A New/CSKH:** hiện đủ ba phần máy chủ trả: New, CSKH, và "Khác" khi `otherNet` khác 0. Tổng = `net` của web. Vòng chỉ vẽ khi các phần đang vẽ cộng đúng bằng `net`; không khớp thì bỏ vòng, giữ ô số.
5. **15C KPI:** chỉ đọc (`GET /api/kpi2`). Tô tỷ lệ chốt Sale theo ngưỡng chung 42%. Không có thao tác chia hay sửa KPI trong app (làm trên web). Không thêm bước ghi.
6. **17C hồ sơ:** giữ `performance.lifetime` hiện tại làm số tổng, ghi rõ phạm vi ở dòng phụ (tài khoản POS đang xem). `staff-profile` chỉ dùng cho mốc (ngày vào → tài khoản POS → đơn đầu), tháng, huy hiệu, biểu đồ. Không cộng nhiều tài khoản, không thay lifetime bằng tổng months.
7. **Thêm trường vào route đang gọi** (product-groups, marketing/analytics, van-don): được **thêm thuộc tính tuỳ chọn** (`let x: T?`, có `CodingKeys` nếu struct cũ đang dùng) vào struct giải mã đã có. Không đổi, không xoá thuộc tính cũ, không đổi hàm gọi, URL, tham số, số lần và lúc gọi. Thiếu trường (demo cũ) thì `nil` → hiện `—` hoặc bỏ khối. Mỗi thuộc tính mới có ca trong `DecodeSelfTest.swift` (có trường và thiếu trường). Đây là ngoại lệ của `giao.md` 2.2 cho đúng 3 route này. Riêng bảng giao (09A1/09A2) đã có trong URL bảng cũ: đọc thêm trường từ cùng phản hồi đó, không gọi lần hai.

## Khác

- Đồng ý không gọi `/api/dispatch` và `/api/reports/delivered-products`.
- Route mới (`staff-profile`, `staff-tenure`, `kpi2`): `struct` mới, hàm `GET` mới, gọi khi mở đúng màn đó (không gọi ở mở app, không vào `UnlockPrefetch`).
- `staff-tenure` trả id POS: ánh xạ sang người HR chỉ khi app đã có sẵn khoá nối (`posUserIds` hay tương tự). Không có thì 17B không hiện số T, 09A hiện số T theo id POS.

Chạy tiếp: B1b, rồi B2 đến B8 liền mạch.
