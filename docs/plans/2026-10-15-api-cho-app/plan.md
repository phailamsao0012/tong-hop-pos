# Số mới cho app (W1, W2, W5) và ô tìm đơn phía máy chủ (15/10/2026)

Tổ web tổng viết. Anh Vũ chọn "Chờ web đủ" lúc 05:25Z ngày 15/10: app iPhone 0.10 chỉ phát hành khi web thật có đủ số mới. Codex làm hết các bước dưới đây liền một mạch (script `chay-lien-mach.sh` cùng thư mục). Tổ web tổng kiểm một lần khi xong, rồi QA kiểm số trên demo. Lên web thật chỉ khi anh nhắn đồng ý.

## 1. Mục tiêu

- **W1, W2, W5:** app chỉ hiện số máy chủ trả, không tự cộng trừ. Web phải trả sẵn các số app cần, đúng hợp đồng trong plan app: `git show origin/claude/project-thread-avd7td:docs/plans/2026-10-14-app-ios-android/plan.md`, **mục 4.2.1, 4.2.2 và 4.2.6** (bảng W1, W2, W5 và danh sách "W5: luật của `chart`"). Plan này không chép lại hợp đồng; đọc thẳng ở đó.
- **S1, S2 (ô tìm đơn, lần A của app):** ô tìm đơn và ô Hồ sơ khách của app gọi `/api/raw/orders?q=` và `/api/reports/customers?q=`. Máy chủ phải tìm đúng và nhẹ: tra mã đơn theo khoá chính, SĐT theo chỉ mục có sẵn, thoát ký tự đặc biệt của `LIKE`, ghi nhật ký mỗi lần tìm, giới hạn số lượt tìm. Yêu cầu chi tiết ở mục 4 (S1, S2) dưới đây.

## 2. Không được đổi

- Không đổi số nào web đang hiện, không đổi cách tính, tên nghiệp vụ hay quyền xem. Mọi trường mới là **thêm**; trường cũ giữ nguyên tên, kiểu và giá trị.
- **Nghĩa của `waiting` giữ nguyên** (đếm mọi đơn trạng thái 17). Plan chọn cách thứ hai của hợp đồng W1: thêm trường `backToWaiting` = số đơn 17 đã có giờ XN kho, và `otherUnconfirmed` = max(0, closed − whConfirmed − (waiting − backToWaiting)). Ghi rõ nghĩa hai trường này vào `definitions`.
- Bảng "Từng nhân viên" trên web (dòng Tổng, các dòng giải thích) giữ nguyên như hiện nay. Chỉ biểu đồ to So cùng kỳ (`CompareStrip`) đổi sang đọc `chart` (W5 bắt buộc).
- Không tạo chỉ mục mới. Không thêm migration. Không câu tìm nào được quét cả bảng `raw_pos_orders`.
- Dạng JSON cũ của các route giữ nguyên để app 0.9 đang chạy không lỗi.
- Repo công khai: test và ví dụ chỉ dùng số giả, tên giả ("NV A", "Khách A"), SĐT giả dạng `0900000001`.

## 3. Hiện trạng (số dòng ở nhánh demo `e211f7f`)

- `app/api/reports/product-groups/route.ts`: `waiting` cộng ở dòng ~295, gói số mỗi người ở ~332-357, `definitions` ở cuối.
- `app/api/reports/staff-compare/route.ts`: trả `staff[].series`, `current`, `previous`, `bucket`, `group`, `compare.cutoff`.
- `app/staff-compare.tsx`: `pointValue` ~97-116, `seriesCut`/`vnHourNow` ~125-126, `CompareStrip` gộp điểm và cộng dồn ~366-412, chế độ `focus` (xem riêng một người).
- `app/product-group-blocks.tsx`: dòng Tổng do trình duyệt cộng ~1110-1160, ô So cùng kỳ dòng Tổng ~1228-1258.
- `app/api/raw/orders/route.ts:53-58`: nhánh `q` (SĐT 9–11 số so bằng; 4–8 số `phone LIKE '%…' OR source_order_id=?`; còn lại `source_order_id=? OR customer_name LIKE '%…%'`).
- `app/api/reports/customers/route.ts:55, 132`: `(phone LIKE ? OR name LIKE ?)`.
- `lib/audit.ts`: `scrubSearch` (che SĐT, chưa che tên), `classifyApi` (GET chỉ ghi khi `size ≥ 200`).
- Khoá chính đơn là `pos_id:mã` (`lib/sync.ts:57`). Chỉ mục `(pos_id, phone)` đã có.

## 4. Thiết kế

