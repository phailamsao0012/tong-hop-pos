# Làm nhanh các trang chậm khi mở lần đầu (02/11/2026)

## 1. Mục tiêu
Anh Vũ 01/11: "Làm sao để cải thiện nhỉ". 02/11: "cho chạy EXPLAIN trên PC", rồi "ok ưu tiên cho cái plan trước t xem".
Mở lần đầu (chưa có bộ nhớ đệm) các trang Xu hướng, Chăm sóc, Cuộc gọi, Sản phẩm đã giao, Khách hàng trên web PC phải dưới 1 giây.
Sau khi máy đã chạy một lúc thì các trang này đã nhanh sẵn.

## 2. Không được đổi
- Số trên mọi trang: so `scripts/dev/so-api.mjs` trước và sau phải trùng từng byte.
- Quyền xem, route, giao diện.
- Web Cloudflare: không tạo chỉ mục rộng trên `raw_pos_orders` qua migration. Luật AGENTS.md; `drizzle/0041` ghi lần tạo trên web thật 5,5 GB bị quá hạn D1 (7429) và chặn deploy.

## 3. Hiện trạng (đo trên PC 02/11, bản sao dữ liệu, chỉ đọc kế hoạch truy vấn)
| Trang | Lần mở đầu | Câu chậm | Vì sao |
|---|---|---|---|
| Xu hướng | 16,7 s | doanh số MKT theo ngày xác nhận, `lib/reports/trends-report.ts:81` (16,1 s) | chỉ mục ngày xác nhận đang dùng thiếu `marketer_id`, phải mở từng đơn (~60 nghìn đơn) |
| Chăm sóc | 7,6 s | 4 câu `lib/reports/care-report.ts`, mỗi câu 0,9–2,7 s | cộng trên mọi khách đang giao CSKH, ghép bảng theo khoá tự ghép từng khách |
| Cuộc gọi | 2,9 s | `lib/reports/calls-report.ts:45` | `MAX(fetched_at)` trên `customer_notes` không có chỉ mục; đếm khách theo người phụ trách |
| Sản phẩm đã giao | 2,8 s | `lib/reports/delivered-products.ts` | lọc ngày tạo đơn khoảng rộng rồi mới lọc ngày nhận |
| Khách hàng | 2 s | `lib/reports/customer-report.ts` | quét cả `customer_stats` để tính tổng, sắp theo doanh số không có chỉ mục |

Nhận xét chung: chậm vì phải đọc dòng đầy đủ từ ổ cứng. Cùng câu khi dữ liệu đã trong RAM chỉ ~0,5 s.
Nghi vấn cần kiểm trước: web thật Cloudflare đã có `idx_raw_orders_pos_confirmed_mkt_money` (ghi chú `drizzle/0041`),
nhưng EXPLAIN trên bản sao PC không dùng chỉ mục có `marketer_id`. Có thể bản xuất D1 về PC thiếu một số chỉ mục.

## 4. Thiết kế
Web chuyển sang PC, nên chỉ mục làm trên file SQLite của PC bằng script, không qua migration D1.
- `scripts/pc/chi-muc.mjs` (mới): mở file dữ liệu PC, so danh sách chỉ mục với danh sách chuẩn, tạo chỉ mục còn thiếu (`CREATE INDEX IF NOT EXISTS`), chạy `ANALYZE`, in số đếm và thời gian. Không in dữ liệu.
- Danh sách chuẩn = mọi chỉ mục trong `drizzle/*.sql` (lấy bằng regex) + `lib/ops/scheduler.ts` + chỉ mục mới ở bước 2.
- Chăm sóc: sửa code, không chỉ mục. Tính sẵn tổng theo nhân viên mỗi lượt đồng bộ (như `stats_daily`). Đây là bảng mới, nên cần migration nhỏ ở bước 3.

## 5. Các bước
Mỗi bước một PR vào `main`, Claude tự làm (ngoại lệ Tổ web tổng 31/10). Chạy trên PC cần anh nhắn đúng câu ở từng bước.

**Bước 1: so chỉ mục PC với chuẩn** (nhánh `claude/chi-muc-b1`)
- File: `scripts/pc/chi-muc.mjs`, `tests/pc-chi-muc.test.ts`.
- Làm: chế độ `--xem` chỉ liệt kê chỉ mục thiếu hoặc thừa, không ghi.
- Xong khi: test trên file số ảo bỏ bớt 2 chỉ mục, script báo đúng 2 chỉ mục đó.
- Kiểm trên PC: anh nhắn "cho xem chỉ mục trên PC".

**Bước 2: tạo chỉ mục trên PC** (cùng nhánh)
- Chỉ mục thiếu so với chuẩn, cộng 4 chỉ mục mới:
  - `raw_pos_orders (pos_id, first_confirmed_at, status_code, marketer_id, net_total, current_total, total_discount)` cho Xu hướng. Đã thử trên bản sao: 14,6 s → 0,1 s, tạo mất 52 s. Chỉ dựng nếu bước 1 xác nhận thiếu.
  - `customer_notes (pos_id, fetched_at)` cho Cuộc gọi.
  - `raw_pos_orders (pos_id, delivered_at, status_code) WHERE delivered_at IS NOT NULL` cho Sản phẩm đã giao (chỉ mục một phần, nhỏ).
  - `customer_stats (pos_id, success_net)` cho Khách hàng.
- Làm trên PC: sao lưu → tắt web → chạy script → `ANALYZE` → bật web. Web tắt khoảng 2–3 phút.
- Xong khi: đo lại 5 trang lần mở đầu (sau khi bật lại máy chủ) đều dưới 1 giây, trừ Chăm sóc. so-api trước/sau trùng.
- Kiểm trên PC: anh nhắn "cho tạo chỉ mục trên PC".

**Bước 3: Chăm sóc tính sẵn** (nhánh `claude/cham-soc-tinh-san`)
- File: `lib/reports/care-report.ts`, `lib/reports/stats.ts` (dựng lại theo lượt đồng bộ), migration mới tạo bảng tổng theo (pos, nhân viên), `tests/care-report.test.ts`.
- Xong khi: số Chăm sóc trùng bản cũ trên số ảo; lần mở đầu trên PC dưới 1 giây.
- Ước chi phí Cloudflare: bảng nhỏ (số dòng ≈ số nhân viên × POS), ghi thêm vài trăm dòng mỗi lượt đồng bộ, không đáng kể.

## 6. Kiểm thử
- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`.
- so-api 40 API trước/sau trên số ảo, và trên bản sao dữ liệu PC.
- Đo lần mở đầu từng trang trên PC, ghi bảng trước/sau.

## 7. Rủi ro
- Chỉ mục làm file dữ liệu to thêm (ước 0,3–0,6 GB). PC còn ~96 GB trống.
- Tạo chỉ mục khi web đang ghi có thể khoá file: vì vậy tắt web trước, sao lưu trước.
- Lùi: `DROP INDEX` đúng tên vừa tạo (script có chế độ `--bo`), hoặc khôi phục bản sao lưu.
- Nếu sau này quay lại Cloudflare: chỉ mục PC không theo sang; web vẫn chạy như hiện nay.
