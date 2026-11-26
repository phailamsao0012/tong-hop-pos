# Plan: trang Marketing kỳ dài ra số trong vài giây

Ngày viết: 26/11/2026. Người viết: Đầu não. Trạng thái: CHỜ ANH DUYỆT.

## 1. Mục tiêu

Anh Vũ 26/11/2026: "t muốn xem từ đầu á chứ". Anh mở trang Marketing với kỳ từ đầu năm (hoặc từ đầu) và thấy đủ số trong vài giây, không phải chờ 15 đến 20 phút như hôm nay.

Đo được 26/11 trên web thật (kỳ gần 11 tháng, máy thiếu RAM), chỉ ghi số giây:

| Khối | API | Thời gian |
| --- | --- | --- |
| Số chính, chi phí, ROAS | `/api/marketing/analytics` | 641 giây |
| Báo cáo chính (phễu, xếp hạng, team) | `/api/reports/marketing` | 215 giây |
| Xu hướng, chéo, thẻ xu hướng | `trend`, `cross`, `trend-cards` | nối sau, vài phút |

Đích: mỗi khối dưới 10 giây cho kỳ một năm, khi máy còn trống ít nhất 2 GB RAM.

## 2. Không được đổi

- Mọi con số, cách tính, tên nghiệp vụ, quyền xem. Số trước và sau phải bằng nhau từng ô.
- Luật số MKT đã chốt: chỉ Marketer có hậu tố được tính, bỏ sàn, số về chỉ đơn chia Sale / CSKH, đếm SĐT không trùng, "đã chốt là chốt", POS là lớp lọc đầu tiên.
- Không tạo chỉ mục rộng trên `raw_pos_orders`. Không sửa `migrations/**`, `drizzle/**`, `wrangler*`, workflow.
- Kỳ ngắn (62 ngày trở xuống) giữ nguyên đường đọc cũ ở đợt đầu.
- Không ghi số thật, tên người, SĐT vào repo, test, log.

## 3. Hiện trạng

- `lib/reports/marketing-overview.ts:176-200`: một lô 15 câu, tất cả quét `raw_pos_orders` theo kỳ; ba câu nối `raw_pos_order_items`; nhiều câu đọc `status_history_json` qua `PACKED_SQL`, `AFTER_PACK_*`, `NEVER_SENT_CANCELLED_SQL` (`lib/reports/van-don.ts:18-35`).
- `lib/reports/mkt-analytics.ts:156-170`: khoảng 10 câu quét `raw_pos_orders` cho kỳ này và kỳ trước; câu 8 và 9 mở `tags_json` và nối `raw_pos_order_items` cho từng đơn để ghép sản phẩm. Đây là khối chậm nhất.
- `lib/reports/mkt-cross.ts:23-28`, `lib/reports/mkt-trend.ts:60-63`: cũng quét đơn gốc.
- `lib/reports/stats-mkt.ts`: bảng tính sẵn theo ngày `stats_daily_mkt` chỉ có số đơn và doanh số theo (POS, ngày xác nhận, Marketer, người bán). Trang Xu hướng đọc bảng này nên nhanh.
- Vì sao chậm: bảng đơn gốc nằm trong DB 6,7 GB, mỗi dòng rộng (JSON gốc, lịch sử, ghi chú). Kỳ dài phải đọc hàng trăm nghìn dòng rộng rải khắp ổ đĩa; máy 16 GB thiếu RAM nên gần như mọi lần đọc đều xuống ổ.
- Vì sao KHÔNG thể chỉ cộng bảng theo ngày: nhiều ô là SĐT không trùng (số về, TL chốt). Số không trùng của cả kỳ không bằng tổng số không trùng từng ngày. Thêm nữa, bộ lọc Sale, CSKH, sản phẩm, nguồn đơn, team Sale phải lọc theo từng đơn.

## 4. Thiết kế

Giữ nguyên câu tính, đổi chỗ đọc: thêm một **bảng gọn đơn Marketing**, mỗi đơn có Marketer một dòng, chỉ gồm các cột báo cáo Marketing cần. Bảng gọn nhỏ hơn bảng gốc nhiều lần nên nằm trọn trong RAM và quét cả năm trong vài giây. Vì mỗi dòng vẫn là một đơn, SĐT không trùng và mọi bộ lọc vẫn tính đúng như cũ.

