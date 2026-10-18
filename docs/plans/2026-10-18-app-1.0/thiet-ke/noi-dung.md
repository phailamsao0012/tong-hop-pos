# Nội dung app cho thiết kế 1.0 — T1

Nguồn đọc: Swift ở commit `b13a044` (0.11), theo danh sách mục 5 của `thiet-ke-lai.md`. Đối chiếu `API.swift`, `StaffAPI.swift`, `Terms.swift` và `WidgetShared/Format.swift`. Đây là sổ nội dung cho các bước sau; T1 chỉ vẽ hai màn Hôm nay. Mọi giá trị trong hình là minh hoạ, mọi tên là NV A / NV B / NV C, POS A / POS B / POS C. Không lấy dữ liệu vận hành.

## Quy ước chung

- Giữ cây trang và năm tab: Trang chủ → Đơn hàng → Tổng quan → Phòng ban → Thêm. “Hôm nay” là tiêu đề trang, chưa đổi tên tab Trang chủ.
- Chỉ hiện chức năng được `Me.canView` cấp; dữ liệu theo POS được cấp. Không suy ra quyền từ hình mẫu chủ hệ thống. Các khối chưa lọc theo team phải giữ nguyên lời báo của `StaffTerms`.
- Kỳ, POS, nhóm đơn và team có phạm vi riêng theo trang. Chạm số mở `Route.orders(OrderQuery)` hoặc bảng giải thích trước rồi xem đơn; giữ `start`, `end`, `posIds`, `basis`, `team`, `product`, `sellerId`, `hrTeam` khi nguồn hỗ trợ. Không gán bộ lọc không được API hỗ trợ.
- Giữ tải / lỗi / trống riêng, nút Thử lại, kéo làm mới và thời điểm đồng bộ. Thiếu tỷ lệ là “—”, không phải 0. Không tự bù trường máy chủ còn thiếu.
- Đơn vị: tiền gọn theo yêu cầu mới (dấu phẩy thập phân, chấm nghìn, ₫), số âm dùng −; tỷ lệ so sánh dùng điểm. `Fmt.shortMoney` và bộ định dạng widget có tiền gọn, dù `Fmt.vnd` cũ còn in đầy đủ: ưu tiên mục 3 của thiết kế mới.
- Hình không triển khai nghiệp vụ hay API. Đồ thị chỉ đổi hình học từ số đã có. Dòng thời gian phải có bucket thật; tuyệt đối không biến tổng Hôm nay thành chuỗi theo giờ.

## dang-nhap

Nguồn: `LoginView`, `LoginShell`, `Unlock`, `LogoIntro`, `Security.LockScreen`, `Approvals`.

- Trang con: logo có Chạm để bỏ qua; chào mừng tài khoản đã nhớ; form đăng nhập; mã xác minh; chờ duyệt điện thoại; màn khoá quay lại app; bảng duyệt máy khác; quét QR.
- Nội dung: Email (để trống trong hình), Mật khẩu, Ẩn/Hiện mật khẩu, Nhớ máy này, Đăng nhập; đổi tài khoản; Chính sách bảo mật. Mã 6 số, xác minh qua ứng dụng/email, quay lại, phương án dự phòng theo máy chủ. Chờ duyệt có số chọn, đếm thời gian, bị từ chối/hết hạn.
- Face ID tự hỏi; có Dùng mật mã iPhone, Xác nhận mật khẩu, Đăng xuất khi khoá. Không vẽ lựa chọn tắt khoá. Duyệt: thông tin máy/vị trí/thời điểm, chọn đúng số, Xác nhận, Không phải tôi · chặn, Xong. QR có quyền camera và trạng thái không có camera.
- Điều hướng: đăng nhập đủ bước → năm tab; quay lại app → khoá → trang đang xem; quét → bảng duyệt → xác thực. Không làm QR thật hoặc dữ liệu xác thực trong mẫu.
- Dữ liệu: `API.LoginStep.step`, `to`, `minutes`, `number`, `seconds`, `fallback`; `Approval.device/place/createdAt/expiresAt/choices`. Không có dữ liệu biểu đồ kinh doanh; chỉ tiến trình bước và thời gian.

## hom-nay

Nguồn: `HomeFeed`, `HomeShortcuts`, `HomeSources`, `AlertCenter` trong `Tabs`, `Kit.AppHeader`.

