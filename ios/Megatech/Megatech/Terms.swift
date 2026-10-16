// Nhãn app 14/10: plan 4.4.3–4.4.5. Nguồn web: app/staff-compare.tsx
// (MODE_LABEL, MODE_SHORT, MODE_TITLE, STEPS, stepLabel, cmpLabel, KIND_LABEL, KIND_TITLE).
enum MktSort: String, CaseIterable {
    case name, cost, net, roas, closed, phones, cpc, cpl

    var label: String {
        switch self {
        case .name: return "Tên"
        case .cost: return "Chi phí QC"
        case .net: return "Doanh thu"
        case .roas: return "ROAS"
        case .closed: return "Đơn chốt"
        case .phones: return "Số"
        case .cpc: return "CP / đơn"
        case .cpl: return "CP / số"
        }
    }
    var needsAllPos: Bool { self == .roas || self == .cpc || self == .cpl }
    var ascending: Bool { self == .name || self == .cpc || self == .cpl }
    static let posHint = "Chi phí là của mọi POS: xếp theo ROAS, CP / đơn, CP / số khi xem Tất cả POS"
}

enum CmpMode: String, CaseIterable {
    case previous, weekday, monthday, year, custom

    var label: String {
        switch self {
        case .previous: return "Kỳ liền trước"
        case .weekday: return "Cùng thứ tuần trước"
        case .monthday: return "Cùng ngày tháng trước"
        case .year: return "Cùng kỳ năm trước"
        case .custom: return "Tự chọn ngày"
        }
    }
    var short: String {
        switch self {
        case .previous: return "Kỳ trước"
        case .weekday: return "Cùng thứ"
        case .monthday: return "Cùng ngày"
        case .year: return "Năm trước"
        case .custom: return "Tự chọn"
        }
    }
    var title: String {
        switch self {
        case .previous: return "Hôm nay so hôm qua, tuần này so tuần trước, tháng này so tháng trước"
        case .weekday: return "Thứ Hai so thứ Hai tuần trước (cả kỳ lùi đủ số tuần để từng ngày trùng thứ)"
        case .monthday: return "Ngày 2 so ngày 2 tháng trước (tháng thiếu ngày thì lấy ngày cuối tháng)"
        case .year: return "Cùng ngày năm trước"
        case .custom: return "Tự chọn hai ngày của kỳ so"
        }
    }
    var steps: [Int] {
        switch self {
        case .previous: return [1, 2, 3, 4]
        case .weekday: return [1, 2, 3, 4, 8]
        case .monthday: return [1, 2, 3, 6, 12]
        case .year: return [1, 2]
        case .custom: return []
        }
    }
}

func stepLabel(mode: CmpMode, n: Int, days: Int) -> String {
    let count = Fmt.int(Double(n))
    switch mode {
    case .previous: return "\(count) kỳ trước"
    case .weekday:
        return days <= 7 ? "\(count) tuần trước" : "lùi \(Fmt.int(Double(n) * (Double(days) / 7).rounded(.up))) tuần"
    case .monthday: return "\(count) tháng trước"
    case .year: return "\(count) năm trước"
    case .custom: return ""
    }
}

func cmpLabel(mode: CmpMode, n: Int, days: Int) -> String {
    if mode == .custom || (n == 1 && (mode != .weekday || days <= 7)) { return mode.label }
    let count = Fmt.int(Double(n))
    switch mode {
    case .previous: return "Lùi \(count) kỳ"
    case .weekday: return "Cùng thứ, \(stepLabel(mode: mode, n: n, days: days))"
    case .monthday: return "Cùng ngày \(count) tháng trước"
    case .year: return "Cùng kỳ \(count) năm trước"
    case .custom: return mode.label
    }
}

enum CmpKind: String, CaseIterable {
    case wave, diff, cum
    var label: String {
        switch self {
        case .wave: return "Lên xuống"
        case .diff: return "Chênh lệch"
        case .cum: return "Cộng dồn"
        }
    }
    var title: String {
        switch self {
        case .wave: return "Từng ngày (xem một ngày thì từng giờ) của kỳ này và kỳ so"
        case .diff: return "Mỗi cột là kỳ này trừ kỳ so: xanh lên là hơn, đỏ xuống là kém"
        case .cum: return "Cộng dồn từ đầu kỳ"
        }
    }
}

