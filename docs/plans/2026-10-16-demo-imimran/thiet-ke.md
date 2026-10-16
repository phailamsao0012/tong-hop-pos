# Thiết kế Demo 2 — R2

## Cơ sở và phạm vi

Đọc [báo cáo R1](bao-cao-kenh.md), `app/globals.css`, khung/menu `app/dashboard.tsx`, `app/overview-view.tsx`, `app/ui-kit.tsx`. B01–B15 và liên kết bài gốc tra ở mục 3 báo cáo R1. Nguồn chính: Lumen B12 (khay số có chân so sánh), Qanun B04 (thẻ ngang số và xu hướng), B02/B06 (bảng người), B07/B08 (menu sáng/tối), B03 (đăng ký chia đôi), B15 (hồ sơ). Không dùng ảnh lẫn sản phẩm làm bằng chứng, không sao ảnh gốc vào repo.

Chỉ làm tài liệu và mẫu ngoại tuyến. Các số là hư cấu cố định, không đại diện công thức nghiệp vụ. Responsive, dark toàn màn và chuyển động là quyết định R2; ảnh nguồn chỉ chứng minh menu dark, không chứng minh các hành vi đó. Khi triển khai giữ API, JSON, công thức, quyền, URL và bộ lọc hiện tại. Mẫu luôn có nhãn Demo 2 để nhận diện; G1 chỉ hiện khi `location.hostname.startsWith('demo2.')` ở trình duyệt.

## 1. Token sáng và tối

Nguồn đầy đủ có thể chép trực tiếp: [mau/tokens.css](mau/tokens.css). Hai khối `:root` và `.dark` khai báo đủ mọi token nền của `app/globals.css`; khối `:root, .dark` khai báo bí danh shadcn để tính lại theo theme. G1 giữ nguyên `@theme inline`, thay các khối token, không chép CSS bố cục mẫu vào toàn app.

| Nhóm | Biến (cùng tên ứng dụng) | Quyết định |
|---|---|---|
| Nền, mặt thẻ | `--bg`, `--surface`, `--surface-2`, `--surface-3` | Sáng #f4f4f5 / #ffffff / #f7f7f8 / #ededf0; tối #121819 / #1b2325 / #222c2e / #2a3537 |
| Viền | `--card-line`, `--line`, `--line-2`, `--line-3` | Sáng #e4e4e7 → #a1a1aa; tối #354144 → #667477 |
| Chữ | `--ink`, `--ink-2`, `--ink-3`, `--ink-4` | Sáng #202426 / #50565b / #62686f / #687078; tối #f1f5f4 / #c3cecb / #a7b7b2 / #a0b0ac |
| Thương hiệu | `--primary`, `--primary-2`, `--primary-ink`, `--ring`, `--tint`, `--tint-2` | Primary sáng bắt buộc #17684b, tối #8bd5ab; chữ nút tương ứng #fff / #0f2e22 |
| Trạng thái | `--good`, `--good-bg`, `--bad`, `--bad-bg`, `--warn`, `--warn-bg` | Xanh/đỏ/vàng có nền tương ứng, luôn kèm dấu hoặc chữ |
| Menu | `--sb`, `--sb-ink`, `--sb-ink-2`, `--sb-ink-3`, `--sb-line`, `--sb-accent`, `--sb-hover`, `--sb-box`, `--sb-panel` | Sáng trắng; tối xanh rừng #022a22 theo B07 |
| Màu phụ | `--lime`, `--lime-ink`; `--t-{green,blue,orange,teal,red,purple,gray,lime}` và mỗi biến `-bg` | Lime chỉ phụ trợ; hành động chính dùng xanh Megatech |
| Dữ liệu | `--pos-1` đến `--pos-6`; `--st-new`, `--st-confirmed`, `--st-shipping`, `--st-delivered`, `--st-returned`, `--st-cancelled` | Giữ mapping và màu hiện có, tránh đổi ý nghĩa |
| Biểu đồ | `--chart-grid`, `--chart-fill`, `--chart-bar` | Lưới sáng #e9eaec, tối #354144; fill theo primary |
| Độ sâu | `--shadow`, `--shadow-lift`, `--shadow-pop`, `--radius` | Thẻ 14px, bóng gần phẳng; popover mới dùng bóng nổi |
| Loading/AI | `--skel-1`, `--skel-2`, `--ai-1` đến `--ai-5` | Đủ cả hai theme; không tự thêm nội dung AI |
| Chữ/chuyển động | `--font-display`, `--font-ui`, `--font-num`, `--ease`, `--dur`, `--dur-2` | Sans thống nhất; 140/180ms |