- Lời chào theo buổi, tên hiển thị, thứ; đồng bộ và chuông Thông báo. Doanh thu hôm nay, nút (i), con mắt ẩn toàn bộ tiền; phạm vi mọi POS/POS được cấp, từ 0h tới lúc tải.
- Tổng cộng thống kê Pancake cộng các POS; số đơn chốt; Hôm qua cả ngày. Nguồn hỗn hợp ghi rõ Pancake/web tự tính; cảnh báo phần chưa đọc được Pancake. Tổng này không phải phép cộng ba bộ phận.
- Theo bộ phận: Sale, CSKH, Marketing, tiền, số đơn, mũi tên % so cùng giờ hôm qua; (i) từng nguồn. Marketing đếm đơn đã xác nhận; Sale/CSKH theo quy tắc nguồn tương ứng. Ba số xem riêng, không cộng lại.
- MKT hôm nay: Số về, đơn lên, Chi phí QC, CP / số, CP / đơn. Chưa có chi phí → Chưa có; khi giới hạn POS, chi phí vẫn mọi POS, hai tỷ số là —, không tự chia.
- Vận đơn hôm nay: Doanh số chuyển đi, Đơn chuyển đi, tổng Đơn vào Chờ xác nhận hôm nay; còn chờ, đã xác nhận, không xác nhận được. Tiền tính riêng, không cộng vào tổng công ty. Theo `sentBasis`, không coi đơn gửi hôm nay là tập con của đơn vào chờ hôm nay.
- Cần xử lý: badge tổng, tối đa ba `AlertLink`, Xem tất cả → Thông báo. Không việc khẩn cấp khác với chưa tải được. Lối tắt theo quyền, tối đa tám: Trong ca; Đơn mới chưa chốt; Tra khách; Theo từng POS; Cuộc gọi CSKH; Data Sale; Báo cáo tháng; Duyệt nhân sự.
- Ca đang chạy: Số đã nhận, Số đã chốt, Chốt nóng; hai số đầu so hôm qua; ba người nhiều đơn chốt nhất, thanh và số; Xem ca.
- Chạm tổng → `totalExplain` → danh sách đơn theo truy vấn có sẵn; bộ phận → `.dept` với kỳ Hôm nay; (i) mở `ExplainSheet`. Ca → `.page("shift")`; chuông/việc → `.alerts` hoặc route riêng của việc. Trang chủ không có bộ lọc kỳ/POS tương tác, chỉ có phạm vi theo quyền.
- Nguồn biểu đồ hiện tại: `PancakeRef.current[]/previous[]`, `RefPos.part.total.revenue/orders`, `RefPos.source`; tổng hình học như `HomeFeed.refSum`. A dùng hai cung cùng thang, Hôm nay so Hôm qua cả ngày (không gọi là mục tiêu). B dùng cột các POS từ `current[].part.total.revenue`; không phải chuỗi thời gian. `sale/cskh.current.total.closedNet/closedOrders`, `compare.total.closedNet`; `mkt.current.net/closed/phones/orders/cost/costPerLead/costPerClosed`, `mkt.prev.net`; `vd.total.sent/sentNet/closed/waiting/failed`, `vd.sentBasis`; `alerts.shift.total.received/closed/rate`, `yesterday`, `staff[].closed`.
- Không cần API mới cho hai hình T1. Vòng trang trí bốn màu chỉ là chữ ký bộ phận, không mã hoá tỷ trọng cộng gộp. Tiền và tổng số có nhãn/giá trị bằng chữ ngay cạnh hình.

## tong-quan

Nguồn: `Home.HomeView`, `Departments.DeptBoards`, `ShipTable`.

- Kỳ, POS, nhóm đơn Tất cả/Gentadox/SK + GK, Team; bảng bốn bộ phận; dòng đồng bộ/định nghĩa và cảnh báo team chưa áp dụng.
- Sale: Doanh thu, Đơn chốt, Tỷ lệ chốt, AOV. CSKH: Doanh thu, Đơn chốt, AOV, Tự upsell và Từ MKT (số đơn, tiền, tỷ trọng). Marketing: Doanh thu, số đơn đã xác nhận, ROAS, Số về, Chi phí QC, Chi phí / số, Chi phí / đơn chốt. Fallback nguồn sections có Đơn lên, Tỷ lệ chốt, AOV và cảnh báo nguồn/phạm vi.
- Vận đơn: Doanh số chuyển đi, Đơn chuyển đi; bảng Bộ phận lên đơn / Chuyển đi / Hoàn / % hoàn đơn · giá trị, dòng Sale/CSKH/Khác nếu có/Tổng. Kỳ ngắn giữ lưu ý đơn chưa kịp hoàn.
- Chạm bảng → trang bộ phận, giữ kỳ/POS. Bảng bộ phận chưa lọc team; phải báo nguyên văn, không tạo ảo giác đã lọc.
- Nguồn hình: `Sections.sale.orders/net/created/closedNow/rate`, `cskh.orders/net/aov/own/fromMkt` (JSON `self` → `own`); `mkt.orders/net/aov/cost/created/closedNow/rate`; `shipping.total/sale/cskh/other` có `orders/net/returned/returnedNet/rateOrders/rateNet`. `definitions`, `productSegment`, `period`, `sentBasis`, `syncedAt`. Marketing ưu tiên `MktAnalytics.current` khi phù hợp, không chia chi phí mọi sản phẩm cho đơn đã lọc.

## tong-quan-so-lieu

Nguồn: `Home.CenterBlocks`.

