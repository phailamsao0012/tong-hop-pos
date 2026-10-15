# Plan: Lãi thật mỗi đơn và ROAS sau hoàn (15/10/2026)

Tổ Ý tưởng viết, Codex làm hết, Tổ Ý tưởng kiểm một lần khi Codex xong. Lộ trình cải tiến mục 5. Anh Vũ chọn 15/10 ("Cả hai"), chạy **sau** plan `2026-10-15-van-hanh-don` trên cùng nhánh `codex/van-hanh-don-1510` (bước L1–L3 nối sau V4; bước V5 kiểm chung cả hai).

## 1. Mục tiêu

Web đang trả lời "bán được bao nhiêu", chưa trả lời "lãi bao nhiêu". Trang mới **Lãi thật** (chỉ chủ hệ thống) cho mỗi kỳ:
- Đơn đã gửi hãng trong kỳ, tách: khách đã nhận, đã hoàn, còn trên đường.
- Lãi gộp = giá trị đơn khách đã nhận − giá vốn hàng khách đã nhận − phí hãng ship (cả chiều đi lẫn chiều hoàn).
- Lãi sau quảng cáo = lãi gộp − chi phí quảng cáo cùng kỳ.
- **ROAS sau hoàn** = giá trị đơn khách đã nhận ÷ chi phí quảng cáo, đặt cạnh ROAS chốt đang có.
- Theo POS, theo loại đơn, theo marketer, theo team MKT. Biết marketer hoặc loại đơn nào ROAS chốt cao nhưng lãi sau quảng cáo âm.

## 2. Không được đổi

- ROAS hiện có (`lib/ad-costs.ts` `mktTotal`, `roasReport`, `mktSummary`; `lib/mkt-analytics.ts`): không đổi công thức, không đổi JSON.
- Mọi trang cũ, `raw_pos_order_items`, `item_json`: không đổi.
- Quyền: trang mới **chỉ chủ hệ thống** (như KPI, giá vốn là số nhạy cảm). Giám đốc cũng không thấy, trừ khi anh bảo sau.
- Không thêm chỉ mục mới trên `raw_pos_orders` ở plan này.
- Luật chung ở `docs/plans/2026-10-15-van-hanh-don/plan.md` mục 2 (tên số, repo công khai, file cấm) áp dụng y nguyên.

## 3. Hiện trạng (commit 47d5c9b, nhánh demo)

- Giá vốn **chưa lưu ở cột nào**. Pancake có:
  - Trong đơn: `items[].variation_info.avg_price` (giá nhập trung bình) và `items[].variation_info.last_imported_price` (giá nhập cuối). Hàng combo/ghép: `items[].is_composite`, `items[].components[] {variation_id, quantity, variation_info}`.
  - Quà tặng: `items[].is_bonus_product`.
  - `raw_json` lưu cả đơn trừ `histories` (`lib/sync.ts:129`), nên giá vốn của đơn cũ đã nằm sẵn trong `raw_json` nếu Pancake có trả.
- Phí hãng ship: `partner_fee` (cấp đơn) và `partner.total_fee`; chỉ có trong `raw_json`. Cột `shipping_fee` là phí **khách trả**, không phải phí hãng thu. OpenAPI **không có** trường phí chiều hoàn.
- `SourceItem` (`lib/pancake.ts:44-63`) chưa khai báo `avg_price`, `last_imported_price`, `components`; `SourceOrder` chưa có `partner_fee` (bước V1 của plan vận hành đơn thêm `partner` nhưng chưa có `total_fee`).
- Chi phí quảng cáo: bảng `ad_costs` (tạo lúc chạy, `lib/ad-costs.ts:12-30`): `day, marketer_id, amount, campaign`. **Không có POS**. ROAS hiện tại = giá trị đơn chốt (theo `first_confirmed_at`, `status_code NOT IN (0,17,6,7)`, `marketer_id IN COUNTED_STAFF`) ÷ chi phí (`lib/ad-costs.ts:87-134`). Chỉ tính marketer đã nhập chi phí (`mktTotal`, :58-64).
- Team MKT: `app_settings` khoá `marketing_teams_v1`, `lib/marketing-teams.ts` (`UNASSIGNED_TEAM`).
- Loại đơn: `orderLines(items, tagsJson)` `lib/shipping-lines.ts:23`, tên sản phẩm `itemNames` `lib/product-groups.ts:66`.
- NET (giá trị đơn sau mọi giảm trừ): `lib/stats.ts:24`.
- Trang chỉ chủ hệ thống: `OWNER_VIEWS` `lib/access.ts:35` (mẫu KPI).
- Demo: `lib/demo/world.ts` `PRODUCTS` (:144-157) không có giá vốn; `toSourceOrder` item `variation_info` không có `avg_price`; đơn không có `partner_fee`. Chi phí quảng cáo demo: `lib/demo/mode.ts:114-150` `seedAdCosts`.