// Nguồn: app/product-group-blocks.tsx (thứ tự nút); staff-compare.tsx (METRIC_NOUN).
enum StaffMetric: String, CaseIterable {
    case closed, closedNet, closeRate
    var label: String {
        switch self {
        case .closed: return "Đơn chốt"
        case .closedNet: return "Doanh thu"
        case .closeRate: return "Tỷ lệ chốt"
        }
    }
    var noun: String {
        switch self {
        case .closed: return "đơn chốt"
        case .closedNet: return "doanh thu"
        case .closeRate: return "tỷ lệ chốt"
        }
    }
}

enum StaffTerms {
    // app/product-group-blocks.tsx: cột, các bảng Why; team-overview-view.tsx: phụ đề CSKH.
    static let saleTitle = "Từng nhân viên Sale"
    static let cskhTitle = "Từng nhân viên CSKH"
    static let employee = "Nhân viên"
    static let created = "Số chia"
    static let closed = "Đơn chốt"
    static let closeRate = "Tỷ lệ chốt"
    static let packed = "Đang đóng hàng"
    static let closedNet = "Doanh thu"
    static let compare = "So cùng kỳ"
    static let total = "Tổng"
    static let packedHint = "Đơn chốt kho đã chuyển sang Đang đóng hàng (hoặc đã đi tiếp)"
    static let saleSubtitle = "Đơn chốt trong kỳ của từng người bán · Số chia = đơn lên trong kỳ (như ô Tất cả trên Pancake) · tỷ lệ chốt = số chia đã chốt ÷ số chia (không vượt 100%) · bấm số để xem từng đơn"
    static let cskhSubtitle = "Đơn chốt trong kỳ của từng người (NV chăm sóc trên đơn, trống thì người bán) · so cùng kỳ chọn ngay dưới · bấm số để xem từng đơn"
    static let subtitleSuffix = " · Tỷ lệ chốt ở bảng này không theo Cách tính"
    static let createdInPeriod = "Số chia (đơn lên trong kỳ)"
    static let createdClosed = "Trong đó đã chốt"
    static let notClosed = "Chưa chốt / hủy"
    static let closedInPeriod = "Đơn chốt trong kỳ"
    static let fromCurrent = "Từ số chia kỳ này"
    static let fromPrevious = "Từ số chia trước đó"
    static let allocatedClosed = "Số chia đã chốt"
    static let allocatedTotal = "Tổng số chia"
    static let rate = "Tỷ lệ"
    static let rateDefinition = "Trong số đơn chia trong kỳ, bao nhiêu đơn nay đã chốt — đơn chia hôm trước, hôm sau mới chốt vẫn tính cho ngày chia. Không vượt 100%."
    static let packedCount = "Đã vào Đang đóng hàng hoặc đi tiếp"
    static let confirmedNotPacked = "Còn Đã xác nhận, chưa đóng"
    static let cancelledBeforePack = "Hủy trước khi đóng"
    static func packedExplanation(_ name: String) -> String { "\(name) · đã vào Đang đóng hàng" }
    static func packedList(_ name: String) -> String { "\(name) · đơn chốt đã vào Đang đóng hàng" }
    static func packedAccessibility(_ name: String, _ count: Double?) -> String {
        "\(name) · \(count.map { Fmt.int($0) } ?? "—") đơn chốt đã vào Đang đóng hàng"
    }
    static let waiting = "Còn Chờ xác nhận"
    static let closedRevenue = "Doanh thu đơn chốt"
    static let closedCount = "Số đơn chốt"
    static let averageValue = "GTTB"
    // W1 chưa có: không suy ra các phần thiếu (plan 4.3).

