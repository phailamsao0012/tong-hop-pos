# Bỏ hẳn Cloudflare, chạy web tổng trên PC + chấm dứt lỗi 500

Anh Vũ 09/11/2026: "t muốn triệt để bỏ cloudflare, chạy trên máy tính, lên plan làm quy trình chuyển giao từ cloud sang pc đi,
và hãy cho t một phương án để đảm bảo rằng lỗi 500 sẽ không xuất hiện nữa. nên t cần biết chi tiết nguyên nhân, nhiều hơn 1 phương án giải quyết".

Plan này thay cho bước B6 trong `docs/plans/2026-11-04-b6-chuyen-ten-mien/plan.md` (B6 cũ vẫn dùng Cloudflare Tunnel và DNS).
Nó dựa trên những gì đã có trên PC: bản Node (`pc/`), dữ liệu thật (`C:\thp\db\thp.sqlite`), sao lưu lên Drive, canh máy, chạy song song.

---

## Phần 1. Nguyên nhân chi tiết của lỗi 500 (số đo thật 02–09/11/2026)

Mọi số dưới đây đo bằng lệnh chỉ đọc: `wrangler tail`, `wrangler d1 insights`, `wrangler d1 info`.

### 1.1 Lỗi người dùng nhìn thấy
| Đo lúc (giờ VN) | Lượt request | Lỗi | Nội dung lỗi |
|---|---|---|---|
| 09/11, trưa (10 phút) | 119 | 36 (30%) | `D1 DB is overloaded. Too many resources consumed within a 10 second window` / `Requests queued for too long` |
| 09/11 14:42 (2,5 phút) | 51 | 17 (33%) | như trên. Có cả `/api/config`, `/api/teams`, kiểm phiên đăng nhập (503) |
| 09/11 15:15, sau bản vá nóng (3 phút) | 18 | 1 | `/api/reports/overview` 6,3 giây rồi D1 quá tải |

Tức là không phải code sai. Lỗi đến từ cơ sở dữ liệu D1 của Cloudflare từ chối phục vụ.

### 1.2 Vì sao D1 từ chối
1. **D1 là một file SQLite chạy trên đúng một máy của Cloudflare, xử lý từng câu một (tuần tự).**
   Mỗi database có hạn mức tài nguyên trong mỗi cửa sổ 10 giây. Vượt hạn mức thì D1 từ chối tất cả câu trong cửa sổ đó, kể cả câu rất nhẹ như kiểm phiên đăng nhập.
   Vì vậy chỉ cần một câu nặng là cả trang lỗi: menu, đăng nhập, đồng bộ đều 500/503 theo.
2. **Có vài câu quá nặng so với hạn mức đó** (insights 1 giờ, 09/11):
   | Câu | Lượt/giờ | Thời gian TB | Dòng đọc mỗi lần | Tổng/giờ |
   |---|---|---|---|---|
   | `WITH segment_orders …`: Tổng quan / Sale / CSKH lọc theo nhóm sản phẩm, tính thẳng từ bảng đơn gốc | 282 | 567 ms (có lúc 5–6 s) | ~95.000 | 160 s |
   | Đầu trang Cuộc gọi: đếm khách + ghi chú | 20 | 1.960 ms | 1.221.664 | 39 s |
   | Danh sách marketer: `DISTINCT marketer_id` quét cả bảng đơn | 24 | 1.003 ms | 383.808 | 24 s |
   | Đếm khách chốt `COUNT(DISTINCT phone)` | 139 | 69 ms | 17.711 | 10 s |
   Một người mở Tổng quan có lọc nhóm sản phẩm là 4–5 câu `segment_orders` chạy cùng lúc (mỗi nhóm 1 câu). Chừng 3 người mở cùng lúc là đủ vượt hạn mức 10 giây.
3. **Cache báo cáo bị xoá rất thường xuyên.** Khóa cache gắn với "phiên bản dữ liệu", mà phiên bản đổi sau mỗi lượt đồng bộ Pancake có đơn mới (5 phút/lần).
   Thêm nữa, cache của Cloudflare tách theo từng trạm và từng isolate, nên người ở trạm khác vẫn bắt D1 tính lại.
