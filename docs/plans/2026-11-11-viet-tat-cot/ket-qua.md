# Kết quả thực hiện plan viết tắt cột — 11/11/2026

Đã thực hiện đủ bước 1 → 5 theo thứ tự. Không commit, push, mở PR hay deploy. Giữ nguyên nhánh `claude/bo-xac-thuc-2-lop` đúng phần đầu plan và worktree được giao.

## 1. Từ điển và kiểm thử

- Thêm `lib/shared/column-labels.ts`: 178 mục `{ full, short, hint }`, hàm `colLabel(key)` và các bí danh cho cách viết có sẵn (DT New, DT CSKH, CP/số, CP/đơn New, AOV, GTTB…). Không dùng từ điển trong hàm xuất Excel.
- Các mục ngoài bảng mẫu được liệt kê đầy đủ ở bảng từ điển bên dưới. Không trùng chữ tắt; chữ tắt đều ngắn hơn tên đủ.
- Nhãn chưa có trong từ điển giữ nguyên để không đoán tên nghiệp vụ.

## 2–3. Tiêu đề và bảng thẻ

- `SortTh` nhận `full`, `hint`; tooltip có tên đủ, giải thích, rồi “Bấm để sắp xếp”; `aria-label` và `data-full` dùng tên đủ. Giữ khóa, chiều và thao tác sắp xếp.
- Thêm `Th` cho tiêu đề không sắp xếp; giữ thuộc tính, cột gộp và nút InfoTip có sẵn. Giải thích cũ từ title/InfoTip được gộp vào tooltip.
- Nhãn thẻ lấy `data-full` trước, chữ đang hiển thị sau; theo dõi cả thay đổi `data-full` khi đổi bộ lọc/cột động.

## 4. Cột đã đổi theo file

Toàn bộ tiêu đề trong thead của 53 file được chuyển sang Th; SortTh dùng cùng từ điển tự động. Vì thế cả các bảng chỉ có tên ngắn cũng nhận tên đủ và tooltip mà giữ nguyên chữ hiển thị.

