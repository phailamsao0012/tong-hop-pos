# So sánh V1 — 16/10/2026

## Nguồn và giới hạn đối chiếu

Đã đọc `CODEX.md`, mục 9 của `plan.md`, `mau/index.html`, `mau/tokens.css` và mở ảnh bằng công cụ xem ảnh trong `mau/anh/`. Ảnh đính kèm và thư mục `C:/Users/PC/codex-viec/demo-imimran/chup/V1` thực tế chỉ có 12 ảnh `mau-*`; không có file `demo-*` ở thư mục này hay thư mục con. Vì vậy các bảng dưới là sai lệch xác định từ JSX/CSS hiện tại so với mẫu, không phải kết luận đo pixel trên bản vừa deploy. Không truy cập demo hay deploy theo quy định CODEX.md.

Giữ nguyên số, tên chỉ số, API, cách tính, phạm vi quyền và callback của bộ lọc. Dữ liệu thật của báo cáo có thể khác số minh họa trong mẫu. Không thay chuỗi dữ liệu bằng đường cong giả để giống ảnh.

## Tổng quan POS (`overview`)

| Chỗ khác mẫu | Mức (lớn/nhỏ) | Sửa ở file nào |
|---|---|---|
| 1440 sáng/tối và 390: nhiều hàng lọc kỳ, POS, nhóm đơn, nguồn khách và xuất báo cáo đứng trước khay số, đẩy nội dung chính xuống | Lớn | `app/overview-view.tsx`: chuyển nguyên bộ công cụ vào khối mở rộng bên dưới bảng Theo POS; trạng thái cập nhật vẫn ở đầu báo cáo |
| 1440 sáng/tối và 390: khay và xu hướng vừa có margin 20px vừa có gap 20px, khoảng cách thành 40px | Lớn | `app/globals.css`: bỏ margin của hai khối trong flex `.d2-home`, giữ gap 20px |
| 1440 sáng/tối: biểu đồ cao 210px, trục số chiếm thêm bề ngang; mẫu là đường mảnh với lưới và nhãn ngày | Nhỏ | `app/ui/d2.tsx`, `app/globals.css`: cao 190px, ẩn nhãn trục Y nhưng giữ giá trị tooltip, bỏ viền trục X |
| 1440 và 390: ô tên của bảng bị đặt `display:flex`, ảnh hưởng thuật toán bố trí ô và căn đường kẻ | Lớn | `app/ui/d2.tsx`, `app/globals.css`: giữ `td` là ô bảng, chỉ flex phần avatar và tên bên trong |
| 390: cỡ tiêu đề lớn hơn mẫu, bảng chưa có nhịp hàng như ảnh | Nhỏ | `app/globals.css`: tiêu đề 22px; bảng dùng chung có hàng 78px theo ảnh (gồm tên và dòng phụ), vẫn cuộn ngang riêng |

## Tổng quan Sale (`sale-overview`)

| Chỗ khác mẫu | Mức (lớn/nhỏ) | Sửa ở file nào |
|---|---|---|
| 1440 sáng/tối và 390: tiêu đề cục bộ, kỳ, trạng thái đơn và các nút POS đứng trước khay số | Lớn | `app/team-overview-view.tsx`: công cụ chuyển xuống sau bảng nhân viên; giữ nguyên callback, lựa chọn và dữ liệu |
| 1440 sáng/tối và 390: thiếu dòng trạng thái cập nhật độc lập sau tiêu đề chung | Nhỏ | `app/team-overview-view.tsx`: hiển thị `StaleChip` hiện có trước khay |
| 1440 sáng/tối: thẻ xu hướng và biểu đồ chưa cùng tỷ lệ với mẫu | Nhỏ | `app/globals.css`, `app/ui/d2.tsx`: thẻ ngang tối thiểu 288px, canvas 190px; điện thoại xếp dọc |
| 390: phần công cụ làm trang dài trước khi tới bảng; các chỉ số bổ sung vẫn cần truy cập được | Lớn | `app/team-overview-view.tsx`: thứ tự khay → xu hướng → bảng nhân viên → công cụ mở rộng → chỉ số bổ sung; không thêm khu thẻ nhóm sản phẩm |

Bảng nhân viên giữ các cột nghiệp vụ, sắp xếp, mini chart và nút so sánh hiện có; không rút còn ba dòng giả như ảnh mẫu. Thay đổi trong component dùng chung cũng áp dụng cho CSKH, nhưng không triển khai thêm bước T3 hay V2.

## Vận đơn (`van-don`)

