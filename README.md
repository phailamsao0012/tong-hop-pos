# Dashboard CSKH & Sale — Tổng POS

Web quản lý riêng cho 6 POS: Siêu vỏ gạo, MGT - APEX, THỦY SẢN MEGATECH, BIO NANO, MEGAROOT và Oxytetra - Megatech. Danh sách 6 POS và quy tắc chốt nóng trong phần văn bản gửi kèm là yêu cầu cập nhật; PDF kế hoạch cũ ghi 5 POS và nhịp đồng bộ 1–2 giờ chỉ là phương án ban đầu.

Web hiện có giao diện và bộ tính báo cáo từ dữ liệu minh họa, đồng thời có kho D1, các bảng dữ liệu chuẩn hóa, lưu báo cáo/cấu hình và API nhập dữ liệu chuẩn hóa có xác thực. Chưa có Shop ID/API key thực tế nên chưa có bộ đọc dữ liệu từ Pancake POS, lịch đồng bộ, hoặc bot Telegram đang gửi tin. Giao diện luôn ghi rõ chế độ minh họa hay dữ liệu POS.

## Quy tắc dữ liệu

- Mỗi khách/số được nhận diện trong phạm vi một POS; chưa tự gộp số trùng giữa POS.
- Đợt nhận tính số điện thoại duy nhất của phân công trong kỳ. Số đã chốt là số thuộc đợt đó với đơn có thời điểm xác nhận trong kỳ. Chốt trên data cấp trước kỳ được xem ở hoạt động chốt, không đưa vào tỷ lệ của tệp mới nhận.
- Một số nhiều đơn chỉ tính một số chốt; số đơn và giá trị chốt đếm/tổng theo đơn.
- Lần đầu xác nhận, giá trị chốt và người chốt được giữ nguyên khi đơn sau đó bị sửa. Giá trị hiện tại được lưu riêng.
- Doanh số cuối tháng lấy tiền hàng thuần của đơn giao thành công, theo ngày tạo đơn. Hoàn/hủy được xem riêng. Cách khóa thưởng, hoàn một phần và gộp xuyên POS chưa được chốt.
- Upsell lần 1 là đơn mua thành công thứ hai trong toàn bộ lịch sử truy cập được của cùng khách trong một POS.

## Kết nối tiếp theo

1. Cung cấp Shop ID/đường dẫn 6 POS và khóa API qua cấu hình bí mật của nơi chạy web. [Tài liệu Open API chính thức của Pancake POS](https://docs.pancake.biz/pos/api/) mô tả cơ chế này.
2. Khảo sát một POS để xác nhận trường phân công, người chốt, lịch sử trạng thái và phạm vi lịch sử truy cập được; đối chiếu các mẫu thực tế trước khi hiển thị số liệu là chính thức.
3. Xây adapter đọc POS theo từng khoảng lịch sử, gọi `POST /api/import` bằng dữ liệu chuẩn hóa, lưu checkpoint và bù đơn cũ bị sửa/hoàn. API này chỉ nhận người đã đăng nhập trong site riêng, dùng `POS ID + mã nguồn` làm khóa để nhập lại không nhân đôi.
4. Khi dữ liệu thật đủ mới và bot/chat riêng được cấu hình, kết nối bộ đánh giá ngưỡng và gửi Telegram; không gửi cảnh báo hiệu suất lúc đồng bộ lỗi hoặc quá cũ.

Chạy dự án bằng `pnpm dev`, kiểm tra bằng `pnpm exec tsx --test tests/report-metrics.test.ts` và `pnpm build`. Migration D1 được tạo trong `drizzle/` và áp dụng khi phát hành Sites.
