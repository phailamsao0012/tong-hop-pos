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
# Lượt T4 — Vận đơn theo mẫu

- Chạy thêm toàn bộ test không tách tiến trình (`node --import tsx --import ./tests/support/register.mjs --test --test-isolation=none tests/*.test.ts`): mã 1; ngoài lỗi esbuild còn có assertion ở các test route/demo/hash/team. Chưa xác định nguyên nhân trong chế độ chạy thay thế; không sửa logic hay test ngoài phạm vi T4.

- Đã mở ảnh mẫu Vận đơn sáng 1440px và tối 390px bằng công cụ xem ảnh, đọc HTML và token mẫu.
- `van-don`: khay liền 4 số Đơn chuyển đi / Doanh số chuyển đi / Giao thành công / Hoàn, thẻ D2Trend, bảng D2Table Người lên đơn có số thứ tự tròn, tên và team/bộ phận, số căn phải. Bộ chọn người/team/bộ phận vẫn áp dụng bảng này. Các khối xác nhận, hoàn, bảng sắp xếp và xuất Excel giữ bên dưới.
- `pipeline`: khay 4 số với đúng tên và nguồn số hiện tại, D2Trend Doanh thu xuất đi, D2Table theo nhân viên dùng đúng danh sách đã lọc và sắp xếp. Giữ bảng chi tiết, nhóm cột, phễu, bảng POS, dòng sản phẩm, các bộ lọc và xuất Excel.
- Dùng CSS d2 sẵn có cho khay 2×2 trên điện thoại, thẻ xu hướng xếp dọc và bảng cuộn riêng. Chưa xác nhận bằng trình duyệt chạy ứng dụng vì build cục bộ lỗi môi trường.
- Khác mẫu: hai API hiện tại không trả chuỗi theo ngày hoặc kỳ trước. Không thêm API, không suy diễn số: chân khay ghi chưa có dữ liệu so kỳ; D2Trend hiển thị số tổng thật và trạng thái thiếu chuỗi thay biểu đồ giả. Giữ tên số riêng của pipeline như trước, không đổi thành tên của báo cáo Vận đơn.
- Không sửa API, công thức, quyền, điều hướng hay script kiểm trình duyệt. Các KPI cũ không có thao tác mở chi tiết; khay mới cũng là số tĩnh, các thao tác cũ giữ nguyên.
- Kiểm tra: `pnpm typecheck` 0; `git diff --check` 0; `pnpm test` 1 (`spawn EPERM`); `pnpm build` 1 (`spawn EPERM` và lỗi tải native Tailwind oxide khi nạp cấu hình); `pnpm lint` 1 (lỗi có sẵn). Lint riêng các TSX đã sửa còn đúng hai lỗi cũ ở pipeline: import posVar chưa dùng và ô tổng chưa có nhãn, đã đối chiếu bản HEAD. Không thêm lỗi lint mới.
- Test bổ sung bằng `node --import tsx --import ./tests/support/register.mjs --test --test-isolation=none tests/giao-dien-demo2*.test.ts tests/van-don.test.ts tests/shipping-lines.test.ts`: mã 1, 15 ca đạt, 2 file bị chặn esbuild `spawn EPERM`. Không sửa kỳ vọng test cũ; không thêm test mới cho thay đổi trình bày.
# Lượt sửa T5 — Đăng nhập và các trang còn lại