4. **Đồng bộ Pancake ghi vào cùng database đó, cùng lúc người đang xem.** Ghi và đọc tranh nhau một hàng đợi duy nhất, ghi lô lớn là đọc phải chờ ("Requests queued for too long").
5. **Database đã to: 6,37 GB, giới hạn của D1 là 10 GB.** Chiếm phần lớn là bảng đơn, dòng hàng và ghi chú cuộc gọi. Bảng càng to, câu quét càng chậm. Chạm 10 GB là web dừng ghi.
6. **Thao tác xuất (export) D1 khoá cả database.** 09/11 lúc 09:02–09:13 có một lượt export, trong 11 phút đó mọi câu phải chờ.
7. **Đẩy code lên là xoá trạng thái.** Mỗi lần deploy là isolate mới, cache trong bộ nhớ mất hết, vài phút đầu sau deploy D1 bị dồn.
8. Lỗi khác đã gặp, không phải nguyên nhân chính hiện nay:
   - `SQLITE_TOOBIG`: tổ đã sửa ở #138.
   - Treo request do bản vá nóng đầu tiên lúc 15:05 ngày 09/11: đã gỡ sau 10 phút.

### 1.3 Đã làm hôm nay (giảm, chưa hết)
- Bật `THP_SWR=1`: trả bản vừa tính gần nhất, tính lại ngầm.
- Bản vá nóng 97bd318d (nhánh `hotfix/giam-tai-d1`):
  - cache báo cáo 15 phút theo phiên bản dữ liệu
  - tắt làm nóng báo cáo ở cron
  - nhớ danh sách marketer và đầu trang Cuộc gọi 10 phút
- Kết quả: lỗi từ khoảng 30% xuống khoảng 5%. Còn lỗi ở các câu `segment_orders` chưa có trong cache.

**Kết luận:** lỗi 500 hiện nay do D1 có trần cứng cho mỗi database (xử lý tuần tự, hạn mức 10 giây, tối đa 10 GB) cộng với vài câu tính thẳng từ bảng gốc quá nặng.
Muốn hết hẳn phải bỏ một trong hai: hoặc bỏ trần (rời D1), hoặc bỏ câu nặng (tính sẵn). Làm cả hai là chắc nhất.

---

## Phần 2. Các phương án để không còn lỗi 500

### Phương án A: Chuyển hẳn về PC (Node + SQLite trên máy). Đề xuất chọn.
- **Vì sao hết lỗi:**
  - Trên PC, SQLite chạy chế độ WAL: nhiều luồng đọc song song, một luồng ghi không chặn đọc.
  - Không có hạn mức 10 giây, không có trần 10 GB (ổ PC còn hàng trăm GB).
  - Đã đo trên PC ngày 04/11: 80 request/giây, 0 lỗi, với cùng dữ liệu thật.
  - Cache báo cáo nằm trong một tiến trình duy nhất nên trúng cache cho mọi người, không tách theo trạm như Cloudflare.
- **Rủi ro mới:**
  - Mất điện hoặc mất mạng ở văn phòng là web tắt.
  - Ổ cứng hỏng.
  - Chỉ có một máy.
  - Xem cách chặn ở Phần 4.
- **Chi phí:** không tốn tiền Cloudflare (hiện ước ~71 USD/tháng, đọc 64,6 tỷ dòng). Tốn thêm 1 VPS nhỏ (xem B2) và UPS.

### Phương án B: Ở lại Cloudflare nhưng sửa tận gốc
1. Bảng tính sẵn cho thống kê theo nhóm sản phẩm (`stats_daily_segment`), cập nhật khi đồng bộ. Tổng quan đọc bảng này, không quét bảng đơn.
2. Bảng đếm sẵn cho đầu trang Cuộc gọi và danh sách marketer.
3. Tách database: đơn cũ hơn 6 tháng sang database D1 thứ hai, chỉ dùng khi xem "Từ đầu".
4. Bật D1 read replication (Sessions API) để đọc chia ra nhiều bản sao.
5. Cấm export D1 trong giờ làm việc.
- **Hạn chế:**
  - Vẫn còn trần 10 GB và hạn mức 10 giây. Dữ liệu tăng lên thì sẽ lại chạm.
  - Chi phí đọc dòng vẫn tính tiền.
  - Mỗi báo cáo mới tổ thêm vào đều có thể lại là một câu nặng.

### Phương án C: Kết hợp, PC tính và Cloudflare chỉ làm lớp đón khách
Web và dữ liệu chạy ở PC, Cloudflare chỉ còn Tunnel/DNS. Đây chính là bản song song đang chạy (`pc.tonghopposmegatech.io.vn`).
- **Hạn chế:** chưa phải "bỏ triệt để" như anh muốn, và còn dính đuôi .io.vn qua DNS Cloudflare.

