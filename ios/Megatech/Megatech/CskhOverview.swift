import SwiftUI

// MARK: Tổng quan CSKH (trang đầu của tab CSKH, yêu cầu 03/10/2026)
// Vào CSKH là thấy ngay: tiến độ KPI tháng của cả đội (chỉ chủ hệ thống), doanh thu, đơn chốt, xu hướng và ai đang dẫn đầu.
// Cùng cách tính với web: KPI theo đầu người cộng cả đội, đã đạt = doanh thu đơn chốt của những người đó từ đầu tháng.

struct CskhOverviewView: View {
    @AppStorage("thp_hide_money") private var hideMoney = false
    var embedded = false
    @Environment(AuthModel.self) private var auth
    @Environment(AppNav.self) private var nav: AppNav?
    @State private var teamError: String?
    @State private var generation = UUID()
    private var applied: HrUnit? { HrUnit.applies(nav?.hrUnit, to: "cskh") }
    private var loadKey: String { "\(period.key)|\(pos)|\(applied?.id ?? "")" }
    @State private var period: Period
    /// POS và nhóm đơn của bảng CSKH vừa bấm ở Tổng quan (số ở đây khớp số trên bảng); rỗng / "all" = tất cả.
    private let pos: String
    private let product: String
    /// period: kỳ mở sẵn (khi mở từ bảng CSKH ở Tổng quan); nil = kỳ chung (AppNav, kế hoạch 1.4).
    init(embedded: Bool = false, period: Period? = nil, pos: String = "", product: String = "all") {
        self.embedded = embedded
        _period = State(initialValue: period ?? NavMemory.period)
        self.pos = pos; self.product = product
    }
    @State private var data: API.Overview?
    @State private var badge: API.CskhBadge?
    @State private var error: String?
    @State private var loading = false
    private var range: (String, String) { period.range }
    private var showKpi: Bool { auth.me?.canView("cskh-kpi") ?? false }
    /// Trang đang xem đúng phạm vi thẻ KPI cần (từ đầu tháng tới hôm nay, cùng POS, mọi nhóm đơn, không lọc team).
    private var sharesMonth: Bool {
        let r = range, today = VNDate.string(.now)
        return r.0 == String(today.prefix(7)) + "-01" && r.1 == today && product == "all" && applied == nil
    }

