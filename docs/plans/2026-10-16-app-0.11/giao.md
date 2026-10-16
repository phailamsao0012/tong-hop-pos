# App iPhone 0.11: Marketing xem theo POS và xếp hạng như web; chạm một nhân viên ra trang chi tiết

Tổ app viết, 16/10/2026. Codex trên PC làm hết, theo cách đã chạy lượt "Đang đóng hàng" (`a19efeb`) và lượt sửa CI (`docs/plans/2026-10-14-app-ios-android/sua-ci-giao.md`).

## 0. Cho thread PC (người chạy script)

- **Nhánh.** Worktree mới `C:\Users\PC\Projects\thp-app011`, nhánh máy `codex/app-0.11`, cắt từ `origin/claude/project-thread-avd7td` (commit chứa file này, nền là `main` `aec0ad9`).
  - Đẩy fast-forward lên `claude/project-thread-avd7td`. Không đẩy nhánh khác, không force.
  - PR nháp từ nhánh này vào `main` đã mở sẵn: mỗi lần đẩy, GitHub tự chạy `iOS` (build) và `iOS preview` (quay video).
- **Năm bước, theo thứ tự:** `W1` → `M1` → `M2` → `N1` → `T1`. Mỗi bước một lần chạy Codex, như `chay-lien-mach.sh`. Script commit từng bước riêng.
  - `W1` là mã web: máy kiểm chạy `pnpm typecheck` và `pnpm test` **ngoài sandbox** (trong sandbox bị EPERM).
  - `M1`, `M2`, `N1`, `T1` là mã iOS: PC không có Xcode. Sau mỗi bước iOS, đẩy rồi chờ workflow `iOS` trên đúng commit đó.
  - Sau `T1`, chờ thêm `iOS preview` trên commit cuối.
  - Đỏ thì lấy tên job, bước và annotation `::error::` đưa Codex một vòng sửa. Tối đa 4 vòng mỗi bước.
- **Annotation bắt đầu bằng `demo:`** là lỗi của máy chủ demo, không phải của code. Không sửa code vì nó.
  - Gặp `::warning::demo:` thì vẫn coi là xanh.
- **Lệnh cấm, vùng cấm:** như `CODEX.md` mục 4 và 5. Ngoại lệ ở mục 8 dưới đây (bước `W1` được sửa đúng các file web ghi tên).
- **Telegram:** báo bắt đầu, 20 phút một tin, xong hoặc dừng thì báo, bằng script như các lượt trước.
- **Xong:** Claude PC kiểm một lần (diff, tóm tắt 5 bước, CI xanh), rồi báo điều phối kèm commit cuối. Không mở PR mới, không merge, không phát hành.

## 1. Anh Vũ muốn gì (16/10, xem app 0.10)

1. Trang **Marketing** trên app không chọn được POS. Cũng không xếp hạng được theo doanh thu, tỷ lệ chốt hay các chỉ số khác như trên web.
2. Ở trang **So sánh nhân viên** (Nhân viên nổi bật, Cần hỗ trợ, Cân bằng data, danh sách chi tiết), chạm một người phải ra **trang chi tiết của người đó**:
   - số đơn chốt;
   - số điện thoại được chia;
   - các số khác;
   - **lý do của từng số chưa chốt được**.
   - Hiện tại chạm một người chỉ mở danh sách đơn chốt.

Đã xem:
- **Marketing.** Trang Marketing của app (`MarketingView.swift`) không có dải chọn POS. POS chỉ đi theo khi mở từ Tổng quan.
  - Bảng "Tách theo" chỉ xếp theo số về (`rowsFor`, dòng `r.sort { ($0.m.phones, …) }`).
  - Web có hai chỗ xếp hạng:
    - khối số chính `app/mkt-headline.tsx`: bảng "Tách theo" bấm tiêu đề cột để xếp, mặc định Doanh thu;
    - bảng "Xếp hạng marketer / team Marketing" trong `app/marketing-view.tsx`: 18 cách xếp, có "Tỷ lệ xác nhận", nguồn `/api/reports/marketing`.
- **Lý do chưa chốt.** Dữ liệu có sẵn trong `raw_pos_orders`: trạng thái, thẻ đơn (`tags_json`), ghi chú đơn (`note`). Ghi chú khách nằm ở bảng `customer_notes`.
  - Thẻ lý do kiểu "Không nghe máy", "Hẹn gọi lại", "Chưa tiếp cận", "Giá đắt"… đã được nhận diện bằng `OPERATIONAL_TAG` trong `lib/product-groups.ts`.
  - Chưa API nào trả thẻ, ghi chú theo từng đơn của một nhân viên. Vì vậy cần **một API mới** (bước `W1`).
- **Phân số tỷ lệ chốt lệch với %.** Dòng nhân viên trên app ghi "a chốt / b tạo", với a là Đơn chốt theo ngày chốt. Còn % máy chủ tính bằng tử số `closeRateTop`: đơn của chính mẫu số đã chốt.
  - Hai số này có thể khác nhau. Ví dụ số giả: "13 chốt / 20 tạo" nằm cạnh 60,0% (tức 12/20).
  - Trang chi tiết sẽ ghi tử số đúng, nên phải sửa luôn dòng ở danh sách cho khớp (bước `W1` thêm trường, bước `N1` đọc).

## 2. Hợp đồng API mới (bước W1 làm, app chỉ đọc)

### 2.1. `GET /api/reports/staff-detail`

**Tham số** (giống `/api/reports/overview`, để số khớp dòng của người đó ở So sánh nhân viên):
- `start`, `end` (YYYY-MM-DD, `start ≤ end`, tối đa 400 ngày): sai thì 400 `Khoảng ngày không hợp lệ.`
- `sellerId` (bắt buộc, cắt khoảng trắng, tối đa 100 ký tự): thiếu thì 400 `Thiếu mã nhân viên.`
- `posIds`: như overview, POS lạ thì 400 `Bộ lọc POS không hợp lệ.`
- `team`, `hrTeam`: `resolveHrUnit(params, parseTeam(params.get('team')))`, y như `app/api/reports/overview/route.ts`.
- `productSegment`, `orderOrigin`, `marketerId`, `status`: `parseOrderFilters(params, team)`.
- `rateBase`, `returnBase`, `success`: `parseMetricSettings(params)`. App tự gắn ba tham số này vào mọi `/api/reports/*`, ở `API.swift:48`.
- `limit`: số đơn chưa chốt trả về danh sách, 1–300, mặc định 200.

