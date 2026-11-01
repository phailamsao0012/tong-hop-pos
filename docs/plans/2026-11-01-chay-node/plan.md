# Chạy web tổng trên PC bằng Node.js (thay `wrangler dev`)

Anh Vũ 01/11/2026: "Lên plan node luôn, hoặc có cách nào tối ưu hơn gợi ý cho t biết". Plan này nối tiếp
`docs/plans/2026-10-31-chuyen-sang-pc/plan.md` (B1–B5 đã chạy trên PC, dữ liệu thật đã nạp).

## 1. Vì sao phải đổi cách chạy

Đo trên PC ngày 01/11 (i5-14400F 16 luồng, 16 GB RAM, SSD SATA, dữ liệu thật 5,7 GB, 373 nghìn đơn):

| Đo | Kết quả |
|---|---|
| Từng API, lần đầu (chưa có cache) | trends 20 s, calls 13 s, care 12 s, repurchase 4,1 s, product-groups 3,9 s, overview 3,7 s, customers 3 s |
| Từng API, lần hai (cache) | tất cả < 70 ms |
| Thử tải, cache nóng | 1 req/s (~9 người) đạt: p50 46 ms, p95 1,8 s. 2 req/s (~17 người) gãy: 82 % quá 10 s |
| CPU lúc thử tải | chỉ ~1/16 máy bận |

Gốc: `wrangler dev` là công cụ thử của Cloudflare. D1 trong đó là **một** Durable Object, chạy **tuần tự từng câu** SQL trên một luồng.
Một câu chưa có cache 12–20 s làm mọi người khác đứng chờ. Máy 16 luồng nhưng chỉ dùng được 1.

Đã có sẵn trong `worker.ts`: gộp request trùng (`inflight`), cache hai tầng theo phiên bản dữ liệu, chế độ trả bản gần nhất rồi tính lại ngầm
(`THP_SWR=1`, bật cho PC ngày 01/11). Những thứ đó bớt số lần phải tính, không làm DB chạy song song được.

## 2. Các cách, so sánh

| Cách | Làm gì | Công | Rủi ro | Dùng được bao nhiêu lõi |
|---|---|---|---|---|
| **N. Node.js (chọn)** | Chạy chính `worker.ts` trong Node, thay các thứ chỉ Cloudflare có bằng bản Node; nhiều tiến trình Node cùng đọc một file SQLite | ~5–7 ngày | vừa: phải thử kỹ build vinext cho Node | tất cả (cluster) |
| A. Proxy D1 | Giữ `wrangler dev`, cho `env.DB` gọi sang một tiến trình Node có nhiều kết nối SQLite đọc song song | ~2–3 ngày | thấp | DB song song; JS vẫn một luồng, vẫn chạy công cụ thử |
| C. Ở lại Cloudflare | Tối ưu câu SQL + làm nóng cache để bớt dòng đọc (bớt tiền) | ~1–2 ngày | thấp | — |
| Viết lại bằng framework khác | — | nhiều tuần | cao | — |

Chọn **N**, có bước thử khả thi (N0) đầu tiên. N0 không qua (build vinext cho Node không chạy được `worker.ts`) thì làm **A**:
phần shim D1 viết ở N1 dùng lại nguyên cho A. Việc tối ưu SQL (mục 6) làm song song, có lợi cho cả PC lẫn Cloudflare.

## 3. Không được đổi

- Số liệu, cách tính, quyền xem, route, giao diện, nhật ký hoạt động. Đây là đổi chỗ chạy, không đổi tính năng.
- Code nghiệp vụ (`lib/`, `app/`) không sửa vì Node; mọi khác biệt nằm trong lớp shim `lib/node/` và file chạy `server-node.mjs`.
- Bản Cloudflare (`pnpm build` + `scripts/deploy.mjs`) build và chạy y như cũ. Repo vẫn deploy được lên Cloudflare bất cứ lúc nào.
- Không ghi khoá, số thật vào repo hay log.

## 4. Thiết kế

### 4.1 Những thứ chỉ Cloudflare có và bản thay trên Node

