# Giảm dòng ghi D1 để nằm trong phần gói Workers trả phí đã gồm (18/10/2026)

Tổ web tổng viết. Anh Vũ giao ngày 18/10: tháng trước web ghi D1 vượt phần gói Workers trả phí đã gồm nên bị tính thêm. Anh đồng ý 3 việc: cắt ghi thừa, gửi thư xin hoàn (anh tự gửi, không nằm trong plan này), cảnh báo Telegram trước khi gần chạm mức. Mục tiêu: **giữ gói trả phí hiện tại, không hạ gói, phần vượt mức về 0.**
Quy trình chung (anh 15/10): Codex làm toàn bộ, không hỏi anh giữa chừng, Claude kiểm thử, anh xem demo, anh ok mới lên web thật.

## 0. Mức dùng so với phần gói đã gồm (kỳ 17/9–16/10, đọc từ hoá đơn)

Một tài khoản Cloudflare gồm cả web thật, demo, demo2 (mỗi bản một D1, cùng tính chung).

| Khoản | Gói đã gồm mỗi tháng | Kỳ vừa rồi | Tình trạng |
|---|---|---|---|
| D1 dòng ghi | 50 triệu | khoảng 75 triệu | **Vượt khoảng 25 triệu** (phần bị tính thêm chính) |
| D1 dung lượng | 5 GB | khoảng 6 GB | **Vượt khoảng 1 GB** |
| D1 dòng đọc | 25 tỉ | trong mức | Không tính thêm |
| Workers lượt gọi | 10 triệu | trong mức | Không tính thêm |
| Workers CPU | 30 triệu ms | trong mức | Không tính thêm |
| Workers Logs | 20 triệu | trong mức | Không tính thêm |

Khoảng 75 triệu / 30 ngày ≈ 2,5 triệu dòng ghi mỗi ngày. Muốn không vượt cần ≤ 1,6 triệu/ngày cho cả ba D1; plan nhắm **≤ 1,3 triệu/ngày** (≈ 40 triệu/tháng, chừa 20% dư).

**Vì sao trần ngày hiện tại không chặn được:** `D1_DAILY_WRITE_LIMIT` trong `lib/scheduler.ts` đang là 4 triệu/ngày (≈ 120 triệu/tháng), `DEFAULT_BUDGET` trong `lib/sync.ts` cho lịch sử tới 3,5 triệu/ngày. Trần này cao hơn gấp đôi phần gói gồm, nên web không bao giờ tự dừng. Cảnh báo dung lượng `DEFAULT_CONFIG` trong `lib/watch-core.ts` (`d1WarnMb: 7000`, `d1HighMb: 8500`) cũng đặt trên mức 5 GB của gói.

## 1. Chỗ ghi nhiều (đọc từ code nhánh demo; số chưa đo, G1 sẽ đo)

D1 tính mỗi dòng chỉ mục bị đổi là một dòng ghi thêm.

1. **Đơn đổi bị ghi lại toàn bộ** (`lib/sync.ts` `orderStatements`). Đơn có `updated_at` mới (đổi trạng thái, sửa ghi chú…) thì:
   - câu `INSERT … ON CONFLICT DO UPDATE SET` gán lại **mọi cột** (kể cả `raw_json` khoảng 10 KB). SQLite cập nhật mọi chỉ mục có cột nằm trong `SET`, nên cả khoảng 14 chỉ mục của `raw_pos_orders` đều bị ghi, dù phần lớn giá trị không đổi;
   - `DELETE FROM raw_pos_order_items WHERE order_id=?` rồi chèn lại từng dòng hàng (mỗi dòng 1 + 2 chỉ mục, nhân 2 vì xoá rồi chèn), dù đơn chỉ đổi trạng thái.
   Một đơn đổi trạng thái 5–10 lần trong đời, mỗi lần tốn vài chục dòng ghi. Đây nhiều khả năng là phần lớn nhất.
   (`onlyChanged` đã bỏ đơn có `updated_at` không đổi; phần ghi chú `noteStatements`, `stats_daily*`, `customer_stats`, `customer_seller_stats` đã có `WHERE` so giá trị nên không cần sửa.)