**Quyền:**
- `getSessionUser()`, chưa đăng nhập thì `unauthorized()`.
- `lib/access.ts`: thêm `['/api/reports/staff-detail', ['overview', 'center', 'compare', 'cskh-overview', 'sale-overview']]` vào `VIEW_GATES`, ngay dưới dòng `/api/reports/staff-compare`.
- SĐT khách: chỉ `owner` và `director` thấy đủ. Người khác nhận `maskPhone(...)`, như `app/api/reports/marketing/route.ts`.
  - Với người khác, `note` và `customerNote.text` cũng phải qua `maskPhonesIn` (`lib/audit.ts`), vì ghi chú có thể chứa SĐT.
- Số chia của người CSKH: ẩn với người không phải `owner` hay `director`, như overview (`hideCskhAssigned`).

**Cách tính:**
1. **Số tóm tắt lấy từ chính overview, không tính lại.** Gọi `overviewReport({ posIds, start, end, groupBy: 'day', employeeIds: [sellerId], compare: 'previous', team, unit, filters })`.
   - Không phải `owner`/`director` thì gọi `hideCskhAssigned(report, team)`, import từ `app/api/reports/overview/route.ts` (đã export, không sửa file đó).
   - Rồi gọi `annotateRates(report, parseMetricSettings(params))`.
   - Lấy dòng `byEmployee` có `sellerId` ở `current`, và ở `compare` cho kỳ trước. Không có dòng (người đã nghỉ, không có đơn) thì `summary: null`.
2. **Tập đơn mẫu số (`base`)**, trên `raw_pos_orders o`. Khoảng giờ lấy bằng `vnRangeUtc(start, end)`.
   - Điều kiện chung:
     - `o.pos_id IN (…)`;
     - `o.seller_id = ?`;
     - `o.status_code <> 7`;
     - cộng `orderFilterSql(filters, team, 'o').sql`;
     - cộng `teamFilter('o.seller_id', team, true, unit)`, như `app/api/reports/product-groups/route.ts`.
   - `kind = 'assigned'` khi `rateBase = assigned` và số chia không bị ẩn: `o.seller_assigned_at` trong kỳ.
   - Còn lại `kind = 'created'`: `o.created_at` trong kỳ. Đây cũng là mẫu số khi số chia bị ẩn.
   - Đã chốt = `closedWhere(filters, 'o')` (mặc định là `CLOSED`). Chưa chốt = phần còn lại (Mới, Hủy).
   - `base.total`, `base.closed`, `base.open = total − closed`.
   - Mẫu số mặc định phải bằng mẫu số overview:
     - `created`: `total` bằng `orders` của dòng, `closed` bằng `createdClosedOrders`;
     - `assigned`: `total` bằng `assignedOrders`, `closed` bằng `assignedClosedOrders`.
     - Test kiểm điều này (mục 3).
3. **Trạng thái của tập mẫu số:** đếm theo `STATUS_GROUPS` (`lib/stats.ts`), thứ tự `new, confirmed, shipping, delivered, returned, cancelled`.
   - Chữ: `Mới`, `Đã chốt (chờ XN, đã XN)`, `Chuyển hàng (đóng hàng, đã gửi)`, `Giao thành công`, `Hoàn`, `Hủy`. Nguyên văn `STATUS_LABELS` của `app/ui-kit.tsx`, chép sang `lib/staff-detail.ts`. Không import file giao diện vào route.
   - Mỗi nhóm `{ key, label, n, closed }`, với `closed` = nhóm thuộc phần đã chốt. Bỏ nhóm có `n = 0`.
4. **SĐT khác nhau:**
   - `createdPhones` = `COUNT(DISTINCT o.phone)` trên tập theo `created_at`.
   - `assignedPhones` = như trên, nhưng trên tập theo `seller_assigned_at`. Số chia bị ẩn thì `null`.
   - Bỏ SĐT rỗng hoặc `NULL`. Cùng điều kiện chung ở bước 2.
5. **Đơn chưa chốt:**
   - Đọc tối đa 2000 đơn của tập mẫu số mà chưa chốt, mới nhất trước, theo giờ của mẫu số (`at`), rồi `o.id`.
   - Cột cần đọc: `id`, `source_order_id`, `pos_id`, `phone`, `customer_id`, `status_code`, `tags_json`, `note`, tiền `NET`, `marketer_id`.
   - Có hơn 2000 đơn thì `reasonsPartial: true`, và lý do chỉ đếm trên 2000 đơn đó.
6. **Lý do của một đơn** (hàm thuần `reasonOf` trong `lib/staff-detail.ts`, có test):
   - `lib/product-groups.ts` export thêm `isOperationalTag(name: string): boolean` (bọc đúng `OPERATIONAL_TAG.test`), không đổi gì khác.
   - Thẻ lý do = các thẻ trong `tags_json` (tên đã cắt khoảng trắng, bỏ trùng, giữ thứ tự) mà `isOperationalTag` đúng.
   - Có thẻ lý do thì `reason` = thẻ đầu tiên, `kind: 'tag'`.
   - Không có thẻ lý do mà `note` có chữ thì `reason = 'Có ghi chú đơn, chưa gắn thẻ lý do'`, `kind: 'note'`.
   - Không có cả hai thì `reason = 'Chưa ghi lý do'`, `kind: 'none'`.
   - `reasons[]` gồm `{ reason, kind, n, byStatus: { new, cancelled } }`.
     - Xếp `n` giảm dần. `kind: 'none'` luôn ở cuối.
     - Tổng `n` bằng số đơn đã đọc ở bước 5.
   - `otherTags[]`: tối đa 12 dòng `{ tag, n }` gồm các thẻ **không** phải thẻ lý do (`productTags`) trên các đơn chưa chốt đã đọc. Xếp `n` giảm dần.
7. **Ghi chú khách gần nhất,** chỉ cho các đơn nằm trong danh sách trả về (≤ `limit`):
   - Lấy từ `customer_notes` theo `(pos_id, customer_id)`, `ORDER BY created_at DESC`, mỗi khách một ghi chú mới nhất.
   - **D1 tối đa 100 tham số mỗi câu:** chia cặp `(pos_id, customer_id)` thành từng lô ≤ 45 cặp. Chạy bằng `env.DB.batch`.