## 4. Thiết kế

### 4.1 Cách tính (mặc định Tổ Ý tưởng chọn, anh chưa chốt; ghi rõ trong `definitions` để anh đổi sau)

- **Giá vốn một dòng hàng** = đơn giá vốn × số lượng. Đơn giá vốn lấy theo thứ tự: `variation_info.avg_price` > 0, rồi `variation_info.last_imported_price` > 0, rồi (hàng ghép có `components`) tổng của từng thành phần (giá vốn thành phần theo cùng thứ tự × `components[].quantity`). Không có gì → dòng **thiếu giá vốn**.
- **Quà tặng** (`is_bonus_product`) tính đủ giá vốn (công ty vẫn mất hàng).
- **Combo**: nếu dòng combo có giá vốn riêng thì dùng; không thì cộng thành phần như trên.
- **Giá vốn đơn** = tổng giá vốn các dòng. Đơn có dòng thiếu giá vốn: `cost_missing` = số dòng thiếu; đơn đó **không** vào lãi, đếm vào "Đơn thiếu giá vốn" (hiện % để biết độ phủ).
- **Phí hãng ship** = `partner.total_fee` > 0, không thì `partner_fee` > 0, không thì null (thiếu, coi như 0 và đếm vào "Đơn thiếu phí ship").
- **Phí chiều hoàn** = phí chiều đi × `RETURN_FEE_FACTOR` (hằng = 1, tức coi như hãng thu lại bằng phí chiều đi).
- **Nhóm đơn**: đơn **gửi hãng trong kỳ** (`first_sent_at`), như Vận đơn theo ngày gửi.
  - Khách đã nhận (3, 16): doanh thu = NET; lãi gộp = NET − giá vốn − phí ship.
  - Hoàn (4, 5, 15): doanh thu = 0; hàng về kho nên giá vốn = 0; lãi gộp = −(phí ship × (1 + RETURN_FEE_FACTOR)). Hoàn một phần (15) tạm tính như hoàn cả đơn, ghi trong `definitions`.
  - Đang trên đường (2): không vào lãi, hiện riêng "Còn trên đường" (số đơn, giá trị).
- **Chi phí quảng cáo**: `SUM(ad_costs.amount)` theo `day` trong kỳ (cùng cách `roasReport` lấy chi phí). Chỉ trừ khi xem **đủ 6 POS** (chi phí không có POS); xem một phần POS thì ô "Lãi sau quảng cáo" và "ROAS sau hoàn" hiện "—" kèm chú thích.
- **Theo marketer**: đơn có `marketer_id` = người đó (chỉ `COUNTED_STAFF`) trừ chi phí của người đó. **Theo team MKT**: cộng các marketer trong team. **Theo loại đơn**: chỉ lãi gộp (chi phí quảng cáo chưa tách được theo loại đơn chính xác, ghi chú).
- **ROAS sau hoàn** = doanh thu khách đã nhận ÷ chi phí; **ROAS chốt** lấy đúng số `roasReport` cùng kỳ để so (gọi hàm sẵn có, không tự tính lại).

### 4.2 Dữ liệu (bước L1)

Migration `drizzle/0049_order_cost.sql` (số kế tiếp sau migration cuối của bước V1):

```sql
-- Giá vốn và phí hãng ship của đơn (plan 2026-10-15-lai-that). Đơn cũ do bộ hẹn giờ điền dần từ raw_json, không điền ở đây.
ALTER TABLE `raw_pos_orders` ADD COLUMN `cost_total` integer;   -- tổng giá vốn các dòng có giá vốn
ALTER TABLE `raw_pos_orders` ADD COLUMN `cost_missing` integer; -- số dòng thiếu giá vốn; NULL = chưa tính
ALTER TABLE `raw_pos_orders` ADD COLUMN `carrier_fee` integer;  -- phí hãng ship chiều đi; NULL = Pancake không có
```

