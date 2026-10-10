import SwiftUI

// MARK: Tổng quan CSKH (trang đầu của tab CSKH, yêu cầu 03/10/2026)
// Vào CSKH là thấy ngay: tiến độ KPI tháng của cả đội (chỉ chủ hệ thống), doanh thu, đơn chốt, xu hướng và ai đang dẫn đầu.
// Cùng cách tính với web: KPI theo đầu người cộng cả đội, đã đạt = doanh thu đơn chốt của những người đó từ đầu tháng.

struct CskhOverviewView: View {
    var embedded = false
    @Environment(AuthModel.self) private var auth
    @State private var period: Period
    /// period: kỳ mở sẵn (khi mở từ bảng CSKH ở Tổng quan); nil = Tháng này.
    init(embedded: Bool = false, period: Period? = nil) {
        self.embedded = embedded
        _period = State(initialValue: period ?? .month)
    }
    @State private var data: API.Overview?
    @State private var badge: API.CskhBadge?
    @State private var error: String?
    @State private var loading = false
    private var range: (String, String) { period.range }
    private var showKpi: Bool { auth.me?.canView("cskh-kpi") ?? false }

    var body: some View {
        Embed(embedded: embedded, title: "Tổng quan CSKH") {
            PageTitle(title: "Tổng quan CSKH", subtitle: "Doanh thu và tiến độ KPI của đội CSKH.", icon: "chart.line.uptrend.xyaxis", trailing: AnyView(PeriodMenu(period: $period)))
            if showKpi { CskhKpiProgress() }
            if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
            if let t = data?.current.total {
                let p = data?.compare?.total
                let closed = OrderQuery(start: range.0, end: range.1, group: "closed", basis: "confirmed", title: "Đơn chốt CSKH", team: "cskh")
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    NavigationLink(value: Route.orders(closed)) { KpiCard(icon: "ic_m_revenue", tint: .teal, label: "Doanh thu CSKH", value: Fmt.vnd(t.closedNet), delta: Fmt.delta(t.closedNet, p?.closedNet)) }
                    NavigationLink(value: Route.orders(closed)) { KpiCard(icon: "ic_m_closed", tint: .good, label: "Đơn chốt", value: Fmt.int(t.closedOrders), delta: Fmt.delta(t.closedOrders, p?.closedOrders)) }
                    KpiCard(icon: "ic_m_aov", tint: .blue, label: "Giá trị TB đơn", value: Fmt.vnd(t.averageOrder ?? 0), delta: Fmt.delta(t.averageOrder ?? 0, p?.averageOrder))
                    KpiCard(icon: "ic_m_rate", tint: .purple, label: "Tỷ lệ chốt", value: Fmt.pct(t.shownRate), delta: (t.shownRate != nil && p?.shownRate != nil) ? String(format: "%+.1f điểm", t.shownRate! - p!.shownRate!).replacingOccurrences(of: ".", with: ",") : nil, deltaGood: (t.shownRate ?? 0) >= (p?.shownRate ?? 0), note: t.rateFrac)
                }
                .buttonStyle(.plain)
                .environment(\.thinking, loading)
                Text("\(period.title) · so với kỳ liền trước · đơn do nhân viên CSKH phụ trách").font(.system(size: 10)).foregroundStyle(Color.inkSoft).padding(.top, -8)
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
                    }.buttonStyle(.plain)
                }
                let staff = (data?.current.byEmployee ?? []).filter { !$0.sellerId.isEmpty && ($0.closedNet > 0 || $0.closedOrders > 0) }.sorted { $0.closedNet > $1.closedNet }
                if !staff.isEmpty {
                    SectionHead(title: "Doanh thu theo nhân viên", action: "So sánh", route: .compare(team: "cskh"))
                    VStack(spacing: 0) {
                        ForEach(Array(staff.prefix(10).enumerated()), id: \.element.id) { i, r in
                            NavigationLink(value: Route.orders(OrderQuery(start: range.0, end: range.1, group: "closed", sellerId: r.sellerId, basis: "confirmed", title: r.name ?? "Đơn chốt", team: "cskh"))) {
                                HStack(spacing: 10) {
                                    Medal(rank: i + 1)
                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack { Text(r.name ?? "—").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1); Spacer(); Text(Fmt.short(r.closedNet) + " ₫").font(.system(size: 13, weight: .bold)).monospacedDigit().foregroundStyle(Color.ink) }
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
        }
        .refreshable { await load() }
        .task(id: period.key) { await load() }
    }
    private func byDay(_ s: [API.SeriesRow]) -> [(String, Double)] { var m: [String: Double] = [:]; for r in s { m[r.bucket, default: 0] += r.closedNet }; return m.keys.sorted().map { (String($0.suffix(2)), m[$0]!) } }
    @MainActor private func load() async {
        loading = true; defer { loading = false }
        do { data = try await API.overview(start: range.0, end: range.1, team: "cskh"); error = nil }
        catch { self.error = error.localizedDescription }
        badge = try? await API.cskhBadge()
    }
}

/// Thẻ tiến độ KPI tháng hiện tại của cả đội CSKH: đã đạt / KPI, vạch tiến độ chuẩn theo ngày, thiếu / vượt, cần mỗi ngày, hôm nay, số người đúng tiến độ.
struct CskhKpiProgress: View {
    @State private var targets: API.Targets?
    @State private var month: API.Overview?
    @State private var today: API.Overview?
    @State private var staff: [API.Employee]?
    private let ym = String(VNDate.string(.now).prefix(7))

    var body: some View {
        NavigationLink(value: Route.page("cskh-kpi")) {
            Panel {
                HStack {
                    Image(systemName: "target").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.good)
                    Text("KPI CSKH tháng \(Int(ym.suffix(2)) ?? 0)/\(ym.prefix(4))").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink)
                    Spacer()
                    HStack(spacing: 2) { Text("Từng người"); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }.font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand)
                }
                if let s = summary { content(s) } else { Skeleton(height: 120) }
            }
        }
        .buttonStyle(.plain)
        .task { await load() }
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
            Text("Tháng này chưa đặt KPI CSKH. Đã chốt \(Fmt.short(s.done)) ₫ · \(Fmt.int(s.doneOrders)) đơn từ đầu tháng. Chạm để đặt KPI.").font(.system(size: 12)).foregroundStyle(Color.inkSoft)
        } else {
            let p = s.done / s.goal, expected = Double(s.day) / Double(s.dim), pace = expected > 0 ? p / expected : 1
            let tint: Color = pace >= 1 ? .good : pace >= 0.6 ? .warn : .bad
            let should = s.goal * expected, gap = s.done - should
            let daysLeft = Double(s.dim - s.day + 1), need = max(0, s.goal - s.done) / daysLeft
            HStack(alignment: .center, spacing: 14) {
                Ring(value: p, size: 72, line: 8, tint: tint)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Đã đạt").font(.system(size: 11)).foregroundStyle(Color.inkSoft)
                    Text("\(Fmt.short(s.done)) ₫").font(.system(size: 24, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).monospacedDigit().rolling(Fmt.short(s.done))
                    Text("trên KPI \(Fmt.short(s.goal)) ₫ · ngày \(s.day)/\(s.dim)").font(.system(size: 11)).foregroundStyle(Color.inkSoft)
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
                MiniKpi(label: "So với tiến độ", value: "\(gap >= 0 ? "Vượt" : "Thiếu") \(Fmt.short(abs(gap))) ₫", tint: gap >= 0 ? .good : .bad, sub: "Cần \(Fmt.short(should)) ₫ tới hôm nay")
                MiniKpi(label: "Cần mỗi ngày còn lại", value: s.goal > s.done ? "\(Fmt.short(need)) ₫" : "Đã đạt KPI", tint: s.goal > s.done ? .ink : .good, sub: s.goal > s.done ? "Còn \(Int(daysLeft)) ngày, tính cả hôm nay" : "Vượt \(Fmt.short(s.done - s.goal)) ₫")
                MiniKpi(label: "Hôm nay", value: "\(Fmt.short(s.todayNet)) ₫", tint: s.daily > 0 && s.todayNet >= s.daily ? .good : .ink, sub: s.daily > 0 ? "\(Fmt.pct0(s.todayNet / s.daily * 100)) KPI ngày (\(Fmt.short(s.daily)) ₫)" : "—")
                MiniKpi(label: "Đúng tiến độ", value: "\(s.onTrack)/\(s.withGoal) người", tint: s.withGoal > 0 && Double(s.onTrack) / Double(s.withGoal) >= 0.5 ? .good : .warn, sub: s.goalOrders > 0 ? "Đơn \(Fmt.int(s.doneOrders))/\(Fmt.int(s.goalOrders)) KPI" : "\(Fmt.int(s.doneOrders)) đơn chốt")
            }
        }
    }

    @MainActor private func load() async {
        let d = VNDate.string(.now)
        if staff == nil { staff = (try? await API.employees(team: "cskh")) ?? [] }
        targets = try? await API.targets(month: ym)
        month = try? await API.overview(start: ym + "-01", end: d, team: "cskh", compare: "none")
        today = try? await API.overview(start: d, end: d, team: "cskh", compare: "none")
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