8. **Danh sách `orders[]`** (`limit` đơn đầu của bước 5), mỗi đơn:
   - `{ id, orderId, posId, posName, phone, at, statusCode, statusName, group, reason, reasonKind, tags, note, customerNote, marketerName, net }`.
   - `phone` đã che theo quyền.
   - `statusName` theo `ORDER_STATUS`.
   - `group` là khóa `STATUS_GROUPS`.
   - `tags` là mọi tên thẻ.
   - `note` cắt 300 ký tự.
   - `customerNote` là `{ text (cắt 300 ký tự), by (author_name hoặc null), at }` hoặc `null`.
   - `hasMore = base.open > orders.length`.
9. **`definitions`** (chữ nguyên văn):
   - `created`: `Đơn tạo: đơn có người bán là nhân viên này, tạo trong kỳ, trừ đơn đã xóa.`
   - `assigned`: `Đơn chia: đơn được giao cho nhân viên này trong kỳ (theo giờ chia), trừ đơn đã xóa.`
   - `closed`: `Đã chốt: đơn đang ở Chờ xác nhận trở đi (kể cả hoàn). Chưa chốt: đơn còn Mới hoặc đã hủy. Ô Đơn chốt ở trên tính theo ngày chốt, nên có cả đơn tạo hoặc chia từ trước kỳ.`
   - `reasons`: `Lý do lấy từ thẻ đơn trên Pancake (Không nghe máy, Hẹn gọi lại, Chưa tiếp cận, Giá đắt…). Đơn không có thẻ lý do nhưng có ghi chú đơn xếp vào "Có ghi chú đơn, chưa gắn thẻ lý do"; không có cả hai là "Chưa ghi lý do". Ghi chú khách gần nhất hiện kèm từng đơn để xem thêm.`
   - `productFilter` (chỉ khi `productSegment ≠ all`): `Đang lọc nhóm đơn: trạng thái và lý do chỉ tính đơn thuộc nhóm này.`

**Kết quả:**
```json
{
  "person": { "sellerId": "…", "name": "NV A", "department": "SALE" },
  "period": { "start": "…", "end": "…" },
  "previous": { "start": "…", "end": "…", "cutoff": null },
  "rateBase": "created",
  "assignedVisible": true,
  "summary": { "orders": 30, "closedOrders": 13, "closedNet": 12000000, "averageOrder": 923077,
               "assignedOrders": 28, "assignedHidden": false, "rate": 40, "rateTop": 12, "rateDen": 30,
               "createdPhones": 29, "assignedPhones": 27 },
  "previousSummary": { "orders": 25, "closedOrders": 9, "closedNet": 8000000, "averageOrder": 888889,
                       "assignedOrders": 24, "rate": 36 },
  "base": { "kind": "created", "total": 30, "closed": 12, "open": 18 },
  "statuses": [ { "key": "new", "label": "Mới", "n": 10, "closed": false } ],
  "reasons": [ { "reason": "Không nghe máy", "kind": "tag", "n": 7, "byStatus": { "new": 6, "cancelled": 1 } } ],
  "reasonsPartial": false,
  "otherTags": [ { "tag": "Team A", "n": 3 } ],
  "orders": [ { "id": "…", "orderId": "1001", "posId": "…", "posName": "…", "phone": "…", "at": "…",
                "statusCode": 0, "statusName": "Mới", "group": "new", "reason": "Không nghe máy", "reasonKind": "tag",
                "tags": ["Không nghe máy"], "note": null,
                "customerNote": { "text": "…", "by": "NV A", "at": "…" }, "marketerName": null, "net": 450000 } ],
  "hasMore": false,
  "definitions": { "created": "…", "assigned": "…", "closed": "…", "reasons": "…" }
}
```
- `previous` lấy đúng `comparePeriod` overview trả.
- `summary.rate` là `rate` của dòng đã qua `annotateRates`. `rateTop`, `rateDen` theo mục 2.2.
- Mọi số là số máy chủ tính. Header `Cache-Control: private, no-store`.

### 2.2. Thêm `rateTop`, `rateDen` vào overview (không đổi trường cũ)

- `lib/overview-report.ts`, `toMetrics`: thêm `rateTop: null as number | null, rateDen: null as number | null`, cạnh `rate`.
- `lib/overview-rates.ts`, hàm `one`: thêm `m.rateTop = closeRateTop(m, ms.rateBase); m.rateDen = closeRateBase(m, ms.rateBase);` (import từ `lib/metrics.ts`).
- Áp cho `total`, `byPos`, `byEmployee`, `byEmployeePos`, `series` như ba trường đã có.
- Số chia bị ẩn (`assignedHidden`) và `rateBase = assigned`: `rateTop` và `rateDen` là `null`, giống `rate`.

## 3. Bước W1: API mới (mã web)

**Làm:**
- `app/api/reports/staff-detail/route.ts` (mới): theo mục 2.1. Viết theo kiểu `app/api/reports/overview/route.ts` và `product-groups/route.ts`.
- `lib/staff-detail.ts` (mới): các hàm thuần (nhãn nhóm trạng thái, `reasonOf`, gom `reasons`, `otherTags`, chia lô ghi chú khách) và các câu `definitions`.
- `lib/product-groups.ts`: chỉ thêm `export function isOperationalTag`.
- `lib/access.ts`: chỉ thêm một dòng `VIEW_GATES`.
- `lib/overview-report.ts`, `lib/overview-rates.ts`: theo mục 2.2.
- `tests/staff-detail.test.ts` (mới), dùng `tests/support/d1-sqlite` (`demoWorld`) và `tests/support/session` (`loginAs`) như `tests/product-groups-packed.test.ts`:
  1. `reasonOf`: có thẻ lý do; nhiều thẻ lý do (lấy thẻ đầu); chỉ có thẻ sản phẩm và ghi chú; không có gì; `tags_json` hỏng hoặc `null`.
  2. Route trên `demoWorld`, kỳ 7 ngày, chọn một người bán có đơn chưa chốt:
     - 200;
     - `base.open = base.total − base.closed = Σ reasons.n` (khi `reasonsPartial` sai);
     - `summary.orders`, `closedOrders`, `assignedOrders`, `closedNet` bằng dòng của người đó từ `GET /api/reports/overview` cùng tham số (`employeeIds=<sellerId>&compare=previous`).
  3. `rateBase=created`: `base.total = summary.orders`, `base.closed = summary.rateTop`. `rateBase=assigned`: `base.total = summary.assignedOrders`, `base.closed = summary.rateTop`.
  4. Thiếu `sellerId` thì 400. Ngày sai thì 400.
  5. Đăng nhập vai không phải owner/director:
     - `phone` của đơn trong danh sách đã che;
     - một SĐT giả nằm trong ghi chú đơn hoặc ghi chú khách cũng đã che;
     - người CSKH có `assignedHidden: true`, `assignedPhones: null`, `base.kind = 'created'`.
  6. `scopeApi` chặn `/api/reports/staff-detail` với tài khoản không có quyền nào trong năm quyền ở mục 2.1.
  7. Overview có `rateTop`, `rateDen` ở `current.total` và `byEmployee`, bằng `closeRateTop` và `closeRateBase`.
  - Chỉ số giả, tên giả. Không SĐT thật.
