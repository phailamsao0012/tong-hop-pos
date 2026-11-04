# Chạy web tổng trên PC song song với Cloudflare (04/11/2026)

Anh Vũ 04/11: "kế hoạch để lên pc chạy song song". Không tắt Cloudflare. PC mở cho mọi người bằng một địa chỉ riêng,
chạy cùng dữ liệu thật, để dùng thử và so số cho tới khi anh thấy ổn rồi mới đổi tên miền (B6, plan
`docs/plans/2026-11-04-b6-chuyen-ten-mien/plan.md` trên nhánh claude/plan-chuyen-pc).

## Hình dung
| | Web chính (Cloudflare) | Web PC (song song) |
|---|---|---|
| Địa chỉ | tonghopposmegatech.io.vn | pc.tonghopposmegatech.io.vn (Cloudflare Tunnel, miễn phí, không mở cổng modem) |
| Đơn, khách, ghi chú | Pancake | Pancake mỗi 5 phút (đã chạy từ 02/11, chỉ đọc) |
| Tài khoản, cài đặt, team, mục tiêu, chi phí MKT | nơi ghi duy nhất | chép từ web chính mỗi giờ |
| Ghi (sửa cài đặt, giao việc, chia số...) | được | chặn, báo "Sửa ở web chính" |
| Telegram, Zalo, báo cáo 8h | gửi | tắt (tránh tin trùng) |

Một nơi ghi duy nhất nên hai bên không bao giờ lệch dữ liệu người dùng; đổi B6 sau này chỉ là đổi hướng tên miền.

## Bước
1. **PC chạy code main mới nhất** (#125). Cần anh bấm Yes một lần ở PC để khởi động lại web.
   Kèm cơ chế khởi động lại không cần quyền quản trị (web tự thoát khi thấy file cờ, Task Scheduler bật lại), để lần sau khỏi nhờ anh.
2. **Chế độ song song trong code** (Tổ web tổng viết, có test): biến `THP_MIRROR=1` trên PC.
   - Mọi API ghi trả 503 "Web PC chỉ để xem, sửa ở web chính", trừ đăng nhập/đăng xuất.
   - Không gửi Telegram/Zalo, không chạy chia số, không nhận webhook Google Sheets.
   - Thanh trên cùng có nhãn nhỏ "Bản PC" để không nhầm.
3. **Chép dữ liệu người dùng mỗi giờ** (`scripts/pc/chep-bang.mjs`, chạy trên PC): xuất từng bảng nhỏ ở D1
   (users, user_mfa, passkeys, app_settings, targets, staff_settings, report_presets, ad_costs, sheet_*, zalo_* ...; danh sách như mục T4 của plan B6, trừ sessions)
   rồi nạp vào PC trong một giao dịch. Ước chi phí D1: vài chục nghìn dòng đọc/giờ, dưới 1 triệu dòng/ngày (gói có 25 tỷ/tháng), coi như 0 đồng.
4. **Tunnel** `thp-pc` → `http://127.0.0.1:8787`, tên `pc.tonghopposmegatech.io.vn`. Cần anh ở PC: bấm Yes cài cloudflared và đăng nhập Cloudflare một lần (bấm Allow).
5. **Mật khẩu**: muốn đăng nhập PC bằng mật khẩu cũ thì PC cần AUTH_SECRET giống web chính (anh dán ở PC, không qua chat).
   Không có thì bước 3 vẫn chép tài khoản nhưng mật khẩu không dùng được; khi đó chỉ anh và vài người thử đặt mật khẩu riêng trên PC.
6. **Chạy song song 7 ngày**: mỗi sáng PC tự so số từng POS hôm qua với web chính (`so-so-ngay.mjs`) và đo tốc độ, gửi anh một tin tóm tắt.
   Anh và vài trưởng nhóm dùng thử link PC trên điện thoại.

## Xong khi
- 7 ngày số PC khớp web chính (hoặc anh chấp nhận lệch đã biết), trang nặng nhất dưới 2 s, PC không sập.
- Sau đó anh quyết B6 (đổi tên miền chính sang PC) theo plan B6; web Cloudflare giữ 30 ngày để quay lại.

## Cần anh
- "ok song song" để Tổ web tổng viết bước 2–3 và phiên PC làm bước 1, 4, 6.
- Ở PC (một lần): bấm Yes khởi động lại web, bấm Yes cài cloudflared + đăng nhập Cloudflare, dán AUTH_SECRET nếu anh còn giữ.
