# Tổng quan kiểu mới + web demo riêng (26/11/2026)

## 1. Mục tiêu
Anh Vũ gửi video mẫu một dashboard tông xanh và nhắn: "thử build web tổng thành giao diện như trên xem sao, nhưng làm 1 web demo khác nhé, không đẩy lên web thật luôn".
Anh muốn tự bấm thử web tổng với giao diện mới, chạy số ảo, ở một địa chỉ riêng. Web thật không đổi gì.

Mẫu đã chốt hướng nhìn: `mau-bam-thu.html` trong thư mục này (HTML tĩnh, người và số ảo).

## 2. Không được đổi
- Web thật (thư mục đang chạy, cổng 8787, DB thật, task "THP Web"): không đụng.
- Số liệu, cách tính, tên nghiệp vụ, quyền xem: giữ nguyên. Trang mới chỉ gọi lại hàm/API báo cáo đang có.
- Màu chủ đạo xanh `#17684b`. Chữ trên web tiếng Việt.
- Không thêm thư viện giao diện mới. Dùng `components/ui/`, recharts, CSS sẵn có.
- Không sửa `migrations/**`, `drizzle/**`, workflow, wrangler.
- Khi cờ tắt, giao diện phải y như bản đang chạy.

## 3. Hiện trạng
- Vỏ trang và menu trái: `app/` (shell hiện tại), trang Tổng quan: `app/overview-view.tsx`.
- Số ảo: `lib/demo/`, bật bằng `DEMO_MODE=1`.
- Hỏi AI đã có: `lib/ai/` (chưa dùng trong đợt này).

## 4. Thiết kế
- Một cờ môi trường `THP_UI_MOI=1` (đọc ở máy chủ, đưa xuống giao diện). Chỉ bản demo bật.
- Cờ bật:
  - Menu ngang trên cùng dạng viên thuốc (Tổng quan, Cần xử lý, Sale, CSKH, Marketing, Vận đơn, Báo cáo); mục con của từng nhóm nằm ở hàng thứ hai. Điện thoại: cuộn ngang trong thanh menu.
  - Trang Tổng quan mới theo mẫu: lời chào + chọn kỳ; khối tóm tắt (câu sinh bằng luật, không AI) + việc cần xem; số doanh thu lớn + 3 ô số + thanh "đơn đang ở đâu"; cột theo giờ hôm nay so với thường ngày; vòng tròn số về; bảng nhiệt số về theo giờ; khối đơn hủy theo team kèm nút mở danh sách; cột phải "Cần xử lý" và "Đang trực hôm nay".
  - Các trang khác giữ nội dung cũ, chỉ nằm trong vỏ mới.
- Luật "việc cần xem" đợt này (chỉ hiển thị, dùng mốc đã có): tỉ lệ hủy ≥5%, hoàn ≥7%, TL chốt Sale <40%, ROAS <1. Mốc "CSKH gọi dưới mức" chưa có: để trống tới khi anh cho số.
- Khung "Hỏi trợ lý": chưa làm trong đợt này.
- Mỗi con số ghi rõ là số gì, phạm vi nào; bấm số mở trang chi tiết, giữ bộ lọc.
- Tầng: logic gom số cho trang mới ở `lib/reports/overview-moi.ts` (chỉ gọi hàm có sẵn), route mỏng `app/api/reports/overview-moi/route.ts`, giao diện `app/overview-moi-view.tsx`, `app/shell-moi.tsx`. Có test cho luật "việc cần xem" và câu tóm tắt.

## 5. Các bước
1. Nhánh `claude/tong-quan-kieu-moi` từ bản đang chạy web thật. Vỏ mới + cờ. Xong khi: cờ tắt thì ảnh chụp không đổi; cờ bật thấy menu ngang.
2. Trang Tổng quan mới + test. Xong khi: số trên trang khớp số trang Tổng quan cũ cùng bộ lọc.
3. Kiểm ở máy đám mây: typecheck, test đầy đủ, lint không thêm lỗi, build; chạy số ảo, chụp máy tính và điện thoại.
4. Web demo trên PC (chỉ sau khi anh nhắn cho phép): build ở thư mục riêng; DB số ảo riêng tạo từ `lib/demo` (không trỏ DB thật); `DEMO_MODE=1`, `THP_UI_MOI=1`; cổng riêng; tắt mọi cron/đồng bộ ra ngoài; mở qua một tên miền phụ trên đường hầm đang có. Tránh 30 phút quanh 8h, 12h, 17h, 22h; mỗi lần một lệnh nặng; kiểm RAM còn trống trước khi chạy.

## 6. Kiểm thử
- Test mới cho luật việc cần xem và câu tóm tắt.
- Ảnh: cờ tắt (trước/sau giống nhau), cờ bật máy tính và điện thoại.
- So số Tổng quan mới với Tổng quan cũ trên cùng DB số ảo.

## 7. Rủi ro
- PC ít RAM: tiến trình demo thứ hai có thể làm web thật chậm. Kiểm RAM, dừng demo khi anh xem xong hoặc khi web thật chậm.
- Demo công khai trên mạng: chỉ số ảo, không người thật, đăng nhập bằng tài khoản demo.
- Lùi lại: dừng tiến trình demo, gỡ tên miền phụ. Web thật không liên quan.