- Không migration, không đổi `WORLD_VERSION`, không đổi chữ hay số của API cũ.

**Máy kiểm:** `pnpm typecheck`, `pnpm test` (ngoài sandbox) đều qua; phạm vi file đúng danh sách.

## 4. Bước M1: Marketing có dải chọn POS, "Tách theo" xếp được như web

`ios/Megatech/Megatech/MarketingView.swift`:

1. **Dải POS.**
   - Ngay dưới `PeriodChips(period: $period)` thêm `PosChipRow(selection: $pos, label: nil, allLabel: "Tất cả POS")`, như `CompareView`.
   - Đổi POS thì tải lại (khóa `key` đã có `pos`).
   - Không ghi POS này vào `AppNav` hay `NavMemory`.
   - Chip POS có dấu × ở dòng "Đang xem" giữ nguyên.
2. **Xếp theo ở "Tách theo"**, chỉ hiện ở tab Marketer và Team:
   - Chỗ đặt: bên phải chữ "Tách theo", một `Menu` có nhãn `Xếp theo: <tên> ▾`.
   - Lựa chọn (chữ = tiêu đề cột web `app/mkt-headline.tsx`):

     | Lựa chọn | Trường | Chiều xếp |
     |---|---|---|
     | `Tên` | name | tăng dần, so chữ tiếng Việt |
     | `Chi phí QC` | `m.cost` | giảm dần |
     | `Doanh thu` | `m.net` | giảm dần |
     | `ROAS` | `m.roas` | giảm dần |
     | `Đơn chốt` | `m.closed` | giảm dần |
     | `Số` | `m.phones` | giảm dần |
     | `CP / đơn` | `m.costPerClosed` | **tăng dần**, rẻ nhất lên đầu |
     | `CP / số` | `m.costPerLead` | **tăng dần**, rẻ nhất lên đầu |

   - Giá trị `nil` xếp cuối. Hòa thì xếp theo số về giảm dần, rồi tên.
   - Mặc định vẫn là `Số`: anh dặn 10/10 "MKT là đưa số về".
   - Nhớ lựa chọn bằng `@AppStorage("thp_mkt_sort")`. Đây không phải dữ liệu cá nhân. Đăng xuất thì `NavMemory.reset` bỏ luôn khóa này.
   - Đang xem một số POS (`posLimited`):
     - ba lựa chọn `ROAS`, `CP / đơn`, `CP / số` hiện xám, không chọn được;
     - trong menu có dòng chú thích `Chi phí là của mọi POS: xếp theo ROAS, CP / đơn, CP / số khi xem Tất cả POS`;
     - lựa chọn đang lưu là một trong ba cái đó thì tạm xếp theo `Số`, nhưng không ghi đè lựa chọn đã lưu.
   - Thứ hạng (`Medal`) theo thứ tự đã xếp.
3. **Dòng `MktRowView`.**
   - Số đậm bên phải là giá trị của cột đang xếp:
     - `Số`: `"<n> số"`;
     - `Đơn chốt`: `"<n> đơn"`;
     - `Doanh thu`, `Chi phí QC`, `CP / đơn`, `CP / số`: `Fmt.short`, `nil` thì `—`;
     - `ROAS`: `Fmt.roas`;
     - `Tên`: như `Số`.
   - Dòng xanh nhỏ bên dưới: `"<n> số · <n> đơn · <doanh thu>"`, bỏ phần đã hiện ở số đậm.
   - Dòng chi phí cuối giữ nguyên.
4. Không đổi số chính, biểu đồ, bảng Sản phẩm, Ngày.

## 5. Bước M2: khối "Xếp hạng marketer" giống web

File mới `ios/Megatech/Megatech/MarketingRank.swift`. Gắn vào `MarketingView` ngay dưới khối "Tách theo", trên dòng nguồn.

1. **Quyền:** chỉ hiện khi `auth.me?.canView("marketing") == true`.
2. **Nguồn:** `GET /api/reports/marketing?start&end&posIds&basis=confirmed&stage=confirmed&marketingTeamId=<…>`. Đây là mặc định của web (`marketing-view.tsx`: `useState<Basis>('confirmed')`, `useState<Stage>('confirmed')`).
   - `marketingTeamId`:
     - đang lọc team ở trang (`teamId`) thì gửi `teamId`. `__unassigned` gửi nguyên. Cùng nguồn team `MARKETING_TEAMS_KEY` với `/api/marketing/analytics`;
     - không lọc thì gửi `__all`.
   - Không gửi `marketerId`. Đang lọc một marketer thì dòng đó sáng lên, như `MktRowView.active`.
   - Đang lọc sản phẩm của sheet chi phí: ghi dưới tiêu đề `Xếp hạng không lọc theo sản phẩm của sheet chi phí.`
   - Tải lại khi đổi kỳ, POS, team. Cách tải và lỗi như `load()` của trang: `gen`, `LoadTrace("marketing-xep-hang")`, `StateView(compact:)`.
3. **Mô hình giải mã:**
   - `summary`, `byMarketer[]`, `byTeam[]`, `definitions`. Mọi trường số đều tùy chọn: thiếu thì `0`, tỷ lệ thiếu thì `nil`.
   - **Không giải mã `recentOrders`** (có SĐT khách) và các danh sách tùy chọn bộ lọc.
   - Trường số: `orders`, `phones`, `net`, `createdOrders`, `createdPhones`, `confirmedOrders`, `confirmationRate`, `shippedOrders`, `deliveredOrders`, `deliveryRate`, `returnedOrders`, `cancelledOrders`, `refundNet`, `netAfterRefund`, `newOrders`, `newNet`, `newAfterRefund`, `cskhOrders`, `cskhNet`, `cskhAfterRefund`, `averageOrder`, `revenuePerPhone`.
   - Marketer có thêm `marketerId`, `marketerName`, `marketingTeamName`. Team có thêm `marketingTeamId`, `marketingTeamName`, `marketerCount`.