### Bắt buộc dù chọn phương án nào: "không bao giờ trả 500 cho báo cáo"
1. **Tính sẵn:** mọi số trên Tổng quan, Sale, CSKH, MKT, Cuộc gọi lấy từ bảng tính sẵn (`stats_daily*` thêm cột nhóm sản phẩm). Không còn câu quét bảng đơn gốc khi người xem mở trang.
2. **Luôn có bản dự phòng:** mỗi báo cáo lưu bản tốt gần nhất, cả trên đĩa. Tính lỗi thì trả bản đó kèm dòng "số lúc HH:MM", không trả 500.
3. **Giới hạn thời gian câu (timeout 3 giây) + ngắt mạch:** câu quá chậm thì dừng và trả bản dự phòng, không kéo cả trang theo.
4. **Kiểm phiên đăng nhập không đụng database mỗi lần:** nhớ phiên trong bộ nhớ 60 giây.
5. **Tiêu chí nghiệm thu:**
   - Test tải 30 người mở cùng lúc các trang nặng trong 30 phút: 0 lỗi 5xx.
   - Canh máy 7 ngày: tỉ lệ 5xx dưới 0,1%.
   - Lỗi nào cũng có cảnh báo Telegram trong 5 phút.

---

## Phần 3. Đưa web ra Internet khi không còn Cloudflare (3 cách)

| Cách | Làm gì | Ưu | Nhược | Chi phí |
|---|---|---|---|---|
| **B1. IP tĩnh + mở cổng** | Xin nhà mạng IP tĩnh, mở cổng 443 trên modem vào PC. Caddy trên PC tự lấy chứng chỉ HTTPS Let's Encrypt. Bản ghi DNS A trỏ thẳng IP | Đơn giản, không qua bên thứ ba | PC lộ trực tiếp ra Internet (bị dò quét, DDoS). Nhà mạng hay dùng CGNAT. Đổi IP là web mất | ~100–300k/tháng tiền IP tĩnh |
| **B2. VPS Việt Nam làm cổng (đề xuất)** | Thuê 1 VPS nhỏ có IP tĩnh. VPS chạy Caddy (HTTPS) và nối về PC bằng WireGuard (đường hầm mã hoá, PC chủ động gọi ra, không mở cổng nhà). DNS trỏ IP VPS | PC không lộ. IP ổn định. VPS ở VN nên nhanh. Không phụ thuộc modem. Dễ thêm trang "đang bảo trì" khi PC tắt | Thêm 1 máy phải trông (nhỏ, chỉ chuyển tiếp) | ~100–250k/tháng |
| **B3. Dịch vụ đường hầm khác** (Tailscale Funnel, ngrok trả phí) | Cài app trên PC, dịch vụ cấp địa chỉ HTTPS | Nhanh nhất | Lại phụ thuộc một bên ngoài như Cloudflare. Gói có tên miền riêng tốn phí theo USD | 8–20 USD/tháng |

**Tên miền:** `tonghopposmegatech.io.vn` đang dùng nameserver của Cloudflare. Bỏ Cloudflare thì phải chuyển DNS về nhà đăng ký .io.vn, hoặc sang DNS của nhà cung cấp VPS.
Đuôi .io.vn là tên miền miễn phí/giá rẻ, hay chập chờn phân giải. Đề xuất mua thêm tên miền `.vn` hoặc `.com`, khoảng 300–800k/năm, rồi chuyển hẳn sang.

---

## Phần 4. Làm PC đủ chắc để thay Cloudflare
| Rủi ro | Cách chặn | Đã có chưa |
|---|---|---|
| Mất điện | UPS ≥ 1000VA (30–60 phút). Bật BIOS "Restore on AC power loss". Task "THP Web" tự chạy khi khởi động máy | Task tự chạy: có. UPS và BIOS: chưa |
| Mất mạng | Dùng 2 đường mạng (cáp + 4G dự phòng qua router dual-WAN). Khi PC mất kết nối, VPS (B2) hiện trang "đang bảo trì", không trả 500 | Chưa |
| Ổ hỏng / mất dữ liệu | Sao lưu đêm lên Google Drive (đã chạy 02:30). Thêm 1 lần sao lưu mỗi giờ ra ổ thứ hai. Thử khôi phục mỗi tháng | Đêm: có. Hằng giờ và thử khôi phục: chưa |
| Windows Update tự khởi động lại | Đặt giờ cập nhật 2–4h sáng. Web tự chạy lại nhờ task | Một phần |
| Web treo / sập | Canh máy 5 phút/lần (có), báo Telegram (có). Thêm tự khởi động lại khi `/__pc/health` hỏng 2 lần liên tiếp | Một phần |
| Một máy duy nhất | Mac làm máy dự phòng nóng: chép DB mỗi giờ. PC chết thì đổi WireGuard trên VPS sang Mac trong 10 phút | Chưa |

