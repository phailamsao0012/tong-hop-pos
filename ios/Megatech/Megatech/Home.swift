import SwiftUI

// Trang chủ = Điều khiển trung tâm (ảnh 1): 6 POS, doanh thu hôm nay + xu hướng, ưu tiên hôm nay, hành động khẩn cấp.
struct HomeView: View {
    @Environment(SyncStatus.self) private var sync
    @Environment(AuthModel.self) private var auth
    @State private var today: API.Overview?
    @State private var week: API.Overview?
    @State private var badge: API.CskhBadge?
    @State private var path: [Route] = []

    var body: some View {
        NavigationStack(path: $path) {
            TabPage {
                PageTitle(title: "Điều khiển trung tâm", subtitle: "Tổng quan hoạt động toàn hệ thống", trailing: AnyView(DatePill(text: VNDate.pretty(), chevron: false)))
                // 6 POS
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(PosBreakdown.order, id: \.self) { id in
                        let p = sync.pos.first { $0.posId == id }
                        let st = state(p)
                        NavigationLink(value: Route.page("config")) {
                            HStack(spacing: 8) {
                                Circle().fill(st.0).frame(width: 8, height: 8)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(PosBreakdown.short[id] ?? id).font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink).lineLimit(1)
                                    Text(st.1).font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1)
                                }
                                Spacer(minLength: 0)
                            }.padding(10).background(Color.card, in: .rect(cornerRadius: 12)).cardShadow()
                        }.buttonStyle(.plain)
                    }
                }
                // Doanh thu hôm nay
                if let t = today?.current.total {
                    NavigationLink(value: Route.overview) {
                        Panel {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 6) {
                                    HStack(spacing: 6) { Text("Doanh thu hôm nay").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink); Image(systemName: "eye").font(.system(size: 11)).foregroundStyle(Color.inkSoft) }
                                    Text(Fmt.vnd(t.closedNet)).font(.system(size: 24, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).monospacedDigit().rolling(Fmt.vnd(t.closedNet))
                                    if let d = Fmt.delta(t.closedNet, today?.compare?.total.closedNet) {
                                        HStack(spacing: 3) { Image(systemName: d.hasPrefix("-") ? "arrowtriangle.down.fill" : "arrowtriangle.up.fill").font(.system(size: 8)); Text("\(d) so với hôm qua").font(.system(size: 11, weight: .semibold)) }.foregroundStyle(d.hasPrefix("-") ? Color.bad : Color.good)
                                    } else { Text("\(Fmt.int(t.closedOrders)) đơn chốt · chạm để xem Tổng quan POS").font(.system(size: 11)).foregroundStyle(Color.inkSoft) }
                                }
                                Spacer()
                                if let s = week?.current.series, !s.isEmpty { Spark(points: byDay(s)).frame(width: 130, height: 60) }
                            }
                        }
                    }.buttonStyle(.plain)
                } else { Skeleton(height: 100) }
                // Ưu tiên hôm nay
                if let t = today?.current.total {
                    let unconfirmed = t.groups["new"]?.orders ?? 0
                    let q = OrderQuery(start: VNDate.string(.now), end: VNDate.string(.now), group: "unconfirmed", basis: "created", title: "Chờ xác nhận")
                    NavigationLink(value: Route.orders(q)) {
                        HStack(spacing: 12) {
                            Image(systemName: "bolt.fill").font(.system(size: 16, weight: .bold)).foregroundStyle(Color.lime).frame(width: 40, height: 40).background(Color.brandDeep, in: .circle)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Ưu tiên hôm nay").font(.system(size: 10, weight: .semibold)).foregroundStyle(Color.good)
                                Text(unconfirmed > 0 ? "Cần xử lý \(Fmt.int(unconfirmed)) đơn chờ xác nhận" : "Không còn đơn chờ xác nhận").font(.system(size: 14, weight: .bold)).foregroundStyle(Color.ink)
                                Text(unconfirmed > 0 ? "Vui lòng kiểm tra và xác nhận sớm" : "Đơn tạo hôm nay đã được xử lý hết").font(.system(size: 11)).foregroundStyle(Color.inkSoft)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.warn).frame(width: 28, height: 28).background(Color.card, in: .circle)
                        }
                        .padding(12).background(Color.brandSoft, in: .rect(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.good.opacity(0.25)))
                    }.buttonStyle(.plain)
                }
                // Hành động khẩn cấp
                let actions = urgent()
                SectionHead(title: "Hành động khẩn cấp", action: "Xem tất cả", route: .alerts, count: actions.count)
                if actions.isEmpty { Panel { Label("Không có việc khẩn cấp lúc này.", systemImage: "checkmark.circle.fill").font(.system(size: 13)).foregroundStyle(Color.good) } }
                ForEach(Array(actions.enumerated()), id: \.offset) { _, a in
                    NavigationLink(value: a.route) {
                        HStack(spacing: 12) {
                            Image(systemName: a.icon).font(.system(size: 14, weight: .semibold)).foregroundStyle(a.tone.color).frame(width: 36, height: 36).background(a.tone.color.opacity(0.12), in: .rect(cornerRadius: 10))
                            VStack(alignment: .leading, spacing: 2) { Text(a.title).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink); Text(a.sub).font(.system(size: 11)).foregroundStyle(Color.inkSoft) }
                            Spacer(); Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft)
                        }.padding(12).background(Color.card, in: .rect(cornerRadius: 12)).cardShadow()
                    }.buttonStyle(.plain)
                }
                CenterBlocks()
            }
            .appRoutes()
            .refreshable { await load(); await sync.refresh() }
            .task { await load() }
        }
    }
    struct Action { let icon: String; let tone: Tone; let title: String; let sub: String; let route: Route }
    private func urgent() -> [Action] {
        var out: [Action] = []
        let t = today?.current.total
        let un = t?.groups["new"]?.orders ?? 0
        if un > 0 { out.append(Action(icon: "clock.badge.exclamationmark", tone: .red, title: "\(Fmt.int(un)) đơn chờ xác nhận", sub: "Tạo hôm nay · Cần xử lý gấp", route: .orders(OrderQuery(start: VNDate.string(.now), end: VNDate.string(.now), group: "unconfirmed", basis: "created", title: "Chờ xác nhận")))) }
        for p in sync.pos where p.lastError != nil || sync.age(p) > 15 {
            out.append(Action(icon: "exclamationmark.triangle.fill", tone: .orange, title: "\(PosBreakdown.short[p.posId] ?? p.posId) \(p.lastError != nil ? "lỗi đồng bộ" : "đang chậm")", sub: p.lastError ?? "Chưa đồng bộ \(sync.age(p)) phút · Kiểm tra kết nối hệ thống", route: .page("config")))
        }
        if let b = badge, b.over20 > 0, auth.me?.canView("care") == true { out.append(Action(icon: "person.crop.circle.badge.exclamationmark", tone: .orange, title: "\(Fmt.int(b.over20)) khách quá 20 ngày chưa ghi chú", sub: "CSKH · hôm nay đã ghi \(Fmt.int(b.callsToday)) cuộc gọi", route: .page("care"))) }
        return out
    }
    private func state(_ p: API.SyncPos?) -> (Color, String) {
        guard let p else { return (.gray, "Đang kiểm tra") }
        if p.lastError != nil { return (.bad, "Ngoại tuyến") }
        return sync.age(p) > 15 ? (.warn, "Tạm chậm") : (.good, "Hoạt động")
    }
    private func byDay(_ s: [API.SeriesRow]) -> [Double] { var m: [String: Double] = [:]; for r in s { m[r.bucket, default: 0] += r.closedNet }; return m.keys.sorted().map { m[$0]! } }
    @MainActor private func load() async {
        let d = VNDate.string(.now)
        today = try? await API.overview(start: d, end: d)
        week = try? await API.overview(start: VNDate.string(VNDate.add(-6)), end: d, compare: "none")
        badge = try? await API.cskhBadge()
    }
}