- Số liệu theo kỳ: Đơn tạo mới (khách), Đơn chốt (Tỷ lệ chốt), Doanh thu đơn chốt (GTTB), Giá trị TB đơn (AOV), Giao thành công (tiền), Chốt nóng của ca hôm nay. Số tham chiếu Pancake: Doanh số, Doanh thu, Lợi nhuận, GTTB, SL sản phẩm, SP trung bình, hàng chốt/hoàn, Online/Tại quầy và số nguồn fallback.
- Mục tiêu tháng → KPI CSKH; Xu hướng 30 ngày → Tổng quan POS (không theo kỳ đang chọn); Trạng thái đơn; Vận hành đơn (Đơn chốt, Đã xuất đi, Đã nhận, Đang giao, Hoàn, Hủy sau chốt, Chưa xuất kho).
- Nhân viên TOP 5 / CẦN HỖ TRỢ (từ 10 đơn chia), So sánh nhân viên; Mua lại & data (Tỷ lệ mua lại trọn đời, Doanh thu mua lại, Đơn mua lại, Khách mua lại, Data được cấp, Đã mua); Khách hàng (Tổng khách, Hoạt động 30 ngày, Thân thiết, Nguy cơ rời bỏ, Lâu chưa mua >90, Tổng chi tiêu); Khách lâu chưa mua theo nhóm ngày.
- Chạm trạng thái → đơn với basis đúng; nhân viên → chi tiết; liên kết mua lại/data/khách → trang tương ứng. Khối chưa hỗ trợ team ghi rõ.
- Nguồn hình: `Overview.current.total`, `compare.total`, `current.series[].bucket/closedNet/closedOrders`, `current.byEmployee`, `Metrics.groups[].orders/net`; `Pipeline.total`; `Targets.items`; `Shift.total/yesterday`; `Repurchase.summary/funnel`; `Batches.batches[].received/buyers`; `CustomerPage.groups/segments/groupNets`. Đồ thị 30 ngày lấy request trend riêng, không đổi nhãn thành kỳ đang xem.

## tong-quan-pos

Nguồn: `Home.OverviewView`, `Pos`, `DashboardView`.

- Tổng quan POS; Kỳ/POS, Tổng đơn hàng, Doanh thu đơn chốt, Tỷ lệ chốt (kèm phân số), Khách mua hàng (khách có đơn chốt trong (i)); so kỳ trước, đối soát.
- Xu hướng doanh thu theo giờ khi một ngày, theo ngày khi nhiều ngày. Trạng thái đơn hàng, Theo POS, chạm POS chỉ xem POS đó, đồng bộ Pancake.
- Chạm số → `MetricExplain` → đơn nếu có quyền; trạng thái → danh sách theo ngày tạo. Giữ kỳ/POS khi mở đơn.
- Nguồn hình: `Overview.current/compare.total` với `orders/closedNet/closedOrders/customers/closedCustomers/groups`; `byPos[].posId/orders/closedOrders/closedNet`; `series[].bucket/posId/closedNet`; một ngày dùng `Shift.hourly[].hour/value`; `reconcile.orders/gross/net/discount`, `syncedAt`. `shownRate`/`rateFrac` theo Cách tính, không lấy tỷ lệ cố định bảng nhân viên thay thế.

## don-hang

Nguồn: `PipelineView`, `Search`, `Tabs.OrdersHome`.

- Tìm SĐT, mã đơn hoặc tên khách; kết quả tìm riêng với danh sách mới nhất; tìm trong Hồ sơ khách; bộ lọc danh sách; Kỳ, POS, Theo giờ chốt / Theo ngày tạo.
- Năm bước đúng thứ tự: Mới, Xác nhận, Giao vận, Đã giao, Trả hàng. Tỷ lệ giao thành công, Tổng đơn chốt và tiền. Đơn cần lưu ý: Chờ chuyển hàng (đã đóng, chưa giao), Đã xác nhận chưa đóng hàng, Hoàn / trả hàng, Hủy sau khi chốt; Xem tất cả.
- Danh sách đơn hàng: bộ lọc Mới/Xác nhận/Giao vận/Đã giao, POS, đơn mới nhất; mã, trạng thái, tiền, POS, khách đã ẩn thông tin liên lạc, thời gian. Kết quả rỗng, lỗi tìm, tải thêm giữ riêng.
- Chạm bước/việc → `.orders` với group và basis đúng; dòng đơn → `.order(id)`; tìm khách → `.customerSearch`. Tìm số liên lạc/mã có phạm vi riêng theo `SearchText`, không hứa luôn theo kỳ/POS của tên.
- Nguồn hình: `Pipeline.total/byEmployee/byPos`, bucket `orders/net/gross`; khóa `unconfirmed/processing/shipping/delivered/returned/shipped/closed/waiting/confirmed/cancelled`. Khi basis confirmed không có số Mới theo ngày tạo, không bịa thêm. `OrderPage.orders/page/hasMore` cho danh sách.

## chi-tiet-don

Nguồn: `Shared.OrderListView/OrderDetailView/CustomerDetailView`, `PipelineView`.