4. **Giao diện** (chữ nguyên văn web):
   - Tiêu đề:
     - `Xếp hạng marketer` / `Xếp hạng team Marketing`;
     - dòng phụ `Chỉ số theo mốc: Đơn chốt (đang hiệu lực) · phễu theo đơn tạo trong kỳ`.
   - `Segmented`: `Theo team` | `Theo nhân viên` (thứ tự như web). Mặc định `Theo nhân viên`.
   - Menu xếp:
     - nhãn `Xếp theo: <tên> ▾`;
     - danh sách đúng `SORTS` của `marketing-view.tsx` theo thứ tự đó: `Tên marketer`, `Team Marketing`, `Đơn tạo`, `Số điện thoại`, `Đơn xác nhận`, `Tỷ lệ xác nhận`, `Đơn theo mốc`, `Doanh thu`, `Doanh thu New`, `Doanh thu CSKH`, `Tiền hoàn / hủy`, `Doanh thu sau hoàn hủy`, `Doanh thu / SĐT`, `AOV`, `Đã cho ĐVVC`, `Đã nhận`, `Tỷ lệ giao thành công`, `Hoàn / hủy`;
     - chế độ team dùng `TEAM_SORTS`: `Tên team`, bỏ `Team Marketing`;
     - mặc định `Doanh thu`.
   - Giá trị xếp: chép đúng `switch` của `rows`/`teamRows` trong `marketing-view.tsx`. `Hoàn / hủy` = `returnedOrders + cancelledOrders`, như web.
     - Tên xếp tăng dần (chữ tiếng Việt), còn lại giảm dần.
     - `nil` cuối; hòa thì theo Doanh thu giảm dần.
   - **Mỗi dòng:**
     - `Medal(rank:)`, tên (đậm, một dòng), dòng phụ:
       - nhân viên: tên team;
       - team: `"<marketerCount> marketer"`.
     - Bên phải, số đậm là giá trị cột đang xếp:
       - tiền: `Fmt.short`;
       - tỷ lệ: `Fmt.pct`;
       - số đếm: `Fmt.int`;
       - `Hoàn / hủy`: `"<hoàn> / <hủy>"`.
     - Dòng nhỏ: `Doanh thu <short> · Tỷ lệ XN <pct>`. Đang xếp theo một trong hai thì thay phần đó bằng `SĐT <int>`.
   - Hiện 12 dòng, nút `Xem tất cả <n> dòng` / `Thu gọn`, như "Tách theo".
   - Cuối danh sách một dòng xám: `Tổng đơn duy nhất: <giá trị cột đang xếp lấy từ summary>`. Tỷ lệ lấy `summary.confirmationRate` / `deliveryRate`. Cột tên thì bỏ dòng này.
   - **Chạm một dòng** mở sheet `Chi tiết`:
     - tiêu đề là tên;
     - các dòng nhãn → số theo đúng thứ tự cột web: `Đơn tạo`, `SĐT`, `Đơn XN`, `Tỷ lệ XN`, `Đơn theo mốc`, `Doanh thu`, `DT New` (dòng phụ `<newOrders> đơn · sau hoàn hủy <newAfterRefund>`), `DT CSKH` (dòng phụ tương tự), `Hoàn / hủy (tiền)` (đỏ, `−<tiền>`; 0 thì `0 đ` theo `Fmt.money`), `Sau hoàn hủy`, `DT / SĐT`, `AOV`, `Đã cho ĐVVC`, `Đã nhận`, `% giao TC`, `Hoàn / hủy` (`<hoàn> / <hủy>`);
     - nút `Xem riêng marketer này` (nhân viên) hoặc `Xem riêng team này` (team): đóng sheet, rồi đặt `marketerId` hoặc `teamId` của trang, như `pick(_:)`. Nhân viên thì `teamId = nil`.
   - Cuối khối: nhóm `Cách tính` thu gọn, mở ra hiện `definitions` máy chủ trả (nhãn: nội dung).
   - Tiền dùng đúng các hàm `Fmt` đang dùng trong `MarketingView`, để chế độ ẩn tiền che như các khối khác.
   - Không tự tính số nào khác ngoài phép cộng `Hoàn / hủy` để xếp như web.
5. `DecodeSelfTest.swift`: thêm ca giải mã JSON số giả có đủ trường, thiếu trường, và có `recentOrders` (phải bỏ qua được).

## 6. Bước N1: trang chi tiết một nhân viên

### 6.1. Điều hướng
- `Shared.swift`:
  - thêm `case staffDetail(StaffDetailQuery)` vào `Route`, và đích `StaffDetailView(query:)` trong `appRoutes()`;
  - `restorable` là `false` (tiêu đề là tên người);
  - `NavMemory.swift`: thêm case này vào nhóm "đã chặn" của `encode`.
- `StaffDetailQuery: Hashable` gồm:
  - `period: Period`, `pos: String`, `team: String`, `product: String`, `hrTeam: String?`;
  - `sellerId`, `name`, `department` (hai cái sau chỉ để hiện, không gửi).
  - `static func of(_ e: API.EmployeeRow, in f: OrderFilters, period: Period, hrTeam: String?)`.
- Đường dẫn:
  ```
  /api/reports/staff-detail?start=…&end=…&posIds=…&team=…&productSegment=…&sellerId=<queryValue>
  ```
  - Thêm `HrUnit.suffix(hrTeam)`.
  - `rateBase`… do `API.request` tự gắn.
