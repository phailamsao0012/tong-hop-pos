# Tên miền posmegatech.com cho web tổng

Anh Vũ 09/11/2026: chọn mua .com ("mua .com"), mua posmegatech.com ở iNET, DNS chuyển sang Cloudflare (nameserver bryce/georgia.ns.cloudflare.com), "ok plan tên miền".

Lý do đổi: đuôi `.io.vn` hay phân giải chập chờn ("tại sao link đuôi io không ổn định"). Tên miền .com ổn định hơn.
Hướng đã chốt: web chạy trên PC, đường hầm Cloudflare chỉ làm lối vào (plan `2026-11-09-bo-cloudflare`).

## 1. Bản đồ địa chỉ
| Địa chỉ | Dùng cho | Trỏ tới | Khi nào |
|---|---|---|---|
| `web.posmegatech.com` | Web tổng (bản PC) | Đường hầm `thp-pc` → `127.0.0.1:8787` | Ngay khi tên miền Active (bước 2) |
| `posmegatech.com`, `www` | Chuyển thẳng về `web.posmegatech.com` | Redirect Rule của Cloudflare | Bước 3 |
| `demo.posmegatech.com` | Bản demo, thay `demo.tonghopposmegatech.io.vn` | Worker demo | Khi tổ web tổng muốn, không gấp |
| `crm.posmegatech.com` | Web nhân sự, thay `crm.tonghopposmegatech.io.vn` | Tổ web nhân sự quyết | Hỏi tổ nhân sự qua điều phối |
| `mail`, MX, SPF, DMARC | Email @posmegatech.com (OxMail iNET) | Giữ nguyên, **DNS only** | Đã giữ |

Tên `web.` là đề xuất. Anh muốn tên khác (`app.`, `quanly.`, `tonghop.`) thì đổi trước bước 2.

## 2. Gắn web.posmegatech.com vào web PC (làm ngay)
- [x] iNET: nameserver → Cloudflare (anh làm 09/11 22:12).
- [x] PC: đường hầm `thp-pc` nhận thêm `web.posmegatech.com` (config.yml), đã kiểm hợp lệ và khởi động lại.
- [ ] Cloudflare → DNS: CNAME `web` → `5fa3f45e-5804-46e4-8455-6a6b9f542f20.cfargotunnel.com`, Proxied. **Anh thêm**, vì lớp an toàn trên máy chặn Claude sửa DNS.
- [ ] Chờ Cloudflare báo **Active**.
- [ ] Claude kiểm:
  - `https://web.posmegatech.com` mở trang đăng nhập;
  - đăng nhập được, cookie phiên đúng tên miền;
  - mở 5 trang chính;
  - thử từ 4G (không cùng mạng văn phòng).
- Xong khi: anh mở được từ điện thoại 4G.

## 3. Cài đặt Cloudflare cho tên miền (làm cùng bước 2)
| Cài đặt | Giá trị | Vì sao |
|---|---|---|
| SSL/TLS | Full | Đường hầm đã mã hoá. Không cần chứng chỉ ở PC |
| Always Use HTTPS | Bật | Không cho vào bằng http |
| AI Crawl Control / Bot | Chặn hết (Search, Training, Agents) | Web nội bộ, không cho lên Google hay AI |
| Redirect Rule | `posmegatech.com/*` và `www.posmegatech.com/*` → `https://web.posmegatech.com/$1` (301) | Gõ tên miền trần cũng vào đúng |
| (Tuỳ chọn) WAF | Chặn truy cập ngoài Việt Nam, trừ IP anh cho phép khi đi công tác | Giảm dò quét |

Các mục này anh bấm trong Cloudflare (Claude không có quyền sửa DNS/cài đặt tên miền). Claude soạn sẵn từng bước kèm ảnh nếu anh cần.

## 4. Những thứ phải đổi theo tên miền mới (ngày chuyển hẳn về PC)
Làm trong kịch bản ngày chuyển (`2026-11-09-bo-cloudflare`, bước 4). Không làm trước, vì web chính hiện vẫn ở Cloudflare.
- **Google đăng nhập (OAuth):** thêm `https://web.posmegatech.com` vào Authorized origins / redirect URIs trong Google Cloud Console.
- **Webhook:** Telegram (`setWebhook`), Zalo, Google Sheet (Apps Script gọi về web), tuyển dụng: đổi sang địa chỉ mới.
- **App iOS:** đổi địa chỉ máy chủ sang `https://web.posmegatech.com`, build lại (tổ app iOS).
- **Web nhân sự:** biến `CRM_URL` / đường gọi qua lại giữa hai web (tổ nhân sự).
- **Thư OTP (Brevo):** đường link trong thư trỏ địa chỉ mới.
- **Người dùng:** cookie đăng nhập gắn theo tên miền, nên mọi người phải đăng nhập lại một lần ở địa chỉ mới. Báo trước 1 ngày.

## 5. Địa chỉ cũ .io.vn
- Trong 30 ngày sau ngày chuyển: `tonghopposmegatech.io.vn` tự chuyển sang `https://web.posmegatech.com`, giữ đường dẫn. Dùng Redirect Rule trên zone .io.vn, hoặc Worker cũ trả 301.
- `pc.tonghopposmegatech.io.vn`: giữ tới ngày chuyển rồi bỏ.
- Sau 30 ngày: có thể bỏ hẳn .io.vn.

## 6. Rủi ro và đường lui
- **Tên miền chưa Active / DNS chưa lan:** vẫn dùng `pc.tonghopposmegatech.io.vn` như hiện nay, không mất gì.
- **Hỏng email:** đã giữ MX/SPF/DMARC và `mail` ở chế độ DNS only. Nếu email lỗi thì kiểm 4 dòng này đầu tiên.
- **Đổi ý tên miền:** chỉ cần sửa 1 dòng CNAME và 1 dòng trong `config.yml`.
- **Hết hạn tên miền:** 09/11/2027. Bật tự gia hạn ở iNET, hoặc nhắc gia hạn trước 30 ngày.
