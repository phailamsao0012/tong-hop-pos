# TỔNG HỢP POS

Web quản lý riêng cho 6 POS: Siêu vỏ gạo, MGT - APEX, THỦY SẢN MEGATECH, BIO NANO, MEGAROOT và Oxytetra - Megatech. Danh sách 6 POS và quy tắc chốt nóng trong phần văn bản gửi kèm là yêu cầu cập nhật; PDF kế hoạch cũ ghi 5 POS và nhịp đồng bộ 1–2 giờ chỉ là phương án ban đầu.

Web kết nối dữ liệu đơn hàng Pancake POS, lưu vào Cloudflare D1, đồng bộ lịch sử và tự lấy dữ liệu mới **5 phút/lần trên máy chủ** (Durable Object alarm), không cần mở web. Khóa API chỉ nằm trong biến bí mật của Worker, không có trong mã nguồn.

Trang đang chạy: [tong-hop-pos.megatech-pos.workers.dev](https://tong-hop-pos.megatech-pos.workers.dev/) — đăng nhập bằng tài khoản riêng (email + mật khẩu; quản trị viên tạo tài khoản trong Cấu hình).

## Chạy và phát hành

```bash
pnpm install
pnpm exec wrangler d1 migrations apply DB --local   # tạo bảng cho D1 cục bộ
pnpm dev                                            # http://localhost:3000, cần .dev.vars (xem .dev.vars.example)
pnpm test && pnpm typecheck
pnpm db:migrate                                     # áp dụng migration lên D1 thật
pnpm deploy                                         # build + wrangler deploy
```

Bí mật trên Cloudflare: `AUTH_SECRET` (ký phiên đăng nhập, băm mật khẩu) và `PANCAKE_POS_API_KEY`, đặt bằng `wrangler secret put <TÊN> --config dist/server/wrangler.json`.

## Cấu trúc chính

- `worker.ts` — entry Worker: vinext phục vụ web/API, export Durable Object `SyncScheduler`.
- `lib/pancake.ts` — client Pancake Open API; `lib/sync.ts` — đồng bộ đơn/nhân viên/sản phẩm/lịch sử; `lib/scheduler.ts` — hẹn giờ nền; `lib/shop-map.ts` — tự ghép Shop ID theo tên.
- `lib/auth.ts` + `app/api/auth/*`, `app/api/users` — đăng nhập riêng, phiên trong D1, quản lý tài khoản.
- `app/api/reports/overview` + `app/overview-view.tsx` — tổng hợp theo POS, so sánh kỳ, biểu đồ, xuất Excel.
- `lib/report-time.ts` — Pancake trả giờ UTC không hậu tố; báo cáo quy đổi ngày Việt Nam (+7).
- `docs/pancake-openapi.json` — bản sao tài liệu OpenAPI của Pancake POS.

## Quy tắc dữ liệu

- Mỗi khách/số được nhận diện trong phạm vi một POS; chưa tự gộp số trùng giữa POS.
- Đợt nhận tính số điện thoại duy nhất của phân công trong kỳ. Số đã chốt là số thuộc đợt đó với đơn có thời điểm xác nhận trong kỳ. Chốt trên data cấp trước kỳ được xem ở hoạt động chốt, không đưa vào tỷ lệ của tệp mới nhận.
- Một số nhiều đơn chỉ tính một số chốt; số đơn và giá trị chốt đếm/tổng theo đơn.
- Lần đầu xác nhận, giá trị chốt và người chốt được giữ nguyên khi đơn sau đó bị sửa. Giá trị hiện tại được lưu riêng.
- Doanh số cuối tháng lấy tiền hàng thuần của đơn giao thành công, theo ngày tạo đơn. Hoàn/hủy được xem riêng. Cách khóa thưởng, hoàn một phần và gộp xuyên POS chưa được chốt.
- Upsell lần 1 là đơn mua thành công thứ hai trong toàn bộ lịch sử truy cập được của cùng khách trong một POS.

## Lưu ý đối chiếu số liệu

Các chỉ số chốt nóng dùng lần xác nhận đầu tiên và tập số được giao cho nhân viên. Giá trị đơn lấy từ `total_price` hiện tại của đơn nên không phải doanh thu thuần trên màn hình Tổng quan Pancake. Web ghi rõ hai khái niệm này để tránh đối chiếu sai công thức.

Migration D1 sinh bằng `pnpm db:generate` vào `drizzle/`.
