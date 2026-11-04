# Sửa câu chậm làm Điều hành "Không tải được" (04/11/2026)

Anh Vũ duyệt bằng tin "ok sửa" ngày 04/11/2026.

## Vì sao
Số đo D1 (Cloudflare, 24 giờ tới sáng 04/11) cho thấy D1 chạy từng câu một. Vài câu nặng làm các khối khác của Điều hành chờ quá giờ:
1. Doanh số MKT theo ngày xác nhận (Xu hướng, Điều hành): 4–8 giây mỗi lần, đọc 100–167 nghìn dòng.
2. Số đếm đầu trang Cuộc gọi: khoảng 3,5 giây mỗi lần, đọc hơn 1 triệu dòng.
3. Danh sách Marketer (DISTINCT trên toàn bộ đơn): hơn 100 lần mỗi ngày.

## Làm gì
- **Bảng mới `stats_daily_mkt` (migration 0050).** Khoá là (POS, ngày xác nhận giờ VN, Marketer, người bán), giá trị là số đơn và doanh số. Chỉ tính đơn từ Đã xác nhận trở đi.
  - Bảng mới, rỗng, nên tạo nhanh cả trên web thật. Không thêm chỉ mục nào trên `raw_pos_orders`.
  - Mỗi lượt đồng bộ, bảng được dựng lại cùng `stats_daily` cho những ngày có đơn đổi.
  - Bộ hẹn giờ điền dần các tháng cũ. Xong thì ghi cờ `stats_mkt_ready`.
  - Khi chưa có cờ, hoặc khi có lọc nhóm hàng, Xu hướng vẫn đọc đơn gốc như cũ.
- **Xu hướng và Xu hướng MKT đọc bảng mới.** Việc lọc "người được tính" và "team Sale" làm lúc đọc, nên đổi team không cần dựng lại bảng.
- **Danh sách Marketer** được lưu ở `app_settings` (`marketer_ids_v1`) và làm mới sau 6 giờ.
- **Số đầu trang Cuộc gọi** (tổng khách, tổng ghi chú) được lưu ở `app_settings` và làm mới sau 15 phút.

## Không đổi
Số liệu và cách tính không đổi. `tests/mkt-stats.test.ts` so bảng mới với câu cũ trên đơn gốc.

## Cách kiểm
- Chạy `pnpm typecheck`, `pnpm test` (gồm `tests/arch`), `pnpm lint` và `pnpm build`.
- Sau khi lên, PC đo lại D1 insights 24 giờ để so trước và sau.
