# QA đánh giá khả thi: cột "Đã XN kho" ở bảng Từng nhân viên (plan 7a3f436)

QA kiểm thử, 14/10/2026. Đọc `docs/plans/2026-10-14-xac-nhan-kho/plan.md` và code cùng commit. Đếm thử trên D1 demo của máy QA (số ảo, 7 ngày tới 12/10). Không chạm web thật. QA không push, nên ghi file ở đây.

## Kết luận: KHẢ THI, nhưng phải sửa 4 chỗ trong plan trước khi giao Codex

Ý tưởng dùng chung điều kiện với trang Vận đơn là đúng, và không thêm lượt quét. Nhưng plan đang giả định "Đơn chốt" của bảng Từng nhân viên giống "đơn chốt" của Vận đơn. Hai cái đó **khác nhau**, nên tiêu chí "khớp số Vận đơn" trong plan sẽ không đạt.

## A. Phải sửa

**A1. Đơn chốt của bảng không gồm đơn hủy; Vận đơn thì có. Số sẽ không khớp.**
- Bảng Từng nhân viên tính Đơn chốt bằng `CLOSED` = `status_code NOT IN (0,6,7)` (`lib/stats.ts:32-34`, dùng ở `product-groups/route.ts:47`). Đơn đã hủy, kể cả hủy sau khi kho xác nhận, **không** nằm trong Đơn chốt.
- Vận đơn lấy `status_code NOT IN (0,7)` (`van-don/route.ts:55`), nên **có** đơn hủy.
- Demo 7 ngày: Vận đơn có 1.114 đơn, trong đó 111 hủy, 36 hủy sau khi đã XN. Bảng Từng nhân viên chỉ có 1.003 đơn chốt.
- Hậu quả:
  - Tiêu chí B2 "whConfirmed từng người khớp số đã xác nhận ở Vận đơn" sẽ lệch đúng bằng số đơn hủy sau XN (demo lệch 36).
  - Dòng giải thích "Hủy khi chưa xác nhận" luôn bằng 0 ở chế độ mặc định, vì đơn mã 6 không có trong tập.
  - Câu "Đơn bị hủy sau khi đã xác nhận vẫn tính" ở mục 2 không đúng với bảng này.
- Sửa (QA khuyên cách 1):
  1. Giữ mẫu số là Đơn chốt của bảng, đúng như anh nói "tỉ lệ bao nhiêu %" trên cột đơn chốt anh đang xem. Bỏ dòng "Hủy khi chưa xác nhận" khỏi ô giải thích. Đổi tiêu chí đối chiếu thành: số của bảng = số "đã xác nhận" của Vận đơn **trừ đơn hủy sau XN** của người đó. Ghi rõ trong `definitions` là "không gồm đơn đã hủy".
  2. Hoặc thêm đơn hủy vào riêng cột này để khớp Vận đơn. Khi đó tỷ lệ lại có mẫu số khác cột Đơn chốt ngay bên cạnh, người xem dễ nhầm. Không khuyên.

**A2. Trang CSKH đếm theo người chăm sóc, Vận đơn đếm theo người lên đơn.**
- Ở trang CSKH, `staffCol` = `COALESCE(NULLIF(care_id,''), seller_id)` (`product-groups/route.ts:49`). Vận đơn luôn gom theo `seller_id`.
- Demo 7 ngày: 208/1.114 đơn có `care_id` khác `seller_id`.
- Sửa:
  - tiêu chí "khớp Vận đơn theo người chốt" chỉ áp cho trang Sale;
  - ở CSKH, đối chiếu bằng dòng Tổng (cùng POS, cùng ngày) thay vì từng người;
  - dòng "Người chốt tự bấm Đã xác nhận" phải so `first_confirmed_by` với **staffCol** của trang, không cố định `seller_id`.

**A3. Điều kiện `NOT IN (17,6)` sẽ đếm cả đơn Mới khi người xem đổi bộ lọc trạng thái.**
- Khi bộ lọc trạng thái khác mặc định, tập đơn lấy theo `statusSql` và `COALESCE(first_closed_at, created_at)` (`product-groups/route.ts:46-47`). Tập này có thể chứa mã 0 (Mới) hoặc 7.
- Với `NOT IN (17,6)`, đơn Mới chưa ai gọi sẽ được đếm là "Đã XN kho".
- Sửa `WH_CONFIRMED_SQL` thành `first_confirmed_at IS NOT NULL OR status_code NOT IN (0,17,6,7)`, `isWhConfirmed` cũng vậy.
  - Trang Vận đơn vốn đã loại 0 và 7, nên số Vận đơn không đổi. Tiêu chí B1 "số Vận đơn y như trước" vẫn đạt.
  - Thêm 2 test: mã 0 → không; mã 7 có `first_confirmed_at` → không.