Các bí danh `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--border`, `--input`, `--destructive` và toàn bộ `--sidebar*` đã nằm trong tokens.css. Sidebar accent foreground dùng chữ theo theme để đủ tương phản trên mặt sáng.

## 2. Chữ và thành phần

R1 ghi `PHONG: giữ`, không có phông mới trong `.kenh/phong/`. Dùng Be Vietnam Pro sẵn có, sao bản OFL và 12 file woff2 (400/500/600/700 × latin/latin-ext/vietnamese) vào `mau/fonts/`; CSS dùng đường dẫn tương đối, mở file không cần mạng. Không khẳng định đây là phông gốc của kênh.

| Bậc | Desktop (cỡ/line-height, weight) | 390px |
|---|---|---|
| Tiêu đề trang | 26/36px, 600 | 22/30px |
| Tiêu đề khối | 16/24px, 600 | Giữ |
| Nội dung/bảng | 14/22px, 400–500; hàng bảng 13px | Giữ |
| Nhãn/chữ phụ | 12/18px, 400–500 | Giữ; không thu chữ chính để nhét bảng |
| Số KPI | 28/39px, 700 | 24/34px |
| Số nổi trong thẻ ngang | 36/50px, 700 | 30/42px |
| Số bảng | 13/21px, 700 | Giữ, cuộn bảng |

Số dùng tabular-nums, letter-spacing -.01em; giữ formatter/đơn vị hiện tại. Không cắt số bằng ellipsis. Thẻ bo 14px, viền 1px, đệm 20–24px; nút cao tối thiểu 44px, bo 8px. Khay KPI nền xám có bốn ô, chân so sánh xám nhạt thẳng hàng. Tăng/giảm dùng dấu và chữ, giữ nghĩa tốt/xấu của từng chỉ số; không suy rằng mọi giảm đều tốt.

## 3. Khung desktop, điện thoại và tối

1440px: sidebar 208px, topbar 68px, main đệm ngang 32px, dọc 28px, max-width 1440px; gap 20px. Sidebar logo → menu hiện tại → tài khoản/theme ở đáy. Giữ navigation/DEPTS và quyền hiện có, không đưa nhóm menu Odoo hoặc cột “Việc cần anh” vào. Tiêu đề trái, bộ lọc kỳ/POS/team phải; thiếu chỗ thì xuống hàng. Mẫu chỉ có bốn link màn để duyệt thiết kế, không đại diện danh sách menu production.

390px: bỏ sidebar cố định, topbar sticky có nút Menu mở danh sách tên đầy đủ; chọn mục chuyển màn, Escape đóng và trả focus. Mẫu dùng details/summary; app giữ drawer và cơ chế focus hiện tại. Main đệm 16px; KPI 2×2; thẻ ngang thành số phía trên, biểu đồ phía dưới. Bộ lọc quấn hàng. Bảng cuộn trong TableWrap riêng, min-width 560px, không kéo ngang cả trang; nếu giữ sticky cột đầu phải có nền đặc. Không dùng overflow hidden trên body để che lỗi. Login một cột, form trước hình sau.

Dark: main than trung tính, thẻ xám xanh, sidebar xanh rừng theo B07. Chữ thường dùng ink/ink-2/ink-3, mục tiêu ≥4.5:1; focus 2px offset 3px. Không phủ kính mờ lên bảng số. B07 chỉ là căn cứ menu, phần main tối là đề xuất R2. Loading giữ footprint và aria-busy; lỗi/thiếu dữ liệu luôn trước chart, empty có giải thích, không thay bằng số 0.

## 4. Bố cục từng trang

