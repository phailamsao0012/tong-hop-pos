# Chọn POS là lớp tính đầu tiên cho mọi số (anh Vũ 12/11/2026)

Anh Vũ yêu cầu: "tất cả các thông số ở mọi bảng trên web chịu ảnh hưởng lớn nhất từ việc chọn các pos trước … lớp tính toán đầu tiên luôn luôn là tính theo số pos đang chọn" và "chọn pos nào chỉ tính dữ liệu pos đó, nhân sự pos đó".

Người làm: Claude tự làm hết (không giao Codex, anh Vũ 12/11). **Trạng thái: đang lên plan, chưa chốt, chưa code.**

## Quy tắc

1. Mọi câu tính số bắt đầu bằng `pos_id IN (POS đang chọn)`. Sau đó mới tới kỳ, team, Sale/CSKH, marketer, sản phẩm.
2. Danh sách người chỉ gồm nhân sự có tài khoản trên POS đang chọn (`usePosStaffFilter`).
3. Tổng phải bằng tổng các dòng đang hiện. Đơn của POS đang chọn mà người làm không thuộc POS đó thì gom vào một dòng riêng "Người ngoài POS này" (mục F), không âm thầm cộng vào tổng.
4. So kỳ trước, xếp hạng, tỉ lệ, sparkline dùng cùng phạm vi POS với số chính.
5. Nguồn không có thông tin POS thì làm theo lựa chọn của anh ở mục A–E. Chưa chọn thì không đoán.

## Rà soát hiện trạng (12/11, đọc code nhánh claude/bo-xac-thuc-2-lop)

Đã lọc POS đúng:
- Tổng quan: `lib/reports/overview-report.ts`, `sections-report.ts`, phần đơn và doanh thu.
- Sale: `lib/reports/sale-analytics.ts`, `sale-quality.ts`.
- CSKH: `cskh-origin-report.ts`, `cskh-upsell.ts`.
- Cuộc gọi `calls-report.ts`, Chăm sóc khách `care-report.ts`, Vận đơn `van-don-report.ts`, Đơn hàng `lib/pancake/raw-orders.ts`, Doanh thu ngoài hậu tố `uncounted-report.ts`.
- Phần đơn, số, doanh thu của Marketing: `mkt-analytics.ts`, `marketing-overview.ts`, `mkt-trend.ts`, `mkt-orders.ts`.

Sai (luôn tính cả 6 POS hoặc bỏ qua POS đang chọn):

| # | Chỗ | Code | Sửa |
|---|---|---|---|
| 1 | Tăng trưởng | `lib/reports/growth.ts:16` cố định `POS.map`; `app/growth-view.tsx` không gửi posIds | route `/api/reports/growth` nhận `posIds`; `growthQuery(dept, posIds, …)`; client gửi `usePosIds()`; trung bình "so với bộ phận" cũng theo POS |
| 2 | Thực đạt KPI ở 4 trang | `app/team-kpi-progress.tsx:33`, `app/cskh-kpi-view.tsx:101`, `app/team-groups-view.tsx:104,342`, `app/giao-viec-kpi-view.tsx:139` gửi cả 6 POS | gửi `usePosIds()`; mục tiêu theo mục C |
| 3 | KPI phụ | `app/api/reports/kpi-extra/route.ts:18` cố định 6 POS | nhận `posIds`; `kpi2-panel.tsx` gửi POS đang chọn |
| 4 | Số trên menu (cuộc gọi hôm nay, khách quá 20 ngày) | `lib/reports/cskh-badge.ts:12-13` không lọc POS | thêm `pos_id IN (…)` cho `customer_notes` và `pos_customers`; `dashboard.tsx:949,1479` gửi posIds; cache khoá theo posIds |
| 5 | Hồ sơ nhân sự | `app/staff-profile.tsx` có ô POS riêng | mặc định theo `usePosIds()`; ô riêng (nếu giữ) chỉ thu hẹp trong POS đang chọn; huy hiệu theo mục E |
| 6 | Dòng Tổng bảng mục tiêu | `app/targets-panel.tsx:197` "Tổng · N POS" luôn 6 POS | chỉ cộng POS đang chọn |
| 7 | Tổng Marketing ≠ các dòng | `marketing-view.tsx:184,310-319`, `mkt-headline.tsx:322,331`, `mkt-roas-view.tsx:56`, `mkt-sheet-check.tsx:91-118` | áp quy tắc 3 + mục F |

