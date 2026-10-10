-- Chỉ mục cho Vận đơn theo ngày gửi, cột như 0038 (đã tạo được trên web thật) thêm người xác nhận và Marketer để câu Vận đơn và Tổng quan
-- đọc hết từ chỉ mục, không phải mở từng đơn (đo trên máy 10/10: thiếu hai cột này trang Vận đơn chậm thêm ~20 ms). Tách riêng khỏi 0043 để lỗi tạo chỉ mục không chặn
-- cột mới. Chỉ mục một phần (QA 10/10/2026): lúc tạo cột còn toàn NULL nên chỉ mục gần rỗng, ít rủi ro quá hạn D1 (7429) trên bảng lớn.
CREATE INDEX IF NOT EXISTS `idx_raw_orders_pos_sent_status_money` ON `raw_pos_orders` (`pos_id`,`first_sent_at`,`status_code`,`seller_id`,`first_confirmed_by`,`marketer_id`,`net_total`,`current_total`,`total_discount`) WHERE `first_sent_at` IS NOT NULL;