**A4. Chế độ thẻ (mặc định) phải cộng cột mới một lần mỗi đơn.**
- Bảng mặc định `dim='tag'` ở cả Sale lẫn CSKH (`product-group-blocks.tsx:163`). Một đơn nhiều thẻ thì `put` được gọi nhiều lần cho các nhóm, cộng thêm một lần cho `'__all'` (`route.ts:116-120`).
- Plan ghi "`put` cộng theo từng đơn" chưa đủ rõ. Ghi cụ thể: chỉ cộng bốn trường mới ở lần gọi `'__all'`, và để trống ở `byGroup` (cột này không chia theo nhóm).
- Thêm test: một đơn hai thẻ thì `whConfirmed` của người đó tăng 1, không phải 2.

## B. Nên sửa

- **B1. Ô giải thích thêm dòng "Không rõ người XN".** Có loại đơn tính là đã XN chỉ nhờ trạng thái, vì thiếu lịch sử, nên `first_confirmed_by` rỗng. Demo không có loại này (0), nhưng dữ liệu thật cũ có `history_limited`. Thêm dòng này để bốn dòng cộng đúng ra cột.
- **B2. Danh sách `?wh=1` lấy tên người XN.** `pos_users` có thể có nhiều dòng cho một `user_id` (mỗi POS một dòng). Join phải theo cả `pos_id`, hoặc dùng `MAX(name) … GROUP BY user_id` như `van-don/route.ts:63`, để không nhân đôi dòng đơn.
- **B3. Tên cột.** Anh nói "đã xác nhận từ kho". "Đã XN kho" ngắn, nhưng nên để tiêu đề cột là "Kho đã XN" hoặc giữ "Đã XN kho" kèm `title` "Đơn chốt đã được kho gọi xác nhận". Dòng nhỏ `x/y đơn chốt` là đúng tên gọi.

## C. Trả lời 3 câu của tổ

| # | Câu hỏi | Trả lời |
|---|---|---|
| 1 | Định nghĩa có hợp "kho gọi xác nhận"? Có trừ đơn tự bấm? | Hợp, vì bước 17 → 1 là bước Vận đơn/Kho gọi khách (`lib/van-don.ts:1`). Đồng ý KHÔNG trừ đơn tự bấm, vì Vận đơn cũng không trừ và đã có `self` riêng (`lib/van-don.ts:89`). Demo tự bấm 54/1.114 (~5%). Khi lên thật, nếu phần tự bấm của ai đó vượt ~10% thì báo anh, vì khi đó cột không còn đúng nghĩa "kho gọi". Nhưng phải sửa mẫu số và đối chiếu theo A1, A2, A3. |
| 2 | Rủi ro hiệu năng câu `'__all'` | Thấp. Mặc định `dim='tag'` đã đọc cả dòng (`tags_json`), nên câu `'__all'` chỉ chạy khi người xem chọn nhóm Chính/Sản phẩm. Ở chế độ đó, đọc thêm dòng là tối đa ~2 lần số dòng đọc của một câu, trong batch 4–6 câu. Đồng ý cách đo `rows_read` trước và sau, ngưỡng 2 lần. Đo ở cả `dim=tag` và `dim=main`. |
| 3 | B1, B2, B3 đủ rõ cho Codex? | Gần đủ: dòng số rõ, file rõ, tiêu chí rõ. Còn thiếu 4 điểm A1–A4. Riêng tiêu chí đối chiếu ở mục 7 phải viết lại theo A1, A2, nếu không Codex sẽ báo "không khớp" hoặc tự đổi định nghĩa Đơn chốt để cho khớp. |

## D. QA sẽ kiểm khi có demo
- Sale, 7 ngày, tất cả POS: cột mới từng người = Vận đơn "đã xác nhận" − hủy sau XN của người đó.
- Đã XN kho + Còn chờ XN = Đơn chốt, từng người và dòng Tổng.
- CSKH: dòng Tổng khớp; người có `care_id` khác `seller_id` không bị đếm sang người khác.
- Đổi bộ lọc trạng thái sang có "Mới": đơn Mới không vào cột.
- Đơn nhiều thẻ không bị đếm đôi. Bấm số ra đúng chừng ấy đơn. Sắp xếp, nền tối, 390px.
