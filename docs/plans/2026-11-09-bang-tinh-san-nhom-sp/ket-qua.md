# Kết quả thực hiện

Thực hiện lần lượt bước 1–6 trên nhánh có sẵn `codex/bang-tinh-san`. Không commit, không push, không chạy lên web thật.

## Thay đổi

1. `drizzle/0051_stats_daily_segment.sql`: thêm đúng một migration, bảng theo POS/ngày/người bán/nhóm/marketer, đủ 27 cột `STAT_COLUMNS` kiểu INTEGER giống bảng cũ và chỉ mục `(pos_id, day)`. `ensureStatsSchema` tạo bảng mới trên bản sao PC chưa áp migration; kiểm bảng tồn tại trước khi chạy DDL.
2. `lib/reports/stats.ts`: thêm các truy vấn theo ngày tạo, ngày chốt, số lượng hàng chốt, ngày giao người bán vào cùng batch đọc của `rebuildStats`; gộp chiều mới và dùng `diffStatements`/`run` hiện có. Giữ chia lô 100 câu ghi và xóa theo lô ID JSON 500 dòng. Thêm `backfillSegmentMonth`, `segmentMonths`, `segmentStatsReady`, khóa `stats_segment_epoch`.
3. `lib/ops/scheduler.ts`: hàng chờ lịch sử theo epoch, tháng mới trước tháng cũ, cùng ngân sách thời gian/lượt ghi hiện có; chỉ ghi cờ sẵn sàng sau khi hoàn thành. Trong lượt dựng số liệu có theo dõi phiên bản dữ liệu, gọi kiểm đêm sau 02:30 VN, một lần/ngày. So đủ các cột của 7 ngày gần nhất theo POS/ngày; dựng lại các ngày lệch, `console.warn` và ghi `alert_log` loại `stats_segment_mismatch`, chủ nhật ký `system`; không gửi thông báo ra ngoài.
4. `lib/pancake/order-segments.ts`: tách quy tắc phân nhóm dùng chung cho `orderFilterSql` và `segmentKeyExpr`. Thêm tùy chọn ngày VN/readiness/`withProducts`; chỉ đọc bảng mới khi trạng thái mặc định, không có base cắt giờ và biên UTC khớp nguyên ngày VN. Giữ lọc người được tính, team, đơn vị HR, nhân viên; nguồn/marketer chỉ áp dụng cho CSKH.
5. `lib/reports/overview-report.ts`: tổng, các bảng nhóm và chuỗi ngày dùng CTE không có phần sản phẩm; các truy vấn summary đặt `withProducts=false`. `lib/reports/lens-orders.ts` cũng bỏ CTE sản phẩm khỏi câu chỉ đọc tổng nhưng giữ tính từ đơn gốc để bảo toàn phạm vi MKT.
6. `tests/stats-segment.test.ts`: 5 test tích hợp trên SQLite thật trong bộ nhớ, migration đầy đủ, dữ liệu tự sinh 6 POS và tất cả trạng thái. So tuyệt đối 27 cột theo cả POS/ngày/người bán/marketer cho 180 tổ hợp nhóm × team × nguồn × nhân viên; so lại sau đổi giao thành công/hoàn/hủy/xóa và đổi nguồn. Kiểm tổng bảng mới bằng `stats_daily`, backfill/diff, fallback, phần sản phẩm, số câu `segment_orders`, kiểm đêm và scheduler thất bại/tiếp tục trước khi bật cờ.
7. `tests/k1-writes.test.ts`, `tests/k2-writes.test.ts`, `tests/k3-writes.test.ts`: loại bảng mới khỏi ảnh chụp so với mã lịch sử chưa có bảng này, cùng cách các test đã loại `stats_daily_mkt`. Bảng mới được đối chiếu riêng trong test mới; không bỏ kiểm các bảng cũ.

## Chỗ plan khác code thật và cách giữ nguyên số

