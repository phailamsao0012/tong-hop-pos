# Plan: Vận hành đơn — cứu đơn giao thất bại, hoàn theo hãng và tỉnh, tốc độ xử lý (15/10/2026)

Tổ Ý tưởng viết, Codex làm hết, Tổ Ý tưởng kiểm một lần khi Codex xong. Lộ trình cải tiến mục 6, 7, 8. Anh Vũ chọn 15/10 ("Cả hai": đợt này trước, Lãi thật sau).

## 1. Mục tiêu

Ba trang mới trong bộ phận **Vận đơn** (cạnh "Tổng quan", "Vận hành đơn"):

1. **Giao thất bại**: danh sách đơn đang đi đường mà hãng ship báo giao không thành lần đầu, xếp theo giá trị đơn, để người lên đơn hoặc CSKH gọi khách ngay trong ngày. Kèm tỷ lệ "cứu được": đơn từng giao thất bại mà cuối cùng khách vẫn nhận.
2. **Hoàn theo hãng, tỉnh**: tỷ lệ hoàn theo hãng ship, theo tỉnh, theo hãng × tỉnh, theo lý do hoàn, theo lý do × loại đơn. Biết hãng nào, tỉnh nào hoàn cao để đổi hãng hoặc siết chốt.
3. **Tốc độ xử lý**: thời gian 4 chặng (số vào → chia cho Sale, vào Chờ xác nhận → Đã xác nhận, xác nhận → gửi hãng, gửi hãng → khách nhận), trung vị và 90% đơn, theo POS và theo người. So tỷ lệ chốt theo thời gian chờ chia số. Danh sách đơn kẹt quá ngưỡng.

## 2. Không được đổi

- Mọi số và trang đang có (Vận đơn, Vận hành đơn, Tổng quan…): không đổi cách tính, không đổi JSON trả về.
- `lib/van-don.ts`, `lib/shipping-lines.ts`: chỉ **import dùng lại**, không sửa.
- Quyền xem: không đổi quyền của trang cũ. Trang mới chỉ hiện với người đang xem được **Vận đơn** hoặc **Vận hành đơn** (xem 4.5).
- Tên số (AGENTS.md "Quy tắc gọi tên số"): ở bộ phận Vận đơn **không dùng** "bán hàng", "chốt", "doanh thu". Dùng "Đơn chuyển đi", "Đơn hoàn", "Giá trị đơn", "Người lên đơn", "Người xác nhận". Riêng trang Tốc độ, chặng 2 gọi là "Vào Chờ xác nhận → Đã xác nhận".
- Không thêm chỉ mục rộng trên `raw_pos_orders`. Chỉ được thêm đúng **một** chỉ mục một phần ở bước V1.
- Không sửa `.github/workflows/*`, `wrangler*.json*`, `worker.ts`, `lib/sync.ts` ngoài đúng các dòng nêu ở V1.
- Repo công khai: không số thật, tên khách, SĐT thật trong code, test, ảnh, tóm tắt.

## 3. Hiện trạng (đã kiểm ở commit 47d5c9b, nhánh demo `claude/project-thread-3ujeoc`)

- Bảng đơn: `raw_pos_orders`. `db/schema.ts:73-132` **thiếu** hai cột `first_closed_at` (`drizzle/0037`) và `first_sent_at` (`drizzle/0043`); nguồn thật là `drizzle/*.sql`. Test dựng D1 từ `drizzle/*.sql` (`tests/support/d1-sqlite.ts:27-34`).
- Ghi đơn: `orderStatements` ở `lib/sync.ts:59-152`. INSERT và upsert ở `:101-111`, bind ở `:113-130`. `raw_json` = toàn bộ đơn Pancake trừ `histories` (`:129`). Chỉ ghi lại đơn khi `updated_at` đổi (`onlyChanged`, `:161-175`).
- Kiểu đơn Pancake: `SourceOrder` ở `lib/pancake.ts:5-43`, **chưa có** `partner`, `shipping_address`, `returned_reason`, `returned_reason_name`.
- Trường Pancake cần (theo `docs/pancake-openapi.json`, schema `Order`):
  - `partner.partner_name` (tên hãng), `partner.partner_id`, `partner.extend_code` (mã vận đơn), `partner.partner_status` (enum, xem 4.1), `partner.first_undeliverable_at` (lần đầu giao không thành), `partner.first_delivery_at`, `partner.updated_at`, `partner.extend_update[]` (`{status, note, update_at}`).
  - `shipping_address.province_name`, `shipping_address.province_id`, `shipping_address.new_province_id`, `shipping_address.district_name`.
  - `returned_reason` (số: 1 Do khách hàng, 2 Do nhân viên, 3 Do sản phẩm lỗi, 4 Do đơn vị vận chuyển, 5 Do đổi hàng, còn lại shop tự đặt), `returned_reason_name` (chữ).