| Trang | Thứ tự khối từ trên xuống | Ràng buộc |
|---|---|---|
| Tổng quan | Tiêu đề/kỳ/POS/team → đồng bộ/đối chiếu → khay KPI → thẻ ngang số và xu hướng → bảng POS → trạng thái đơn/định nghĩa | Số/mốc so ở trên; giữ drilldown, bộ lọc nguồn/nhóm hàng |
| Sale | Bộ lọc → khay số hiện có → xu hướng ngang → bảng nhân viên/mục tiêu → định nghĩa | Mini chart tăng xanh giảm đỏ; không thêm lại thẻ nhóm sản phẩm |
| CSKH | Bộ lọc → khay số → xu hướng/cuộc gọi hiện có → bảng người → giải thích | Không tạo KPI mới; không thêm thẻ nhóm sản phẩm |
| MKT | Kỳ/POS/nguồn → headline/chi phí → xu hướng → bảng nguồn/người → nhóm sản phẩm hiện có | Chi phí thiếu giữ trạng thái thiếu, không điền 0 |
| Vận đơn | Bộ lọc → Đơn chuyển đi/Doanh số chuyển đi → xu hướng → bảng Người lên đơn → hãng vận chuyển/đối soát | Giữ đúng tên; doanh số chỉ người hậu tố MKT/CSKH/SALE theo lib hiện tại |
| Đơn thô | Kỳ/trạng thái → tổng kết quả → bảng gốc → phân trang | Cột mã/tên đầu, số phải; giữ truy vấn/xuất dữ liệu |
| Khách hàng | Tìm/lọc → bảng; chi tiết: nhận diện → dải số → khối dữ liệu hiện có | Giữ che SĐT/quyền API; không thêm timeline hoặc smart button mới |
| Cài đặt / Bảo mật | Tab hiện tại → nhóm trường/tài khoản → tự khóa → phiên đăng nhập → thao tác nhạy cảm | Giữ xác nhận, passkey, khóa/mở web; không đổi quyền |
| Đăng nhập | Form trái 48%, minh họa hình học CSS phải 52%; mobile form trước | Giữ trường/lỗi/tài khoản demo và luồng hiện tại; không thêm đăng ký/OAuth |

Các trang còn lại kế thừa khung và thành phần, không đổi View. Màn mở đầu dùng cùng sans/nền và phản hồi ngắn; không thêm trình diễn lăn số.

## 5. Biểu đồ Chart.js

Giữ renderer hiện tại: overview đang dùng Recharts, các chart Chart.js dùng style đồng nhất, không chuyển engine. Mẫu ngoại tuyến dùng SVG có title/desc, đường liền/đứt và chú giải; không thêm thư viện.

Chart.js: font Be Vietnam Pro 12px, chữ ink-2. Dãy chính primary, phụ t-blue/t-purple/t-orange/t-teal; POS và trạng thái giữ mapping riêng. Line borderWidth 2, pointRadius 0, pointHoverRadius 4, tension .25, fill false. Kỳ trước ink-3 nét đứt [4,4]. Trục y lưới chart-grid 1px, bỏ viền; trục x không lưới, tối đa 6 nhãn desktop/3 mobile. Chú giải dưới biểu đồ, mẫu đường 16px, đơn vị rõ. Tooltip surface/ink, viền line-2, padding 12px, bo 8px, tiêu đề là mốc thời gian, giữ formatter tiền/số/tỷ lệ hiện tại. Donut cutout 72%, borderWidth 0, legend phải ở desktop/dưới ở mobile, chỉ dùng tỷ trọng sẵn có. Thanh ngang cao 6px, không bịa mẫu số hoặc sức chứa.

Đổi theme đọc lại CSS variables cho canvas bằng cơ chế hiện tại. Animation tối đa 180ms; hover đổi màu/viền, không nhấc thẻ/lăn số. prefers-reduced-motion tắt animation/transition. Không suy chuyển động từ video lỗi.

## 6. Khác hai bản cũ

Đối chiếu mục 8 R1 và tư liệu `.kenh/tham-khao/`, không khẳng định đã kiểm website cũ. Odoo kế thừa diện mạo, không có bộ màu/phông độc lập để tạo khác biệt giả.

