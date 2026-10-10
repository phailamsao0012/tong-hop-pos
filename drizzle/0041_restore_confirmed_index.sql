-- Không làm gì (cố ý). Bản đầu của tệp này bỏ chỉ mục rộng có marketer_id rồi dựng lại chỉ mục cũ, nhưng trên web thật 5,5 GB
-- việc dựng lại quá hạn D1 (7429) và chặn deploy. Bản đầu của 0040 thực ra đã chạy xong trên web thật (D1 báo lỗi quá hạn nhưng
-- vẫn ghi xong), nên web thật đang có chỉ mục rộng idx_raw_orders_pos_confirmed_mkt_money; chỉ mục này chứa đủ cột của chỉ mục cũ
-- idx_raw_orders_pos_confirmed_status_money nên mọi câu đọc vẫn được phủ. Bài học: không CREATE INDEX rộng trên raw_pos_orders
-- ở web thật qua migration.
SELECT 1;
