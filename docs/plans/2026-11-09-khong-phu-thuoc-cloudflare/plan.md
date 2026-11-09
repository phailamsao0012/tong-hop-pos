# Web vẫn chạy khi tài khoản Cloudflare bị khoá

Anh Vũ 09/11/2026: "giờ làm sao để khi cloudflare khóa tk thì web vẫn chạy".

## Vì sao hiện chưa được
Web, dữ liệu và đồng bộ đã chạy trên PC. Nhưng cả hai lối vào đều thuộc tài khoản Cloudflare:
- DNS của `posmegatech.com` (nameserver bryce/georgia.ns.cloudflare.com);
- đường hầm `thp-pc`.

Tài khoản bị khoá thì PC vẫn chạy, nhưng không ai từ ngoài vào được.

## Cách làm: lối vào thứ hai hoàn toàn không dính Cloudflare
```
Người dùng ──> posmegatech.com (DNS ở iNET) ──> VPS iNET (IP tĩnh, Caddy https)
                                                   │  đường hầm SSH ngược, PC tự gọi ra
                                                   ▼
                                            PC: web Node 127.0.0.1:8787
Dự phòng thêm: pc.tonghopposmegatech.io.vn ──> Cloudflare Tunnel thp-pc ──> cùng web PC
```
Hai đường độc lập. Cloudflare chết hay khoá thì `posmegatech.com` vẫn chạy. VPS hỏng thì vẫn còn đường Cloudflare.

## Các bước
| # | Việc | Ai | Ghi chú |
|---|---|---|---|
| 1 | Mua iNET **Cloud Server** gói nhỏ nhất: 1 CPU, 1–2 GB RAM, Ubuntu 24.04, Hà Nội | Anh | Mua online, có ngay, khoảng 100–250k/tháng |
| 2 | Lúc tạo VPS, dán **khoá SSH công khai** Claude gửi vào ô SSH key | Anh | Claude tạo khoá trong `C:\thp\bi-mat\vps\`. Khoá riêng không bao giờ ra khỏi PC. Không gửi mật khẩu root qua chat |
| 3 | VPS: cập nhật, tường lửa (chỉ mở 22, 80, 443), tắt đăng nhập SSH bằng mật khẩu, cài Caddy (tự lấy chứng chỉ https Let's Encrypt), proxy `posmegatech.com` + `www` → cổng đường hầm | Claude | Từ PC qua SSH |
| 4 | PC: task "THP Duong ham VPS" chạy `ssh -N -R 127.0.0.1:18787:127.0.0.1:8787 thp@<IP VPS>` | Claude | Dùng OpenSSH có sẵn trên Windows, không cần quyền admin. Tự nối lại sau 10 giây nếu đứt, chạy khi máy khởi động |
| 5 | Đổi nameserver `posmegatech.com` ở iNET **về lại** DNS iNET (OneShield). Tạo bản ghi A `@` và `www` → IP VPS. Giữ MX/SPF/DMARC/mail của OxMail | Anh (Claude chỉ từng bước) | Tên miền mua ở iNET nên Cloudflare không giữ được |
| 6 | Kiểm từ 4G: https, đăng nhập, chế độ chỉ xem chặn sửa. Thử tắt đường hầm Cloudflare: posmegatech.com vẫn chạy | Claude | |
| 7 | Ghi `pc.tonghopposmegatech.io.vn` là đường dự phòng thứ hai | | |

## Bảo mật
- VPS chỉ chuyển tiếp, không chứa dữ liệu. Đường hầm SSH mã hoá. PC không mở cổng nào ra Internet.
- SSH vào VPS chỉ bằng khoá. Tắt mật khẩu và root login sau khi cài xong.
- Có thể thêm: chặn truy cập ngoài Việt Nam ở Caddy, giới hạn tốc độ đăng nhập.

## Quay lại
- Đổi nameserver `posmegatech.com` về Cloudflare (bryce/georgia).
- Tắt task "THP Duong ham VPS".
- Huỷ VPS.
