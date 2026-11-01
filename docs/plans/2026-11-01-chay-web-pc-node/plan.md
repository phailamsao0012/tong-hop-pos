# Chạy web tổng trên PC bằng Node: hết cảnh xếp hàng một luồng

Ngày 01/11/2026. Anh Vũ hỏi: "có cách nào thay cách chạy web không", "xem các app hay doanh nghiệp khác dùng như thế nào". Plan này so ba cách và đề xuất một cách. Claude tự làm, không qua Codex.

## 1. Mục tiêu (lời anh)

- Web tổng chạy trên PC ở công ty, không trả tiền Cloudflare nữa.
- Nhiều người mở cùng lúc không phải chờ. Mốc: 5 request/giây (khoảng 40 người cùng lúc) mà 95% trang mở dưới 2 giây.
- Số liệu, giao diện, quyền giữ nguyên như web thật.

## 2. Không được đổi

- Mọi câu SQL, cách tính số, tên nghiệp vụ, quyền xem: giữ nguyên.
- `lib/**`, `app/**` không sửa vì việc này (chỉ thêm lớp "dịch" ở ngoài).
- Web thật trên Cloudflare chạy bình thường trong lúc làm; bản PC chạy song song, so số rồi mới đổi.
- Không ghi dữ liệu thật trên PC khi chưa có khoá Pancake (vẫn như hiện nay).

## 3. Hiện trạng

- Code viết cho Cloudflare: 149 file `import { env } from 'cloudflare:workers'`; dùng `env.DB` (D1: `prepare` 867 chỗ, `first` 331, `all` 220, `run` 139, `batch` 107), `env.SYNC_SCHEDULER` (Durable Object, `lib/ops/scheduler.ts`), `env.AI` (5 chỗ, tóm tắt sáng), `env.HR` (1, gọi web nhân sự), `env.SEARCH_LIMIT` (2), `caches.open` (4, cache báo cáo trong `worker.ts`).
- PC đang chạy bản build bằng `wrangler dev --local` (công cụ chạy thử của Cloudflare): một tiến trình workerd, D1 giả lập một luồng, xử lý tuần tự từng câu. Thử tải 01/11 (sau ANALYZE): 1 req/s đạt, 2 req/s gãy; lần mở đầu Xu hướng 20 s, Cuộc gọi 13 s, Chăm sóc 12 s; đã có cache thì < 0,07 s.
- `vinext` (khung web đang dùng) có sẵn máy chủ Node (`vinext start`, `node_modules/vinext/dist/server/prod-server.js`). Build hiện tại gắn plugin Cloudflare trong `vite.config.ts`; bỏ plugin đó là build ra bản Node.
- Đã lên web thật 01/11: #110 tính sẵn ba báo cáo nặng sau mỗi lượt đồng bộ. Gộp request trùng đã có từ 10/10 (`worker.ts`, `inflight`).

## 4. Người khác làm thế nào

Doanh nghiệp tự chạy phần mềm trên máy của mình (on-premise) thường theo một khuôn, không ai chạy bằng công cụ phát triển:

| Phần | Cách phổ biến | Ví dụ |
|---|---|---|
| Máy chủ web | Một tiến trình Node/Go/Python chạy như dịch vụ hệ thống, tự bật lại | Odoo (Python), Gitea (Go), các app Node với pm2 hoặc systemd |
| Cơ sở dữ liệu | PostgreSQL hoặc MySQL chạy riêng, nhiều kết nối đọc song song | Odoo, KiotViet on-premise, phần mềm kế toán |
| Cơ sở dữ liệu nhỏ gọn | SQLite chế độ WAL: nhiều người đọc cùng lúc, một người ghi; sao lưu bằng Litestream | PocketBase, Gitea bản nhỏ, nhiều app nội bộ vài chục người |
| Cổng vào | Nginx hoặc Caddy đứng trước, lo HTTPS và nén | Gần như mọi hệ thống |
| Bộ nhớ đệm | Nhớ trong tiến trình hoặc Redis khi nhiều tiến trình | Tuỳ quy mô |
| Việc chạy nền | Lịch trong tiến trình hoặc cron hệ thống | Odoo cron, Gitea cron |