- Ba trang: danh sách đơn một bước, một đơn, hồ sơ khách. Danh sách có tìm, lọc, tổng/tiền nếu nguồn có, tải thêm, trạng thái, người bán, mã, POS, khách, thời gian.
- Một đơn: mã/trạng thái/trạng thái phụ; POS và mở Pancake; khách → hồ sơ; địa chỉ/người nhận dạng minh hoạ không liên lạc; người tạo/bán/chăm sóc/marketer/người xác nhận; các mốc tạo/gán/xác nhận/giao/hoàn/hủy/cập nhật; nguồn/kho/ghi chú/lý do hoàn/tracking; tổng tiền hàng/giảm giá/tiền sau giảm/phí vận chuyển/COD/số lượng; sản phẩm (số lượng, giá, giảm, tổng, trả, quà), lịch sử thay đổi trạng thái.
- Hồ sơ khách: Tổng chi tiêu, Số đã mua, từ ngày/POS, người chăm sóc, marketing/nguồn, nhãn, ghi chú; Đơn tạo / chốt, Mua thành công, Giá trị TB đơn, Hoàn / hủy; lịch sử mua hàng và lần mua; Gọi điện/Nhắn tin chỉ vẽ nút không có đích liên lạc thật.
- Chạm lịch sử → đơn; Xem tất cả → lịch sử đầy đủ, giữ khách/POS. Quay lại đúng danh sách gốc.
- Nguồn hình: `OrderDetail.items/history` cùng các trường mốc và tiền trong `API.swift`; `CustomerDetail.stats.successNet/successOrders/orders/closedOrders/averageOrder/returnedOrders/cancelledOrders`, `profile.tags/notes/sources/marketers`, `orders[].successRank/net/createdAt`. Không dựng đường thời gian tích luỹ ngoài lịch sử được trả.

## phong-ban

Nguồn: `DeptsHome.DeptEntry`.

- Danh sách phòng theo quyền: Sale, CSKH, Marketing, Vận đơn, Nhân sự; phụ đề chức năng, số chờ duyệt nhân sự nếu có. Không giả số hiệu suất ở trang chỉ có điều hướng.
- Trang chính và lối phụ mở đúng `DeptEntry.route/subs.route`: Sale → nhân viên/data/ca; CSKH → Tổng quan/cuộc gọi/khách/mua lại/lâu chưa mua/KPI; Marketing → phân tích/xếp hạng; Nhân sự → Tổng quan/Danh sách/Sơ đồ/Duyệt/Tuyển dụng.
- Nguồn hình: số phòng từ danh sách được cấp và `hrBadge`; không có series kinh doanh tại trang này. Chữ ký trang nên là sơ đồ lối vào, không biểu đồ số mới.

## sale

Nguồn: `Departments.DeptPage/SaleContent`, `CskhViews.CompareView`.

- Trang bộ phận và trang so sánh; kỳ/POS/nhóm đơn/Team theo nguồn. Doanh thu chốt bộ phận, Tổng nhân sự, Tổng đơn chia, Tổng đơn chốt, Trung vị tỷ lệ chốt. NHÂN VIÊN NỔI BẬT, Hiệu suất đội ngũ top 15, Đơn chia vs. tỷ lệ chốt, Nhân viên nổi bật, Cần hỗ trợ.
- So sánh chi tiết: Nhân viên/Bộ phận/Đơn chia/Đơn chốt/Tỷ lệ chốt/Doanh thu/AOV/kỳ trước; sắp Doanh thu/Đơn chốt/Tỷ lệ chốt, Xuất Excel. Nổi bật/cần hỗ trợ chỉ xét từ 10 đơn chia. Liên kết bảng từng nhân viên, Data, Trong ca, vận hành đơn theo menu hiện hữu.
- Chạm nhân viên → `StaffDetailQuery.of` giữ bộ lọc; chạm đơn → danh sách cùng người/kỳ/basis. Không đổi vị trí đường vào hiện hành.
- Nguồn hình: `Overview.current.byEmployee` và `compare.byEmployee`, `EmployeeRow.assignedOrders/closedOrders/closedNet/shownRate/averageOrder`, `department/sellerId/name`. Cột xếp hạng, scatter data–tỷ lệ với cỡ theo tiền; tỷ lệ tổng theo nguồn và Cách tính.

## nhan-vien-bang

Nguồn: `StaffTable`, `StaffCompare`, `Terms`, `StaffAPI`, `ShiftView`, `CskhViews.BatchesView` (định nghĩa thực ở CskhViews, dù bảng plan trỏ Departments).