2. **Bản chép nhân sự** (`lib/hr-sync.ts` `pullHr`, mỗi 5 phút và mỗi khi web nhân sự báo đổi): mã băm đổi là `DELETE` cả 7 bảng `hr_*` rồi chèn lại toàn bộ. Mã băm gồm ngày, nên ít nhất mỗi ngày một lần, cộng mỗi lần HR sửa bất kỳ ai. Mỗi lần kéo cũng ghi lại `app_settings` trạng thái.
3. **Việc chạy mỗi phút** (`worker.ts` `scheduled` → `lib/dispatch.ts` `runDispatch`, `lib/stuck-alert.ts`): khoá trong `app_settings` (INSERT OR IGNORE + UPDATE + mở khoá UPDATE) và `UPDATE dispatch_pos SET last_run_at` từng POS **mỗi phút**, kể cả khi không có gì đổi.
4. **Demo và demo2** chạy cùng mã đồng bộ trên đơn ảo mỗi 5 phút, ghi vào D1 riêng nhưng tính chung tài khoản.
5. **Trần ngày quá cao** (mục 0), nên lượt lịch sử, dựng số liệu tháng (`buildPendingStats`) có thể chạy tới hàng triệu dòng một ngày.

## 2. Không được đổi
- Mọi số trên web giữ nguyên: doanh thu, đơn chốt (`first_closed_at`), MKT chốt (`first_confirmed_at`), Đang đóng hàng, Vận đơn, số liệu khách. Các cột `COALESCE`/`MIN` của `first_confirmed_at`, `first_closed_at`, `first_sent_at`, `delivered_at`, `returned_at`, `cancelled_at` giữ đúng nghĩa cũ (giữ giá trị đã lưu, chỉ lùi về sớm hơn với `first_closed_at`, `first_sent_at`).
- Thứ tự ưu tiên đồng bộ trong `runScheduledSync`: đơn mới/sửa trước, rồi nhân viên/sản phẩm, khách, lịch sử. Đơn mới/sửa luôn được lấy kể cả khi chạm trần.
- Không đổi epoch, `WORLD_VERSION`, schema, chỉ mục, migration, `.github/**`, `wrangler*.json*`.
- Không xoá dữ liệu nào trên D1 (dung lượng xem mục 5, chờ anh).

## 3. Các bước

Thứ tự: G1 → G2 → G3 → G4 → G5 → G6 → K1 (đã xong 18/10) → G7 → K2 (thêm 18/10 sau khi K1 chỉ giảm khoảng 25%). Mỗi bước một commit trên nhánh `codex/giam-ghi-d1-1810`.

**G1. Đo mức ghi theo từng khâu và hiện cho chủ hệ thống**

File được sửa: `lib/d1-usage.ts` (mới), `lib/scheduler.ts`, `lib/sync.ts`, `app/api/sync/scheduler/usage/route.ts` (mới), `app/scheduler-panel.tsx`, `app/d1-usage-panel.tsx` (mới, nếu tách thẻ), `lib/demo/*.ts` (nếu demo cần số giả), `tests/*.test.ts`, `tests/support/*.ts`.