| File | Tên cũ → chữ tắt (cột cố định) |
|---|---|
| `app/alert-panel.tsx` | Đơn · giá trị → **Đơn · GT** |
| `app/audit-view.tsx` | Không có tên dài cố định cần đổi; dùng Th để thống nhất tên đủ và tooltip. |
| `app/calls-view.tsx` | Ngày có gọi → **Ngày gọi**<br>Khách đã gọi → **KH đã gọi**<br>Data đang cầm → **Data cầm**<br>Nội dung ghi chú → **ND ghi chú** |
| `app/care-view.tsx` | Tình trạng note → **TT note**<br>Chưa note lần nào → **Chưa note**<br>Note hôm nay → **Note nay**<br>DT tự chốt → **DT tự**<br>Ghi chú trao đổi → **GC trao đổi** |
| `app/catalog-panel.tsx` | Web đã kéo → **Đã kéo**<br>Trường dữ liệu mẫu → **Trường mẫu** |
| `app/center-view.tsx` | AOV → **AOV** |
| `app/compare-view.tsx` | Khách đã gọi → **KH đã gọi**<br>Tỷ lệ chốt → **TL chốt**<br>GTTB (AOV) → **AOV**<br>Doanh thu đơn chốt → **DT đơn chốt**<br>Hoàn thành mục tiêu → **Đạt mục tiêu** |
| `app/cskh-analytics-view.tsx` | GTTB → **AOV**<br>Đường đi nhiều nhất → **Đường đi chính** |
| `app/cskh-kpi-view.tsx` | KPI doanh thu → **KPI DT**<br>KPI tỉ lệ chốt → **KPI TL chốt** |
| `app/cskh-view.tsx` | Người bán / chốt → **NV bán/chốt**<br>Tổng tiền mua → **Tổng mua**<br>Sản phẩm hay mua → **SP hay mua**<br>Mua gần nhất → **Mua cuối**<br>Chưa mua (ngày) → **Chưa mua (ng)**<br>Tên khách hàng → **Tên KH**<br>SĐT → **SĐT**<br>Lần mua gần nhất → **Lần mua cuối**<br>Ngày chưa mua → **Ngày vắng**<br>Giá trị đã mua → **GT đã mua**<br>Nhân viên phụ trách → **NV phụ trách**<br>Đơn có thẻ → **Đơn thẻ**<br>Mua lần đầu (thẻ) → **Mua đầu (thẻ)**<br>Đơn mua lại → **Đơn lặp**<br>Khách mua lại → **KH mua lại**<br>Tỷ lệ mua lại → **TL mua lại**<br>Doanh thu mua lại → **DT mua lại**<br>Mua lại (gộp) → **Mua lại gộp**<br>Bắt đầu bằng → **Bắt đầu**<br>Số được cấp → **Số cấp**<br>Tỷ lệ mua → **TL mua**<br>Bắt đầu bằng ↓ · Mua lại → → **Bắt đầu ↓ · Lặp →** |
| `app/custom-report-view.tsx` | Không có tên dài cố định cần đổi; dùng Th để thống nhất tên đủ và tooltip. |
| `app/customer360-view.tsx` | Số lần mua → **Lần mua**<br>Lần gần nhất → **Lần cuối** |
| `app/customers-view.tsx` | Lần mua gần nhất → **Lần mua cuối** |
| `app/delivered-products-block.tsx` | Không có tên dài cố định cần đổi; dùng Th để thống nhất tên đủ và tooltip. |
| `app/dispatch-view.tsx` | Không có tên dài cố định cần đổi; dùng Th để thống nhất tên đủ và tooltip. |
| `app/forecast-card.tsx` | Tỷ lệ chốt → **TL chốt**<br>Giá trị đơn → **GT đơn** |
| `app/giao-viec-hop-view.tsx` | Trả lời lúc → **Lúc TL** |
| `app/giao-viec-view.tsx` | Không có tên dài cố định cần đổi; dùng Th để thống nhất tên đủ và tooltip. |
| `app/giao-viec-zalo-view.tsx` | Người nhận việc → **NV nhận việc** |
| `app/growth-view.tsx` | 30 ngày đầu → **30 ng đầu**<br>30 ngày gần nhất → **30 ngày cuối**<br>So 30 ngày trước đó → **So 30 ngày trước** |
| `app/hr-sync-panel.tsx` | Người (nhân sự) → **NV (HR)**<br>Doanh thu tháng (Pancake) → **DT tháng POS**<br>Doanh thu tháng (nhân sự) → **DT tháng HR**<br>Web nhân sự → **Web NS**<br>Doanh thu tháng → **DT tháng** |
| `app/ladder-table.tsx` | Lần đã nhận → **Lần nhận**<br>Ngày T0 · người bán → **T0 · NV bán**<br>Lần nhận gần nhất → **Lần nhận cuối**<br>Tổng đã nhận → **Tổng nhận** |
| `app/marketing-view.tsx` | SĐT → **SĐT**<br>Đơn XN → **Đơn XN**<br>Tỷ lệ XN → **TL XN**<br>Đơn theo mốc → **Đơn mốc**<br>DT New → **DT New**<br>DT CSKH → **DT CSKH**<br>Hoàn / hủy (tiền) → **Tiền HH**<br>Sau hoàn hủy → **Sau HH**<br>DT / SĐT → **DT/SĐT**<br>AOV → **AOV**<br>Đã cho ĐVVC → **Cho ĐVVC**<br>Đơn có SP → **Đơn/SP**<br>Thành tiền dòng SP → **Tiền dòng SP**<br>Ghi chú đơn → **GC đơn** |
| `app/mentor-view.tsx` | Không có tên dài cố định cần đổi; dùng Th để thống nhất tên đủ và tooltip. |
| `app/metric-settings.tsx` | Không có tên dài cố định cần đổi; dùng Th để thống nhất tên đủ và tooltip. |
| `app/mkt-headline.tsx` | SĐT → **SĐT**<br>DT New → **DT New**<br>DT CSKH → **DT CSKH**<br>CP/đơn New → **CP/đơn New**<br>CP/số → **CP/số**<br>% CP/DT New → **%CP/DT New** |
| `app/mkt-product-hover.tsx` | Không có tên dài cố định cần đổi; dùng Th để thống nhất tên đủ và tooltip. |
| `app/mkt-roas-view.tsx` | DT New → **DT New**<br>DT CSKH → **DT CSKH**<br>Chi phí/số → **CP/số**<br>% chi phí / DT New → **%CP/DT New**<br>Chi phí/đơn New → **CP/đơn New**<br>Chiến dịch · ghi chú → **CD · ghi chú** |
| `app/mkt-trend-panel.tsx` | Đoạn bắt đầu → **Đoạn đầu** |
| `app/monthly-compare.tsx` | So tuần trước → **So tuần cũ**<br>So tháng trước → **So tháng cũ** |
| `app/monthly-view.tsx` | Doanh thu đơn chốt → **DT đơn chốt**<br>Doanh thu giao TC → **DT giao TC**<br>Mục tiêu tháng → **MT tháng**<br>So với tháng trước → **So tháng qua**<br>Tỷ lệ chốt → **TL chốt**<br>GTTB (AOV) → **AOV** |
| `app/origin-view.tsx` | Marketer đưa về → **MKT đưa về** |
| `app/overview-sections.tsx` | Đơn chuyển đi → **Đơn gửi**<br>Doanh số chuyển đi → **DS chuyển đi**<br>Giá trị hoàn → **GT hoàn** |
| `app/overview-trends.tsx` | Thời điểm (giờ Việt Nam) → **Giờ VN**<br>Giá trị đơn → **GT đơn** |
| `app/overview-view.tsx` | Tỷ lệ chốt → **TL chốt**<br>AOV → **AOV**<br>SL bán thực → **SL thực** |
| `app/pipeline-view.tsx` | DT thành công → **DT TC**<br>Họ và tên → **Họ tên** |
| `app/product-group-blocks.tsx` | Nhân viên CSKH → **NV CSKH**<br>Tỷ lệ chốt → **TL chốt**<br>Đang đóng hàng → **Đang đóng**<br>Đơn đã nhận → **Đơn đã TC**<br>Tiền khách trả → **Tiền KH trả**<br>So cùng kỳ → **So kỳ** |
| `app/products-view.tsx` | So kỳ trước → **So trước** |
| `app/raw-orders-view.tsx` | Thời gian tạo → **Giờ tạo**<br>Nhân viên bán → **NV bán**<br>Xác nhận lúc → **Lúc XN**<br>Độ đầy đủ → **Độ đủ** |
| `app/returns-view.tsx` | Không có tên dài cố định cần đổi; dùng Th để thống nhất tên đủ và tooltip. |
| `app/sale-analytics-view.tsx` | AOV → **AOV**<br>DT đóng hàng trở đi → **DT đóng+**<br>% DT đóng hàng → **% DT đóng**<br>Số được chia → **Số chia**<br>Hủy sau chốt → **Hủy sau** |
| `app/sale-quality-view.tsx` | Doanh thu CSKH → **DT CSKH**<br>DT CSKH / khách → **DT CS/KH**<br>Đơn / khách mua lại → **Đơn/KH lặp**<br>Quay lại sau → **Sau mua đầu**<br>Sale chốt gì → **SP Sale**<br>Khách mua lại gì → **SP mua lại**<br>Đơn gốc (Sale chốt) → **Đơn gốc Sale**<br>Mua lại qua CSKH → **Mua lại CS** |
| `app/scheduler-panel.tsx` | Đơn đã lưu → **Đơn lưu**<br>Đơn cũ nhất → **Đơn đầu**<br>Đồng bộ gần nhất → **Đồng bộ cuối** |
| `app/shift-states.tsx` | Doanh thu đã chốt → **DT đã chốt** |
| `app/shift-view.tsx` | POS phụ trách → **POS quản lý**<br>Số đã nhận → **Số nhận**<br>Số đã chốt → **Số chốt**<br>Tỷ lệ chốt → **TL chốt**<br>Giá trị chốt → **GT chốt** |
| `app/shipping-lines.tsx` | Dòng sản phẩm → **Dòng SP**<br>Đơn vào Chờ XN → **Đơn vào CXN**<br>Đơn chuyển đi → **Đơn gửi**<br>Doanh số chuyển đi → **DS chuyển đi**<br>Giá trị hoàn → **GT hoàn**<br>% hoàn (giá trị) → **% hoàn GT** |
| `app/targets-panel.tsx` | Tỉ lệ chốt → **TL chốt**<br>Chi phí trần (₫) → **CP trần (₫)** |
| `app/team-groups-view.tsx` | Người có đơn → **NV có đơn**<br>Note hôm nay → **Note nay**<br>DT tự chốt → **DT tự**<br>GTTB → **AOV**<br>Tỷ lệ chốt → **TL chốt**<br>DT mục tiêu → **DT đích**<br>Tỉ lệ chốt mục tiêu → **TL chốt đích**<br>Dự báo cuối tháng → **DB cuối tháng**<br>Tổng KPI cá nhân → **Tổng KPI NV** |
| `app/team-overview-view.tsx` | AOV → **AOV**<br>DT đóng hàng trở đi → **DT đóng+**<br>% DT đóng hàng → **% DT đóng**<br>Tỷ lệ chốt → **TL chốt**<br>Tỷ trọng doanh thu → **Tỷ trọng DT** |
| `app/uncounted-view.tsx` | Tên trên Pancake · vai trò → **Tên POS · vai trò** |
| `app/users-panel.tsx` | Vai trò · chức vụ → **Vai trò/chức vụ**<br>Đăng nhập gần nhất → **Đăng nhập cuối** |
| `app/van-don-view.tsx` | Họ và tên → **Họ tên**<br>Đơn chuyển đi → **Đơn gửi**<br>Doanh số chuyển đi → **DS chuyển đi**<br>Số đơn hoàn → **Đơn trả**<br>Giá trị hoàn → **GT hoàn**<br>% hoàn theo đơn → **% hoàn/đơn**<br>% hoàn theo giá trị → **% hoàn/GT** |
| `app/watch-panel.tsx` | Không có tên dài cố định cần đổi; dùng Th để thống nhất tên đủ và tooltip. |

