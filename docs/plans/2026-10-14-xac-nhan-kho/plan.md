# Cột "Đã XN kho" ở bảng Từng nhân viên (Sale, CSKH)

Bản 2.1: đã sửa theo QA (`danh-gia.md`, A1–A4 và các điểm nên sửa). Bản 2.1 sửa công thức theo câu hỏi của Codex ở B1: mã 0 và 7 bị loại trước, kể cả khi có giờ xác nhận.

Anh Vũ yêu cầu ngày 14/10/2026: "thêm 1 cột là đã xác nhận từ kho, nghĩa là kho gọi xác nhận, xem bao nhiêu đơn, tỉ lệ bao nhiêu %".

## 1. Mục tiêu
Bảng **Từng nhân viên** ở trang Bộ phận > Sale (và trang CSKH, vì dùng chung khối) có thêm một cột **Đã XN kho**:
- Dòng trên là số đơn chốt của người đó mà kho đã gọi xác nhận.
- Dòng dưới là tỷ lệ %, kèm chữ nhỏ dạng `x/y đơn chốt`.
- Bấm vào số thì mở danh sách đúng các đơn đó, giữ nguyên mọi bộ lọc của trang.
- Có dòng Tổng ở cuối bảng và sắp xếp được theo cột này.

## 2. Định nghĩa (chốt)
Quy trình hiện tại: Sale hoặc CSKH chốt đơn, đơn vào **Chờ xác nhận** (mã 17). Phòng Vận đơn và Kho gọi khách, rồi chuyển đơn sang **Đã xác nhận** (mã 1). Xem `lib/van-don.ts:1`.

- **Đã XN kho** là số đơn trong cột **Đơn chốt** của bảng (cùng tập đơn, cùng ngày chốt, cùng bộ lọc) đã qua bước Đã xác nhận.
  - Viết bằng SQL: `status_code NOT IN (0,7) AND (first_confirmed_at IS NOT NULL OR status_code NOT IN (17,6))` (QA A3: đơn Mới và đơn Xóa không bao giờ vào cột, kể cả khi có giờ xác nhận).
  - Điều kiện này cùng gốc với `CONFIRMED` của trang Vận đơn (`app/api/reports/van-don/route.ts:15`). Nhưng Đơn chốt của bảng **không gồm đơn hủy** (`CLOSED` = `NOT IN (0,6,7)`, `lib/stats.ts:34`), còn Vận đơn có. Vì vậy với bộ lọc mặc định: số của bảng = số "đã xác nhận" của Vận đơn **trừ đơn hủy sau khi đã xác nhận** (QA A1).
- **Tỷ lệ XN kho** = Đã XN kho ÷ Đơn chốt (cùng kỳ, cùng ngày chốt, cùng bộ lọc), làm tròn 1 chữ số thập phân. Không có đơn chốt thì hiện `—`.
- Ô giải thích (`Why`) của mỗi người tách các dòng sau, cộng lại đúng bằng Đơn chốt:
  - Kho xác nhận (`first_confirmed_by` có và khác người của dòng);
  - Người chốt tự bấm Đã xác nhận (`first_confirmed_by` = **cột người của trang**: `seller_id` ở Sale, `COALESCE(care_id, seller_id)` ở CSKH; QA A2);
  - Không rõ người xác nhận (tính là đã XN nhờ trạng thái, nhưng `first_confirmed_by` rỗng vì thiếu lịch sử);
  - Còn Chờ xác nhận (mã 17).
  - Chỉ khi người xem đổi bộ lọc trạng thái có cả đơn hủy hoặc đơn Mới: thêm dòng "Khác (Mới / hủy chưa XN)" nếu lớn hơn 0.
- Ba dòng đầu cộng lại là cột Đã XN kho. Số "tự xác nhận" không trừ khỏi cột, giống trang Vận đơn. Khi lên thật, nếu ai có phần tự bấm vượt ~10% thì báo anh.