Nguồn không có POS (cần anh chọn):
- `ad_costs` (chi phí QC từ sheet và nhập tay): cột `day, marketer_id, amount, campaign, source` (`drizzle/0030_ad_costs.sql`).
- `sheet_mkt_stats` (SĐT/Đơn/DT marketer tự ghi).
- `targets` theo nhân viên / team, app_settings `target_*`.
- Huy hiệu nhân viên (`BADGES_KEY`), ngày vào (`people_meta`).
- AI tóm tắt `lib/ai/ai-summary.ts:23-26` (`posIds: []`), phân tích sâu `/api/ai/insights`, dự báo `/api/ai/forecast`.

## Lựa chọn chờ anh

- **A. Chi phí QC**
  - A1 (đề xuất): chia chi phí mỗi marketer mỗi ngày theo tỉ lệ số điện thoại (SĐT duy nhất trên đơn tạo) của marketer đó ở từng POS trong ngày.
    - Ngày marketer có chi phí mà 0 số thì chia theo tỉ lệ số của cả kỳ.
    - Cả kỳ cũng 0 thì để vào "Chưa rõ POS", chỉ hiện khi chọn đủ 6 POS.
    - Tổng 6 POS luôn bằng tổng chi phí gốc (có test).
  - A2: chia theo doanh thu.
  - A3: thêm cột POS trên sheet.
  - A4: chọn ít hơn 6 POS thì ẩn chi phí, ROAS, CP/…
- **B. Số sheet để đối chiếu:** theo cách của A, hoặc chỉ so khi chọn đủ 6 POS.
- **C. Mục tiêu KPI:** đề xuất thực đạt theo POS chọn, mục tiêu giữ nguyên, ghi "mục tiêu toàn công ty".
- **D. Khách mua lại** (`sale-quality.ts:84-89`, `purchase-ladder.ts:49,127`): đề xuất chỉ tìm lịch sử trong POS đang chọn.
- **E. AI tóm tắt / phân tích sâu / dự báo:** đề xuất chỉ hiện khi chọn đủ 6 POS. Huy hiệu nhân viên: ghi "toàn công ty".
- **F. Người ngoài POS:** đề xuất dòng "Người ngoài POS này" để tổng khớp.

## Cách làm (sau khi anh chốt)

1. Thêm `lib/shared/pos-scope.ts`: `posFilterSql(col, posIds)`, `allPosSelected(posIds)`, `assertPosIds` (route nào thiếu posIds thì trả 400, không ngầm tính cả 6 POS).
2. Sửa mục 1–7 theo bảng trên, mỗi mục một commit.
3. Làm mục A–F theo lựa chọn.
   - A1: hàm thuần `allocateCost(costs, phonesByPosDay)` trong `lib/ops/cost-allocation.ts`, có test tổng không đổi.
   - Áp vào `ad-costs.ts:92,112-117`, `mkt-analytics.ts:91,146-148`, `mkt-trend.ts:73`, `sections-report.ts`, `mkt-sheet-check.ts:193,207`.
4. Test chặn tái phạm `tests/pos-scope.test.ts`:
   - quét mọi `app/api/reports/**/route.ts` và `app/api/marketing/**/route.ts`: route nào gọi D1 bảng có `pos_id` mà không đọc tham số `posIds` thì test hỏng;
   - danh sách ngoại lệ ghi rõ lý do.
5. Kiểm trên dữ liệu thật ở bản thử PC (`C:\thp\db-thu`, cổng 8789):
   - chọn từng POS một, tổng 6 lần phải bằng số khi chọn cả 6 POS;
   - doanh thu, đơn, số, chi phí (sau A1), dòng Tổng = tổng dòng.
6. typecheck, test, build:pc. Gom vào đợt khởi động lại PC.

## Liên quan

- Bảng gộp Marketing (`docs/plans/2026-11-12-gop-bang-mkt/plan.md`) dùng cùng quy tắc: các dòng chỉ gồm nhân sự POS đang chọn, so sheet theo mục B.
- App iOS (tổ app): `API.swift` calls/care/marketing gửi posIds rỗng, cskhBadge không có POS, `HomeFeed.swift` mktAnalytics không posIds. Đã nhờ điều phối báo tổ app.

## Rủi ro

- Câu tính theo POS nặng hơn (bảng tính sẵn `stats_daily*` đã có `pos_id`, nên ưu tiên dùng bảng tính sẵn).
- Cache khoá thiếu posIds sẽ trả số sai POS: mọi khoá cache phải có posIds đã sắp xếp.
- Quay lại: mỗi mục một commit, revert từng mục được.