/// Đường xu hướng nhỏ trong thẻ Doanh thu hôm nay.
struct Spark: View {
    let points: [Double]
    @State private var shown = false
    var body: some View {
        GeometryReader { g in
            let maxV = max(1, points.max() ?? 1), n = max(1, points.count - 1)
            let pts = points.enumerated().map { i, v in CGPoint(x: g.size.width * CGFloat(i) / CGFloat(n), y: g.size.height * (1 - v / maxV) * 0.9 + 3) }
            if pts.count > 1 {
                Path { p in p.move(to: CGPoint(x: 0, y: g.size.height)); for q in pts { p.addLine(to: q) }; p.addLine(to: CGPoint(x: g.size.width, y: g.size.height)) }.fill(LinearGradient(colors: [Color.good.opacity(0.3), .clear], startPoint: .top, endPoint: .bottom))
                Path { p in p.move(to: pts[0]); for q in pts.dropFirst() { p.addLine(to: q) } }.trim(from: 0, to: shown ? 1 : 0).stroke(Color.good, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                Circle().fill(Color.good).frame(width: 6, height: 6).position(pts.last!).opacity(shown ? 1 : 0)
            }
        }.onAppear { withAnimation(.easeOut(duration: 0.8)) { shown = true } }
    }
}

/// Danh sách mọi cảnh báo (chuông).
struct AlertsView: View {
    @Environment(SyncStatus.self) private var sync
    @State private var shift: API.Shift?
    var body: some View {
        List {
            Section("Đồng bộ") {
                ForEach(sync.pos) { p in
                    HStack(spacing: 10) {
                        Circle().fill(p.lastError != nil ? Color.bad : sync.age(p) > 15 ? Color.warn : Color.good).frame(width: 8, height: 8)
                        VStack(alignment: .leading, spacing: 2) { Text(PosBreakdown.names[p.posId] ?? p.posId).font(.subheadline.weight(.semibold)); Text(p.lastError ?? (sync.age(p) > 15 ? "Chưa đồng bộ \(sync.age(p)) phút" : "Đồng bộ \(Fmt.dateTime(p.lastSyncAt))")).font(.caption).foregroundStyle(.secondary) }
                    }
                }
            }
            if let s = shift, !s.alerts.isEmpty {
                Section("Trong ca") {
                    ForEach(Array(s.alerts.enumerated()), id: \.offset) { _, a in
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(a.level == "high" ? Color.bad : .warn)
                            VStack(alignment: .leading, spacing: 2) { Text(a.title).font(.subheadline.weight(.semibold)); Text(a.detail).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                }
            }
        }
        .navigationTitle("Thông báo").navigationBarTitleDisplayMode(.inline).brandNav()
        .task { await sync.refresh(); shift = try? await API.shift(date: VNDate.string(.now), shift: "auto") }
    }
}

// MARK: Tổng quan POS (ảnh 2)

struct OverviewView: View {
    enum Preset: String, CaseIterable, Identifiable { case today = "Hôm nay", yesterday = "Hôm qua", week = "7 ngày", month = "Tháng này"; var id: String { rawValue } }
    @State private var preset: Preset = .today
    @State private var pos: String? = nil
    @State private var data: API.Overview?
    @State private var hourly: [API.Shift.Hour] = []
    @State private var error: String?
    @State private var explain: MetricExplain?
    @State private var pushed: OrderQuery?
    @Environment(\.dismiss) private var dismiss
    private var range: (String, String) {
        let today = VNDate.string(.now)
        switch preset {
        case .today: return (today, today)
        case .yesterday: let y = VNDate.string(VNDate.add(-1)); return (y, y)
        case .week: return (VNDate.string(VNDate.add(-6)), today)
        case .month: return (VNDate.monthStart(), today)
        }
    }
    private var posIds: [String] { pos.map { [$0] } ?? [] }
    private var periodLabel: String { let r = range; return (r.0 == r.1 ? Fmt.day(r.0) : "\(Fmt.day(r.0)) – \(Fmt.day(r.1))") + " · " + (pos.map { PosBreakdown.names[$0] ?? $0 } ?? "Tất cả POS") }
    private func q(_ group: String, _ basis: String, _ title: String) -> OrderQuery { OrderQuery(start: range.0, end: range.1, posIds: posIds, group: group, basis: basis, title: title) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                PageTitle(title: "Tổng quan POS", subtitle: "Hiệu suất bán hàng theo từng điểm", trailing: AnyView(Hint(text: "Số liệu Pancake")))
                Menu { ForEach(Preset.allCases) { p in Button(p.rawValue) { preset = p } } } label: { DatePill(text: preset == .today ? "Hôm nay, \(VNDate.pretty())" : preset.rawValue) }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        FilterChip(label: "Tất cả", on: pos == nil) { pos = nil }
                        ForEach(PosBreakdown.order, id: \.self) { id in FilterChip(label: PosBreakdown.short[id] ?? id, on: pos == id) { pos = pos == id ? nil : id } }
                    }
                }
                if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
                if let t = data?.current.total {
                    let p = data?.compare?.total
                    let rec = reconcile(t, data?.current.reconcile)
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        Button { explain = MetricExplain(title: "Tổng đơn hàng", value: Fmt.int(t.orders), definition: "Số đơn được tạo trong kỳ (theo ngày tạo), không tính đơn đã xóa.", period: periodLabel, previous: p.map { ("Kỳ trước", Fmt.int($0.orders)) }, count: Int(t.orders), query: q("", "created", "Đơn tạo")) } label: {
                            KpiCard(icon: "cart.fill", tint: .good, label: "Tổng đơn hàng", value: Fmt.int(t.orders), delta: Fmt.delta(t.orders, p?.orders)) }
                        Button { explain = MetricExplain(title: "Doanh thu", value: Fmt.money(t.closedNet), definition: "Doanh thu (sau giảm giá và quà) của các đơn đã xác nhận trở đi, xếp theo ngày xác nhận lần đầu. Trùng ô \"Tổng cộng · Doanh thu\" trên Pancake.", period: periodLabel, previous: p.map { ("Kỳ trước", Fmt.money($0.closedNet)) }, reconcile: rec, count: Int(t.closedOrders), query: q("closed", "confirmed", "Đơn chốt")) } label: {
                            KpiCard(icon: "wallet.pass.fill", tint: .teal, label: "Doanh thu", value: Fmt.vnd(t.closedNet), delta: Fmt.delta(t.closedNet, p?.closedNet)) }
                        Button { explain = MetricExplain(title: "Tỷ lệ chốt đơn", value: Fmt.pct(t.closeRate), definition: "Đơn chốt ÷ đơn tạo trong kỳ.\n\(Fmt.int(t.closedOrders)) ÷ \(Fmt.int(t.orders)).", period: periodLabel, previous: p.map { ("Kỳ trước", Fmt.pct($0.closeRate)) }, count: Int(t.closedOrders), query: q("closed", "confirmed", "Đơn chốt")) } label: {
                            KpiCard(icon: "percent", tint: .purple, label: "Tỷ lệ chốt đơn", value: Fmt.pct(t.closeRate), delta: (t.closeRate != nil && p?.closeRate != nil) ? String(format: "%+.1f điểm", t.closeRate! - p!.closeRate!).replacingOccurrences(of: ".", with: ",") : nil, deltaGood: (t.closeRate ?? 0) >= (p?.closeRate ?? 0)) }
                        Button { explain = MetricExplain(title: "Khách mua hàng", value: Fmt.int(t.customers ?? 0), definition: "Số SĐT khác nhau có đơn tạo trong kỳ. Trong đó \(Fmt.int(t.closedCustomers ?? 0)) SĐT có đơn chốt.", period: periodLabel, previous: p.map { ("Kỳ trước", Fmt.int($0.customers ?? 0)) }, count: Int(t.orders), query: q("", "created", "Đơn tạo")) } label: {
                            KpiCard(icon: "person.2.fill", tint: .blue, label: "Khách mua hàng", value: Fmt.int(t.customers ?? 0), delta: Fmt.delta(t.customers ?? 0, p?.customers)) }
                    }.buttonStyle(.plain)
                    if let rec { ReconcileLine(state: rec).reveal() }
                    Panel {
                        HStack { Text("Xu hướng doanh thu").font(.system(size: 15, weight: .bold)); Spacer(); Hint(text: preset == .today || preset == .yesterday ? "Theo giờ" : "Theo ngày") }
                        if preset == .today || preset == .yesterday {
                            if hourly.isEmpty { Text("Chưa có đơn chốt trong ngày.").font(.caption).foregroundStyle(Color.inkSoft) }
                            else { LineChart(points: hourly.map { (String($0.hour.prefix(2)) + "h", $0.value) }) }
                        } else if let s = data?.current.series { LineChart(points: byDay(s)) }
                    }
                    Panel {
                        HStack { Text("Trạng thái đơn hàng").font(.system(size: 15, weight: .bold)); Spacer(); Hint(text: "Đơn tạo trong kỳ") }
                        StackedBar(parts: [("Đã thanh toán", t.groups["delivered"]?.orders ?? 0, .good), ("Đang xử lý", (t.groups["confirmed"]?.orders ?? 0) + (t.groups["shipping"]?.orders ?? 0), .warn), ("Chờ xác nhận", t.groups["new"]?.orders ?? 0, .orange), ("Đã hủy", (t.groups["cancelled"]?.orders ?? 0) + (t.groups["returned"]?.orders ?? 0), .bad)])
                        HStack(spacing: 8) {
                            ForEach(StatusStrip.items, id: \.0) { k, title, c in
                                NavigationLink(value: Route.orders(q(k, "created", title))) { VStack(spacing: 2) { Text(Fmt.int(t.groups[k]?.orders ?? 0)).font(.system(size: 13, weight: .bold)).foregroundStyle(c); Text(title).font(.system(size: 8)).foregroundStyle(Color.inkSoft).lineLimit(1).minimumScaleFactor(0.7) }.frame(maxWidth: .infinity) }.buttonStyle(.plain)
                            }
                        }.padding(.top, 4)
                    }
                    if pos == nil { PosBreakdown(rows: data?.current.byPos ?? [], total: t.closedNet) { pos = $0 } }
                    if let synced = data?.syncedAt { Text("Đồng bộ Pancake lúc \(Fmt.dateTime(synced))").font(.caption).foregroundStyle(Color.inkSoft) }
                } else { SkeletonGrid(tiles: 4) }
            }.padding(16)
        }
        .navigationTitle("Tổng quan POS").navigationBarTitleDisplayMode(.inline).brandNav()
        .navigationDestination(item: $pushed) { OrderListView(query: $0) }
        .refreshable { await load() }
        .task(id: "\(preset.rawValue)|\(pos ?? "")") { await load() }
        .sheet(item: $explain) { m in ExplainSheet(m: m) { pushed = $0 } }
    }
    private func byDay(_ s: [API.SeriesRow]) -> [(String, Double)] { var m: [String: Double] = [:]; for r in s { m[r.bucket, default: 0] += r.closedNet }; return m.keys.sorted().map { (String($0.suffix(2)), m[$0]!) } }
    private func reconcile(_ t: API.Metrics, _ r: API.Reconcile?) -> (ok: Bool, text: String)? {
        guard let r else { return nil }
        let ok = Int(t.closedOrders - r.orders) == 0 && abs(t.closedNet - r.net) < 1000
        return ok ? (true, "Khớp với đơn gốc: \(Fmt.int(r.orders)) đơn · \(Fmt.money(r.net)).") : (false, "Lệch: bảng số liệu \(Fmt.int(t.closedOrders)) / \(Fmt.money(t.closedNet)); đơn gốc \(Fmt.int(r.orders)) / \(Fmt.money(r.net)). Kéo để làm mới.")
    }
    @MainActor private func load() async {
        do {
            data = try await API.overview(start: range.0, end: range.1, posIds: posIds); error = nil
            if preset == .today || preset == .yesterday { hourly = (try? await API.shift(date: range.0, shift: "day"))?.hourly ?? [] }
        } catch { self.error = error.localizedDescription }
    }
}


