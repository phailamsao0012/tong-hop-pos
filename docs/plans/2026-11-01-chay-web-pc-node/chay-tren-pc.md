# Chạy bản Node trên PC (N2–N5)

Viết 01/11/2026. Anh Vũ chọn "Chia đôi": code và test viết trên máy đám mây; phiên trên PC chỉ chạy và đo, mỗi lần chạy cần anh nhắn câu cho phép trong thread.

## Bản Node gồm gì

| File | Thay cho |
|---|---|
| `pc/d1.ts`, `pc/d1-core.ts`, `pc/d1-worker.ts` | D1 (`env.DB`): 6 luồng đọc chỉ đọc + 1 luồng ghi trên file SQLite, chế độ WAL |
| `pc/durable.ts` | Durable Object `SyncScheduler` (`env.SYNC_SCHEDULER`): trạng thái và alarm lưu ở `do.sqlite` |
| `pc/cache.ts` | `caches` (Cache API): bộ nhớ trong tiến trình, hết hạn theo `max-age` |
| `pc/cloudflare-workers.ts`, `pc/hooks.ts` | module `cloudflare:workers` |
| `pc/http.ts`, `pc/server.ts` | máy chủ: tệp tĩnh `dist/client` (kèm `_headers`), web, Cron mỗi phút trong tiến trình |

AI, HR, SEARCH_LIMIT không gắn: code đã tự xử lý khi thiếu (HR gọi thẳng `CRM_URL`). Máy chủ chạy **nguyên bản build Cloudflare** (`dist/server/index.js`), nên `worker.ts` (đăng nhập, phân quyền, cache báo cáo, nhật ký) chạy y như trên Cloudflare.

## Build

```
pnpm build        # như cũ: dist/server, dist/client
pnpm build:pc     # dist/pc/server.js và các file luồng
```

## Chạy

Biến môi trường (PowerShell: `$env:THP_DB = '...'`):

| Biến | Ý nghĩa | Mặc định |
|---|---|---|
| `THP_DB` | file SQLite bản chép D1 (bắt buộc) | |
| `THP_DO_DB` | file trạng thái bộ hẹn giờ | `do.sqlite` cạnh `THP_DB` |
| `THP_VARS` | file `.dev.vars` (bí mật) | không đọc |
| `PORT`, `HOST` | cổng, địa chỉ nghe | `8787`, `127.0.0.1` |
| `THP_READERS` | số luồng đọc | `6` |
| `THP_CRON` | `0` để tắt Cron mỗi phút | bật |

```
node dist/pc/server.js
```

`GET /__pc/health` (chỉ gọi từ chính máy) trả số câu đọc/ghi và việc nền đang chờ.

Lưu ý:
- Đứng sau Cloudflare Tunnel thì máy chủ đọc `x-forwarded-proto` để biết là https, không cần `LOCAL_DEV`.
- Không cho hai máy chủ (wrangler cũ và Node) cùng **ghi** một file dữ liệu. Chạy thử song song thì bản Node dùng bản sao riêng (như `C:\thp\node-db`) và để `THP_CRON=0`.
- Khi thay hẳn: tắt lịch "THP Cron" của Task Scheduler (Cron đã chạy trong tiến trình), đổi lệnh "THP Web" sang `node dist\pc\server.js`.

## Đã kiểm trên máy đám mây (số ảo)

- `tests/pc-d1.test.ts`: 40 API trong `scripts/dev/so-api.mjs`, D1 giả của test và D1 của PC, JSON trùng từng byte.
- `tests/pc-server.test.ts`: `.dev.vars`, `_headers`, tệp tĩnh không thoát thư mục, cache, Durable Object (lưu qua lần mở lại, alarm tự đặt lần sau, lỗi thì thử lại).
- Chạy hai máy chủ cạnh nhau trên cùng bản chép dữ liệu số ảo (wrangler cổng 8799, Node cổng 8792): `so-api` 40/40 trùng. Hai API lệch phút cắt (`prevCutoff`) vì bên wrangler trả bản trong cache tính từ phút trước; gọi lại với tham số mới thì trùng.
- 20 yêu cầu báo cáo chưa cache cùng lúc: wrangler 2,8 giây (có lỗi 500), Node 0,7 giây (không lỗi).
- Đồng bộ "Đồng bộ ngay" và alarm 1 phút của bộ hẹn giờ chạy trên bản Node; trạng thái lưu ở `do.sqlite`.

## Việc của PC (cần anh nhắn câu cho phép)

1. N4 trên dữ liệu thật: build nhánh, chạy bản Node cổng 8788 trên bản sao, `THP_CRON=0`; `so-api goc` ở 8787 rồi `so` ở 8788 ngay sau, đọc chỗ lệch.
2. N5: `scripts/pc/test-tai.mjs` vào cổng 8788 (anh nhắn "cho chạy test tải trên PC").
3. Thay hẳn: chỉ khi anh đồng ý.
