# Đợt 13 yêu cầu web tổng (17/10/2026)

Tổ web tổng viết. Anh Vũ giao ở project chat ngày 17/10 (13 mục, kèm 3 ảnh sơ đồ team và 5 ảnh màn hình web thật), dặn: "xem xét đưa ra ý kiến rồi lên plan chi tiết để codex fix".
Quy trình chung (anh 15/10): Codex làm toàn bộ, không hỏi anh giữa chừng, xong thì Claude kiểm thử, anh xem demo, anh ok mới lên web thật.

Repo công khai: plan này không ghi tên người, tên team theo tên người, số thật. Team trong plan gọi là "team MKT 1", "team Sale TN 1"…

## 0. Bảng 13 mục → bước

| Mục anh | Ý chính | Bước |
|---|---|---|
| 1 | Chia nhân sự đúng team theo ảnh | Xếp người ở web nhân sự (Tổ web nhân sự, không phải Codex web tổng) + B1 |
| 2 | Chọn một team MKT trên thanh trên cùng thì thấy cả Sale, CSKH chốt cho team đó, từng người, mọi trang | B3 |
| 3 | Thẻ xu hướng theo kỳ đang chọn (hôm nay → dự đoán cuối ngày…) | A4 |
| 4 | Trang MKT: chọn Sale thì doanh thu MKT chỉ tính Sale chốt, chọn CSKH thì chỉ CSKH; chi phí giữ | A1 (đã có trên demo, làm đủ ở mọi khối) |
| 5 | Sale: thêm AOV và doanh thu đơn từ Đang đóng hàng trở đi | A2 |
| 6 | Dự đoán dựa trên số của mọi bộ phận, khuyến nghị tuyển người, điều cần cải thiện | D1, D2 |
| 7 | Vận đơn: làm lại các thẻ đầu; tô màu tỷ lệ hoàn theo Sale | A3 |
| 8 | Tài khoản Mentor: chỉ thấy số của người mình kèm và của mình | C1 |
| 9 | KPI theo team (anh đặt) và theo người (mentor, quản lý đặt) | C2 |
| 10 | Lọc chi nhánh Hà Nội / Thái Nguyên / Tổng trên thanh trên cùng | B2 |
| 11 | CSKH: mở trang thấy ngay doanh thu, AOV, chỉ số cơ bản; xu hướng theo kỳ | A5 |
| 12 | Chi phí MKT chỉ so với đơn New; phân tích xu hướng MKT theo đoạn thời gian | A1, A6 |
| 13 | "Xếp hạng MKT đơn theo mốc" | A7 (chờ anh chọn cách hiểu) |

Thứ tự chạy: A1 → A2 → A3 → A4 → A5 → A6 → B1 → B2 → B3 → C1 → C2 → D1. A7 và D2 chờ anh trả lời (mục 9 của plan). Mỗi bước một commit trên nhánh `codex/dot-13-1710`.