| Thứ trên Cloudflare | Dùng ở đâu | Bản Node |
|---|---|---|
| `import { env } from 'cloudflare:workers'` | 163 file | alias Vite `cloudflare:workers` → `lib/node/cf-shim.ts`, xuất `env` (biến từ `.dev.vars` + `DB` + `SYNC_SCHEDULER`), `DurableObject` (lớp cơ sở) |
| D1 (`env.DB`) | 871 `prepare`, 122 `batch`, 3 `exec` | `lib/node/d1.ts`: lớp giống D1 trên `node:sqlite` (prepare/bind/first/all/run/raw, batch = một giao dịch, exec). Trả `{ results, success, meta: { changes, last_row_id, duration, rows_read, rows_written } }` như D1. Lỗi bọc thành `D1_ERROR: …` |
| Cache API (`caches.open('thp-reports')`) | `worker.ts` | `lib/node/cache.ts`: bảng `cache(url, meta, body, expires)` trong file SQLite riêng `C:\thp\db\cache.sqlite` (dùng chung mọi tiến trình) |
| Durable Object `SyncScheduler` (alarm + storage) | đồng bộ Pancake 5 phút, tuyển dụng | chỉ tiến trình chính chạy một bản `SyncScheduler`; `ctx.storage` = bảng `do_storage(key, value)`; `setAlarm/getAlarm` = `setTimeout` + lưu mốc vào bảng để khởi động lại không mất lịch. Tiến trình con gọi `ensure/kick/status/runNow/pokeRecruit` qua IPC của cluster |
| `scheduled()` (Cron) | mỗi phút | tiến trình chính gọi `worker.scheduled()` đúng đầu mỗi phút; bỏ task `THP Cron` và `goi-cron.ps1` |
| `ctx.waitUntil` | nhiều chỗ | giữ promise trong tập đang chạy, có giới hạn thời gian; tắt tiến trình thì chờ tập này xong (tối đa 30 s) |
| `env.AI`, `SEARCH_LIMIT`, `env.HR` | tóm tắt AI, giới hạn tìm, web nhân sự | không gắn (code đã tự bỏ qua khi thiếu); `HR` thì dùng `CRM_URL` như code sẵn có |

### 4.2 Chạy song song

- `server-node.mjs`: Node `cluster`, 1 tiến trình chính + **6 tiến trình con** (chỉnh bằng `THP_WORKERS`). Con nhận request HTTP
  (cổng 8787, `node:http` → `Request` → `worker.fetch(request, env, ctx)` → trả `Response`, có stream).
- Mỗi con mở **một** kết nối SQLite tới `C:\thp\db\thp.sqlite`, chế độ WAL, `busy_timeout=10000`, `synchronous=NORMAL`,
  `cache_size` ~256 MB, `mmap_size` ~1 GB. WAL cho nhiều tiến trình đọc cùng lúc; ghi được SQLite xếp hàng an toàn.
- `node:sqlite` chạy đồng bộ: một câu 20 s chỉ chặn đúng một con, 5 con còn lại vẫn phục vụ. Cộng gộp request trùng sẵn có, đủ cho ~40 người.
  Cần hơn thì tăng số con (đo ở N5).
- Cache tầng 1 (bộ nhớ, 90 s) là của từng con; tầng 2 (`cache.sqlite`) dùng chung. Khoá báo cáo gồm phiên bản dữ liệu nên không lẫn số cũ.
- Tiến trình chính: không phục vụ HTTP; giữ bộ hẹn giờ, cron mỗi phút, khởi động lại con bị chết (sau 1 s).

### 4.3 Dữ liệu

- Chuyển một lần: `VACUUM INTO` từ file D1 của miniflare (`C:\thp\data\v3\d1\…sqlite`) sang `C:\thp\db\thp.sqlite`.
  Cùng là SQLite, cùng bảng, không đổi dữ liệu. Bỏ bảng nội bộ `_cf_METADATA` / `_cf_KV`. Giữ `d1_migrations`.
- Migration: `scripts/pc/migrate-node.mjs` đọc `drizzle/*.sql`, so với `d1_migrations`, chạy file mới trong giao dịch (cùng cách wrangler ghi bảng này).
- Sao lưu: `sao-luu.mjs` đổi đường dẫn sang `C:\thp\db\thp.sqlite` (thêm cờ `--file`), còn lại giữ nguyên.
- `ANALYZE` chạy sau khi chuyển và mỗi tuần (thiếu thống kê thì SQLite chọn sai chỉ mục; 01/11 đã thấy).

### 4.4 Build

- `vite.node.config.ts`: vinext **không** kèm `@cloudflare/vite-plugin`; alias `cloudflare:workers`; entry server là `worker.ts`
  (để giữ nguyên cache, phân quyền, nhật ký). Ra `dist-node/`. `pnpm build:node`.
- Điểm phải thử đầu tiên (N0): `vinext/server/fetch-handler` và RSC/SSR của vinext có build được cho Node khi không có plugin Cloudflare,
  và `worker.ts` có làm entry được không. vinext có sẵn `vinext start` (prod-server.js) cho Node nên khả năng cao là được.

## 5. Các bước

Mỗi bước: nhánh `claude/pc-node`, commit riêng, test xanh (`pnpm typecheck`, `pnpm test`), không đụng bản Cloudflare.

**N0. Thử khả thi (nửa ngày).**
- Build `worker.ts` cho Node với shim tối thiểu (env rỗng + D1 trên bản sao 5 phút dữ liệu). Mở `/login`, đăng nhập tài khoản tạm, gọi `/api/reports/overview`.
- Xong khi: trả 200 và JSON giống bản `wrangler dev` cho cùng URL. Không được thì dừng, báo, chuyển sang cách A.

