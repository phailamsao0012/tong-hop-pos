# B6: chuyển tên miền web tổng sang PC (04/11/2026)

Anh Vũ 04/11: "ủa dữ liệu tưởng đang chạy trên pc", rồi "lên kế hoạch sau bước này". Nối tiếp `docs/plans/2026-10-31-chuyen-sang-pc/plan.md` (B6, B7)
và `docs/plans/2026-11-01-chay-web-pc-node` (bản Node đang chạy trên PC từ 01/11).

## 1. Mục tiêu
- `tonghopposmegatech.io.vn` (và `www.`) do web Node trên PC trả lời, qua Cloudflare Tunnel (không mở cổng modem).
- Mọi người đăng nhập bằng mật khẩu cũ, thấy đủ dữ liệu, Telegram/Zalo/web nhân sự/webhook Google Sheets chạy như trước.
- Worker Cloudflare và D1 giữ nguyên 30 ngày để quay lại (B7 mới xoá, cần anh đồng ý riêng).

## 2. Hiện trạng (04/11)
| | Cloudflare (web thật) | PC |
|---|---|---|
| Ai dùng | mọi người, qua tên miền | chưa ai, chỉ mở được trên chính PC (127.0.0.1:8787) |
| Code | main mới nhất (#123) | main 6f9ca62 (01/11), thiếu các bản sau |
| Đơn, khách, ghi chú, sản phẩm | đồng bộ Pancake | tự đồng bộ Pancake mỗi 5 phút (từ 02/11) |
| Tài khoản, cài đặt, giao việc, Zalo... | dữ liệu đang dùng | bản chép 01/11, cũ |
| Khoá | đủ | chỉ AUTH_SECRET (ngẫu nhiên), Pancake |
| Tốc độ | câu nặng 4–8 s, có lúc nghẽn, lỗi 500 | thử tải 80 req/s (~690 người) 0 lỗi; Xu hướng 0,3 s nhờ chỉ mục mới |

## 3. Điều kiện trước khi chuyển (đủ hết mới làm)
1. **Số khớp**: `scripts/pc/so-so-ngay.mjs` báo ngày cũ KHỚP 3 ngày liền, hoặc anh chấp nhận lệch đã biết. Hiện lệch 1–3 đơn/ngày ở 2–3 POS
   do đường đồng bộ "đơn sửa gần đây" bỏ sót; tổ web tổng đang xem. Lệch này cũng có thể đang có ở web thật.
2. **AUTH_SECRET thật** dán vào `C:\thp\bi-mat\.dev.vars`. Thiếu thì mọi mật khẩu, phiên, mã 2 lớp hỏng; phương án thay: mọi người đặt lại mật khẩu (cần anh quyết).
3. **Khoá còn lại** dán vào `.dev.vars` (anh làm trên PC hoặc qua Chrome Remote Desktop, không qua chat): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
   `ZALO_BOT_TOKEN`, `HR_SHARED_SECRET`, `BREVO_API_KEY`, `RECRUIT_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY` (nếu dùng). Bỏ `PANCAKE_READ_ONLY` nếu muốn bật lại chia số.
   Bí mật Cloudflare không đọc ra được: lấy từ nơi anh/tổ đã cất khi cài.
4. **PC chạy code main mới nhất**: build main, khởi động lại web (cần anh bấm Yes một lần, vì task chạy chế độ không cần đăng nhập). Chạy `so-api` so với web thật.
5. **Cách khởi động lại không cần quyền quản trị** (tổ web tổng, đã báo 02/11): để mỗi lần cập nhật sau này không phải nhờ anh.
6. Sao lưu đêm lên Drive chạy đều (đang chạy), khoá sao lưu đã có bản ngoài PC, Chrome Remote Desktop dùng được từ Mac.

## 4. Chuẩn bị (ngày trước, không gián đoạn)
- **T1. Cài cloudflared trên PC** (bản chính thức của Cloudflare, cần anh bấm Yes để cài dịch vụ). Anh đăng nhập Cloudflare một lần (`cloudflared tunnel login`, bấm Allow).
- **T2. Tạo tunnel `thp-pc`** trỏ `http://127.0.0.1:8787`; chạy thành dịch vụ Windows (tự lên khi bật máy).
- **T3. Thử bằng tên miền phụ** `pc.tonghopposmegatech.io.vn` qua tunnel: đăng nhập, mở mọi trang, đo tốc độ từ điện thoại/Mac (mạng ngoài).
  Máy chủ Node đọc `x-forwarded-proto` nên https qua tunnel chạy đúng, không cần `LOCAL_DEV`. Đặt `chay-node.ps1` không đặt `LOCAL_DEV` (hiện không đặt).
- **T4. Danh sách bảng phải chép lúc chuyển** (bảng do chính web ghi, PC không tự lấy được). Tổ web tổng xác nhận danh sách:
  - Tài khoản, đăng nhập: `users`, `sessions`, `user_mfa`, `passkeys`, `trusted_devices`, `login_challenges`, `login_requests`.
  - Cài đặt, mục tiêu: `app_settings`, `targets`, `staff_settings`, `report_presets`, `alert_rules`.
  - Giao việc, Zalo, Telegram: `zalo_contacts`, `zalo_tasks`, `zalo_task_events`, `zalo_meetings`, `zalo_meeting_invites`, `zalo_messages`, `zalo_groups`,
    `telegram_chats`, `telegram_requests`, `alert_log`, `ops_incidents`, `dispatch_pos`, `dispatch_staff`, `dispatch_log`.
  - Marketing, tuyển dụng (đến qua webhook Google Sheets): `ad_costs`, `sheet_cost_sources`, `sheet_cost_keys`, `sheet_cost_aliases`, `sheet_mkt_stats`,
    `recruit_candidates`, `recruit_cv`, `recruit_events`, `recruit_sources`, `hr_handoffs`.
  - Nhật ký: `audit_log`.
  - Không chép (PC tự có, mới hơn): đơn, món, khách, ghi chú, sản phẩm, nhân sự POS, `stats_*`, `customer_stats`, `customer_seller_stats`, `sync_runs`.
    `hr_*`: PC tự kéo từ web nhân sự khi có `HR_SHARED_SECRET`. `pos_shops`: giữ của PC (mốc đồng bộ), chỉ chép cột cài đặt nếu có đổi (tổ xác nhận cột).
- **T5. Script chép** `scripts/pc/chep-bang.mjs`: `wrangler d1 export tong-hop-pos --remote --no-schema --table <bảng>` từng bảng (nhỏ, vài giây, không khoá D1 lâu như xuất cả 6 GB),
  rồi trên PC xoá bảng đó và nạp lại trong một giao dịch. Chạy thử trước một lần trên bản sao `C:\thp\node-db` và so số dòng.

## 5. Đêm chuyển (đề xuất 22:00, gián đoạn dưới 15 phút)
1. **22:00 báo** trong nhóm: web bảo trì 15 phút.
2. **Dừng ghi ở Cloudflare**: deploy Worker bản "bảo trì" (mọi lệnh ghi trả 503, đọc vẫn được) và tắt Cron. Lúc này không ai ghi thêm vào D1.
3. **Sao lưu PC** (`sao-luu.mjs --thu`, ~15 phút; chạy trước 21:45 cho kịp) và chụp nhanh file dữ liệu.
4. **Chép bảng T4** từ D1 sang PC (`chep-bang.mjs`), in số dòng hai bên, phải bằng nhau.
5. **Đồng bộ Pancake** một lượt trên PC ("Đồng bộ ngay"), kiểm mốc đồng bộ 6 POS.
6. **Đổi tên miền**: gỡ route `tonghopposmegatech.io.vn`, `www.` khỏi Worker (deploy Worker không có `routes`, vẫn giữ `workers.dev`), thêm public hostname
   cùng tên vào tunnel `thp-pc`. Kiểm `https://tonghopposmegatech.io.vn/login` từ mạng ngoài trả 200 và header có dấu máy chủ Node (`/__pc/health` chỉ gọi được từ PC).
7. **Bật gửi tin trên PC**: dán `TELEGRAM_BOT_TOKEN`, `ZALO_BOT_TOKEN` (nếu chưa), khởi động lại web PC. Webhook Telegram/Zalo/Google Sheets dùng cùng tên miền nên không phải đăng ký lại;
   kiểm một tin Telegram thử và một webhook Sheets.
8. **Kiểm cuối** (anh hoặc người được giao, 5 phút): đăng nhập bằng tài khoản thật, mở Điều hành, Sale, CSKH, Khách hàng, Giao việc; số khớp web thật lúc 21:55.
9. **Báo xong**. Ghi `C:\thp\che-do-web.txt` = `node` (đã có), canh máy và sao lưu đêm chạy như thường.

## 6. Quay lại (nếu lỗi, ~5 phút)
- Deploy lại Worker bản thường (có `routes`, có Cron), gỡ hostname khỏi tunnel. Mọi người về Cloudflare như cũ.
- Dữ liệu người dùng ghi trên PC trong lúc chạy (bảng T4) chép ngược lên D1 bằng `chep-bang.mjs --nguoc` nếu đã chạy lâu; chạy vài phút thì bỏ qua được.
- Đơn/khách: Cloudflare tự đồng bộ lại từ Pancake.

## 7. Sau khi chuyển
- 7 ngày đầu: mỗi sáng đọc log canh máy, sao lưu, tunnel; đo tốc độ thật từ điện thoại.
- B7 (sau 30 ngày ổn, anh đồng ý riêng): xoá D1, hạ gói Cloudflare Workers nếu không còn dùng.
- Rủi ro chính chuyển sang PC: mất điện (UPS chưa cắm cáp USB vào PC), mất mạng văn phòng (Cloudflare báo lỗi 502; web nhân sự, Telegram cũng không vào được web tổng),
  ổ SSD hỏng (sao lưu Drive mỗi đêm, mất tối đa 1 ngày dữ liệu tự ghi; đơn lấy lại từ Pancake). Nên: cắm cáp UPS, BIOS bật lại khi có điện, cân nhắc thêm ổ NVMe.

## 8. Cần anh
- Đồng ý kế hoạch này và chọn ngày giờ.
- Việc chỉ anh làm được: AUTH_SECRET và các khoá (mục 3), bấm Yes cài cloudflared và khởi động lại web, đăng nhập Cloudflare cho tunnel.
- Quyết: chuyển khi số lệch còn vài đơn/ngày, hay đợi tổ sửa xong đồng bộ.
