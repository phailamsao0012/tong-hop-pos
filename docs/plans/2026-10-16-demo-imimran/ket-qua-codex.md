# Kết quả Demo 2 — rà cuối G7

Ngày 16/10/2026. Chỉ sửa phạm vi G7 trên nền G1–G6 đã có. Không commit, push, dùng mạng hoặc đổi API, công thức, quyền, tên số và dữ liệu.

## Thực hiện và đối chiếu từng nhóm trang

Đối chiếu mã nguồn với `thiet-ke.md` và ảnh mẫu 390px Tổng quan tối, Sale sáng, Vận đơn tối, Đăng nhập sáng. Bảng dưới mô tả triển khai đang có và phần rà G7; không phải xác nhận đã chạy mọi trang trong trình duyệt.

| Trang | Triển khai đang có / phần rà G7 |
|---|---|
| Khung và mọi View | Sidebar 208px, topbar, nội dung đệm 16px trên điện thoại; menu drawer có tên đầy đủ, đóng khi chọn. Giữ View, quyền, URL và bộ lọc. G7 thêm min-width:0 cho main và con trực tiếp của grid/card trên điện thoại. |
| Tổng quan | Khay KPI 2 cột trên mobile, số/xu hướng xếp dọc, bảng POS cuộn riêng; giữ drilldown. G7 giới hạn wrapper bảng theo chiều rộng vùng chứa. |
| Sale, CSKH | Khay số, xu hướng, bảng người; không thêm khu nhóm sản phẩm. Sửa chung lớp chồng tiêu đề/cột tên cho bảng sticky; không thay màu mini chart tăng/giảm. |
| Ca làm, nhân viên, so sánh, cuộc gọi | Kế thừa bảng và thẻ dùng chung; giảm thời gian FLIP đổi thứ tự hàng từ 450ms xuống 180ms. Giữ dữ liệu và bộ lọc. |
| Marketing, nguồn, ROAS, sản phẩm | Khay và thẻ ngang chuyển dọc trên mobile, bảng riêng. G7 giữ trạng thái thiếu chi phí, không thay số hoặc mapping dữ liệu. |
| Vận đơn, hãng vận chuyển | Giữ Đơn chuyển đi, Doanh số chuyển đi, Người lên đơn; bảng cuộn trong wrapper. |
| Đơn thô, pipeline, điều phối, đối soát | Giữ bảng và hành vi lọc/phân trang; áp dụng sửa sticky chung, không sửa truy vấn hoặc xuất dữ liệu. |
| Khách hàng, hồ sơ khách | Giữ nhận diện, dải số, bảng; không đổi che SĐT, quyền hay API. |
| Kho/Pancake, trung tâm, báo cáo tùy chỉnh | Giữ các khối hiện có; bảng rộng bị giới hạn trong wrapper. |
| Cài đặt, quản trị, bảo mật, phiên, nhật ký | Giữ nhóm trường, xác nhận và tự khóa. Giữ radiogroup “Thời gian tự khóa”, dialog “Web đang khóa”. |
| Đăng nhập, thiết lập, mở đầu, riêng tư, QR | Giữ giao diện theo token và luồng hiện tại; login một cột form trước hình sau ở mobile. G7 không đổi xác thực. |
| Các trang còn lại | Kế thừa các sửa vùng chứa, bảng và reduced motion chung; chưa nghiệm thu từng trang bằng trình duyệt. |

## Sửa lỗi G7

- `table.tbl th` trước đây làm cả ô tiêu đề hàng trong tbody dính lên đỉnh. Chỉ thead th dính trên; header có z-index 4, góc giao header/cột đầu 5, cột tên thân bảng 1. Nền sticky vẫn đặc theo theme, tránh tên đè tiêu đề khi cuộn dọc/ngang.
- Wrapper bảng width/max-width 100%; grid/card có thể co trong main ở 390px. Không thêm overflow hidden trên body để che tràn.
- Nhãn bộ phận trong dark dùng t-orange thay màu cam đậm cố định.
- Reduced motion tắt animation/transition hoàn toàn, kể cả delay; khôi phục nội dung stagger/reveal và nét SVG về trạng thái hiện đầy đủ. JS hiện có vẫn kiểm motionOK; FLIP bảng tối đa 180ms.
- Test mới tính tương phản WCAG từ sRGB tuyến tính: 32 cặp chữ/nền dark (ink trên 4 mặt nền, sidebar, nút primary và trạng thái) đều đạt 4.5:1. Đây là kiểm token, không thay thế kiểm mọi tổ hợp màu/opacity trong DOM.

