import SwiftUI

// Cùng một cách trình bày cho người và staffTotal; chỉ đọc số máy chủ, không cộng/trừ các phần thiếu.
protocol StaffValues {
    var created: Double { get }; var createdClosed: Double { get }; var closed: Double { get }
    var closedNet: Double { get }; var closeRate: Double? { get }; var aov: Double? { get }
    var whConfirmed: Double { get }; var whRate: Double? { get }; var selfConfirmed: Double { get }
    var unknownConfirmer: Double { get }; var waiting: Double { get }
    var warehouseConfirmed: Double? { get }; var otherUnconfirmed: Double? { get }
    var closedFromCreated: Double? { get }; var closedFromEarlier: Double? { get }; var createdOpen: Double? { get }
}
extension API.StaffRow: StaffValues {}
extension API.StaffSum: StaffValues {}

enum StaffColumn: CaseIterable {
    case employee, created, closed, closeRate, whRate, closedNet, compare
    var title: String {
        switch self {
        case .employee: return StaffTerms.employee
        case .created: return StaffTerms.created
        case .closed: return StaffTerms.closed
        case .closeRate: return StaffTerms.closeRate
        case .whRate: return StaffTerms.whConfirmed
        case .compare: return StaffTerms.compare
        case .closedNet: return StaffTerms.closedNet
        }
    }
    func number(_ s: any StaffValues) -> Double? {
        switch self {
        case .employee, .compare: return nil
        case .created: return s.created
        case .closed: return s.closed
        case .closeRate: return s.closeRate
        case .whRate: return s.whRate
        case .closedNet: return s.closedNet
        }
    }
}

struct StaffDisplayRow: Identifiable {
    let id: String
    let name: String
    let department: String?
    let staffId: String?
    let values: any StaffValues
    init(_ s: API.StaffRow) {
        id = "staff:\(s.sellerId)"; name = s.name; department = s.department; staffId = s.sellerId; values = s
    }
    init(_ s: API.StaffSum) {
        id = "total"; name = StaffTerms.total; department = nil; staffId = nil; values = s
    }
    static func sorted(_ rows: [API.StaffRow], column: StaffColumn, descending: Bool, comparison: ((String) -> Double?)? = nil) -> [StaffDisplayRow] {
        rows.sorted { a, b in
            if column == .employee {
                let order = a.name.localizedStandardCompare(b.name)
                if order != .orderedSame { return descending ? order == .orderedDescending : order == .orderedAscending }
            } else {
                let x = column == .compare ? comparison?(a.sellerId) : column.number(a)
                let y = column == .compare ? comparison?(b.sellerId) : column.number(b)
                // Thiếu tỷ lệ luôn cuối bảng, kể cả chiều tăng; số 0 là một giá trị có thật.
                if x == nil && y != nil { return false }
                if x != nil && y == nil { return true }
                if let x, let y, x != y { return descending ? x > y : x < y }
            }
            return a.sellerId < b.sellerId
        }.map(StaffDisplayRow.init)
    }
}

struct StaffWhy: Identifiable {
    let title: String
    let rows: [(String, String)]
    let definition: String
    var id: String { title }
    init(column: StaffColumn, row: StaffDisplayRow, definitions: API.StaffDefinitions) {
        title = "\(row.name) · \(column.title)"
        let s = row.values
        var items: [(String, String)] = []
        func count(_ label: String, _ value: Double?) {
            if let value { items.append((label, Fmt.int(value))) }
        }
        switch column {
        case .employee, .compare:
            definition = ""
        case .created:
            count(StaffTerms.createdInPeriod, s.created); count(StaffTerms.createdClosed, s.createdClosed)
            count(StaffTerms.notClosed, s.createdOpen)
            definition = "Đơn tạo trong kỳ của nhân viên này (không tính đơn xóa), như ô Tất cả khi lọc NV xử lý trên Pancake."
        case .closed:
            count(StaffTerms.closedInPeriod, s.closed)
            count(StaffTerms.fromCurrent, s.closedFromCreated); count(StaffTerms.fromPrevious, s.closedFromEarlier)
            definition = definitions.closed
        case .closeRate:
            count(StaffTerms.allocatedClosed, s.createdClosed); count(StaffTerms.allocatedTotal, s.created)
            items.append((StaffTerms.rate, Fmt.pct(s.closeRate)))
            definition = StaffTerms.rateDefinition
        case .whRate:
            if let warehouse = s.warehouseConfirmed {
                count(StaffTerms.warehouse, warehouse)
                count(StaffTerms.selfConfirmed, s.selfConfirmed); count(StaffTerms.unknownConfirmer, s.unknownConfirmer)
            } else {
                count(StaffTerms.whConfirmed, s.whConfirmed)
                count(StaffTerms.includingSelfConfirmed, s.selfConfirmed)
                count(StaffTerms.includingUnknownConfirmer, s.unknownConfirmer)
            }
            count(StaffTerms.waiting, s.waiting); count(StaffTerms.other, s.otherUnconfirmed)
            definition = definitions.whConfirmed
        case .closedNet:
            items.append((StaffTerms.closedRevenue, Fmt.money(s.closedNet)))
            count(StaffTerms.closedCount, s.closed)
            items.append((StaffTerms.averageValue, Fmt.shortVnd(s.aov)))
            definition = definitions.closed
        }
        rows = items
    }
}

