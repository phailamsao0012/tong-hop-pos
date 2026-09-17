# TỔNG HỢP POS

Web quản lý riêng cho 6 POS: Siêu vỏ gạo, MGT - APEX, THỦY SẢN MEGATECH, BIO NANO, MEGAROOT và Oxytetra - Megatech. Danh sách 6 POS và quy tắc chốt nóng trong phần văn bản gửi kèm là yêu cầu cập nhật; PDF kế hoạch cũ ghi 5 POS và nhịp đồng bộ 1–2 giờ chỉ là phương án ban đầu.

Web đã kết nối dữ liệu đơn hàng Pancake POS, lưu kho D1, đồng bộ lịch sử và tự lấy dữ liệu mới mỗi 5 phút khi bảng điều khiển đang mở. Khóa API chỉ được lưu trong biến bí mật của môi trường chạy, không nằm trong mã nguồn hoặc repository.

Trang đang chạy: [tong-pos-cskh-sale.hoangxuannghia01.chatgpt.site](https://tong-pos-cskh-sale.hoangxuannghia01.chatgpt.site/)

## Quy tắc dữ liệu

- Mỗi khách/số được nhận diện trong phạm vi một POS; chưa tự gộp số trùng giữa POS.
- Đợt nhận tính số điện thoại duy nhất của phân công trong kỳ. Số đã chốt là số thuộc đợt đó với đơn có thời điểm xác nhận trong kỳ. Chốt trên data cấp trước kỳ được xem ở hoạt động chốt, không đưa vào tỷ lệ của tệp mới nhận.
- Một số nhiều đơn chỉ tính một số chốt; số đơn và giá trị chốt đếm/tổng theo đơn.
- Lần đầu xác nhận, giá trị chốt và người chốt được giữ nguyên khi đơn sau đó bị sửa. Giá trị hiện tại được lưu riêng.
- Doanh số cuối tháng lấy tiền hàng thuần của đơn giao thành công, theo ngày tạo đơn. Hoàn/hủy được xem riêng. Cách khóa thưởng, hoàn một phần và gộp xuyên POS chưa được chốt.
- Upsell lần 1 là đơn mua thành công thứ hai trong toàn bộ lịch sử truy cập được của cùng khách trong một POS.

## Lưu ý đối chiếu số liệu

Các chỉ số chốt nóng dùng lần xác nhận đầu tiên và tập số được giao cho nhân viên. Giá trị đơn lấy từ `total_price` hiện tại của đơn nên không phải doanh thu thuần trên màn hình Tổng quan Pancake. Web ghi rõ hai khái niệm này để tránh đối chiếu sai công thức.

Chạy dự án bằng `pnpm dev`, kiểm tra bằng `pnpm exec tsx --test tests/report-metrics.test.ts` và `pnpm build`. Migration D1 được tạo trong `drizzle/` và áp dụng khi phát hành Sites.