Web tổng dữ liệu 6 GB, vài chục người, đọc nhiều ghi ít (ghi chỉ do đồng bộ Pancake mỗi 5 phút): SQLite WAL + một máy chủ Node là khuôn đúng cỡ, không cần PostgreSQL. SQLite khi đọc trong bộ nhớ đệm hệ điều hành trả lời trong vài mili giây; PC 16 GB thừa chỗ giữ 6 GB dữ liệu trong RAM.

## 5. Ba cách, so nhau

| | Cách A: giữ workerd, tách kho dữ liệu ra Node | Cách B: chạy hẳn bằng Node (`vinext start`) | Cách C: ở lại Cloudflare, chỉ tối ưu cho rẻ |
|---|---|---|---|
| Sửa gì | Thêm một dịch vụ Node nhỏ cầm file SQLite, nhiều luồng đọc; thay `env.DB` bằng bản gọi dịch vụ đó qua localhost | Build không plugin Cloudflare; thêm lớp "dịch" cho `cloudflare:workers`: DB, bộ hẹn giờ, cache, AI, HR, giới hạn tìm kiếm | Không đổi cách chạy; tiếp tục cắt dòng đọc (đã làm #88, #110) |
| Code nghiệp vụ | Không đổi | Không đổi | Không đổi |
| Dùng được bao nhiêu nhân | DB dùng 4–8 luồng; web vẫn 1 luồng JS (nhẹ) | Web và DB đều nhiều luồng | Cloudflare lo |
| Công | 2–3 ngày | 5–7 ngày | 0 |
| Rủi ro | Thấp; lùi về cách cũ trong vài phút | Vừa: lớp dịch lệch thì số sai, phải so 40 trang | Tiền Cloudflare vẫn còn, khoảng 1 USD/ngày hiện nay |
| Về lâu dài | Vẫn lệ thuộc công cụ chạy thử của Cloudflare | Sạch, là cách các doanh nghiệp làm | Không bỏ được Cloudflare |

**Đề xuất:** làm **Cách B** luôn, vì Cách A chỉ là bước đệm vẫn dựa vào công cụ chạy thử, làm xong vẫn phải làm B. Lớp "dịch" của B gồm 6 phần, mỗi phần nhỏ và test được riêng. Anh muốn thấy kết quả sớm thì làm Cách A trước (2–3 ngày), nhưng tổng công sẽ nhiều hơn.

## 6. Thiết kế Cách B

Thêm thư mục `pc/` (ngoài `lib/`, `app/`), không đụng code nghiệp vụ:

- `pc/cloudflare-workers.ts`: bản thay cho module `cloudflare:workers`. Xuất `env` (ghép từ biến môi trường và 6 thứ dưới) và lớp `DurableObject` nền. `vite.config.pc.ts` dùng alias để mọi `import ... from 'cloudflare:workers'` trỏ về file này khi build bản PC. Build Cloudflare giữ nguyên.
- `pc/d1.ts`: `env.DB` kiểu D1 (`prepare/bind/first/all/run/raw/batch`, trả `meta.rows_read/rows_written` như D1) trên `node:sqlite`, chế độ WAL. Câu đọc chạy trên nhóm 6 worker thread, mỗi worker một kết nối; câu ghi và `batch` chạy trên một kết nối ghi duy nhất. Đây là chỗ gỡ nút thắt.
- `pc/scheduler.ts`: thay Durable Object `SyncScheduler`: cùng lớp đó chạy trong tiến trình, `ctx.storage.get/put/getAlarm/setAlarm` lưu vào bảng `pc_do_storage` trong một file SQLite riêng (`C:\thp\data\do.sqlite`), alarm bằng `setTimeout` kiểm mỗi 5 giây. Một bản duy nhất trong tiến trình.
- `pc/cache.ts`: thay `caches.open`: `Map` trong bộ nhớ có hạn (TTL như header `max-age`), đủ vì chỉ một tiến trình.
- `pc/ai.ts`: `env.AI` trên PC trả "không có" để tóm tắt sáng tự tắt (code đã xử lý thiếu AI); sau này gọi Claude API nếu anh muốn.
- `pc/hr.ts`: `env.HR.fetch` thành `fetch` tới `CRM_URL` kèm `x-hr-secret`. `env.SEARCH_LIMIT`: đếm trong bộ nhớ, 30 lượt/phút.
- Cron: giữ `scripts/pc/goi-cron.ps1`, nhưng gọi `POST /pc/scheduled` của máy chủ Node (khoá nội bộ), máy chủ gọi `scheduled()` trong `worker.ts`. `worker.ts` phần `fetch` được bọc bởi `pc/server.ts` (Node `http`, gọi `app.fetch(request, env, ctx)` như Cloudflare).
- Chạy: `node pc/server.js` như dịch vụ (Task Scheduler THP Web hiện có, chỉ đổi lệnh). Cổng 8787 như cũ, Cloudflare Tunnel hoặc Caddy đứng trước như plan chuyển PC.

## 7. Các bước (Claude làm, mỗi bước một PR vào `main`, không ảnh hưởng web thật vì chỉ thêm `pc/` và cấu hình build riêng)

| # | Nhánh | Việc | Xong khi | Kiểm |
|---|---|---|---|---|
| N1 | `claude/pc-n1-d1` | `pc/d1.ts` + test: so kết quả 40 câu lấy từ `tests/` với D1 giả hiện có (`tests/support/d1-sqlite.ts`) | cùng kết quả, cùng `meta` | `pnpm test` |
| N2 | `claude/pc-n2-env` | `pc/cloudflare-workers.ts`, `pc/cache.ts`, `pc/hr.ts`, `pc/ai.ts`, alias trong `vite.config.pc.ts`, lệnh `pnpm build:pc` | build ra `dist-pc/` không lỗi | build |
| N3 | `claude/pc-n3-scheduler` | `pc/scheduler.ts` + `pc/server.ts` + cron nội bộ | đồng bộ số ảo chạy đủ 5 bước, alarm tự lặp 5 phút | test g5 + chạy số ảo 30 phút |
| N4 | `claude/pc-n4-so` | Chạy bản Node với số ảo cạnh bản wrangler; `scripts/dev/so-api.mjs` so 40 API cùng lúc | 40/40 trùng từng byte | so-api |
| N5 | `claude/pc-n5-pc` | Sửa `scripts/pc/*.ps1`, `cai-dat.ps1` để chạy bản Node trên PC; thử tải lại bằng `test-tai.mjs` | 5 req/s, p95 < 2 s | log test tải; anh nhắn "cho chạy test tải trên PC" |

Ước: N1–N2 2 ngày, N3 1–2 ngày, N4–N5 1–2 ngày. Có thể làm N1–N3 trên máy đám mây với số ảo, không cần anh; N5 cần anh một câu cho chạy trên PC.

## 8. Kiểm thử

- Test đơn vị cho `pc/d1.ts` (bind kiểu dữ liệu, `first` không dòng, `batch` nguyên tử, `meta`), `pc/scheduler.ts` (alarm, storage), `pc/cache.ts` (TTL).
- So 40 API trước/sau bằng `so-api` khi hai bản chạy cùng lúc.
- Thử tải trên PC: trước (có #110) và sau (bản Node), cùng kịch bản `test-tai.mjs`, ghi `C:\thp\log`.
- Theo dõi 3 ngày trên PC chạy song song web thật: đồng bộ, sao lưu đêm, Telegram canh máy.

## 9. Rủi ro và cách lùi

- Lớp dịch D1 lệch (kiểu số, `NULL`, thứ tự cột): bắt bằng test so với D1 giả + so-api 40 trang. Lùi: chạy lại `wrangler dev` (script cũ giữ nguyên).
- `node:sqlite` cần Node ≥ 22.13 (PC đã có). Worker thread mở nhiều kết nối: WAL cho phép, nhưng khi sao lưu đêm phải dùng `VACUUM INTO` như `sao-luu.mjs` đang làm.
- Bộ hẹn giờ chạy trong tiến trình web: web tắt thì đồng bộ dừng; Task Scheduler tự bật lại sau 5 giây (đã có) và canh máy báo Telegram.
- Không có Workers AI trên PC: tóm tắt sáng tắt cho tới khi nối Claude API (anh đã có khoá cho web thật).
