-- Đơn chốt thống nhất 3 giai đoạn (anh Vũ 08/10/2026): new → chốt (từ Chờ xác nhận trở đi) → chuyển hàng.
-- first_closed_at = lần đầu đơn vào Chờ xác nhận hoặc trạng thái sau đó (không tính Mới, Hủy, Xóa). first_confirmed_at giữ
-- nguyên nghĩa "đã xác nhận" cho báo cáo MKT. Điền giá trị cho đơn đã có do bộ hẹn giờ làm dần (lib/scheduler.ts, fillClosedAtMonth):
-- điền một lần trong migration làm D1 quá thời gian (deploy 08/10/2026 07:11, code 7429).
ALTER TABLE `raw_pos_orders` ADD COLUMN `first_closed_at` text;