- Plan gọi tên `backfillSellerProductMonth`; code thật là `buildSellerProductMonth`. Hàm mới giữ tên `backfillSegmentMonth` theo plan, dùng cùng cơ chế ghi diff/chia lô.
- `lens-orders.ts` thực tế dùng `lensDatabase` để chèn điều kiện team MKT vào `raw_pos_orders`; lens còn có thể có `ordersSql` với điều kiện riêng trên đơn. Bảng tính sẵn không được wrapper này lọc. Vì vậy báo cáo lens tiếp tục đọc đơn gốc, kể cả khi epoch sẵn sàng, để không cộng nhầm số ngoài phạm vi MKT. Test lens hiện có đã qua. Đây là phần tối ưu chưa áp dụng cho lens.
- Liệt kê lịch sử bằng tháng tạo như scheduler cũ sẽ bỏ sót đơn chốt/chia ở tháng sau. Hàng chờ mới lấy hợp tháng của cả ba cơ sở ngày để bảo toàn số.
- Plan yêu cầu giữ đường sản phẩm cũ, nên câu sản phẩm vẫn có `segment_orders`. Test báo cáo Sale có nhóm và mẫu số kiểm đúng 2 câu sản phẩm còn dùng đường này; 10 câu tổng/summary dùng bảng mới, không còn `segment_orders`. Số khách và phép đối chiếu độc lập vẫn đọc đơn gốc như trước. Chưa thể tuyên bố cả trang hoàn toàn không đọc `raw_pos_orders`.
- Kiểm đêm dùng khóa ngày trong `app_settings` thay vì thêm migration cho lịch kiểm; chỉ chạy khi đã có epoch hoàn tất lịch sử và còn ngân sách ghi của scheduler.

## Kiểm tra

- Đã gọi đủ `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`: cả bốn không vào được script vì pnpm cố tạo symlink dependency, bị sandbox trả `ERR_PNPM_PACKAGE_MANAGER_SYMLINK_FAILED` / `Access is denied (os error 5)`.
- Typecheck thay thế: `node node_modules/typescript/bin/tsc --noEmit` **qua** sau thay đổi cuối.
- Test thay thế bằng bộ nạp sẵn của repo, không cần esbuild spawn:
  - `node --import ./tests/support/register-native.mjs --test --experimental-test-isolation=none tests/stats-segment.test.ts tests/order-segments.test.ts tests/seller-product-stats.test.ts tests/lens-orders.test.ts`: **16/16 qua**.
  - Chạy riêng `tests/data-version.test.ts`: **7/7 qua**; lượt đồng bộ không đổi dữ liệu không làm đổi phiên bản.
  - Chạy riêng `tests/k1-writes.test.ts`: **2/2 qua**, gồm mô phỏng 24 giờ đồng bộ và so số bảng cũ.
  - Đã thử thêm K2/K3 bằng bộ nạp native; các mô phỏng toàn bộ đồng bộ chạy nhiều phút chưa trả kết quả, đã dừng hai lượt bổ sung này. Chưa xác nhận K2/K3 qua; cần Claude chạy cùng suite chuẩn ngoài sandbox.
  - Chạy riêng `tests/backup.test.ts`: **6/6 qua**. PowerShell gộp stderr cảnh báo cố ý của test vào lỗi native command, nhưng Node báo đủ 6 test qua.
  - Đã thử toàn bộ test bằng bộ nạp native với isolation tắt: các test dùng chung env/hooks/transport gây ảnh hưởng lẫn nhau; lượt này không kết thúc, đã dừng. Không dùng kết quả đó để khẳng định toàn bộ suite qua. Claude cần chạy `pnpm test` có isolation mặc định ngoài sandbox.
- Lint chạy trực tiếp `node node_modules/oxlint/bin/oxlint`: toàn repo có nhiều lỗi sẵn. Chạy riêng tất cả file đổi chỉ còn đúng lỗi cũ `CLOSED` import không dùng tại `overview-report.ts` (đã có trong HEAD); không có lỗi mới trên các file đổi.
- Build chạy trực tiếp `node node_modules/vinext/dist/cli.js build`: **không chạy được**, `spawn EPERM` trong lúc đọc cấu hình Vite, kèm lỗi nạp native dependencies Tailwind/Lightning CSS. Chưa xác nhận build thành công.
- `pnpm db:migrate:local`: bị lỗi symlink như trên. Thử Wrangler trực tiếp cũng bị **spawn EPERM**. Migration đã được áp thành công lên SQLite trong bộ nhớ ở các test mới; chưa áp được bằng Wrangler lên DB demo cục bộ.
- Formatter oxfmt chạy trực tiếp bị **spawn EPERM** khi dựng external formatter; không coi là đã format thành công. Giữ định dạng vùng code cũ để tránh thay đổi ngoài phạm vi.
- `git diff --check`: qua.

## Việc Claude cần kiểm tiếp

- Chạy lại bốn lệnh chuẩn, formatter và migration local ngoài sandbox.
- Kiểm riêng tối ưu lens MKT nếu muốn mở rộng phạm vi hỗ trợ; hiện cố ý giữ đường cũ để đúng số.
- Theo plan: trước khi lên thật, đối chiếu trên bản sao dữ liệu thật chỉ ở PC trong 30 ngày × các bộ lọc. Chưa thực hiện bước này và chưa triển khai.
