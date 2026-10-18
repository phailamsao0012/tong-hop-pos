-- Mốc nước đồng bộ đơn vừa sửa (rủi ro 1, QA 11/10/2026 điểm 4): tách khỏi last_sync_at (giờ chạy xong, dùng cho "Cập nhật lúc",
-- cảnh báo, phiên bản bộ nhớ đệm). recent_watermark: mọi đơn sửa trước mốc này đã đọc và ghi; đọc hết trang thì = giờ chạy.
-- recent_cursor: NULL = đã theo kịp; '{}' = chưa theo kịp, lượt sau đi tiếp đúng từ mốc; {"offset","total"} = đang lật trang
-- trong một giây có hơn 100 đơn. Cột rỗng lúc tạo, lib/sync.ts tự điền ở lượt đầu (lấy last_sync_at làm mốc ban đầu).
ALTER TABLE `pos_shops` ADD COLUMN `recent_watermark` text;
--> statement-breakpoint
ALTER TABLE `pos_shops` ADD COLUMN `recent_cursor` text;
