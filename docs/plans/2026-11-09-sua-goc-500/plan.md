# Sửa tận gốc lỗi 500: bảng tính sẵn theo nhóm sản phẩm (09/11/2026)

Anh Vũ duyệt plan tổng ("ok triển khai đi", 09/11/2026) và giao Codex viết code ("cho codex code đi", 09/11/2026).
Plan tổng (nguyên nhân, thứ tự, rủi ro) do Tổ web tổng giữ ngoài repo; file này chỉ là phần code giao Codex, làm từng bước một.

## Vì sao
D1 xử lý từng câu một. Câu nặng nhất là `segment_orders` trong `lib/pancake/order-segments.ts`: chạy mỗi lần mở Tổng quan có
lọc nhóm sản phẩm và MỌI lần mở Tổng quan CSKH (`narrowed` luôn đúng khi team = cskh), quét đơn gốc và dò từng dòng sản phẩm,
lặp lại trong 7 câu của `periodReport` và trong `querySummary`. Đo trên web thật 09/11: 196–282 lần mỗi giờ, 0,5–6 giây mỗi lần.

## Luật chung cho mọi bước
- Nhánh làm việc `codex/sua-goc-500-<bước>` từ `main` (KHÔNG từ nhánh demo; anh đã bỏ web demo). PR mở vào `main`, để nháp, chờ Claude kiểm.
- Chạy đủ `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`. Không thêm lỗi lint.
- Plan này cho phép thêm `drizzle/0051_stats_daily_seg.sql`. Không sửa migration cũ, không sửa `.github/workflows/*`, `wrangler*`.
- Không thêm chỉ mục nào trên `raw_pos_orders`.
- Số liệu, cách tính, tên nghiệp vụ, quyền xem: không đổi. Bảng mới phải cho đúng từng đồng như đường đơn gốc.
- Không số thật, tên khách trong code, test, commit. Test dùng `lib/demo/world` hoặc dữ liệu tự dựng.
- Plan và code khác nhau thì dừng, ghi câu hỏi vào cuối file này, không tự đoán.

## Bước B1a: tách biểu thức dùng chung (không đổi hành vi)
File: `lib/pancake/order-segments.ts`.
1. Tách `segmentParts(alias)` trả `{ antibiotic, skgk, oxy, notOxy }` (đúng các biểu thức đang nằm trong `orderFilterSql`).
   `orderFilterSql` dùng lại hàm này.
2. Thêm `segmentCase(alias)`:
   `CASE WHEN <oxy> THEN 'oxy' WHEN <antibiotic> THEN 'gentadox' WHEN <skgk> THEN 'skgk' ELSE 'khac' END`
   (cùng thứ tự ưu tiên với bộ lọc).
3. Tách `eventColumns(filters)` trả hàm `events(from, extra)` sinh ba câu SELECT (tạo `created_at`, chốt `closedDate`, giao
   `seller_assigned_at`) đang viết trong `segmentedStats`. `segmentedStats` dùng lại, SQL sinh ra giữ nguyên nghĩa.

Xong khi: `tests/order-segments.test.ts` và mọi test cũ đạt, không sửa test cũ. Thêm test: với mỗi đơn trong fixture,
`segmentCase` cho đúng nhóm mà `orderFilterSql` lọc ra (bốn nhóm loại trừ nhau, cộng lại đủ).

## Bước B1b: hai bảng tính sẵn và cách ghi
Migration `drizzle/0051_stats_daily_seg.sql` (bảng mới, rỗng) và hàm tự tạo bảng `ensureSegSchema` (PC chạy bản sao DB không qua
migration), theo khuôn `lib/reports/stats-mkt.ts` (0050).

- `stats_daily_seg`: khoá (pos_id, day, seller_id, segment, has_mkt) với has_mkt 0/1 = đơn có Marketer hay không.
  Cột số: đủ `STAT_COLUMNS` (lib/reports/stats.ts). Chỉ mục (pos_id, day).
- `stats_daily_seg_mkt`: khoá (pos_id, day, seller_id, marketer_id, segment), chỉ đơn CÓ Marketer. Cột số: đủ `STAT_COLUMNS`.
  Chỉ mục (pos_id, seller_id, day) để lọc team CSKH theo người bán không quét dòng của Sale.
- `id` = các giá trị khoá nối bằng ':' (như `diffStatements`).
- Marketer lưu đúng `COALESCE(NULLIF(TRIM(marketer_id),''),'')`; seller lưu `COALESCE(seller_id,'')`.

File mới `lib/reports/stats-seg.ts`:
- `segReads(db, posId, range)`: MỘT câu đọc từ đơn gốc của một POS trong khoảng ngày VN, dùng `eventColumns(EMPTY_ORDER_FILTERS)`
  và `segmentCase('o')`, gom `GROUP BY day, seller_id, marketer_id, segment` với `SUM` từng cột; cộng hai câu đọc dòng đang có
  của hai bảng. Gợi ý: `WITH seg_src AS NOT MATERIALIZED (SELECT o.*, <segmentCase> AS segment FROM raw_pos_orders o WHERE o.pos_id=?)`
  rồi ba câu sự kiện trên `seg_src`.
- `segStatements(...)`: từ kết quả trên, gộp trong JS ra dòng của `stats_daily_seg` (gom theo has_mkt) và dòng
  `stats_daily_seg_mkt` (chỉ marketer khác ''), rồi `diffStatements` cho từng bảng (chỉ ghi ô đổi, xoá ô không còn).
