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
# Lượt sửa T2: Tổng quan theo mẫu home

- `overview` và `center`: đưa khay bốn số, xu hướng doanh thu và bảng Theo POS lên trước phần phân tích cũ, dùng `D2Home` với các khối d2 đã có từ T1. Giữ nguyên phần phân tích, thao tác, màn hình TV và lời gọi API cũ bên dưới.
- Dữ liệu khay lấy từ `current.total`, so sánh từ `compare.total`; biểu đồ cộng doanh thu theo bucket của chính báo cáo và ghép kỳ so sánh theo thứ tự như biểu đồ hiện có. Không thêm request hoặc đổi công thức báo cáo. Bảng phân biệt POS không có dữ liệu với giá trị 0 và hiển thị trạng thái kết nối/lịch sử/lỗi thực tế.
- Đã mở ảnh mẫu home sáng 1440/390 và tối 1440 bằng công cụ xem ảnh; đọc HTML và token mẫu. Chỉ thực hiện T2, không thay khung T1 hoặc các trang T3–T6.
- Kiểm tra: `pnpm typecheck` mã 0; `pnpm test` mã 1 (`spawn EPERM` trước khi chạy ca test); `pnpm lint` mã 1 (1.162 lỗi có sẵn, file mới lint riêng mã 0); `pnpm build` mã 1 (không nạp được phụ thuộc native Tailwind và `spawn EPERM` khi nạp cấu hình Vite). `git diff --check` mã 0.
- Test mới trong `tests/giao-dien-demo2-home.test.ts`: render khay đúng bốn nút, thứ tự khay/xu hướng/bảng và số từ fixture; phân biệt dữ liệu thiếu với 0, trạng thái lỗi đồng bộ, không lộ nội dung lỗi. Chưa chạy được do giới hạn spawn của môi trường.
- Khác mẫu: giữ bộ lọc nâng cao và các chức năng cũ; biểu đồ tuân theo nhóm ngày/tuần/tháng và kỳ so sánh người dùng đang chọn thay vì cưỡng ép ngày/kỳ trước. Không thay API để làm khác lựa chọn hiện hành. Chưa có ảnh chụp ứng dụng chạy để kết luận độ giống mẫu.

## Lượt sửa T3 — Sale và CSKH theo mẫu sale

- Đã mở bốn ảnh mẫu Sale (1440/390, sáng/tối), đọc `mau/index.html` và `mau/tokens.css`.
- `sale-overview`, `cskh-overview`, `sale-teams`, `cskh-teams`, `compare`: chuyển bố cục thành D2Tray bốn chỉ số đầu hiện có → D2Trend ngang → bảng người/team D2Table. Chỉ số dư và phân tích cũ nằm bên dưới, không bỏ chức năng.
- Dùng lại KPI cũ bên trong khay để giữ tên số, giá trị, tooltip, ID và thao tác hiện có. Giữ bảng gốc bên trong D2Table để không mất sắp xếp, tổng cuối bảng, chọn người, mở team, xuất file và sparkline tăng xanh/giảm đỏ. Thêm vòng chữ cái tên cho bảng tổng quan và người trong team.
- Các tab còn lại của Sale/CSKH dùng D2Section và kiểu bảng D2Table, gồm phân tích, chất lượng khách, KPI, cuộc gọi, khách theo nhân viên, tự ups/từ MKT, trong ngày và chia số. Không thêm khu thẻ nhóm sản phẩm.
- Chuỗi xu hướng dùng báo cáo đang tải, không thêm request. Phạm vi người/team áp dụng cho cả hai kỳ; ngày so sánh căn theo vị trí ngày trong kỳ, ngày thiếu để trống, không lấy số toàn bộ phận thay số người đang lọc.
- Không sửa API, công thức nghiệp vụ, quyền, navigation, bộ lọc chung hoặc scripts/kiem-trinh-duyet.cjs. Không commit/push/deploy.

### Kiểm tra T3

- `pnpm typecheck`: mã 0.
- `pnpm test`: mã 1, runner bị `spawn EPERM`. Chạy thử toàn bộ không cô lập bằng `node --experimental-test-isolation=none --import tsx --import ./tests/support/register.mjs --test tests/*.test.ts`: mã 1, 150 đạt/24 lỗi; có lỗi nạp esbuild EPERM và các ca D1 không đạt trong chế độ chạy thay thế này. Không sửa test cũ để bỏ qua lỗi.
- `pnpm lint`: mã 1, lỗi đã có. Đối chiếu lint các file thay đổi với bản HEAD bằng bản sao tạm đặt cùng thư mục: 99 chẩn đoán trước/99 sau, không thêm chẩn đoán (mã đối chiếu 0).
- `pnpm build`: mã 1, không nạp được dependency native `@tailwindcss/oxide-win32-x64-msvc` khi nạp vite.config.ts. Không cài/tải dependency.
- Ba test mới trong `tests/giao-dien-demo2-t3.test.ts`: cộng chuỗi POS/căn đúng ngày kỳ trước khi có ngày thiếu; lọc người ở cả hai kỳ/không nhân đôi ID; thiếu chuỗi người không thay bằng số cả bộ phận. Đã chạy bản transpile bằng TypeScript trong cùng tiến trình Node: mã 0, 3/3 đạt. Các bản transpile chỉ là file tạm và đã dọn.
- Bộ 8 test token/CSS hiện có chạy riêng không cô lập: mã 0, 8/8 đạt.
- `git diff --check`: mã 0.

### Chỗ khác plan và giới hạn T3

- Mở rộng D2Tray/D2Table để nhận nội dung hiện có, thay vì viết lại toàn bộ KPI và bảng: giữ nguyên tooltip, sắp xếp, tổng, lựa chọn và hành vi chi tiết.
- Chưa xác minh hình render thực tế trong trình duyệt do build bị chặn bởi dependency native. Đã xem ảnh chuẩn, nhưng chưa có bằng chứng screenshot ứng dụng để khẳng định khớp mẫu ở mọi kích thước.
- Không có câu hỏi cần trả lời giữa chừng. Cần môi trường chạy được dependency/build để hoàn tất kiểm tra trình duyệt và chạy lại bộ test chuẩn.