- Mã trạng thái: `lib/pancake.ts:218-225`. Không có mã "Đang giao" riêng: đang đi đường = **2 Đã gửi hàng**; chi tiết hơn chỉ có ở `partner.partner_status`. `SENT_CODES=[2,3,16,4,15,5]`, `RETURNED_CODES=[4,15,5]`, `DELIVERED_CODES=[3,16]` ở `lib/shipping-lines.ts:34-36`.
- Mốc giờ đã có cột: `created_at`, `seller_assigned_at`, `first_closed_at` (lần đầu vào 17 trở đi), `first_confirmed_at` (lần đầu vào 1), `first_sent_at` (lần đầu gửi hãng), `delivered_at` (lần đầu vào 3/16), `returned_at`.
- Chỉ mục có thể dùng: `idx_raw_orders_pos_sent_status_money` (pos_id, first_sent_at, status_code, …) WHERE first_sent_at IS NOT NULL (0044); `idx_raw_orders_pos_closed_status_money` (pos_id, first_closed_at, status_code, …) (0038); `idx_raw_orders_pos_created` (pos_id, created_at); `idx_raw_orders_pos_status_origin` (pos_id, status_code, …) (0028).
- Điền dần đơn cũ bằng bộ hẹn giờ: mẫu `fillSentAtMonth` (`lib/stats.ts:344`), gọi ở `lib/scheduler.ts:211-230`, cờ xong `SENT_AT_READY_KEY`/`SENT_AT_EPOCH` + `sentAtReady()` (`lib/stats.ts:336`). Migration không bao giờ tự điền (bài học lỗi 7429 ngày 08/10).
- Trang mẫu để chép cách làm: Vận đơn = `app/api/reports/van-don/route.ts` + `lib/van-don.ts` + `app/van-don-view.tsx` + `tests/van-don.test.ts`. Loại đơn: `orderLines(items, tagsJson)` (`lib/shipping-lines.ts:23`), tên sản phẩm `itemNames(db, ids)` (`lib/product-groups.ts:66`). Test route trên D1 giả: `tests/product-groups-wh-confirmed.test.ts` (`demoWorld`, `loginAs`).
- Che SĐT trên web: `app/api/reports/shift/route.ts:124-125` (chỉ `owner`, `director` thấy đủ, còn lại `maskPhone` từ `lib/bot-guard-core.ts:47`).
- Nhật ký xem dữ liệu cá nhân: `classifyApi` ở `lib/audit.ts:69-81`, nhãn ở `lib/audit-labels.ts`.
- Gắn trang mới: `lib/access.ts` (`VIEW_LABELS` :10-19, `IMPLIED` :40-55, `VIEW_GATES` :77-121); `app/dashboard.tsx` (`View` :162-201, `navigation` :369-406, `DEPTS` :408-416, lazy import kiểu :129-130, `SELF_HEADED` :1266, danh sách loại trừ :1536, dòng render kiểu :1616-1617, ẩn bộ lọc trạng thái chung :1456); `app/users-panel.tsx:19-30` (`VIEW_GROUPS`).
- Demo: `lib/demo/world.ts` `toSourceOrder` (:451-489) **không** có partner, địa chỉ, lý do hoàn. Lịch sử trạng thái có giờ đủ, nên trang Tốc độ đã có số ở demo.
- Báo cáo `/api/reports/*` GET được cache tự động ở `worker.ts:20-48` (theo vai trò + phiên bản dữ liệu). Không cần đăng ký gì, trả JSON dưới 3 MB.

Số dòng có thể lệch vài dòng do nhánh demo đổi; tìm theo tên hàm, tên hằng.

## 4. Thiết kế

### 4.1 Dữ liệu (bước V1)

Migration mới `drizzle/0047_ship_fields.sql` (số kế tiếp sau 0046; nếu nhánh đã có 0047 thì lấy số kế tiếp, ghi vào "Chỗ làm khác plan"):

```sql
-- Hãng ship, tỉnh, trạng thái hãng, lần đầu giao không thành, lý do hoàn (plan 2026-10-15-van-hanh-don).
-- Cột hẹp để báo cáo không phải mở raw_json ~10 KB. Đơn cũ do bộ hẹn giờ điền dần (lib/stats.ts fillShipFieldsMonth), không điền ở đây.
ALTER TABLE `raw_pos_orders` ADD COLUMN `carrier_name` text;
ALTER TABLE `raw_pos_orders` ADD COLUMN `province_name` text;
ALTER TABLE `raw_pos_orders` ADD COLUMN `partner_status` text;
ALTER TABLE `raw_pos_orders` ADD COLUMN `first_undeliverable_at` text;
ALTER TABLE `raw_pos_orders` ADD COLUMN `returned_reason` text;
```

Migration thứ hai `drizzle/0048_undeliverable_index.sql` (tách riêng như 0043/0044 để lỗi tạo chỉ mục không chặn cột):

```sql
-- Chỉ mục một phần cho trang Giao thất bại: lúc tạo cột còn NULL nên gần rỗng, không rủi ro 7429.
CREATE INDEX IF NOT EXISTS `idx_raw_orders_pos_undeliverable` ON `raw_pos_orders` (`pos_id`,`first_undeliverable_at`,`status_code`) WHERE `first_undeliverable_at` IS NOT NULL;
```

Nếu repo có thư mục `migrations/` riêng cho wrangler (xem `wrangler.jsonc` `migrations_dir`), tạo file ở đúng thư mục đó; không sửa `wrangler.jsonc`.

`db/schema.ts`: thêm 5 cột vào bảng `raw_pos_orders` (text, nullable), kèm cả `firstClosedAt`, `firstSentAt` đang thiếu (chỉ khai báo kiểu, không sinh migration mới bằng drizzle-kit). Không chạy `pnpm db:generate`.

`lib/pancake.ts` `SourceOrder`: thêm trường tùy chọn

```ts
partner?: { partner_id?: number | null; partner_name?: string | null; extend_code?: string | null; partner_status?: string | null;
  first_undeliverable_at?: string | null; first_delivery_at?: string | null; updated_at?: string | null } | null;
shipping_address?: { province_id?: string | null; province_name?: string | null; new_province_id?: string | null; district_name?: string | null } | null;
returned_reason?: number | null;
returned_reason_name?: string | null;
```

`lib/ship-fields.ts` (mới, thuần, không import D1):