---

## Phần 5. Danh mục những gì đang dùng Cloudflare và thứ thay thế
| Đang dùng | Thay bằng | Trạng thái |
|---|---|---|
| Workers (chạy code) | Node 24 `dist/pc/server.js` | Xong, đang chạy song song |
| D1 (database) | SQLite `C:\thp\db\thp.sqlite`, WAL, nhiều luồng đọc | Xong |
| Durable Object `SyncScheduler` (hẹn giờ đồng bộ) | `pc/durable.ts` trong cùng tiến trình | Xong |
| Cache API | `pc/cache.ts` | Xong |
| Cron mỗi phút | `THP_CRON=1` trong server Node (task THP Cron đang tắt vì đã gộp) | Xong, đang chạy (chế độ chỉ xem) |
| Workers AI (`AI`: tóm tắt sáng, nhận xét xu hướng) | Gọi API ngoài (Claude / OpenAI) có khoá, hoặc tắt tính năng | Chưa, cần anh chọn |
| Rate limit `SEARCH_LIMIT` | Bộ đếm trong bộ nhớ của Node | Cần kiểm tra bản Node |
| Service binding `HR` → `megatech-crm` (web nhân sự, cũng trên Cloudflare) | Gọi HTTP qua `CRM_URL` + `HR_SHARED_SECRET` | Cần tổ web nhân sự phối hợp. Web nhân sự có bỏ Cloudflare không là việc riêng |
| R2 sao lưu đêm | rclone → Google Drive | Xong trên PC |
| Custom domain + DNS + Tunnel | Phần 3 (B2 đề xuất) | Chưa |
| Secret `AUTH_SECRET` | Phải dùng đúng khoá của web thật. Không thì 11 tài khoản phải đặt lại mật khẩu và bật lại xác thực 2 lớp | **Chặn chính**, xem bước 1 |
| Webhook Telegram / Zalo / Google Sheet / tuyển dụng | Đăng ký lại sang địa chỉ mới | Làm lúc chuyển |
| Google đăng nhập (OAuth) | Thêm địa chỉ mới vào Google Cloud Console | Làm lúc chuyển |
| App iOS | Đổi địa chỉ máy chủ, build lại | Làm lúc chuyển |
| Brevo (gửi thư OTP) | Giữ nguyên (không phải Cloudflare) | Có |

---

## Phần 6. Quy trình chuyển giao (từng bước)

Quy ước: mọi bước làm thử trên demo/bản song song trước. Bước nào ghi dữ liệu thật thì sao lưu trước và cần anh đồng ý đúng thao tác.

### Bước 0. Chuẩn bị (1–2 ngày, không ảnh hưởng web thật)
- [ ] Anh chọn: phương án A; cách đưa ra Internet B1, B2 hay B3; giữ .io.vn hay mua tên miền mới; Workers AI thay bằng gì hay tắt.
- [ ] Mua UPS, bật "Restore on AC power loss", đặt giờ Windows Update.
- [ ] (B2) Thuê VPS, cài Caddy + WireGuard, nối về PC, thử bằng một tên miền phụ.
- **Xong khi:** gõ địa chỉ thử từ 4G (không cùng mạng văn phòng) thấy trang đăng nhập bản PC, không qua Cloudflare.

### Bước 1. Gỡ chặn đăng nhập: AUTH_SECRET
- Cách 1: lấy đúng khoá AUTH_SECRET đang dùng trên Cloudflare. Khoá nằm ở máy Mac hoặc nơi lần đầu tạo; Cloudflare không cho đọc lại. Anh dán vào `C:\thp\bi-mat\.dev.vars` trên PC, không dán vào chat.
- Cách 2: không tìm được khoá thì lúc chuyển đặt khoá mới. 11 tài khoản đặt lại mật khẩu, người có xác thực 2 lớp quét lại mã. Tôi soạn sẵn danh sách và cách báo từng người.
- **Xong khi:** đăng nhập bản PC bằng mật khẩu của web thật được.

