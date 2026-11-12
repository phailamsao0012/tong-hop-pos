# Kết quả R-POS: chọn POS nào chỉ tính POS đó

## 1. Lời gọi API theo POS đang chọn
- `API.swift`: thêm tham số `posIds`, bỏ `posIds=` rỗng cố định ở marketing, care, calls, customers, cskhBadge.
  - cskh-badge: app gửi `?posIds=…`. Máy chủ chưa nhận (Tổ web tổng đang sửa) thì bỏ qua, trả số mọi POS như cũ.
- Màn trước đây không gửi POS, nay gửi POS chung đang chọn (`AppNav.pos`, chọn ở pill lọc) và tải lại khi đổi POS:
  - Hôm nay: 5 nguồn (Pancake, Sale, CSKH, MKT, Vận đơn).
    - Đổi POS thì bỏ ngay số của POS cũ.
    - Dải phạm vi ghi "POS <tên>".
    - Phần tải trước lúc Face ID dùng cùng POS.
    - Lối tắt "Đơn mới" mở danh sách đúng POS.
  - Việc cần xử lý (chuông, Cần xử lý, Thông báo):
    - đơn mới, ca, khách quá 20 ngày theo POS;
    - dòng đồng bộ chỉ tính POS đang chọn;
    - đổi POS thì hỏi lại ngay.
  - Cuộc gọi, Khách theo nhân viên, Mua lại & Upsell, Khách lâu chưa mua, KPI CSKH, Data được cấp, Điều hành trong ca.
  - Theo POS: số theo giờ (shift) theo POS đang xem.
  - Khối Số liệu: ô số khách (customers) theo POS.
  - Tổng quan CSKH: cskh-badge theo POS của trang.
  - Thẻ KPI CSKH: số tháng và hôm nay theo POS của trang.
- Đã có POS từ trước, giữ nguyên: Tổng quan, Đơn hàng, Vận đơn, Marketing, So sánh nhân viên, Nhân viên chi tiết, Xếp hạng MKT, tìm khách.

## 2. Danh sách nhân viên theo POS
- Thẻ KPI CSKH và trang KPI CSKH chỉ hiện người có `posIds` chứa POS đang chọn. Người làm 2 POS hiện ở cả hai.
- Người đang chọn ở trang KPI không thuộc POS mới thì chuyển sang người đầu tiên của POS đó.
- Máy chủ không trả `posIds` cho một người thì không loại người đó (không đoán).
- Các bảng người khác (So sánh nhân viên, Cuộc gọi, Khách theo nhân viên, ca, MKT) lấy từ API báo cáo đã gửi `posIds`, máy chủ lọc.

## 3. Kiểm
- Tour 15 thêm 2 mốc:
  - `cskh-mot-pos`: Tổng quan CSKH, kỳ Tháng này, POS đầu danh sách;
  - `mkt-mot-pos`: Marketing, cùng kỳ và POS.
- Dòng `[UIPOS] cskh|mkt pos=… dt=… don=…` in tổng của "Mọi POS" (mốc cskh, mkt) và của một POS (2 mốc mới), lưu ở `15-giao-dien-app.txt`, để so: một POS phải nhỏ hơn hoặc bằng Mọi POS và bằng số web cùng bộ lọc.
- `ios-preview.yml` đoạn 15:
  - thêm 2 mốc vào `ui_stages`;
  - lưu thêm dòng `[UIPOS]`;
  - BASE 127.0.0.1 và bước "Chặn gọi demo" giữ nguyên.

## Chưa làm, cần anh / tổ khác chốt
- Nhân sự (web vệ tinh): danh sách nhân sự, quân số, hồ sơ chưa lọc theo POS. Dữ liệu nhân sự chia theo chi nhánh / phòng ban, không theo POS. Cần Tổ web nhân sự cho biết cách nối người với POS.
- Thành tích trong hồ sơ nhân sự (`staff-profile` gọi `pos=` rỗng) chưa theo POS, cùng lý do trên.
- Cài đặt ca, cấu hình (`/api/employees` ở Config) là trang cài đặt, không lọc.