Các cột động cũng đi qua Th/SortTh: COLS của pipeline, cols của Vận đơn, METRICS của báo cáo tùy chọn, columns của xu hướng Marketing, ladderExtras và các nhãn nhận từ API. Cột khớp từ điển được viết tắt lúc render; không sửa chuỗi trong cấu hình dùng chung với xuất file. Báo cáo tùy chọn dùng luôn def có sẵn cho tooltip. Hai tiêu đề chứa tháng/số ngày được truyền full riêng:

| File | Tên cũ → chữ tắt |
|---|---|
| app/sale-quality-view.tsx | Mua lại qua CSKH (đủ N ngày) → TL mua lại CS; giữ N trong tên đủ, giải thích lấy theo repeatMature / mature trong ô |
| app/team-groups-view.tsx | KPI cá nhân tháng YYYY-MM → KPI NV YYYY-MM; tên đủ giữ nguyên tháng |

## Tiêu đề cố ý giữ nguyên và điểm khác giữa plan/code

- Quy tắc “2 âm tiết trở xuống giữ nguyên” khác bảng mẫu ghi Doanh thu → DT, Doanh số → DS. Ưu tiên quy tắc: giao diện giữ **Doanh thu**, **Doanh số**; vẫn có hai mục trong từ điển. Giữ Chi phí, Đơn chốt, Nhân viên, Khách hàng, tên ngắn, ký hiệu #, POS, ROAS.
- Code có sẵn nhiều tên rút gọn, khác cách viết trong plan: DT New, DT CSKH, Đơn XN, Chi phí/đơn New, CP/số, GTTB. Dùng bí danh để tên đủ/nhãn điện thoại đúng mà không đổi giá trị tính toán. Ví dụ AOV/GTTB vẫn hiện AOV, tên đủ là Giá trị đơn trung bình.
- Các tỷ lệ có mẫu số tùy trang/cách tính (Tỷ lệ chốt, Tỷ lệ hoàn, Tỷ lệ mua lại): không áp một công thức chung mới. Tooltip chung nói rõ theo cách tính/phạm vi trang; nơi đã có title/def thì giữ nguyên giải thích cụ thể đó. Không sửa cách tính để khớp ví dụ trong plan.
- Giữ nguyên tên dữ liệu động: người, team, POS, sản phẩm/nhóm sản phẩm, ngày/giờ, nhãn từng bậc mua từ API. Không tự đặt chữ tắt cho tên dữ liệu chưa có trong từ điển. Các ô dữ liệu và tiêu đề hàng trong tbody/tfoot không bị sửa.
- Giữ nhãn ngắn trong span có thông tin bổ sung, giữ nút InfoTip, class, colSpan/rowSpan và thứ tự cột.
- Plan ước khoảng 40 file, thực tế có 53 file có thead được áp thành phần chung.
- Không sửa API, SQL, quyền, cách tính, dữ liệu demo, migration, cấu hình deploy hoặc file xuất Excel. So cấu trúc AST xác nhận phần ngoài thead và import ui-kit của cả 53 file giữ nguyên so với HEAD. Các khóa SortTh nằm trong thead chỉ thay metadata hiển thị tại hai cột động nêu trên; không sửa k/sort.

## Kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| pnpm typecheck | Không chạy được: pnpm tự chuẩn bị dependency, tạo symlink bị Access denied / ERR_PNPM_PACKAGE_MANAGER_SYMLINK_FAILED trong sandbox. |
| pnpm test | Không chạy được, cùng lỗi symlink trong sandbox; chưa chạy toàn bộ test suite. |
| pnpm lint | Không chạy được, cùng lỗi symlink trong sandbox. |
| pnpm build | Không chạy được, cùng lỗi symlink trong sandbox; chưa xác minh build. |
| node node_modules/typescript/bin/tsc --noEmit | Đạt. |
| node --import ./tests/support/register-native.mjs --test --experimental-test-isolation=none tests/column-labels.test.ts tests/column-headers.test.ts | Đạt 5/5: từ điển, fallback, title cũ, aria, chiều sort, colspan, nút InfoTip, tên ngắn và dữ liệu lạ. |
| oxlint trực tiếp trên 57 file sửa/thêm | Có 214 thông báo có sẵn; so code/message/file với nội dung HEAD không có thông báo mới. Bản đối chiếu tạm dùng nội dung git show, đã xóa sau khi so. |
| oxfmt trực tiếp trên file từ điển/test | Bị spawn EPERM khi thiết lập external formatter; không xác nhận format thành công. |
| git diff --check | Đạt. |
| So nội dung ngoài tiêu đề bảng | Đạt 53/53 file, ngoài thead chỉ thay import Th. |

Chưa kiểm tra trực quan trên trình duyệt/điện thoại gập; chưa có ảnh demo. Claude cần chạy đủ pnpm test/build ngoài sandbox và kiểm tra hai màn điện thoại trước khi duyệt. Không truy cập web thật hay dữ liệu thật.

## Toàn bộ từ điển (gồm chữ tắt bổ sung)

Chỉ áp viết tắt khi tên đủ từ 3 âm tiết trở lên; tên ngắn trong từ điển vẫn giữ nguyên theo quy tắc.