- Ít nhất bốn khung sau này: Từng nhân viên Sale/CSKH; So cùng kỳ; Data được cấp; Điều hành trong ca. Bảng ngang có cuộn, tiêu đề và Tổng chỉ khi có `staffTotal` đúng nguồn.
- Cột đúng chữ: Nhân viên, Số chia, Đơn chốt, Tỷ lệ chốt, Đang đóng hàng, Doanh thu, So cùng kỳ. Sort hai chiều; thiếu tỷ lệ xuống cuối. Chạm số mở bảng lý do/cấu thành; số đóng hàng → đơn đã vào Đang đóng hàng. Không suy ra số thiếu, không cộng hàng thành `staffTotal`.
- Bảng (i): Số chia (đơn lên trong kỳ), Trong đó đã chốt, Chưa chốt / hủy; Đơn chốt trong kỳ, Từ số chia kỳ này, Từ số chia trước đó; Số chia đã chốt / Tổng số chia; Đã vào Đang đóng hàng hoặc đi tiếp, Còn Đã xác nhận chưa đóng, Còn Chờ xác nhận, Hủy trước khi đóng; Doanh thu đơn chốt, Số đơn chốt, GTTB.
- So cùng kỳ: Kỳ liền trước / Cùng thứ tuần trước / Cùng ngày tháng trước / Cùng kỳ năm trước / Tự chọn ngày; Lùi bao xa theo `CmpMode.steps`; ngày từ/đến. Lên xuống / Chênh lệch / Cộng dồn; Đơn chốt / Doanh thu / Tỷ lệ chốt. Kỳ này/Kỳ so, cutoff, Xem cả đội; chạm biểu đồ nhỏ → focus người ở đồ thị to, không mở nhầm chi tiết đơn. Thiếu chart/rowsTotal/seriesRate → — và trạng thái hỗ trợ theo code.
- Data: Tổng số điện thoại đã nhận, Tỷ lệ mua (toàn bộ), Tất cả/Đang triển khai/Đã hoàn thành, đợt theo tháng, nhân viên, số được giao/đã mua/tiền/tỷ lệ; mở đợt giữ tháng.
- Trong ca: chọn ngày/ca; Tiến độ ca làm, Số đã nhận/Số đã chốt/Tỷ lệ chốt nóng, Đơn chốt/Giá trị đơn chốt; Hiệu suất nhân viên; Diễn biến trong ca theo giờ; Xác nhận mới nhất; cảnh báo và đồng bộ.
- Nguồn hình: `StaffRow/StaffSum.created/createdClosed/closed/closeRate/packed/packedRate/closedNet/aov/waiting/confirmedNotPacked/cancelledBeforePack/closedFromCreated/closedFromEarlier/createdOpen`. `StaffCompare.current/previous/rowsTotal/staff[].series/seriesRate/chart`, `CmpCell.closed/closedNet/created/createdClosed/closeRate`, `CmpChart.len/current/previous`, `ChartPoint.cumClosed/cumClosedNet`, `compare.cutoff`, `bucket/group`. `Batch.month/received/buyers/repeatBuyers/buyRate/orders/net/sellerName`. `Shift.hourly.hour/received/closed/value`, `staff.received/closed/rate/hotValue/pending/assignedHidden`, `feed`, `alerts`, `hours`.

## chi-tiet-nhan-vien

Nguồn: `StaffDetail`, `StaffDetailTerms`.

- Tên/bộ phận, phạm vi; Tỷ lệ chốt (phân số chốt/chia hoặc tạo), Đơn chốt, Doanh thu chốt, AOV, Số chia/Đơn chia hoặc Đơn tạo và số liên lạc khác nhau. Số chia CSKH chỉ hiện đúng quyền, giữ lời giải thích khi ẩn.
- Trạng thái hiện tại của đơn chia/tạo, đã chốt/chưa chốt; Lý do chưa chốt, Mới/Hủy từng lý do; cờ chỉ đếm 2.000 đơn mới nhất; Thẻ khác trên đơn chưa chốt; danh sách đơn, thẻ, ghi chú đơn/khách, mốc/POS/marketer/tiền; số đang hiện/tổng, có thêm; lọc lý do/trạng thái, bỏ lọc.
- Chạm KPI → đơn của nhân viên cùng basis; lý do/trạng thái → lọc danh sách tại chỗ; dòng → chi tiết đơn. Máy chủ chưa có trang → Xem đơn chốt.
- Nguồn hình: `StaffDetailReport.summary/previousSummary` với `orders/closedOrders/closedNet/averageOrder/assignedOrders/assignedHidden/rate/rateTop/rateDen/createdPhones/assignedPhones`; `base.kind/total/closed/open`, `statuses.key/label/n/closed`, `reasons.reason/kind/n/byStatus.new/cancelled`, `otherTags`, `orders`, `hasMore`, `reasonsPartial`, `definitions`, `assignedVisible/rateBase`. Không biến bộ đếm lý do cắt ngọn thành toàn bộ nhân viên.

## cskh

Nguồn: `CskhOverview`, `CskhViews` (Calls/Care/Repurchase/Dormant/Kpi), `Departments.CskhContent`.

- Tổng quan: Đơn chốt CSKH, Doanh thu CSKH, Đơn chốt, Giá trị TB đơn, Tỷ lệ chốt; so kỳ trước; Doanh thu theo ngày/nhân viên; Hôm nay đã gọi; KPI tháng, Đã đạt, mức cần đạt tới hôm nay, So với tiến độ, Cần mỗi ngày còn lại, Hôm nay; Từng người → KPI.
- KPI: Đổi nhân viên; Khách cần chăm sóc, Đã chăm sóc, Đơn chốt, Doanh thu từ KH CSKH; Mục tiêu tháng/Sửa; Số khách cần chăm sóc, Số đơn chốt, Doanh thu (triệu đồng); Hiệu suất 6 tháng. Giữ quyền sửa mục tiêu và chưa đặt KPI.
- Cuộc gọi: Tổng cuộc gọi, Hoàn thành liên hệ, Cuộc gọi (ghi chú), Số khách đã gọi, Cuộc gọi / người / ngày, Đơn chốt theo người bán, Dữ liệu ghi chú đã gom; Tất cả/Chưa liên hệ/Đã liên hệ; Theo ngày, Theo nhân viên; Xuất Excel; danh sách khách đã/chưa gọi.
- Khách theo nhân viên: Khách được phân công, số đã mua/tiền; chọn người/sort/tìm/lọc ngày; Cần chăm sóc, Có nguy cơ rời, Chưa ghi chú, Vừa chăm sóc; danh sách có ngày từ ghi chú, đơn thành công, tiền, người phụ trách; Xem chi tiết → hồ sơ khách.
- Mua lại & Upsell: Khách mua lại, Doanh thu từ khách cũ; phễu Tổng khách đã mua/Mua từ 2 lần/Mua từ 3 lần/Mua lại trong kỳ; sản phẩm mua lại nhiều; theo nhân viên; khách vừa mua lại, cấp upsell/đơn thứ/nhãn. Khách lâu chưa mua: nhóm ngày, tìm/nhân viên, danh sách ưu tiên, số ngày, lần mua, tiền, Xem thêm → hồ sơ.
- Nguồn hình: overview như Sale; `CskhBadge.callsToday/over20`; `Targets.items.scope/refId/revenue/closedOrders`; `Calls.staff[].notes/customers/orders/net/assigned/activeDays/byDay` (`CallDay.notes/customers/orders/net`), `coverage.customers/notes/firstNote/lastFetch`, `period.days`; `Care.summary.total/neverNoted/over20/buyers/purchased/closedOrders/closedNet`, `staff.assigned/over7/over20/neverNoted/notedToday`, `rows`; `Repurchase.funnel.once/twice/thrice`, `summary.levels/repurchase/successOrders`, `byEmployee/byTag/recent`; `CustomerPage.customers[].daysSinceSuccess/successNet/successOrders`, `hasMore`. Đồ thị sáu tháng dùng series groupBy month của overview riêng. Giữ lưu ý khối KPI/cuộc gọi chưa lọc team.