## Khác hai bản cũ — đối chiếu mã nguồn cuối

Nguồn so sánh hai bản cũ theo bảng thiết kế R2; chưa mở website cũ. B01–B15 tra báo cáo R1.

| Hạng mục | @ikramsakib | Odoo | Demo 2 thực tế | Căn cứ |
|---|---|---|---|---|
| Khung | Sidebar 240px, briefing | Khung nghiệp vụ | Sidebar 208px, main duy nhất | B04/B12 |
| Nền | Xám xanh | Kế thừa bản cũ | Xám trung tính, mặt trắng | B12 |
| Tiêu đề | Bricolage | Kế thừa | Be Vietnam Pro 600 | B04, R2 chọn phông |
| Số | JetBrains Mono | Bộ hiện có | Sans tabular, giữ phông sẵn | B01/B12 |
| Thẻ | Thẻ rời, bóng tương tác | Bộ hiện có | Viền mảnh, bo 14px, gần phẳng | B04/B12 |
| KPI | Thẻ rời, icon | KPI hiện có | Khay liền, chân so sánh xám | B12 |
| Xu hướng | Cột đậm | Báo cáo/bảng xoay | Số và đường mảnh, thẻ ngang; mobile dọc | B04/B10 |
| Bảng | Mono/dòng thẻ | Nhóm/bảng xoay | Sans, cuộn riêng, sticky nền đặc | B02/B06 |
| Tổng quan | Briefing/Việc cần anh | Việc của tôi | KPI → xu hướng → bảng POS | B04/B12 |
| Điện thoại | Thu sidebar | Khung hiện có | Nút Menu, drawer tên đầy đủ; giữ accessibility | B07/B08, R2 |
| Dark | Operations | Theme kế thừa | Sidebar xanh rừng, main than | B07, R2 |
| Chuyển động | Reveal/lăn số | Kế thừa/FLIP | Không lăn số; FLIP bảng còn giữ, giảm 180ms; reduced motion tắt | R2, giữ hành vi bảng |
| Đăng nhập | Màn cũ | Luồng cũ | Chia đôi hình học CSS, mobile form trước | B03 |
| Khách hàng | Tìm nhanh | Form/timeline | Nhận diện, dải số và bảng hiện có | B15 |

Màu thương hiệu #17684b, số, quyền, URL và mapping màu dữ liệu giống vì ràng buộc dự án.

## Kiểm tra và giới hạn

| Lệnh | Mã thoát | Kết quả |
|---|---:|---|
| pnpm typecheck | 0 | Đạt |
| pnpm test | 1 | Node test runner không spawn được tiến trình: EPERM |
| pnpm lint (trước/sau) | 1 / 1 | Cùng 1164 chẩn đoán duy nhất, đối chiếu nội dung không có chẩn đoán mới |
| pnpm build | 1 | Không nạp được dependency native, gồm tailwindcss-oxide.win32-x64-msvc.node; Vite báo 8 lỗi |
| node --experimental-strip-types tests/giao-dien-demo2.test.ts | 0 | 5/5 test đạt, chạy trực tiếp không tạo tiến trình test con |
| pnpm dev --host 127.0.0.1 | 1 | Cùng lỗi nạp dependency native |
| Thử Playwright local | 1 | Chromium spawn EPERM; không tải browser hoặc dùng mạng |
| git diff --check | 0 | Không lỗi khoảng trắng |

## Khác thiết kế và việc chưa làm

- Giữ FLIP sắp xếp bảng có sẵn nhưng giảm còn 180ms; chưa thay toàn bộ chuyển động cũ bằng phản hồi màu vì tránh thay hành vi ngoài nhu cầu sửa G7.
- Chưa nghiệm thu mọi trang ở 390px, dark, menu Escape/trả focus và drilldown bằng trình duyệt do dev/build và Chromium bị chặn nêu trên. Sửa responsive dựa trên mã nguồn và ảnh mẫu; chưa khẳng định không còn tràn trên mọi trang.
- Chưa chạy được toàn bộ test hoặc build thành công; cần máy điều phối chạy lại trong môi trường đủ dependency và quyền spawn. Không cài mới hay sửa file ngoài phạm vi để vượt lỗi môi trường.
- Chưa chạy script kiểm trình duyệt trên demo thật/deploy; giữ nguyên script và các điểm bám trong mã nguồn.
- Không còn câu hỏi cần người dùng trả lời trong phiên này.