    // app/staff-compare.tsx: dải chọn, chú thích và chế độ focus (PR #76).
    static let step = "Lùi bao xa"
    static let startDate = "Kỳ so từ ngày"
    static let endDate = "Kỳ so đến ngày"
    static let perEmployee = "Từng nhân viên:"
    static let today = "Hôm nay"
    static let current = "Kỳ này"
    static let previous = "Kỳ so"
    static let versus = "so với kỳ so"
    static let higher = "Hơn kỳ so"
    static let lower = "Kém kỳ so"
    static let difference = "Chênh lệch"
    static let allStaff = "Xem cả đội"
    static let allStaffHint = "Đang xem cả đội · bấm biểu đồ nhỏ ở cột So cùng kỳ để xem riêng từng người"
    static func focus(_ name: String) -> String { "Đang xem riêng \(name)" }
    // app/product-group-blocks.tsx (PR #76): nhãn nút cho VoiceOver.
    static func viewStaff(_ name: String) -> String { "Xem riêng \(name) ở biểu đồ so cùng kỳ phía trên" }
    static func until(_ cutoff: String) -> String { " tới \(cutoff)" }
    static func cutoffNotice(_ cutoff: String) -> String { "Kỳ đang xem chưa hết ngày nên kỳ so cũng chỉ tính tới \(cutoff)." }
    static func currentPoint(_ time: String) -> String { "Kỳ này \(time)" }
    static func previousPoint(_ time: String) -> String { "Kỳ so \(time)" }

    // app/hr-team-picker.tsx, dashboard.tsx; câu chưa lọc của app: plan 4.4.4–4.4.5.
    static let team = "Team"
    static let allTeams = "Mọi team"
    static let allSaleTeams = "Mọi team Sale"
    static let clearTeam = "Bỏ chọn team"
    static let departmentsUnfiltered = "4 bảng bộ phận chưa lọc theo team."
    static let ordersUnfiltered = "Danh sách đơn chưa lọc theo team."
    static let kpiUnfiltered = "Khối tiến độ KPI chưa lọc theo team."
    static let monthlyGoalUnfiltered = "Mục tiêu tháng chưa tính theo team"
    static let productUnfiltered = "Bảng này chưa lọc theo nhóm đơn: số của mọi sản phẩm."
    static func people(_ n: Int) -> String { "\(Fmt.int(Double(n))) người" }
    static func showAll(_ n: Int) -> String { "Xem cả \(Fmt.int(Double(n))) người" }
    static func mentor(_ name: String) -> String { "Mentor \(name)" }
    static func teamNotice(_ name: String) -> String {
        "Đang xem riêng team \(name) — số trên trang chỉ tính người đang thuộc team này bên web nhân sự (theo team hiện tại: người chuyển team thì số các kỳ trước đi theo team mới; người đã nghỉ không tính)."
    }
    static func teamUnfiltered(dept: String, name: String) -> String {
        "Trang này chưa lọc được theo team — đang hiện số cả nhóm \(dept), không riêng team \(name). Xem theo team ở Tổng quan, Sale › Nhân viên, CSKH › Tổng quan và Vận đơn."
    }
    static func cardUnfiltered(_ title: String) -> String { "\(title) chưa lọc theo team." }
    static func firstOrders(_ n: Int, total: Int) -> String { "Đang hiện \(Fmt.int(Double(n))) đơn đầu trong \(Fmt.int(Double(total))) đơn" }
    static func alreadyClosed(_ a: Double, _ b: Double) -> String { "\(Fmt.int(a))/\(Fmt.int(b)) đã chốt" }
    static func packedOrders(_ a: Double, _ b: Double) -> String { "\(Fmt.int(a))/\(Fmt.int(b)) đơn chốt" }
}
enum MarketingRankTerms {
    static let title = "Xếp hạng marketer"
    static let teamTitle = "Xếp hạng team Marketing"
    static let subtitle = "Chỉ số theo mốc: Đơn chốt (đang hiệu lực) · phễu theo đơn tạo trong kỳ"
    static let productNote = "Xếp hạng không lọc theo sản phẩm của sheet chi phí."
    static let byTeam = "Theo team"
    static let byPerson = "Theo nhân viên"
    static let teamName = "Tên team"
    static let definitions = "Cách tính"
    static let empty = "Không có dữ liệu trong kỳ."
    static let pickTeam = "Xem riêng team này"
    static let pickPerson = "Xem riêng marketer này"
    static let close = "Đóng"
    static let sorts = ["Tên marketer", "Team Marketing", "Đơn tạo", "Số điện thoại", "Đơn xác nhận", "Tỷ lệ xác nhận", "Đơn theo mốc", "Doanh thu", "Doanh thu New", "Doanh thu CSKH", "Tiền hoàn / hủy", "Doanh thu sau hoàn hủy", "Doanh thu / SĐT", "AOV", "Đã cho ĐVVC", "Đã nhận", "Tỷ lệ giao thành công", "Hoàn / hủy"]
    static let detailSorts: [MarketingRankSort] = [.created, .phones, .confirmed, .rate, .orders, .net, .newNet, .cskhNet, .refund, .afterRefund, .perPhone, .aov, .shipped, .delivered, .delivery, .returned]
    static let detailLabels = ["Đơn tạo", "SĐT", "Đơn XN", "Tỷ lệ XN", "Đơn theo mốc", "Doanh thu", "DT New", "DT CSKH", "Hoàn / hủy (tiền)", "Sau hoàn hủy", "DT / SĐT", "AOV", "Đã cho ĐVVC", "Đã nhận", "% giao TC", "Hoàn / hủy"]
}