## marketing

Nguồn: `MarketingView`, `MarketingRank`, `Terms.MarketingRankTerms`.

- Marketing: kỳ/POS, bộ lọc marketer/team/sản phẩm, Bỏ lọc; Doanh thu MKT, Chi phí quảng cáo, Số về, Đơn chốt, Chi phí mỗi số, Chi phí mỗi đơn chốt, so Kỳ trước, ROAS theo nguồn. Biểu đồ số về/đơn chốt/chi phí theo bucket; chạm/kéo xem điểm.
- Tách theo người/team/sản phẩm/ngày; sort Tên/Chi phí QC/Doanh thu/ROAS/Đơn chốt/Số/CP / đơn/CP / số; chạm dòng lọc cả trang, chạm lại bỏ. Chi phí mọi POS: khoá tỷ số và sort cần mọi POS, giữ lời báo. Sản phẩm có thể đếm trùng đơn, không cộng hàng thành tổng.
- Xếp hạng marketer/team: Theo team/Theo nhân viên, Xếp theo, Cách tính, tổng đơn duy nhất; chi tiết Đơn tạo, SĐT, Đơn XN, Tỷ lệ XN, Đơn theo mốc, Doanh thu, DT New, DT CSKH, Hoàn / hủy (tiền), Sau hoàn hủy, DT / SĐT, AOV, Đã cho ĐVVC, Đã nhận, % giao TC, Hoàn / hủy. Xem riêng team/marketer, Đóng; giữ lưu ý không lọc sản phẩm sheet.
- Nguồn hình: `MktAnalytics.current/prev`, `RoasMetrics.cost/net/closed/orders/phones/coveredNet/coveredClosed/coveredPhones/marketers/roas/costPerClosed/costPerLead`; `period/previous.cutoff/costUntil`, `bucket`, `timeline` (`RoasPoint`), `people/teams/products`; xếp hạng dùng `MarketingRankReport.summary/definitions` và hàng theo lựa chọn trong `MarketingRank`. Không chia tổng chi phí cho số đã thu hẹp POS.

## van-don

Nguồn: `Departments.VanDonView`, `VdBasis`.

- Kỳ/POS/Team, Doanh số chuyển đi, Đơn chuyển đi, Hoàn và tỷ lệ, Đã nhận, Không xác nhận được; Từ Chờ xác nhận đến giao: Vào Chờ xác nhận, Đã xác nhận, Đã chuyển đi. Bộ lọc và (i) nói rõ hai mốc ngày khác nhau.
- Bảng Theo người lên đơn, Bộ phận, Vào chờ XN, Chuyển đi, Hoàn, % hoàn (đơn và giá trị); Người gọi xác nhận, số đã XN/không XN/chuyển đi/tỷ lệ XN/hoàn; Lý do không xác nhận được; đồng bộ và cảnh báo kỳ ngắn.
- Dòng giải thích trong hình dùng “tính riêng, không cộng vào tổng công ty”. Không dùng thuật ngữ tiền của các phòng khác ở bất kỳ chỗ nào của hai màn Vận đơn.
- Điều hướng và phạm vi theo code: bộ lọc tải lại, phần giải thích mở tại chỗ; không gắn đích đơn mới cho các số vốn chỉ trình bày trong `VanDonView`.
- Nguồn hình: `VanDon.total/sellerDepts/confirmers`, mỗi `VdLine` có `closed/closedNet/confirmed/waiting/failed/cancelledAfter/sent/sentNet/delivered/returned/returnedNet/confirmRate/failRate/returnRate/returnRateNet`; `reasons.reason/n`, `period`, `sentBasis`, `syncedAt`. Nhãn ứng với `closed` là Đơn vào Chờ xác nhận; không dùng tên trường nội bộ làm chữ trên giao diện. Không vẽ biến động tỷ lệ hoàn kỳ ngắn.

## thong-bao

