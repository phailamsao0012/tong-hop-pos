# Bảng tính sẵn theo nhóm sản phẩm và nguồn đơn (bỏ câu `WITH segment_orders` khi người xem mở trang)

Anh Vũ 09/11/2026 duyệt hướng này:
- "t muốn xử tận gốc, không muốn che số"
- "các ngày đã qua, những data nào cố định không thay đổi thì mình có thể tính luôn thành 1 giá trị, để khi mình xem tổng quát 1 thời gian, cái số phải tính sẽ ít hơn"
- "cho codex code đi"

Nhánh: `codex/bang-tinh-san`, tách từ `origin/main` (bae2e61, đã gộp bản vá #146).
Worktree trên PC: `C:\thp\codex-bang`.

## Vì sao làm (số đo thật)
Lỗi 500 trên web thật đến từ D1 báo `overloaded`. Câu nặng nhất là `WITH segment_orders AS NOT MATERIALIZED (...)` trong `lib/pancake/order-segments.ts` (`segmentedStats`):
- 282 lượt/giờ, trung bình 567 ms, có lúc 5–6 s, đọc khoảng 95.000 dòng mỗi lượt.
- Câu này chạy mỗi khi báo cáo có lọc nhóm sản phẩm (`productSegment`), nguồn đơn CSKH (`orderOrigin`/`marketerId`), trạng thái khác mặc định, hoặc kỳ so sánh cắt giờ (`cutoffUtc`).
- Nó quét lại đơn gốc `raw_pos_orders` cho cả kỳ. Mở Sale tính 4 nhóm sản phẩm là 4 câu như vậy cùng lúc (`overview-report.ts` `querySummary` cho từng `segmentsFor`).

Bảng `stats_daily` đã tính sẵn theo (pos_id, day, seller_id) nhưng không có chiều nhóm sản phẩm và nguồn đơn, nên khi lọc thì code bỏ bảng này.

## Mục tiêu
1. Báo cáo có lọc **nhóm sản phẩm** và/hoặc **nguồn đơn (tự ups / MKT, theo marketer)**, trạng thái mặc định, cả kỳ là ngày đủ:
   đọc **bảng tính sẵn mới**, không quét `raw_pos_orders`.
2. Số trả về phải **khớp tuyệt đối** với cách tính hiện tại (`segmentedStats`), mọi cột `STAT_COLUMNS`, mọi bộ lọc trên.
3. Bảng được cập nhật trong **cùng lượt đồng bộ** đang cập nhật `stats_daily` (`rebuildStats` trong `lib/reports/stats.ts`), đúng các ngày bẩn (`DirtyBuckets`).
   Số luôn mới bằng lần đồng bộ gần nhất. **Không dùng số cũ để che.**
4. Trường hợp chưa hỗ trợ thì giữ nguyên đường cũ (`segmentedStats`), số không đổi. Gồm: trạng thái khác mặc định, kỳ so sánh cắt giờ, ngày chưa điền xong lịch sử.

## Không làm
- Không đổi cách tính, tên số, quyền xem, giao diện.
- Không đổi `wrangler*.json*`, `.github/workflows/*`.
- Được thêm **đúng 1** file migration mới trong `drizzle/` (bước 1). Không sửa migration cũ.
- Không tạo chỉ mục rộng trên `raw_pos_orders`. Không chạy gì lên web thật.
- Không đưa số thật, tên, SĐT, khoá vào code, test hay commit. Repo công khai.

## Định nghĩa phân loại (phải dùng ĐÚNG quy tắc hiện có, không viết quy tắc mới)
Mỗi đơn thuộc đúng 1 nhóm, theo `orderFilterSql` trong `lib/pancake/order-segments.ts`:
- `oxy`: `pos_id = COMBO_OXY_POS`.
- `gentadox` (Kháng sinh): không phải oxy, có dòng hàng khớp `antibiotic`.
- `skgk`: không phải oxy, không kháng sinh, khớp `skgk` (tên SK/GK/godkill hoặc nhãn `SK+GK`).
- `khac`: còn lại.

Nguồn đơn: `origin = 'mkt'` khi `NULLIF(TRIM(marketer_id),'')` khác NULL, ngược lại `'self'`. Lưu thêm `marketer_id`, chuỗi rỗng khi self, để lọc theo từng marketer.

**Cách làm để không lệch quy tắc:** viết 1 hàm SQL dùng chung `segmentKeyExpr(alias)` trả về biểu thức CASE cho ra `'oxy'|'gentadox'|'skgk'|'khac'`. Hàm dựng từ đúng các mảnh `antibiotic`, `skgk`, `notOxy` đang có.
Tách các mảnh này thành hàm riêng trong `order-segments.ts`, rồi để `orderFilterSql` và `segmentKeyExpr` cùng gọi chung, không chép hai lần.

## Bước 1. Bảng mới (migration)
File `drizzle/0051_stats_daily_segment.sql`, kiểm số thứ tự mới nhất trước khi đặt tên. Nếu dự án còn nơi khác tự tạo bảng khi chạy, như `ensureStatsSchema` trong `lib/reports/stats.ts`, thì thêm vào đó theo cùng kiểu.
```sql
CREATE TABLE IF NOT EXISTS stats_daily_segment (
  id TEXT PRIMARY KEY,               -- `${pos_id}:${day}:${seller_id}:${segment}:${marketer_id}`
  pos_id TEXT NOT NULL,
  day TEXT NOT NULL,                 -- YYYY-MM-DD giờ VN, như stats_daily
  seller_id TEXT NOT NULL DEFAULT '',
  segment TEXT NOT NULL,             -- oxy | gentadox | skgk | khac
  marketer_id TEXT NOT NULL DEFAULT '', -- '' = tự ups (self)
  <đủ các cột STAT_COLUMNS, INTEGER/REAL NOT NULL DEFAULT 0 giống stats_daily>,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stats_daily_segment_pos_day ON stats_daily_segment(pos_id, day);
```
Cột lấy đúng danh sách `STAT_COLUMNS` (lib/reports/stats.ts) tại thời điểm làm.

**Xong khi:** `pnpm typecheck` qua. Migration áp được lên DB demo cục bộ (`pnpm db:migrate:local`).

## Bước 2. Ghi bảng trong `rebuildStats`
Trong `lib/reports/stats.ts`, `rebuildStats(db, dirty)`, với mỗi (posId, khoảng ngày bẩn):
- Thêm vào `db.batch([...])` các câu đọc giống hệt 3 cơ sở đang dùng cho `stats_daily`:
  - ngày tạo (`createdSelect`)
  - ngày chốt (`closedSelect`, cùng `closed_quantity` qua bảng dòng hàng)
  - ngày giao người bán (`assigned_orders`, `assigned_closed_orders`)
  
  Chỉ khác ở chỗ GROUP BY thêm `segmentKeyExpr('o')` và `COALESCE(NULLIF(TRIM(o.marketer_id),''),'')`.
- Gộp theo khoá (day, seller, segment, marketer) như đang gộp cho `stats_daily`. Ghi bằng cùng cách upsert/diff đang dùng (`upsertStatement` / `diffStatements`).
- Xoá các dòng cũ của (pos, day) không còn, giống phần DELETE của `stats_daily`.
- Chú ý giới hạn số câu mỗi batch, và lỗi `SQLITE_TOOBIG` đã sửa ở #138. Chia lô theo cách code hiện tại đang chia.

Điền lịch sử: thêm hàm `backfillSegmentMonth(db, posId, month)`, giống `backfillSellerProductMonth` đang có. Bộ hẹn giờ gọi dần, mới trước cũ sau.
Xong hết lịch sử thì ghi khoá `app_settings` `stats_segment_epoch`, giống `SELLER_PRODUCT_EPOCH`.
Thêm `segmentStatsReady(db)` giống `sellerProductStatsReady`.

**Xong khi:** test mới (bước 4) cho thấy: dựng từ một bộ đơn mẫu, tổng mỗi cột của `stats_daily_segment` theo (pos, day, seller) **bằng** `stats_daily` cùng khoá.

## Bước 3. Đọc bảng khi báo cáo có lọc
Trong `segmentedStats` (lib/pancake/order-segments.ts), hoặc 1 hàm mới cùng chữ ký và cùng đầu ra (`{ sql, binds }` dựng CTE tên `stats_daily` và `stats_daily_product`):
- Nếu `filters.status.isDefault` && không có `base` cắt giờ && `segmentStatsReady`:
  - CTE `stats_daily` = `SELECT pos_id, seller_id, marketer_id, day, <STAT_COLUMNS> FROM main.stats_daily_segment WHERE pos_id IN (...) AND day>=? AND day<=? <lọc segment> <lọc origin/marketer> <teamFilter/countedFilter/employee như cũ>`.
  - Lọc segment: `segment = ?`, `all` thì không lọc.
  - Lọc origin: `self` → `marketer_id=''`; `mkt` → `marketer_id<>''`; marketer cụ thể → `marketer_id=?`.
  - Chỉ áp origin khi `team === 'cskh'`, giữ đúng điều kiện trong `parseOrderFilters` / `orderFilterSql`.
  - Ngày truyền vào là ngày VN `start`/`end` (không phải UTC). Hàm cần nhận thêm `start`, `end` dạng ngày.
  - Phần sản phẩm (`stats_daily_product` trong CTE) giữ nguyên đường cũ ở bước này.
    Nếu trang chỉ cần tổng (`querySummary` ở overview-report.ts:~189, lens-orders.ts:~189) thì không dựng phần sản phẩm. Thêm tham số `withProducts=false` cho các chỗ đó.
- Còn lại: giữ nguyên SQL cũ.
- Các chỗ gọi: `lib/reports/overview-report.ts` (66, 189), `lib/reports/lens-orders.ts` (66, 189). Kiểm thêm các file khác import `order-segments` (`git grep -n "segmentedStats\|orderFilterSql"`).
  Chỗ nào dùng `virtual.sql` thì đổi theo, đầu ra phải giữ nguyên.

**Xong khi:** test đối chiếu bước 4 qua. Không còn câu `WITH segment_orders` khi mở Sale/CSKH/Tổng quan với lọc nhóm sản phẩm hoặc nguồn đơn, trạng thái mặc định.
Kiểm bằng test: đếm câu SQL chứa `segment_orders` qua D1 giả.

## Bước 4. Test đối chiếu (bắt buộc)
File `tests/stats-segment.test.ts`, chạy bằng node:test như các test khác (xem `tests/support/`):
1. Dựng DB SQLite trong bộ nhớ, đủ bảng cần, theo cách các test stats hiện có đang làm. Bộ đơn mẫu tự sinh, không dùng số thật:
   - đủ 6 POS, có `oxytetra` và `sieu-vo-gao`
   - đủ các trạng thái
   - đơn có/không marketer, có quà tặng (`is_bonus`), có nhãn `SK+GK`
   - tên dòng hàng có gentadox/detox/oxy huyết/nano shield/sk/gk/godkill
   - đơn chốt ngày khác ngày tạo, đơn giao người bán ngày khác
2. Chạy `rebuildStats` cho toàn bộ ngày.
3. Với mọi tổ hợp: segment ∈ {all, gentadox, skgk, khac, oxy} × team ∈ {all, sale, cskh} × origin ∈ {all, self, mkt, mkt+marketer cụ thể} × có/không `employeeIds`, so tổng mọi `STAT_COLUMNS` của đường mới với đường cũ (SQL `segment_orders` cũ). Phải **bằng nhau tuyệt đối**.
4. Đổi trạng thái 1 đơn cũ (giao thành công / hoàn / huỷ), đánh dấu bẩn đúng ngày bằng `markDirtyOrder`, chạy lại `rebuildStats`, so lại: vẫn bằng nhau.
5. Tổng theo (pos, day, seller) của `stats_daily_segment` bằng `stats_daily`.

## Bước 5. Kiểm đêm
Trong lượt hẹn giờ có sẵn (scheduler / cron 5 phút), 1 lần mỗi đêm sau 02:30 giờ VN:
- So tổng 7 ngày gần nhất theo (pos, day) giữa `stats_daily_segment` và `stats_daily`.
- Lệch thì đánh dấu bẩn các ngày đó, tính lại, rồi ghi `console.warn` + `alert_log` theo cách các cảnh báo khác đang ghi.
- Có test.

## Bước 6. Nộp bài
Chạy đủ: `pnpm typecheck`, `pnpm test`, `pnpm lint` (không thêm lỗi mới), `pnpm build`.
Sandbox Codex có thể chặn `pnpm test`/`pnpm build` (spawn EPERM). Khi đó ghi rõ là không chạy được. Claude chạy các lệnh này ngoài sandbox và tự commit.
Ghi tóm tắt việc đã làm vào `docs/plans/2026-11-09-bang-tinh-san-nhom-sp/ket-qua.md`: file đổi, cách kiểm, điều chưa làm.

## Rủi ro và cách lùi
- **Lệch số:** đã có test đối chiếu tuyệt đối. Trên PC, Claude chạy thêm script so đường mới và đường cũ trên dữ liệu thật **chỉ trên PC** cho 30 ngày × mọi bộ lọc trước khi lên.
- **Lịch sử chưa điền xong:** `segmentStatsReady` = false thì dùng đường cũ.
- **Lùi:** bỏ nhánh đọc bảng mới. Bảng thừa để đó không ảnh hưởng.
