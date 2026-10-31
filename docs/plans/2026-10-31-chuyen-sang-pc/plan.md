# Chuyển web tổng khỏi Cloudflare sang chạy trên PC của anh

## 1. Mục tiêu
Anh Vũ 31/10/2026: "nếu như t không muốn dùng cloudflare, có phương án nào thay thế không" → "phương án 2 đi, t có ups, không sợ".
Thêm: "nghiên cứu giúp t, nếu chuyển sang pc, cần những gì để hoạt động tốt nhất, ssd, sao lưu lên đám mây định kì, cấu hình, ngoại vi".

Kết quả anh thấy:
- web tổng chạy trên PC Windows của anh (máy mở 24/7, có UPS);
- dữ liệu nằm trên ổ SSD của PC, không còn tính tiền theo số dòng đọc/ghi;
- sao lưu tự động lên đám mây mỗi đêm;
- vào web vẫn bằng tên miền cũ;
- PC mất mạng, mất điện hay hỏng thì có tin Telegram báo và có đường quay lại.

## 2. Không được đổi
- Số liệu, cách tính, quyền xem, route, giao diện: giữ nguyên. Đây là việc đổi chỗ chạy, không đổi tính năng.
- Không chuyển dữ liệu thật, không đổi tên miền, không xoá D1 trên Cloudflare khi anh chưa đồng ý đúng thao tác đó (mỗi bước có câu hỏi riêng ở mục 5).
- Không ghi khoá bí mật, số thật vào repo, plan hay log (repo công khai). Khoá để trong file `.dev.vars` trên PC, ngoài git.
- Không mở cổng mạng thẳng từ modem vào PC.

## 3. Hiện trạng (web đang dựa vào gì trên Cloudflare)
| Thứ | Ở đâu | Trên PC thay bằng |
|---|---|---|
| Chạy code (Worker, vinext) | `wrangler.jsonc` `main: ./worker.ts` | `workerd` (bộ chạy mã nguồn mở của Cloudflare, chạy được trên máy riêng) qua `wrangler dev --local`, không đổi code |
| Cơ sở dữ liệu D1 (~6 GB) | binding `DB` | file SQLite trên SSD của PC (D1 vốn là SQLite) |
| Lịch chạy mỗi phút (đồng bộ Pancake, Zalo, sheet CPQC, canh gác) | `triggers.crons` `* * * * *` | Task Scheduler của Windows gọi `/cdn-cgi/handler/scheduled` mỗi phút |
| Bộ hẹn giờ đồng bộ | Durable Object `SyncScheduler` | workerd chạy được Durable Object, lưu trên đĩa |
| Workers AI (tóm tắt, xu hướng) | binding `AI`, `lib/ai-summary.ts`, `lib/ai-trends.ts` | chuyển sang Claude API đã có (`claude-api-web-tong`), hoặc tắt; code đã có nhánh `if (!env.AI)` |
| Giới hạn tìm kiếm | binding `SEARCH_LIMIT`, `lib/search-limit.ts` | bỏ binding, code đã có nhánh `if (!env.SEARCH_LIMIT)` |
| Gọi web nhân sự | service binding `HR`, `lib/hr-sync.ts:28` | gọi qua HTTPS (code đã có nhánh `fetch`) |
| Cache báo cáo | Cache API `caches.open('thp-reports')`, `worker.ts:103` | workerd có Cache API trong bộ nhớ |
| Gửi thư | Brevo, `lib/mail.ts` | giữ nguyên |
| Tên miền | custom domain trên Cloudflare | đường hầm ra Internet (mục 4.3) |

Web nhân sự (megatech-crm) vẫn trên Cloudflare, nằm trong gói Workers Paid 5 USD. Muốn bỏ hẳn gói thì phải chuyển cả web nhân sự; việc này để đợt sau.

## 4. Thiết kế

