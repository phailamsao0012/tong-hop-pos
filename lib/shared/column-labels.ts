/** Tên cột dùng chung. Không dùng chữ tắt này cho file xuất Excel. */
export const COLUMN_LABELS: Record<string, { full: string; short: string; hint: string }> = {
  "Doanh thu": {
    "full": "Doanh thu",
    "short": "DT",
    "hint": "Giá trị doanh thu của dòng báo cáo; phạm vi theo bộ lọc và mốc thời gian của bảng."
  },
  "Doanh số": {
    "full": "Doanh số",
    "short": "DS",
    "hint": "Giá trị doanh số của dòng báo cáo trong phạm vi bảng."
  },
  "Doanh thu New": {
    "full": "Doanh thu New",
    "short": "DT New",
    "hint": "Doanh thu phần New của dòng báo cáo, theo bộ lọc và mốc đang chọn."
  },
  "Doanh thu CSKH": {
    "full": "Doanh thu CSKH",
    "short": "DT CSKH",
    "hint": "Doanh thu phần CSKH của dòng báo cáo theo bộ lọc đang chọn."
  },
  "Doanh thu theo mốc": {
    "full": "Doanh thu theo mốc",
    "short": "DT mốc",
    "hint": "Doanh thu của các đơn đạt mốc thời gian đang chọn."
  },
  "Doanh thu sau hoàn hủy": {
    "full": "Doanh thu sau hoàn hủy",
    "short": "DT sau HH",
    "hint": "Doanh thu sau khi trừ phần hoàn và hủy của dòng báo cáo."
  },
  "Doanh thu / SĐT": {
    "full": "Doanh thu / SĐT",
    "short": "DT/SĐT",
    "hint": "Doanh thu chia số điện thoại có đơn trong phạm vi báo cáo."
  },
  "Số điện thoại": {
    "full": "Số điện thoại",
    "short": "SĐT",
    "hint": "Số điện thoại gắn với khách hoặc đơn của dòng này."
  },
  "Đơn xác nhận": {
    "full": "Đơn xác nhận",
    "short": "Đơn XN",
    "hint": "Số đơn đã xác nhận trong phạm vi báo cáo."
  },
  "Tỷ lệ xác nhận": {
    "full": "Tỷ lệ xác nhận",
    "short": "TL XN",
    "hint": "Số đơn xác nhận chia số đơn tạo trong kỳ."
  },
  "Tỷ lệ chốt": {
    "full": "Tỷ lệ chốt",
    "short": "TL chốt",
    "hint": "Tỷ lệ chốt theo cách tính và phạm vi đang chọn ở trang."
  },
  "Tỷ lệ giao thành công": {
    "full": "Tỷ lệ giao thành công",
    "short": "TL giao TC",
    "hint": "Tỷ lệ đơn giao thành công trong phạm vi báo cáo."
  },
  "Đơn theo mốc": {
    "full": "Đơn theo mốc",
    "short": "Đơn mốc",
    "hint": "Số đơn đạt mốc thời gian đang chọn."
  },
  "Tiền hoàn / hủy": {
    "full": "Tiền hoàn / hủy",
    "short": "Hoàn/hủy",
    "hint": "Giá trị tiền hoàn và hủy trong phạm vi báo cáo."
  },
  "Chi phí / đơn New": {
    "full": "Chi phí / đơn New",
    "short": "CP/đơn New",
    "hint": "Chi phí quảng cáo chia số đơn New của dòng báo cáo."
  },
  "Chi phí / số": {
    "full": "Chi phí / số",
    "short": "CP/số",
    "hint": "Chi phí quảng cáo chia số điện thoại của dòng báo cáo."
  },
  "% chi phí / DT New": {
    "full": "% chi phí / DT New",
    "short": "%CP/DT New",
    "hint": "Chi phí quảng cáo chia doanh thu New, biểu diễn bằng phần trăm."
  },
  "Giá trị đơn trung bình": {
    "full": "Giá trị đơn trung bình",
    "short": "AOV",
    "hint": "Giá trị trung bình trên mỗi đơn trong phạm vi báo cáo."
  },
  "Khách hàng mới": {
    "full": "Khách hàng mới",
    "short": "KH mới",
    "hint": "Khách hàng mới trong phạm vi báo cáo."
  },
  "Tình trạng note": {
    "full": "Tình trạng note",
    "short": "TT note",
    "hint": "Tình trạng ghi chú chăm sóc khách đang được phân công."
  },
  "Chưa note lần nào": {
    "full": "Chưa note lần nào",
    "short": "Chưa note",
    "hint": "Khách được phân công chưa từng có ghi chú."
  },
  "Note hôm nay": {
    "full": "Note hôm nay",
    "short": "Note nay",
    "hint": "Khách có ghi chú trong khoảng thời gian trang đang thống kê."
  },
  "DT tự chốt": {
    "full": "DT tự chốt",
    "short": "DT tự",
    "hint": "Doanh thu đơn do chính người đang cầm khách bán, cộng dồn mọi thời gian."
  },
  "Ghi chú trao đổi": {
    "full": "Ghi chú trao đổi",
    "short": "GC trao đổi",
    "hint": "Nội dung trao đổi đã ghi cho khách hàng."
  },
  "Đường đi nhiều nhất": {
    "full": "Đường đi nhiều nhất",
    "short": "Đường đi chính",
    "hint": "Chuỗi nhóm sản phẩm được mua phổ biến nhất trong dòng báo cáo."
  },
  "Ngày có gọi": {
    "full": "Ngày có gọi",
    "short": "Ngày gọi",
    "hint": "Số ngày có ghi nhận cuộc gọi trong kỳ."
  },
  "Khách đã gọi": {
    "full": "Khách đã gọi",
    "short": "KH đã gọi",
    "hint": "Số khách đã có ghi nhận cuộc gọi trong kỳ."
  },
  "Data đang cầm": {
    "full": "Data đang cầm",
    "short": "Data cầm",
    "hint": "Số khách hiện được phân công, không theo kỳ báo cáo."
  },
  "Nội dung ghi chú": {
    "full": "Nội dung ghi chú",
    "short": "ND ghi chú",
    "hint": "Nội dung ghi chú của lần trao đổi này."
  },
  "Doanh thu đơn chốt": {
    "full": "Doanh thu đơn chốt",
    "short": "DT đơn chốt",
    "hint": "Doanh thu của các đơn chốt trong phạm vi đang chọn."
  },
  "Hoàn thành mục tiêu": {
    "full": "Hoàn thành mục tiêu",
    "short": "Đạt mục tiêu",
    "hint": "Mức hoàn thành so với mục tiêu được giao."
  },
  "Người bán / chốt": {
    "full": "Người bán / chốt",
    "short": "NV bán/chốt",
    "hint": "Người bán hoặc người chốt được ghi nhận trên đơn."
  },
  "Tổng tiền mua": {
    "full": "Tổng tiền mua",
    "short": "Tổng mua",
    "hint": "Tổng giá trị mua của khách trong phạm vi bảng."
  },
  "Sản phẩm hay mua": {
    "full": "Sản phẩm hay mua",
    "short": "SP hay mua",
    "hint": "Các sản phẩm khách thường mua theo dữ liệu của bảng."
  },
  "Chưa mua (ngày)": {
    "full": "Chưa mua (ngày)",
    "short": "Chưa mua (ng)",
    "hint": "Số ngày kể từ lần mua gần nhất của khách."
  },
  "Tên khách hàng": {
    "full": "Tên khách hàng",
    "short": "Tên KH",
    "hint": "Tên khách hàng của dòng dữ liệu."
  },
  "Lần mua gần nhất": {
    "full": "Lần mua gần nhất",
    "short": "Lần mua cuối",
    "hint": "Thời điểm mua gần nhất được ghi nhận của khách."
  },
  "Giá trị đã mua": {
    "full": "Giá trị đã mua",
    "short": "GT đã mua",
    "hint": "Giá trị mua đã được ghi nhận cho khách trong phạm vi bảng."
  },
  "Nhân viên phụ trách": {
    "full": "Nhân viên phụ trách",
    "short": "NV phụ trách",
    "hint": "Nhân viên hiện được phân công chăm sóc khách."
  },
  "Mua lần đầu (thẻ)": {
    "full": "Mua lần đầu (thẻ)",
    "short": "Mua đầu (thẻ)",
    "hint": "Lượt mua lần đầu được thống kê theo thẻ của dòng."
  },
  "Đơn mua lại": {
    "full": "Đơn mua lại",
    "short": "Đơn lặp",
    "hint": "Số đơn mua lại trong phạm vi báo cáo."
  },
  "Khách mua lại": {
    "full": "Khách mua lại",
    "short": "KH mua lại",
    "hint": "Số khách có mua lại trong phạm vi báo cáo."
  },
  "Tỷ lệ mua lại": {
    "full": "Tỷ lệ mua lại",
    "short": "TL mua lại",
    "hint": "Tỷ lệ mua lại theo nhóm khách và phạm vi của bảng."
  },
  "Doanh thu mua lại": {
    "full": "Doanh thu mua lại",
    "short": "DT mua lại",
    "hint": "Doanh thu từ các đơn mua lại trong phạm vi báo cáo."
  },
  "Mua lại (gộp)": {
    "full": "Mua lại (gộp)",
    "short": "Mua lại gộp",
    "hint": "Số mua lại gộp các mức trong bảng."
  },
  "Bắt đầu bằng": {
    "full": "Bắt đầu bằng",
    "short": "Bắt đầu",
    "hint": "Nhóm sản phẩm ở lần mua bắt đầu của khách."
  },
  "Số được cấp": {
    "full": "Số được cấp",
    "short": "Số cấp",
    "hint": "Số khách được cấp cho nhân viên trong phạm vi bảng."
  },
  "Tỷ lệ mua": {
    "full": "Tỷ lệ mua",
    "short": "TL mua",
    "hint": "Số khách đã mua chia số khách được cấp của dòng."
  },
  "Số lần mua": {
    "full": "Số lần mua",
    "short": "Lần mua",
    "hint": "Số lần khách mua theo dữ liệu của bảng."
  },
  "Lần gần nhất": {
    "full": "Lần gần nhất",
    "short": "Lần cuối",
    "hint": "Thời điểm gần nhất được ghi nhận của dòng."
  },
  "Giá trị đơn": {
    "full": "Giá trị đơn",
    "short": "GT đơn",
    "hint": "Giá trị của đơn theo chỉ số đang hiển thị trong bảng."
  },
  "Người nhận việc": {
    "full": "Người nhận việc",
    "short": "NV nhận việc",
    "hint": "Người được giao thực hiện công việc."
  },
  "Thời điểm (giờ Việt Nam)": {
    "full": "Thời điểm (giờ Việt Nam)",
    "short": "Giờ VN",
    "hint": "Thời điểm sự kiện theo giờ Việt Nam."
  },
  "Web đã kéo": {
    "full": "Web đã kéo",
    "short": "Đã kéo",
    "hint": "Thông tin dữ liệu đã được web đồng bộ."
  },
  "Trường dữ liệu mẫu": {
    "full": "Trường dữ liệu mẫu",
    "short": "Trường mẫu",
    "hint": "Các trường có trong bản ghi dữ liệu mẫu."
  },
  "KPI doanh thu": {
    "full": "KPI doanh thu",
    "short": "KPI DT",
    "hint": "Mục tiêu doanh thu được giao cho tháng đang chọn."
  },
  "Doanh thu tháng": {
    "full": "Doanh thu tháng",
    "short": "DT tháng",
    "hint": "Doanh thu của tháng được hiển thị trong bảng."
  },
  "Doanh thu tháng (Pancake)": {
    "full": "Doanh thu tháng (Pancake)",
    "short": "DT tháng POS",
    "hint": "Doanh thu tháng lấy từ dữ liệu Pancake."
  },
  "Doanh thu tháng (nhân sự)": {
    "full": "Doanh thu tháng (nhân sự)",
    "short": "DT tháng HR",
    "hint": "Doanh thu tháng lấy từ dữ liệu web nhân sự."
  },
  "Dòng sản phẩm": {
    "full": "Dòng sản phẩm",
    "short": "Dòng SP",
    "hint": "Dòng sản phẩm của nhóm đơn đang thống kê."
  },
  "Đơn vào Chờ XN": {
    "full": "Đơn vào Chờ XN",
    "short": "Đơn vào CXN",
    "hint": "Số đơn vào trạng thái Chờ xác nhận theo phạm vi bảng."
  },
  "Giá trị hoàn": {
    "full": "Giá trị hoàn",
    "short": "GT hoàn",
    "hint": "Giá trị của phần hoàn trong phạm vi bảng."
  },
  "% hoàn (giá trị)": {
    "full": "% hoàn (giá trị)",
    "short": "% hoàn GT",
    "hint": "Phần giá trị hoàn biểu diễn bằng phần trăm theo phạm vi bảng."
  },
  "% hoàn (đơn)": {
    "full": "% hoàn (đơn)",
    "short": "% hoàn đơn",
    "hint": "Phần số đơn hoàn biểu diễn bằng phần trăm theo phạm vi bảng."
  },
  "SL bán thực": {
    "full": "SL bán thực",
    "short": "SL thực",
    "hint": "Số lượng sản phẩm bán thực của dòng báo cáo."
  },
  "DT thành công": {
    "full": "DT thành công",
    "short": "DT TC",
    "hint": "Doanh thu phần đơn đã giao thành công trong phạm vi bảng."
  },
  "Họ và tên": {
    "full": "Họ và tên",
    "short": "Họ tên",
    "hint": "Họ tên của người được thống kê trong dòng."
  },
  "Nhân viên CSKH": {
    "full": "Nhân viên CSKH",
    "short": "NV CSKH",
    "hint": "Nhân viên chăm sóc khách hàng của dòng báo cáo."
  },
  "Tiền khách trả": {
    "full": "Tiền khách trả",
    "short": "Tiền KH trả",
    "hint": "Tổng giá trị các đơn đã nhận; phần đã thu tiền được chú thích riêng nếu có."
  },
  "So cùng kỳ": {
    "full": "So cùng kỳ",
    "short": "So kỳ",
    "hint": "So sánh với kỳ trước theo phạm vi trang đang chọn."
  },
  "So kỳ trước": {
    "full": "So kỳ trước",
    "short": "So trước",
    "hint": "Mức thay đổi so với kỳ báo cáo trước."
  },
  "Thời gian tạo": {
    "full": "Thời gian tạo",
    "short": "Giờ tạo",
    "hint": "Thời điểm tạo đơn được ghi nhận trên nguồn dữ liệu."
  },
  "Nhân viên bán": {
    "full": "Nhân viên bán",
    "short": "NV bán",
    "hint": "Nhân viên bán được ghi nhận trên đơn."
  },
  "Xác nhận lúc": {
    "full": "Xác nhận lúc",
    "short": "Lúc XN",
    "hint": "Thời điểm xác nhận đơn được nguồn dữ liệu ghi nhận."
  },
  "Độ đầy đủ": {
    "full": "Độ đầy đủ",
    "short": "Độ đủ",
    "hint": "Mức đầy đủ thông tin của bản ghi được hiển thị."
  },
  "DT đóng hàng trở đi": {
    "full": "DT đóng hàng trở đi",
    "short": "DT đóng+",
    "hint": "Doanh thu các đơn ở nhóm trạng thái đóng hàng trở đi; xem giải thích trạng thái của trang."
  },
  "% DT đóng hàng": {
    "full": "% DT đóng hàng",
    "short": "% DT đóng",
    "hint": "Tỷ trọng doanh thu phần đóng hàng trở đi theo bảng báo cáo."
  },
  "Số được chia": {
    "full": "Số được chia",
    "short": "Số chia",
    "hint": "Số data được chia cho nhân viên trong phạm vi báo cáo."
  },
  "Hủy sau chốt": {
    "full": "Hủy sau chốt",
    "short": "Hủy sau",
    "hint": "Phần đơn hủy sau khi chốt trong phạm vi bảng."
  },
  "DT CSKH / khách": {
    "full": "DT CSKH / khách",
    "short": "DT CS/KH",
    "hint": "Doanh thu CSKH chia số khách của dòng báo cáo."
  },
  "Đơn / khách mua lại": {
    "full": "Đơn / khách mua lại",
    "short": "Đơn/KH lặp",
    "hint": "Số đơn chia số khách mua lại của dòng báo cáo."
  },
  "Quay lại sau": {
    "full": "Quay lại sau",
    "short": "Sau mua đầu",
    "hint": "Khoảng thời gian đến lần khách quay lại mua được thống kê."
  },
  "Sale chốt gì": {
    "full": "Sale chốt gì",
    "short": "SP Sale",
    "hint": "Sản phẩm Sale chốt ở lần mua gốc."
  },
  "Khách mua lại gì": {
    "full": "Khách mua lại gì",
    "short": "SP mua lại",
    "hint": "Sản phẩm khách mua ở lần mua lại."
  },
  "Đơn gốc (Sale chốt)": {
    "full": "Đơn gốc (Sale chốt)",
    "short": "Đơn gốc Sale",
    "hint": "Đơn mua ban đầu được Sale chốt."
  },
  "Mua lại qua CSKH": {
    "full": "Mua lại qua CSKH",
    "short": "Mua lại CS",
    "hint": "Lượt mua lại được ghi nhận qua CSKH."
  },
  "Tiền CSKH": {
    "full": "Tiền CSKH",
    "short": "Tiền CS",
    "hint": "Giá trị mua lại qua CSKH của dòng báo cáo."
  },
  "Đơn đã lưu": {
    "full": "Đơn đã lưu",
    "short": "Đơn lưu",
    "hint": "Số đơn đã được đồng bộ và lưu trong hệ thống."
  },
  "Đơn cũ nhất": {
    "full": "Đơn cũ nhất",
    "short": "Đơn đầu",
    "hint": "Thời điểm đơn cũ nhất hiện đã lưu."
  },
  "Đồng bộ gần nhất": {
    "full": "Đồng bộ gần nhất",
    "short": "Đồng bộ cuối",
    "hint": "Thời điểm đồng bộ gần nhất của nguồn dữ liệu."
  },
  "Doanh thu đã chốt": {
    "full": "Doanh thu đã chốt",
    "short": "DT đã chốt",
    "hint": "Doanh thu các đơn đã chốt trong phạm vi bảng."
  },
  "POS phụ trách": {
    "full": "POS phụ trách",
    "short": "POS quản lý",
    "hint": "POS nhân viên được phân công phụ trách."
  },
  "Số đã chốt": {
    "full": "Số đã chốt",
    "short": "Số chốt",
    "hint": "Số data đã chốt trong phạm vi bảng."
  },
  "Giá trị chốt": {
    "full": "Giá trị chốt",
    "short": "GT chốt",
    "hint": "Giá trị các đơn chốt trong phạm vi bảng."
  },
  "Tỷ trọng doanh thu": {
    "full": "Tỷ trọng doanh thu",
    "short": "Tỷ trọng DT",
    "hint": "Phần doanh thu của dòng so với tổng doanh thu trong bảng."
  },
  "Doanh thu (₫)": {
    "full": "Doanh thu (₫)",
    "short": "DT (₫)",
    "hint": "Doanh thu hiển thị theo đơn vị đồng trong bảng."
  },
  "Chi phí trần (₫)": {
    "full": "Chi phí trần (₫)",
    "short": "CP trần (₫)",
    "hint": "Ngân sách quảng cáo tối đa của tháng, theo đơn vị đồng."
  },
  "Tên trên Pancake · vai trò": {
    "full": "Tên trên Pancake · vai trò",
    "short": "Tên POS · vai trò",
    "hint": "Tên và vai trò được ghi nhận trên Pancake."
  },
  "Người có đơn": {
    "full": "Người có đơn",
    "short": "NV có đơn",
    "hint": "Số người có đơn trong phạm vi báo cáo."
  },
  "DT / người": {
    "full": "DT / người",
    "short": "DT/người",
    "hint": "Doanh thu chia số người của dòng báo cáo."
  },
  "DT mục tiêu": {
    "full": "DT mục tiêu",
    "short": "DT đích",
    "hint": "Mục tiêu doanh thu được giao cho dòng báo cáo."
  },
  "Tỉ lệ chốt mục tiêu": {
    "full": "Tỉ lệ chốt mục tiêu",
    "short": "TL chốt đích",
    "hint": "Mục tiêu tỉ lệ chốt được giao cho tháng."
  },
  "Dự báo cuối tháng": {
    "full": "Dự báo cuối tháng",
    "short": "DB cuối tháng",
    "hint": "Ước tính kết quả đến cuối tháng theo dữ liệu của bảng."
  },
  "Tổng KPI cá nhân": {
    "full": "Tổng KPI cá nhân",
    "short": "Tổng KPI NV",
    "hint": "Tổng KPI được giao cho các cá nhân trong nhóm."
  },
  "Số đơn hoàn": {
    "full": "Số đơn hoàn",
    "short": "Đơn trả",
    "hint": "Số đơn hoàn trong phạm vi báo cáo."
  },
  "Vai trò · chức vụ": {
    "full": "Vai trò · chức vụ",
    "short": "Vai trò/chức vụ",
    "hint": "Vai trò và chức vụ được gán cho tài khoản."
  },
  "Đăng nhập gần nhất": {
    "full": "Đăng nhập gần nhất",
    "short": "Đăng nhập cuối",
    "hint": "Thời điểm đăng nhập gần nhất được hệ thống ghi nhận."
  },
  "Team Marketing": {
    "full": "Team Marketing",
    "short": "Team MKT",
    "hint": "Team Marketing của dòng báo cáo."
  },
  "Marketer · team": {
    "full": "Marketer · team",
    "short": "MKT · team",
    "hint": "Marketer và team tương ứng trong dòng báo cáo."
  },
  "Hoàn / hủy (tiền)": {
    "full": "Hoàn / hủy (tiền)",
    "short": "Tiền HH",
    "hint": "Giá trị tiền hoàn và hủy của dòng báo cáo."
  },
  "Sau hoàn hủy": {
    "full": "Sau hoàn hủy",
    "short": "Sau HH",
    "hint": "Giá trị còn lại sau phần hoàn và hủy của dòng báo cáo."
  },
  "Đã cho ĐVVC": {
    "full": "Đã cho ĐVVC",
    "short": "Cho ĐVVC",
    "hint": "Số đơn đã chuyển cho đơn vị vận chuyển trong phạm vi bảng."
  },
  "Thành tiền dòng SP": {
    "full": "Thành tiền dòng SP",
    "short": "Tiền dòng SP",
    "hint": "Thành tiền của dòng sản phẩm tương ứng trên đơn."
  },
  "Ghi chú đơn": {
    "full": "Ghi chú đơn",
    "short": "GC đơn",
    "hint": "Nội dung ghi chú được lưu trên đơn."
  },
  "Chiến dịch · ghi chú": {
    "full": "Chiến dịch · ghi chú",
    "short": "CD · ghi chú",
    "hint": "Chiến dịch quảng cáo và nội dung ghi chú của dòng."
  },
  "Marketer đưa về": {
    "full": "Marketer đưa về",
    "short": "MKT đưa về",
    "hint": "Marketer được ghi nhận là nguồn đưa khách hoặc đơn về."
  },
  "Ngày T0 · người bán": {
    "full": "Ngày T0 · người bán",
    "short": "T0 · NV bán",
    "hint": "Ngày mua gốc và người bán được ghi nhận."
  },
  "Lần nhận gần nhất": {
    "full": "Lần nhận gần nhất",
    "short": "Lần nhận cuối",
    "hint": "Thời điểm nhận gần nhất được ghi nhận trong bảng."
  },
  "Tổng đã nhận": {
    "full": "Tổng đã nhận",
    "short": "Tổng nhận",
    "hint": "Tổng số đã nhận trong phạm vi bảng."
  },
  "30 ngày gần nhất": {
    "full": "30 ngày gần nhất",
    "short": "30 ngày cuối",
    "hint": "Dữ liệu trong khoảng 30 ngày gần nhất của báo cáo."
  },
  "So 30 ngày trước đó": {
    "full": "So 30 ngày trước đó",
    "short": "So 30 ngày trước",
    "hint": "So sánh với khoảng 30 ngày liền trước kỳ đang xét."
  },
  "So tháng trước": {
    "full": "So tháng trước",
    "short": "So tháng cũ",
    "hint": "So sánh với tháng trước theo phạm vi báo cáo."
  },
  "So tuần trước": {
    "full": "So tuần trước",
    "short": "So tuần cũ",
    "hint": "So sánh với tuần trước theo phạm vi báo cáo."
  },
  "So với tháng trước": {
    "full": "So với tháng trước",
    "short": "So tháng qua",
    "hint": "So sánh với tháng trước theo phạm vi báo cáo."
  },
  "Mục tiêu tháng": {
    "full": "Mục tiêu tháng",
    "short": "MT tháng",
    "hint": "Mục tiêu được giao cho tháng của dòng báo cáo."
  },
  "Đang đóng hàng": {
    "full": "Đang đóng hàng",
    "short": "Đang đóng",
    "hint": "Đơn đang ở giai đoạn đóng hàng trong phạm vi bảng."
  },
  "Đoạn bắt đầu": {
    "full": "Đoạn bắt đầu",
    "short": "Đoạn đầu",
    "hint": "Nhóm bắt đầu của chuỗi mua trong báo cáo."
  },
  "Web nhân sự": {
    "full": "Web nhân sự",
    "short": "Web NS",
    "hint": "Thông tin lấy từ web nhân sự."
  },
  "Đơn · giá trị": {
    "full": "Đơn · giá trị",
    "short": "Đơn · GT",
    "hint": "Số đơn và giá trị tương ứng của nhân viên trong bảng."
  },
  "Mua gần nhất": {
    "full": "Mua gần nhất",
    "short": "Mua cuối",
    "hint": "Thời điểm mua gần nhất của khách được ghi nhận."
  },
  "Ngày chưa mua": {
    "full": "Ngày chưa mua",
    "short": "Ngày vắng",
    "hint": "Số ngày kể từ lần mua gần nhất của khách."
  },
  "Đơn có thẻ": {
    "full": "Đơn có thẻ",
    "short": "Đơn thẻ",
    "hint": "Số đơn gắn thẻ tương ứng của dòng báo cáo."
  },
  "Bắt đầu bằng ↓ · Mua lại →": {
    "full": "Bắt đầu bằng ↓ · Mua lại →",
    "short": "Bắt đầu ↓ · Lặp →",
    "hint": "Hàng là nhóm mua bắt đầu, cột là nhóm được mua lại."
  },
  "Trả lời lúc": {
    "full": "Trả lời lúc",
    "short": "Lúc TL",
    "hint": "Thời điểm trả lời lời mời họp."
  },
  "30 ngày đầu": {
    "full": "30 ngày đầu",
    "short": "30 ng đầu",
    "hint": "Dữ liệu trong 30 ngày đầu của nhóm khách đang xét."
  },
  "Người (nhân sự)": {
    "full": "Người (nhân sự)",
    "short": "NV (HR)",
    "hint": "Người được ghi nhận trên nguồn web nhân sự."
  },
  "Lần đã nhận": {
    "full": "Lần đã nhận",
    "short": "Lần nhận",
    "hint": "Số lần khách đã nhận hàng được ghi nhận trong báo cáo."
  },
  "Đơn có SP": {
    "full": "Đơn có SP",
    "short": "Đơn/SP",
    "hint": "Số đơn có sản phẩm tương ứng trong bảng."
  },
  "Doanh thu giao TC": {
    "full": "Doanh thu giao TC",
    "short": "DT giao TC",
    "hint": "Doanh thu của các đơn giao thành công trong phạm vi bảng."
  },
  "Đơn đã nhận": {
    "full": "Đơn đã nhận",
    "short": "Đơn đã TC",
    "hint": "Trong số đơn chốt trong kỳ, đơn hiện ở Đã nhận hoặc Đã thu tiền."
  },
  "Số đã nhận": {
    "full": "Số đã nhận",
    "short": "Số nhận",
    "hint": "Số data đã nhận trong phạm vi báo cáo."
  },
  "KPI tỉ lệ chốt": {
    "full": "KPI tỉ lệ chốt",
    "short": "KPI TL chốt",
    "hint": "Mục tiêu tỉ lệ chốt của tháng; tỉ lệ thật theo cách tính đang chọn."
  },
  "KPI cá nhân tháng": {
    "full": "KPI cá nhân tháng",
    "short": "KPI NV tháng",
    "hint": "Mục tiêu giao cho cá nhân trong tháng hiển thị."
  },
  "Chưa xuất kho": {
    "full": "Chưa xuất kho",
    "short": "Chưa XK",
    "hint": "Số đơn chốt chưa xuất kho trong phạm vi bảng."
  },
  "Đã xuất đi": {
    "full": "Đã xuất đi",
    "short": "Đã xuất",
    "hint": "Số đơn đã xuất đi của dòng báo cáo."
  },
  "% thành công": {
    "full": "% thành công",
    "short": "% TC",
    "hint": "Số đơn đã nhận chia số đơn đã xuất đi."
  },
  "% đang giao": {
    "full": "% đang giao",
    "short": "% giao",
    "hint": "Số đơn đang giao chia số đơn đã xuất đi."
  },
  "Tỷ lệ hoàn": {
    "full": "Tỷ lệ hoàn",
    "short": "TL hoàn",
    "hint": "Tỷ lệ hoàn theo mẫu số và cách tính đang chọn của trang."
  },
  "Chuyển hàng/chốt": {
    "full": "Chuyển hàng/chốt",
    "short": "CH/chốt",
    "hint": "Số đơn đã xuất đi chia số đơn chốt."
  },
  "Doanh thu chốt": {
    "full": "Doanh thu chốt",
    "short": "DT chốt",
    "hint": "Doanh thu các đơn chốt theo phạm vi đang chọn."
  },
  "Doanh thu xuất đi": {
    "full": "Doanh thu xuất đi",
    "short": "DT xuất",
    "hint": "Doanh thu của các đơn đã xuất đi trong phạm vi bảng."
  },
  "Doanh thu thành công": {
    "full": "Doanh thu thành công",
    "short": "DT thành công",
    "hint": "Doanh thu của các đơn đã nhận trong phạm vi bảng."
  },
  "GTTB đơn chốt (AOV)": {
    "full": "GTTB đơn chốt (AOV)",
    "short": "AOV chốt",
    "hint": "Doanh thu đơn chốt chia số đơn chốt của dòng."
  },
  "Đang giao (tiền)": {
    "full": "Đang giao (tiền)",
    "short": "Tiền đang giao",
    "hint": "Doanh thu các đơn đang giao trong phạm vi bảng."
  },
  "Doanh thu hoàn": {
    "full": "Doanh thu hoàn",
    "short": "DT hoàn",
    "hint": "Doanh thu các đơn hoàn trong phạm vi bảng."
  },
  "% thành công (tiền)": {
    "full": "% thành công (tiền)",
    "short": "% TC tiền",
    "hint": "Giá trị đơn đã nhận chia giá trị đơn đã xuất đi."
  },
  "Tỷ lệ hoàn (tiền)": {
    "full": "Tỷ lệ hoàn (tiền)",
    "short": "TL hoàn tiền",
    "hint": "Giá trị đơn hoàn chia giá trị đơn đã xuất đi trong bảng này."
  },
  "Chuyển hàng/chốt (tiền)": {
    "full": "Chuyển hàng/chốt (tiền)",
    "short": "CH/chốt tiền",
    "hint": "Giá trị đơn đã xuất đi chia giá trị đơn chốt."
  },
  "Giảm giá / quà": {
    "full": "Giảm giá / quà",
    "short": "Giảm/quà",
    "hint": "Giá trị giảm giá và quà của các đơn chốt trong bảng."
  },
  "Giao thành công": {
    "full": "Giao thành công",
    "short": "Giao TC",
    "hint": "Số đơn khách đã nhận trong phạm vi bảng."
  },
  "Tỷ lệ hủy": {
    "full": "Tỷ lệ hủy",
    "short": "TL hủy",
    "hint": "Số đơn hủy chia số đơn lên theo cách tính của trang."
  },
  "Đơn được chia": {
    "full": "Đơn được chia",
    "short": "Đơn chia",
    "hint": "Số đơn được chia cho người của dòng báo cáo."
  },
  "Không XN được": {
    "full": "Không XN được",
    "short": "Không XN",
    "hint": "Đơn không xác nhận được trong phạm vi bảng."
  },
  "% không XN": {
    "full": "% không XN",
    "short": "% ko XN",
    "hint": "Tỷ lệ không xác nhận được của dòng báo cáo."
  },
  "Đơn đã gọi": {
    "full": "Đơn đã gọi",
    "short": "Đơn gọi",
    "hint": "Số đơn đã xác nhận cộng số đơn không xác nhận được."
  },
  "% hoàn theo đơn": {
    "full": "% hoàn theo đơn",
    "short": "% hoàn/đơn",
    "hint": "Số đơn hoàn chia số đơn chuyển đi."
  },
  "% hoàn theo giá trị": {
    "full": "% hoàn theo giá trị",
    "short": "% hoàn/GT",
    "hint": "Giá trị hoàn chia doanh số chuyển đi."
  },
  "% XN được": {
    "full": "% XN được",
    "short": "% XN",
    "hint": "Tỷ lệ xác nhận được trong phạm vi bảng."
  },
  "DT MKT (New + CSKH + Khác)": {
    "full": "DT MKT (New + CSKH + Khác)",
    "short": "DT MKT",
    "hint": "Tổng doanh thu New, CSKH và phần khác của Marketing trong phạm vi bảng."
  },
  "Up sang nhóm kia": {
    "full": "Up sang nhóm kia",
    "short": "Up nhóm kia",
    "hint": "Khách mua thêm sang nhóm sản phẩm còn lại; dòng nhỏ là tỷ lệ tương ứng."
  },
  "Lần mua do chính NV": {
    "full": "Lần mua do chính NV",
    "short": "Lần NV bán",
    "hint": "Số đơn do chính nhân viên bán và số khách tương ứng."
  },
  "Đơn mua tiếp": {
    "full": "Đơn mua tiếp",
    "short": "Đơn tiếp",
    "hint": "Số đơn mua tiếp sau lần bắt đầu; dòng nhỏ là doanh thu tương ứng."
  },
  "T0 → T1 sau": {
    "full": "T0 → T1 sau",
    "short": "T0→T1",
    "hint": "Số ngày trung bình từ lần bắt đầu T0 tới lần mua tiếp T1."
  },
  "Đơn giao TC": {
    "full": "Đơn giao TC",
    "short": "Đơn TC",
    "hint": "Số đơn khách đã nhận trong phạm vi báo cáo."
  },
  "Nhân viên · POS": {
    "full": "Nhân viên · POS",
    "short": "NV · POS",
    "hint": "Nhân viên và POS tương ứng của dòng báo cáo."
  },
  "Cuộc gọi/ngày": {
    "full": "Cuộc gọi/ngày",
    "short": "Gọi/ngày",
    "hint": "Số cuộc gọi chia số ngày theo phạm vi trang đang chọn."
  }
};

const ALIASES: Record<string, string> = {
  "SĐT": "Số điện thoại",
  "AOV": "Giá trị đơn trung bình",
  "GTTB": "Giá trị đơn trung bình",
  "GTTB (AOV)": "Giá trị đơn trung bình",
  "CP/đơn New": "Chi phí / đơn New",
  "CP/số": "Chi phí / số",
  "% CP/DT New": "% chi phí / DT New",
  "Tỷ lệ XN": "Tỷ lệ xác nhận",
  "Tỉ lệ chốt": "Tỷ lệ chốt",
  "Chi phí/đơn New": "Chi phí / đơn New",
  "Chi phí/số": "Chi phí / số",
  "DT New": "Doanh thu New",
  "DT CSKH": "Doanh thu CSKH",
  "DT / SĐT": "Doanh thu / SĐT",
  "Đơn XN": "Đơn xác nhận"
};

/** Nhãn chưa có trong từ điển giữ nguyên, tránh đoán tên nghiệp vụ. */
export function colLabel(key: string) {
  const canonical = Object.hasOwn(ALIASES, key) ? ALIASES[key] : key;
  return Object.hasOwn(COLUMN_LABELS, canonical) ? COLUMN_LABELS[canonical] : { full: key, short: key, hint: '' };
}