| Tên đủ | Chữ tắt | Giải thích |
|---|---|---|
| Doanh thu | DT | Giá trị doanh thu của dòng báo cáo; phạm vi theo bộ lọc và mốc thời gian của bảng. |
| Doanh số | DS | Giá trị doanh số của dòng báo cáo trong phạm vi bảng. |
| Doanh thu New | DT New | Doanh thu phần New của dòng báo cáo, theo bộ lọc và mốc đang chọn. |
| Doanh thu CSKH | DT CSKH | Doanh thu phần CSKH của dòng báo cáo theo bộ lọc đang chọn. |
| Doanh thu theo mốc | DT mốc | Doanh thu của các đơn đạt mốc thời gian đang chọn. |
| Doanh thu sau hoàn hủy | DT sau HH | Doanh thu sau khi trừ phần hoàn và hủy của dòng báo cáo. |
| Doanh thu / SĐT | DT/SĐT | Doanh thu chia số điện thoại có đơn trong phạm vi báo cáo. |
| Số điện thoại | SĐT | Số điện thoại gắn với khách hoặc đơn của dòng này. |
| Đơn xác nhận | Đơn XN | Số đơn đã xác nhận trong phạm vi báo cáo. |
| Tỷ lệ xác nhận | TL XN | Số đơn xác nhận chia số đơn tạo trong kỳ. |
| Tỷ lệ chốt | TL chốt | Tỷ lệ chốt theo cách tính và phạm vi đang chọn ở trang. |
| Tỷ lệ giao thành công | TL giao TC | Tỷ lệ đơn giao thành công trong phạm vi báo cáo. |
| Đơn theo mốc | Đơn mốc | Số đơn đạt mốc thời gian đang chọn. |
| Tiền hoàn / hủy | Hoàn/hủy | Giá trị tiền hoàn và hủy trong phạm vi báo cáo. |
| Chi phí / đơn New | CP/đơn New | Chi phí quảng cáo chia số đơn New của dòng báo cáo. |
| Chi phí / số | CP/số | Chi phí quảng cáo chia số điện thoại của dòng báo cáo. |
| % chi phí / DT New | %CP/DT New | Chi phí quảng cáo chia doanh thu New, biểu diễn bằng phần trăm. |
| Giá trị đơn trung bình | AOV | Giá trị trung bình trên mỗi đơn trong phạm vi báo cáo. |
| Khách hàng mới | KH mới | Khách hàng mới trong phạm vi báo cáo. |
| Tình trạng note | TT note | Tình trạng ghi chú chăm sóc khách đang được phân công. |
| Chưa note lần nào | Chưa note | Khách được phân công chưa từng có ghi chú. |
| Note hôm nay | Note nay | Khách có ghi chú trong khoảng thời gian trang đang thống kê. |
| DT tự chốt | DT tự | Doanh thu đơn do chính người đang cầm khách bán, cộng dồn mọi thời gian. |
| Ghi chú trao đổi | GC trao đổi | Nội dung trao đổi đã ghi cho khách hàng. |
| Đường đi nhiều nhất | Đường đi chính | Chuỗi nhóm sản phẩm được mua phổ biến nhất trong dòng báo cáo. |
| Ngày có gọi | Ngày gọi | Số ngày có ghi nhận cuộc gọi trong kỳ. |
| Khách đã gọi | KH đã gọi | Số khách đã có ghi nhận cuộc gọi trong kỳ. |
| Data đang cầm | Data cầm | Số khách hiện được phân công, không theo kỳ báo cáo. |
| Nội dung ghi chú | ND ghi chú | Nội dung ghi chú của lần trao đổi này. |
| Doanh thu đơn chốt | DT đơn chốt | Doanh thu của các đơn chốt trong phạm vi đang chọn. |
| Hoàn thành mục tiêu | Đạt mục tiêu | Mức hoàn thành so với mục tiêu được giao. |
| Người bán / chốt | NV bán/chốt | Người bán hoặc người chốt được ghi nhận trên đơn. |
| Tổng tiền mua | Tổng mua | Tổng giá trị mua của khách trong phạm vi bảng. |
| Sản phẩm hay mua | SP hay mua | Các sản phẩm khách thường mua theo dữ liệu của bảng. |
| Chưa mua (ngày) | Chưa mua (ng) | Số ngày kể từ lần mua gần nhất của khách. |
| Tên khách hàng | Tên KH | Tên khách hàng của dòng dữ liệu. |
| Lần mua gần nhất | Lần mua cuối | Thời điểm mua gần nhất được ghi nhận của khách. |
| Giá trị đã mua | GT đã mua | Giá trị mua đã được ghi nhận cho khách trong phạm vi bảng. |
| Nhân viên phụ trách | NV phụ trách | Nhân viên hiện được phân công chăm sóc khách. |
| Mua lần đầu (thẻ) | Mua đầu (thẻ) | Lượt mua lần đầu được thống kê theo thẻ của dòng. |
| Đơn mua lại | Đơn lặp | Số đơn mua lại trong phạm vi báo cáo. |
| Khách mua lại | KH mua lại | Số khách có mua lại trong phạm vi báo cáo. |
| Tỷ lệ mua lại | TL mua lại | Tỷ lệ mua lại theo nhóm khách và phạm vi của bảng. |
| Doanh thu mua lại | DT mua lại | Doanh thu từ các đơn mua lại trong phạm vi báo cáo. |
| Mua lại (gộp) | Mua lại gộp | Số mua lại gộp các mức trong bảng. |
| Bắt đầu bằng | Bắt đầu | Nhóm sản phẩm ở lần mua bắt đầu của khách. |
| Số được cấp | Số cấp | Số khách được cấp cho nhân viên trong phạm vi bảng. |
| Tỷ lệ mua | TL mua | Số khách đã mua chia số khách được cấp của dòng. |
| Số lần mua | Lần mua | Số lần khách mua theo dữ liệu của bảng. |
| Lần gần nhất | Lần cuối | Thời điểm gần nhất được ghi nhận của dòng. |
| Giá trị đơn | GT đơn | Giá trị của đơn theo chỉ số đang hiển thị trong bảng. |
| Người nhận việc | NV nhận việc | Người được giao thực hiện công việc. |
| Thời điểm (giờ Việt Nam) | Giờ VN | Thời điểm sự kiện theo giờ Việt Nam. |
| Web đã kéo | Đã kéo | Thông tin dữ liệu đã được web đồng bộ. |
| Trường dữ liệu mẫu | Trường mẫu | Các trường có trong bản ghi dữ liệu mẫu. |
| KPI doanh thu | KPI DT | Mục tiêu doanh thu được giao cho tháng đang chọn. |
| Doanh thu tháng | DT tháng | Doanh thu của tháng được hiển thị trong bảng. |
| Doanh thu tháng (Pancake) | DT tháng POS | Doanh thu tháng lấy từ dữ liệu Pancake. |
| Doanh thu tháng (nhân sự) | DT tháng HR | Doanh thu tháng lấy từ dữ liệu web nhân sự. |
| Dòng sản phẩm | Dòng SP | Dòng sản phẩm của nhóm đơn đang thống kê. |
| Doanh số chuyển đi | DS chuyển đi | Doanh số của các đơn chuyển đi trong phạm vi đang chọn. |
| Đơn chuyển đi | Đơn gửi | Số đơn chuyển đi trong phạm vi đang chọn. |
| Đơn vào Chờ XN | Đơn vào CXN | Số đơn vào trạng thái Chờ xác nhận theo phạm vi bảng. |
| Giá trị hoàn | GT hoàn | Giá trị của phần hoàn trong phạm vi bảng. |
| % hoàn (giá trị) | % hoàn GT | Phần giá trị hoàn biểu diễn bằng phần trăm theo phạm vi bảng. |
| % hoàn (đơn) | % hoàn đơn | Phần số đơn hoàn biểu diễn bằng phần trăm theo phạm vi bảng. |
| SL bán thực | SL thực | Số lượng sản phẩm bán thực của dòng báo cáo. |
| DT thành công | DT TC | Doanh thu phần đơn đã giao thành công trong phạm vi bảng. |
| Họ và tên | Họ tên | Họ tên của người được thống kê trong dòng. |
| Nhân viên CSKH | NV CSKH | Nhân viên chăm sóc khách hàng của dòng báo cáo. |
| Tiền khách trả | Tiền KH trả | Tổng giá trị các đơn đã nhận; phần đã thu tiền được chú thích riêng nếu có. |
| So cùng kỳ | So kỳ | So sánh với kỳ trước theo phạm vi trang đang chọn. |
| So kỳ trước | So trước | Mức thay đổi so với kỳ báo cáo trước. |
| Thời gian tạo | Giờ tạo | Thời điểm tạo đơn được ghi nhận trên nguồn dữ liệu. |
| Nhân viên bán | NV bán | Nhân viên bán được ghi nhận trên đơn. |
| Xác nhận lúc | Lúc XN | Thời điểm xác nhận đơn được nguồn dữ liệu ghi nhận. |
| Độ đầy đủ | Độ đủ | Mức đầy đủ thông tin của bản ghi được hiển thị. |
| DT đóng hàng trở đi | DT đóng+ | Doanh thu các đơn ở nhóm trạng thái đóng hàng trở đi; xem giải thích trạng thái của trang. |
| % DT đóng hàng | % DT đóng | Tỷ trọng doanh thu phần đóng hàng trở đi theo bảng báo cáo. |
| Số được chia | Số chia | Số data được chia cho nhân viên trong phạm vi báo cáo. |
| Hủy sau chốt | Hủy sau | Phần đơn hủy sau khi chốt trong phạm vi bảng. |
| DT CSKH / khách | DT CS/KH | Doanh thu CSKH chia số khách của dòng báo cáo. |
| Đơn / khách mua lại | Đơn/KH lặp | Số đơn chia số khách mua lại của dòng báo cáo. |
| Quay lại sau | Sau mua đầu | Khoảng thời gian đến lần khách quay lại mua được thống kê. |
| Sale chốt gì | SP Sale | Sản phẩm Sale chốt ở lần mua gốc. |
| Khách mua lại gì | SP mua lại | Sản phẩm khách mua ở lần mua lại. |
| Đơn gốc (Sale chốt) | Đơn gốc Sale | Đơn mua ban đầu được Sale chốt. |
| Mua lại qua CSKH | Mua lại CS | Lượt mua lại được ghi nhận qua CSKH. |
| Tiền CSKH | Tiền CS | Giá trị mua lại qua CSKH của dòng báo cáo. |
| Đơn đã lưu | Đơn lưu | Số đơn đã được đồng bộ và lưu trong hệ thống. |
| Đơn cũ nhất | Đơn đầu | Thời điểm đơn cũ nhất hiện đã lưu. |
| Đồng bộ gần nhất | Đồng bộ cuối | Thời điểm đồng bộ gần nhất của nguồn dữ liệu. |
| Doanh thu đã chốt | DT đã chốt | Doanh thu các đơn đã chốt trong phạm vi bảng. |
| POS phụ trách | POS quản lý | POS nhân viên được phân công phụ trách. |
| Số đã chốt | Số chốt | Số data đã chốt trong phạm vi bảng. |
| Giá trị chốt | GT chốt | Giá trị các đơn chốt trong phạm vi bảng. |
| Tỷ trọng doanh thu | Tỷ trọng DT | Phần doanh thu của dòng so với tổng doanh thu trong bảng. |
| Doanh thu (₫) | DT (₫) | Doanh thu hiển thị theo đơn vị đồng trong bảng. |
| Chi phí trần (₫) | CP trần (₫) | Ngân sách quảng cáo tối đa của tháng, theo đơn vị đồng. |
| Tên trên Pancake · vai trò | Tên POS · vai trò | Tên và vai trò được ghi nhận trên Pancake. |
| Người có đơn | NV có đơn | Số người có đơn trong phạm vi báo cáo. |
| DT / người | DT/người | Doanh thu chia số người của dòng báo cáo. |
| DT mục tiêu | DT đích | Mục tiêu doanh thu được giao cho dòng báo cáo. |
| Tỉ lệ chốt mục tiêu | TL chốt đích | Mục tiêu tỉ lệ chốt được giao cho tháng. |
| Dự báo cuối tháng | DB cuối tháng | Ước tính kết quả đến cuối tháng theo dữ liệu của bảng. |
| Tổng KPI cá nhân | Tổng KPI NV | Tổng KPI được giao cho các cá nhân trong nhóm. |
| Số đơn hoàn | Đơn trả | Số đơn hoàn trong phạm vi báo cáo. |
| Vai trò · chức vụ | Vai trò/chức vụ | Vai trò và chức vụ được gán cho tài khoản. |
| Đăng nhập gần nhất | Đăng nhập cuối | Thời điểm đăng nhập gần nhất được hệ thống ghi nhận. |
| Team Marketing | Team MKT | Team Marketing của dòng báo cáo. |
| Marketer · team | MKT · team | Marketer và team tương ứng trong dòng báo cáo. |
| Hoàn / hủy (tiền) | Tiền HH | Giá trị tiền hoàn và hủy của dòng báo cáo. |
| Sau hoàn hủy | Sau HH | Giá trị còn lại sau phần hoàn và hủy của dòng báo cáo. |
| Đã cho ĐVVC | Cho ĐVVC | Số đơn đã chuyển cho đơn vị vận chuyển trong phạm vi bảng. |
| Thành tiền dòng SP | Tiền dòng SP | Thành tiền của dòng sản phẩm tương ứng trên đơn. |
| Ghi chú đơn | GC đơn | Nội dung ghi chú được lưu trên đơn. |
| Chiến dịch · ghi chú | CD · ghi chú | Chiến dịch quảng cáo và nội dung ghi chú của dòng. |
| Marketer đưa về | MKT đưa về | Marketer được ghi nhận là nguồn đưa khách hoặc đơn về. |
| Ngày T0 · người bán | T0 · NV bán | Ngày mua gốc và người bán được ghi nhận. |
| Lần nhận gần nhất | Lần nhận cuối | Thời điểm nhận gần nhất được ghi nhận trong bảng. |
| Tổng đã nhận | Tổng nhận | Tổng số đã nhận trong phạm vi bảng. |
| 30 ngày gần nhất | 30 ngày cuối | Dữ liệu trong khoảng 30 ngày gần nhất của báo cáo. |
| So 30 ngày trước đó | So 30 ngày trước | So sánh với khoảng 30 ngày liền trước kỳ đang xét. |
| So tháng trước | So tháng cũ | So sánh với tháng trước theo phạm vi báo cáo. |
| So tuần trước | So tuần cũ | So sánh với tuần trước theo phạm vi báo cáo. |
| So với tháng trước | So tháng qua | So sánh với tháng trước theo phạm vi báo cáo. |
| Mục tiêu tháng | MT tháng | Mục tiêu được giao cho tháng của dòng báo cáo. |
| Đang đóng hàng | Đang đóng | Đơn đang ở giai đoạn đóng hàng trong phạm vi bảng. |
| Đoạn bắt đầu | Đoạn đầu | Nhóm bắt đầu của chuỗi mua trong báo cáo. |
| Web nhân sự | Web NS | Thông tin lấy từ web nhân sự. |
| Đơn · giá trị | Đơn · GT | Số đơn và giá trị tương ứng của nhân viên trong bảng. |
| Mua gần nhất | Mua cuối | Thời điểm mua gần nhất của khách được ghi nhận. |
| Ngày chưa mua | Ngày vắng | Số ngày kể từ lần mua gần nhất của khách. |
| Đơn có thẻ | Đơn thẻ | Số đơn gắn thẻ tương ứng của dòng báo cáo. |
| Bắt đầu bằng ↓ · Mua lại → | Bắt đầu ↓ · Lặp → | Hàng là nhóm mua bắt đầu, cột là nhóm được mua lại. |
| Trả lời lúc | Lúc TL | Thời điểm trả lời lời mời họp. |
| 30 ngày đầu | 30 ng đầu | Dữ liệu trong 30 ngày đầu của nhóm khách đang xét. |
| Người (nhân sự) | NV (HR) | Người được ghi nhận trên nguồn web nhân sự. |
| Lần đã nhận | Lần nhận | Số lần khách đã nhận hàng được ghi nhận trong báo cáo. |
| Đơn có SP | Đơn/SP | Số đơn có sản phẩm tương ứng trong bảng. |
| Doanh thu giao TC | DT giao TC | Doanh thu của các đơn giao thành công trong phạm vi bảng. |
| Đơn đã nhận | Đơn đã TC | Trong số đơn chốt trong kỳ, đơn hiện ở Đã nhận hoặc Đã thu tiền. |
| Số đã nhận | Số nhận | Số data đã nhận trong phạm vi báo cáo. |
| KPI tỉ lệ chốt | KPI TL chốt | Mục tiêu tỉ lệ chốt của tháng; tỉ lệ thật theo cách tính đang chọn. |
| KPI cá nhân tháng | KPI NV tháng | Mục tiêu giao cho cá nhân trong tháng hiển thị. |
| Chưa xuất kho | Chưa XK | Số đơn chốt chưa xuất kho trong phạm vi bảng. |
| Đã xuất đi | Đã xuất | Số đơn đã xuất đi của dòng báo cáo. |
| % thành công | % TC | Số đơn đã nhận chia số đơn đã xuất đi. |
| % đang giao | % giao | Số đơn đang giao chia số đơn đã xuất đi. |
| Tỷ lệ hoàn | TL hoàn | Tỷ lệ hoàn theo mẫu số và cách tính đang chọn của trang. |
| Chuyển hàng/chốt | CH/chốt | Số đơn đã xuất đi chia số đơn chốt. |
| Doanh thu chốt | DT chốt | Doanh thu các đơn chốt theo phạm vi đang chọn. |
| Doanh thu xuất đi | DT xuất | Doanh thu của các đơn đã xuất đi trong phạm vi bảng. |
| Doanh thu thành công | DT thành công | Doanh thu của các đơn đã nhận trong phạm vi bảng. |
| GTTB đơn chốt (AOV) | AOV chốt | Doanh thu đơn chốt chia số đơn chốt của dòng. |
| Đang giao (tiền) | Tiền đang giao | Doanh thu các đơn đang giao trong phạm vi bảng. |
| Doanh thu hoàn | DT hoàn | Doanh thu các đơn hoàn trong phạm vi bảng. |
| % thành công (tiền) | % TC tiền | Giá trị đơn đã nhận chia giá trị đơn đã xuất đi. |
| Tỷ lệ hoàn (tiền) | TL hoàn tiền | Giá trị đơn hoàn chia giá trị đơn đã xuất đi trong bảng này. |
| Chuyển hàng/chốt (tiền) | CH/chốt tiền | Giá trị đơn đã xuất đi chia giá trị đơn chốt. |
| Giảm giá / quà | Giảm/quà | Giá trị giảm giá và quà của các đơn chốt trong bảng. |
| Giao thành công | Giao TC | Số đơn khách đã nhận trong phạm vi bảng. |
| Tỷ lệ hủy | TL hủy | Số đơn hủy chia số đơn lên theo cách tính của trang. |
| Đơn được chia | Đơn chia | Số đơn được chia cho người của dòng báo cáo. |
| Không XN được | Không XN | Đơn không xác nhận được trong phạm vi bảng. |
| % không XN | % ko XN | Tỷ lệ không xác nhận được của dòng báo cáo. |
| Đơn đã gọi | Đơn gọi | Số đơn đã xác nhận cộng số đơn không xác nhận được. |
| % hoàn theo đơn | % hoàn/đơn | Số đơn hoàn chia số đơn chuyển đi. |
| % hoàn theo giá trị | % hoàn/GT | Giá trị hoàn chia doanh số chuyển đi. |
| % XN được | % XN | Tỷ lệ xác nhận được trong phạm vi bảng. |
| DT MKT (New + CSKH + Khác) | DT MKT | Tổng doanh thu New, CSKH và phần khác của Marketing trong phạm vi bảng. |
| Up sang nhóm kia | Up nhóm kia | Khách mua thêm sang nhóm sản phẩm còn lại; dòng nhỏ là tỷ lệ tương ứng. |
| Lần mua do chính NV | Lần NV bán | Số đơn do chính nhân viên bán và số khách tương ứng. |
| Đơn mua tiếp | Đơn tiếp | Số đơn mua tiếp sau lần bắt đầu; dòng nhỏ là doanh thu tương ứng. |
| T0 → T1 sau | T0→T1 | Số ngày trung bình từ lần bắt đầu T0 tới lần mua tiếp T1. |
| Đơn giao TC | Đơn TC | Số đơn khách đã nhận trong phạm vi báo cáo. |
| Nhân viên · POS | NV · POS | Nhân viên và POS tương ứng của dòng báo cáo. |
| Cuộc gọi/ngày | Gọi/ngày | Số cuộc gọi chia số ngày theo phạm vi trang đang chọn. |
