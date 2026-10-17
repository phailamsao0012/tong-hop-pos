# Phân tích mỗi sáng trên PC

Chưa chạy được từ PC: worker.ts yêu cầu phiên đăng nhập trước các route AI. Cần bước tích hợp được duyệt cho worker.ts và màn Cài đặt để gắn DevicePairPanel; hai file ngoài phạm vi D2 được sửa.

Node >=22.13, không thư viện ngoài. Thread PC chuẩn bị hai executable runner tk1/tk2, nhận nguyên tham số Codex CLI, có đăng nhập riêng. Không dò hồ sơ tài khoản. Cấu hình runner hiện có không nằm trong repo nên chưa tự nối được. Không dùng .cmd qua shell.

```powershell
node scripts/codex-daily/run.mjs --dry-run --pack <goi-ao.json>
node scripts/codex-daily/run.mjs --url https://<demo-host> --pair
node scripts/codex-daily/run.mjs --url https://<demo-host> --tk1 <runner1.exe> --tk2 <runner2.exe>
```

Khóa 32 byte tự sinh ở C:\thp-ai\token, chỉ gửi hash khi ghép. Agent không đọc file đó. Thread PC giới hạn ACL cho tài khoản Scheduler. Chủ hệ thống đối chiếu mã rồi duyệt; thu hồi trong Máy phân tích. Khóa chỉ dùng GET pack và POST insights.

Thread PC đặt Task Scheduler 06:30 Asia/Ho_Chi_Minh hàng ngày, không chạy song song, retry mỗi 2 giờ khi mã thoát 2, dừng lúc 12:00. Không cài lịch trong bước này. Nhật ký không ghi khóa hoặc output runner.

Gói đóng băng theo ngày để đối chiếu evidence. Hiện có thống kê Sale/CSKH từ stats_daily; unavailable ghi rõ phần thiếu. Chưa đủ gói mọi bộ phận theo plan. Không dùng để quyết định tuyển hay đổi ngân sách khi thiếu số. Gói >1 MB bị từ chối, không cắt hàng. Phân tích toàn công ty chỉ chủ hệ thống xem, không theo bộ lọc trang.