### Bước 2. Sửa câu nặng (tổ web tổng, chạy trên cả Cloudflare lẫn PC)
- [ ] Gộp nhánh `hotfix/giam-tai-d1` vào main.
- [ ] Bảng tính sẵn theo nhóm sản phẩm, đầu trang Cuộc gọi, danh sách marketer (Phần 2, mục 1).
- [ ] Bản dự phòng báo cáo, timeout 3 giây, nhớ phiên 60 giây (Phần 2, mục 2–4).
- **Xong khi:** test tải đạt tiêu chí Phần 2, chạy trên PC.
- Lợi thêm: web Cloudflare cũng đỡ lỗi ngay trong lúc chờ chuyển.

### Bước 3. Chạy thử toàn phần trên PC (3–7 ngày)
- [ ] Bản PC tắt chế độ chỉ xem, nhưng chỉ trên một bản sao DB thử: thử ghi (giao việc, KPI, tài khoản) không đụng web thật.
- [ ] Bật Zalo/Telegram ở chế độ thử (nhóm test), xác nhận không gửi trùng.
- [ ] So số PC và web thật mỗi sáng (task THP So so). Lệch phải giải thích được.
- **Xong khi:** 7 ngày liền 0 lỗi 5xx, số khớp.

### Bước 4. Ngày chuyển (ngoài giờ, ví dụ 22:00, dự kiến 60–90 phút, web dừng ghi khoảng 30 phút)
1. Báo nhân viên trước 1 ngày.
2. 22:00: web Cloudflare bật chế độ chỉ xem (đặt `THP_READ_ONLY=1` trên Cloudflare), chặn ghi.
3. Kéo bản cuối các bảng ghi tay từ D1 về PC (`chep-bang.mjs`, chạy được trong vài phút). Đơn Pancake thì PC tự đồng bộ.
4. Sao lưu: file DB PC + bản export D1 (export lúc này không ai dùng nên khoá không ảnh hưởng).
5. Tắt chế độ chỉ xem trên PC (`THP_READ_ONLY` bỏ), bật cron đầy đủ (Zalo, Telegram, AI, sao lưu).
6. Đổi DNS tên miền sang VPS (B2) hoặc IP (B1). Hạ TTL xuống 5 phút từ trước 1 ngày.
7. Đăng ký lại webhook Telegram, Zalo, Google Sheet, tuyển dụng sang địa chỉ mới. Cập nhật OAuth Google.
8. Kiểm nhanh: đăng nhập 3 vai trò, mở 10 trang chính, 1 thao tác ghi, Telegram nhận tin, đơn mới về trong 5 phút.
9. Tắt cron của Worker Cloudflare (bỏ trigger). Worker để lại chỉ xem 7 ngày làm đường lui.
- **Xong khi:** các mục ở bước 8 đều được.

### Bước 5. Sau chuyển (7–30 ngày)
- Ngày 1–7: theo dõi canh máy và log lỗi mỗi ngày, báo anh.
- Sau 7 ngày ổn: xoá cron, Worker, D1 trên Cloudflare (đã sao lưu). Cloudflare không còn gì.
- Build lại app iOS trỏ địa chỉ mới.

### Đường lui (bất kỳ lúc nào trong 7 ngày đầu)
- Đổi DNS về Cloudflare (Worker vẫn còn).
- Dữ liệu ghi trên PC sau giờ chuyển được chép ngược lên D1 bằng `chep-bang.mjs` chạy chiều ngược lại. Script này sẽ viết và thử trong bước 3.
- Mất khoảng 15–30 phút.

---

## Phần 7. Việc anh cần quyết
1. Phương án: A (bỏ Cloudflare, đề xuất), B (ở lại và sửa gốc) hay C (kết hợp).
2. Đưa web ra Internet: B1 IP tĩnh, B2 VPS (đề xuất) hay B3 dịch vụ đường hầm.
3. Tên miền: giữ `.io.vn` hay mua `.vn` / `.com` mới (đề xuất mua).
4. AUTH_SECRET: tìm khoá cũ (cách 1) hay đặt lại cho 11 tài khoản lúc chuyển (cách 2).
5. Tóm tắt AI hằng ngày: thay bằng API khác hay tắt.
6. Mua UPS cho PC.