- `rebuildStats` (lib/reports/stats.ts) gọi thêm `segReads` trong cùng lô đọc và `segStatements` trong cùng lô ghi, như `mktReads`.
  Hàm đồng bộ đã đánh dấu đủ ngày tạo, chốt, giao của đơn đổi (markDirtyOrder), nên ngày hôm nay cũng nằm trong bảng.
- `buildSegMonth(db, posId, month)` cho bộ hẹn giờ lấp tháng cũ.
- `SEG_READY_KEY = 'stats_seg_ready'`, `SEG_EPOCH = 1`, `segStatsReady(db)` nhớ 60 giây (khuôn `mktStatsReady`).
- `lib/ops/scheduler.ts`: thêm `segPending` / `segEpoch` theo khuôn `mktPending` (sau mkt, cùng `light()`), xong thì ghi cờ
  `SEG_READY_KEY = SEG_EPOCH`. Đổi `SEG_EPOCH` thì lấp lại từ đầu và cờ cũ tự hết hiệu lực.
- Lượt lấp chạy trong bộ hẹn giờ (cùng Durable Object với đồng bộ, không chạy chồng). Không đổi phiên bản bộ nhớ đệm báo cáo khi lấp.

Test mới `tests/seg-stats.test.ts` (khuôn `tests/mkt-stats.test.ts`, thế giới demo nhiều POS, nhiều ngày):
1. Sau `rebuildStats`, cho mọi tổ hợp nhóm (all, gentadox, skgk, khac, oxy) × team (all, sale, cskh) × nguồn CSKH (all, self, mkt,
   một marketer cụ thể): tổng từng cột STAT_COLUMNS theo (pos, ngày, người bán) đọc từ bảng = đọc qua `segmentedStats` đường đơn gốc.
2. Đơn đổi trạng thái hoặc thêm sản phẩm kháng sinh: đánh dấu ngày, dựng lại, bảng theo kịp.
3. `buildSegMonth` trên bảng đã đủ không ghi gì; làm hỏng vài dòng rồi lấp lại thì về như cũ.
4. Khoá quy tắc: test giữ một chuỗi băm của `segmentCase('o')` kèm `SEG_EPOCH`. Đổi biểu thức mà không tăng `SEG_EPOCH` thì test hỏng,
   thông báo "đổi quy tắc nhóm thì tăng SEG_EPOCH và cập nhật băm".

## Bước B1c: đọc bảng mới
File: `lib/pancake/order-segments.ts`, `lib/reports/overview-report.ts`.
- `SegmentBase` thêm `seg?: 'flat' | 'detail'`. Có `seg` thì phần "ngày đủ" của CTE `stats_daily` đọc từ bảng mới thay cho
  `main.stats_daily`, và lọc ngay trong phần đó: `teamFilter('seller_id', team, true, unit)`, `countedFilter('seller_id')`,
  người bán (`employeeIds`), `segment=?` khi có lọc nhóm, và nguồn khi team = cskh:
  - flat (không chọn một marketer cụ thể): `stats_daily_seg`, self → `has_mkt=0`, mkt → `has_mkt=1`, marketer_id trả ''.
  - detail (chọn một marketer cụ thể, hoặc bảng tóm tắt theo Marketer): `stats_daily_seg` có `has_mkt=0` (marketer '') UNION ALL
    `stats_daily_seg_mkt` (marketer thật, `marketer_id=?` nếu chọn một người); bỏ phần nào nguồn không cần.
- Không cắt giờ: `lastDay = ngày sau ngày cuối`, `lastDayStartUtc = endUtc`, nên ba câu sự kiện đơn gốc rỗng. Có cắt giờ (kỳ so sánh
  cùng mốc giờ): bảng cho các ngày đủ, đơn gốc chỉ cho phần ngày cuối, như `base` hiện có. KHÔNG cộng thêm đơn gốc của hôm nay khi
  không cắt giờ (bảng đã có hôm nay, cộng sẽ trùng).
- `periodReport`: khi `filters.status.isDefault` và `segStatsReady` thì dùng base `seg` ('detail' nếu có marketerId, còn lại 'flat')
  cho cả có và không cắt giờ. Trạng thái khác mặc định hoặc bảng chưa sẵn sàng: giữ nguyên đường cũ.
- Bảng sản phẩm (`byProduct`): khi trạng thái mặc định, không lọc nhóm, không lọc nguồn, không cắt giờ và `sellerProductStatsReady`
  thì đọc `stats_daily_seller_product` với `where` (đã lọc team) như nhánh không lọc; còn lại giữ đường cũ (làm ở bước sau).
- `querySummary` trong `overviewReport`: khi trạng thái mặc định và bảng sẵn sàng, truyền base `seg` không cắt giờ: Sale theo nhóm dùng
  'flat', CSKH theo Marketer (`GROUP BY marketer_id`) dùng 'detail'.
- Số khách và đối soát (`customers`, `closedCustomers`, `recon`) chưa đổi ở bước này.

Test thêm trong `tests/seg-stats.test.ts`: với thế giới demo, so SQL của `segmentedStats` có base `seg` (flat và detail, có và không cắt
giờ) với không có base, cho mọi tổ hợp lọc ở B1b: từng câu tổng, theo POS, theo người bán, theo ngày, theo marketer cho kết quả bằng nhau.

Xong khi: đủ 4 lệnh đạt; Claude kiểm một lần; Tổ web tổng gửi anh số đo trước/sau từ bản sao trên PC; chỉ lên web thật khi anh "ok lên".

## Câu hỏi của Codex
(Codex ghi vào đây nếu plan và code khác nhau.)