    var body: some View {
        Embed(embedded: embedded, title: "Tổng quan CSKH") {
            if !embedded { PageTitle(title: "Tổng quan CSKH", subtitle: "Doanh thu và tiến độ KPI của đội CSKH.", icon: "chart.line.uptrend.xyaxis") }
            // Pill lọc (khung Gemini): kỳ và team; POS, nhóm đơn theo bảng vừa bấm (ghi trong bảng lọc).
            ScopeFilterPill(period: $period, team: true, fixedPos: pos, fixedProduct: product)
            HrTeamNotice(applies: applied != nil, deptLabel: "CSKH")
            if let teamError { HrTeamErrorView(message: teamError) { nav?.hrUnit = nil } }
            else if let error, data == nil { StateView(error: error) { await load() } }
            if let t = data?.current.total {
                let p = data?.compare?.total
                let closed = OrderQuery(start: range.0, end: range.1, posIds: pos.isEmpty ? [] : [pos], group: "closed", basis: "confirmed", title: "Đơn chốt CSKH", team: "cskh", product: product)
                let scope = "\(period.title) · \(pos.isEmpty ? "Mọi POS" : (PosBreakdown.names[pos] ?? pos)) · CSKH" + (product == "all" ? "" : " · nhóm \(Fmt.productGroup(product))")
                // Khung 11A: hero Doanh thu CSKH (badge so kỳ trước, đường theo ngày), rồi thẻ "Đơn chốt CSKH" 2×2 và nút KPI từng người.
                NavigationLink(value: Route.orders(closed)) {
                    MTDeptHero(label: "Doanh thu CSKH", value: Fmt.shortMoney(t.closedNet), delta: Fmt.delta(t.closedNet, p?.closedNet),
                               sub: scope, points: (data?.current.series).map(byDay) ?? [], masked: hideMoney)
                }.buttonStyle(.plain)
                VStack(alignment: .leading, spacing: MT.cellGap) {
                    Text("Đơn chốt CSKH").mtFont(.cardHeader).foregroundStyle(Palette.ink)
                    Grid(horizontalSpacing: MT.cellGap, verticalSpacing: MT.cellGap) {
                        GridRow {
                            NavigationLink(value: Route.orders(closed)) { BoardCell(label: "Đơn chốt", value: "\(Fmt.int(t.closedOrders)) đơn") }.buttonStyle(.plain)
                            BoardCell(label: "Doanh thu CSKH", value: hideMoney ? "•••" : Fmt.shortVnd(t.closedNet))
                        }
                        GridRow {
                            BoardCell(label: "Giá trị TB đơn", value: hideMoney ? "•••" : (t.averageOrder.map { Fmt.shortVnd($0) } ?? "—"))
                            NavigationLink(value: Route.page("calls")) {
                                BoardCell(label: "Hôm nay đã gọi", value: badge.map { "\(Fmt.int($0.callsToday)) cuộc" } ?? "—",
                                          note: badge.map { $0.over20 > 0 ? "\(Fmt.int($0.over20)) khách quá 20 ngày" : "không khách quá 20 ngày" })
                            }.buttonStyle(.plain)
                        }
                    }
                    .environment(\.thinking, loading)
                    if showKpi {
                        NavigationLink(value: Route.page("cskh-kpi")) {
                            HStack(spacing: 4) { Text("Xem KPI từng nhân viên CSKH"); Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)) }
                                .mtFont(.body).fontWeight(.bold).foregroundStyle(Color.white)
                                .frame(maxWidth: .infinity, minHeight: 48)
                                .background(Palette.mtBrandPrimary, in: .rect(cornerRadius: MT.rCell))
                        }.buttonStyle(MTPressStyle())
                    }
                }
                .padding(MT.cardPad).frame(maxWidth: .infinity, alignment: .leading).cardSurface()
                .id("team-cskh-calls")
                if applied != nil, badge != nil { Text("Cuộc gọi hôm nay chưa lọc theo team.").font(.caption).foregroundStyle(Color.inkSoft) }
            } else if error == nil { SkeletonGrid(tiles: 4) }
            if showKpi {
            // Kỳ Tháng này, mọi POS, mọi nhóm, không team: số tháng của trang chính chính là số tháng thẻ KPI cần, dùng chung
            // (không gọi /api/reports/overview tháng này hai lần).
            CskhKpiProgress(pos: pos, shared: sharesMonth ? data : nil, sharesMonth: sharesMonth, sharedFailed: sharesMonth && error != nil && data == nil)
                .id("team-cskh-kpi")
            if applied != nil { Text("Khối tiến độ KPI chưa lọc theo team.").font(.caption).foregroundStyle(Color.inkSoft) }
            }
            if let t = data?.current.total {
                let staff = (data?.current.byEmployee ?? []).filter { !$0.sellerId.isEmpty && ($0.closedNet > 0 || $0.closedOrders > 0) }.sorted { $0.closedNet > $1.closedNet }
                if !staff.isEmpty {
                    SectionHead(title: "Doanh thu theo nhân viên", action: "So sánh", route: .compare(team: "cskh"))
                    VStack(spacing: 0) {
                        ForEach(Array(staff.prefix(10).enumerated()), id: \.element.id) { i, r in
                            NavigationLink(value: Route.orders(OrderQuery(start: range.0, end: range.1, posIds: pos.isEmpty ? [] : [pos], group: "closed", sellerId: r.sellerId, basis: "confirmed", title: r.name ?? "Đơn chốt", team: "cskh", product: product))) {
                                HStack(spacing: 10) {
                                    Medal(rank: i + 1)
                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack { Text(r.name ?? "—").mtFont(.body).foregroundStyle(Color.ink).lineLimit(1); Spacer(); Text(Fmt.shortMoney(r.closedNet)).mtFont(.body).monospacedDigit().foregroundStyle(Color.ink) }
                                        Bar(value: t.closedNet > 0 ? r.closedNet / t.closedNet : 0, tint: .good, height: 5)
                                        Text("\(Fmt.int(r.closedOrders)) đơn · \(Fmt.pct0(t.closedNet > 0 ? r.closedNet / t.closedNet * 100 : nil)) doanh thu đội").mtFont(.caption).foregroundStyle(Color.inkSoft)
                                    }
                                }.padding(10).contentShape(.rect)
                            }.buttonStyle(.plain)
                            if i < min(staff.count, 10) - 1 { Divider().padding(.leading, 42) }
                        }
                    }.background(Color.card, in: .rect(cornerRadius: MT.rCard)).cardShadow()
                }
            }
            if auth.me?.canView("cskh-overview") == true {
                StaffTableBlock(team: "cskh", by: "care", period: period, pos: pos, product: product, hrTeam: applied)
            }
        }
        .task(id: loadKey) { await load() }
        // Kéo để làm mới trang chứa (trang CSKH) hoặc chính trang này khi mở riêng.
        .pageReload(embedded: embedded) { await load() }
    }
    private func byDay(_ s: [API.SeriesRow]) -> [(String, Double)] { var m: [String: Double] = [:]; for r in s { m[r.bucket, default: 0] += r.closedNet }; return m.keys.sorted().map { (String($0.suffix(2)), m[$0]!) } }
    @MainActor private func load() async {
        let k = loadKey, ticket = UUID(), unit = applied
        generation = ticket; data = nil; teamError = nil; error = nil
        loading = true; defer { if generation == ticket { loading = false } }
        let r = range, ids = pos.isEmpty ? [] : [pos], prod = product
        let trace = LoadTrace("tong-quan-cskh", requests: 2)
        defer { trace.end(cancelled: Task.isCancelled || generation != ticket) }
        // Số cuộc gọi hôm nay tải cùng lúc với số chính.
        async let bReq = attempt(true, trace) { try await API.cskhBadge(posIds: ids) }
        do {
            let result = try await trace.run { try await API.overview(start: r.0, end: r.1, posIds: ids, team: "cskh", product: prod, hrTeam: unit?.id) }
            try Task.checkCancellation()
            guard generation == ticket, loadKey == k else { return }
            data = result
            error = nil
        } catch {
            guard generation == ticket, loadKey == k, !Task.isCancelled else { return }
            teamError = HrUnit.serverMessage(error, applied: unit)
            if let text = LoadError.text(error) { self.error = text }
        }
        let bRes = await bReq
        guard generation == ticket, loadKey == k, !Task.isCancelled else { return }
        if let b = try? bRes?.get() { badge = b }
        #if DEBUG
        // R-POS: tổng doanh thu CSKH của POS đang xem, để so chọn một POS với Mọi POS.
        if MktNvTour.active, let t = data?.current.total {
            print("[UIPOS] cskh pos=\(pos.isEmpty ? "tat-ca" : pos) dt=\(Fmt.int(t.closedNet)) don=\(Fmt.int(t.closedOrders))")
            fflush(stdout)
        }
        if TeamTourStatus.enabled, data != nil {
            TeamTourStatus.cskhReady = true
            print("[TEAM] dept=cskh ap=\(unit == nil ? "khong" : "co") trang=tong-quan")
            fflush(stdout)
        }
        #endif
    }
}