### 4.1 Cách chạy
- Chạy thẳng trên Windows (không cần WSL, khỏi cài thêm và khởi động lại máy): `scripts/pc/cai-dat.ps1` cài vào `C:\thp\app`, dữ liệu `C:\thp\data`, bí mật `C:\thp\bi-mat\.dev.vars`, log `C:\thp\log`.
- Đã thử 31/10 trên máy đám mây: bản build chạy bằng `wrangler dev --local` với `wrangler.pc.json`, đăng nhập demo và Điều hành hiện đúng. Thiếu `AUTH_SECRET` thì tạo tài khoản lỗi 500, nên `.dev.vars` luôn phải có biến này.
- Build như bản thật: `pnpm build` ra `dist/server/wrangler.json` (giống `scripts/deploy.mjs:7`). Chép thành `dist/server/wrangler.pc.json`, bỏ `routes`, `ai`, `ratelimits`, `services`, `triggers`.
- Chạy: `pnpm exec wrangler dev --config dist/server/wrangler.pc.json --local --ip 127.0.0.1 --port 8787 --persist-to /data/thp`. Dữ liệu D1, Durable Object và cache lưu trong `/data/thp` trên SSD.
- Máy anh (31/10): 16 GB RAM, SSD NVMe trống 128 GB. Đủ chạy. Cho WSL tối đa 8 GB RAM (`.wslconfig`). Thư mục `/data/thp` đặt trong ổ ảo WSL (ext4) để SQLite chạy nhanh, không đặt trên `/mnt/c`.
- Không đụng thư mục `C:\Users\PC\Projects\tong-hop-pos` của thread Giao diện mới. Bản chạy web dùng clone riêng `~/thp-run` trong WSL, chỉ kéo nhánh `main`.
- Task Scheduler: `THP Web` chạy `scripts/pc/chay-web.ps1` khi đăng nhập Windows (vòng lặp tự chạy lại sau 5 giây), `THP Cron` chạy `scripts/pc/goi-cron.ps1` mỗi phút.

### 4.2 Lịch chạy
- `goi-cron.ps1` gọi `http://127.0.0.1:8787/cdn-cgi/handler/scheduled?cron=*+*+*+*+*` mỗi phút (cần cờ `--test-scheduled`).
- Script ghi giờ chạy cuối. Quá 5 phút không chạy thì báo Telegram.

### 4.3 Đưa web ra Internet an toàn
Không mở cổng modem. Có ba cách:
1. **Cloudflare Tunnel (khuyên dùng):**
   - miễn phí, không tính theo dòng đọc;
   - PC chủ động nối ra, IP nhà đổi vẫn chạy;
   - giữ được tên miền và lớp chống tấn công.
   - Chỉ dùng phần đường hầm và DNS miễn phí, không dùng Worker hay D1.
2. **Tailscale Funnel:** miễn phí, không dính Cloudflare. Nhược điểm là tên miền phải trỏ CNAME và ít lớp chống tấn công hơn.
3. **VPS nhỏ làm cổng (~5 USD/tháng) + WireGuard về PC:** tốn tiền, nhiều việc hơn.

Mặc định chọn 1. Nếu anh muốn bỏ hẳn tên Cloudflare thì chọn 2.

### 4.3b Bí mật và đường hầm
- Bí mật của Worker không đọc lại được từ Cloudflare. Bản PC cần: `AUTH_SECRET` (phải GIỐNG bản thật, nếu khác thì mọi mật khẩu và phiên đăng nhập hỏng), `PANCAKE_POS_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ZALO_BOT_TOKEN`, `HR_SHARED_SECRET`, `BREVO_API_KEY`, `ANTHROPIC_API_KEY`, `RECRUIT_WEBHOOK_SECRET`. Anh điền vào `C:\thp\bi-mat\.dev.vars` trên PC; không ai chép ra chat hay repo. Mất `AUTH_SECRET` thì phải đặt lại mật khẩu mọi người: hỏi anh trước B5.
- Qua đường hầm, Worker thấy `http://` nên sẽ tự chuyển sang https mãi (`worker.ts:260`). Bản PC đặt `LOCAL_DEV=1` trong `.dev.vars` để tắt chuyển hướng này; đường hầm đã lo https.