`lib/pancake.ts`: `SourceItem.variation_info` thêm `avg_price?: number | null; last_imported_price?: number | null`; `SourceItem` thêm `components?: { variation_id?: string; quantity?: number; variation_info?: { avg_price?: number | null; last_imported_price?: number | null } }[] | null`; `SourceOrder` thêm `partner_fee?: number | null` và `partner.total_fee?: number | null` (gộp vào kiểu `partner` V1 đã thêm).

`lib/order-cost.ts` (mới, thuần):

```ts
export const RETURN_FEE_FACTOR = 1;
export function itemUnitCost(i: SourceItem): number | null;
export function orderCost(o: Pick<SourceOrder, 'items'>): { cost: number; missing: number };
export function carrierFee(o: Pick<SourceOrder, 'partner' | 'partner_fee'>): number | null;
```

`lib/sync.ts` `orderStatements`: thêm 3 cột vào INSERT; upsert `cost_total=excluded.cost_total, cost_missing=excluded.cost_missing, carrier_fee=COALESCE(excluded.carrier_fee, raw_pos_orders.carrier_fee)`. Chỉ thêm, không đổi phần khác.

`lib/stats.ts` `fillCostMonth(db, posId, month, deadline)`:
- Mỗi lô: `SELECT rowid, raw_json FROM raw_pos_orders WHERE pos_id=? AND created_at>=? AND created_at<? AND first_sent_at IS NOT NULL AND cost_missing IS NULL LIMIT 200`.
- Tính bằng **chính** `orderCost` và `carrierFee` trong JS (parse `raw_json`; hỏng thì `cost_total=0, cost_missing=-1` để không chọn lại; `-1` nghĩa là "không đọc được", báo cáo coi như thiếu giá vốn).
- Ghi bằng `db.batch` các câu `UPDATE … WHERE rowid=?` (mỗi lô một batch).
- Cờ `COST_READY_KEY='order_cost_ready'`, `COST_EPOCH=1`, hàm `costReady(db)`. Chỉ 6 tháng gần nhất.

`lib/scheduler.ts`: khối mới **sau** khối điền hãng ship của V1 (cùng khuôn), state `costPending` / `costPos`.

Demo `lib/demo/world.ts`:
- `PRODUCTS`: thêm `cost` cho từng sản phẩm, khoảng 35–55% giá bán, số tròn nghìn.
- `toSourceOrder`: item `variation_info.avg_price = cost`; khoảng 3% dòng bỏ `avg_price` nhưng có `last_imported_price` (thử nhánh dự phòng); khoảng 1% dòng không có cả hai (thử "thiếu giá vốn"). Đơn đã gửi có `partner.total_fee` 22.000–38.000 (bước nghìn) và `partner_fee` bằng số đó.
- **Dùng bộ số ngẫu nhiên riêng** `rng('cost:' + posId + ':' + orderId)`, không rút thêm từ bộ `r` cũ (luật như V1).
- `listVariations`: thêm `average_imported_price`, `last_imported_price` = `cost` (cho đủ bộ, chưa dùng).

### 4.3 Báo cáo (bước L2)

`lib/profit.ts` (thuần):

```ts
export type PfOrder = { status: number; net: number; cost: number | null; missing: number | null; fee: number | null; marketerId: string | null; posId: string; lines: string[] };
export type PfCell = { sent: number; delivered: number; returned: number; inTransit: number; inTransitNet: number;
  revenue: number; cogs: number; shipOut: number; shipBack: number; gross: number; missingCost: number; missingFee: number;
  adCost: number | null; afterAds: number | null; roasAfterReturn: number | null; roasClosed: number | null; margin: number | null };
export function buildProfit(orders: PfOrder[], opts: { adCostByMarketer: Map<string, number>; roasClosedByMarketer: Map<string, number | null>;
  roasClosedTotal: number | null; allPos: boolean; teamOf: (marketerId: string) => string; teamNames: Map<string, string> }): {
  total: PfCell; byPos: (PfCell & { posId: string })[]; byLine: (PfCell & { line: string })[];
  byMarketer: (PfCell & { marketerId: string })[]; byTeam: (PfCell & { teamId: string; label: string })[];
  warnings: { marketerId: string; roasClosed: number; afterAds: number }[]; // ROAS chốt >= 2 mà lãi sau quảng cáo < 0
};
```

