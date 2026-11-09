# Sửa theo kiểm bài dbf2dca (tổ web tổng, 09/11/2026)

Anh Vũ 09/11/2026: "sửa theo kiểm bài của tổ ..., xong chạy thử trên bản PC".
File kiểm bài: `kiem-bai-dbf2dca.md`, cùng thư mục. Làm đủ 4 điểm, đúng thứ tự. Không làm ngoài 4 điểm. Không đổi cách tính số.

## 1. Kỳ so sánh cắt giờ (`cutoffUtc`) dùng bảng tính sẵn cho các ngày đủ
- Ở đâu: `lib/reports/overview-report.ts` `periodReport` (đang có `segmentReady = !cutoffUtc && ...`), và `segmentedStats` trong `lib/pancake/order-segments.ts` (đang đòi `!base`).
- Khi có `cutoffUtc`, trạng thái mặc định, bảng đã sẵn sàng:
  - CTE `stats_daily` = dòng `stats_daily_segment` cho `day>=start AND day<lastDay`. Áp đủ các lọc như đường bảng hiện có: team, người được tính, người bán, nhóm, nguồn/marketer (nguồn chỉ khi CSKH).
  - UNION ALL ba câu sự kiện từ đơn gốc (tạo, chốt, giao người bán), chỉ cho `[lastDayStartUtc, cutoffUtc)`, với cùng các lọc của đường đơn gốc. Làm giống cách `SegmentBase` đang ghép `stats_daily` với ngày cuối.
  - Không cộng trùng ngày cuối. Khoảng 1 ngày (start = lastDay) thì phần bảng rỗng, chỉ còn phần đơn gốc.
- Trường hợp không lọc gì: giữ đường `base` cũ với `stats_daily`, như hiện nay.
- Test trong `tests/stats-segment.test.ts`: cutoff giữa ngày, ví dụ 13:37 giờ VN của ngày cuối, cho mọi tổ hợp lọc như test hiện có (nhóm × team × nguồn × có/không nhân viên).
  So đường mới với đường đơn gốc thuần (`read = null`), bằng tuyệt đối mọi `STAT_COLUMNS`. Thêm trường hợp khoảng 1 ngày và khoảng nhiều ngày.

## 2. Bảng sản phẩm của CSKH không lọc
CSKH, `productSegment='all'`, `orderOrigin='all'`, không cutoff, trạng thái mặc định: phần sản phẩm đọc `stats_daily_seller_product` với `where` (đã có lọc team theo người bán), như nhánh không lọc của team khác.
Điều kiện: `sellerProductStatsReady`, như nhánh hiện có. Các trường hợp còn lại giữ đường cũ.
Test: số sản phẩm đường mới bằng đường đơn gốc cho CSKH không lọc.

## 3. Nhớ cờ sẵn sàng 60 giây mỗi isolate
`segmentStatsReady` nhớ kết quả 60 giây, như `mktStatsReady` (`lib/reports/stats-mkt.ts`). Có hàm xoá nhớ cho test (theo đúng cách `stats-mkt.ts` đang làm). Test cũ phải gọi hàm xoá ở chỗ cần.

## 4. Khoá quy tắc chia nhóm
Test giữ chuỗi băm (SHA-256) của `segmentKeyExpr('o')` cùng `SEGMENT_EPOCH`.
Đổi biểu thức mà không tăng `SEGMENT_EPOCH` thì test hỏng, với thông báo: "đổi quy tắc nhóm thì tăng SEGMENT_EPOCH và cập nhật băm".

## Nộp
- Sandbox không chạy được pnpm thì dùng `node node_modules/typescript/bin/tsc --noEmit` và `node --import ./tests/support/register-native.mjs --test --experimental-test-isolation=none <file test liên quan>`.
- Ghi kết quả vào `ket-qua-sua-kiem-bai.md`, cùng thư mục.
- Không commit, Claude kiểm và commit.