| Chỗ khác mẫu | Mức (lớn/nhỏ) | Sửa ở file nào |
|---|---|---|
| 1440 sáng/tối và 390: công cụ kỳ, POS, cấp người/team/bộ phận và xuất Excel đứng trước khay | Lớn | `app/van-don-view.tsx`: chuyển xuống sau bảng Người lên đơn trong khối công cụ mở rộng |
| 1440 sáng/tối và 390: trạng thái cập nhật nằm trong tiêu đề cục bộ đang bị CSS ẩn | Lớn | `app/van-don-view.tsx`: đặt thêm `StaleChip` ngoài tiêu đề, trước khay |
| 1440 sáng/tối và 390: bố trí ô tên bảng và chiều cao thẻ chưa theo mẫu | Lớn | `app/ui/d2.tsx`, `app/globals.css`: dùng layout ô bảng chuẩn và khung xu hướng chung |
| Mẫu có chuỗi ngày và % kỳ trước, báo cáo hiện tại không cung cấp các dữ liệu này | Lớn, giới hạn dữ liệu | Giữ thông báo thiếu dữ liệu hiện có trong `app/van-don-view.tsx`; không bịa chuỗi, không thêm API, không thay số tổng |

Giữ nguyên “Đơn chuyển đi”, “Doanh số chuyển đi”, “Người lên đơn” và mọi phần xác nhận/hoàn bên dưới.

## Đăng nhập (`login`)

| Chỗ khác mẫu | Mức (lớn/nhỏ) | Sửa ở file nào |
|---|---|---|
| 1440 sáng/tối: thanh trên thiếu menu Tổng quan / Sale / Vận đơn | Lớn | `app/auth-form.tsx`: thêm liên kết nội bộ đúng `?view=`; quyền vẫn do ứng dụng kiểm tra |
| 1440 và 390: form kế thừa gap 14px của màn cũ cộng với margin của màn mẫu, làm các trường cách quá xa | Lớn | `app/globals.css`: reset gap về 0 cho form d2, giữ nhịp label/input và margin của mẫu |
| 390: thêm menu cần thanh trên tự xuống hai dòng thay vì ép vào hàng 68px | Lớn | `app/globals.css`: hàng đầu tự cao, menu và logo ở trên, nhóm Demo 2/chủ đề ở hàng sau khi thiếu chỗ |
| 1440 sáng/tối và 390: nút tài khoản demo có nền hộp phụ và dấu details khác nút viền trong mẫu | Nhỏ | `app/globals.css`: đổi vỏ thành nút viền nền surface; vẫn mở danh sách tài khoản và đăng nhập như cũ |
| 1440 và 390: khoảng cách nhãn giới thiệu, tiêu đề và mô tả bên hình khối khác mẫu | Nhỏ | `app/globals.css`: chỉnh margin theo mẫu, giữ form bên trái và hình khối bên phải; điện thoại form trước |

Giữ “Nhớ máy này”, hiện mật khẩu, báo lỗi, tài khoản demo và các bước xác minh/khôi phục. Không dùng câu “mẫu tĩnh không gửi thông tin” của mẫu vì đây là form đăng nhập hoạt động thật.

## Kiểm tra V1

- `pnpm typecheck`: mã 0.
- `pnpm test`: mã 1, môi trường chặn subprocess với `spawn EPERM`.
- `pnpm lint`: mã 1 trước và sau sửa; 1.162 lỗi ở cả hai lần. Đối chiếu nội dung chẩn đoán bỏ số dòng/cột: không thêm lỗi.
- `pnpm build`: mã 1; Vite không nạp được cấu hình do các dependency native `.node` (Tailwind oxide, Lightning CSS, Rolldown). Không sửa cấu hình hay cài lại dependency ngoài phạm vi V1.
- Chạy thay thế bằng Node, loader TypeScript thuần trong thư mục tạm và `--test-isolation=none`: 16/16 test giao diện Demo 2 qua, mã 0. Thử gộp toàn bộ suite trong một tiến trình: 160/181 qua, 21 lỗi; kết quả này không thay thế kiểm tra chuẩn vì các test dùng chung trạng thái. Chạy lại từng file trong tiến trình riêng: 43/44 file qua; `route-hardening.test.ts` còn lỗi nạp module `SyntaxError: Unexpected token ':'` trong một ca. Không sửa test hay API để né lỗi; chưa thể khẳng định toàn bộ suite xanh bằng lệnh chuẩn.
- `git diff --check`: mã 0.

Chưa đánh dấu màn nào “đạt so ảnh demo”: thiếu ảnh `demo-*` và chưa render lại ứng dụng trong trình duyệt vì build bị chặn. Việc chụp bản deploy mới vẫn thuộc máy điều phối, không thuộc V1 này.
