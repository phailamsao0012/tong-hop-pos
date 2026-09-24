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
