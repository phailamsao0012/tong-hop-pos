# Thử tải web tổng trên PC

Anh Vũ 31/10/2026: "test thử trên pc xem chịu tải được như thế nào", kèm video về load test (@truyen.code). Kịch bản chạy bằng `scripts/pc/test-tai.mjs`, chỉ đọc, không ghi gì lên Pancake hay dữ liệu thật.

## Học được gì từ video

1. Không cần người thật: **virtual user** là chương trình giả làm người dùng. Một lõi CPU gánh được hàng nghìn bot.
2. Người thật không bấm liên tục: mở một trang rồi nghỉ khoảng **24 giây** (think time) mới bấm tiếp.
3. Bot bấm gì, bấm bao nhiêu gọi là **workload model**: phải giống cơ cấu người dùng thật (nhân viên xem ca và Sale, leader xem thêm, chủ xem mọi trang).
4. Cùng một bộ bot, **4 kiểu chạy**: load (mức bình thường), stress (vượt mức), soak (giữ hàng giờ), spike (dồn đột ngột).
5. **Ramp-up**: tăng dần từng nấc, không nhảy cóc; nhảy cóc là bỏ lỡ chỗ gãy.
6. Tăng tới khi gãy (**breakpoint**): mỗi nấc thường gãy ở một chỗ khác nhau (câu SQL, số kết nối DB, CPU).
7. Đo **p95 / p99**, không đo trung bình: trung bình che mất những request chậm.
8. Mô hình **mở** (request đến theo nhịp cố định) thay vì **đóng** (bot đợi trả lời mới gửi tiếp). Mô hình đóng làm số đẹp giả: server chậm thì bot gửi ít đi (coordinated omission). Và máy bắn tải không được tự nghẽn, nếu nghẽn thì lần chạy đó phải bỏ.

## Chạy trên PC

- Chạy **ngoài giờ làm** (tối hoặc sớm), vì tới nấc cao web sẽ chậm cho người đang dùng.
- Mở PowerShell ở `C:\thp\app`, đặt tài khoản thử trong biến môi trường (không ghi vào file), rồi chạy:

```powershell
$env:THP_TEST_EMAIL = 'tài khoản xem được mọi trang'
$env:THP_TEST_MATKHAU = 'mật khẩu'
node scripts/pc/test-tai.mjs
```

- Mặc định: web ở `http://localhost:8787`, các nấc 1, 2, 5, 10, 20, 40 request/giây, mỗi nấc 60 giây, coi là gãy khi p95 vượt 2 giây hoặc lỗi vượt 5%. Gãy là dừng ngay, không chạy nấc trên.
- Đổi nấc: `--nac 2,5,10,15,20 --giay 90`. Đổi ngưỡng: `--p95 1500 --loi 3`.
- Chỉ GET các API báo cáo người dùng thật hay mở (tổng quan, ca, Sale, CSKH, cuộc gọi, khách, sản phẩm, vận đơn), theo cơ cấu 8 nhân viên : 4 leader Sale : 4 leader CSKH : 2 trưởng phòng : 1 giám đốc : 1 chủ. Không gọi API ghi, đồng bộ, Pancake, sao lưu.
- Kết quả in ra màn hình và ghi `C:\thp\log\test-tai-<ngày>.json` (chỉ thời gian và mã trạng thái, không có số liệu nghiệp vụ).

## Đọc kết quả

- Mỗi nấc in: số request, p50, p95, p99, tỉ lệ lỗi, số request đang chờ tối đa, CPU của tiến trình bắn tải.
- Số người dùng cùng lúc tương đương ≈ nhịp request/giây × 24 giây nghỉ ÷ số API một trang (khoảng 3). Ví dụ 10 request/giây ≈ 80 người đang mở web cùng lúc.
- Dòng "Chịu tốt tới N request/giây" là mức an toàn; dòng "Gãy ở nấc" kèm ba trang chậm nhất là chỗ cần sửa trước (thường là câu SQL của trang đó).
- Muốn thử kiểu soak: `--nac 5 --giay 3600` (giữ 1 giờ). Kiểu spike: `--nac 2,40,2 --giay 60`.

## Hạn chế

- Máy bắn tải chính là PC đang chạy web, nên hai bên tranh CPU: số đo ở nấc cao hơi xấu hơn thực tế. Kịch bản in CPU của tiến trình bắn tải từng nấc; quá 70% một lõi thì nấc đó không tin được, chạy lại với nấc thấp hơn hoặc bắn từ máy khác trong mạng (`--url http://<ip PC>:8787`).
- Bản web trên PC là `wrangler dev --local`, một tiến trình workerd: chịu tải thấp hơn Cloudflare thật nhưng đủ cho công ty vài chục người.
- Cache báo cáo: lần đầu mở một kỳ sẽ chậm hơn các lần sau; kịch bản làm nóng 5 giây trước khi đo.