## 3. Không được đổi
- Mọi cột và số hiện có của bảng: Số chia, Đơn chốt, Tỷ lệ chốt, Doanh thu, So cùng kỳ, các cột thẻ hoặc nhóm.
- Tên gọi trên trang Vận đơn. Cột mới nằm ở trang Sale và CSKH, nói về **đơn chốt** của người bán nên được dùng chữ "chốt". Không dùng chữ "doanh thu" cho cột này.
- Không tạo chỉ mục mới, không thêm migration, không sửa `wrangler*`, `.github/workflows/*`.
- Bộ nhớ đệm 3 phút theo URL ở route (`memo`) giữ nguyên.

## 4. Hiện trạng
- Giao diện: hàm `SaleGroupBlock` ở `app/product-group-blocks.tsx:156`.
  - Tiêu đề cột: `:255-259`.
  - Ô từng người: `:266-276`.
  - Dòng Tổng: `:285-302`.
  - Danh sách đơn khi bấm: `:179` và `:314`.
  - Kiểu dữ liệu `Cell` và `GroupReport`: `:141-143`.
  - Hàm tính lại khi so cùng kỳ: `fin` ở `:187`.
- API: `app/api/reports/product-groups/route.ts`.
  - Kiểu `Cell` dòng 99, hàm `put` dòng 111, hàm `pack` dòng 137.
  - Câu lấy dòng đơn khi `dim=tag`: `rowSql`.
  - Câu theo nhóm khi `dim=main` hoặc `dim=product`, và câu `'__all'` của từng người.
  - Danh sách đơn của một ô: `?staffId=&group=`.
- Định nghĩa đơn chốt: `CLOSED` và `CLOSED_AT` trong `lib/stats.ts`. Ngày chốt là `first_closed_at`.
- Giờ và người xác nhận lần đầu: cột `first_confirmed_at` và `first_confirmed_by`, lấy từ `status_history` lúc đồng bộ (`lib/sync.ts:69`).
- Bản demo đã sinh đủ vòng đời 17 → 1 do người Vận đơn bấm, khoảng 5% đơn người chốt tự bấm (`lib/demo/world.ts:229-255`). Không cần sửa dữ liệu demo.

## 5. Thiết kế theo tầng

### lib (B1)
Chuyển định nghĩa đang nằm riêng trong route Vận đơn ra `lib/van-don.ts` để hai nơi dùng chung:
```ts
/** Đơn chốt đã qua bước Đã xác nhận (kể cả hủy sau đó). Dùng trên bảng đơn đã chốt, alias o. */
export const WH_CONFIRMED_SQL = (a = 'o') => `(${a}.status_code NOT IN (0,7) AND (${a}.first_confirmed_at IS NOT NULL OR ${a}.status_code NOT IN (17,6)))`;
/** Bản thuần TS của cùng điều kiện, để test và để tính trong code. */
export const isWhConfirmed = (o: { first_confirmed_at: string | null; status_code: number }) => ![0, 7].includes(o.status_code) && (o.first_confirmed_at !== null || ![17, 6].includes(o.status_code));
```
- Route Vận đơn đổi `CONFIRMED` thành `CASE WHEN ${WH_CONFIRMED_SQL()} THEN 1 ELSE 0 END`. Kết quả phải giữ nguyên, vì tập đơn của Vận đơn vốn đã loại mã 0 và 7.
- Test `tests/wh-confirmed.test.ts` gồm 8 trường hợp:
  - mã 17 chưa xác nhận → không;
  - mã 1 → có;
  - mã 2 không có `first_confirmed_at` (đi thẳng không qua mã 1) → có;
  - mã 6 có `first_confirmed_at` → có;
  - mã 6 không có → không;
  - mã 3 → có;
  - mã 0 → không;
  - mã 7 có `first_confirmed_at` → không.