### 4.4 Chuyển dữ liệu D1 → SQLite trên PC
1. Xuất bằng `wrangler d1 export tong-hop-pos --remote --output thp.sql`, chạy trên PC (anh đăng nhập wrangler một lần). Một lần xuất đọc hết DB, chỉ vài chục triệu dòng, chi phí không đáng kể.
2. Nạp vào D1 local: `wrangler d1 execute tong-hop-pos --local --file thp.sql --persist-to /data/thp`. Lệnh này chạy trên máy, không phải `--remote`.
3. So số dòng từng bảng giữa bản xuất và bản nạp (script in số đếm, không in dữ liệu).

### 4.5 Sao lưu
- **Liên tục:** Litestream đẩy từng thay đổi của file SQLite lên đám mây (Backblaze B2 hoặc Cloudflare R2), trễ dưới 1 phút.
- **Mỗi đêm (anh hỏi 31/10 "sao lưu lên cloud lên drive được k"):** bản chụp SQLite, nén gzip, mã hoá bằng khoá công khai của PC (`scripts/pc/ma-hoa.mjs`, khoá riêng chỉ ở `C:\thp\bi-mat`), đẩy lên thư mục riêng trên Google Drive bằng rclone (anh bấm cho phép một lần). Giữ 7 bản ngày + 4 bản tuần (~20 GB; Google One 100 GB đủ). Khoá riêng phải có bản sao ngoài PC (anh cất), mất khoá là mất sao lưu.
- **Đã làm 31/10 (`scripts/pc/sao-luu.mjs`, lịch THP Sao luu 2:30):** chụp bằng `VACUUM INTO`, `quick_check`, nén + mã hoá vào `C:\thp\sao-luu`, giữ 7 ngày + 4 Chủ nhật, Chủ nhật tự khôi phục thử và so số dòng từng bảng. Phần đẩy Google Drive chờ anh ngồi ở PC bấm Cho phép.
- **Mỗi tuần:** tự khôi phục thử bản sao lưu vào thư mục tạm, đếm số dòng rồi báo Telegram "sao lưu đọc được".

### 4.6 Canh máy
- Dịch vụ canh từ bên ngoài (UptimeRobot, miễn phí) gọi web 5 phút một lần, lỗi thì báo Telegram.
- UPS cắm cáp USB vào PC. Mất điện quá 10 phút thì PC tắt êm, có điện lại thì tự bật (BIOS: Restore on AC power loss = On).
- Windows Update chỉ cài trong khung 2–4 giờ sáng, không tự khởi động lại giờ làm việc.

## 5. Các bước
Mỗi bước có câu hỏi anh trả lời "có" trước khi làm bước đụng dữ liệu thật hay tên miền.

**Thứ tự và người làm.** B1–B4 không đụng dữ liệu thật: Codex trên PC làm, Claude kiểm, gửi anh ảnh. B5–B7 mỗi bước chờ anh "có". Script đặt trong `scripts/pc/` (bash, chạy trong WSL), không sửa `wrangler.jsonc`, `.github/workflows/*`, `migrations/**`, `drizzle/**`.

**B1. Chuẩn bị PC (không đụng dữ liệu thật).** Nhánh `codex/pc-b1-chuan-bi`.
- File: `scripts/pc/cai-dat.sh` (cài Node 22.13+, pnpm, sqlite3, clone `~/thp-run`), `scripts/pc/chay.sh` (build + chạy), `scripts/pc/README.md`.
- WSL2 Ubuntu 24.04 cài một lần bằng `wsl --install -d Ubuntu-24.04` (cần quyền admin Windows: nếu lớp an toàn chặn thì dừng, báo điều phối).
- Việc: script cài WSL2, Node 22, pnpm, chạy web với số ảo (`DEMO_MODE=1`) trên PC.
- Xong khi: mở `http://127.0.0.1:8787` trên PC thấy web demo.
- Kiểm: ảnh chụp trang Tổng quan số ảo.