- **Đổi 6 chỗ đang mở `Route.orders(OrderQuery.closedOrders(of: e, in: filters))` khi chạm một người sang `Route.staffDetail(...)`:**
  - `CskhViews.swift`:
    - thẻ "NHÂN VIÊN NỔI BẬT";
    - thanh "Hiệu suất đội ngũ";
    - danh sách "So sánh chi tiết nhân viên";
    - `RankBlock` (Nhân viên nổi bật, Cần hỗ trợ, Cân bằng data).
    - `hrTeam` là `applied?.id`.
  - `Home.swift`: `EmpRows` (TOP 5, CẦN HỖ TRỢ ở Tổng quan) và chỗ `DebugTap` "nhan-vien" cùng đích. `hrTeam` theo team đang áp ở trang đó (như lúc tải overview).
  - Danh sách đơn chốt cũ vẫn mở được từ ô `Đơn chốt` trong trang chi tiết (6.2).
- `StaffTable.swift` (bảng Từng nhân viên) giữ nguyên.

### 6.2. Trang `StaffDetailView` (file mới `ios/Megatech/Megatech/StaffDetail.swift`)
Khung trang như các trang con: `ScrollView` nền `Color.cream`, `navigationTitle(name)`, `brandNav()`, kéo để tải lại, `LoadTrace("nhan-vien-chi-tiet")`.

1. **Đầu trang:**
   - `Avatar(name:)`, tên (đậm), bộ phận;
   - dưới đó `ScopeLine(period:, pos:, product:)`.
2. **Tóm tắt**, lưới 2 cột `KpiCard`. Mọi số lấy từ `summary`; `summary == nil` thì ô hiện `—`.
   - `Tỷ lệ chốt`:
     - giá trị `Fmt.pct(rate)`;
     - so kỳ trước `Fmt.points(rate − previousSummary.rate)`, chỉ khi cả hai có;
     - ghi chú: `"<rateTop> chốt / <rateDen> tạo"`, hoặc `… chia` khi `rateBase = assigned`.
   - `Đơn chốt`:
     - `Fmt.int(closedOrders)`, delta với kỳ trước;
     - ghi chú `Theo ngày chốt`;
     - chạm mở danh sách cũ: `Route.orders(OrderQuery.closedOrders(...))` cùng bộ lọc.
   - `Doanh thu chốt`: `Fmt.vnd(closedNet)`, delta, ghi chú `AOV <Fmt.short(averageOrder)>`.
   - `Số chia`:
     - `Fmt.int(assignedOrders)`, ghi chú `"<assignedPhones> SĐT khác nhau"`;
     - chạm mở `Route.orders(OrderQuery.from(filters, group: "", basis: "assigned", sellerId:, title: "Đơn chia"))`;
     - `assignedHidden` thì giá trị `—`, ghi chú `Số chia của CSKH chỉ chủ hệ thống, giám đốc xem`, không chạm.
   - `Đơn tạo`:
     - `Fmt.int(orders)`, ghi chú `"<createdPhones> SĐT khác nhau"`;
     - chạm mở danh sách `basis: "created"`, `sellerId`, tiêu đề `Đơn tạo`.
3. **Trạng thái.**
   - Tiêu đề `Đơn chia trong kỳ theo trạng thái hiện tại` khi `base.kind = assigned`; `Đơn tạo trong kỳ theo trạng thái hiện tại` khi `created`.
   - Một thanh ngang nhiều màu theo `statuses`. Màu theo mã trạng thái như `StatusBadge` đang dùng: Mới xám, Hủy đỏ, còn lại theo nhóm.
   - Mỗi nhóm một dòng `label` – `n`.
   - Dòng tổng: `"Đã chốt <base.closed> / <base.total> · Chưa chốt <base.open>"`.
   - Chữ nhỏ `definitions.closed`.
   - Chạm dòng `Mới` hoặc `Hủy` thì lọc danh sách đơn ở mục 5 theo nhóm đó. Chạm lại thì bỏ lọc.
4. **Lý do chưa chốt.**
   - Tiêu đề `"Lý do chưa chốt (<base.open> đơn)"`.
   - Mỗi `reasons[]` một dòng:
     - chữ lý do;
     - số `n` đậm;
     - thanh `n ÷ base.open`. Đây là độ dài thanh, không hiện thành số;
     - dòng nhỏ `"Mới <new> · Hủy <cancelled>"`, bỏ phần bằng 0.
     - Màu chấm theo `kind`: `tag` cam, `note` xanh dương, `none` xám.
   - Chạm một dòng thì lọc danh sách mục 5 theo lý do đó. Chạm lại thì bỏ lọc. Có chip `Đang lọc: <lý do> ✕`.
   - `reasonsPartial` thì thêm `Chỉ đếm 2.000 đơn mới nhất.`
   - Chữ nhỏ `definitions.reasons`, và `definitions.productFilter` nếu có.
   - Không có đơn chưa chốt thì một dòng `Không còn đơn chưa chốt trong kỳ.`
5. **Thẻ khác** (chỉ khi `otherTags` có):
   - tiêu đề `Thẻ khác trên đơn chưa chốt`;
   - các chip `"<tag> · <n>"`, không chạm.
6. **Đơn chưa chốt** (đã lọc theo mục 3 hoặc 4). Mỗi đơn một thẻ:
   - Dòng 1: `#<orderId>` đậm, `PosBadge`, `Fmt.dateTime(at)`, `StatusBadge(code:name:)`.
   - Dòng 2: chip lý do (màu như mục 4).
   - `Thẻ: a, b` nếu có `tags`.
   - `Ghi chú đơn: …` nếu có.
   - `"Ghi chú khách (<by>, <Fmt.dateTime(at)>): …"` nếu có; không có `by` thì bỏ phần tên.
   - `SĐT <phone>` chữ nhỏ, đúng chuỗi máy chủ trả.
   - Chạm thì mở `Route.order(id)`.
   - Cuối danh sách, khi `hasMore`: `"Hiện <số đơn> trên <base.open> đơn chưa chốt, mới nhất trước."`
7. **Lỗi:**
   - Máy chủ trả 404 (chưa có API): `StateView` với chữ `Máy chủ chưa có trang chi tiết nhân viên.`, kèm nút `Xem đơn chốt` mở danh sách cũ.
   - Lỗi khác như các trang khác.
8. Chữ cố định của trang để trong `Terms.swift`, một nhóm `StaffDetailTerms`.

### 6.3. Sửa phân số tỷ lệ chốt
- `API.swift`: `EmployeeRow` và `Metrics` giải mã thêm `rateTop: Double?`, `rateDen: Double?` (thiếu thì `nil`).
- `Metrics.swift`: `rateFrac` dùng `rateTop`/`rateDen` khi có cả hai: `"<rateTop> chốt / <rateDen> tạo|chia"`. Thiếu thì giữ cách cũ.
  - Web thật chưa có hai trường này cho tới khi W1 lên `main`, nên app 0.11 trên web thật cũ vẫn chạy như 0.10.