// Luôn đối chiếu số đơn với staff[] trong chính lần trả danh sách, không dùng số của bảng trước đó.
struct StaffOrderCount {
    let expected: Double?
    let shown: Int
    var complete: Bool { expected == Double(shown) }
    var notice: String? {
        guard let expected, Double(shown) < expected else { return nil }
        return StaffTerms.firstOrders(shown, total: Int(expected))
    }
    init(_ data: API.StaffTable, query: StaffOrderQuery) {
        let staff = data.staff.first { $0.sellerId == query.staffId }
        expected = query.wh ? staff?.whConfirmed : staff?.closed
        shown = data.orders?.count ?? 0
    }
}

struct StaffTableBlock: View {
    let team: String; let by: String; let period: Period; let pos: String; let product: String
    let hrTeam: HrUnit?
    @Environment(AppNav.self) private var nav: AppNav?
    @State private var teamError: String?
    @State private var compareTeamError: String?
    private var compare = CompareState()
    init(team: String, by: String, period: Period, pos: String, product: String, hrTeam: HrUnit? = nil) {
        self.hrTeam = hrTeam
        self.team = team; self.by = by; self.period = period; self.pos = pos; self.product = product
    }
    @State private var comparison: API.StaffCompare?
    @State private var loadedCompareKey: String?
    @State private var compareError: String?
    @State private var compareGeneration = UUID()
    @State private var compareFreshness = Freshness()
    @State private var data: API.StaffTable?
    @State private var error: String?
    @State private var freshness = Freshness()
    @State private var generation = UUID()
    @State private var column: StaffColumn = .closedNet
    @State private var descending = true
    @State private var expanded = false
    @State private var why: StaffWhy?
    #if DEBUG
    @Environment(AppNav.self) private var tourNav: AppNav?
    #endif
    private var key: String { "\(period.key)|\(pos)|\(team)|\(hrTeam?.id ?? "")" }
    private var subtitle: String {
        let department: String = team == "sale" ? StaffTerms.saleSubtitle : StaffTerms.cskhSubtitle
        return "\(department)\(StaffTerms.subtitleSuffix)"
    }
    private var focusName: String? { data?.staff.first { $0.sellerId == compare.focusId }?.name }
    private var rows: [StaffDisplayRow] {
        guard let data else { return [] }
        let sorted = StaffDisplayRow.sorted(data.staff, column: column, descending: descending, comparison: comparisonValue)
        var shown = expanded ? sorted : Array(sorted.prefix(10))
        if let total = data.staffTotal, total.people > 1 { shown.append(StaffDisplayRow(total)) }
        return shown
    }
    var body: some View {
        ScrollViewReader { proxy in
            Panel {
                SectionHead(title: team == "sale" ? StaffTerms.saleTitle : StaffTerms.cskhTitle)
                Text(subtitle)
                    .font(.caption).foregroundStyle(Color.inkSoft).fixedSize(horizontal: false, vertical: true)
                if product != "all" { Text(StaffTerms.productUnfiltered).font(.caption).foregroundStyle(Color.warn) }
                CompareControls(state: compare, data: comparison,
                                focusName: focusName,
                                clearFocus: clearFocus, teamError: compareTeamError, clearTeam: { nav?.hrUnit = nil }, error: compareError, retry: { await loadCompare(force: true) })
                    .id("so-cung-ky")
                if let teamError { HrTeamErrorView(message: teamError) { nav?.hrUnit = nil } }
                else if let error { StateView(error: error) { await load(force: true) } }
                if let data {
                    if data.staff.isEmpty { StateView(empty: "Không có nhân viên trong kỳ này.") }
                    else {
                        StaffRowsTable(rows: rows, column: column, descending: descending, sort: sort, explain: explain, query: query, comparison: comparison, metric: compare.metric, kind: compare.kind,
                                       focusId: compare.focusId, selectFocus: { selectFocus($0, proxy: proxy) })
                            .id("hang-nhan-vien")
                        if !expanded && data.staff.count > 10 {
                            Button(StaffTerms.showAll(data.staff.count)) { expanded = true }
                                .font(.subheadline.weight(.semibold))
                        }
                        Color.clear.frame(height: 1).id("cuoi-bang-nhan-vien")
                    }
                } else if error == nil { StateView(loading: "Đang tải bảng nhân viên…") }
            }
            .id("bang-nhan-vien")
            .sheet(item: $why) { WhySheet(why: $0) }
            .task(id: key) { await load() }
            .task(id: compareKey) { await loadCompare() }
            .pullToReload { async let table: Void = load(force: true); async let cmp: Void = loadCompare(force: true); _ = await (table, cmp) }
            #if DEBUG
            .onChange(of: DebugTap.shared.tick) { _, _ in
                switch DebugTap.shared.target {
                case "xnk-rieng":
                    if let first = rows.first(where: { $0.staffId != nil }) { selectFocus(first, proxy: proxy) }
                case "xnk-rieng-last":
                    if let last = rows.last(where: { $0.staffId != nil }) { selectFocus(last, proxy: proxy) }
                case "xnk-expand": expanded = true
                case "xnk-ca-doi": clearFocus()
                case "xnk-cmp-default":
                    compare.mode = .previous; compare.step = 1; compare.kind = .wave; compare.metric = .closed
                    column = .closedNet; descending = true
                    CompareTourStatus.ready = false; logCompare()
                case "xnk-wave": compare.kind = .wave; logCompare()
                case "xnk-diff": compare.kind = .diff; logCompare()
                case "xnk-cum": compare.kind = .cum; logCompare()
                case "xnk-weekday": CompareTourStatus.ready = false; compare.mode = .weekday; compare.step = 2; logCompare()
                case "xnk-closed": compare.metric = .closed; logCompare()
                case "xnk-rate": compare.metric = .closeRate; logCompare()
                case "xnk-custom": CompareTourStatus.ready = false; compare.mode = .custom; logCompare()
                case "xnk-cmp-log": logCompare()
                case "xnk-cot": sort(.whRate)
                case "xnk-o": if let first = rows.first { explain(.whRate, first) }
                case "xnk-dong": why = nil
                case "xnk-ds", "xnk-chot":
                    if let first = rows.first, let q = query(first, DebugTap.shared.target == "xnk-ds") {
                        tourNav?.overviewPath.append(.staffOrders(q))
                    }
                default: break
                }
            }
            #endif
        }
    }
    private func selectFocus(_ row: StaffDisplayRow, proxy: ScrollViewProxy) {
        guard let id = row.staffId else { return }
        compare.focusId = compare.focusId == id ? nil : id
        // Không anchor: SwiftUI cuộn ít nhất tới toàn dải, cả DeptPage và Embed.
        withAnimation { proxy.scrollTo("so-cung-ky") }
        #if DEBUG
        logFocus()
        #endif
    }
    private func clearFocus() {
        compare.focusId = nil
        #if DEBUG
        logFocus()
        #endif
    }
    private var compareKey: String { "\(key)|\(compare.requestKey)" }
    private func mini(_ row: StaffDisplayRow) -> CompareMini? {
        if let id = row.staffId { return CompareMini(comparison?.staff.first { $0.sellerId == id }) }
        return comparison?.rowsTotal.map(CompareMini.init)
    }
    private func comparisonValue(_ id: String) -> Double? {
        let staff = comparison?.staff.first { $0.sellerId == id }
        let a = CompareMini.value(staff?.current, compare.metric), b = CompareMini.value(staff?.previous, compare.metric)
        guard let a, let b else { return nil }
        if compare.metric == .closeRate { return a - b }
        if b == 0 { return a > 0 ? .infinity : 0 }
        return (a - b) / b * 100
    }
    @MainActor private func loadCompare(force: Bool = false) async {
        let k = compareKey
        let ticket = UUID(); compareGeneration = ticket
        guard let request = compare.request else {
            comparison = nil; compareError = nil; compareTeamError = nil; return
        }
        if !force, loadedCompareKey == k, comparison != nil, let age = compareFreshness.age(k) { LoadTrace.skip("so-cung-ky", age: age); return }
        comparison = nil; compareError = nil; compareTeamError = nil
        #if DEBUG
        CompareTourStatus.ready = false
        #endif
        let bootstrap = request.bootstrap
        let range = period.range
        let trace = LoadTrace("so-cung-ky", requests: bootstrap ? 2 : 1)
        defer { trace.end(cancelled: Task.isCancelled || compareGeneration != ticket) }
        do {
            var result = try await trace.run {
                try await API.staffCompare(start: range.0, end: range.1, posIds: pos.isEmpty ? [] : [pos], team: team, by: by,
                    mode: request.mode.rawValue, step: request.step,
                    cstart: request.start, cend: request.end, hrTeam: hrTeam?.id)
            }
            try Task.checkCancellation()
            guard compareGeneration == ticket, compareKey == k else { return }
            var dates: (Date, Date)?
            if bootstrap {
                guard let start = VNDate.date(result.compare.start), let end = VNDate.date(result.compare.end) else {
                    compareError = "Không đọc được ngày kỳ so. Thử lại."; return
                }
                // Hoàn tất cả hai request trong cùng lượt tải. Đổi ngày ở đây sẽ đổi
                // task(id:) và hủy chính lượt bootstrap trước khi có số custom.
                dates = (start, end)
                result = try await trace.run {
                    try await API.staffCompare(start: range.0, end: range.1, posIds: pos.isEmpty ? [] : [pos], team: team, by: by,
                        mode: CmpMode.custom.rawValue, step: request.step,
                        cstart: VNDate.string(start), cend: VNDate.string(end), hrTeam: hrTeam?.id)
                }
                try Task.checkCancellation()
                guard compareGeneration == ticket, compareKey == k else { return }
            }
            // Chỉ công bố ngày và số cùng nhau; task mới do đổi ngày sẽ dùng số vừa tải.
            if let dates { compare.start = dates.0; compare.end = dates.1 }
            let loadedKey = compareKey
            comparison = result; loadedCompareKey = loadedKey; compareFreshness.stamp(loadedKey)
            #if DEBUG
            logCompare()
            #endif
        } catch {
            guard compareGeneration == ticket, compareKey == k else { return }
            compareTeamError = HrUnit.serverMessage(error, applied: hrTeam)
            if let api = error as? API.APIError, api.status == 400 { compareError = api.message }
            else if let text = LoadError.text(error) { compareError = text }
        }
    }
    private func sort(_ next: StaffColumn) {
        if next == column { descending.toggle() } else { column = next; descending = true }
        #if DEBUG
        logRows(); logCompare()
        #endif
    }
    private func explain(_ column: StaffColumn, _ row: StaffDisplayRow) {
        guard let data else { return }
        why = StaffWhy(column: column, row: row, definitions: data.definitions)
    }
    private func query(_ row: StaffDisplayRow, _ wh: Bool) -> StaffOrderQuery? {
        guard let data, let staffId = row.staffId else { return nil }
        let title: String = "\(row.name) · \(wh ? StaffTerms.whConfirmed : StaffTerms.closed)"
        return StaffOrderQuery(team: team, by: by, start: data.period.start, end: data.period.end,
                               posIds: pos.isEmpty ? [] : [pos], staffId: staffId, wh: wh, hrTeam: hrTeam?.id,
                               title: title)
    }
    @MainActor private func load(force: Bool = false) async {
        let k = key
        if !force, let age = freshness.age(k) { LoadTrace.skip("bang-nhan-vien", age: age); return }
        let ticket = UUID(); generation = ticket
        if freshness.age(k) == nil { data = nil }
        error = nil; teamError = nil; why = nil
        let range = period.range
        let trace = LoadTrace("bang-nhan-vien", requests: 1)
        defer { trace.end(cancelled: Task.isCancelled || generation != ticket) }
        do {
            let result = try await trace.run {
                try await API.staffTable(start: range.0, end: range.1, posIds: pos.isEmpty ? [] : [pos], team: team, by: by, hrTeam: hrTeam?.id)
            }
            try Task.checkCancellation()
            guard generation == ticket, key == k else { return }
            data = result; freshness.stamp(k)
            // Chỉ bỏ người khi bảng mới tải thành công không còn dòng đó; giữ khi đang tải/lỗi.
            if let id = compare.focusId, !result.staff.contains(where: { $0.sellerId == id }) { compare.focusId = nil }
            #if DEBUG
            logRows(); logCompare()
            #endif
        } catch {
            guard generation == ticket, key == k else { return }
            teamError = HrUnit.serverMessage(error, applied: hrTeam)
            if teamError != nil { data = nil; freshness.clear() }
            if let text = LoadError.text(error) { self.error = text }
        }
    }
    #if DEBUG
    private func logFocus() {
        guard ProcessInfo.processInfo.environment["MEGATECH_TOUR"] == "xnkho", let c = comparison,
              loadedCompareKey == compareKey, let data, data.period.start == c.period.start, data.period.end == c.period.end else { return }
        let summary = CompareSummary(c, focus: compare.focusId)
        let a = Fmt.cmpShort(CompareMini.value(summary.current, compare.metric), metric: compare.metric.rawValue)
        let b = Fmt.cmpShort(CompareMini.value(summary.previous, compare.metric), metric: compare.metric.rawValue)
        if let id = compare.focusId, let index = rows.filter({ $0.staffId != nil }).firstIndex(where: { $0.staffId == id }) {
            print("[XNK] rieng dong=\(Fmt.int(Double(index + 1))) nay=\(a) so=\(b)")
            print("[XNK] w5-rieng=\(summary.chart == nil ? "khong" : "co")")
        } else if compare.focusId == nil {
            print("[XNK] ca-doi nay=\(a) so=\(b)")
        }
        fflush(stdout)
    }
    private func logCompare() {
        guard ProcessInfo.processInfo.environment["MEGATECH_TOUR"] == "xnkho", let c = comparison,
              loadedCompareKey == compareKey, let data, data.period.start == c.period.start, data.period.end == c.period.end else { return }
        CompareTourStatus.ready = true
        let a = CompareMini.value(c.current.total, compare.metric), b = CompareMini.value(c.previous.total, compare.metric)
        let mini = CompareMini(c.staff.first)
        let count = mini.points(compare.metric, bucket: c.bucket, cutoff: c.compare.cutoff).filter { $0.0 != nil || $0.1 != nil }.count
        print("[XNK] so mode=\(c.mode) step=\(Fmt.int(Double(c.step))) kind=\(compare.kind.rawValue) cs=\(c.compare.start) ce=\(c.compare.end) nay=\(Fmt.cmpShort(a, metric: compare.metric.rawValue)) so=\(Fmt.cmpShort(b, metric: compare.metric.rawValue)) diem=\(Fmt.int(Double(count)))" + (c.compare.cutoff.map { " cutoff=" + $0 } ?? "") + " ky=\(c.period.start)..\(c.period.end)")
        for (index, row) in rows.filter({ $0.staffId != nil }).prefix(5).enumerated() { logMini(row, index: Fmt.int(Double(index + 1))) }
        if let total = data.staffTotal, total.people > 1 { logMini(StaffDisplayRow(total), index: "tong") }
        if compare.focusId != nil { logFocus() }
        fflush(stdout)
    }
    private func logMini(_ row: StaffDisplayRow, index: String) {
        guard let m = mini(row) else { return } // rowsTotal thiếu W2: ô Tổng trống, không log số thay thế.
        print("[XNK] mini dong=\(index) nay=\(Fmt.cmpShort(CompareMini.value(m.current, compare.metric), metric: compare.metric.rawValue)) so=\(Fmt.cmpShort(CompareMini.value(m.previous, compare.metric), metric: compare.metric.rawValue)) doi=\(m.change(compare.metric))")
    }
    private func logRows() {
        guard let data else { return }
        if TeamTourStatus.enabled {
            print("[TEAM] dept=\(team) ap=\(hrTeam == nil ? "khong" : "co") trang=nhan-vien")
            if hrTeam != nil {
                for (index, row) in rows.filter({ $0.staffId != nil }).prefix(5).enumerated() {
                    let s = row.values
                    print("[TEAM] dong=\(Fmt.int(Double(index + 1))) chia=\(Fmt.int(s.created)) chot=\(Fmt.int(s.closed)) tl=\(Fmt.pct(s.closeRate)) xn=\(Fmt.int(s.whConfirmed))/\(Fmt.int(s.closed)) dt=\(Fmt.shortMoney(s.closedNet))")
                }
                TeamTourStatus.tableReady = true
            }
            fflush(stdout)
        }
        guard ProcessInfo.processInfo.environment["MEGATECH_TOUR"] == "xnkho" else { return }
        print("[XNK] bang team=\(team) nguoi=\(Fmt.int(Double(data.staff.count))) tong=\(data.staffTotal.map { $0.people > 1 } == true ? "co" : "khong") tu=\(data.period.start) den=\(data.period.end)")
        for (index, row) in rows.filter({ $0.staffId != nil }).prefix(5).enumerated() {
            logRow(row, index: Fmt.int(Double(index + 1)))
        }
        if let total = data.staffTotal, total.people > 1 { logRow(StaffDisplayRow(total), index: "tong") }
        fflush(stdout)
    }
    private func logRow(_ row: StaffDisplayRow, index: String) {
        let s = row.values
        print("[XNK] dong=\(index) chia=\(Fmt.int(s.created)) chot=\(Fmt.int(s.closed)) tl=\(Fmt.pct(s.closeRate)) xn=\(Fmt.int(s.whConfirmed))/\(Fmt.int(s.closed)) dt=\(Fmt.shortMoney(s.closedNet))")
    }
    #endif
}

