# Cuộc gọi CSKH bị thiếu: web lấy hụt ghi chú khách (27/10/2026)

Anh Vũ giao (27/10): "phần dữ liệu từ ly nguyễn đổ xuống đều sai, họ vẫn gọi mà không lên web". Codex viết code; Claude kiểm một lần khi xong.

## Bối cảnh

Một "cuộc gọi" CSKH = một dòng `customer_notes` (ghi chú trên hồ sơ khách Pancake). Đọc code thấy web có thể lấy hụt ghi chú như dưới đây; cách kiểm: so `pos_customers.note_count` với số dòng `customer_notes` source='customer' của cùng khách.

## Nguyên nhân (lib/customers-sync.ts, lib/sync.ts trên main)

1. `syncCustomersRecent(..., maxPages = 3, fullNotesCap = 25)`: danh sách khách Pancake chỉ kèm vài ghi chú gần nhất; khách có ghi chú đổi thì gọi `loadCustomerNotes` để lấy đủ, nhưng **tối đa 25 khách mỗi lượt mỗi POS**. POS5 một lượt có thể đổi hàng trăm khách: khách thứ 26 trở đi chỉ còn ghi chú kèm danh sách.
2. Phần bị cắt **không bao giờ được lấy lại**: cùng lượt đó `customerStatements` đã ghi `note_count`/`last_note_at` mới vào `pos_customers`, nên lượt sau so bản lưu thấy "không đổi" và bỏ qua. Vòng duyệt toàn bộ (`syncCustomersBackfill`) cũng chỉ ghi ghi chú kèm danh sách và cập nhật `note_count`, không gọi `loadCustomerNotes`.
3. `loadCustomerNotes` lỗi một khách là `break` cả vòng: các khách sau trong lượt cũng mất.
4. `maxPages = 3` trang khách mới đổi mỗi lượt; quá thì "chờ vòng duyệt toàn bộ", mà vòng đó lại không lấy đủ ghi chú (ý 2).

## Việc cần làm

Ràng buộc: **không migration, không đổi bảng**; WORLD_VERSION giữ '5'; không chạy gì trên web thật; ước chi phí Cloudflare (mục cuối) phải giữ đúng.

### A. Hàng chờ "khách cần lấy đủ ghi chú" (không đổi bảng)

- Lưu ở `app_settings` khóa `notes_pending_v1`, giá trị JSON `{ [posId]: string[] }` (mã khách, không trùng, giữ tối đa 20.000 mã mỗi POS, quá thì bỏ mã cũ nhất và `console.warn` số bị bỏ).
- Ở `syncCustomersRecent`: khách trong `changed` vượt quỹ lượt (hoặc gọi lỗi) thì đẩy vào hàng chờ thay vì mất.
- Ở `syncCustomersBackfill`: khách mà ghi chú kèm danh sách khác bản lưu (cùng cách so `noteSummary` với `note_count`/`last_note_at` cũ, đọc trước khi ghi) thì đẩy vào hàng chờ.
- Thêm bước rút hàng chờ trong `runSync` (lib/sync.ts), đặt sau bước 2b, trong quỹ thời gian còn lại và `budget.backfillCap`: mỗi POS lấy tối đa 40 khách/lượt (hằng số đặt tên, dễ chỉnh), ưu tiên mã vào sau cùng (ghi chú mới nhất lên trước). Lấy xong mới bỏ khỏi hàng chờ; lỗi thì để lại và đi tiếp khách sau (bỏ `break`), quá 3 lỗi liền trong một POS thì dừng POS đó lượt này.
- `fullNotesCap` của lượt gần đây giữ 25 (để lượt không dài ra), phần dư đi hàng chờ.

### B. Lấp phần đã thiếu (một lần, tự chạy, không cần probe)

- Một lần mỗi ngày mỗi POS (mốc lưu trong cùng JSON, ví dụ `notes_gap_checked_v1` trong app_settings), tìm khách có `note_count` > số dòng `customer_notes` source='customer', **chỉ trong khách có `last_note_at` 45 ngày gần đây**, giới hạn 3.000 khách, đẩy vào hàng chờ. Câu đọc phải dùng chỉ mục sẵn có; nếu chỉ mục không đủ thì viết câu đọc theo từng lát `last_note_at` thay vì quét cả bảng. Ghi rõ ước số dòng đọc trong comment.
- Không xoá ghi chú nào; `noteStatements` đã ON CONFLICT nên ghi lại an toàn.

### C. Hiện thiếu cho người xem (nhỏ, không bắt buộc nếu tốn)

- Trang Cuộc gọi CSKH (app/api/reports/calls/route.ts) đã có báo "số liệu ghi chú còn thiếu" theo tiến độ duyệt; thêm số khách đang trong hàng chờ vào cùng chỗ báo đó (một dòng chữ nhỏ cuối bảng, theo luật giao diện: ghi chú để cuối trang, không khối to).

## Kiểm (máy kiểm chạy)

- Test mới `tests/notes-pending.test.ts` dùng fake Pancake sẵn có (xem `tests/g7-writes.test.ts`, `tests/g8-pending.test.ts`):
  1. 60 khách đổi ghi chú một lượt → lượt 1 lấy đủ 25, 35 vào hàng chờ; lượt 2 rút hàng chờ, cuối cùng `customer_notes` đủ hết, hàng chờ rỗng.
  2. `loadCustomerNotes` lỗi ở khách thứ 3 → khách 4..n vẫn được lấy, khách 3 còn trong hàng chờ.
  3. Vòng duyệt toàn bộ gặp khách có ghi chú khác bản lưu → vào hàng chờ.
  4. Bước B tìm đúng khách thiếu, không đẩy khách đủ.
- Chạy lại `tests/g7-writes.test.ts`, `tests/g8-pending.test.ts`, `tests/k2-writes.test.ts`, `tests/k3-writes.test.ts`: số ghi D1 mỗi lượt không tăng quá ước ở dưới. Nếu test nào có ngưỡng số ghi, chỉ nới đúng phần hàng chờ, ghi lý do.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Không `pnpm format` cả repo.
- CI clone nông: test không gọi lịch sử git.

## Ước chi phí Cloudflare

- Ghi D1: lấp phần thiếu một lần (rải dần qua nhiều lượt) + ~1 dòng app_settings mỗi lượt có đổi hàng chờ. Rải theo 40 khách/POS/lượt nên mỗi lượt thêm tối đa vài trăm dòng ghi; sau khi lấp xong chỉ còn phần dư thường ngày (ước dưới 2.000 dòng/ngày). Nhỏ so với gói.
- Đọc D1: hàng chờ đọc 1 dòng app_settings mỗi lượt; bước B mỗi POS một lần/ngày, giới hạn khách 45 ngày (ước dưới 300.000 dòng đọc/ngày cho cả 6 POS). Không thêm câu đọc nặng vào trang web.
- Worker: mỗi lượt thêm tối đa 40 lời gọi Pancake mỗi POS, nằm trong quỹ thời gian sẵn có (không tăng thời gian chạy cron quá budgetMs).

## Bàn giao

Nhánh `codex/ghi-chu-cskh-thieu-2710` (từ main). Xong thì đẩy nhánh, báo điều phối kèm commit. Claude kiểm một lần, rồi gửi anh; chỉ lên web thật khi anh "ok lên".