- `DecodeSelfTest.swift`:
  - ca có và không có `rateTop`/`rateDen`;
  - ca giải mã `staff-detail` đủ trường, thiếu `summary` (null), thiếu `customerNote`, thiếu `otherTags`.

## 7. Bước T1: lượt quay 14, đối chiếu API trong CI, số bản 0.11

1. **Số bản.** `project.pbxproj`: `MARKETING_VERSION = 0.11`, `CURRENT_PROJECT_VERSION = 11` ở cả 4 chỗ.
2. **Lượt `MEGATECH_TOUR=mktnv`** (DEBUG). Viết theo cách lượt `team` và `xnkho` trong `Tabs.swift` (`DebugTour`, `DebugTap`).
   - Mốc in `[MKT] moc=<tên>` hoặc `[NV] moc=<tên>`, lỗi tải in `[MKT] moc=loi-tai` / `[NV] moc=loi-tai`.
   - Thứ tự mốc:
     - `mkt-mo`: Phòng ban → Marketing, kỳ Tháng này, Tất cả POS. Chờ số tải xong.
     - `mkt-pos`: chạm chip POS đầu tiên trong `PosBreakdown.order`.
     - `mkt-xep-doanh-thu`: Tách theo → Xếp theo `Doanh thu`.
     - `mkt-xep-khoa`: mở menu Xếp theo khi đang chọn một POS (thấy ba lựa chọn xám), rồi đóng menu.
     - `mkt-tat-ca-pos`: chạm `Tất cả POS`.
     - `mkt-xep-cp-so`: Xếp theo `CP / số`.
     - `mkt-hang`: cuộn tới khối Xếp hạng (mặc định Doanh thu).
     - `mkt-hang-tl`: xếp `Tỷ lệ xác nhận`.
     - `mkt-hang-team`: `Theo team`.
     - `mkt-hang-chi-tiet`: `Theo nhân viên`, chạm dòng 1, sheet mở.
     - `mkt-hang-xem-rieng`: chạm `Xem riêng marketer này`, trang lọc theo người đó.
     - `nv-ss`: Phòng ban → Sale → So sánh nhân viên, kỳ Tháng này.
     - `nv-mo`: chạm dòng 1 của `Cần hỗ trợ`, hoặc của `Nhân viên nổi bật` nếu `Cần hỗ trợ` trống.
     - `nv-tom-tat`.
     - `nv-trang-thai`: cuộn tới phần trạng thái.
     - `nv-ly-do`: cuộn tới phần lý do.
     - `nv-loc`: chạm lý do đầu tiên.
     - `nv-don`: chạm đơn đầu tiên, trang đơn mở.
     - `nv-tong-quan`: về Tổng quan POS, chạm người đầu `TOP 5`, trang chi tiết mở.
     - `xong`.
   - Môi trường `MEGATECH_NV=0`: bỏ các mốc `nv-*`, in `[NV] moc=bo-qua` rồi `xong`.
3. **Log DEBUG** (chỉ mã và số; không tên, không SĐT, không mã đơn):
   - `[MKTQ] path=<đường dẫn /api/marketing/analytics>` mỗi lần trang tải xong.
   - `[MKTRQ] path=<đường dẫn /api/reports/marketing>` mỗi lần khối Xếp hạng tải xong.
   - `[MKT] tach sort=<khóa> pos=<posId|all> dau=<v1>,<v2>,<v3>`: giá trị số thô của cột đang xếp ở 3 dòng đầu tab Marketer. `nil` in `-`.
   - `[MKT] hang mode=<marketer|team> sort=<khóa> n=<số dòng> dau=<v1>,<v2>,<v3>`.
   - `[NVQ] path=<đường dẫn /api/reports/staff-detail>` mỗi lần trang chi tiết tải xong.
   - `[NV] tom-tat chot=<closedOrders> tao=<orders> chia=<assignedOrders|an> tl=<rate> tu=<rateTop> mau=<rateDen> base=<kind> tong=<total> da-chot=<closed> chua=<open>`.
   - `[NV] ly-do tong=<Σ n> nhom=<số lý do> dau=<n1>,<n2>,<n3>`.
   - `[NV] loc ly-do=1 hien=<số đơn đang hiện> ky-vong=<min(n của lý do 1, số đơn đã tải)>`.
   - `[NV] ds hien=<số đơn> con=<0|1>`.
   - `[NV] tong-quan mo=1` khi trang chi tiết mở từ Tổng quan.