struct StaffRowsTable: View {
    let rows: [StaffDisplayRow]
    let column: StaffColumn; let descending: Bool
    let sort: (StaffColumn) -> Void
    let explain: (StaffColumn, StaffDisplayRow) -> Void
    let query: (StaffDisplayRow, Bool) -> StaffOrderQuery?
    let comparison: API.StaffCompare?
    let metric: StaffMetric
    let kind: CmpKind
    let focusId: String?
    let selectFocus: (StaffDisplayRow) -> Void
    private let numeric = StaffColumn.allCases.filter { $0 != .employee }
    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            VStack(spacing: 0) {
                header(.employee).frame(width: 132, height: 56)
                ForEach(rows) { row in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.name).fontWeight(row.staffId == nil ? .bold : .semibold).lineLimit(1)
                        if let dept = row.department { Text(dept).font(.caption2).foregroundStyle(Color.inkSoft).lineLimit(1) }
                    }
                    .frame(width: 120, height: 56, alignment: .leading).padding(.horizontal, 6).clipped()
                    .background(row.staffId == nil ? Color.brandSoft : Color.clear)
                }
            }
            ScrollViewReader { proxy in
                ScrollView(.horizontal) {
                    VStack(spacing: 0) {
                        HStack(spacing: 0) { ForEach(numeric, id: \.self) { c in header(c).frame(width: width(c), height: 56).id(c) } }
                        ForEach(rows) { row in
                            HStack(spacing: 0) {
                                ForEach(numeric, id: \.self) { c in
                                    cell(c, row).frame(width: width(c), height: 56).clipped()
                                }
                            }.background(row.staffId == nil ? Color.brandSoft : Color.clear)
                        }
                    }
                }
                #if DEBUG
                .onChange(of: DebugTap.shared.tick) { _, _ in
                    if ["xnk-cot", "xnk-cuon-kho"].contains(DebugTap.shared.target) {
                        withAnimation { proxy.scrollTo(StaffColumn.whRate, anchor: .trailing) }
                    }
                    if ["xnk-wave", "xnk-diff", "xnk-cum", "xnk-rate", "xnk-cmp-log"].contains(DebugTap.shared.target) {
                        withAnimation { proxy.scrollTo(StaffColumn.compare, anchor: .trailing) }
                    }
                }
                #endif
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .font(.caption).monospacedDigit().buttonStyle(.plain)
        .lineLimit(2).minimumScaleFactor(0.5)
        .clipped()
    }
    private func width(_ c: StaffColumn) -> CGFloat {
        if c == .compare { return 184 }
        if c == .whRate || c == .closeRate { return 152 }
        return 116
    }
    private func mini(_ row: StaffDisplayRow) -> CompareMini? {
        if let id = row.staffId { return CompareMini(comparison?.staff.first { $0.sellerId == id }) }
        return comparison?.rowsTotal.map(CompareMini.init)
    }
    private func scale(_ row: StaffDisplayRow, mini: CompareMini) -> Double {
        if row.staffId != nil { return CompareMini.scale(comparison, metric: metric) }
        if metric == .closeRate { return 100 }
        let current: Double = CompareMini.value(mini.current, metric) ?? 0
        let previous: Double = CompareMini.value(mini.previous, metric) ?? 0
        return max(current, previous)
    }
    private func header(_ c: StaffColumn) -> some View {
        Button { sort(c) } label: {
            HStack(spacing: 3) {
                Text(c.title).lineLimit(2)
                if column == c { Image(systemName: descending ? "arrow.down" : "arrow.up").font(.caption2) }
            }.fontWeight(.semibold).frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(.rect)
        }
        .accessibilityHint(c == .whRate ? StaffTerms.warehouseHint : "Sắp xếp")
        .help(c == .whRate ? StaffTerms.warehouseHint : c.title)
        .background(Color.brandSoft)
    }
    @ViewBuilder private func cell(_ c: StaffColumn, _ row: StaffDisplayRow) -> some View {
        let s = row.values
        switch c {
        case .compare:
            if let m = mini(row) {
                let scale: Double = scale(row, mini: m)
                if let id = row.staffId {
                    Button { selectFocus(row) } label: {
                        CompareCell(mini: m, metric: metric, kind: kind, max: scale, bucket: comparison?.bucket ?? "day", cutoff: comparison?.compare.cutoff)
                            .frame(maxWidth: .infinity, maxHeight: .infinity).contentShape(.rect)
                    }
                    .background(focusId == id ? Color.brandSoft : Color.clear, in: RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(focusId == id ? Color.brand : Color.clear, lineWidth: 2))
                    .padding(3)
                    .accessibilityLabel(StaffTerms.viewStaff(row.name))
                    .accessibilityAddTraits(focusId == id ? .isSelected : [])
                } else {
                    CompareCell(mini: m, metric: metric, kind: kind, max: scale, bucket: comparison?.bucket ?? "day", cutoff: comparison?.compare.cutoff)
                }
            }
        case .whRate:
            VStack(spacing: 3) {
                Button { explain(c, row) } label: { Text(Fmt.pct(s.whRate)).fontWeight(.semibold) }
                if let q = query(row, true) {
                    NavigationLink(value: Route.staffOrders(q)) { warehouseCount(s) }
                } else { Button { explain(c, row) } label: { warehouseCount(s) } }
            }.foregroundStyle(Color.brand)
        case .closed:
            HStack(spacing: 4) {
                if let q = query(row, false) {
                    NavigationLink(value: Route.staffOrders(q)) { Text(Fmt.int(s.closed)).fontWeight(.semibold) }
                } else { Button { explain(c, row) } label: { Text(Fmt.int(s.closed)) } }
                Button { explain(c, row) } label: { Image(systemName: "info.circle").padding(.vertical, 12) }
                    .accessibilityLabel("Giải thích \(StaffTerms.closed)")
            }.foregroundStyle(Color.brand)
        case .closeRate:
            Button { explain(c, row) } label: {
                VStack(spacing: 3) {
                    Text(Fmt.pct(s.closeRate)).fontWeight(.semibold)
                    Text(StaffTerms.alreadyClosed(s.createdClosed, s.created)).font(.caption2).foregroundStyle(Color.inkSoft)
                }
            }
        default:
            Button { explain(c, row) } label: {
                Text(c == .closedNet ? Fmt.shortMoney(s.closedNet) : Fmt.int(s.created))
                    .lineLimit(2).frame(maxWidth: .infinity, maxHeight: .infinity).contentShape(.rect)
            }
        }
    }
    private func warehouseCount(_ s: any StaffValues) -> some View {
        warehouseText(s).font(.caption2).lineLimit(1)
    }
    private func warehouseText(_ s: any StaffValues) -> Text {
        let closed: String = "/\(Fmt.int(s.closed)) đơn chốt"
        return Text(Fmt.int(s.whConfirmed)).bold() + Text(closed)
    }
}