**N1. Shim D1 (1 ngày).**
- `lib/node/d1.ts` đủ API D1 code đang dùng; test riêng `tests/node-d1.test.ts`: kiểu trả về, `batch` lỗi giữa chừng thì cuộn lại cả lô,
  `bind` với null/boolean/số lớn, `first(col)`, `raw()`, chuỗi có dấu `;`, BLOB.
- Xong khi: chạy lại các test hiện có đang dựng D1 giả (`tests/support`) bằng shim mới mà vẫn xanh.

**N2. Cache, DO, cron, waitUntil (1 ngày).**
- `lib/node/cache.ts`, `lib/node/durable.ts`, `lib/node/ctx.ts`. Test: hết hạn cache, alarm sống qua khởi động lại, cron đúng phút.
- Xong khi: đồng bộ Pancake chạy theo nhịp 5 phút trên bản Node với số ảo (DEMO_MODE=1), log giống bản wrangler.

**N3. Máy chủ HTTP + cluster (1 ngày).**
- `server-node.mjs`: chuyển request/response (header, cookie nhiều dòng, stream, file tĩnh trong `dist-node/client`), tắt êm, khởi động lại con chết.
- Xong khi: toàn bộ trang mở được trên trình duyệt PC, đăng nhập/đăng xuất, ghi (bấm "Vẫn tính", ghi chú) chạy đúng.

**N4. So khớp với bản hiện tại (1 ngày).** Đây là bước quan trọng nhất.
- `scripts/pc/so-khop.mjs`: danh sách ~150 URL API (mọi báo cáo × 3 kỳ × vài bộ lọc × vai trò owner/leader/nhân viên), gọi cả bản
  `wrangler dev` (8787) và bản Node (8788) trên **cùng một bản sao dữ liệu**, so JSON từng byte (bỏ trường giờ tạo).
- Xong khi: 100 % khớp, hoặc mỗi chỗ lệch có giải thích và anh đồng ý.

**N5. Thử tải (nửa ngày).**
- `test-tai.mjs` vào bản Node: nấc 1, 2, 5, 10, 20, 40 req/s. Thử thêm 4, 6, 8, 12 tiến trình con.
- Xong khi: 5 req/s (~40 người) p95 < 2 s, lỗi < 1 %. Ghi số trước/sau vào plan.

**N6. Đổi chỗ chạy trên PC (nửa ngày, cần anh "ok").**
- Sao lưu, `VACUUM INTO`, migrate, `ANALYZE`. Task `THP Web` chạy `server-node.mjs`; bỏ `THP Cron`. Giữ nguyên thư mục `C:\thp\data` cũ 30 ngày.
- Xong khi: canh máy xanh 24 giờ, sao lưu đêm chạy trên file mới, khôi phục thử khớp.

## 6. Làm song song: tối ưu câu SQL chậm (có lợi cả Cloudflare)

- trends (20 s), calls (13 s), care (12 s): `EXPLAIN QUERY PLAN` trên dữ liệu thật ở PC, sau `ANALYZE`. Thêm chỉ mục hoặc đọc từ bảng thống kê
  có sẵn (`stats_daily`, `customer_stats`…). Mục tiêu mỗi API < 1 s khi chưa có cache.
- Cron làm nóng cache cho các kỳ hay xem (hôm nay, 7 ngày, tháng này × 6 POS), mỗi lần đồng bộ xong.
- Đây là thay đổi code nghiệp vụ nên đi theo quy trình thường: lên demo trước, anh xem rồi mới lên web thật.

## 7. Rủi ro và cách quay lại

| Rủi ro | Phòng |
|---|---|
| vinext không build được `worker.ts` cho Node | N0 phát hiện trong nửa ngày; chuyển cách A |
| Shim D1 lệch D1 thật (kiểu số, lỗi, batch) | test riêng N1 + so khớp 150 URL ở N4 |
| Nhiều tiến trình cùng ghi gây `SQLITE_BUSY` | WAL + `busy_timeout`; đồng bộ chỉ chạy ở tiến trình chính; theo dõi log lỗi BUSY ở N5 |
| Cache tầng 1 khác nhau giữa các con | khoá có phiên bản dữ liệu; lệnh ghi xoá phiên bản nhớ (đã có `forgetVersion`, cookie `thp_w`) |
| Lỗi lúc chạy thật | Quay lại: đổi task `THP Web` về `chay-web.ps1` (wrangler) và thư mục `C:\thp\data` cũ, 2 phút. Dữ liệu ghi trong lúc chạy Node chép ngược bằng `VACUUM INTO` |

## 8. Cần anh

- "ok" cho N0–N5 (chỉ trên PC, số ảo và bản sao dữ liệu, không đụng web thật).
- "ok" riêng cho N6 (đổi bản web PC đang chạy sang Node).
- Mục 6 (sửa câu SQL nghiệp vụ) đi theo quy trình demo như mọi việc khác.