// MARK: Các khối như trang web Điều khiển trung tâm

struct CenterBlocks: View {
    @Environment(SyncStatus.self) private var sync
    @State private var period: Period = .month
    @State private var report: API.Overview?
    @State private var trend: API.Overview?
    @State private var shift: API.Shift?
    @State private var pipeline: API.Pipeline?
    @State private var customers: API.CustomerPage?
    @State private var repurchase: API.Repurchase?
    @State private var batches: API.Batches?
    @State private var targets: API.Targets?
    private var r: (String, String) { period.range }
    private func q(_ group: String, _ basis: String, _ title: String, posIds: [String] = []) -> Route { .orders(OrderQuery(start: r.0, end: r.1, posIds: posIds, group: group, basis: basis, title: title)) }

    var body: some View {
        // Kỳ
        HStack {
            Text("Số liệu theo kỳ").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink)
            Spacer()
            Menu { ForEach([Period.today, .week, .month, .last]) { p in Button(p.rawValue) { period = p } } } label: { DatePill(text: "Kỳ: \(period.rawValue)") }
        }.padding(.top, 6)
        Text("\(period.label) · so với kỳ liền trước").font(.system(size: 10)).foregroundStyle(Color.inkSoft).padding(.top, -8)
        if let t = report?.current.total {
            let p = report?.compare?.total
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                NavigationLink(value: q("", "created", "Đơn tạo mới")) { KpiCard(icon: "cart.fill", tint: .blue, label: "Đơn tạo mới", value: Fmt.int(t.orders), delta: Fmt.delta(t.orders, p?.orders), note: "\(Fmt.int(t.customers ?? 0)) khách") }
                NavigationLink(value: q("closed", "confirmed", "Đơn chốt")) { KpiCard(icon: "checkmark.seal.fill", tint: .good, label: "Đơn chốt", value: Fmt.int(t.closedOrders), delta: Fmt.delta(t.closedOrders, p?.closedOrders), note: "Tỷ lệ chốt/tạo \(Fmt.pct(t.closeRate))") }
                NavigationLink(value: q("closed", "confirmed", "Đơn chốt")) { KpiCard(icon: "banknote.fill", tint: .teal, label: "Doanh thu đơn chốt", value: Fmt.short(t.closedNet) + " ₫", delta: Fmt.delta(t.closedNet, p?.closedNet), note: "GTTB \(Fmt.short(t.averageOrder ?? 0)) ₫") }
                KpiCard(icon: "equal.circle.fill", tint: .gray, label: "Giá trị TB đơn (AOV)", value: Fmt.short(t.averageOrder ?? 0) + " ₫", delta: Fmt.delta(t.averageOrder ?? 0, p?.averageOrder), note: "Doanh thu ÷ đơn chốt")
                NavigationLink(value: q("delivered", "created", "Giao thành công")) { KpiCard(icon: "shippingbox.fill", tint: .lime, label: "Giao thành công", value: Fmt.int(t.groups["delivered"]?.orders ?? 0), delta: Fmt.delta(t.groups["delivered"]?.orders ?? 0, p?.groups["delivered"]?.orders), note: "\(Fmt.short(t.groups["delivered"]?.net ?? 0)) ₫ · tính theo ngày tạo") }
                NavigationLink(value: Route.page("shift")) { KpiCard(icon: "flame.fill", tint: .warn, label: "Chốt nóng \(shiftName) hôm nay", value: Fmt.pct(shift?.total.rate), delta: shift.flatMap { s in (s.total.rate != nil && s.yesterday.rate != nil) ? String(format: "%+.1f điểm", s.total.rate! - s.yesterday.rate!).replacingOccurrences(of: ".", with: ",") : nil }, deltaGood: (shift?.total.rate ?? 0) >= (shift?.yesterday.rate ?? 0), note: shift.map { "\(Fmt.int($0.total.closed)) chốt / \(Fmt.int($0.total.received)) số nhận" } ?? "—") }
            }.buttonStyle(.plain)
            // Mục tiêu tháng
            let goal = (targets?.items ?? []).filter { $0.scope == "pos" }.reduce(0.0) { $0 + $1.revenue }
            NavigationLink(value: Route.page("cskh-kpi")) {
                Panel(padding: 12) {
                    HStack(spacing: 10) {
                        Image(systemName: "target").font(.system(size: 15, weight: .semibold)).foregroundStyle(.purple).frame(width: 34, height: 34).background(Color.purple.opacity(0.13), in: .rect(cornerRadius: 9))
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Mục tiêu tháng \(r.1.suffix(5).prefix(2))").font(.system(size: 11)).foregroundStyle(Color.inkSoft)
                            Text(goal > 0 ? Fmt.pct0(t.closedNet / goal * 100) : "—").font(.system(size: 19, weight: .bold, design: .rounded)).foregroundStyle(Color.ink)
                        }
                        Spacer()
                        Text(goal > 0 ? "\(Fmt.short(t.closedNet)) / \(Fmt.short(goal)) ₫ · còn \(Fmt.short(max(0, goal - t.closedNet))) ₫" : "Chưa đặt mục tiêu (Cấu hình → Mục tiêu tháng)").font(.system(size: 10)).foregroundStyle(Color.inkSoft).multilineTextAlignment(.trailing)
                    }
                    Bar(value: goal > 0 ? t.closedNet / goal : 0, tint: .purple, height: 7)
                }
            }.buttonStyle(.plain)
        } else { SkeletonGrid(tiles: 6) }

        // Xu hướng 30 ngày
        Panel {
            HStack { Text("Xu hướng 30 ngày").font(.system(size: 15, weight: .bold)); Spacer(); NavigationLink(value: Route.overview) { HStack(spacing: 2) { Text("Xem chi tiết"); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }.font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.brand) }.buttonStyle(.plain) }
            Text("Doanh thu đơn chốt (triệu ₫) theo ngày · chạm một cột để xem đơn").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
            if let s = trend?.current.series, !s.isEmpty {
                let pts = byDay(s)
                LineChart(points: pts.map { (String(Fmt.day($0.0).prefix(5)), $0.1) }, tint: .brand, height: 120)
                HStack(spacing: 12) { HStack(spacing: 4) { Circle().fill(Color.brand).frame(width: 7, height: 7); Text("Doanh thu đơn chốt") }; Text("Đơn chốt 30 ngày: \(Fmt.int(byDayOrders(s).reduce(0) { $0 + $1.1 }))") }.font(.system(size: 9)).foregroundStyle(Color.inkSoft)
            } else { Skeleton(height: 120) }
        }

        // Trạng thái đơn + Vận hành đơn
        if let t = report?.current.total {
            Panel {
                HStack { Text("Trạng thái đơn").font(.system(size: 15, weight: .bold)); Spacer(); Hint(text: "Đơn tạo trong kỳ · lúc đồng bộ") }
                HStack(spacing: 14) {
                    Donut(parts: StatusStrip.items.map { ($0.1, t.groups[$0.0]?.orders ?? 0, $0.2) }, center: Fmt.int(t.orders), label: "đơn tạo")
                    VStack(alignment: .leading, spacing: 5) {
                        ForEach(StatusStrip.items, id: \.0) { k, title, c in
                            NavigationLink(value: q(k, "created", title)) {
                                HStack(spacing: 6) { Circle().fill(c).frame(width: 8, height: 8); Text(title).font(.system(size: 11)).foregroundStyle(Color.ink).lineLimit(1); Spacer(); Text(Fmt.int(t.groups[k]?.orders ?? 0)).font(.system(size: 11, weight: .bold)).monospacedDigit(); Text(Fmt.pct0(t.orders > 0 ? (t.groups[k]?.orders ?? 0) / t.orders * 100 : nil)).font(.system(size: 10)).foregroundStyle(Color.inkSoft).frame(width: 34, alignment: .trailing) }
                            }.buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        if let d = pipeline {
            let T = d.total, closed = T["closed"]?.orders ?? 0, shipped = T["shipped"]?.orders ?? 0, dl = T["delivered"]?.orders ?? 0
            Panel {
                HStack { Text("Vận hành đơn").font(.system(size: 15, weight: .bold)); Spacer(); NavigationLink(value: Route.page("pipeline")) { HStack(spacing: 2) { Text("Xem chi tiết"); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }.font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.brand) }.buttonStyle(.plain) }
                Text("Chốt → xuất đi → đã nhận · theo giờ chốt trong kỳ").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                NavigationLink(value: q("closed", "confirmed", "Đơn chốt")) { FunnelLine(label: "Đơn chốt", n: closed, of: closed, tint: .good) }.buttonStyle(.plain)
                NavigationLink(value: q("shipped", "confirmed", "Đã xuất đi")) { FunnelLine(label: "Đã xuất đi", n: shipped, of: closed, tint: .blue) }.buttonStyle(.plain)
                NavigationLink(value: q("delivered", "confirmed", "Đã nhận")) { FunnelLine(label: "Đã nhận", n: dl, of: closed, tint: .good) }.buttonStyle(.plain)
                HStack(spacing: 6) {
                    NavigationLink(value: q("shipping", "confirmed", "Đang giao")) { Tag(text: "Đang giao \(Fmt.int(T["shipping"]?.orders ?? 0))", tone: .orange) }
                    NavigationLink(value: q("returned", "confirmed", "Hoàn")) { Tag(text: "Hoàn \(Fmt.int(T["returned"]?.orders ?? 0))", tone: .purple) }
                    NavigationLink(value: q("cancelled", "confirmed", "Hủy sau chốt")) { Tag(text: "Hủy \(Fmt.int(T["cancelled"]?.orders ?? 0))", tone: .red) }
                    NavigationLink(value: q("processing", "confirmed", "Chưa xuất kho")) { Tag(text: "Chưa xuất \(Fmt.int(T["processing"]?.orders ?? 0))", tone: .gray) }
                }.buttonStyle(.plain)
            }
        }

        // Xếp hạng POS
        if let rows = report?.current.byPos, let t = report?.current.total {
            Panel {
                HStack { Text("Xếp hạng POS").font(.system(size: 15, weight: .bold)); Spacer(); Hint(text: "Doanh thu đơn chốt") }
                let sorted = rows.sorted { $0.closedNet > $1.closedNet }
                let maxV = max(1, sorted.first?.closedNet ?? 1)
                ForEach(Array(sorted.enumerated()), id: \.element.posId) { i, x in
                    let prev = report?.compare?.byPos.first { $0.posId == x.posId }
                    NavigationLink(value: q("closed", "confirmed", PosBreakdown.names[x.posId] ?? x.posId, posIds: [x.posId])) {
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 8) {
                                Text("\(i + 1)").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.inkSoft).frame(width: 14)
                                Circle().fill(PosBreakdown.color(x.posId)).frame(width: 9, height: 9)
                                Text(PosBreakdown.names[x.posId] ?? x.posId).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                                Spacer()
                                VStack(alignment: .trailing, spacing: 0) { Text(Fmt.short(x.closedNet) + " ₫").font(.system(size: 12, weight: .bold)).monospacedDigit(); if let d = Fmt.delta(x.closedNet, prev?.closedNet) { Text(d).font(.system(size: 9, weight: .semibold)).foregroundStyle(d.hasPrefix("-") ? Color.bad : Color.good) } }
                            }
                            Bar(value: x.closedNet / maxV, tint: PosBreakdown.color(x.posId), height: 5).padding(.leading, 22)
                            Text("\(Fmt.int(x.closedOrders)) chốt · tỷ trọng \(Fmt.pct0(t.closedNet > 0 ? x.closedNet / t.closedNet * 100 : nil)) · AOV \(Fmt.short(x.closedOrders > 0 ? x.closedNet / x.closedOrders : 0)) ₫ · kỳ trước \(prev.map { Fmt.short($0.closedNet) } ?? "—") ₫").font(.system(size: 9)).foregroundStyle(Color.inkSoft).padding(.leading, 22)
                        }.padding(.vertical, 4).contentShape(.rect)
                    }.buttonStyle(.plain)
                }
            }
        }

        // Cảnh báo & đồng bộ
        Panel {
            HStack { Text("Cảnh báo & đồng bộ\((shift?.alerts.count ?? 0) > 0 ? " (\(shift!.alerts.count))" : "")").font(.system(size: 15, weight: .bold)); Spacer(); NavigationLink(value: Route.page("shift")) { HStack(spacing: 2) { Text("Xem ca"); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }.font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.brand) }.buttonStyle(.plain) }
            if let s = shift {
                if s.alerts.isEmpty { Label("Không có cảnh báo trong ca.", systemImage: "checkmark.circle.fill").font(.system(size: 11)).foregroundStyle(Color.good) }
                ForEach(Array(s.alerts.prefix(5).enumerated()), id: \.offset) { _, a in
                    HStack(alignment: .top, spacing: 8) { Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 11)).foregroundStyle(a.level == "high" ? Color.bad : Color.warn); VStack(alignment: .leading, spacing: 1) { Text(a.title).font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink); Text(a.detail).font(.system(size: 10)).foregroundStyle(Color.inkSoft) } }
                        .padding(8).background((a.level == "high" ? Color.bad : Color.warn).opacity(0.08), in: .rect(cornerRadius: 8))
                }
            }
            Text("ĐỒNG BỘ PANCAKE").font(.system(size: 9, weight: .bold)).tracking(0.8).foregroundStyle(Color.inkSoft).padding(.top, 4)
            ForEach(PosBreakdown.order, id: \.self) { id in
                let p = sync.pos.first { $0.posId == id }
                HStack(spacing: 8) {
                    Circle().fill(PosBreakdown.color(id)).frame(width: 8, height: 8)
                    VStack(alignment: .leading, spacing: 0) { Text(PosBreakdown.names[id] ?? id).font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink); Text(p?.lastError ?? "đồng bộ lúc \(p.flatMap { $0.lastSyncAt }.map { Fmt.dateTime($0) } ?? "—")").font(.system(size: 9)).foregroundStyle(p?.lastError != nil ? Color.bad : Color.inkSoft).lineLimit(1) }
                    Spacer()
                    HStack(spacing: 3) { Image(systemName: "clock").font(.system(size: 9)); Text(p.map { sync.age($0) < 60 ? "\(sync.age($0)) phút" : "\(sync.age($0) / 60) giờ" } ?? "—").font(.system(size: 10)) }.foregroundStyle(p == nil ? Color.inkSoft : p!.lastError != nil ? Color.bad : sync.age(p!) > 15 ? Color.warn : Color.good)
                }.padding(.vertical, 2)
            }
        }

        // Nhân viên
        if let emps = report?.current.byEmployee {
            let staff = emps.filter { !$0.sellerId.isEmpty && $0.assignedOrders >= 10 && ($0.department == nil || $0.department!.range(of: "sale|bán hàng|cskh|chăm sóc", options: [.regularExpression, .caseInsensitive]) != nil) }
            let top = staff.sorted { ($0.assignedCloseRate ?? -1) > ($1.assignedCloseRate ?? -1) }.prefix(5)
            let low = staff.sorted { ($0.assignedCloseRate ?? 999) < ($1.assignedCloseRate ?? 999) }.prefix(5)
            Panel {
                HStack { Text("Nhân viên").font(.system(size: 15, weight: .bold)); Spacer(); NavigationLink(value: Route.compare(team: "all")) { HStack(spacing: 2) { Text("So sánh nhân viên"); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }.font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.brand) }.buttonStyle(.plain) }
                Text("Tỷ lệ chốt · từ 10 đơn chia · Sale và CSKH").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                Text("TOP 5").font(.system(size: 9, weight: .bold)).tracking(0.8).foregroundStyle(Color.good)
                EmpRows(rows: Array(top), tone: .good, r: r)
                Text("CẦN HỖ TRỢ").font(.system(size: 9, weight: .bold)).tracking(0.8).foregroundStyle(Color.bad).padding(.top, 4)
                EmpRows(rows: Array(low), tone: .bad, r: r)
            }
        }

        // Mua lại & data
        Panel {
            HStack { Text("Mua lại & data").font(.system(size: 15, weight: .bold)); Spacer(); NavigationLink(value: Route.page("repurchase")) { Text("Mua lại ›").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.brand) }.buttonStyle(.plain); NavigationLink(value: Route.page("batches")) { Text("Data ›").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.brand) }.buttonStyle(.plain) }
            let bt = (batches?.batches ?? []).reduce((0.0, 0.0, 0.0)) { ($0.0 + $1.received, $0.1 + $1.buyers, $0.2 + $1.net) }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                MiniCell(label: "Tỷ lệ mua lại (trọn đời)", value: repurchase.map { Fmt.pct($0.funnel.once > 0 ? $0.funnel.twice / $0.funnel.once * 100 : nil) } ?? "—")
                MiniCell(label: "Doanh thu mua lại", value: repurchase.map { Fmt.short($0.summary.repurchase.net) + " ₫" } ?? "—")
                MiniCell(label: "Đơn mua lại", value: repurchase.map { Fmt.int($0.summary.repurchase.orders) } ?? "—")
                MiniCell(label: "Khách mua lại", value: repurchase.map { Fmt.int($0.summary.repurchase.customers) } ?? "—")
                MiniCell(label: "Data được cấp", value: batches == nil ? "—" : Fmt.int(bt.0))
                MiniCell(label: "Đã mua", value: batches == nil ? "—" : "\(Fmt.int(bt.1)) · \(Fmt.pct0(bt.0 > 0 ? bt.1 / bt.0 * 100 : nil))")
            }
        }

        // Khách hàng
        if let c = customers, let g = c.groups, let seg = c.segments {
            Panel {
                HStack { Text("Khách hàng").font(.system(size: 15, weight: .bold)); Spacer(); NavigationLink(value: Route.page("customers")) { HStack(spacing: 2) { Text("Xem chi tiết"); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }.font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.brand) }.buttonStyle(.plain) }
                Text("Toàn bộ lịch sử · bấm một ô để mở trang tương ứng").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                    NavigationLink(value: Route.page("customers")) { MiniCell(label: "Tổng khách", value: Fmt.int(g["total"] ?? 0)) }
                    NavigationLink(value: Route.page("customers")) { MiniCell(label: "Hoạt động 30 ngày", value: Fmt.int(seg["active"] ?? 0)) }
                    NavigationLink(value: Route.page("customers")) { MiniCell(label: "Thân thiết", value: Fmt.int(seg["loyal"] ?? 0)) }
                    NavigationLink(value: Route.page("dormant")) { MiniCell(label: "Nguy cơ rời bỏ", value: Fmt.int(seg["risk"] ?? 0)) }
                    NavigationLink(value: Route.page("dormant")) { MiniCell(label: "Lâu chưa mua (>90)", value: Fmt.int(seg["dormant"] ?? 0)) }
                    NavigationLink(value: Route.page("customers")) { MiniCell(label: "Tổng chi tiêu", value: Fmt.short(seg["ltvTotal"] ?? 0) + " ₫") }
                }.buttonStyle(.plain)
            }
            Panel {
                HStack { Text("Khách lâu chưa mua").font(.system(size: 15, weight: .bold)); Spacer(); NavigationLink(value: Route.page("dormant")) { HStack(spacing: 2) { Text("Xem chi tiết"); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }.font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.brand) }.buttonStyle(.plain) }
                Text("Theo số ngày từ lần mua thành công gần nhất tới hôm nay").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                let buckets = [("30-45", "30–45 ngày"), ("46-60", "46–60 ngày"), ("61-90", "61–90 ngày"), ("90+", "Trên 90 ngày")]
                let buyers = max(1, (g["total"] ?? 0) - (g["never"] ?? 0))
                let maxV = max(1, buckets.map { g[$0.0] ?? 0 }.max() ?? 1)
                ForEach(buckets, id: \.0) { k, label in
                    let n = g[k] ?? 0, net = c.groupNets?[k]
                    NavigationLink(value: Route.page("dormant")) {
                        VStack(alignment: .leading, spacing: 3) {
                            HStack { Text(label).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink); Spacer(); VStack(alignment: .trailing, spacing: 0) { Text(Fmt.int(n)).font(.system(size: 12, weight: .bold)).monospacedDigit(); Text("\(Fmt.pct0(n / buyers * 100)) khách đã mua").font(.system(size: 9)).foregroundStyle(Color.inkSoft) } }
                            Bar(value: n / maxV, tint: k == "90+" ? .bad : k == "61-90" ? .warn : .good, height: 5)
                            Text("Đã mua \(net.map { Fmt.short($0) + " ₫" } ?? "—")\(net != nil && n > 0 ? " · TB \(Fmt.short(net! / n)) ₫/khách" : "")").font(.system(size: 9)).foregroundStyle(Color.inkSoft)
                        }.padding(.vertical, 4).contentShape(.rect)
                    }.buttonStyle(.plain)
                }
            }
        }
        Color.clear.frame(height: 0).task(id: period) { await load() }
    }
    private var shiftName: String { ["morning": "ca sáng", "afternoon": "ca chiều", "evening": "ca tối", "day": "cả ngày"][shift?.shift ?? ""] ?? "ca hiện tại" }
    private func byDay(_ s: [API.SeriesRow]) -> [(String, Double)] { var m: [String: Double] = [:]; for x in s { m[x.bucket, default: 0] += x.closedNet }; return m.keys.sorted().map { ($0, m[$0]!) } }
    private func byDayOrders(_ s: [API.SeriesRow]) -> [(String, Double)] { var m: [String: Double] = [:]; for x in s { m[x.bucket, default: 0] += x.closedOrders }; return m.keys.sorted().map { ($0, m[$0]!) } }
    @MainActor private func load() async {
        let today = VNDate.string(.now)
        report = try? await API.overview(start: r.0, end: r.1)
        shift = try? await API.shift(date: today, shift: "auto")
        pipeline = try? await API.pipeline(start: r.0, end: r.1, basis: "confirmed")
        targets = try? await API.targets(month: String(r.1.prefix(7)))
        if trend == nil { trend = try? await API.overview(start: VNDate.string(VNDate.add(-29)), end: today, compare: "none") }
        if customers == nil { customers = try? await API.customers(segment: "", sort: "spend", q: "", page: 1, size: 1) }
        repurchase = try? await API.repurchase(start: r.0, end: r.1)
        batches = try? await API.batches(start: r.0, end: r.1)
    }
}