### 4.1 Tầng `lib/`

- `lib/reports/mkt-slim.ts` (mới):
  - Bảng `mkt_orders_slim`: `id`, `pos_id`, `created_at`, `first_confirmed_at`, `status_code`, `marketer_id`, `seller_id`, `care_id`, `first_confirmed_by`, `phone`, `current_total`, `total_discount`, `net_total`, `order_source`, và ba cờ tính sẵn thay cho việc mở `status_history_json`: `was_packed` (lịch sử từng có 8), `was_sent` (lịch sử từng có 2, 3, 16, 4, 15, 5), `tags_json` (giữ nguyên, ngắn). Tên cột trùng bảng gốc để dùng lại câu SQL.
  - Bảng `mkt_order_items_slim`: `order_id`, `name`, `product_key`, `quantity`, `line_total`, `is_bonus`, chỉ cho đơn có trong bảng gọn.
  - Chỉ mục hẹp: `(pos_id, created_at)`, `(pos_id, first_confirmed_at)` trên bảng gọn; `(order_id)` trên bảng món.
  - `ensureSlimSchema(db)` tạo bảng nếu chưa có, cùng kiểu `ensureMktSchema` (`lib/reports/stats-mkt.ts:27`). Không qua migration vì web chạy trên PC.
  - `slimStatements(row)`: từ một dòng đơn gốc sinh câu ghi bảng gọn. Đơn mất Marketer hoặc bị xoá thì xoá dòng gọn.
- `lib/pancake/sync.ts:152-172` và `:197-207`: cùng lô ghi `raw_pos_orders` thì ghi thêm bảng gọn (cùng giao dịch), để hai bảng không lệch nhau.
- `lib/reports/van-don.ts`: thêm biến thể của `PACKED_SQL`, `AFTER_PACK_*`, `NEVER_SENT_CANCELLED_SQL` đọc hai cờ thay vì JSON; có test chứng minh cho cùng đơn hai cách ra cùng kết quả.
- `lib/reports/marketing-overview.ts`, `mkt-analytics.ts`, `mkt-cross.ts`, `mkt-trend.ts`: thêm tham số nguồn đọc. Khi kỳ dài hơn 62 ngày VÀ cờ `THP_MKT_SLIM=1` VÀ bảng gọn đã điền đủ (mốc ghi trong `app_settings`) thì thay `raw_pos_orders` bằng `mkt_orders_slim`, `raw_pos_order_items` bằng `mkt_order_items_slim`, bỏ `INDEXED BY`. Mọi phần còn lại của câu giữ nguyên.
- `lib/ops/scheduler.ts`: việc đêm (sau 22h30) đối chiếu bảng gọn với bảng gốc theo từng (POS, tháng): số dòng, tổng tiền, số đơn theo trạng thái. Lệch thì dựng lại tháng đó và ghi log.

### 4.2 Tầng `app/api/`

Không thêm route. Các route kỳ dài hiện có vẫn đi qua `longOrNow` (`lib/ops/long-response.ts`); khi mỗi lượt chỉ còn vài giây thì hàng chờ gần như không còn.

### 4.3 Giao diện

Không đổi.

### 4.4 Dữ liệu ảo

`lib/demo/`: bộ dựng DB ảo gọi cùng hàm ghi bảng gọn để bản demo và test có bảng này.

## 5. Các bước

Mỗi bước một nhánh `claude/mkt-slim-<n>` từ bản đang chạy web thật (hiện `7eaa374`), PC viết code, Đầu não kiểm ở máy đám mây.

**Bước 0. Đo, chưa sửa gì.** Tối 26/11, trên BẢN CHÉP DB của bản thử giao diện mới (không phải DB thật): chạy từng câu của hai báo cáo cho kỳ 01/01 đến nay, ghi số giây và `EXPLAIN QUERY PLAN`; đếm số dòng sẽ vào bảng gọn và ước dung lượng.
- Tiêu chí xong: biết ba câu chậm nhất và dung lượng ước tính. Kết quả chỉ báo trong thread, không ghi vào repo.
- Nếu số đo cho thấy nút thắt nằm chỗ khác (ví dụ chỉ câu ghép sản phẩm chậm) thì Đầu não sửa plan và báo anh trước khi làm bước 1.