- `runScheduledSync` trả thêm `stages: Record<string, number>`: số dòng ghi của từng khâu `recent`, `users`, `products`, `customers`, `customers_backfill`, `backfill`. `SyncScheduler` cộng thêm `stats` (từ `buildPendingStats`) và lưu.
- `lib/d1-usage.ts`: kiểu `UsageDay = { day: string /* UTC */, writes: number, stages: Record<string, number>, sizeBytes: number | null }`, hàm thuần `addUsage(history, day, stages, sizeBytes)` (giữ 45 ngày gần nhất), `cycleOf(dayUtc)` trả kỳ hoá đơn từ ngày 17 tháng này tới ngày 16 tháng sau (`CYCLE_START_DAY = 17`), `cycleSummary(history, today)` trả `{ start, end, daysElapsed, daysTotal, writes, projected, sizeBytes, included: { writes: 50_000_000, sizeBytes: 5 * 1024 ** 3 } }`, `projected = Math.round(writes / daysElapsed * daysTotal)`.
- Dung lượng: lấy `meta.size_after` của lần ghi D1 cuối trong lượt (D1 trả trong `meta`), không có thì `null`. Không chạy câu đếm dung lượng riêng.
- Lưu lịch sử trong storage của Durable Object (`this.ctx.storage`, khoá `usage`), **không ghi D1** để việc đo không tốn dòng ghi.
- Route `GET /api/sync/scheduler/usage` (tiền tố `/api/sync/scheduler` đã là `OWNER_ONLY` trong `lib/access.ts`, không sửa `access.ts`): gọi Durable Object lấy `{ history, cycle }`.
- Thẻ "Mức dùng Cloudflare (D1 của bản này)" trong `app/scheduler-panel.tsx`, chỉ chủ hệ thống thấy (panel này đã chỉ cho chủ):
  - hai thanh: "Dòng ghi kỳ này" (đã dùng / 50 triệu, kèm "dự tính cả kỳ"), "Dung lượng" (/ 5 GB); xanh < 70%, vàng 70–90%, đỏ ≥ 90%;
  - biểu đồ cột 30 ngày, mỗi cột chia màu theo khâu, có chú thích; tooltip "Cách tính": "Đếm từ số D1 trả về sau mỗi lượt đồng bộ của bản này; chưa gồm ghi từ thao tác của người dùng và hai bản demo";
  - dùng kiểu thẻ, màu đang có của trang (xanh #17684b).
- Test: `addUsage` cộng đúng ngày, cắt 45 ngày; `cycleOf` các ngày 16, 17, 31, đổi năm; `cycleSummary` dự tính; route trả 403 cho người không phải chủ.

**G2. Đơn đổi chỉ ghi cột đổi, dòng hàng chỉ ghi khi đổi**

File được sửa: `lib/sync.ts`, `tests/*.test.ts`, `tests/support/*.ts`.

- Sửa `onlyChanged` (hoặc thêm hàm `loadStored`) để với các đơn của trang, đọc một lần theo khối 90 id: mọi cột mà `orderStatements` ghi, kể cả `raw_json` (đọc thẳng cột, vẫn theo khối 90; gói gồm rất nhiều dòng đọc, dòng đọc không phải chỗ tốn). Cùng lượt, đọc dòng hàng hiện có: `SELECT … FROM raw_pos_order_items WHERE order_id IN (…)` (đi qua `idx_raw_items_order`).
- Tách `orderStatements` thành: hàm thuần `orderRow(posId, shopId, o, now)` trả object cột → giá trị (đúng các giá trị đang bind), và `itemRows(id, posId, o)` trả mảng dòng hàng.
- Đơn **chưa có** trong D1: giữ nguyên câu `INSERT` như cũ (một dòng + chỉ mục là bắt buộc).
- Đơn **đã có**: tính giá trị mới theo đúng luật cũ (cột `COALESCE(cũ, mới)` giữ giá trị cũ nếu có; `first_closed_at`, `first_sent_at` lấy giá trị nhỏ hơn trong cũ/mới, bỏ null), so từng cột với bản đã lưu, và:
  - không cột nào khác → không ghi gì cho dòng đơn;
  - có cột khác → `UPDATE raw_pos_orders SET <chỉ các cột khác> WHERE id=?`. Không gán lại `fetched_at` khi chỉ mỗi nó khác (cột này không ai đọc để tính số; kiểm bằng `rg fetched_at` và ghi kết quả vào tóm tắt). Nếu có cột khác thì vẫn cập nhật `fetched_at` cùng câu đó.
  - so sánh: chuỗi so nguyên văn, số so `Number`, null so null; `raw_json` so chuỗi JSON nguyên văn.
- Dòng hàng: so theo `id` (`${orderId}:${index}`) từng cột đang ghi. Dòng mới → `INSERT`; dòng đổi → `UPDATE … SET <cột khác> WHERE id=?`; dòng thừa (đơn bớt hàng) → `DELETE … WHERE id=?`. Không còn `DELETE … WHERE order_id=?` cho đơn đã có. Giữ `INSERT OR REPLACE` cho đơn mới (lý do chạy chồng đã ghi trong chú thích).
- Ghi chú khách trong đơn (`noteStatements`) giữ nguyên.
- `markDirtyOrder` / `markDirtyCustomer` chỉ gọi khi dòng đơn hoặc dòng hàng thật sự đổi (không đổi gì thì số liệu ngày, số liệu khách không cần dựng lại). Cẩn thận: đổi `seller_id`, `created_at`, `first_closed_at`, `phone` phải đánh dấu cả ngày/SĐT cũ lẫn mới như cách hiện tại đang làm (đọc `markDirtyOrder` và giữ đúng).
- Áp dụng cho cả `syncRecent` và `syncBackfill`.
- Test (`tests/sync-*.test.ts` có sẵn, thêm ca):
  1. Đồng bộ một trang 2 lần y hệt → lần 2 ghi 0 dòng (dòng đơn, dòng hàng, số liệu).
  2. Đơn chỉ đổi `status_code` và `updated_at` → một câu `UPDATE` đúng các cột đó (+ `last_status_at`, `status_history_json`, `raw_json`…), không đụng `raw_pos_order_items`.
  3. Đơn thêm/bớt/sửa một dòng hàng → đúng một INSERT/DELETE/UPDATE dòng hàng.
  4. `first_closed_at` mới sớm hơn → lùi; muộn hơn → giữ cũ. `first_confirmed_at` đã có → giữ.
  5. So sánh toàn bộ bảng `raw_pos_orders`, `raw_pos_order_items`, `stats_daily*`, `customer_stats` sau một chuỗi đồng bộ (đơn mới, đổi trạng thái, đổi người bán, bớt hàng) giữa cách cũ và cách mới: **giống hệt** (trừ `fetched_at`, `updated_at` của bảng số liệu).
  6. Ghi số dòng ghi trước/sau của chuỗi ở ca 5 vào tóm tắt.

**G3. Bản chép nhân sự chỉ ghi dòng đổi**

File được sửa: `lib/hr-sync.ts`, `lib/hr-copy.ts` (chỉ nếu cần hàm thuần so sánh), `tests/*.test.ts`, `tests/support/*.ts`.

- Thay `replaceStatements` (xoá cả 7 bảng rồi chèn lại) bằng so sánh theo khoá chính từng bảng (`hr_offices.id`, `hr_departments.id`, `hr_levels.id`, `hr_titles.id`, `hr_employees.id`, `hr_assignments.id`, `hr_pos_team.pos_user_id`): đọc bản đang lưu, dòng mới → INSERT, dòng khác → UPDATE cột khác, dòng không còn → DELETE theo khoá. Giữ trong một `db.batch` như cũ để bảng không bị nửa cũ nửa mới.
- Giữ mã băm để bỏ qua sớm khi không đổi; giữ việc tính lại theo ngày mới (`computePosTeams(s, day)`), nhưng nhờ so sánh, sang ngày mới chỉ dòng đổi vai trò bị ghi.
- `saveState` khi mã băm không đổi: chỉ ghi nếu `pulledAt` đã lưu cũ hơn 30 phút hoặc `error` đổi (trang Cài đặt vẫn thấy "kéo lúc" đúng trong 30 phút). Đổi mã băm hoặc lỗi thì ghi ngay như cũ.
- Test: snapshot giống hệt hai lần → lần 2 ghi 0 dòng bảng `hr_*`; đổi tên một nhân viên → đúng 1 UPDATE `hr_employees` (và `hr_pos_team` nếu tên chép sang); xoá một phòng → đúng DELETE; bảng sau cùng giống hệt cách cũ (xoá rồi chèn); sang ngày mới mà không ai đổi vai trò → 0 dòng `hr_pos_team`.

**G4. Việc chạy mỗi phút chỉ ghi khi có gì đổi**

File được sửa: `lib/dispatch.ts`, `lib/stuck-alert.ts`, `lib/scheduler.ts`, `lib/stats.ts`, `tests/*.test.ts`, `tests/support/*.ts`.

- `runDispatch`: đọc `dispatch_pos` có `mode IN ('dry','live')` **trước** khi lấy khoá; không có POS nào bật thì thoát, không ghi gì. Có thì giữ khoá như cũ.
- `UPDATE dispatch_pos SET last_run_at=…, waiting=…`: chỉ ghi khi `waiting` khác bản lưu, `last_error` cần xoá, hoặc `last_run_at` đã lưu cũ hơn 10 phút. Trang chia số đang hiện "chạy lúc" thì chấp nhận lệch tối đa 10 phút; nếu giao diện có chữ kiểu "vừa chạy" dựa trên `last_run_at` dưới 10 phút thì giữ đúng nghĩa (ghi vào "Chỗ làm khác plan" nếu phải đổi chữ).
- `lib/stuck-alert.ts`: chỉ ghi `app_settings` khi thật sự gửi tin hoặc đổi cấu hình (đọc kỹ đoạn `claimed` và giữ chống gửi trùng).
- `lib/scheduler.ts` / `lib/stats.ts`: các khoá "ready" (`SELLER_PRODUCT_READY_KEY`, `SENT_AT_READY_KEY`) và `INSERT … ON CONFLICT DO UPDATE` của `app_settings` thêm `WHERE app_settings.value IS NOT excluded.value` để không ghi lại giá trị y hệt.
- `pos_shops` cuối `syncRecent` (`last_sync_at`, `status`, `recent_watermark`…): giữ nguyên (cần cho "Cập nhật lúc").
- Test: 10 lượt dispatch liền nhau không có POS bật → 0 dòng ghi; có POS bật nhưng không có đơn chờ → tối đa 1 ghi `last_run_at` mỗi 10 phút; khoá vẫn chặn chạy chồng (test sẵn có phải còn qua).

**G5. Demo và demo2 ghi ít hơn**

File được sửa: `lib/scheduler.ts`, `lib/dispatch.ts`, `lib/demo/*.ts`, `worker.ts`, `tests/*.test.ts`.

- Chỉ khi `isDemo()`: lượt đồng bộ nền (`SyncScheduler.alarm` → `runOnce`) chạy tối đa **30 phút một lần** (bỏ qua lượt nếu `lastRunAt` chưa đủ 30 phút; vẫn đặt alarm như cũ). Nút "Đồng bộ ngay" trên demo vẫn chạy ngay.
- Chỉ khi `isDemo()`: `runDispatch` không chạy theo phút (demo không chia số thật). Nếu demo có màn chia số cần dữ liệu thì giữ dữ liệu sẵn có, chỉ bỏ lượt chạy nền.
- Không đổi `WORLD_VERSION`, không đổi cách sinh đơn ảo. Số trên demo vẫn đúng, chỉ cập nhật chậm hơn (tối đa 30 phút).
- Test: `isDemo()` đúng → hai lượt alarm cách 5 phút chỉ lượt đầu chạy đồng bộ; bản thật (`isDemo()` sai) vẫn chạy mỗi 5 phút.

**G6. Trần ngày và cảnh báo Telegram theo phần gói đã gồm**

File được sửa: `lib/scheduler.ts`, `lib/sync.ts`, `lib/d1-usage.ts`, `lib/watch-core.ts`, `lib/alerts.ts`, `lib/telegram.ts`, `worker.ts`, `app/scheduler-panel.tsx`, `app/d1-usage-panel.tsx`, `tests/*.test.ts`.

- Trần: `D1_DAILY_WRITE_LIMIT = 1_200_000`; `DEFAULT_BUDGET = { writesUsed: 0, backfillCap: 800_000, hardCap: 1_200_000 }`. Sửa chú thích cho đúng: "50 triệu dòng ghi/tháng cho cả tài khoản (web thật + demo + demo2); bản thật giữ ≤ 1,2 triệu/ngày". Khi chạm trần vẫn lấy đơn mới/sửa như nhánh `blocked` hiện có.
- Cảnh báo dung lượng trong `DEFAULT_CONFIG` (`lib/watch-core.ts`): `d1WarnMb: 4500`, `d1HighMb: 4900` (gói gồm 5 GB). Giữ `d1GrowthMb`.
- Cảnh báo kỳ hoá đơn (mới), trong lượt canh gác sau đồng bộ (`runWatch`), chỉ bản thật (`!isDemo()`):
  - lấy `cycleSummary` từ G1;
  - `projected > 40_000_000` (80% của 50 triệu) → vấn đề `d1_cycle_80`, mức `medium`: "Dự tính dòng ghi D1 kỳ này X triệu / 50 triệu gói gồm (đã dùng Y triệu sau N ngày)";
  - `projected > 48_000_000` hoặc đã dùng > 45 triệu → `d1_cycle_95`, mức `high`;
  - dung lượng > 4,5 GB → dùng cảnh báo dung lượng sẵn có với ngưỡng mới;
  - gửi qua đúng kênh cảnh báo hiện có của `runWatch` (cùng người nhận như `d1_write_80`), **tối đa một tin mỗi ngày** cho mỗi loại, gửi lúc khoảng 08:00 giờ VN hoặc lượt đầu tiên sau đó (không gửi trong giờ yên lặng). Thêm hai khoá vào `SCHED_FAMILIES` nếu cần để đóng/mở sự cố đúng cách.
  - Chữ tin nhắn tiếng Việt, ghi rõ "phần gói đã gồm", không ghi số tiền.
- Thẻ G1: thêm dòng "Trần ngày: 1,2 triệu dòng" và "Cảnh báo Telegram khi dự tính vượt 40 triệu".
- Test: ngày 10 của kỳ đã dùng 15 triệu → dự tính 45 triệu → có `d1_cycle_80`, không có `d1_cycle_95`; gọi hai lần cùng ngày → một tin; bản demo → không tin; `runScheduledSync` với `writesUsed` gần 800 nghìn → bỏ lịch sử, vẫn lấy đơn mới.

**K1. Đo tổng trước/sau và ghi kết quả**

File được sửa: `tests/*.test.ts`, `tests/support/*.ts`, `docs/plans/2026-10-18-giam-ghi-d1/do-ghi.md`.

- Bộ đếm test (`tests/support/d1-sqlite.ts`) đang trả `rows_written = changes`, chưa tính dòng chỉ mục. Thêm bộ đếm ước lượng giống D1: với mỗi câu ghi, cộng `changes × (1 + số chỉ mục của bảng bị đụng)`; với `UPDATE`, chỉ mục bị đụng = chỉ mục có cột nằm trong `SET`; `INSERT`/`DELETE` = mọi chỉ mục của bảng (lấy danh sách chỉ mục bằng `PRAGMA index_list` / `index_info`). Đặt sau cờ để test cũ không đổi kết quả.
- Kịch bản đo (dùng thế giới demo `lib/demo/world.ts` + Pancake giả, D1 SQLite trong test): nạp 3 ngày đơn ảo, rồi chạy 24 giờ lượt đồng bộ 5 phút một lần (giờ giả), mỗi giờ kéo nhân sự một lần, dispatch mỗi phút. Đo tổng dòng ghi ước lượng theo khâu, **cách cũ** và **cách mới**. Cách cũ: lấy file cũ bằng `git show <commit nền trước G1>:lib/<file>.ts` vào thư mục tạm `tests/support/old-write-path/`, chạy cùng kịch bản, chép số ra, rồi **xoá thư mục tạm đó trước khi xong bước** (không commit bản cũ). Không dùng `git stash`, không tạo worktree.
- `do-ghi.md`: bảng khâu × (trước, sau, giảm %), cách đo, giới hạn của ước lượng (đơn ảo, không phải số thật). Không ghi số thật của web thật.
- Kiểm cuối: chạy lại test so sánh bảng của G2 và G3 (số liệu giống hệt cách cũ).

### Đợt 2 (thêm 18/10 sau K1)

K1 trên đơn ảo: 24 giờ giảm khoảng 25%; dòng hàng −77%, đơn −27%, nhân sự −64%, nhưng số liệu ngày, số liệu khách, trạng thái đồng bộ vẫn 0% và chiếm phần lớn phần còn lại. Cần giảm ít nhất một phần ba. K1 chưa chạy nhân viên/sản phẩm mỗi giờ và khách mới/sửa, nên chưa đo các khâu đó.

**G7. Mọi khâu đồng bộ chạy lại trên dữ liệu không đổi thì ghi 0 dòng; số liệu khách và số liệu ngày ghi ít chỉ mục hơn**

File được sửa: `lib/sync.ts`, `lib/customers-sync.ts`, `lib/customer-stats.ts`, `lib/stats.ts`, `tests/*.test.ts`, `tests/support/*.ts`.

1. **Nhân viên, sản phẩm mỗi giờ** (`syncUsers`, `syncProducts` trong `lib/sync.ts`): upsert hiện gán lại mọi dòng mỗi giờ (cả `fetched_at`), không có `WHERE`. Thêm `WHERE` so từng cột giá trị bằng `IS NOT` (không tính `fetched_at`), như `customerStatements`. Kiểm `rg "fetched_at"` để chắc không trang nào dựa vào `pos_users.fetched_at` / `pos_products.fetched_at` mới mỗi giờ; có thì ghi vào "Chỗ làm khác plan" và giữ đúng nghĩa (vd. lưu giờ kéo gần nhất ở `pos_shops.users_synced_at` / `products_synced_at` như đang có).
2. **Số liệu khách** (`rebuildCustomerStats`, `lib/customer-stats.ts`): `customer_stats` có 5 chỉ mục, câu upsert gán lại mọi cột nên mỗi lần đổi đụng cả 5. Làm như G2: đọc dòng đang lưu của các SĐT trong khối (một câu `SELECT … WHERE id IN (…)`), so từng cột, dòng mới thì `INSERT`, dòng đổi thì `UPDATE customer_stats SET <chỉ cột khác>, updated_at=? WHERE id=?`, không đổi thì không ghi. `customer_seller_stats` làm tương tự (đọc các dòng của SĐT trong khối, chỉ INSERT/UPDATE/DELETE dòng khác). Giữ đúng kết quả cuối, kể cả xoá dòng SĐT không còn đơn.
3. **Khách** (`customerStatements`, `lib/customers-sync.ts`): `pos_customers` có 5 chỉ mục; upsert gán lại mọi cột khi có một cột đổi. Đổi thành `UPDATE` chỉ các cột khác (đã có bản đọc ở `changedCustomers`, mở rộng `SELECT` lấy đủ cột cần so). Khách mới giữ `INSERT`. Giữ `inserted_at=COALESCE(cũ, mới)`.
4. **Dựng số liệu một lần mỗi lượt** (`syncRecent`): đang dựng lại `stats_daily*` và `customer_stats` sau **mỗi trang**; khi đi nhiều trang, cùng một ngày / SĐT bị dựng lại nhiều lần. Gom `dirty` và `dirtyCustomers` của mọi trang trong một lần gọi `syncRecent`, dựng một lần ở cuối (trong `finally`, để lỗi giữa chừng vẫn dựng những gì đã ghi). `syncBackfill` đã dựng một lần cuối, giữ nguyên.
5. **Số liệu ngày** (`upsertStatement` trong `lib/stats.ts`): đã có `WHERE`; chỉ kiểm lại cột `name` của `stats_daily_product` so chuỗi đúng (`IS NOT`), và các cột số dùng `IS NOT` thay `<>` để `NULL` không làm sai. Không đổi cách tính.
6. **Test "chạy lại không đổi = 0 dòng"** cho từng khâu, cùng một nguồn giả chạy hai lần liền: `syncUsers`, `syncProducts`, `syncCustomersRecent`, `syncCustomersBackfill` (kể cả khách có nhiều ghi chú hơn số ghi chú danh sách trả về), `syncRecent`, `syncBackfill`, `rebuildStats`, `rebuildCustomerStats`, `pullHr`. Lần 2 phải ghi 0 dòng (đếm bằng bộ đếm có chỉ mục của K1). Thêm test so bảng `customer_stats`, `customer_seller_stats`, `pos_customers`, `pos_users`, `pos_products` cuối cùng giống hệt cách cũ sau một chuỗi thay đổi (khách đổi người phụ trách, thêm ghi chú, đơn giao thành công, đơn hoàn).
7. Nếu thấy khâu nào ghi lại dù dữ liệu không đổi mà plan chưa nói (vd. so định dạng giờ, thứ tự thẻ, chuẩn hoá SĐT lệch giữa lúc ghi và lúc so), sửa cho khâu đó chỉ ghi khi đổi và ghi rõ vào tóm tắt. Không đổi giá trị đang lưu.

**K2. Đo lại cả ngày, đủ các khâu**

File được sửa: `tests/*.test.ts`, `tests/support/*.ts`, `docs/plans/2026-10-18-giam-ghi-d1/do-ghi.md`.

- Mở rộng kịch bản K1: thêm `syncUsers` + `syncProducts` mỗi giờ, `syncCustomersRecent` mỗi 5 phút, một vòng `syncCustomersBackfill` đi hết danh sách khách ảo mỗi 3 giờ (như vòng duyệt lại thật), cho cả hai phía cũ/mới. Cách lấy bản cũ như K1 (`git show fad5bb7:…`, xoá thư mục tạm khi xong).
- `do-ghi.md`: thêm bảng K2 (khâu × trước/sau/giảm %), giữ bảng K1. Ghi riêng "tổng 24 giờ sau nạp".
- Kiểm cuối: chạy lại mọi test so bảng của G2, G3, G7.

## 4. Dự tính sau khi cắt (suy ra, chưa đo; K1 đo trên đơn ảo, G1 đo thật sau khi lên web thật)

| Khâu | Hiện tại | Sau khi cắt |
|---|---|---|
| Đơn đổi (dòng đơn + chỉ mục) | mọi chỉ mục mỗi lần đổi | chỉ chỉ mục có cột đổi (thường 4–7 thay vì khoảng 14) |
| Dòng hàng của đơn đổi | xoá + chèn lại mọi dòng mỗi lần | gần 0 (hàng ít khi đổi sau khi chốt) |
| Số liệu ngày, số liệu khách | đã chỉ ghi khi đổi | chỉ dựng lại khi đơn thật sự đổi |
| Bản chép nhân sự | xoá + chèn cả 7 bảng mỗi ngày và mỗi lần HR sửa | chỉ dòng đổi |
| Việc mỗi phút | vài dòng mỗi phút | gần 0 khi không bật chia số |
| Demo, demo2 | 5 phút một lượt | 30 phút một lượt |
| Trần ngày bản thật | 4 triệu (không chặn) | 1,2 triệu (chặn lịch sử, giữ đơn mới) |

Kỳ vọng: tổng cả tài khoản dưới 40 triệu dòng ghi/tháng (dưới 50 triệu gói gồm). Ba ngày sau khi lên web thật, tổ đọc thẻ G1 và báo anh số thật; còn cao thì làm đợt 2.

## 5. Dung lượng (khoảng 6 GB so với 5 GB gói gồm): CHỜ ANH, không nằm trong G1–K1

Vượt khoảng 1 GB vẫn bị tính thêm mỗi tháng tới khi dung lượng dưới 5 GB. Cách giảm đều là **xoá dữ liệu trên web thật**, nên cần anh đồng ý đúng thao tác và sao lưu trước. Đề xuất để anh chọn (tổ đo kích thước từng phần trước khi hỏi):
1. Xoá các bảng sao lưu cũ dạng `bak_*` / `restore_*` trong D1 (nếu còn), vì bản sao lưu đêm đã nằm ở R2.
2. Bỏ cột `raw_json` (JSON gốc khoảng 10 KB mỗi đơn) với đơn đã giao/hoàn xong quá 6 tháng: số liệu không dùng cột này, nhưng mất chi tiết gốc của đơn cũ.
Chưa làm gì ở mục này.