### API (B2): `app/api/reports/product-groups/route.ts`
- `Cell` thêm bốn trường, chỉ cộng cho loại `closed`:
  - `whConfirmed`;
  - `selfConfirmed` (`first_confirmed_by` = staffCol của trang);
  - `unknownConfirmer` (đã XN nhưng `first_confirmed_by` rỗng);
  - `waiting` (mã 17).
- **Không thêm lượt quét.** Thêm cột vào các câu `closed` đang có:
  - `dim=tag`: `rowSql` thêm cột `wh`, `self`, `unk`, `st`. Một đơn nhiều thẻ gọi `put` nhiều lần, nên bốn trường mới **chỉ cộng ở lần gọi `'__all'`**, để trống ở `byGroup` (QA A4).
  - `dim=main` và `dim=product`: chỉ câu `'__all'` của từng người thêm `SUM(CASE WHEN … THEN 1 ELSE 0 END)` cho bốn trường. Cột này không chia theo nhóm.
- `pack` thêm `whRate = closed ? whConfirmed / closed * 100 : null`.
- `total` cộng thêm bốn trường mới.
- Danh sách đơn của một ô nhận thêm tham số `?wh=1`. Khi có, chỉ lấy đơn thỏa `WH_CONFIRMED_SQL()`. Mỗi đơn trả thêm:
  - `confirmed_at` = `o.first_confirmed_at`;
  - `confirm_by_name`, lấy từ `pos_users` bằng `MAX(name) … GROUP BY user_id` như `van-don/route.ts:63`, để không nhân đôi dòng đơn.
  - Lưu ý: cột hiện tên `first_confirmed_at` trong danh sách thật ra là `first_closed_at`. Giữ nguyên tên cũ để không vỡ giao diện, thêm trường mới tên khác.
- `definitions.whConfirmed`: "Đã XN kho = trong số Đơn chốt ở cột bên cạnh (không gồm đơn đã hủy), bao nhiêu đơn đã được chuyển sang Đã xác nhận, thường do Vận đơn / Kho gọi khách. Tỷ lệ = Đã XN kho ÷ Đơn chốt. Đơn còn Chờ xác nhận chưa tính."
- Hiệu năng: câu `'__all'` trước đây có thể chỉ đọc chỉ mục `idx_raw_orders_pos_closed_status_money`. Thêm `first_confirmed_at` và `first_confirmed_by` buộc D1 đọc dòng đơn.
  - Chấp nhận được vì `dim=tag` (mặc định trang Sale) vốn đã đọc dòng để lấy `tags_json`.
  - Nhưng phải đo: ghi `rows_read` của request trước và sau trên demo, ở cả `dim=tag` và `dim=main`, vào mô tả PR. Tăng quá 2 lần thì dừng lại, hỏi tổ.

### Giao diện (B3): `app/product-group-blocks.tsx`
- Kiểu `Cell` và `Sum` thêm bốn trường và `whRate`.
  - Hàm `fin` (`:187`) và phần tính dòng Tổng (`:285`, `:295`) cộng và tính lại `whRate` theo cùng công thức.
- Thêm `<SortTh k="whRate" label="Đã XN kho" />` ngay sau cột **Tỷ lệ chốt** (`:257`), có `title` "Đơn chốt đã được kho gọi xác nhận".
  - Hàm sắp xếp (`:203`) thêm khóa `whRate`: không có số thì xếp như `-1`.
- Ô từng người, theo đúng kiểu ô Tỷ lệ chốt (`:270-271`):
  - Dòng trên là `pct(s.whRate)` đậm.
  - Dòng dưới là chữ nhỏ `{whConfirmed}/{closed} đơn chốt`.
  - Bọc trong `Why`, gồm 4 dòng tách ở mục 2 và phần `definition` lấy từ `definitions.whConfirmed`.
  - Số `whConfirmed` là nút: `setPick({ staffId, name, group: null, wh: true })`. State `pick` thêm `wh?: boolean`. URL danh sách thêm `wh=1`.