struct EmpRows: View {
    let rows: [API.EmployeeRow]; let tone: Color; let r: (String, String)
    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, e in
                NavigationLink(value: Route.orders(OrderQuery(start: r.0, end: r.1, group: "closed", sellerId: e.sellerId, basis: "confirmed", title: e.name ?? "Nhân viên"))) {
                    HStack(spacing: 8) {
                        Text("\(i + 1)").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.inkSoft).frame(width: 14)
                        Avatar(name: e.name ?? "?", size: 26, tint: tone)
                        VStack(alignment: .leading, spacing: 0) { Text(e.name ?? "NV").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1); Text(e.department ?? "").font(.system(size: 9)).foregroundStyle(Color.inkSoft).lineLimit(1) }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 1) { Text(Fmt.pct(e.assignedCloseRate)).font(.system(size: 11, weight: .bold)).foregroundStyle(tone); Text("\(Fmt.int(e.closedOrders)) / \(Fmt.int(e.assignedOrders))").font(.system(size: 9)).foregroundStyle(Color.inkSoft) }
                        Bar(value: min(1, (e.assignedCloseRate ?? 0) / 100), tint: tone, height: 4).frame(width: 60)
                    }.padding(.vertical, 4).contentShape(.rect)
                }.buttonStyle(.plain)
            }
            if rows.isEmpty { Text("Chưa đủ dữ liệu (từ 10 đơn chia).").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
        }
    }
}