**Bước 1. Bảng gọn và việc ghi kèm.** File: `lib/reports/mkt-slim.ts`, `lib/pancake/sync.ts`, `lib/demo/*`, `tests/mkt-slim.test.ts`.
- Tiêu chí xong: test chứng minh sau mỗi kiểu ghi đơn (mới, đổi trạng thái, đổi Marketer, xoá) bảng gọn khớp bảng gốc.
- Chưa báo cáo nào đọc bảng gọn. Lên web thật ở bước này chỉ làm web ghi thêm bảng.

**Bước 2. Điền lịch sử.** Việc đêm điền bảng gọn theo từng (POS, tháng), mỗi lượt một tháng, có nghỉ giữa các lượt, dừng khi `/login` chậm hơn 3 giây.
- Trước khi chạy: sao lưu DB thật theo cách có giới hạn tốc độ, sau 22h30, RAM trống trên 2 GB.
- Tiêu chí xong: việc đối chiếu báo khớp mọi (POS, tháng).

**Bước 3. Báo cáo đọc bảng gọn.** File: bốn file báo cáo ở 4.1, `lib/reports/van-don.ts`, test.
- Test bắt buộc: với cùng DB ảo, mỗi báo cáo chạy hai lần (nguồn gốc và nguồn gọn) cho nhiều tổ hợp bộ lọc (POS, Sale / CSKH, team MKT, team Sale, Marketer, sản phẩm, nguồn đơn, theo ngày tạo / ngày xác nhận) và kết quả JSON phải giống hệt.
- Tiêu chí xong: test trên đạt; trên bản chép DB thật, hai nguồn ra cùng số cho kỳ 01/01 đến nay và mỗi khối dưới 10 giây.

**Bước 4. Bật trên web thật.** Đặt `THP_MKT_SLIM=1` trong `chay-node.ps1`, khởi động lại ngoài các mốc 8h, 12h, 17h, 22h. Đầu não mở trang kỳ dài, đo, gửi anh ảnh.

## 6. Kiểm thử

- Bốn lệnh ở máy đám mây: `pnpm typecheck`, `pnpm test`, `pnpm lint` (không thêm lỗi), `pnpm build`.
- Test mới: `tests/mkt-slim.test.ts` (ghi kèm, đối chiếu), test so hai nguồn ở bước 3, test hai cờ lịch sử.
- So số trên bản chép DB thật trước khi bật: hai nguồn bằng nhau từng ô cho ba kỳ (tháng này, 90 ngày, từ đầu năm).
- Chụp trang Marketing kỳ dài trước và sau.

## 7. Chi phí

Web chạy trên PC bằng SQLite, không còn D1 của Cloudflare nên không phát sinh tiền Cloudflare. Chi phí là dung lượng ổ PC cho hai bảng gọn (ước ở bước 0, dự kiến dưới 5% DB) và thời gian điền lịch sử ban đêm.

## 8. Rủi ro và cách lùi

- Bảng gọn lệch bảng gốc: ghi cùng giao dịch, đối chiếu mỗi đêm, và báo cáo chỉ đọc bảng gọn khi mốc "đã điền đủ" còn hiệu lực. Lệch thì tự quay về đọc bảng gốc (chậm nhưng đúng).
- Lùi nhanh: bỏ `THP_MKT_SLIM=1`, khởi động lại. Bảng gọn để nguyên, không ảnh hưởng gì.
- Ghi đơn chậm hơn: mỗi đơn thêm một đến vài câu ghi nhỏ; bước 1 đo thời gian đồng bộ trước và sau.
- Điền lịch sử làm web chậm: chỉ chạy đêm, từng tháng, có ngưỡng dừng.
- Máy vẫn thiếu RAM: bảng gọn nhỏ nên ít phụ thuộc hơn, nhưng nếu RAM trống dưới 1 GB thì vẫn chậm. Việc thêm RAM là việc riêng.

## 9. Cần anh cho phép một lần

Plan này có ghi thêm bảng vào DB thật và lên web thật. Anh gõ một câu, đến giờ tổ tự làm, không hỏi lại:

"ok plan marketing kỳ dài nhanh, sao lưu, điền bảng gọn ban đêm, build và lên web thật"