### S1. Tìm đơn và tìm khách (không đổi kết quả của từ khoá thường)
- Hàm thuần mới `lib/search-query.ts` (có test):
  - `escapeLike(s)`: thoát `\`, `%`, `_`; câu SQL dùng `LIKE ? ESCAPE '\'`.
  - `phoneVariants(digits)`: từ 9–11 số trả các dạng `0…`, `84…`, `+84…` của cùng một số (9 số thì thêm `0` đầu). Câu SQL dùng `phone IN (?, ?, ?)`, vẫn đi chỉ mục `(pos_id, phone)`.
  - `orderKeys(q, posIds)`: mã đơn (bỏ `#` đầu, chỉ chữ số hoặc chữ-số) thành danh sách `pos:mã` cho các POS được cấp.
  - `maskSearchTerm(q)`: SĐT còn 3 số cuối (`•••001`), chữ còn ký tự đầu và độ dài (`K… (6 ký tự)`).
- `app/api/raw/orders/route.ts`:
  - SĐT 9–11 số: `phone IN (biến thể)`. Kết quả với SĐT dạng `0…` không đổi.
  - Mã đơn: `id IN (orderKeys)` thay cho `source_order_id=?`. Nhánh 4–8 số: `(phone LIKE ? ESCAPE '\' OR id IN (…))`, giữ lọc ngày như cũ.
  - Tên: `customer_name LIKE ? ESCAPE '\'`, giữ lọc ngày như cũ.
- `app/api/reports/customers/route.ts`: hai chỗ `LIKE` dùng `escapeLike` và `ESCAPE '\'`.
- Nhật ký: mọi GET có `q` không rỗng ở `/api/raw/orders` và `/api/reports/customers` ghi `audit_log` hành động `search`, chi tiết là `maskSearchTerm(q)` và loại từ khoá (`phone`/`order`/`name`). Làm trong `classifyApi` và chỗ ghi chi tiết của nhật ký (xem cách `order.view` đang ghi). Không ghi nguyên văn `q` ở đâu cả, kể cả `console.log`.
- `lib/demo/`: bản giả trả đúng với các dạng mới (một đơn tháng trước, một đơn Mới có SĐT giả để QA gõ thử).

### S2. Giới hạn lượt tìm
- Binding Rate Limiting của Workers trong `wrangler.jsonc`:
  `"ratelimits": [{ "name": "SEARCH_LIMIT", "namespace_id": "1501", "simple": { "limit": 30, "period": 60 } }]`.
- `scripts/deploy-demo.mjs`: đặt `config.ratelimits` với `namespace_id` khác (`"1502"`), để demo và web thật không chung bộ đếm.
- `db/env.d.ts`: thêm `SEARCH_LIMIT?: RateLimit` (tuỳ chọn).
- Hàm `lib/search-limit.ts` `checkSearchLimit(env, userId)`: không có binding (chạy local, test) thì cho qua; vượt thì route trả 429 `{ error: 'Tìm quá nhanh, thử lại sau ít giây.' }`. Chỉ áp cho GET có `q` ở hai route trên. Khoá đếm là mã người dùng, không phải IP.

### W1. product-groups
Đúng bảng W1 của hợp đồng: mỗi `staff[]` thêm `warehouseConfirmed`, `otherUnconfirmed`, `closedFromCreated`, `closedFromEarlier`, `createdOpen`, `backToWaiting`; gốc thêm `staffTotal` (cộng các `staff[]` có mã, kèm `people`). Có ở mọi `dim`. `otherUnconfirmed` theo mục 2.

### W2. staff-compare
Đúng bảng W2: `staff[].seriesRate` (cùng công thức `pointValue`), `rowsTotal {current, previous, series, seriesRate}` cho những người có số ở kỳ đang xem.

### W5. staff-compare `chart`
Đúng bảng W5 và "W5: luật của `chart`": `chart` (cả đội) và `staff[].chart`. Đưa phần gộp và cộng dồn của `CompareStrip` về một hàm thuần dùng chung (ví dụ `lib/compare-chart.ts`), route dùng hàm đó. `CompareStrip` đọc `chart`; chế độ `focus` đọc `staff[].chart`. Cắt theo giờ lấy `cutoff` của máy chủ, không dùng giờ máy.

## 5. Các bước (Codex làm liền S1 → S2 → W1 → W2 → W5)

Nhánh máy cắt từ `origin/claude/project-thread-3ujeoc`. Script commit sau mỗi bước, xong thì đẩy lên `codex/api-app-1510`. Tổ web tổng mở PR vào nhánh demo sau khi kiểm.