```ts
export const RETURN_REASONS: Record<number, string> = { 1: 'Do khách hàng', 2: 'Do nhân viên', 3: 'Do sản phẩm lỗi', 4: 'Do đơn vị vận chuyển', 5: 'Do đổi hàng' };
export const PARTNER_STATUS_LABELS: Record<string, string> = { /* đủ 20 giá trị enum, nhãn tiếng Việt đúng như OpenAPI */ };
export const NO_CARRIER = 'Chưa có hãng';
export const NO_PROVINCE = 'Chưa rõ tỉnh';
export const NO_RETURN_REASON = 'Chưa ghi lý do hoàn';
/** Trích 5 trường hẹp từ đơn Pancake. Chuỗi rỗng/khoảng trắng = null. Tên tỉnh bỏ tiền tố "Tỉnh "/"Thành phố "/"TP. " để gộp cách viết. */
export function shipFields(o: SourceOrder): { carrier: string | null; province: string | null; partnerStatus: string | null; undeliverableAt: string | null; returnedReason: string | null };
/** Lý do hoàn: returned_reason_name nếu có chữ, không thì RETURN_REASONS[returned_reason], không thì `Lý do số ${n}`, không có gì thì null. */
export function returnReasonOf(o: Pick<SourceOrder, 'returned_reason' | 'returned_reason_name'>): string | null;
export function normalizeProvince(name: string | null | undefined): string | null;
```

Các nhãn `PARTNER_STATUS_LABELS` (chép đúng):
waiting Chờ xử lý · request_received ĐVVC đã tiếp nhận đơn · processing_picked_up Đang xử lý lấy hàng · picking_up Đang lấy hàng · delay_pickup Trễ lấy hàng · picked_up Đã lấy hàng · waiting_on_the_way Chờ trung chuyển · on_the_way Đang trung chuyển · contact_delivery_company Liên hệ ĐVVC · out_for_delivery Đang giao hàng · delay_delivery Trễ giao hàng · inform_recipient Thông báo cho người nhận · undeliverable Giao không thành · waiting_for_return Chờ chuyển hoàn · delivered Đã giao hàng · delivered_cod Đã giao hàng, đã đối soát COD · returning Đang chuyển hoàn · returned Đã chuyển hoàn · returned_cod Đã chuyển hoàn, đã đối soát COD · canceled Đã hủy vận đơn.

`lib/sync.ts` `orderStatements`: thêm 5 cột vào INSERT (cột + `?` + bind lấy từ `shipFields(o)`). Upsert:
- `carrier_name`, `province_name`, `partner_status`, `returned_reason` = `COALESCE(excluded.x, raw_pos_orders.x)` (giá trị mới thắng, nhưng bản mới thiếu trường thì giữ cũ).
- `first_undeliverable_at` = `COALESCE(MIN(raw_pos_orders.first_undeliverable_at, excluded.first_undeliverable_at), raw_pos_orders.first_undeliverable_at, excluded.first_undeliverable_at)` (giữ lần sớm nhất, giống `first_sent_at`).
Không đổi gì khác trong câu.

`lib/stats.ts`: thêm `fillShipFieldsMonth(db, posId, month, deadline)` theo đúng khuôn `fillSentAtMonth`:
- Chọn đơn `pos_id=? AND created_at>=? AND created_at<? AND first_sent_at IS NOT NULL AND carrier_name IS NULL`, `LIMIT 500` theo `rowid`.
- `UPDATE ... SET carrier_name = COALESCE(NULLIF(TRIM(json_extract(raw_json,'$.partner.partner_name')),''), ''), province_name = <bỏ tiền tố như normalizeProvince, viết bằng SQL: CASE WHEN … LIKE 'Tỉnh %' THEN SUBSTR(…,6) WHEN … LIKE 'Thành phố %' THEN SUBSTR(…,11) WHEN … LIKE 'TP. %' THEN SUBSTR(…,5) ELSE … END>, partner_status = json_extract(raw_json,'$.partner.partner_status'), first_undeliverable_at = COALESCE(first_undeliverable_at, json_extract(raw_json,'$.partner.first_undeliverable_at')), returned_reason = COALESCE(NULLIF(TRIM(json_extract(raw_json,'$.returned_reason_name')),''), CASE json_extract(raw_json,'$.returned_reason') WHEN 1 THEN 'Do khách hàng' … END)`.
- `carrier_name` rỗng `''` (không NULL) cho đơn không có hãng, để lượt sau không chọn lại mãi (giống mốc `'1970-…'` của `fillSentAtMonth`). Ở đọc báo cáo, `''` hiểu là `NO_CARRIER`.
- `raw_json` không hợp lệ: bọc `CASE WHEN json_valid(raw_json) THEN … END`.
- Hằng mới `SHIP_FIELDS_READY_KEY = 'ship_fields_ready'`, `SHIP_FIELDS_EPOCH = 1`, hàm `shipFieldsReady(db)` chép `sentAtReady`.
- Chỉ điền **6 tháng gần nhất** (tháng hiện tại và 5 tháng trước, giờ VN) để bớt lượt ghi D1.

`lib/scheduler.ts`: thêm một khối sau khối "Giờ gửi first_sent_at" (cùng điều kiện "các việc trước đã xong", cùng `light()`, cùng cách lưu `state` và bật cờ khi xong), tên trường state `shipPending` / `shipPos`. Khối chỉ chạy khi `s.sentPending` đã rỗng (cần `first_sent_at` trước).

