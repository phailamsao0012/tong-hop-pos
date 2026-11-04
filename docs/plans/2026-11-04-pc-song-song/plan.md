# Mở web tổng trên PC chạy song song với web Cloudflare (04/11/2026)

Anh Vũ 04/11: "kế hoạch để lên pc chạy song song mà". Khác B6 (`docs/plans/2026-11-04-b6-chuyen-ten-mien/plan.md`): tên miền chính vẫn ở Cloudflare,
PC mở thêm ở một địa chỉ riêng để mọi người dùng song song, so tốc độ và số, chưa phải chuyển hẳn.

## 1. Mục tiêu
- `pc.tonghopposmegatech.io.vn` mở được từ mọi nơi (điện thoại, máy văn phòng), do web Node trên PC trả lời qua Cloudflare Tunnel.
- Xem báo cáo nhanh (đã đo: 80 req/s ~690 người 0 lỗi, Xu hướng 0,3 s) trong lúc web chính vẫn ở Cloudflare.
- Không có tin Telegram/Zalo trùng, không có dữ liệu ghi ở hai nơi bị lệch nhau.

## 2. Nguyên tắc: PC là bản "chỉ xem"
Nếu cho ghi ở cả hai nơi (giao việc, ghi nguyên nhân, mục tiêu, cài đặt, tài khoản...) thì hai bên lệch nhau, không gộp lại được. Vì vậy trong thời gian song song:
- **Ghi chỉ ở Cloudflare** (web chính). Trên PC, mọi lệnh ghi trả "Bản PC chỉ để xem, vào tonghopposmegatech.io.vn để sửa", trừ đăng nhập/đăng xuất.
- **PC tự đồng bộ Pancake** như hiện nay (đơn, khách, ghi chú, sản phẩm), nên số báo cáo mới như web chính (lệch vài phút).
- **PC chép bảng người dùng ghi từ Cloudflare mỗi 10 phút** (tài khoản, cài đặt, mục tiêu, giao việc, Zalo, nguyên nhân...; danh sách ở plan B6 mục T4),
  nên đăng nhập, phân quyền, mục tiêu, team trên PC giống web chính.
- **PC không gửi tin**: không có khoá Telegram/Zalo/Brevo trên PC (như hiện nay).

## 3. Cần làm
| # | Việc | Ai | Ghi chú |
|---|---|---|---|
| 1 | Chế độ chỉ xem: biến `THP_READ_ONLY=1` trong `worker.ts` chặn POST/PUT/PATCH/DELETE ngoài `/api/auth/*` | Tổ web tổng (PR vào main) | một chỗ trong worker.ts, có test; web Cloudflare không đặt biến nên không đổi |
| 2 | `scripts/pc/chep-bang.mjs`: chép các bảng người dùng ghi từ D1 sang PC (`wrangler d1 export --table`, chỉ đọc D1), task mỗi 10 phút | PC (tôi) | chỉ đọc web thật; mỗi lượt vài nghìn dòng |
| 3 | Cập nhật PC lên main mới nhất (có việc 1), đặt `THP_READ_ONLY=1`, khởi động lại | PC (tôi) + anh bấm Yes | |
| 4 | Cài cloudflared, tạo tunnel `thp-pc` → `http://127.0.0.1:8787`, hostname `pc.tonghopposmegatech.io.vn` | PC (tôi) + anh bấm Yes, đăng nhập Cloudflare 1 lần | không mở cổng modem; chạy thành dịch vụ Windows |
| 5 | AUTH_SECRET thật trên PC | Anh | thiếu thì mật khẩu thật không vào được bản PC (việc 2 chép cả bảng tài khoản, nhưng mật khẩu băm cần đúng AUTH_SECRET) |
| 6 | Kiểm: đăng nhập bằng tài khoản thật trên `pc.`, mở mọi trang, thử bấm lưu thấy báo "chỉ để xem", so số với web chính | Tôi + anh | |

Không cần đổi gì trên web Cloudflare, không gián đoạn web chính.

## 4. Lưu ý
- Đăng nhập Google: nút Google chỉ chạy ở tên miền chính (Google chỉ cho địa chỉ đã khai). Trên `pc.` đăng nhập bằng email/mật khẩu.
- Cookie đăng nhập theo từng tên miền: đăng nhập `pc.` riêng một lần.
- PC mất điện/mất mạng thì `pc.` không vào được; web chính không bị gì.
- Sau khi chạy song song ổn và số khớp, bước tiếp là B6 (tên miền chính sang PC): đã có sẵn việc 1, 2, 4 nên đêm chuyển nhanh hơn.

## 5. Quay lại
Tắt hostname `pc.` trên tunnel (1 lệnh). Web chính không liên quan.