**S1. Tìm đơn, tìm khách: thoát LIKE, mã đơn theo khoá chính, SĐT nhiều dạng, nhật ký tìm**
- File được sửa: `lib/search-query.ts` (mới), `lib/audit.ts`, `app/api/raw/orders/route.ts`, `app/api/reports/customers/route.ts`, `lib/demo/**`, `tests/**`.
- Xong khi: test cho 4 hàm ở 4.S1 (gõ `%`, `_`, `\` không khớp mọi dòng; `+84 900 000 001`, `84900000001`, `900000001`, `0900.000.001` cho cùng danh sách biến thể; `#12345` ra khoá `pos:12345` cho từng POS được cấp; tên bị che). Test `classifyApi` trả `search` cho hai route khi có `q`, không trả khi `q` rỗng. Test so chuỗi SQL: nhánh mã đơn dùng `id IN`, không còn `source_order_id=`; không nhánh nào có `LIKE` thiếu `ESCAPE`.

**S2. Giới hạn 30 lượt tìm mỗi phút mỗi người**
- File được sửa: `wrangler.jsonc` (chỉ thêm khối `ratelimits`), `scripts/deploy-demo.mjs` (chỉ dòng `config.ratelimits`), `db/env.d.ts`, `lib/search-limit.ts` (mới), `app/api/raw/orders/route.ts`, `app/api/reports/customers/route.ts`, `tests/**`.
- Xong khi: test với binding giả: lượt 31 trong cùng phút nhận 429 với đúng câu ở 4.S2; không có binding thì cho qua; GET không có `q` không bị đếm. `node scripts/deploy-demo.mjs --local` ghi `wrangler.demo.json` có `namespace_id` `"1502"`.

**W1. product-groups thêm trường tách sẵn và staffTotal**
- File được sửa: `app/api/reports/product-groups/route.ts`, `lib/**` (nếu tách hàm), `lib/demo/**` (thêm một đơn giả trạng thái 17 đã có giờ XN kho), `tests/**`.
- Xong khi: các test ở cột "Cách kiểm" của W1 trong hợp đồng, theo nghĩa ở mục 2 của plan này (Kho xác nhận + Người chốt tự bấm + Không rõ + (Còn Chờ xác nhận − backToWaiting) + Khác = Đơn chốt với mọi người, kể cả người có đơn 17 đã XN kho). Mọi trường cũ không đổi giá trị (test so JSON cũ và mới trên dữ liệu demo, bỏ qua trường mới).

**W2. staff-compare thêm seriesRate và rowsTotal**
- File được sửa: `app/api/reports/staff-compare/route.ts`, `lib/**`, `tests/**`.
- Xong khi: các test ở cột "Cách kiểm" của W2 trong hợp đồng.

**W5. staff-compare thêm chart, CompareStrip đọc chart**
- File được sửa: `app/api/reports/staff-compare/route.ts`, `lib/compare-chart.ts` (mới), `app/staff-compare.tsx`, `tests/**`.
- Xong khi: các test ở cột "Cách kiểm" của W5 trong hợp đồng. Ảnh trước và sau biểu đồ to (cả đội và xem riêng một người) trên `pnpm dev` với `DEMO_MODE=1`, khổ 1440 và 390px, giống nhau.

## 6. Kiểm (máy kiểm sau mỗi bước, tổ web tổng kiểm một lần cuối)

- Máy: `pnpm typecheck`, `pnpm test`, `pnpm build` qua; `pnpm lint` không thêm lỗi so với gốc nhánh; file chỉ trong danh sách của bước; không có SĐT, email, token trên dòng thêm mới.
- Tổ web tổng (một lần, khi script báo xong): đọc diff và `ket-qua.md`, chạy lại bốn lệnh, mở PR vào demo. Demo deploy xong thì nhờ QA so số W1, W2, W5 với bảng web và thử ô tìm, rồi báo Tổ app iOS.
- Web thật: chỉ khi anh nhắn đồng ý. Trước đó chạy `EXPLAIN QUERY PLAN` (chỉ đọc) cho ba câu tìm trên web thật để chắc không quét bảng.

## 7. Rủi ro

- Binding Rate Limiting cần Wrangler hỗ trợ `ratelimits`; nếu `pnpm build` hoặc `deploy-demo --local` báo lỗi khoá lạ thì S2 ghi lại lỗi nguyên văn, bỏ phần `wrangler.jsonc`, giữ `checkSearchLimit` (không binding thì cho qua). Tổ web tổng quyết khi kiểm.
- W5 đổi cách vẽ biểu đồ to của web: lùi lại bằng revert commit W5, API thêm trường không ảnh hưởng.

## 8. Khối lệnh khởi động trên Mac (anh dán một lần vào Terminal)

```
mkdir -p ~/codex-viec/api-1510 && cd ~/Projects/tong-hop-pos && git fetch -q origin claude/project-thread-3ujeoc claude/project-thread-avd7td && git worktree add -B codex/api-app-1510 ~/Projects/thp-api1510 origin/claude/project-thread-3ujeoc && cd ~/Projects/thp-api1510 && pnpm install --frozen-lockfile && nohup caffeinate -is bash docs/plans/2026-10-15-api-cho-app/chay-lien-mach.sh codex > ~/codex-viec/api-1510/chay.log 2>&1 &
```

- Chạy nền, tắt Terminal không sao, nhưng Mac phải bật và không ngủ (caffeinate giữ).
- Tiến độ ở `~/codex-viec/api-1510/tien-do.txt`. Xong thì script tự đẩy lên `codex/api-app-1510`.
- Hết lượt tài khoản `codex` thì script tự đổi sang `codex2`.