Demo `lib/demo/world.ts` `toSourceOrder`: thêm `partner`, `shipping_address`, `returned_reason(_name)` cho đơn đã gửi, **dùng bộ số ngẫu nhiên riêng** `rng('ship:' + posId + ':' + orderId)` (đúng tên hàm rng đang có trong file), **không** rút thêm số từ bộ `r` đang dùng trong `lifecycle`/`shipOut` (làm lệch mọi số demo và vỡ test khác):
- Hãng: 4 tên giả rõ ràng là giả, ví dụ "Hãng A Express", "Hãng B Post", "Hãng C Fast", "Hãng D Ship", tỷ trọng 40/30/20/10.
- Tỉnh: lấy 12 tên tỉnh thật làm danh mục cố định (tên tỉnh không phải dữ liệu cá nhân), tỷ trọng lệch để biểu đồ có cao thấp.
- `partner_status`: theo trạng thái đơn (2 → on_the_way/out_for_delivery/undeliverable/delay_delivery; 3,16 → delivered/delivered_cod; 4 → returning/waiting_for_return; 5 → returned/returned_cod).
- `first_undeliverable_at`: khoảng 12% đơn đã gửi, giờ = giờ gửi + 1–3 ngày (không vượt giờ hiện tại của thế giới demo). Trong đó đơn đang 2 phải có ít nhất vài đơn mỗi POS mỗi ngày gần đây để danh sách Giao thất bại không rỗng; khoảng một nửa đơn từng thất bại cuối cùng thành 3/16, nửa còn lại thành 4/5 — nhưng **không đổi** trạng thái mà `lifecycle`/`shipOut` đã quyết định; chỉ chọn đơn nào gắn `first_undeliverable_at` theo trạng thái cuối của nó.
- Đơn 4/5: `returned_reason` 1–5 theo tỷ trọng 45/10/5/30/10, `returned_reason_name` khớp `RETURN_REASONS`.

### 4.2 Trang Hoàn theo hãng, tỉnh (bước V2)

`lib/return-breakdown.ts` (thuần):

```ts
export type RbOrder = { status: number; net: number; carrier: string | null; province: string | null; reason: string | null; line: string };
export type RbCell = { sent: number; sentNet: number; returned: number; returnedNet: number; delivered: number; rate: number | null; rateNet: number | null };
export type RbReport = {
  total: RbCell;
  carriers: (RbCell & { key: string })[];          // xếp theo sent giảm dần
  provinces: (RbCell & { key: string })[];         // xếp theo rate giảm dần, chỉ tỉnh sent >= MIN_SENT, còn lại gộp "Tỉnh khác (ít đơn)"
  matrix: { carrier: string; province: string; cell: RbCell }[]; // hãng × tỉnh, chỉ ô sent >= MIN_SENT
  reasons: { key: string; returned: number; share: number | null }[]; // share = % trên tổng đơn hoàn
  reasonByLine: { reason: string; line: string; returned: number }[];
};
export const MIN_SENT = 20;
export function buildReturnBreakdown(orders: RbOrder[]): RbReport;
```

- Đơn chuyển đi = `SENT_CODES`; đơn hoàn = `RETURNED_CODES`; đã nhận = `DELIVERED_CODES` (import từ `lib/shipping-lines.ts`).
- `rate` = returned ÷ sent × 100; `rateNet` theo giá trị. sent = 0 thì `null`.
- `carrier` rỗng hoặc null → `NO_CARRIER`; `province` null → `NO_PROVINCE`; lý do null (đơn hoàn) → `NO_RETURN_REASON`.
- Đơn nhiều loại đơn (`orderLines` trả nhiều phần tử): ở `reasonByLine` đếm cho mỗi loại; ở mọi bảng khác đếm một lần.

Route `app/api/reports/hoan-theo-hang/route.ts` (GET, chép khung `van-don/route.ts`):
- Tham số: `start`, `end` (YYYY-MM-DD, bắt buộc, `DATE_RE`, tối đa **93 ngày**, quá thì 400 "Chọn tối đa 3 tháng."), `posIds`, `team`/`hrTeam` như van-don (`resolveHrUnit`, `unitSubquery` lọc theo `seller_id`).
- Nhóm đơn: **đơn gửi hãng trong kỳ** theo `first_sent_at` khi `sentAtReady(env.DB)`; chưa sẵn thì theo `first_closed_at` và đơn đang ở `SENT_CODES` (giống van-don). Trả `basis: 'sent' | 'closed'`.
- SQL đọc **chỉ cột hẹp**, không đọc `raw_json`: `SELECT o.status_code, NET AS net, o.carrier_name, o.province_name, o.returned_reason, o.item_json, o.tags_json FROM raw_pos_orders o WHERE o.pos_id IN (...) AND o.first_sent_at>=? AND o.first_sent_at<? AND o.status_code IN (SENT_CODES)` (NET như van-don). Loại đơn: lấy tên sản phẩm bằng `itemNames` rồi `orderLines`.
- Thêm `ready: await shipFieldsReady(env.DB)`. Chưa sẵn thì vẫn trả số, view hiện dòng "Đơn cũ đang được điền hãng ship và tỉnh, số theo hãng/tỉnh của kỳ cũ có thể nằm ở 'Chưa có hãng'".
- `definitions`: "Đơn chuyển đi", "Đơn hoàn", "Tỷ lệ hoàn" (đơn hoàn ÷ đơn chuyển đi; theo giá trị = giá trị hoàn ÷ giá trị chuyển đi), "Kỳ gần đây tỷ lệ hoàn thấp vì đơn chưa kịp hoàn về" (chép câu ở van-don route), "Hãng ship", "Tỉnh" (theo địa chỉ nhận trên Pancake; từ 1/7/2025 cả nước còn 34 tỉnh, đơn cũ có thể mang tên tỉnh cũ), "Lý do hoàn" (lý do kho chọn trên Pancake khi hoàn).