- Đăng nhập: thêm thanh thương hiệu và nút sáng/tối, nhãn Tổng hợp POS; giữ bố cục form trước hình giới thiệu trên điện thoại. Hình hai vòng CSS, khoảng cách, kích thước chữ và trường nhập theo mẫu login. Tài khoản demo nằm sau nút mở danh sách, giữ nguyên các nút và luồng xác thực.
- Marketing, Chi phí & ROAS, Đơn thô, Khách hàng, Khách hàng 360: bốn số đầu thành khay liền; số bổ sung đặt bên dưới. Khối nội dung dùng D2Section, bảng dùng D2Table qua adapter giữ bộ lọc, sắp xếp, phân trang, tooltip, xuất file và chi tiết hiện có. Danh sách khách và vòng đời khách dùng các khối toàn chiều ngang.
- Bảo mật: các phần thiết lập xếp dọc trong D2Section. Nhật ký dùng D2Table. Cấu hình được bọc trong D2Section; giữ nguyên các panel và quyền hiện có.
- Kiểm tra AST so với HEAD: toàn bộ lời gọi hàm và props KpiCard của chín file trang giữ nguyên. Không sửa API, công thức, tên số hoặc script kiểm trình duyệt.
- Kiểm tra: `pnpm typecheck` mã 0; `git diff --check` mã 0; tám test CSS hiện có chạy bằng Node strip-types mã 0. `pnpm lint` mã 1, 1.162 lỗi như HEAD, không thêm lỗi. `pnpm test` và `pnpm build` mã 1 do môi trường chặn tạo tiến trình (`spawn EPERM`). Chưa kiểm chứng giao diện thực tế trong trình duyệt.
- Khác plan: khay giữ KpiCard hiện có bên trong D2Tray để giữ nguyên tooltip, lọc và hành vi bấm; không thêm phần trăm so kỳ khi trang không có dữ liệu so kỳ. Không thực hiện T6 hay các bước khác.

# Lượt T6 — Điện thoại và chế độ tối cho các khối d2