Nguồn: `Tabs.AlertsPage/AlertCenter`, `HomeFeed.AlertRow`, `Kit.SyncStatus`.

- Cần xử lý: đơn mới chưa chốt; đồng bộ lỗi/chậm theo POS; khách quá 20 ngày chưa ghi chú; yêu cầu nhân sự chờ duyệt, theo quyền. Trong ca: Số đã nhận/Số đã chốt/Chốt nóng và cảnh báo ca. Đồng bộ Pancake theo POS: trạng thái, lần cập nhật, lỗi.
- Dòng có route → đúng trang xử lý (đơn mới basis created; khách lâu chưa note; duyệt nhân sự; đồng bộ). Dòng không có route không giả liên kết. Tải lại, lỗi/không việc khẩn cấp giữ riêng.
- Nguồn hình: `AlertCenter.items(sync:)` có `title/sub/icon/tone/route`; `shift.total/staff/alerts`; `SyncPos.posId/records/lastSyncAt/lastError/status/errors24h`. Có thể vẽ phân nhóm việc, không vẽ lịch sử cảnh báo chưa được trả.

## them

Nguồn: `Tabs.MoreHome/SatelliteSection`, `MoreViews.MonthlyView`.

- Thêm: tài khoản/vai trò (không ghi liên lạc), quét đăng nhập máy tính, các lối báo cáo/khách/bảo mật/cách tính/cấu hình/nhật ký/cài đặt; Vận hành đơn, Điều hành trong ca, Tổng quan theo từng POS; Web vệ tinh/Nhân sự theo quyền; Chính sách bảo mật; Đăng xuất.
- Báo cáo cuối tháng: tháng/POS, Tổng doanh thu, Tổng đơn hàng, Đơn đã giao, Đơn đang xử lý, Đơn hủy; Xu hướng doanh thu, Doanh thu chốt, Tăng trưởng; theo POS, Xuất báo cáo; Ghi chú & Định nghĩa số liệu và đồng bộ.
- Chạm dòng → `Route.page/overview/web/hr` đúng nguồn; xuất dùng sheet chia sẻ, không tải file trong bản HTML.
- Nguồn hình: `Overview.current/compare.total/byPos/series` theo tháng; biểu đồ cộng dồn theo ngày trong `MonthlyView`, tiền theo giờ xác nhận lần đầu, trạng thái theo ngày tạo. Danh mục Thêm không tự có số tổng mới.

## trang-phu

Nguồn: `Shared.CustomerSearchView`, `MoreViews`, `Security`, `Metrics`, `Config`, `AppSettings`.

- Tám trang phần đầu phải có ở bước sau: Hồ sơ khách hàng; Báo cáo tùy chỉnh; Đơn nguồn Pancake POS; Bảo mật tài khoản; Cách tính; Cấu hình & kết nối; Nhật ký hoạt động; Cài đặt trên máy này.
- Hồ sơ khách: tìm theo tên/số liên lạc, POS, kết quả → hồ sơ. Báo cáo tùy chỉnh: Đặt lại, Thêm chỉ số, Thời gian/POS/Nhân viên, cách nhóm, cột/đường/tròn/bảng, Xem trước báo cáo; chạm cột → đơn cấu thành, nhớ trên máy.
- Đơn nguồn: POS/Khoảng thời gian/Trạng thái đơn/tìm, số đơn/cập nhật, mã/POS/khách/sản phẩm/giá trị, Tải thêm, mở đơn. Bảo mật: khoá luôn bật, Passkey (Face ID), 2FA, Đổi mật khẩu, danh sách passkey và gỡ, phiên đăng nhập/máy tin cậy, đăng xuất máy đó/mọi máy khác; các sheet bật/tắt mã và mật khẩu, chỉ vẽ trống.
- Cách tính: cơ sở tỷ lệ (Đơn lên/Data được chia/Đơn đã gửi ĐVVC), doanh số/nhóm thành công theo lựa chọn, Về mặc định công ty; Số tham chiếu Pancake không đổi. Cấu hình: kết nối POS/Shop ID, Đồng bộ ngay/tất cả, lần đồng bộ/lỗi/lịch; Phân công theo team; quyền truy cập; cảnh báo tỷ lệ thấp; Telegram; Ca làm cá nhân. Chỉ mô tả điều khiển, không chép thông tin kết nối hay mã ghép.
- Nhật ký: thời gian/nhóm/tìm, danh sách hành động/người minh hoạ/trạng thái/đích/chi tiết, tổng sự kiện, tải trang. Cài đặt máy: logo Chỉ lần đầu/Mỗi lần mở, Mở app vào, giữ khoá mỗi lần quay lại; chỉ lưu máy.
- Nguồn hình: `CustomerPage`/kết quả customerSearch; báo cáo `Overview.current.total/byPos/byEmployee/series/groups`; `Security.totpEnabled/passkeys/devices/mfaRequired/mfaEnabled`, `Sessions.sessions` (chỉ biểu diễn thiết bị giả); `MetricPrefs`; `Config.alert/shops`, `SyncStatus.pos`; `Audit.items/total/page/labels/groups`; `IntroMode` và lựa chọn tab. Không biểu đồ hoá bí mật, không biểu diễn giá trị cấu hình thực.

## nhan-su

Nguồn: `HRViews`, `RecruitView`, `Tabs.SatelliteSection`.