struct MiniCell: View {
    let label: String; let value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) { Text(label).font(.system(size: 9)).foregroundStyle(Color.inkSoft).lineLimit(1); Text(value).font(.system(size: 15, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).monospacedDigit().minimumScaleFactor(0.6).lineLimit(1).rolling(value) }
            .frame(maxWidth: .infinity, alignment: .leading).padding(10).background(Color.black.opacity(0.04), in: .rect(cornerRadius: 10))
    }
}

/// Vòng tròn trạng thái đơn có số ở giữa.
struct Donut: View {
    let parts: [(String, Double, Color)]; let center: String; let label: String
    @State private var shown = false
    var body: some View {
        let total = max(1, parts.reduce(0) { $0 + $1.1 })
        ZStack {
            ForEach(Array(parts.enumerated()), id: \.offset) { i, p in
                let start = parts.prefix(i).reduce(0) { $0 + $1.1 } / total
                Circle().trim(from: start, to: shown ? start + p.1 / total : start).stroke(p.2, style: StrokeStyle(lineWidth: 14, lineCap: .butt)).rotationEffect(.degrees(-90))
            }
            VStack(spacing: 0) { Text(center).font(.system(size: 16, weight: .bold, design: .rounded)).foregroundStyle(Color.ink); Text(label).font(.system(size: 9)).foregroundStyle(Color.inkSoft) }
        }.frame(width: 110, height: 110)
        .onAppear { withAnimation(.spring(duration: 0.9, bounce: 0.05)) { shown = true } }
    }
}

extension PosBreakdown {
    static func color(_ id: String) -> Color {
        switch id { case "sieu-vo-gao": return .good; case "mgt-apex": return .blue; case "thuy-san": return .teal; case "bio-nano": return .purple; case "megaroot": return .warn; default: return .bad }
    }
}
