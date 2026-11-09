# Sửa theo kiểm bài 1f8fce1 (tổ web tổng, 09/11/2026)

Anh Vũ: "sửa theo kiểm bài của tổ ..., xong chạy thử trên bản PC". Kiểm bài: `kiem-bai-1f8fce1.md` cùng thư mục. Làm đúng điểm 1 và 2, không làm ngoài.

- Migration `drizzle/0052_marketer_ids.sql` CHƯA áp lên DB thật hay bản PC đang chạy, nên được sửa thẳng file 0052 (không thêm 0053).
- Giữ đúng số như cũ.

## Điểm 1. Bỏ DELETE marketer lúc đồng bộ, dọn 1 lần mỗi đêm
- `marketerStatements` (lib/teams/marketer-ids.ts) chỉ còn INSERT ... ON CONFLICT DO NOTHING. Bỏ câu `DELETE ... NOT EXISTS (SELECT 1 FROM raw_pos_orders WHERE TRIM(marketer_id)=?)`.
- Dọn đêm trong đường điền hiện có (`backfillMarketerIds` hoặc tên thật trong code), giờ 0–5 VN, chỉ sau khi bảng đã sẵn sàng:
  `DELETE FROM marketer_ids WHERE marketer_id NOT IN (SELECT DISTINCT TRIM(marketer_id) FROM raw_pos_orders WHERE marketer_id IS NOT NULL AND TRIM(marketer_id)<>'')`.
- Ghi khoá ngày đã dọn vào app_settings (câu upsert phải có `WHERE app_settings.value IS NOT excluded.value`, xem test G4) để mỗi đêm chạy 1 lần. Cộng số dòng ghi vào hạn mức scheduler như các lượt khác.
- Test:
  - đổi marketer trên đơn thì danh sách vẫn có người cũ cho tới lượt dọn đêm;
  - sau lượt dọn thì khớp DISTINCT cũ;
  - lượt thứ hai cùng đêm không chạy lại;
  - đồng bộ lặp không đổi vẫn 0 câu ghi.

## Điểm 2. Tách trigger sửa ghi chú
Trong 0052, thay `calls_coverage_note_update` bằng 2 trigger:
- **Đổi `pos_id`** (`WHEN OLD.pos_id IS NOT NEW.pos_id`): giữ logic hiện tại (trừ ở POS cũ, cộng ở POS mới).
- **Cùng `pos_id`** (`WHEN OLD.pos_id = NEW.pos_id AND (OLD.created_at IS NOT NEW.created_at OR OLD.fetched_at IS NOT NEW.fetched_at)`):
  - không đổi `notes`;
  - `last_fetch` = lớn hơn giữa `last_fetch` và `NEW.fetched_at`;
  - `first_note` chỉ tính lại bằng `(SELECT MIN(created_at) FROM customer_notes WHERE pos_id=NEW.pos_id)` khi `OLD.created_at = first_note AND NEW.created_at > OLD.created_at`; còn lại lấy nhỏ hơn giữa `first_note` và `NEW.created_at`.
- Lưu ý `fetched_at` có thể giảm không? Kiểm code đồng bộ ghi chú. Nếu có đường làm giảm `fetched_at` thì ghi rõ trong ket-qua và xử lý đúng số: tính lại MAX khi `OLD.fetched_at = last_fetch AND NEW.fetched_at < OLD.fetched_at`.
- Hàm điền/ensure bảng trong `lib/reports/calls-coverage.ts`, nếu có tạo trigger lúc chạy, sửa giống hệt 0052.
- Test: sửa ghi chú cùng POS (đổi fetched_at tăng, created_at tăng ở dòng đang là first_note, created_at giảm) thì số đầu trang khớp câu đếm cũ.

## Nộp
- tsc và test liên quan bằng bộ nạp native như lần trước.
- Chạy lại `scripts/pc/do-cuoc-goi.ts` trên bản sao `C:\thp\db-thu\thp.sqlite` để so 6 trường hợp đầu trang Cuộc gọi, kèm so danh sách MKT với DISTINCT cũ.
- Ghi `ket-qua-kiem-bai-1f8fce1.md`. Không commit.