- Tổng quan: kỳ, Quân số, Vào, Nghỉ, Tỉ lệ nghỉ, Thử việc, Chờ duyệt; chưa xếp phòng; Theo chi nhánh/phòng ban; Quân số 12 tháng, Vào / nghỉ theo tháng; định nghĩa quân số và nghỉ.
- Danh sách: tìm/lọc trạng thái/chi nhánh/phòng; người và vai trò/kiêm nhiệm → hồ sơ. Hồ sơ: Thông tin chung, Vai trò & chức vụ, Quản lý trực tiếp/Báo cáo cho/Cấp dưới, Lịch sử trạng thái, Yêu cầu thay đổi; khối doanh thu tháng/Đơn chốt/Hạng/Từ trước tới nay/so cùng số ngày tháng trước/Doanh thu 6 tháng nếu có quyền và dữ liệu.
- Sơ đồ: chi nhánh/phòng/team/quân số/phụ trách; tìm người/phòng; chạm phòng → danh sách, chạm người → hồ sơ. Duyệt thay đổi: trạng thái, loại yêu cầu/người gửi/người duyệt/ghi chú; duyệt từng hoặc Duyệt tất cả được quyền, Từ chối mở sheet lý do.
- Tuyển dụng: Tổng quan/Ứng viên/Vị trí tuyển/Lịch phỏng vấn; Tổng ứng viên/Đang xét duyệt/Phỏng vấn/Đã tuyển; vị trí và số ứng viên; lọc trạng thái/tìm; ứng viên → chi tiết thông tin sheet/lịch sử cập nhật/CV; thêm ứng viên mở sheet ngoài trong app thực (bản hình không mở).
- Nguồn hình: `hrOverview` với `series[].month/headcount/joined/left`, `departments`, `offices`; `hrPeople`, `hrOrg.units.parent_id/head`, `hrApprovals.can_decide/state`; hồ sơ `performance.series[].month/revenue` theo dữ liệu `PersonView`; `RecruitList.candidates/statusLabels/sources`, `Candidate.status/position/team/receivedOn/updatedAt/cvViewable`, `CandidateDetail.events/cv`. Cấm lấy tên/liên lạc thực cho hình.

## bo-loc-trang-thai

Nguồn: `PeriodChips`, `CskhViews.CustomRangeSheet`, `Pos`, `HrTeam`, `Shared.ExplainSheet/OrderFilterSheet`, `Kit.StateView`.

- Sáu khung tối thiểu: chọn kỳ; chọn POS/team; bảng (i); đang tải; lỗi; trống. Sheet có tay kéo, nền trang mờ sau, Đóng/Áp dụng/Hủy theo điều khiển thực.
- Kỳ nhanh Hôm nay/Hôm qua/Tuần này/Tháng này/Tháng trước/Khác…; từ/đến hợp lệ. POS: tất cả hoặc POS được cấp. Team: Mọi team, nhóm Sale/CSKH theo chi nhánh, tên/people/Mentor; Bỏ chọn team. Khối không hỗ trợ phải giữ cảnh báo chưa lọc.
- (i): `MetricExplain.title/value/definition/period/previous/reconcile/count/query`, Xem đơn khi được cấp; lọc đơn POS/nhóm trạng thái/tính theo Ngày tạo/Ngày chốt/Ngày chia.
- Đang tải không giả 0; lỗi đúng nhóm (mất mạng, máy chủ chậm, chưa có quyền, hết phiên) và Thử lại khi có; trống có lời giải thích theo trang, không báo trống trong lúc lỗi.
- Nguồn hình: chỉ dữ liệu điều khiển đã có (`Period.range`, `Pos` danh mục, `HrTeamItem.id/name/dept/office/people/mentor`); không cần API phân tích mới. Lỗi và loading là trạng thái, không số kinh doanh.

## Quyết định T1 và câu hỏi còn lại

- A “Quỹ đạo”: khối chủ 360 điểm, cung kép so tổng hôm nay với hôm qua cả ngày, ba dòng bộ phận có thanh cặp cùng giờ; nền xanh đen và kính trên quầng màu. Chữ ký là cung hở có dấu mốc; không gán bốn bộ phận thành một tổng.
- B “Mảng sáng”: khối chủ 360 điểm dạng bảng áp phích lệch trục, số bên trái và các cột POS phía dưới; các mảng bộ phận khác kích thước; thanh tab liền nền có Tổng quan nhô lên. Chữ ký là góc cắt và dải màu thẳng đứng.
- Hai hướng đều có bảng màu sáng/tối, hệ chữ, icon, đồ thị dùng chung trong `index.html`; chỉ hai màn Hôm nay được viết sẵn. Chuyển động gợi ý cho app: numericText, trim đồ thị, co nhẹ khối đầu khi cuộn, sensoryFeedback khi chạm; bản HTML chỉ mô phỏng đồ thị/co khối, không giả rung thiết bị.
- Chưa xem bằng mắt, tổ app xem. Không mở trình duyệt theo yêu cầu.
- Câu hỏi còn lại: chọn A hay B sau khi xem; có đổi tên tab Trang chủ thành Hôm nay hay giữ? Hiện giữ Trang chủ để an toàn. Không có câu hỏi chặn T1.