4. **`.github/workflows/ios-preview.yml`**: thêm đoạn 14 sau đoạn 13, trước "Cờ Face ID". Chỉ thêm đoạn này và tên `14-mkt-nv` vào vòng `ffmpeg`. Không đổi quyền, trigger, action hay đoạn khác.
   - **Kiểm demo có API chưa:**
     ```
     curl -s -o /dev/null -w '%{http_code}' -b "thp_session=$TOKEN" "$BASE/api/reports/staff-detail?start=<hôm nay>&end=<hôm nay>"
     ```
     - Ra 400: có API, `NV=1`.
     - Ra 404: `NV=0`, và in `::warning::demo: máy chủ demo chưa có /api/reports/staff-detail; đoạn 14 chưa quay phần chi tiết nhân viên`.
     - Mã khác: `::error::14-mkt-nv: kiểm API demo trả <mã>`.
   - `rec 14-mkt-nv`, launch với `SIMCTL_CHILD_MEGATECH_TOUR=mktnv SIMCTL_CHILD_MEGATECH_NV=$NV SIMCTL_CHILD_MEGATECH_CLOCK=1 SIMCTL_CHILD_MEGATECH_NAV_RESET=1` (cùng các biến như đoạn 13).
   - Log vào `$RUNNER_TEMP/mktnv-14.txt`, `face_on_ask`.
   - Hàm `wait_mktnv <mốc> [giây]`:
     - như `wait_team`, khớp `^\[(MKT|NV)\] moc=<mốc>$`;
     - gặp `moc=loi-tai` thì `::error::14-mkt-nv: lỗi tải khi chờ <mốc>`;
     - `tour_log_tail` thêm `MKT|NV`.
   - Mỗi mốc chụp `$OUT/14-<mốc>.png`.
   - **Đối chiếu Marketing** (ghi `$OUT/14-mkt-api.txt`):
     - Đường dẫn `[MKTQ]` cuối cùng trước mốc `mkt-xep-doanh-thu` phải có `posIds=<một POS>`.
     - Lấy `[MKTRQ]` cuối cùng trước mốc `mkt-hang-tl`, `curl` về, xếp `byMarketer` theo `confirmationRate` giảm dần (`None` cuối).
     - 3 giá trị đầu phải bằng `dau=` của dòng `[MKT] hang mode=marketer sort=rate`, sai số 0,05.
     - Lệch thì `::error::14-mkt-nv: xếp hạng Tỷ lệ xác nhận lệch API (app … / API …)`.
   - **Đối chiếu nhân viên** (khi `NV=1`, ghi `$OUT/14-nv-api.txt`):
     - `curl` đường dẫn `[NVQ]` đầu tiên. Kiểm:
       - `base.open == base.total − base.closed`;
       - `Σ reasons.n == base.open` (khi `reasonsPartial` sai);
       - các số trong dòng `[NV] tom-tat` đầu tiên bằng `summary` và `base` của API.
     - Rồi gọi `/api/reports/overview` cùng `start`, `end`, `posIds`, `team`, `productSegment`, `hrTeam`, thêm `employeeIds=<sellerId>&compare=previous&groupBy=day`, cùng `rateBase` có trong đường dẫn.
       - Dòng `byEmployee` của người đó phải có `closedOrders`, `orders`, `assignedOrders` bằng `summary`.
     - Có dòng `[NV] loc` thì `hien == ky-vong`.
     - Có dòng `[NV] tong-quan mo=1`.
     - Mỗi lệch in `::error::14-mkt-nv: <tên số> app <a> API <b>`.
   - File `$OUT/14-*-api.txt` chỉ ghi số và tên khóa, không tên người, không SĐT, không mã nhân viên.
   - `stop; mark "het-14"`.
5. Cuối đoạn: `grep -E '^\[(MKT|NV)\]' … > "$OUT/14-mkt-nv-app.txt"`. Không chép dòng `[MKTQ]`, `[MKTRQ]`, `[NVQ]` (có mã nhân viên).

## 8. File được sửa ở từng bước (máy kiểm phạm vi theo bảng này)

| Bước | File |
|---|---|
| W1 | `app/api/reports/staff-detail/route.ts` (mới), `lib/staff-detail.ts` (mới), `tests/staff-detail.test.ts` (mới), `lib/product-groups.ts`, `lib/access.ts`, `lib/overview-report.ts`, `lib/overview-rates.ts` |
| M1 | `ios/Megatech/Megatech/MarketingView.swift`, `ios/Megatech/Megatech/NavMemory.swift` (chỉ thêm khóa vào `reset`), `ios/Megatech/Megatech/Terms.swift` |
| M2 | `ios/Megatech/Megatech/MarketingRank.swift` (mới), `MarketingView.swift`, `DecodeSelfTest.swift`, `Terms.swift` |
| N1 | `ios/Megatech/Megatech/StaffDetail.swift` (mới), `Shared.swift`, `NavMemory.swift`, `CskhViews.swift`, `Home.swift`, `API.swift`, `Metrics.swift`, `DecodeSelfTest.swift`, `Terms.swift`, `ios/Megatech/WidgetShared/Format.swift` (chỉ khi cần định dạng mới) |
| T1 | `ios/Megatech/Megatech/Tabs.swift`, các file iOS của M1/M2/N1 (chỉ thêm móc `#if DEBUG` cho lượt quay), `ios/Megatech/Megatech.xcodeproj/project.pbxproj` (chỉ hai số bản), `.github/workflows/ios-preview.yml` (chỉ đoạn 14 và tên trong vòng `ffmpeg`) |

- Mọi bước được viết `.codex-out/<bước>/`. Thread PC được thêm `docs/plans/2026-10-16-app-0.11/ket-qua.md` khi xong.
- Bước W1 là ngoại lệ của `CODEX.md` mục 4 (cấm `app/**`, `lib/**`, `tests/**`): chỉ đúng 7 file trên.

## 9. Máy kiểm sau mỗi bước (thêm vào phần chung của `CODEX.md` mục 12)

- Phạm vi file theo mục 8. Không file khóa, không `.env`, không CRLF.
- Có tóm tắt đủ mẫu.
- Lệnh cấm thì dừng cả phần.
- Lọc dữ liệu nhạy cảm (regex NHAY như lượt Android) trên diff: SĐT 10 số, email, token.
- `W1`: `pnpm typecheck` và `pnpm test` mã thoát 0. `git diff` không đổi chữ trong `definitions` cũ của overview, product-groups, marketing.
- iOS: không thư viện mới, không `WebView`, không `print` ngoài `#if DEBUG`.
- `T1`: `ios-preview.yml` chỉ khác ở đoạn 14 và vòng `ffmpeg`. So bằng `git diff -U0`: không dòng nào khác bị sửa.

## 10. Không làm ở lượt này

- Android: tổ app viết phần ghi thêm sau khi anh duyệt bản iPhone.
- Giao diện web: không đổi trang nào.
- Gộp vào nhánh demo, mở PR mới, merge `main`, phát hành: tổ app và điều phối lo sau khi xong (mục 11).

## 11. Sau khi chạy xong (tổ app, điều phối)

1. Điều phối gộp nhánh này vào nhánh demo, theo thứ tự với các việc khác, để demo có `/api/reports/staff-detail`. Không đổi `WORLD_VERSION`.
2. Tổ app chạy lại `iOS preview` (workflow_dispatch) trên nhánh này, kiểm video đoạn 14 một lần.
3. QA kiểm độc lập số của API mới trên demo (khớp overview, lý do cộng đủ, che SĐT, ẩn số chia CSKH).
4. Anh xem video. Anh ok thì merge PR vào `main` (web thật có API mới, `iOS` tự đăng bản 0.11). Rồi chạy lại `Deploy demo` trên nhánh demo, vì `deploy.yml` đè demo khi merge `main`.

## 12. Tóm tắt mỗi bước

Theo mẫu `CODEX.md` mục 11, thêm mục `## Số đối chiếu`: ghi các dòng `[MKT]`, `[NV]` (số demo) nếu bước có. Không tên người, không SĐT, không số thật.