struct WhySheet: View {
    let why: StaffWhy
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                ForEach(Array(why.rows.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .top) { Text(item.0); Spacer(); Text(item.1).monospacedDigit().fontWeight(.semibold) }
                }
                if !why.definition.isEmpty { Text(why.definition).font(.subheadline).foregroundStyle(.secondary) }
            }
            .navigationTitle(why.title).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Đóng") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
}

struct StaffOrdersView: View {
    @Environment(AppNav.self) private var nav: AppNav?
    @Environment(\.dismiss) private var dismiss
    @State private var teamError: String?
    let query: StaffOrderQuery
    @State private var data: API.StaffTable?
    @State private var error: String?
    private var orders: [API.PGOrder] { data?.orders ?? [] }
    private var count: StaffOrderCount? { data.map { StaffOrderCount($0, query: query) } }
    private var periodLabel: String { "\(Fmt.day(query.start)) – \(Fmt.day(query.end))" }
    var body: some View {
        List {
            Section {
                Text(periodLabel).font(.caption).foregroundStyle(.secondary)
                if let notice = count?.notice {
                    Text(notice).font(.caption).foregroundStyle(Color.warn)
                }
            }
            if let teamError {
                HrTeamErrorView(message: teamError) { nav?.hrUnit = nil; dismiss() }
            } else if let error { StateView(error: error) { await load() } }
            if data == nil && error == nil { StateView(loading: "Đang tải đơn…") }
            if data != nil && orders.isEmpty && error == nil { StateView(empty: "Không có đơn trong kỳ này.") }
            ForEach(orders) { o in
                NavigationLink(value: Route.order(o.id)) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("#\(o.orderCode) · \(o.posName)").font(.subheadline.weight(.semibold)).lineLimit(1)
                        Text("Giờ chốt: " + Fmt.dateTime(o.closedAt)).font(.caption)
                        Text("Giờ XN kho: " + Fmt.dateTime(o.whConfirmedAt)).font(.caption)
                        Text("Người XN: " + (o.confirmer ?? "—")).font(.caption)
                        Text(Fmt.shortVnd(o.net)).font(.subheadline.weight(.semibold)).monospacedDigit()
                        Text(o.products.joined(separator: ", ")).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }.padding(.vertical, 4)
                }
            }
        }
        .navigationTitle(query.title).navigationBarTitleDisplayMode(.inline).brandNav()
        .task(id: query) { await load() }
        .refreshable { await load() }
    }
    @MainActor private func load() async {
        do {
            let result = try await API.staffOrders(query)
            try Task.checkCancellation()
            data = result; error = nil; teamError = nil
            #if DEBUG
            if ProcessInfo.processInfo.environment["MEGATECH_TOUR"] == "xnkho" {
                print("[XNK] ds wh=\(query.wh ? "1" : "0") don=\(Fmt.int(Double(orders.count))) du=\(count?.complete == true ? "co" : "khong")")
                fflush(stdout)
            }
            #endif
        } catch {
            if let api = error as? API.APIError, api.status == 400, query.hrTeam != nil { teamError = api.message }
            if let text = LoadError.text(error) { self.error = text }
        }
    }
}

extension View {
    @ViewBuilder func pageReload(embedded: Bool, _ action: @escaping () async -> Void) -> some View {
        if embedded { pullToReload(action) } else { refreshHost(action) }
    }
}