View `app/return-breakdown-view.tsx`:
- Thanh trên: `PageHeader` ("Hoàn theo hãng, tỉnh"), `PeriodToolbar`, `PosChips`, chọn team như `van-don-view.tsx`.
- 4 thẻ số: Đơn chuyển đi, Đơn hoàn, Tỷ lệ hoàn, Hãng hoàn cao nhất (tên + %; chỉ xét hãng sent ≥ `MIN_SENT`).
- Bảng **Theo hãng ship** (cột: Hãng, Đơn chuyển đi, Đã nhận, Đơn hoàn, Tỷ lệ hoàn, Tỷ lệ hoàn theo giá trị), sắp được, thanh ngang nhỏ trong ô tỷ lệ (màu đỏ khi trên tỷ lệ chung, xanh #17684b khi dưới).
- Bảng **Theo tỉnh**, cùng cột, mặc định sắp theo tỷ lệ hoàn giảm dần.
- Bảng **Hãng × tỉnh**: hàng là tỉnh (top 15 theo đơn chuyển đi), cột là hãng, ô = tỷ lệ hoàn, nền đậm nhạt theo tỷ lệ; ô dưới `MIN_SENT` hiện "—".
- Bảng **Lý do hoàn** (Lý do, Đơn hoàn, % trên tổng hoàn) + bảng **Lý do × loại đơn**.
- `Definitions` cuối trang. `EmptyState` khi không có đơn. Không biểu đồ bản đồ.
- Dùng linh kiện có sẵn trong `./ui-kit` và `components/ui/`; không thêm thư viện.

### 4.3 Trang Giao thất bại (bước V3)

`lib/failed-delivery.ts` (thuần):

```ts
export type FdOrder = { id: string; posId: string; sourceOrderId: string; status: number; net: number; carrier: string | null; province: string | null;
  partnerStatus: string | null; undeliverableAt: string; sentAt: string | null; sellerId: string | null; careId: string | null; customerName: string | null; phone: string | null };
export type FdRow = FdOrder & { partnerStatusLabel: string; hoursSince: number; sellerName: string; careName: string };
export type FdReport = {
  open: FdRow[];                 // đang 2 và có first_undeliverable_at: còn cứu được; xếp net giảm dần, rồi undeliverableAt cũ trước
  stats: { failed: number; saved: number; lost: number; pending: number; saveRate: number | null };
  byCarrier: { key: string; failed: number; saved: number; saveRate: number | null }[];
};
export function buildFailedDelivery(orders: FdOrder[], names: Map<string, string>, nowMs: number): FdReport;
```

- `failed` = đơn có `first_undeliverable_at` trong kỳ. `saved` = trong số đó trạng thái hiện tại thuộc `DELIVERED_CODES`. `lost` = thuộc `RETURNED_CODES`. `pending` = đang 2. `saveRate` = saved ÷ (saved + lost) × 100, mẫu 0 thì null.
- `hoursSince` = (nowMs − undeliverableAt) / 3,6e6, làm tròn 1 chữ số.

Route `app/api/reports/giao-that-bai/route.ts`:
- `start`, `end` (kỳ theo `first_undeliverable_at`, tối đa 93 ngày), `posIds`, team như V2.
- Câu 1 (danh sách đang cứu, **không theo kỳ**, luôn lấy hết đơn đang 2 có thất bại trong 30 ngày gần nhất): `WHERE o.pos_id IN (...) AND o.first_undeliverable_at >= ? AND o.status_code = 2` — dùng chỉ mục 0048. Giới hạn 500 dòng, sắp `net DESC`. Có `truncated: true` khi đủ 500.
- Câu 2 (thống kê theo kỳ): `WHERE o.pos_id IN (...) AND o.first_undeliverable_at >= ? AND o.first_undeliverable_at < ?` gom theo `status_code`, `carrier_name` (COUNT, không lấy dòng).
- Tên người: từ `pos_users` như van-don.
- SĐT: chỉ `owner`, `director` thấy đủ; còn lại `maskPhone` (chép đúng 2 dòng ở `shift/route.ts:124-125`). Tên khách giữ nguyên (đang hiện ở các trang khác cùng quyền).
- Nhật ký: thêm vào `classifyApi` (`lib/audit.ts`) dòng `if (path === '/api/reports/giao-that-bai') return { action: 'orders.list', target };` và nhãn `'orders.list': 'Xem danh sách đơn kèm khách'` trong `lib/audit-labels.ts` (theo đúng kiểu khai báo nhãn ở đó). Sửa test liên quan nếu có test liệt kê đủ nhãn.
- `definitions`: "Giao thất bại lần 1" (hãng ship báo giao không thành lần đầu, theo Pancake), "Đang chờ cứu" (đơn còn ở Đã gửi hàng), "Cứu được" (từng giao thất bại, sau đó khách nhận), "Mất" (từng giao thất bại, sau đó hoàn), "Tỷ lệ cứu được" = cứu được ÷ (cứu được + mất), "Trạng thái hãng" (cập nhật theo lần đồng bộ đơn gần nhất; hãng đổi trạng thái mà Pancake không đổi giờ sửa đơn thì có thể trễ).

View `app/failed-delivery-view.tsx`:
- 4 thẻ: Đang chờ cứu, Giao thất bại trong kỳ, Cứu được, Tỷ lệ cứu được.
- Bảng chính "Đơn cần gọi ngay": POS (`PosBadge`), Mã đơn (bấm mở chi tiết đơn có sẵn: dùng đúng cách `raw-orders-view.tsx` mở chi tiết, nếu không tái dùng được thì chỉ hiện mã), Khách, SĐT, Tỉnh, Hãng, Trạng thái hãng, Thất bại lúc (giờ VN, "x giờ trước"), Giá trị đơn, Người lên đơn, CSKH. Đơn quá 24 giờ chưa xử lý tô nền vàng nhạt.
- Bảng "Theo hãng ship": Hãng, Giao thất bại, Cứu được, Tỷ lệ cứu được.
- Hiện `truncated` thành dòng "Chỉ hiện 500 đơn giá trị cao nhất".

### 4.4 Trang Tốc độ xử lý (bước V4)

Chặng (phút):
1. **Chia số**: `created_at` → `seller_assigned_at`. Nhóm đơn: tạo trong kỳ (`created_at`), có `seller_assigned_at`.
2. **Xác nhận**: `first_closed_at` → `first_confirmed_at`. Nhóm: vào Chờ xác nhận trong kỳ (`first_closed_at`), có `first_confirmed_at` ≥ `first_closed_at`.
3. **Gửi hãng**: `first_confirmed_at` → `first_sent_at`. Nhóm: gửi trong kỳ (`first_sent_at`), có `first_confirmed_at`.
4. **Giao tới khách**: `first_sent_at` → `delivered_at`. Nhóm: gửi trong kỳ, có `delivered_at`.

Khoảng âm hoặc thiếu mốc: bỏ, đếm vào `skipped` từng chặng, hiện "% đơn bỏ vì thiếu giờ".

Tính trong SQL theo **ô thời gian**, không trả từng đơn (bảng lớn): mỗi chặng một câu `GROUP BY pos_id, <người>, bucket` với
`bucket = CASE WHEN m<5 THEN 0 WHEN m<15 THEN 1 WHEN m<30 THEN 2 WHEN m<60 THEN 3 WHEN m<120 THEN 4 WHEN m<240 THEN 5 WHEN m<480 THEN 6 WHEN m<1440 THEN 7 WHEN m<2880 THEN 8 WHEN m<4320 THEN 9 WHEN m<7200 THEN 10 ELSE 11 END`,
`m = (julianday(b) - julianday(a)) * 1440`. Người: chặng 1 và 2 theo `seller_id`, chặng 3 theo `first_confirmed_by`, chặng 4 không theo người (theo `carrier_name`).

`lib/order-speed.ts` (thuần):

```ts
export const SPEED_BUCKETS = [5, 15, 30, 60, 120, 240, 480, 1440, 2880, 4320, 7200, Infinity]; // cận trên (phút) của từng ô
export type SpeedHist = number[]; // 12 phần tử
export function percentileFromHist(h: SpeedHist, p: number): number | null; // nội suy tuyến tính trong ô; ô cuối lấy cận dưới 7200
export type SpeedStage = { key: 'assign' | 'confirm' | 'ship' | 'deliver'; label: string; n: number; skipped: number; p50: number | null; p90: number | null; hist: SpeedHist };
export function buildSpeed(rows: { stage: SpeedStage['key']; posId: string; who: string | null; bucket: number; n: number }[], skipped: Record<SpeedStage['key'], number>): {
  stages: SpeedStage[];
  byPos: { posId: string; stages: SpeedStage[] }[];
  byPerson: { stage: SpeedStage['key']; who: string; n: number; p50: number | null; p90: number | null }[]; // chỉ người n >= 10
};
/** Tỷ lệ vào Chờ xác nhận theo thời gian chờ chia số: nhóm ô 0 (<5'), 1 (5–15'), 2–3 (15–60'), 4+ (>60'). */
export function closeRateByWait(rows: { bucket: number; leads: number; closed: number }[]): { label: string; leads: number; closed: number; rate: number | null }[];
export const STUCK_RULES: { key: string; label: string; status: number[]; from: 'created_at' | 'first_closed_at' | 'first_confirmed_at'; minutes: number; needNoSeller?: boolean }[];
```

`STUCK_RULES` (hằng, sửa được sau):
- "Số mới chưa chia quá 15 phút": status 0, `seller_id IS NULL`, từ `created_at`, 15.
- "Chờ xác nhận quá 4 giờ": status 17, từ `first_closed_at`, 240.
- "Đã xác nhận chưa gửi quá 24 giờ": status 1, 8, 9, 11, 12, 13, 20, từ `first_confirmed_at`, 1440.

Route `app/api/reports/toc-do/route.ts`:
- `start`, `end` tối đa **31 ngày** (bảng lớn), `posIds`, team như V2.
- 4 câu chặng + 1 câu tỷ lệ chốt theo chờ chia số (`created_at` trong kỳ, `seller_assigned_at` không null: `leads` = COUNT, `closed` = COUNT có `first_closed_at`) + 3 câu kẹt (mỗi luật một câu `COUNT` theo `pos_id` và người, và 50 đơn kẹt lâu nhất: chỉ trả `posId`, `sourceOrderId`, người, `minutes`; **không** trả tên khách, SĐT).
- Câu kẹt status 0 phải có điều kiện `created_at >= <giờ hiện tại − 3 ngày>` để dùng `idx_raw_orders_pos_created` và không quét đơn nháp cũ (đơn "Mới" bỏ dở trên Pancake là bình thường).
- Gọi một lần `env.DB.batch([...])`.
- `definitions` cho từng chặng, trung vị ("một nửa số đơn nhanh hơn mức này"), 90% ("9/10 đơn xong trong mức này"), ô thời gian, từng luật kẹt.

View `app/order-speed-view.tsx`:
- 4 thẻ chặng: tên chặng, trung vị (định dạng "12 phút", "3,5 giờ", "2,1 ngày"), 90%, số đơn. Màu: xanh khi trung vị dưới mốc tốt, cam khi trên (mốc tốt: chia số 5 phút, xác nhận 2 giờ, gửi hãng 24 giờ, giao 3 ngày; hằng trong file view, ghi rõ trong `definitions` là mốc tham khảo).
- Biểu đồ cột phân bố (12 ô) cho chặng đang chọn (chart.js đang có trong dự án, dùng đúng cách các view khác dùng).
- Bảng "Tỷ lệ vào Chờ xác nhận theo thời gian chờ chia số" (4 dòng).
- Bảng theo POS × chặng (trung vị / 90%), bảng theo người (chọn chặng), sắp được.
- Khu "Đơn kẹt": mỗi luật một thẻ số + bảng 50 đơn lâu nhất.

### 4.5 Gắn vào web (làm trong từng bước V2, V3, V4 cho trang của bước đó)

- `lib/access.ts`: `VIEW_LABELS` thêm `'hoan-theo-hang': 'Hoàn theo hãng, tỉnh'`, `'giao-that-bai': 'Giao thất bại'`, `'toc-do': 'Tốc độ xử lý'`. `IMPLIED` thêm mỗi id → `['van-don', 'pipeline']`. `VIEW_GATES` thêm `['/api/reports/hoan-theo-hang', ['hoan-theo-hang']]`, tương tự hai trang kia (đặt trước mọi tiền tố ngắn hơn có thể khớp nhầm).
- `app/dashboard.tsx`: thêm id vào `View`, `navigation`, lazy import, `SELF_HEADED`, danh sách loại trừ, dòng render, danh sách ẩn `GlobalStatusFilter`. `DEPTS` Vận đơn thành `tabs: [['van-don','Tổng quan'], ['pipeline','Vận hành đơn'], ['giao-that-bai','Giao thất bại'], ['hoan-theo-hang','Hoàn theo hãng, tỉnh'], ['toc-do','Tốc độ xử lý']]`. **Chỉ thêm dòng**, không sắp xếp lại, không đổi tên biến, không định dạng lại file (thread Giao diện mới đang sửa file này trên máy khác; diff càng nhỏ càng dễ gộp).
- `app/users-panel.tsx`: thêm 3 id vào nhóm `'Sale & vận hành'`.
- Icon: dùng icon `lucide-react` đã import sẵn trong dashboard nếu có (`Truck`, `Activity`…); cần icon mới thì thêm vào import có sẵn.

## 5. Các bước

Mỗi bước một commit trên nhánh `codex/van-hanh-don-1510` (tạo từ `origin/claude/project-thread-3ujeoc`). Script chạy liền một mạch lo commit và đẩy. Thứ tự chạy: **V1 → V2 → V3 → V4 → L1 → L2 → L3 (plan `docs/plans/2026-10-15-lai-that/plan.md`) → V5**.

**V1. Cột hãng ship, tỉnh, giao thất bại, lý do hoàn; đồng bộ ghi; điền đơn cũ; demo có dữ liệu**
- File được sửa: `drizzle/0047_ship_fields.sql` (mới), `drizzle/0048_undeliverable_index.sql` (mới), `db/schema.ts`, `lib/pancake.ts`, `lib/ship-fields.ts` (mới), `lib/sync.ts`, `lib/stats.ts`, `lib/scheduler.ts`, `lib/demo/**`, `tests/**`.
- Việc: như 4.1.
- Xong khi:
  - `tests/ship-fields.test.ts`: `shipFields` (đủ trường, thiếu partner, chuỗi rỗng, tên tỉnh có tiền tố "Tỉnh ", "Thành phố ", "TP. "), `returnReasonOf` (có name, chỉ có số 1–5, số lạ 9, không có gì).
  - Test `orderStatements` trên D1 giả (`emptyDb()`): ghi đơn có partner → 5 cột đúng; ghi lại bản mới có `first_undeliverable_at` muộn hơn → giữ bản sớm hơn; bản mới thiếu `partner` → giữ hãng cũ.
  - Test `fillShipFieldsMonth`: chèn đơn có `first_sent_at`, `carrier_name` NULL, `raw_json` có partner → điền đúng; `raw_json` không có partner → `carrier_name=''`; chạy lần hai không đổi gì (`writes = 0`); `raw_json` hỏng không ném lỗi.
  - Test demo: `demoWorld` 7 ngày → có đơn status 2 với `first_undeliverable_at`, có đơn 4/5 với `returned_reason`, ≥ 3 hãng, ≥ 5 tỉnh.
  - **Mọi test cũ vẫn qua, không sửa số mong đợi của test cũ.** Test cũ đỏ vì số demo đổi nghĩa là đã rút số từ bộ `r` cũ: sửa demo, không sửa test.
  - `pnpm db:migrate:local` chạy được (nếu wrangler cần đăng nhập thì bỏ qua, ghi lại; test D1 giả đã chạy migration).

**V2. Trang Hoàn theo hãng, tỉnh**
- File được sửa: `lib/return-breakdown.ts` (mới), `app/api/reports/hoan-theo-hang/route.ts` (mới), `app/return-breakdown-view.tsx` (mới), `lib/access.ts`, `app/dashboard.tsx`, `app/users-panel.tsx`, `tests/**`.
- Việc: như 4.2 và 4.5.
- Xong khi:
  - `tests/return-breakdown.test.ts`: tỷ lệ theo đơn và giá trị; sent = 0 → null; hãng rỗng → "Chưa có hãng"; tỉnh dưới `MIN_SENT` gộp; đơn hai loại đơn đếm hai lần chỉ ở `reasonByLine`.
  - Test route trên `demoWorld` + `loginAs(owner)`: 200, `total.sent > 0`, `carriers.length >= 3`, `reasons.length >= 3`; khoảng 94 ngày → 400; người chỉ có quyền `overview` → 403 (theo cách `scopeApi` trả).
  - Tổng `carriers[].sent` = `total.sent`.

**V3. Trang Giao thất bại**
- File được sửa: `lib/failed-delivery.ts` (mới), `app/api/reports/giao-that-bai/route.ts` (mới), `app/failed-delivery-view.tsx` (mới), `lib/audit.ts`, `lib/audit-labels.ts`, `lib/access.ts`, `app/dashboard.tsx`, `app/users-panel.tsx`, `tests/**`.
- Việc: như 4.3 và 4.5.
- Xong khi:
  - `tests/failed-delivery.test.ts`: saved/lost/pending/saveRate; xếp `open` theo net giảm dần; `hoursSince` đúng với `nowMs` cố định.
  - Test route trên demo: `open.length > 0`; vai trò `lead` thấy SĐT đã che (không có 10 chữ số liền), `owner` thấy đủ; `classifyApi('GET','/api/reports/giao-that-bai', …)` trả `orders.list`.

**V4. Trang Tốc độ xử lý**
- File được sửa: `lib/order-speed.ts` (mới), `app/api/reports/toc-do/route.ts` (mới), `app/order-speed-view.tsx` (mới), `lib/access.ts`, `app/dashboard.tsx`, `app/users-panel.tsx`, `tests/**`.
- Việc: như 4.4 và 4.5.
- Xong khi:
  - `tests/order-speed.test.ts`: `percentileFromHist` (một ô, nhiều ô, rỗng → null, ô cuối); `closeRateByWait` gộp ô đúng; người n < 10 bị bỏ.
  - Test route trên demo: cả 4 chặng `n > 0`, p50 ≤ p90; khoảng 32 ngày → 400; kết quả không có khoá `phone`, `customerName` ở bất kỳ đâu (duyệt sâu JSON).

**V5. Kiểm toàn bộ cả hai plan, ảnh demo, tóm tắt**
- File được sửa: `docs/plans/2026-10-15-van-hanh-don/anh/**` (mới), `docs/plans/2026-10-15-van-hanh-don/ket-qua-codex.md` (mới).
- Việc:
  - Chạy đủ `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`.
  - Nếu máy có Playwright và Chromium (`pnpm exec playwright --version` chạy được, **không cài mới**): `pnpm dev` với `DEMO_MODE=1` (tạo `.dev.vars` tạm nếu chưa có, chỉ một dòng `DEMO_MODE=1`, xoá sau), đăng nhập demo, chụp 4 trang mới (Giao thất bại, Hoàn theo hãng tỉnh, Tốc độ xử lý, Lãi thật) ở 1280 px và 390 px, sáng và tối, lưu `anh/<trang>-<rộng>-<sáng|toi>.png`. Không có Playwright thì bỏ ảnh, ghi lý do.
  - Viết `ket-qua-codex.md`: đã làm gì từng bước, lệnh và mã thoát, test mới, chỗ khác plan, câu hỏi còn lại.
- Xong khi: 4 lệnh mã thoát 0 (lint không thêm lỗi so với gốc), có `ket-qua-codex.md`.

## 6. Kiểm thử (Tổ Ý tưởng làm sau khi Codex xong)

1. Đọc diff cả nhánh: chỉ file trong danh sách, không đổi số trang cũ (chạy test cũ, so JSON trả về của `/api/reports/van-don` trên demoWorld trước/sau giống hệt).
2. `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build` trên container.
3. Chạy `pnpm dev` DEMO_MODE=1, mở 3 trang, bấm qua bộ lọc kỳ, POS, team; xem điện thoại 390 px; chế độ tối.
4. Quyền: tài khoản không có Vận đơn/Vận hành đơn không thấy tab, gọi API bị 403; lead thấy SĐT che.
5. EXPLAIN QUERY PLAN trên D1 giả cho từng câu mới: phải dùng chỉ mục (không `SCAN raw_pos_orders` toàn bảng).
6. Đạt thì mở PR `codex/van-hanh-don-1510` → nhánh demo, báo điều phối để Tổ web tổng đưa lên demo và QA so số (trang đụng số liệu). Anh xem demo. Lên web thật chỉ khi anh ok.

## 7. Rủi ro

- **Trạng thái hãng trễ**: Pancake có thể cập nhật `partner_status` mà không đổi `updated_at` của đơn, đồng bộ sẽ không ghi lại. Chưa kiểm được trên dữ liệu thật. Trang ghi rõ trong `definitions`. Sau khi lên web thật, tổ sẽ so vài đơn (anh cho phép) và nếu trễ thì thêm bước đọc lại đơn đang 2 mỗi giờ (plan sau).
- **Hãng không gửi `first_undeliverable_at`**: một số hãng có thể không trả trường này → trang Giao thất bại thiếu đơn. Sau khi lên, đếm % đơn đã gửi có trường này theo hãng (chỉ đếm).
- **Lượt ghi D1 khi điền đơn cũ**: giới hạn 6 tháng, lô 500, chỉ khi các việc nền khác xong. Lùi lại: xoá khối trong scheduler (cột NULL vô hại).
- **Đụng file với thread Giao diện mới** (`app/dashboard.tsx`): chỉ thêm dòng; khi gộp sẽ xung đột nhỏ ở `DEPTS` và danh sách view, tổ gộp tay.
- **Bảng lớn**: mọi câu lọc theo `pos_id` + cột ngày có chỉ mục, giới hạn kỳ 31/93 ngày, không đọc `raw_json` trừ bước điền đơn cũ.

## 8. Chạy trên PC (phiên Remote Control tự làm, không nhờ anh dán)

- Worktree riêng `C:\Users\PC\Projects\thp-vanhanh`, nhánh `codex/van-hanh-don-1510` tạo từ `origin/claude/project-thread-hvwbij` (= nhánh demo + hai plan này). Không đụng cây `C:\Users\PC\Projects\tong-hop-pos` ngoài `git fetch` / `git worktree add`.
- `pnpm install --frozen-lockfile`, rồi chạy nền (cửa sổ thu nhỏ, phiên Claude tắt ngay sau khi script đã chạy):
  `node docs/plans/2026-10-15-van-hanh-don/chay.mjs --tk1 <CODEX_HOME tk1> --tk2 <CODEX_HOME tk2> --tele "<lệnh gửi Telegram>" --codex-args "<cờ sandbox Windows nếu cần>"`
- Script tự: đổi tài khoản khi hết lượt, ngủ tới giờ hồi khi cả hai hết, báo Telegram (bắt đầu, từng bước, 20 phút một tin, dừng, xong), commit từng bước, đẩy `codex/van-hanh-don-1510` khi xong. Tiến độ ở `~/codex-viec/van-hanh-don-1510/tien-do.txt`.
- Muốn nhắn thêm cho Codex giữa chừng: ghi `~/codex-viec/van-hanh-don-1510/ghi-them.md`, bước sau tự đọc.