- Danh sách đơn khi `wh` bật:
  - Tiêu đề là "{tên} · đơn chốt đã XN kho".
  - Thêm hai cột "Giờ XN" và "Người XN".
- Dòng Tổng: `pct(T.whRate)` và chữ nhỏ `x/y đơn chốt`, không bấm được (như ô Tỷ lệ chốt tổng).
- Không thêm cột vào phần "So cùng kỳ". Phần đó vẫn so ba chỉ số cũ.
- Màu và kiểu chữ dùng lớp có sẵn: `n`, `font-semibold`, `text-ink-3`, `num`. Không thêm màu mới.

## 6. Các bước giao Codex
Cả ba bước làm trên một nhánh `codex/xn-kho`, mỗi bước một commit, chung một PR vào `claude/project-thread-3ujeoc`. Cột "Nhánh" bên dưới chỉ để gọi tên bước.

| Bước | Nhánh | File sửa | Xong khi |
|---|---|---|---|
| B1 | `codex/xn-kho-b1` | `lib/van-don.ts`, `app/api/reports/van-don/route.ts`, `tests/wh-confirmed.test.ts` | 8 test qua; số trên trang Vận đơn (demo, kỳ 7 ngày) y như trước |
| B2 | `codex/xn-kho-b2` | `app/api/reports/product-groups/route.ts`, `tests/` (test đơn hai thẻ) | JSON có `whConfirmed`, `whRate` cho từng người và tổng; trang Sale: `whConfirmed` từng người = "đã xác nhận" ở Vận đơn trừ đơn hủy sau XN của người đó; một đơn hai thẻ chỉ tăng `whConfirmed` 1; `?wh=1` trả đúng danh sách, không nhân đôi |
| B3 | `codex/xn-kho-b3` | `app/product-group-blocks.tsx` | Cột hiện ở trang Sale và CSKH, sắp xếp được, bấm ra danh sách, dòng Tổng đúng, sáng và tối đều đọc được, khổ 390px cuộn ngang trong bảng |

Làm theo thứ tự B1 → B2 → B3. Bước sau chỉ bắt đầu khi bước trước đã qua bốn lệnh kiểm.

## 7. Kiểm thử
- Chạy đủ bốn lệnh: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`.
- Đối chiếu số trên demo, với bộ lọc 7 ngày gần nhất và Tất cả POS:
  - Trang Sale: cột mới của từng người = số "Đã xác nhận" của người đó ở Vận đơn > Tổng quan > theo người chốt, **trừ** đơn hủy sau khi đã xác nhận.
  - Trang CSKH: chỉ đối chiếu dòng Tổng, vì trang này tính theo người chăm sóc. Người có `care_id` khác `seller_id` không bị đếm sang người khác.
  - Đã XN kho + Còn Chờ xác nhận = Đơn chốt, ở từng người và dòng Tổng (bộ lọc trạng thái mặc định).
  - Đổi bộ lọc trạng thái sang có "Mới": đơn Mới không vào cột.
  - Bấm số của một người: danh sách có đúng chừng ấy đơn, đơn nào cũng có Giờ XN, trừ đơn đi thẳng không qua mã 1.
  - Đổi bộ lọc Tất cả / Sale / CSKH, đổi POS, đổi ngày: số đổi theo, không lỗi.
- Ảnh chụp trước và sau ở trang Sale, nền sáng và nền tối, gửi vào PR B3.

## 8. Rủi ro
- **Kỳ gần đây thấp giả.** Đơn hôm nay có thể còn Chờ xác nhận nên tỷ lệ thấp. Ô giải thích có dòng "Còn Chờ xác nhận" để người xem hiểu.
- **Đơn đi thẳng không qua mã 1.** Vẫn tính là đã xác nhận nhờ điều kiện trạng thái, giống trang Vận đơn. Nếu thiếu lịch sử thì rơi vào dòng "Không rõ người xác nhận".
- **Lùi lại.** Revert PR B3 là cột biến mất. B1 và B2 chỉ thêm trường, không đổi số cũ.
