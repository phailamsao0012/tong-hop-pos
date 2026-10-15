import SwiftUI

// MARK: Tổng quan CSKH (trang đầu của tab CSKH, yêu cầu 03/10/2026)
// Vào CSKH là thấy ngay: tiến độ KPI tháng của cả đội (chỉ chủ hệ thống), doanh thu, đơn chốt, xu hướng và ai đang dẫn đầu.
// Cùng cách tính với web: KPI theo đầu người cộng cả đội, đã đạt = doanh thu đơn chốt của những người đó từ đầu tháng.

struct CskhOverviewView: View {
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

    var body: some View {
        Embed(embedded: embedded, title: "Tổng quan CSKH") {
            PageTitle(title: "Tổng quan CSKH", subtitle: "Doanh thu và tiến độ KPI của đội CSKH.", icon: "chart.line.uptrend.xyaxis")
            PeriodChips(period: $period)
            ScopeLine(period: period, pos: pos, product: product)
            HStack { HrTeamChip(); Spacer() }
            HrTeamNotice(applies: applied != nil, deptLabel: "CSKH")
            if showKpi {
                CskhKpiProgress().id("team-cskh-kpi")
                if applied != nil { Text("Khối tiến độ KPI chưa lọc theo team.").font(.caption).foregroundStyle(Color.inkSoft) }
            }
            if let teamError { HrTeamErrorView(message: teamError) { nav?.hrUnit = nil } }
            else if let error, data == nil { StateView(error: error) { await load() } }
            if let t = data?.current.total {
                let p = data?.compare?.total
                let closed = OrderQuery(start: range.0, end: range.1, posIds: pos.isEmpty ? [] : [pos], group: "closed", basis: "confirmed", title: "Đơn chốt CSKH", team: "cskh", product: product)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    NavigationLink(value: Route.orders(closed)) { KpiCard(icon: "ic_m_revenue", tint: .teal, label: "Doanh thu CSKH", value: Fmt.vnd(t.closedNet), delta: Fmt.delta(t.closedNet, p?.closedNet)) }
                    NavigationLink(value: Route.orders(closed)) { KpiCard(icon: "ic_m_closed", tint: .good, label: "Đơn chốt", value: Fmt.int(t.closedOrders), delta: Fmt.delta(t.closedOrders, p?.closedOrders)) }
                    KpiCard(icon: "ic_m_aov", tint: .blue, label: "Giá trị TB đơn", value: Fmt.vnd(t.averageOrder ?? 0), delta: Fmt.delta(t.averageOrder ?? 0, p?.averageOrder))
                    KpiCard(icon: "ic_m_rate", tint: .purple, label: "Tỷ lệ chốt", value: Fmt.pct(t.shownRate), delta: (t.shownRate != nil && p?.shownRate != nil) ? Fmt.points(t.shownRate! - p!.shownRate!) : nil, deltaGood: (t.shownRate ?? 0) >= (p?.shownRate ?? 0), note: t.rateFrac)
                }
                .buttonStyle(.plain)
                .environment(\.thinking, loading)
                Text("\(period.title)\(pos.isEmpty ? "" : " · POS \(PosBreakdown.names[pos] ?? pos)")\(product == "all" ? "" : " · nhóm \(Fmt.productGroup(product))") · so với kỳ liền trước · đơn do nhân viên CSKH phụ trách").font(.system(size: 10)).foregroundStyle(Color.inkSoft).padding(.top, -8)
                if let s = data?.current.series, Set(s.map(\.bucket)).count > 1 {
                    Panel {
                        HStack { Text("Doanh thu theo ngày").font(.system(size: 15, weight: .bold)); Spacer(); Hint(text: "Đơn chốt CSKH") }
                        LineChart(points: byDay(s))
                    }
                }
                if let b = badge {
                    NavigationLink(value: Route.page("calls")) {
                        HStack(spacing: 12) {
                            Image(systemName: "phone.fill").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.good).frame(width: 36, height: 36).background(Color.brandSoft, in: .rect(cornerRadius: 10))
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Hôm nay đã gọi \(Fmt.int(b.callsToday)) cuộc").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink)
                                Text(b.over20 > 0 ? "\(Fmt.int(b.over20)) khách quá 20 ngày chưa ghi chú" : "Không có khách quá 20 ngày chưa ghi chú").font(.system(size: 11)).foregroundStyle(b.over20 > 0 ? Color.warn : Color.inkSoft)
                            }
                            Spacer(); Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft)
                        }.padding(12).background(Color.card, in: .rect(cornerRadius: 12)).cardShadow()
                    }.buttonStyle(.plain).id("team-cskh-calls")
                    if applied != nil { Text("Cuộc gọi hôm nay chưa lọc theo team.").font(.caption).foregroundStyle(Color.inkSoft) }
                }
                let staff = (data?.current.byEmployee ?? []).filter { !$0.sellerId.isEmpty && ($0.closedNet > 0 || $0.closedOrders > 0) }.sorted { $0.closedNet > $1.closedNet }
                if !staff.isEmpty {
                    SectionHead(title: "Doanh thu theo nhân viên", action: "So sánh", route: .compare(team: "cskh"))
                    VStack(spacing: 0) {
                        ForEach(Array(staff.prefix(10).enumerated()), id: \.element.id) { i, r in
                            NavigationLink(value: Route.orders(OrderQuery(start: range.0, end: range.1, posIds: pos.isEmpty ? [] : [pos], group: "closed", sellerId: r.sellerId, basis: "confirmed", title: r.name ?? "Đơn chốt", team: "cskh", product: product))) {
                                HStack(spacing: 10) {
                                    Medal(rank: i + 1)
                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack { Text(r.name ?? "—").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1); Spacer(); Text(Fmt.shortMoney(r.closedNet)).font(.system(size: 13, weight: .bold)).monospacedDigit().foregroundStyle(Color.ink) }
                                        Bar(value: t.closedNet > 0 ? r.closedNet / t.closedNet : 0, tint: .good, height: 5)
                                        Text("\(Fmt.int(r.closedOrders)) đơn · \(Fmt.pct0(t.closedNet > 0 ? r.closedNet / t.closedNet * 100 : nil)) doanh thu đội").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                                    }
                                }.padding(10).contentShape(.rect)
                            }.buttonStyle(.plain)
                            if i < min(staff.count, 10) - 1 { Divider().padding(.leading, 42) }
                        }
                    }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                }
            } else if error == nil { SkeletonGrid(tiles: 4) }
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
        async let bReq = attempt(true, trace) { try await API.cskhBadge() }
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
                        Image(systemName: "target").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.good)
                        Text("KPI CSKH tháng \(Int(ym.suffix(2)) ?? 0)/\(ym.prefix(4))").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink)
                        Spacer()
                        HStack(spacing: 2) { Text("Từng người"); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }.font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand)
                    }
                    if let s = summary { content(s) }
                    else if failText != nil { Text("Chưa tính được tiến độ KPI tháng này.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) }
                    else { Skeleton(height: 120) }
                }
            }
            .buttonStyle(.plain)
            // Nút Thử lại nằm ngoài liên kết (chạm Thử lại không mở trang KPI).
            if let failText, summary == nil { StateView(error: failText, compact: true) { await load() } }
        }
        .task { await load() }
        .pullToReload { await load() }
    }

    private struct Summary { let goal, goalOrders, done, doneOrders, todayNet, daily: Double; let withGoal, onTrack, day, dim: Int }
    private var summary: Summary? {
        guard let targets, let month, let staff else { return nil }
        let goals = Dictionary(targets.items.filter { $0.scope == "employee" }.map { ($0.refId, $0) }, uniquingKeysWith: { a, _ in a })
        let isSystem = { (n: String) in n.range(of: #"api[_ ]?connection|^api\b|webhook|system"#, options: [.regularExpression, .caseInsensitive]) != nil }
        let list = staff.filter { !isSystem($0.name) && ($0.active != false || goals[$0.id] != nil) }
        let by = Dictionary((month.current.byEmployee ?? []).map { ($0.sellerId, $0) }, uniquingKeysWith: { a, _ in a })
        let byToday = Dictionary((today?.current.byEmployee ?? []).map { ($0.sellerId, $0) }, uniquingKeysWith: { a, _ in a })
        let day = Int(VNDate.string(.now).suffix(2)) ?? 1, dim = Int(VNDate.monthEnd(ym).suffix(2)) ?? 30
        let withGoal = list.filter { (goals[$0.id]?.revenue ?? 0) > 0 }
        let onTrack = withGoal.filter { (by[$0.id]?.closedNet ?? 0) / goals[$0.id]!.revenue >= Double(day) / Double(dim) }.count
        return Summary(
            goal: list.reduce(0) { $0 + (goals[$1.id]?.revenue ?? 0) },
            goalOrders: list.reduce(0) { $0 + (goals[$1.id]?.closedOrders ?? 0) },
            done: list.reduce(0) { $0 + (by[$1.id]?.closedNet ?? 0) },
            doneOrders: list.reduce(0) { $0 + (by[$1.id]?.closedOrders ?? 0) },
            todayNet: list.reduce(0) { $0 + (byToday[$1.id]?.closedNet ?? 0) },
            daily: list.reduce(0) { a, e in guard let g = goals[e.id], g.revenue > 0 else { return a }; return a + g.revenue / max(1, g.workingDays ?? Double(dim)) },
            withGoal: withGoal.count, onTrack: onTrack, day: day, dim: dim)
    }

    @ViewBuilder private func content(_ s: Summary) -> some View {
        if s.goal <= 0 {
            Text("Tháng này chưa đặt KPI CSKH. Đã chốt \(Fmt.shortMoney(s.done)) · \(Fmt.int(s.doneOrders)) đơn từ đầu tháng. Chạm để đặt KPI.").font(.system(size: 12)).foregroundStyle(Color.inkSoft)
        } else {
            let p = s.done / s.goal, expected = Double(s.day) / Double(s.dim), pace = expected > 0 ? p / expected : 1
            let tint: Color = pace >= 1 ? .good : pace >= 0.6 ? .warn : .bad
            let should = s.goal * expected, gap = s.done - should
            let daysLeft = Double(s.dim - s.day + 1), need = max(0, s.goal - s.done) / daysLeft
            HStack(alignment: .center, spacing: 14) {
                Ring(value: p, size: 72, line: 8, tint: tint)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Đã đạt").font(.system(size: 11)).foregroundStyle(Color.inkSoft)
                    Text(Fmt.shortMoney(s.done)).font(.system(size: 24, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).monospacedDigit().rolling(Fmt.short(s.done))
                    Text("trên KPI \(Fmt.shortMoney(s.goal)) · ngày \(s.day)/\(s.dim)").font(.system(size: 11)).foregroundStyle(Color.inkSoft)
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
                Text("Vạch đen = mức cần đạt tới hôm nay (\(Fmt.pct0(expected * 100)) KPI)").font(.system(size: 9)).foregroundStyle(Color.inkSoft)
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                MiniKpi(label: "So với tiến độ", value: "\(gap >= 0 ? "Vượt" : "Thiếu") \(Fmt.shortMoney(abs(gap)))", tint: gap >= 0 ? .good : .bad, sub: "Cần \(Fmt.shortMoney(should)) tới hôm nay")
                MiniKpi(label: "Cần mỗi ngày còn lại", value: s.goal > s.done ? Fmt.shortMoney(need) : "Đã đạt KPI", tint: s.goal > s.done ? .ink : .good, sub: s.goal > s.done ? "Còn \(Int(daysLeft)) ngày, tính cả hôm nay" : "Vượt \(Fmt.shortMoney(s.done - s.goal))")
                MiniKpi(label: "Hôm nay", value: Fmt.shortMoney(s.todayNet), tint: s.daily > 0 && s.todayNet >= s.daily ? .good : .ink, sub: s.daily > 0 ? "\(Fmt.pct0(s.todayNet / s.daily * 100)) KPI ngày (\(Fmt.shortMoney(s.daily)))" : "—")
                MiniKpi(label: "Đúng tiến độ", value: "\(s.onTrack)/\(s.withGoal) người", tint: s.withGoal > 0 && Double(s.onTrack) / Double(s.withGoal) >= 0.5 ? .good : .warn, sub: s.goalOrders > 0 ? "Đơn \(Fmt.int(s.doneOrders))/\(Fmt.int(s.goalOrders)) KPI" : "\(Fmt.int(s.doneOrders)) đơn chốt")
            }
        }
    }

    /// Bốn nguồn tải cùng lúc; nguồn lỗi giữ số đang có (không coi danh sách nhân viên lỗi là "chưa đặt KPI").
    @MainActor private func load() async {
        let d = VNDate.string(.now), m = ym, needStaff = staff == nil
        let trace = LoadTrace("kpi-cskh", requests: needStaff ? 4 : 3)
        async let sReq = attempt(needStaff, trace) { try await API.employees(team: "cskh") }
        async let tReq = attempt(true, trace) { try await API.targets(month: m) }
        async let mReq = attempt(true, trace) { try await API.overview(start: m + "-01", end: d, team: "cskh", compare: "none") }
        async let dReq = attempt(true, trace) { try await API.overview(start: d, end: d, team: "cskh", compare: "none") }
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
            Text(label).font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1)
            Text(value).font(.system(size: 15, weight: .bold, design: .rounded)).foregroundStyle(tint).monospacedDigit().minimumScaleFactor(0.7).lineLimit(1)
            Text(sub).font(.system(size: 9)).foregroundStyle(Color.inkSoft).lineLimit(1).minimumScaleFactor(0.8)
        }
        .padding(10).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.black.opacity(0.03), in: .rect(cornerRadius: 10))
    }
}