- Đã đọc HTML/token mẫu và mở ảnh home tối 1440/390, Sale tối 390, Vận đơn tối 390, đăng nhập tối 390 bằng công cụ xem ảnh. Giữ nguyên bộ token sáng/tối (nền tối #121819, mặt thẻ #1b2325, menu #022a22), tên số, API, cách tính, quyền và điểm bám kiểm trình duyệt.
- Sửa bố cục co theo chiều rộng: cột nội dung có flex-basis bằng 0 để bảng không đẩy rộng cả trang; khay 2×2 dưới 1200px; chân so kỳ nằm cùng đáy ô; thẻ xu hướng xếp dọc trên điện thoại, biểu đồ cao 190px; bảng giữ chiều rộng riêng và cuộn trong khung. Không che tràn trên body/main.
- Bộ lọc, tiêu đề và ghi chú được xuống dòng trong khung; điều chỉnh lề nội dung/thiết lập và cột đăng nhập ở cùng breakpoint 767px. Hình trang đăng nhập được giới hạn trong vùng minh họa.
- Sửa menu điện thoại: truyền lớp d2-sidebar vào SheetContent để nhận đúng nền, mục chọn, nhóm và tài khoản theo mẫu ở cả hai chế độ. Hiện nút đóng 44px; menu dài cuộn riêng; giữ cơ chế focus/Escape/đóng sau chọn trang của Sheet và SidebarNav hiện có.
- Kiểm tra: `pnpm typecheck` mã 0; 16 test giao diện hiện có chạy bằng `pnpm exec tsx --import ./tests/support/register.mjs --test --test-isolation=none tests/giao-dien-demo2*.test.ts` mã 0, gồm bảo toàn giá trị/chi tiết, bảng có vùng cuộn bàn phím, chuỗi so kỳ và token/tương phản tối. Không thêm test sao chép quy tắc CSS cho thay đổi trình bày.
- `pnpm lint` mã 1: đối chiếu toàn bộ chẩn đoán trước/sau đều 1.162, không có chẩn đoán mới. `pnpm test` mã 1 do `spawn EPERM`. `pnpm build` mã 1 vì không nạp được dependency native khi nạp cấu hình Vite; `pnpm dev --host 127.0.0.1` cũng mã 1. Không tải/cài dependency.
- Giới hạn: thử mở Chromium cục bộ bằng Playwright mã 1 (`spawn EPERM`). Chưa có ảnh ứng dụng hoặc số đo trình duyệt để xác nhận không cuộn ngang ở 390/1024/1280/1440 và độ khớp mẫu thực tế. Cần chạy lại kiểm trình duyệt khi môi trường cho phép; không chạy V1/V2, không gọi demo/web thật.
- Chạy thêm toàn bộ test không tách tiến trình bằng `pnpm exec tsx --import ./tests/support/register.mjs --test --test-isolation=none tests/*.test.ts`: mã 1, 160/181 đạt, 21 lỗi ở các test route/demo/tra cứu/đối chiếu team. Không coi chế độ thay thế là bộ test chuẩn đã đạt, không sửa kỳ vọng hoặc logic ngoài T6. `git diff --check` mã 0.

## Lượt sửa S2

- Vận đơn: khay và số lớn xu hướng dùng lại `shortMoney` từ `app/ui-kit.tsx`, giống Tổng quan/Sale. Giữ `money(t.sentNet)` trong title; bảng Người lên đơn vẫn hiển thị tiền đầy đủ. Không đổi số, tên chỉ số, API hay quyền.
- Số lớn: CSS cuối `app/globals.css` giữ số khay/xu hướng trên một dòng bằng `white-space: nowrap`, dùng `clamp` với đơn vị container để co chữ theo ô, gồm cả khay Sale/CSKH.
- Tổng quan 390px: các khối cũ trong Phân tích và chi tiết còn kích thước nội tại của SVG/bảng, phần con flex của MiniStat và các lưới POS/bộ phận nhiều cột. Giới hạn chiều rộng SVG và khung cuộn, cho phần con co bằng min-width:0; xếp dọc lưới POS/bộ phận dưới 640px bằng minmax(0,1fr). Bảng vẫn cuộn trong khung riêng, không che tràn trên html/body/main. Rà nguồn Sale/CSKH/Vận đơn/Marketing và giữ các khung bảng, lưới minmax hiện có.
- Nhãn demo trước đây dùng position:fixed và nằm ngoài Dashboard nên nổi đè nội dung. Chuyển từ `app/page.tsx` vào đầu main trong `app/dashboard.tsx`, trước tiêu đề; CSS position:static, xuống dòng khi thiếu chỗ, màu theo token sáng/tối.
- Thêm bốn ca nguồn S2 trong `tests/giao-dien-demo2.test.ts`: nowrap/co chữ; nhãn trong luồng main; tiền rút gọn và title/bảng đầy đủ; khối chi tiết co/xếp dọc/cuộn bảng riêng. Chạy `node --experimental-strip-types --test --test-isolation=none tests/giao-dien-demo2.test.ts` mã 0, 12/12 đạt (gồm 4 ca mới).
- Kiểm tra bắt buộc: `pnpm typecheck` mã 0; `pnpm test` mã 1 (spawn EPERM); `pnpm lint` mã 1, trước/sau đều 1.162 chẩn đoán, đối chiếu không có chẩn đoán mới; `pnpm build` mã 1 (Vite externalize-deps bị spawn EPERM). `git diff --check` mã 0.
- Kiểm tra bổ sung: chạy nhóm `giao-dien-demo2*.test.ts` trực tiếp bằng Node mã 1 do ba file cần bộ nạp TSX/đường dẫn không phần mở rộng; chạy bằng `pnpm exec tsx ... --test-isolation=none` mã 1 do esbuild spawn EPERM. Không sửa test cũ để bỏ qua lỗi môi trường.
- Chạy toàn bộ bằng `node --import tsx --import ./tests/support/register.mjs --test --test-isolation=none tests/*.test.ts` mã 1: 152/174 đạt, 22 lỗi; chế độ thay thế vẫn lỗi ở nhóm route/demo/tra cứu/đối chiếu team và bộ nạp. Không coi toàn bộ test đã đạt, không sửa logic ngoài S2.
- Giới hạn: đã xem ảnh mẫu Tổng quan 390/Vận đơn 1440 và đối chiếu thiết kế; chưa đo lại scrollWidth hoặc chụp ứng dụng trong trình duyệt. Cần máy chụp sau S2 xác nhận các màn ở 390/1024/1280/1440, sáng/tối. Không dùng mạng, không commit/push, không làm bước khác.