**B2. Bỏ phụ thuộc chỉ có trên Cloudflare.** Nhánh `codex/pc-b2-bo-binding`.
- Sửa: `wrangler.pc.jsonc` mới (không sửa `wrangler.jsonc`), `lib/ai-summary.ts`, `lib/ai-trends.ts`.
- Việc:
  - bản PC không có `AI`, `SEARCH_LIMIT`, `HR`, `routes`;
  - AI chuyển sang Claude API nếu có khoá, không có thì dùng nhánh luật sẵn có.
- Xong khi: chạy bản PC với số ảo; cron gọi tay chạy hết không lỗi.
- Kiểm: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`, log cron.

**B3. Chạy nền + lịch + canh.** Nhánh `codex/pc-b3-dich-vu`.
- Việc: dịch vụ systemd, timer cron mỗi phút, báo Telegram khi web chết hoặc cron trễ.
- Xong khi: tắt tiến trình web thì nó tự chạy lại trong 10 giây; khởi động lại PC thì web tự lên.
- Kiểm: thử tắt và khởi động lại thật.

**B4. Sao lưu.** Nhánh `codex/pc-b4-sao-luu`.
- Việc: Litestream, restic mỗi đêm, khôi phục thử mỗi tuần.
- Xong khi: khôi phục được bản sao lưu vào máy khác (chạy trên máy đám mây với số ảo).
- Cần anh: tạo tài khoản lưu trữ đám mây (B2 hoặc R2) và đưa khoá vào file trên PC.

**B5. Chạy song song bằng bản sao dữ liệu.** ❓ Cần anh "có" cho thao tác xuất D1 thật về PC.
- Việc: xuất D1, nạp vào PC; PC chạy đồng bộ Pancake song song nhưng không gửi Zalo/Telegram (tránh tin trùng).
- Xong khi: số Tổng quan hôm nay trên PC khớp web thật trong 3 ngày liền.
- Kiểm: script so số đếm.

**B6. Chuyển hẳn.** ❓ Cần anh "có" cho đổi tên miền.
- Việc:
  - tắt cron trên Cloudflare;
  - xuất lần cuối phần chênh;
  - trỏ tên miền vào đường hầm;
  - bật Zalo/Telegram trên PC.
- Gián đoạn dự kiến dưới 15 phút, làm lúc 22h.
- Xong khi: đăng nhập, xem số, Zalo nhận tin đều chạy từ PC.

**B7. Dọn Cloudflare.** ❓ Cần anh "có" riêng cho xoá D1.
- Giữ D1 và Worker cũ 30 ngày để quay lại.
- Sau đó xoá D1 (hết tiền dung lượng). Hạ gói hay giữ gói thì tuỳ web nhân sự.

## 6. Kiểm thử
- Bốn lệnh `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build` ở mỗi bước có sửa code.
- So số: đơn, doanh thu từng POS hôm nay và hôm qua giữa PC và web thật (B5).
- Thử sự cố: rút mạng PC 5 phút, rút điện (UPS gánh), khởi động lại; mỗi lần phải có tin Telegram.
- Khôi phục thử sao lưu.

## 7. Rủi ro và cách lùi
| Rủi ro | Cách giảm | Lùi lại |
|---|---|---|
| Mạng nhà rớt | 2 đường mạng + router tự chuyển (mục phần cứng) | — |
| Mất điện lâu hơn UPS | PC tắt êm, tự bật lại | Trỏ tên miền về Worker cũ (30 ngày đầu) |
| SSD hỏng | Litestream + bản đêm trên đám mây | Khôi phục vào máy khác trong ~1 giờ |
| workerd chạy chậm câu nặng | SSD NVMe, 32 GB RAM | — |
| Windows tự khởi động lại | Khung giờ cập nhật 2–4h | — |
| Lộ PC ra Internet | Chỉ đường hầm, không mở cổng | — |
| Quay lại Cloudflare | Giữ Worker + D1 cũ 30 ngày | Đổi tên miền về custom domain cũ (vài phút) |
