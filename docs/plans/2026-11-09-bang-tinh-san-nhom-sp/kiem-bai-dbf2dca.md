# Kiểm bài commit dbf2dca (nhánh codex/bang-tinh-san), Tổ web tổng, 09/11/2026

Đọc toàn bộ diff `lib/`, `drizzle/`. Cách ghi bảng, đối chiếu đêm, lọc nhóm/nguồn/team khi đọc: đúng. Bốn điểm cần sửa trước khi lên.

## 1. CAO: kỳ so sánh "cùng mốc giờ" vẫn quét đơn gốc
`periodReport` đặt `segmentReady = !cutoffUtc && ...`, và `segmentedStats` đòi `!base`. Nhưng hầu hết trang mở Tổng quan với
`compare=previous` (center-view, compare-view, monthly-view, sale-segment-block, team-groups-view). Khi ngày cuối là hôm nay
(`compareWindow`, lib/shared/report-time.ts), kỳ trước có `cutoffUtc`, nên MỖI lượt mở CSKH / lọc nhóm vẫn chạy `segment_orders`
trên đơn gốc cho kỳ trước. Một nửa tải cũ còn nguyên.

Sửa: khi có `cutoffUtc` và trạng thái mặc định, CTE `stats_daily` = dòng bảng `stats_daily_segment` cho các ngày đủ
`day>=start AND day<lastDay` (cùng các lọc team, người được tính, người bán, nhóm, nguồn) UNION ALL ba câu sự kiện đơn gốc chỉ cho
`[lastDayStartUtc, cutoffUtc)` (giống `SegmentBase` hiện có với `stats_daily`). Không cộng trùng ngày cuối.
Test: so có cutoff (giữa ngày) giữa đường mới và đường đơn gốc cho mọi tổ hợp lọc như test hiện có.

## 2. VỪA: bảng sản phẩm của CSKH vẫn quét đơn gốc
Với CSKH không lọc nhóm, không lọc nguồn, không cutoff: đọc `stats_daily_seller_product` với `where` (đã có lọc team theo người bán),
như nhánh không lọc. Các trường hợp còn lại giữ đường cũ (làm ở bước sau).

## 3. VỪA: cờ sẵn sàng đọc D1 mỗi lần
`segmentStatsReady` đọc `app_settings` mỗi lần gọi (một lượt Tổng quan gọi tới 5 lần). Nhớ 60 giây mỗi isolate như `mktStatsReady`
(lib/reports/stats-mkt.ts), có hàm xoá nhớ cho test.

## 4. VỪA: khoá quy tắc chia nhóm
Quy tắc nhóm đã đổi 3 lần trong tuần. Thêm test giữ chuỗi băm của `segmentKeyExpr('o')` kèm `SEGMENT_EPOCH`: đổi biểu thức mà không
tăng `SEGMENT_EPOCH` thì test hỏng, báo "đổi quy tắc nhóm thì tăng SEGMENT_EPOCH và cập nhật băm".

## Ghi chú, chưa cần sửa
- Bảng giữ từng Marketer cho mọi đơn (cả Sale). PC báo đọc ~15 ms/lượt nên tạm ổn; nhờ PC báo số dòng bảng sau khi điền (để ước dung lượng).
- Lấp lịch sử trên D1: mỗi (POS, tháng) là một lô 4 câu nặng. Nếu lên Cloudflare, chỉ để lấp chạy ban đêm (sau 22h VN) để không làm D1 quá tải giờ làm.
- Trang "lens MKT", số khách, đối soát vẫn đường cũ: đúng như báo cáo của Codex, làm bước sau.