## 1. Không được đổi
- Doanh thu = ô "Tổng cộng" Pancake từng POS cộng lại; doanh số chỉ tính người có hậu tố MKT, CSKH, SALE (cộng danh sách `counted_staff_extra`).
- Ba giai đoạn đơn: CLOSED theo `first_closed_at` (Sale/CSKH, Vận đơn); MKT chốt theo `first_confirmed_at`, status NOT IN (0,17,6,7).
- Đang đóng hàng = `PACKED_SQL` / `isPacked` trong `lib/van-don.ts` (đang chạy trên web thật từ PR #79). Không viết lại định nghĩa khác.
- Quyền phía máy chủ qua `lib/access.ts` `scopeApi`; người không phải chủ hệ thống không bao giờ thấy CCCD, ngân hàng, hồ sơ nhân sự.
- Bấm vào số thì mở danh sách đơn ra số đó, giữ bộ lọc (kỳ, POS, Sale/CSKH, team, chi nhánh).
- Giao diện mới đang có trên nhánh demo (màu #17684b, thẻ, con vật chờ tải). Không đổi kiểu dáng ngoài phần plan ghi.
- `WORLD_VERSION` (`lib/demo/mode.ts`) giữ '5'. Không sửa `.github/**`, `wrangler*.json*`. Không thêm migration trừ khi bước ghi rõ (bước này không bước nào cần). Số migration 0047–0049 đã dành cho việc Vận hành đơn.
- Không chỉ mục mới trên `raw_pos_orders`. Câu đọc đơn gốc phải đi qua chỉ mục có sẵn `idx_raw_orders_pos_closed_status_money` (`pos_id`, `first_closed_at`, …) hoặc `idx_raw_orders_pos_confirmed_status_money`; kiểm bằng `EXPLAIN QUERY PLAN` trên D1 local và chép kết quả vào tóm tắt.

## 2. Hiện trạng (nhánh demo `claude/project-thread-3ujeoc` @02ac02d; dòng có thể lệch, tìm theo tên)
- **Thanh trên cùng** `app/dashboard.tsx` (~1479): `TeamSwitch` (Tất cả/Sale/CSKH, chỉ khi `user.team==='all'`), `HrTeamPicker` (`app/hr-team-picker.tsx`, `/api/teams?list=1`, chỉ team Sale/CSKH, nhóm theo văn phòng). Trạng thái ở `app/team-store.ts` `{team, unit}`; `withUnit()` thêm `?hrTeam=`; `UNIT_VIEWS` (~211) liệt kê trang nhận `hrTeam`, trang khác hiện băng "chưa lọc được theo team".
- **Lọc team phía máy chủ**: `lib/team.ts` `teamFilter(col, team, counted, unit)` (~77), `unitSubquery` (~72); `lib/hr-unit.ts` `resolveHrUnit`. Route có dùng: `reports/overview`, `staff-detail`, `staff-compare`, `calls`, `cskh-origin`, `product-groups`, `van-don`.
- **Team từ web nhân sự**: bản chép `hr_*` (`drizzle/0033_hr_copy.sql`), `hr_pos_team(pos_user_id, employee_id, team, department_id, leader_*, status)`; team = `hr_departments.kind='team'`; loại team `teamFor()` `lib/hr-copy.ts` (~44) trả `sale|cskh|mkt|other`; Mentor `MENTOR_SQL` `lib/hr-teams.ts` (~58); chi nhánh = `hr_departments.office_id` / `hr_employees.office_id` (`hr_offices`). Kéo mỗi 5 phút `lib/hr-sync.ts` `pullHr`.
- **Team MKT riêng của web tổng**: `app_settings.marketing_teams_v1` (`lib/marketing-teams.ts`, `app/api/marketing-teams/route.ts`, `app/marketing-teams-panel.tsx`), lọc bằng `?marketingTeamId=` trên `marketer_id`.
- **Đơn gốc** `db/schema.ts` `raw_pos_orders`: `marketer_id`, `seller_id`, `care_id`, `pos_id`, `status_code`, `status_history_json`, `first_closed_at`, `first_confirmed_at`, `first_sent_at`, `net_total`, `tags_json`. Số Sale/CSKH chia theo người bán `seller_id` thuộc team nào.
- **Tổng hợp ngày** `stats_daily` (khoá `pos:day:seller`) không có `marketer_id`.
- **MKT**: `app/api/reports/marketing/route.ts` (đã lọc doanh thu theo `teamFilter('o.seller_id', team)` ~77, có `sale_net`/`cskh_net` ~89); `lib/mkt-analytics.ts` `finish()` (~35, ROAS = coveredNet/cost), `closedWhere` (~127); `app/mkt-headline.tsx` (`SplitStrip` chỉ khi Tất cả ~286); `lib/ad-costs.ts` `mktTotal` (~58), `mktSummary` (~67), `roasReport` (~87) KHÔNG nhận team, chia chi phí cho mọi đơn MKT chốt kể cả CSKH chốt; khối MKT ở Tổng quan POS `app/api/reports/sections/route.ts` (~54) và `app/overview-sections.tsx` (~217); bảng marketer trang Chi phí & ROAS `app/mkt-roas-view.tsx`.
- **Xu hướng**: `app/overview-trends.tsx` `TrendNotes` (~582), `DeptTile` (~555) ghi cứng "tuần này", "4 tuần trước"; dữ liệu `/api/ai/trends` → `lib/ai-trends.ts` `currentTrendNotes` (~101) luôn 10 tuần tới hôm qua, không nhận kỳ/POS/team; toán ở `lib/trends.ts` (`weekly`, `weekChange`, `trendFacts`, `deptCharts`, `ruleNotes`). Câu AI: Workers AI mỗi sáng sau 7h30, lưu `app_settings` `ai_trend:<ngày>`. Dùng ở `overview-view.tsx` (~496), `marketing-view.tsx` (~190), `van-don-view.tsx` (~268), `team-overview-view.tsx` (~302).
- **CSKH/Sale tổng quan** `app/team-overview-view.tsx`: thứ tự PageHeader → CskhFocusBar → PeriodToolbar → PosChips → **TrendNotes** → TeamKpiProgress → lưới KPI (~323) → Pancake → Tự ups & từ MKT, Cuộc gọi → nhóm sản phẩm → Theo ngày/POS/nhân viên (cột GTTB ~431).
- **Sale phân tích** `lib/sale-analytics.ts` (~72, có `aov`), `app/sale-analytics-view.tsx` (~283 cột "GTTB").
- **Vận đơn** `app/van-don-view.tsx` (~274 năm thẻ), `app/api/reports/van-don/route.ts`, `lib/van-don.ts` (`WH_CONFIRMED_SQL`, `add()`, `buildVanDon`, `SENT_CODES`), `lib/shipping-lines.ts` (`DELIVERED=[3,16]`, `RETURNED=[4,15,5]`); màu tỷ lệ hoàn `badTone` (~28, ≥20% đỏ, ≥10% vàng) và bản trùng `returnTone` ở `app/overview-sections.tsx` (~25).
- **Quyền**: `lib/access.ts` `Role = owner|director|lead|staff`, `scopeApi` (~127), `OWNER_ONLY`, `VIEW_GATES`; `users(team, pos_ids_json, views_json, manager_id)`; không có phạm vi theo người. KPI `targets` id `tháng:scope:refId`, scope `pos|employee|team`; ghi chỉ chủ hệ thống (`app/api/targets/route.ts` ~31).
- **Dự báo có sẵn**: `lib/forecast.ts` `monthForecast` (tốc độ tuyến tính).

## 3. Thiết kế chung
- `lib/period-kind.ts` (mới): từ `start`, `end`, `today` trả `{ kind: 'day'|'week'|'month'|'year'|'range', open: boolean, label, endLabel, prev: {start,end} }`. `open` = kỳ có chứa hôm nay và kết thúc ở cuối ngày/tuần/tháng/năm đó (Hôm nay, Tuần này, Tháng này, Năm nay). Kỳ đã qua hoặc 7 ngày/90 ngày/Tùy chọn: `open=false`. Tuần bắt đầu thứ Hai (như `lib/period` hiện có, tìm và dùng lại hàm sẵn có nếu đã có).
- `lib/scope-filter.ts` (mới): gom mọi bộ lọc người vào một chỗ: `scopeFromParams(params)` → `{ team, unit, mktTeam, branch, staffIds }` và `scopeSql(scope, { seller: 'o.seller_id', marketer: 'o.marketer_id' })` trả chuỗi `AND …`. Dùng lại `teamFilter`, `unitSubquery`, `marketingTeamFilter`. Bước B1–C1 nối dần vào đây.
- Đường đọc đơn gốc khi có lọc MKT team / chi nhánh: `lib/lens-orders.ts` (bước B3) tính theo từng người bán từ `raw_pos_orders` (khoảng `first_closed_at`, đi qua chỉ mục có sẵn), thay cho `stats_daily` vì bảng này không có marketer.
- Chữ trên web tiếng Việt, ghi rõ số gì, phạm vi nào. Mỗi số mới có tooltip "Cách tính".

## 4. Đợt A: sửa số và bố cục (không cần anh trả lời)

**A1. Chi phí MKT chỉ so với đơn New (mục 4, 12)**
- File được sửa: `lib/ad-costs.ts`, `lib/mkt-analytics.ts`, `app/api/reports/sections/route.ts`, `app/api/reports/marketing/route.ts` (chỉ nếu cần trả thêm trường), `app/api/marketing/**/route.ts` của Chi phí & ROAS, `app/overview-sections.tsx`, `app/mkt-headline.tsx`, `app/mkt-roas-view.tsx`, `app/marketing-view.tsx`, `tests/mkt-new-cost.test.ts` (mới).
- Việc cần làm:
  - Định nghĩa trong `lib/ad-costs.ts`: **Đơn New** = đơn MKT chốt (định nghĩa MKT hiện có) có `seller_id` thuộc Sale (`teamSubquery('sale')`). **DT New** = tổng `net_total` các đơn đó. **DT CSKH từ khách MKT** = người bán thuộc CSKH. **Khác** = người bán chưa hậu tố.
  - `mktTotal`/`mktSummary`/`roasReport` trả thêm `newOrders`, `newNet`, `cskhOrders`, `cskhNet`, `otherNet`, và tính lại: `roas = newNet / cost`, `costPerClosed = cost / newOrders`, `costShare` (chi phí / DT) `= cost / newNet`. Chi phí, số về, CP/số giữ nguyên.
  - Trang Chi phí & ROAS, bảng marketer (ảnh 8 của anh): cột "Doanh thu" thành "DT New", "Đơn chốt" thành "Đơn New", thêm cột "DT CSKH" (chữ phụ, không vào ROAS). ROAS, CP/đơn, "% chi phí" (= chi phí ÷ DT New) theo DT New. Dòng tổng cũng vậy.
  - Khối MKT ở Tổng quan POS: số lớn vẫn là "Doanh thu MKT" theo nút Tất cả/Sale/CSKH (như trang MKT đã làm trên demo); ô Chi phí, CP/đơn, ROAS ghi "theo đơn New". Thêm dòng nhỏ "New x · CSKH y".
  - Nút Tất cả/Sale/CSKH trên thanh trên cùng: Sale → mọi số doanh thu MKT (khối Tổng quan, trang MKT, Chi phí & ROAS, bảng marketer, biểu đồ) chỉ tính đơn Sale chốt; CSKH → chỉ đơn CSKH chốt; Tất cả → cộng hết, có dải New/CSKH/Khác. Chi phí và số về KHÔNG đổi theo nút. Khi chọn CSKH, ô ROAS và CP/đơn hiện "—" kèm chú thích "Chi phí QC tính cho đơn New, xem nút Sale".
  - `mkt-headline.tsx` `finish()`: ROAS và CP/đơn dùng DT New/đơn New ở mọi nút.
- Tiêu chí xong: trên demo cùng kỳ, (a) DT New + DT CSKH + Khác = Doanh thu MKT Tất cả; (b) ROAS trang Chi phí & ROAS = ROAS khối MKT Tổng quan = ROAS khối đầu trang MKT; (c) bấm Sale/CSKH đổi doanh thu, không đổi chi phí, số về.
- Cách kiểm: test `mkt-new-cost` với đơn giả 3 người bán (Sale, CSKH, chưa hậu tố) và 2 marketer có chi phí; so ba nơi gọi cùng hàm.

**A2. Sale: AOV và doanh thu từ Đang đóng hàng trở đi (mục 5)**
- File được sửa: `lib/sale-analytics.ts`, `lib/sale-packed.ts` (mới), `app/api/reports/overview/route.ts` hoặc route đang cấp bảng nhân viên của Tổng quan Sale (tìm theo bảng có cột GTTB), `app/team-overview-view.tsx`, `app/sale-analytics-view.tsx`, `app/overview-sections.tsx`, `app/api/reports/sections/route.ts`, `tests/sale-packed.test.ts` (mới).
- Việc cần làm:
  - `lib/sale-packed.ts`: `packedBySeller(db, { posIds, start, end, scope })` đọc `raw_pos_orders` có `first_closed_at` trong kỳ, CLOSED, gom theo `seller_id`: `packedOrders = SUM(PACKED_SQL)`, `packedNet = SUM(CASE WHEN PACKED THEN net_total END)`. Dùng `PACKED_SQL('o')` có sẵn.
  - Đổi nhãn "GTTB" thành "AOV" ở các bảng Sale (giữ tooltip "Doanh thu ÷ đơn chốt").
  - Bảng nhân viên Sale (Tổng quan Sale › Theo nhân viên, Sale › Phân tích, Sale › Nhân viên nếu có bảng người): thêm cột "AOV" (nếu chưa có), "DT đóng hàng trở đi" (`packedNet`), "% DT đóng hàng" (`packedNet / net`). Cột sắp xếp được. Bấm số "DT đóng hàng trở đi" mở danh sách đơn với `?packed=1` (route danh sách đơn của product-groups đã có `packed=1`, dùng lại hoặc thêm cùng điều kiện).
  - Khối Sale ở Tổng quan POS: thêm ô "DT đóng hàng trở đi" (số + % trên doanh thu Sale).
  - CSKH không đổi ở bước này.
- Tiêu chí xong: `packedNet ≤ net` mọi người; tổng cột = ô khối Sale; danh sách đơn bấm ra đúng số đơn.
- Cách kiểm: test với đơn giả đủ các trạng thái 1, 8, 9, 2, 3, 6 có/không qua 8.

**A3. Vận đơn: làm lại thẻ đầu trang và màu tỷ lệ hoàn (mục 7)**
- File được sửa: `lib/van-don.ts`, `app/api/reports/van-don/route.ts`, `app/van-don-view.tsx`, `app/overview-sections.tsx`, `lib/return-tone.ts` (mới), `tests/van-don-cards.test.ts` (mới).
- Việc cần làm:
  - Bỏ hai thẻ "Đơn vào Chờ xác nhận" và "Đã xác nhận" (trùng nhau), bỏ "Không xác nhận được" và "Đang chờ xác nhận" khỏi hàng thẻ chính (chuyển xuống một dòng chữ nhỏ dưới hàng thẻ: "Còn chờ xác nhận x · Không xác nhận được y", bấm được).
  - Hàng thẻ mới, theo lời anh (tên thẻ dùng đúng chữ anh; đây là ngoại lệ anh tự đặt cho luật gọi tên Vận đơn, ghi chú trong code):
    1. **Đơn chốt** (đã xác nhận đơn hàng): đơn vào Chờ xác nhận trong kỳ đã qua bước Đã xác nhận (`WH_CONFIRMED_SQL`).
    2. **Đơn xác nhận** (đang đóng hàng, chờ chuyển hàng): `PACKED_SQL`.
    3. **Đơn chuyển** (đã giao ĐVVC, đã gửi hàng): `SENT_CODES` (2,3,16,4,15,5), theo `first_sent_at` như hiện tại.
    4. **Đơn nhận** (đã nhận): `DELIVERED` (3,16).
    5. **Đơn hoàn**: `RETURNED` (4,15,5); thẻ có hai dòng "theo đơn: hoàn ÷ đơn chuyển" và "theo doanh số: giá trị hoàn ÷ doanh số chuyển".
  - Mỗi thẻ: số đơn, giá trị (doanh số), % so với thẻ trước (Đơn xác nhận ÷ Đơn chốt…), dòng phụ "Đang nằm ở bước này: n" (đếm theo trạng thái hiện tại: 1/11/12/13/20; 8/9; 2; 3/16; 4/15/5). Như vậy một thẻ trả lời được cả "đã qua bước" lẫn "đang ở bước".
  - Khối "Hoàn trong kỳ" giữ, bỏ phần trùng với thẻ 5.
  - `lib/return-tone.ts`: `returnTone(rate)` → `'red'` khi ≥ 7%, `'amber'` khi 5% đến dưới 7%, `'none'` khi dưới 5%. Thay `badTone` (van-don-view) và `returnTone` (overview-sections) bằng hàm này cho mọi cột tỷ lệ hoàn theo người (Sale, CSKH, người xác nhận). "none" = chữ thường, không tô xanh. Tỷ lệ hoàn theo người = đơn hoàn ÷ đơn chuyển của người đó (theo đơn); ô giá trị dùng cùng ngưỡng cho tỷ lệ theo doanh số.
- Tiêu chí xong: Đơn chốt ≥ Đơn xác nhận ≥ Đơn chuyển ≥ Đơn nhận trên demo (cùng cơ sở đơn vào Chờ xác nhận trong kỳ; Đơn chuyển theo `first_sent_at` có thể lệch, ghi chú rõ trong tooltip); ngưỡng 5%/7% đúng ở biên (4,99 / 5,00 / 6,99 / 7,00).
- Cách kiểm: test `van-don-cards` và `returnTone` biên.

**A4. Thẻ xu hướng theo kỳ đang chọn (mục 3)**
- File được sửa: `lib/period-kind.ts` (mới), `lib/trend-period.ts` (mới), `app/api/reports/trend-cards/route.ts` (mới), `app/overview-trends.tsx`, `app/overview-view.tsx`, `app/team-overview-view.tsx`, `app/marketing-view.tsx`, `app/van-don-view.tsx`, `lib/access.ts` (thêm gate cho route mới giống `/api/ai/trends`), `tests/trend-period.test.ts` (mới).
- Việc cần làm:
  - Route mới `/api/reports/trend-cards?start&end&posIds&team&hrTeam&mktTeam&branch&depts=sale,cskh,mkt,vandon` trả mỗi bộ phận:
    - `actual`: số kỳ đang chọn đến hiện tại (Sale, CSKH: doanh thu; MKT: doanh thu MKT theo nút; Vận đơn: đơn chuyển đi).
    - `forecast` (chỉ khi `open`): dự đoán đến cuối kỳ. Cách tính: `actual ÷ phần đã qua`, trong đó phần đã qua lấy từ hồ sơ 28 ngày trước: hôm nay = tỷ lệ doanh thu trung bình đã có tới giờ này trong ngày (theo giờ `first_closed_at`, cùng thứ trong tuần nếu đủ 4 ngày, không thì mọi ngày); tuần/tháng/năm = (tổng các ngày đã xong + phần hôm nay) ÷ (các ngày đã xong + ngày còn lại × trung bình ngày cùng thứ của 4 tuần trước). Hồ sơ giờ tính một lần mỗi ngày, lưu `app_settings` khoá `trend_profile:<ngày>` (JSON 24 số), xoá khoá cũ hơn 3 ngày.
    - `compare`: so với kỳ liền trước **cùng mốc** (hôm nay tới 14h so với hôm qua tới 14h; tuần này tới thứ Năm 14h so với tuần trước tới thứ Năm 14h). Kỳ đã qua: so với kỳ liền trước cùng độ dài.
    - `series`: điểm vẽ đường: hôm nay = theo giờ (cộng dồn), kỳ khác = theo ngày; kèm đường kỳ trước (nét đứt).
    - `rows`: 3–5 dòng con (team hoặc người) thay đổi nhiều nhất so với kỳ trước cùng mốc; bỏ dòng có kỳ trước bằng 0 (tránh "+2829%"); hiện "mới" thay cho %.
  - Thẻ (`DeptTile`) viết lại nhãn theo kỳ:
    - Hôm nay: "Hôm nay đến 14:15", số lớn = thực tế, dòng "Dự đoán cuối ngày: X", "so với hôm qua cùng giờ ▲ y%".
    - Tuần này / Tháng này / Năm nay: "Dự đoán cuối tuần/tháng/năm: X", "so với tuần/tháng/năm trước cùng mốc".
    - Hôm qua, Tuần trước, Tháng trước, 7 ngày, 90 ngày, Tùy chọn: không có dòng dự đoán; "so với <kỳ liền trước>".
  - Câu nhận xét AI (sau 7h30) chỉ hiện khi kỳ là Tuần này (vì AI viết theo tuần); kỳ khác dùng câu tự tính từ số (`ruleNotes` viết lại theo `compare`). Bỏ dòng "Cả công ty, tuần đến…" khi kỳ khác tuần; thay bằng "Theo kỳ: <nhãn kỳ> · POS đang chọn".
  - Thẻ đọc POS, nút Sale/CSKH, team, chi nhánh đang chọn (trước đây luôn cả công ty).
  - Bố cục: mỗi thẻ cao bằng nhau; số lớn, dòng dự đoán, đường, rồi dòng con; không quá 5 dòng con.
- Tiêu chí xong: đổi kỳ thì nhãn và số đổi theo; Hôm nay có dự đoán, Hôm qua không; test `period-kind` đủ 11 nút kỳ; dự đoán của kỳ đã kết thúc = thực tế.
- Cách kiểm: test với hồ sơ giờ giả (vd 50% doanh thu tới 14h → dự đoán = 2 × thực tế).

**A5. CSKH (và Sale) tổng quan: số chính lên đầu (mục 11)**
- File được sửa: `app/team-overview-view.tsx`, `app/globals.css` (nếu cần lớp mới, dùng biến màu sẵn có).
- Việc cần làm:
  - Thứ tự mới: PageHeader → bộ lọc (kỳ, POS, xem riêng nhân viên) → **hàng số chính** → TrendNotes (bản A4, theo kỳ) → TeamKpiProgress → phần còn lại như cũ.
  - Hàng số chính CSKH (6 ô, 3 cột trên máy tính, 2 cột trên điện thoại): Doanh thu CSKH (số to, so kỳ trước cùng mốc), AOV, Đơn chốt, Tỷ lệ chốt, Tự upsell (đơn + doanh thu), Từ MKT (đơn + doanh thu). Hàng phụ nhỏ: Cuộc gọi/note trong kỳ, Hủy, Hoàn. Số lấy từ API đang cấp lưới KPI và khối "Tự ups & từ MKT" (không thêm cách tính).
  - Sale dùng cùng component: hàng số chính Sale = Doanh thu Sale, AOV, Đơn chốt, Tỷ lệ chốt, DT đóng hàng trở đi (A2), Số được chia.
  - Bỏ ô trùng ở lưới KPI cũ sau khi đã lên hàng chính.
- Tiêu chí xong: mở Tổng quan CSKH thấy doanh thu CSKH ở màn hình đầu (laptop 1366×768 và điện thoại 390px) không phải cuộn; xu hướng theo kỳ đang chọn.
- Cách kiểm: chụp 2 ảnh `pnpm dev` DEMO_MODE=1 (máy tính, điện thoại) lưu vào `docs/plans/2026-10-17-dot-13-yeu-cau/anh/` (ảnh demo, số ảo).

**A6. Phân tích xu hướng MKT theo đoạn thời gian (mục 12)**
- File được sửa: `lib/mkt-trend.ts` (mới), `app/api/marketing/trend/route.ts` (mới), `app/mkt-trend-panel.tsx` (mới), `app/marketing-view.tsx`, `lib/access.ts` (gate như trang marketing), `tests/mkt-trend.test.ts` (mới).
- Việc cần làm:
  - Khối "Xu hướng MKT" trên trang Marketing › Tổng quan, ngay dưới số chính. Nút chia đoạn: Ngày / Tuần / Tháng (mặc định: kỳ ≤ 31 ngày → Ngày, ≤ 120 ngày → Tuần, dài hơn → Tháng).
  - Mỗi đoạn: Chi phí, Số về, CP/số, Đơn New, Tỷ lệ chốt (đơn New ÷ số về), DT New, ROAS (A1), AOV New.
  - Vẽ dạng nhiều biểu đồ nhỏ cùng trục thời gian (mỗi chỉ số một ô, không vẽ hai trục y), dưới có bảng số. Lọc theo POS, team MKT, marketer, chi nhánh đang chọn.
  - Nhận định tự tính (không AI) tối đa 4 câu, ví dụ: "ROAS giảm 3 đoạn liên tiếp", "CP/số tăng 22% so với trung bình 4 đoạn trước", "Số về tăng nhưng tỷ lệ chốt giảm: Sale có thể đang quá tải". Quy tắc: so đoạn cuối với trung bình 4 đoạn trước, ngưỡng ±10%; chuỗi tăng/giảm ≥ 3 đoạn.
- Tiêu chí xong: tổng các đoạn = số chính cùng kỳ; đổi Ngày/Tuần/Tháng không đổi tổng.
- Cách kiểm: test `mkt-trend` (gom đoạn, quy tắc nhận định).

**A7. Xếp hạng MKT theo mốc (mục 13): chờ anh chọn**
- Cách 1 (đề xuất): mốc là **trạng thái đơn**. Trang MKT đã có "Đơn theo mốc" và bảng xếp hạng theo mốc (`STAGES` trong `app/marketing-view.tsx`), nhưng ẩn trong ô chọn khó thấy. Làm: thanh nút rõ "Chốt → Đóng hàng → Đã gửi → Đã nhận" trên bảng xếp hạng, cột "Hạng" và "Đổi hạng" (hạng theo mốc đang chọn so với hạng theo đơn chốt), để thấy marketer nào chốt nhiều nhưng giao được ít.
- Cách 2: mốc là **giờ trong ngày** (10h, 12h, 15h, 18h, 21h). Bảng xếp hạng marketer theo đơn chốt tại từng mốc giờ, so với cùng mốc hôm qua.
- File (cả hai cách): `app/marketing-view.tsx`, `app/api/reports/marketing/route.ts`, `lib/marketing-report.ts`, `tests/mkt-rank-stage.test.ts`. Chi tiết viết thêm khi anh chọn.

## 5. Đợt B: team và chi nhánh

**Việc của Tổ web nhân sự (mục 1, không phải Codex web tổng):** xếp người vào team trên sơ đồ web nhân sự theo ảnh anh gửi (bản mới nhất), gồm team MKT (3 team + Trực page), team CSKH (HN, TN, Mycos, Gà, part time), team Sale (TN, HN theo người quản lý, đội gà), Văn phòng. Mỗi team có văn phòng (Hà Nội/Thái Nguyên) và ghế Mentor. Ghi dữ liệu thật: sao lưu trước, anh đồng ý. Web tổng nhận qua bản chép `hr_*` 5 phút một lần.

**B1. Team MKT lấy từ web nhân sự**
- File được sửa: `lib/hr-teams.ts`, `lib/marketing-teams.ts`, `lib/mkt-teams-source.ts` (mới), `app/api/marketing-teams/route.ts`, `app/api/teams/route.ts`, `app/marketing-teams-panel.tsx`, `app/hr-team-picker.tsx`, `lib/demo/world.ts` (thêm 2 team MKT ảo vào `hrSnapshot`), `tests/mkt-teams-source.test.ts` (mới).
- Việc cần làm:
  - `mktTeams()` trả `{id, name, office, mentor, memberIds(pos_user_id)}`: khi `team_source='hr'` và bản chép có ít nhất một team `kind='team'` loại `mkt` có thành viên có tài khoản POS → dùng team đó (id dạng `hr:<department_id>`); không thì dùng `marketing_teams_v1` như cũ.
  - `marketingTeamFilter` nhận cả hai loại id. Bảng "Quản lý team MKT" hiện chữ "Đang dùng team từ web nhân sự" và chỉ đọc khi nguồn là web nhân sự.
  - `/api/teams?list=1` trả thêm nhóm MKT (`dept: 'mkt'`); ô chọn team trên thanh trên cùng có 3 nhóm: Team MKT, Team Sale, Team CSKH, trong mỗi nhóm chia theo văn phòng.
- Tiêu chí xong: demo có team MKT từ HR; tắt nguồn HR thì về team cũ; không mất số.
- Cách kiểm: test chọn nguồn, test lọc `marketer_id`.

**B2. Lọc chi nhánh Tổng / Hà Nội / Thái Nguyên (mục 10)**
- File được sửa: `lib/branch.ts` (mới), `lib/scope-filter.ts` (mới, xem mục 3), `lib/team.ts`, `app/team-store.ts`, `app/dashboard.tsx`, `app/branch-switch.tsx` (mới), các route trong `UNIT_VIEWS` và route MKT (`reports/overview`, `sections`, `staff-compare`, `staff-detail`, `calls`, `cskh-origin`, `product-groups`, `van-don`, `reports/marketing`, `marketing/analytics`, route Chi phí & ROAS, `trend-cards`), `tests/branch.test.ts` (mới).
- Việc cần làm:
  - Chi nhánh của một tài khoản POS: văn phòng của team chính (`hr_departments.office_id` qua `hr_pos_team.department_id`); không ở team thì `hr_employees.office_id`; không có hồ sơ thì "Chưa rõ" (chỉ nằm trong Tổng).
  - `branchSubquery(officeId)` trả `SELECT pos_user_id FROM …` theo quy tắc trên; danh sách chi nhánh lấy từ `hr_offices` (không ghi cứng tên).
  - Thanh trên cùng: nút "Tổng | Hà Nội | Thái Nguyên" cạnh nút Sale/CSKH (trên điện thoại gộp vào ô chọn). Lưu trong `team-store` và `?branch=` (giữ khi bấm số sang trang chi tiết). Chọn chi nhánh thì ô chọn team chỉ hiện team của chi nhánh đó.
  - Áp lên `seller_id` cho Sale/CSKH/Vận đơn/Tổng quan; lên `marketer_id` cho trang MKT; chi phí QC theo marketer thuộc chi nhánh.
  - Trang chưa nhận lọc chi nhánh hiện băng "Trang này chưa lọc theo chi nhánh" như băng team hiện có.
- Tiêu chí xong: Tổng = Hà Nội + Thái Nguyên + Chưa rõ trên mọi khối (test và kiểm demo).
- Cách kiểm: test `branch` với hồ sơ giả ở hai văn phòng, một người không có hồ sơ.

**B3. Xem theo team MKT trên mọi trang (mục 2)**
- File được sửa: `lib/lens-orders.ts` (mới), `lib/scope-filter.ts`, `app/team-store.ts`, `app/hr-team-picker.tsx`, `app/dashboard.tsx` (`UNIT_VIEWS`), `app/api/reports/overview/route.ts`, `app/api/reports/sections/route.ts`, `app/api/reports/staff-compare/route.ts`, `app/api/reports/van-don/route.ts`, route Tổng quan Sale/CSKH, `app/api/reports/marketing/route.ts`, `lib/mkt-analytics.ts`, `app/overview-view.tsx`, `app/team-overview-view.tsx`, `app/van-don-view.tsx`, `app/marketing-view.tsx`, `tests/lens-orders.test.ts` (mới).
- Việc cần làm:
  - Chọn một team MKT ở ô team trên cùng → `?mktTeam=<id>` cho mọi trang. Băng trên trang: "Đang xem team MKT <tên>: chỉ tính đơn có Marketer thuộc team này, Sale và CSKH là người chốt các đơn đó."
  - `lensOrders(db, { posIds, start, end, mktTeam, branch, team })`: đọc `raw_pos_orders` theo `first_closed_at` trong kỳ, `marketer_id IN (thành viên team)`, gom theo `seller_id`: đơn lên, đơn chốt, doanh thu, AOV, DT đóng hàng trở đi, hủy, hoàn. Tách Sale/CSKH theo team của người bán như hiện nay.
  - Khi có `mktTeam`, các route đang đọc `stats_daily` chuyển sang `lensOrders` (vì `stats_daily` không có marketer). Không có `mktTeam` thì giữ đường cũ (số không đổi).
  - Tổng quan POS: khối Sale = đơn của team MKT do Sale chốt, khối CSKH = do CSKH chốt, khối MKT = chi phí + doanh thu team, khối Vận đơn = các đơn đó; bảng theo nhân viên Sale, CSKH hiện từng người với đơn của team MKT này.
  - Tổng quan Sale, CSKH: như trên, từng nhân viên.
  - Trang MKT: ô team MKT trong trang đồng bộ với ô trên cùng.
  - Kết hợp POS: chọn POS Oxy + team MKT 1 → chỉ đơn Oxy của team MKT 1.
- Tiêu chí xong: trên demo, cộng các team MKT + "Không thuộc team MKT" = số khi không chọn team (mọi khối); không chọn team thì số y như trước bước.
- Cách kiểm: test `lens-orders`; `EXPLAIN QUERY PLAN` có `idx_raw_orders_pos_closed_status_money`.

## 6. Đợt C: quyền Mentor và KPI (QA kiểm độc lập trước khi đưa demo)

**C1. Tài khoản Mentor (mục 8)**
- File được sửa: `lib/access.ts`, `lib/staff-scope.ts` (mới), `lib/scope-filter.ts`, `app/api/users/route.ts`, `app/users-panel.tsx`, các route khách hàng (`reports/customers`, `reports/customer360`, `reports/customer-detail`, `reports/care`, `reports/calls`, mua lại, khách lâu chưa mua), route bảng nhân viên Sale/CSKH, `app/mentor-view.tsx` (mới), `app/dashboard.tsx`, `lib/demo/**` (một tài khoản mentor ảo), `tests/staff-scope.test.ts` (mới), `tests/access*.test.ts`.
- Việc cần làm:
  - Vai trò mới `mentor` ("Mentor") trong `Role`, `ROLE_LABELS`, `parseRole`, bảng tài khoản. Chỉ chủ hệ thống tạo.
  - Nối tài khoản web với hồ sơ: `hr_employees.main_user_id = users.id`; nếu chưa có thì chủ hệ thống chọn hồ sơ trong bảng tài khoản, lưu `app_settings` khoá `user_employee:<userId>`.
  - `staffScope(user)` = tài khoản POS của chính người đó + thành viên các team mà người đó ngồi ghế Mentor (`MENTOR_SQL`), lấy theo ngày hôm nay. Rỗng → không thấy gì.
  - `scopeApi`: với `mentor`, **chặn mặc định**; chỉ cho các API trong danh sách trắng: khách hàng (5 route trên), bảng nhân viên Sale/CSKH, `tasks`, `auth`, `prefs`. Mọi API trong danh sách trắng ép thêm `?staffIds=` (máy chủ tự gắn, bỏ giá trị người dùng gửi). Route áp `seller_id IN (staffIds) OR care_id IN (staffIds)` cho khách và đơn.
  - Không thấy: trang nhân sự, hồ sơ cá nhân (CCCD, ngân hàng, SĐT nhân viên), chi phí MKT, cấu hình, xuất Excel. SĐT khách che như vai trò Nhân viên hiện nay.
  - Trang "Team của tôi" (`mentor-view.tsx`): bảng người mình kèm + chính mình (doanh thu, đơn chốt, AOV, tỷ lệ chốt, hoàn, KPI tháng), bấm người xem khách của người đó.
- Tiêu chí xong: test chứng minh mentor gọi bất kỳ API ngoài danh sách trắng nhận 403; gửi `staffIds` lạ bị máy chủ thay; khách của người ngoài team không bao giờ trả về.
- Cách kiểm: test + QA dò quyền trên demo bằng tài khoản mentor ảo.

**C2. KPI theo team và theo người (mục 9)**
- File được sửa: `app/api/targets/route.ts`, `lib/targets.ts`, `lib/access.ts`, `app/team-groups-view.tsx`, `app/targets-panel.tsx`, `app/team-kpi-progress.tsx`, `app/mentor-view.tsx`, `tests/targets-scope.test.ts` (mới).
- Việc cần làm:
  - KPI team (scope `team`): chỉ chủ hệ thống đặt; thêm team MKT (refId = id team MKT của B1; chỉ tiêu doanh thu New, đơn New, chi phí trần).
  - KPI người (scope `employee`): chủ hệ thống; giám đốc/trưởng nhóm cho người có `manager_id` hoặc team trong quyền; mentor cho người trong `staffScope`. Máy chủ kiểm từng `refId`.
  - Hiện tiến độ KPI người ở "Team của tôi" và bảng nhân viên; KPI team ở Theo team.
  - Ghi nhật ký (`audit_log`) ai đặt KPI cho ai.
  - Lưu ý: trước đây (1/10) KPI chỉ chủ hệ thống; anh đổi ngày 17/10 cho phần KPI theo người.
- Tiêu chí xong: test quyền ghi (chủ, giám đốc, mentor đúng/sai người, nhân viên).

## 7. Đợt D: dự đoán dựa trên số mọi bộ phận (mục 6)

**D1. Dự đoán và khuyến nghị tự tính trên web**
- File được sửa: `lib/advisor.ts` (mới), `app/api/reports/advisor/route.ts` (mới), `app/advisor-panel.tsx` (mới), `app/overview-view.tsx`, `app/team-overview-view.tsx`, `app/marketing-view.tsx`, `app/van-don-view.tsx`, `lib/access.ts`, `tests/advisor.test.ts` (mới).
- Việc cần làm (mọi con số có dòng "vì sao" chỉ ra số gốc):
  - **Sức chứa Sale**: số về mỗi ngày (MKT) ÷ số Sale đang làm = số/người/ngày. Đường cong tỷ lệ chốt theo tải: chia các ngày 60 ngày qua của từng Sale theo số được chia (vd 0–20, 21–35, 36–50, >50), tỷ lệ chốt mỗi khoảng. Khuyến nghị: "Số về dự kiến X/ngày, giữ tỷ lệ chốt ở mức khoảng tải tốt nhất cần khoảng N Sale, đang có M".
  - **Sức chứa CSKH**: khách cần chăm (đến hạn note) ÷ số CSKH; note/ngày/người trung bình; khuyến nghị thêm người khi tồn đọng tăng 3 tuần liền.
  - **Điều cần cải thiện**: lý do khách không mua/hủy/hoàn: đếm thẻ và ghi chú trên đơn hủy, đơn không xác nhận được, đơn hoàn (nguồn sẵn có: `lib/return-reasons.ts`, thẻ "VĐ: …", ghi chú cuộc gọi). Gom theo nhóm từ khoá (không có nhu cầu, đắt, đã mua chỗ khác, không nghe máy, sai số, khác), theo team và người. Nguồn lý do sẽ chỉnh khi anh trả lời câu hỏi 3.
  - **MKT**: dự đoán số về, DT New, ROAS cuối kỳ theo A4/A6.
  - Khối "Dự đoán & khuyến nghị" ở đầu Tổng quan POS và ở mỗi trang Sale, CSKH, MKT, Vận đơn, theo kỳ và bộ lọc đang chọn.
- Tiêu chí xong: test từng quy tắc với số giả; không khuyến nghị khi thiếu dữ liệu (ghi "chưa đủ số").

**D2. Phân tích sâu mỗi ngày bằng Codex (chờ anh trả lời câu hỏi 3)**
- Hướng: mỗi sáng web dựng một gói số đã gom (không tên khách, không SĐT), máy PC chạy Codex đọc gói, viết phân tích sâu, gửi kết quả lên web; khối D1 hiện thêm phần "Phân tích sâu của ngày".
- Cần anh: một lần cho phép máy PC nhận khoá đọc gói số (khoá tạo trong Cài đặt, PC giữ, Claude không đọc). Chi tiết viết khi anh đồng ý.

## 8. Kiểm thử chung
- Mỗi bước: `pnpm typecheck`, `pnpm test`, `pnpm lint` (không thêm lỗi), `pnpm build`; ghi mã thoát.
- Bước đổi bố cục (A3, A4, A5, A6, B2, B3, C1): ảnh `pnpm dev` DEMO_MODE=1 máy tính và điện thoại vào thư mục `anh/` của plan này.
- Đối chiếu số trước/sau trên demo: các khối không thuộc bước phải giữ nguyên số.
- Đợt C: QA kiểm độc lập quyền mentor trước khi gộp vào demo.

## 9. Câu hỏi gửi anh (không chặn đợt A, B1–B3, C, D1)
1. Ảnh sơ đồ: dùng 2 ảnh mới (CSKH 38, Thái Nguyên 16) là bản đúng? Đề xuất: đúng.
2. Mục 13 "xếp hạng MKT đơn theo mốc": Cách 1 (mốc trạng thái đơn) hay Cách 2 (mốc giờ trong ngày)? Đề xuất: Cách 1.
3. Mục 6: Sale/CSKH đang ghi lý do khách không mua ở đâu: thẻ trên đơn Pancake, ghi chú, hay chưa ghi? Và anh đồng ý cho máy PC chạy Codex phân tích mỗi sáng (D2)?

## 10. Rủi ro
- Đọc đơn gốc khi lọc team MKT/chi nhánh chậm hơn `stats_daily`: giới hạn kỳ tối đa 120 ngày cho lọc team MKT, quá thì báo "chọn kỳ ngắn hơn"; cache 5 phút như các báo cáo khác.
- Team MKT từ web nhân sự chưa xếp xong: B1 tự lùi về team cũ.
- Quyền mentor: lỗi là lộ số người khác. Chặn mặc định, danh sách trắng, QA kiểm.
- Trùng file với việc Vận hành đơn (`app/dashboard.tsx`, `app/van-don-view.tsx`): chạy đợt này trên nhánh demo mới nhất sau khi Vận hành đơn đã gộp; xung đột thì giữ cả hai.
- Lùi lại: mỗi bước một commit, revert từng bước được.