/// Thẻ tiến độ KPI tháng hiện tại của cả đội CSKH: đã đạt / KPI, vạch tiến độ chuẩn theo ngày, thiếu / vượt, cần mỗi ngày, hôm nay, số người đúng tiến độ.
struct CskhKpiProgress: View {
    /// POS đang chọn (R-POS): số và danh sách người chỉ của POS này; "" = mọi POS.
    var pos = ""
    /// Số tháng (đầu tháng tới hôm nay, team CSKH) trang chứa đã tải; sharesMonth: dùng số này, không tự hỏi lại.
    var shared: API.Overview? = nil
    var sharesMonth = false
    var sharedFailed = false
    @AppStorage("thp_hide_money") private var hideMoney = false
    @State private var targets: API.Targets?
    @State private var month: API.Overview?
    @State private var today: API.Overview?
    @State private var staff: [API.Employee]?
    /// Chưa tính được tiến độ vì có nguồn chưa tải được: câu lỗi dễ hiểu (LoadError).
    @State private var failText: String?
    private let ym = String(VNDate.string(.now).prefix(7))

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            NavigationLink(value: Route.page("cskh-kpi")) {
                Panel {
                    HStack {
                        Image(systemName: "target").mtFont(.cardHeader).foregroundStyle(Color.good)
                        Text("KPI CSKH tháng \(Int(ym.suffix(2)) ?? 0)/\(ym.prefix(4))").mtFont(.cardHeader).foregroundStyle(Color.ink)
                        Spacer()
                        HStack(spacing: 2) { Text("Từng người"); Image(systemName: "chevron.right").mtFont(.caption) }.mtFont(.body).foregroundStyle(Color.brand)
                    }
                    if let s = summary { content(s) }
                    else if failText != nil || sharedFailed { Text("Chưa tính được tiến độ KPI tháng này.").mtFont(.body).foregroundStyle(Color.inkSoft) }
                    else { Skeleton(height: 120) }
                }
            }
            .buttonStyle(.plain)
            // Nút Thử lại nằm ngoài liên kết (chạm Thử lại không mở trang KPI).
            if let failText, summary == nil { StateView(error: failText, compact: true) { await load() } }
        }
        .task(id: "\(sharesMonth)|\(pos)") { await load() }
        .pullToReload { await load() }
    }

    /// Nhân viên thuộc POS đang chọn (theo posIds của nhân viên). Máy chủ chưa trả posIds thì không loại.
    static func inPos(_ e: API.Employee, _ pos: String) -> Bool {
        guard !pos.isEmpty, let ids = e.posIds else { return true }
        return ids.contains(pos)
    }

    private struct Summary { let goal, goalOrders, done, doneOrders, todayNet, daily: Double; let withGoal, onTrack, day, dim: Int }
    private var summary: Summary? {
        guard let targets, let staff, let month = sharesMonth ? shared : month else { return nil }
        let goals: [String: API.Target] = Dictionary(targets.items.filter { $0.scope == "employee" }.map { ($0.refId, $0) }, uniquingKeysWith: { a, _ in a })
        let isSystem: (String) -> Bool = { n in n.range(of: #"api[_ ]?connection|^api\b|webhook|system"#, options: [.regularExpression, .caseInsensitive]) != nil }
        // R-POS: đã chọn POS thì chỉ người thuộc POS đó (người làm 2 POS tính ở cả hai).
        let list: [API.Employee] = staff.filter { !isSystem($0.name) && ($0.active != false || goals[$0.id] != nil) && Self.inPos($0, pos) }
        let by: [String: API.EmployeeRow] = Dictionary((month.current.byEmployee ?? []).map { ($0.sellerId, $0) }, uniquingKeysWith: { a, _ in a })
        let byToday: [String: API.EmployeeRow] = Dictionary((today?.current.byEmployee ?? []).map { ($0.sellerId, $0) }, uniquingKeysWith: { a, _ in a })
        let day: Int = Int(VNDate.string(.now).suffix(2)) ?? 1
        let dim: Int = Int(VNDate.monthEnd(ym).suffix(2)) ?? 30
        let withGoal: [API.Employee] = list.filter { (goals[$0.id]?.revenue ?? 0) > 0 }
        func isOnTrack(_ employee: API.Employee) -> Bool {
            let done: Double = by[employee.id]?.closedNet ?? 0
            let goal: Double = goals[employee.id]!.revenue
            let progress: Double = done / goal
            let expected: Double = Double(day) / Double(dim)
            return progress >= expected
        }
        let onTrack: Int = withGoal.filter(isOnTrack).count
        let goal: Double = list.reduce(0) { $0 + (goals[$1.id]?.revenue ?? 0) }
        let goalOrders: Double = list.reduce(0) { $0 + (goals[$1.id]?.closedOrders ?? 0) }
        let done: Double = list.reduce(0) { $0 + (by[$1.id]?.closedNet ?? 0) }
        let doneOrders: Double = list.reduce(0) { $0 + (by[$1.id]?.closedOrders ?? 0) }
        let todayNet: Double = list.reduce(0) { $0 + (byToday[$1.id]?.closedNet ?? 0) }
        let daily: Double = list.reduce(0) { a, e in
            guard let g = goals[e.id], g.revenue > 0 else { return a }
            return a + g.revenue / max(1, g.workingDays ?? Double(dim))
        }
        return Summary(goal: goal, goalOrders: goalOrders, done: done, doneOrders: doneOrders, todayNet: todayNet, daily: daily,
            withGoal: withGoal.count, onTrack: onTrack, day: day, dim: dim)
    }

    @ViewBuilder private func content(_ s: Summary) -> some View {
        if s.goal <= 0 {
            Text("Tháng này chưa đặt KPI CSKH. Đã chốt \(Fmt.shortMoney(s.done)) · \(Fmt.int(s.doneOrders)) đơn từ đầu tháng. Chạm để đặt KPI.").mtFont(.body).foregroundStyle(Color.inkSoft)
        } else {
            let p = s.done / s.goal, expected = Double(s.day) / Double(s.dim), pace = expected > 0 ? p / expected : 1
            let tint: Color = progressTint(pace)
            let should = s.goal * expected, gap = s.done - should
            let daysLeft = Double(s.dim - s.day + 1), need = max(0, s.goal - s.done) / daysLeft
            HStack(alignment: .center, spacing: 14) {
                Ring(value: p, size: 72, line: 8, tint: tint)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Đã đạt").mtFont(.caption).foregroundStyle(Color.inkSoft)
                    Text(hideMoney ? "••• tr ₫" : Fmt.shortMoney(s.done)).mtFont(.heroNumber).lineLimit(1).minimumScaleFactor(0.6).foregroundStyle(Color.ink).monospacedDigit().rolling(hideMoney ? "••• tr ₫" : Fmt.short(s.done))
                    Text("trên KPI \(Fmt.shortMoney(s.goal)) · ngày \(s.day)/\(s.dim)").mtFont(.caption).foregroundStyle(Color.inkSoft)
                }
                Spacer(minLength: 0)
            }
            // Thanh tiến độ + vạch "cần đạt tới hôm nay".
            VStack(alignment: .leading, spacing: 4) {
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Bar(value: p, tint: tint, height: 10)
                        Rectangle().fill(Color.ink).frame(width: 2, height: 16).offset(x: max(0, min(g.size.width - 2, g.size.width * expected - 1)))
                    }.frame(height: 16)
                }.frame(height: 16)
                Text("Vạch đen = mức cần đạt tới hôm nay (\(Fmt.pct0(expected * 100)) KPI)").mtFont(.caption).foregroundStyle(Color.inkSoft)
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                MiniKpi(label: "So với tiến độ", value: "\(gap >= 0 ? "Vượt" : "Thiếu") \(Fmt.shortMoney(abs(gap)))", tint: gap >= 0 ? .good : .bad, sub: "Cần \(Fmt.shortMoney(should)) tới hôm nay")
                MiniKpi(label: "Cần mỗi ngày còn lại", value: s.goal > s.done ? Fmt.shortMoney(need) : "Đã đạt KPI", tint: s.goal > s.done ? .ink : .good, sub: s.goal > s.done ? "Còn \(Int(daysLeft)) ngày, tính cả hôm nay" : "Vượt \(Fmt.shortMoney(s.done - s.goal))")
                MiniKpi(label: "Hôm nay", value: Fmt.shortMoney(s.todayNet), tint: s.daily > 0 && s.todayNet >= s.daily ? .good : .ink, sub: s.daily > 0 ? "\(Fmt.pct0(s.todayNet / s.daily * 100)) KPI ngày (\(Fmt.shortMoney(s.daily)))" : "—")
                MiniKpi(label: "Đúng tiến độ", value: "\(s.onTrack)/\(s.withGoal) người", tint: s.withGoal > 0 && Double(s.onTrack) / Double(s.withGoal) >= 0.5 ? .good : .warn, sub: s.goalOrders > 0 ? "Đơn \(Fmt.int(s.doneOrders))/\(Fmt.int(s.goalOrders)) KPI" : "\(Fmt.int(s.doneOrders)) đơn chốt")
            }
        }
    }

    private func progressTint(_ pace: Double) -> Color {
        if pace >= 1 { return .good }
        if pace >= 0.6 { return .warn }
        return .bad
    }

    /// Bốn nguồn tải cùng lúc; nguồn lỗi giữ số đang có (không coi danh sách nhân viên lỗi là "chưa đặt KPI").
    @MainActor private func load() async {
        let d = VNDate.string(.now), m = ym, needStaff = staff == nil, needMonth = !sharesMonth, ids = pos.isEmpty ? [] : [pos]
        let trace = LoadTrace("kpi-cskh", requests: (needStaff ? 1 : 0) + (needMonth ? 1 : 0) + 2)
        async let sReq = attempt(needStaff, trace) { try await API.employees(team: "cskh") }
        async let tReq = attempt(true, trace) { try await API.targets(month: m) }
        async let mReq = attempt(needMonth, trace) { try await API.overview(start: m + "-01", end: d, posIds: ids, team: "cskh", compare: "none") }
        async let dReq = attempt(true, trace) { try await API.overview(start: d, end: d, posIds: ids, team: "cskh", compare: "none") }
        let (sRes, tRes, mRes, dRes) = await (sReq, tReq, mReq, dReq)
        trace.end(cancelled: Task.isCancelled)
        guard !Task.isCancelled else { return }
        var errors: [Error] = []
        func take<T>(_ r: Result<T, Error>?, _ set: (T) -> Void) {
            switch r {
            case .success(let v)?: set(v)
            case .failure(let e)?: errors.append(e)
            case nil: break
            }
        }
        take(sRes) { staff = $0 }
        take(tRes) { targets = $0 }
        take(mRes) { month = $0 }
        take(dRes) { today = $0 }
        failText = summary == nil ? errors.compactMap { LoadError.text($0) }.first : nil
    }
}

private struct MiniKpi: View {
    let label: String; let value: String; let tint: Color; let sub: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).mtFont(.caption).foregroundStyle(Color.inkSoft).lineLimit(1)
            Text(value).font(.system(size: 15, weight: .bold, design: .rounded)).foregroundStyle(tint).monospacedDigit().minimumScaleFactor(0.7).lineLimit(1)
            Text(sub).mtFont(.caption).foregroundStyle(Color.inkSoft).lineLimit(1).minimumScaleFactor(0.8)
        }
        .padding(10).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.mtSurfaceCell, in: .rect(cornerRadius: 10))
    }
}