| Hạng mục | @ikramsakib làm | Odoo làm | Demo 2 làm | Lấy từ bài nào của kênh |
|---|---|---|---|---|
| Bố cục khung | Sidebar 240px, briefing 300px | Giữ khung, đổi cấu trúc nghiệp vụ | Sidebar 208px + main duy nhất, thẻ ngang; sidebar giống vì giữ menu hiện tại | B04/B12 |
| Nền và mặt thẻ | Xám ngả xanh | Kế thừa diện mạo cũ | Xám trung tính, trắng, khay xám | B12 |
| Phông tiêu đề | Bricolage | Kế thừa giao diện | Be Vietnam Pro 600 xuyên suốt | B04; chọn phông do R2 |
| Phông số | JetBrains Mono | Kế thừa bộ hiện có | Sans Be Vietnam Pro tabular; giống main vì giữ phông sẵn theo R1 | B01/B12 |
| Bo góc và bóng | Thẻ rời, bóng tương tác | Kế thừa bộ thành phần | 14px, viền mảnh, gần phẳng, không nhấc thẻ | B04/B12 |
| KPI | Bốn thẻ rời, icon màu | Bộ KPI hiện có | Khay liền bốn ô có chân xám so kỳ | B12 |
| Biểu đồ | Cột mực đậm | Báo cáo/bảng xoay | Số và đường mảnh trong thẻ ngang | B04/B10 |
| Bảng | Số mono, vận đơn dòng-thẻ | Nhóm theo/bảng xoay | Bảng trắng, sans, avatar nhỏ, vạch chia nhẹ | B02/B06 |
| Tổng quan | Briefing/Việc cần anh | Việc của tôi theo hạn | Khay KPI → số/xu hướng → bảng POS | B04/B12 |
| Điện thoại 390px | Thu sidebar theo khung operations | Giữ khung hiện có | Thanh tên và Menu đầy đủ, thẻ ngang xếp dọc; có thể giống thao tác drawer vì giữ accessibility hiện tại | B07/B08; responsive do R2 |
| Chế độ tối | Token operations toàn màn | Kế thừa theme | Sidebar xanh rừng, main than trung tính | B07; main tối do R2 |
| Chuyển động | Reveal/lăn số | Ăn theo giao diện, FLIP khi có | Phản hồi màu 140ms, không lăn số | Không quan sát được; quyết định R2 |
| Đăng nhập | Chủ động giữ màn cũ | Không đổi luồng | Chia đôi form và hình học CSS; luồng giữ vì ràng buộc | B03 |
| Khách hàng | Tìm nhanh chung | Form/smart button/timeline | Nhận diện + dải số + bảng hiện có | B15 |

Xanh #17684b, URL/quyền/số/công thức và màu dữ liệu cố ý giống vì yêu cầu dự án. Khác biệt là tổ hợp bố cục, khay chân so sánh, thẻ ngang, sans và đăng nhập chia đôi; không chỉ đổi màu.

## 7. Điểm bám kiểm trình duyệt phải giữ

- View/navigation/DEPTS/canView giữ nguyên; không mở trang ngoài quyền.
- `.nav-item[aria-current="page"]` vẫn xác định mục hiện tại, giữ class và aria khi thay JSX.
- `?view=<tên>` mở đúng trang; giữ tên View, kỳ/POS/team/nguồn và ngữ cảnh điều hướng.
- Bấm số vẫn mở đúng chi tiết, giữ bộ lọc và cách so kỳ trước cùng mốc giờ.
- Radiogroup tên chính xác `Thời gian tự khóa`, giữ chọn bằng bàn phím.
- Dialog tên chính xác `Web đang khóa`, giữ hành vi khóa/mở và focus.
- Giữ che SĐT, quyền API, đăng nhập và tài khoản demo; nhãn Demo 2 theo hostname ở G1.

## 8. Mẫu và nghiệm thu

Mở [mau/index.html](mau/index.html) trực tiếp bằng file URL; query `?s=home|sale|vandon|login&t=light|dark`. Màn/theme không hợp lệ về home/light. Link chuyển màn giữ theme, đổi theme giữ màn. Không fetch, remote asset, form gửi thật hoặc lưu mật khẩu. Mọi trang ghi dữ liệu hư cấu. Bộ lọc là nhãn tĩnh, KPI không giả hành vi drilldown; đây là mẫu bố cục, các thao tác ứng dụng phải giữ ở G1–G6.

Kiểm đủ 4 màn × 2 theme × 1440/390: không tràn trang, bảng cuộn riêng; kiểm menu, Escape, query, form tĩnh và tài nguyên offline. Ảnh `mau/anh/{home,sale,vandon,login}-{light,dark}-{1440,390}.png` do máy chụp sau khi kiểm đạt theo plan. Không thêm test repo ngoài phạm vi. Bốn lệnh bắt buộc và kết quả kiểm mẫu ghi trong tóm tắt phiên R2.