enum StaffDetailTerms {
    static let employee = "Nhân viên"
    static let loading = "Đang tải số liệu…"
    static let missing = "Máy chủ chưa có trang chi tiết nhân viên."
    static let fallback = "Xem đơn chốt"
    static let rate = "Tỷ lệ chốt"
    static let closed = "Đơn chốt"
    static let closedDate = "Theo ngày chốt"
    static let revenue = "Doanh thu chốt"
    static let aov = "AOV "
    static let assigned = "Số chia"
    static let assignedOrders = "Đơn chia"
    static let created = "Đơn tạo"
    static let hidden = "Số chia của CSKH chỉ chủ hệ thống, giám đốc xem"
    static let assignedStatus = "Đơn chia trong kỳ theo trạng thái hiện tại"
    static let createdStatus = "Đơn tạo trong kỳ theo trạng thái hiện tại"
    static let noOpen = "Không còn đơn chưa chốt trong kỳ."
    static let partial = "Chỉ đếm 2.000 đơn mới nhất."
    static let otherTags = "Thẻ khác trên đơn chưa chốt"
    static let openOrders = "Đơn chưa chốt"
    static let tags = "Thẻ: "
    static let orderNote = "Ghi chú đơn: "
    static let phone = "SĐT "
    static func phones(_ n: Double?) -> String { (n.map(Fmt.int) ?? "—") + " SĐT khác nhau" }
    static func fraction(_ top: Double?, _ den: Double?, assigned: Bool) -> String {
        guard let top, let den else { return "—" }
        return "\(Fmt.int(top)) chốt / \(Fmt.int(den)) " + (assigned ? "chia" : "tạo")
    }
    static func base(_ b: API.StaffDetailReport.Base) -> String { "Đã chốt \(Fmt.int(b.closed)) / \(Fmt.int(b.total)) · Chưa chốt \(Fmt.int(b.open))" }
    static func reasons(_ n: Double) -> String { "Lý do chưa chốt (\(Fmt.int(n)) đơn)" }
    static func counts(_ c: API.StaffDetailReport.Reason.Counts) -> String {
        [c.new > 0 ? "Mới \(Fmt.int(c.new))" : nil, c.cancelled > 0 ? "Hủy \(Fmt.int(c.cancelled))" : nil].compactMap { $0 }.joined(separator: " · ")
    }
    static func filter(_ s: String) -> String { "Đang lọc: \(s) ✕" }
    static func more(_ n: Int, _ total: Double) -> String { "Hiện \(Fmt.int(Double(n))) trên \(Fmt.int(total)) đơn chưa chốt, mới nhất trước." }
    static func customerNote(_ n: API.StaffDetailReport.Order.Note) -> String {
        "Ghi chú khách (" + [n.by, Fmt.dateTime(n.at)].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ") + "): " + n.text
    }
}