## Lượt sửa S1

- Thanh trên: `flex-wrap: wrap` cùng ô tìm kiếm rộng và tên team dài khiến thanh xuống dòng ở 1280px. Trong `app/dashboard.tsx` thêm breadcrumb tên trang có title đầy đủ, cho ô tìm kiếm co và đánh dấu nút team; `app/globals.css` dùng ellipsis cho breadcrumb, giới hạn team/trạng thái, giảm đệm nhóm chọn, bắt buộc một dòng từ 1180px. Dưới ngưỡng này cho quấn hàng, header tự tăng chiều cao trong luồng trang. Giữ nhãn Demo 2 theo hostname và bộ chọn theme hiện tại ở chân sidebar.
- Tràn ngang: G7 chỉ bỏ kích thước tối thiểu của phần tử lưới dưới 639px; vùng giữa vẫn có thể bị bề rộng nội tại của bảng/thẻ đẩy lớn. Mở rộng `min-width: 0` cho inset, main, con lưới và card ở mọi kích thước; giữ bảng trong `.tbl-wrap` cuộn riêng. Khay KPI về hai cột dưới 1200px bằng `repeat(2, minmax(0, 1fr))`; số KPI được xuống dòng, không cắt mất số. Phễu Marketing có năm cột từ 1024px quá chật sau khi trừ sidebar/đệm: thêm class trong `app/marketing-view.tsx`, chuyển năm cột lên xl và hai cột dưới 1200px. Không thêm overflow hidden cho html/body/main.
- Sidebar: chuyển wrapper desktop sang sticky, top 0, cao 100dvh, nền sidebar phủ trọn chiều cao; bỏ spacer khi container trở về luồng. Giữ trạng thái offcanvas với wrapper rộng 0 và container ẩn khi thu menu; giữ nguyên drawer mobile và danh sách navigation/quyền.
- Đã đối chiếu thiết kế và ảnh mẫu Tổng quan sáng 1440, Sale tối 1440, Vận đơn sáng 390; rà mã khung, Tổng quan, Sale/CSKH dùng thành phần chung, Marketing, Vận đơn, Đơn thô và Khách hàng. Bảng các trang này vẫn dùng TableWrap, sticky cột đầu/tiêu đề và min-width bảng hiện tại. Không sửa API, công thức, quyền, tên số, hành vi bộ lọc hoặc điểm bám của `scripts/kiem-trinh-duyet.cjs`.
- Thêm ba test S1 vào `tests/giao-dien-demo2.test.ts`: breadcrumb ellipsis và breakpoint một dòng; co lưới/cuộn bảng riêng/không che tràn trang; sidebar sticky đủ chiều cao và thu offcanvas.

### Kiểm tra S1

| Lệnh | Mã thoát | Kết quả |
|---|---:|---|
| `pnpm typecheck` | 0 | Đạt |
| `pnpm test` | 1 | Node test runner bị `spawn EPERM`, chưa chạy được toàn bộ ca |
| `pnpm lint` trước/sau | 1 / 1 | Cùng 1164 lỗi; so nội dung sau khi chuẩn hóa số dòng/cột không có chẩn đoán mới |
| `pnpm build` | 1 | Vite không nạp được dependency native Tailwind oxide và báo `spawn EPERM` (8 lỗi) |
| `node --experimental-strip-types tests/giao-dien-demo2.test.ts` | 0 | 8/8 test đạt, gồm ba ca S1 |
| `pnpm dev --host 127.0.0.1` | 1 | Cùng lỗi dependency native/spawn, không mở được ứng dụng local |
| `git diff --check` | 0 | Không lỗi khoảng trắng |

Giới hạn nghiệm thu: chưa kiểm được DOM thực tế của mọi giá trị navigation ở 390/1024/1280/1440px, chiều cao thanh trên, cuộn sidebar và cột tên bằng trình duyệt vì dev/build không khởi động được. Cần máy điều phối kiểm lại khi có môi trường chạy được ứng dụng. Không gọi demo thật, không tải/cài dependency và không commit/push. Không có câu hỏi giữa chừng.