- `margin` = gross ÷ revenue × 100 (revenue 0 → null).
- Đơn `missing > 0` hoặc `missing = -1` hoặc `cost = null`: chỉ đếm `missingCost`, không cộng vào revenue/cogs/gross (để lãi không bị thổi phồng). Đơn hoàn không cần giá vốn nên không bị loại vì thiếu giá vốn.
- `fee = null`: phí = 0, đếm `missingFee`.
- `byLine`: một đơn nhiều loại đơn thì chia đều doanh thu, giá vốn, phí cho các loại (ghi trong `definitions`), để tổng các dòng = tổng.
- `adCost`, `afterAds`, `roasAfterReturn` = null khi `!allPos` (trừ `byMarketer`/`byTeam`: chi phí của marketer không phụ thuộc POS nhưng đơn thì có, nên cũng null khi `!allPos`).

Route `app/api/reports/lai-that/route.ts`:
- Chặn ngay đầu: không phải `owner` → 403 (ngoài cổng `VIEW_GATES`, chặn thêm trong route cho chắc).
- `start`, `end` tối đa 93 ngày, `posIds`.
- SQL đơn: `SELECT o.pos_id, o.status_code, NET AS net, o.cost_total, o.cost_missing, o.carrier_fee, o.marketer_id, o.item_json, o.tags_json FROM raw_pos_orders o WHERE o.pos_id IN (...) AND o.first_sent_at>=? AND o.first_sent_at<? AND o.status_code IN (SENT_CODES)` (chỉ mục 0044). Chưa `sentAtReady` → 200 với `notReady: 'sent'` và mảng rỗng (không tính kiểu khác).
- Chi phí: `SELECT marketer_id, SUM(amount) FROM ad_costs WHERE day>=? AND day<=? GROUP BY 1` (gọi `ensureAdCostSchema` trước như các route marketing).
- ROAS chốt: gọi `roasReport` sẵn có với cùng kỳ và POS, lấy ROAS tổng và theo marketer (đọc kiểu trả về để lấy đúng trường; không tự tính).
- Team MKT: hàm sẵn có trong `lib/marketing-teams.ts`.
- Trả `ready: await costReady(env.DB)`, `definitions` đủ từng số ở 4.1 (giá vốn lấy theo thứ tự nào, quà tặng, combo, phí chiều hoàn giả định bằng chiều đi, hoàn một phần, chi phí không có POS, chia đơn nhiều loại đơn).

### 4.4 Trang (bước L3)

`app/profit-view.tsx`:
- `PageHeader` "Lãi thật", `PeriodToolbar`, `PosChips`.
- Dòng cảnh báo khi `ready` = false: "Đơn cũ đang được tính giá vốn, kỳ cũ có thể thiếu". Khi `missingCost` > 5% đơn đã nhận: dòng vàng "x% đơn thiếu giá vốn trên Pancake, lãi chỉ tính trên đơn đủ giá vốn".
- 6 thẻ: Doanh thu khách đã nhận, Giá vốn, Phí ship (đi + hoàn), Lãi gộp (kèm % biên), Chi phí quảng cáo, Lãi sau quảng cáo. Thêm 2 thẻ nhỏ: ROAS chốt, ROAS sau hoàn.
- Biểu đồ thác nước ngang (chart.js cột chồng hoặc thanh), từ Doanh thu → trừ Giá vốn → trừ Phí ship → Lãi gộp → trừ Quảng cáo → Lãi sau quảng cáo. Màu lãi dương xanh #17684b, âm đỏ.
- Bảng theo POS, theo loại đơn, theo marketer, theo team (tab). Cột: Đơn đã gửi, Đã nhận, Hoàn, Doanh thu, Giá vốn, Phí ship, Lãi gộp, Biên %, Chi phí QC, Lãi sau QC, ROAS chốt, ROAS sau hoàn. Sắp được.
- Khu "Cần xem": `warnings` (marketer ROAS chốt ≥ 2 mà lãi sau quảng cáo âm).
- `Definitions` cuối trang.

