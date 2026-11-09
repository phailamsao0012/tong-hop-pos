# Kiểm bài 1f8fce1 (codex/giam-tai-2), 09/11/2026

Tổ web tổng đã đọc hết diff, chạy lại tests/giam-tai-2.test.ts + tests/stats-segment.test.ts (14/14 qua) và typecheck (qua).
Phần đăng nhập 60 giây và đếm sẵn đầu trang Cuộc gọi đúng logic. Còn 2 chỗ cần sửa trước khi lên web thật.

## 1. Xoá marketer trong lúc đồng bộ quét cả bảng đơn (cần sửa)
`marketerStatements` (lib/teams/marketer-ids.ts) thêm câu
`DELETE FROM marketer_ids WHERE marketer_id=? AND NOT EXISTS (SELECT 1 FROM raw_pos_orders WHERE TRIM(marketer_id)=?)`
mỗi khi một đơn đổi marketer. `TRIM(marketer_id)` không dùng được chỉ mục nào, nên mỗi lần chạy có thể đọc tới toàn bộ
raw_pos_orders (~384 nghìn dòng), đúng loại câu nặng mà việc này muốn bỏ.

Sửa: bỏ câu DELETE khỏi lúc đồng bộ (chỉ giữ INSERT). Dọn người không còn trên đơn nào làm MỘT lần mỗi đêm trong
`backfillMarketerIds` (giờ 0–5 VN, sau khi bảng đã điền xong), ví dụ
`DELETE FROM marketer_ids WHERE marketer_id NOT IN (SELECT DISTINCT TRIM(marketer_id) FROM raw_pos_orders WHERE marketer_id IS NOT NULL AND TRIM(marketer_id)<>'')`,
ghi cờ ngày đã dọn vào app_settings để mỗi đêm chỉ chạy một lần. Test: đổi marketer trên đơn thì danh sách vẫn có người cũ
cho tới lượt dọn đêm, sau lượt dọn thì khớp DISTINCT cũ.

## 2. Trigger sửa ghi chú tính lại MIN/MAX không cần thiết (nên sửa)
`calls_coverage_note_update` (drizzle/0052) chạy cả khi chỉ `fetched_at` đổi (mỗi lần ghi chú được sửa), trừ 1 rồi cộng 1 và
có thể chạy `SELECT MAX(fetched_at) FROM customer_notes WHERE pos_id=?`, câu này không có chỉ mục nên quét hết ghi chú của POS.

Sửa: tách 2 trigger.
- Đổi `pos_id`: giữ như hiện tại.
- Cùng `pos_id` (`WHEN OLD.pos_id = NEW.pos_id AND (...)`): không đổi `notes`; `last_fetch = MAX(last_fetch, NEW.fetched_at)`
  (fetched_at chỉ tăng); `first_note` chỉ tính lại bằng `MIN(created_at)` (có chỉ mục idx_customer_notes_pos_created) khi
  `OLD.created_at = first_note AND NEW.created_at > OLD.created_at`, còn lại lấy min với NEW.created_at.
Test: sửa ghi chú cùng POS thì số đầu trang khớp câu đếm cũ.

## 3. Ghi nhận (không cần sửa)
Trên Cloudflare, khoá tài khoản có thể chậm tới 60 giây ở máy chủ khác (trước 15 giây). Trên PC có hiệu lực ngay. Tổ đã báo anh.

Xong thì chạy lại typecheck, test, lint các file đổi, so số 6 trường hợp đầu trang Cuộc gọi và danh sách MKT với cách cũ trên bản sao PC.