Gắn:
- `lib/access.ts`: `VIEW_LABELS['lai-that'] = 'Lãi thật'`; thêm `'lai-that'` vào `OWNER_VIEWS`; `VIEW_GATES` `['/api/reports/lai-that', ['lai-that']]`; nếu có danh sách API chỉ chủ (`OWNER_ONLY`) thì thêm cả tiền tố này.
- `app/dashboard.tsx`: thêm view, lazy import, render, `SELF_HEADED`, danh sách loại trừ; đặt trong nhóm menu "Doanh thu" (`NAV_GROUPS` có `['overview','products']`) thành `['overview','products','lai-that']`. Chỉ thêm dòng, không định dạng lại file.
- `app/users-panel.tsx`: **không** thêm (trang chỉ chủ, không cấp được).

## 5. Các bước (nối sau V4 trên nhánh `codex/van-hanh-don-1510`)

**L1. Giá vốn và phí hãng ship của đơn: cột, đồng bộ, điền đơn cũ, demo**
- File được sửa: `drizzle/0049_order_cost.sql` (mới; số theo thực tế sau V1), `db/schema.ts`, `lib/pancake.ts`, `lib/order-cost.ts` (mới), `lib/sync.ts`, `lib/stats.ts`, `lib/scheduler.ts`, `lib/demo/**`, `tests/**`.
- Xong khi:
  - `tests/order-cost.test.ts`: avg_price; chỉ last_imported_price; combo không giá nhưng có components; quà tặng tính giá vốn; dòng thiếu hết → missing; số lượng 0; `carrierFee` total_fee > partner_fee > null.
  - Test `orderStatements` ghi 3 cột; `fillCostMonth` điền đúng, chạy lại không ghi thêm, `raw_json` hỏng → `cost_missing=-1`.
  - Test demo: ≥ 95% dòng hàng đơn đã gửi có giá vốn; có đơn `carrier_fee` > 0.
  - Mọi test cũ qua, không sửa số mong đợi cũ.

**L2. Báo cáo Lãi thật (API)**
- File được sửa: `lib/profit.ts` (mới), `app/api/reports/lai-that/route.ts` (mới), `tests/**`.
- Xong khi:
  - `tests/profit.test.ts`: đơn nhận, hoàn, trên đường; thiếu giá vốn bị loại khỏi lãi; thiếu phí → 0 và đếm; `!allPos` → null ở chi phí; đơn hai loại đơn chia đều, tổng `byLine` = tổng; cảnh báo ROAS ≥ 2 mà lãi âm.
  - Test route trên `demoWorld`: owner 200, `total.revenue > 0`, `total.cogs > 0`, `total.gross` = revenue − cogs − shipOut − shipBack; lead/director → 403.

**L3. Trang Lãi thật**
- File được sửa: `app/profit-view.tsx` (mới), `lib/access.ts`, `app/dashboard.tsx`, `tests/**`.
- Xong khi: `tests/access.test.ts` (hoặc test mới) chứng minh chỉ owner `canView('lai-that')`, `parseAccess` bỏ `lai-that` khỏi người không phải owner; build qua.

Sau L3 là bước **V5** của plan vận hành đơn (kiểm toàn bộ, ảnh demo cả 4 trang mới, tóm tắt).

## 6. Kiểm thử (Tổ Ý tưởng, sau khi Codex xong)

- So tay một đơn demo: giá vốn, phí, lãi khớp công thức 4.1.
- ROAS chốt trên trang mới = số trang Chi phí & ROAS cùng kỳ, cùng POS.
- Đăng nhập lead, director: không thấy menu, API 403.
- Trang cũ không đổi số (chạy lại test cũ, so JSON `/api/marketing/roas` trước/sau).
- QA so số trên demo (đụng tiền). Anh xem demo. Lên web thật khi anh ok; sau khi lên, đếm % đơn có giá vốn trên dữ liệu thật (chỉ đếm, khi anh cho phép) để biết trang có dùng được không.

## 7. Rủi ro

- **Pancake thiếu giá nhập** (shop không nhập kho chuẩn): độ phủ thấp → trang hiện % thiếu rõ ràng, không đoán. Nếu thấp, plan sau thêm giá vốn nhập tay theo sản phẩm.
- **Phí chiều hoàn là giả định** (= chiều đi). Ghi rõ; đổi hằng `RETURN_FEE_FACTOR` khi anh có số thật từ hãng.
- **Giá vốn theo đơn là ảnh chụp lúc Pancake trả đơn**, không phải lúc nhập: chấp nhận được cho báo cáo quản trị.
- **Lượt ghi D1** khi điền đơn cũ: 6 tháng, lô 200, sau các việc nền khác. Lùi lại: bỏ khối trong scheduler.
