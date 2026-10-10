import SwiftUI

// Tab Tổng quan ở giữa thanh dưới, mở app vào đây (anh Vũ 10/10/2026): 4 bộ phận Sale, CSKH, MKT, Vận đơn như 4 bảng đầu trang
// Tổng quan POS trên web, không còn ô từng POS ("không cần thông tin như theo các pos hiện tại"). Chạm bảng nào mở chi tiết
// bộ phận đó. Bên dưới giữ các khối số liệu chung; việc khẩn cấp và đồng bộ từng POS ở trang Thông báo (chuông).
struct HomeView: View {
    @Environment(AppNav.self) private var nav
    @Environment(AuthModel.self) private var auth
    @State private var period: Period = .today
    @State private var pos = ""
    @State private var product = "all"
    @State private var sections: API.Sections?
    /// Số Marketing cho bảng MKT (/api/marketing/analytics, như trang Marketing; chưa lọc được theo nhóm đơn).
    @State private var mkt: API.MktAnalytics?
    @State private var error: String?
    @State private var loading = false
    /// Kỳ|POS|nhóm đơn của số đang hiện (tải kỳ mới lỗi thì bỏ số cũ).
    @State private var dataKey = ""
    private var key: String { "\(period.key)|\(pos)|\(product)" }
    /// 4 bảng đọc /api/reports/sections, web chỉ mở cho người xem được Tổng quan POS.
    private var allowed: Bool { auth.me?.canView("overview") ?? false }
    /// Đang xem một số POS (chọn POS hoặc tài khoản giới hạn POS): chi phí quảng cáo là của mọi POS nên không chia được.
    private var posLimited: Bool { !pos.isEmpty || (auth.me?.role != "owner" && !(auth.me?.posIds ?? []).isEmpty) }

    var body: some View {
        @Bindable var nav = nav
        NavigationStack(path: $nav.overviewPath) {
            if !allowed {
                TabPage {
                    PageTitle(title: "Tổng quan", subtitle: "4 bộ phận")
                    ContentUnavailableView("Chưa được cấp quyền", systemImage: "lock.fill", description: Text("Tài khoản này chưa được xem Tổng quan POS. Các phần khác xem ở Trang chủ và Phòng ban."))
                }
                .appRoutes()
            } else {
                TabPage {
                    ScrollViewReader { proxy in
                        VStack(alignment: .leading, spacing: 14) {
                            PageTitle(title: "Tổng quan", subtitle: "4 bộ phận · \(period.label)", trailing: AnyView(PeriodMenu(period: $period)))
                            PosChipRow(selection: $pos)
                            HStack(spacing: 8) {
                                Text("Nhóm đơn").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.inkSoft)
                                FilterChip(label: "Tất cả", on: product == "all") { product = "all" }
                                FilterChip(label: "Gentadox", on: product == "gentadox") { product = "gentadox" }
                                FilterChip(label: "SK + GK", on: product == "skgk") { product = "skgk" }
                                Spacer()
                            }
                            if let error, sections == nil {
                                Label(error, systemImage: "wifi.exclamationmark").font(.subheadline).foregroundStyle(Color.bad)
                            }
                            DeptBoards(data: sections, mkt: mkt?.current, mktRatios: !posLimited, mktNote: product == "all" ? nil : "MKT chưa lọc được theo nhóm đơn: số của mọi sản phẩm.",
                                       period: period, pos: pos, me: auth.me, failed: error != nil)
                                .environment(\.thinking, loading && sections != nil)
                            if let s = sections { footnote(s) }
                            CenterBlocks(period: $period, team: "all", pos: pos, product: product)
                        }
                        .onChange(of: nav.overviewScroll) { _, id in
                            guard let id else { return }
                            withAnimation(.easeInOut(duration: 0.7)) { proxy.scrollTo(id, anchor: .top) }
                            nav.overviewScroll = nil
                        }
                    }
                }
                .appRoutes()
                .refreshable { await load() }
                .task(id: key) { await load() }
            }
        }
    }

    /// Giờ đồng bộ Pancake và cách tính từng bộ phận (như nút "i" trên web).
    private func footnote(_ s: API.Sections) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Chạm vào bộ phận để xem chi tiết\(s.syncedAt.map { " · số Pancake đồng bộ \(Fmt.time($0))" } ?? "")")
                .font(.system(size: 10)).foregroundStyle(Color.inkSoft)
            if let defs = s.definitions, !defs.isEmpty {
                DisclosureGroup {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(CompanyDept.allCases) { d in
                            if let t = defs[d.definitionKey] {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(d.title).font(.system(size: 11, weight: .bold)).foregroundStyle(d.tint)
                                    Text(t).font(.system(size: 11)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                    }
                    .padding(.top, 6)
                } label: {
                    Label("Cách tính 4 bộ phận", systemImage: "info.circle").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand)
                }
                .padding(12).background(Color.card, in: .rect(cornerRadius: 12)).cardShadow()
            }
        }
    }

    @MainActor private func load() async {
        loading = true; defer { loading = false }
        let r = period.range, k = key, posIds = pos.isEmpty ? [] : [pos]
        do {
            let s = try await API.sections(start: r.0, end: r.1, posIds: posIds, product: product)
            var m: API.MktAnalytics? = nil
            if auth.me?.canView("mkt-roas") ?? false {
                m = try? await API.mktAnalytics(start: r.0, end: r.1, posIds: posIds, marketerId: nil, teamId: nil, product: nil)
            }
            // Kéo làm mới không bị huỷ khi đổi kỳ / POS: số của bộ lọc cũ không được ghi đè bộ lọc mới.
            guard !Task.isCancelled, k == key else { return }
            sections = s; mkt = m
            dataKey = k; error = nil
        } catch {
            guard !Task.isCancelled, k == key else { return }
            self.error = error.localizedDescription
            if dataKey != k { sections = nil; mkt = nil }
        }
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

// MARK: Tổng quan POS (ảnh 2)

struct OverviewView: View {
    @Environment(AuthModel.self) private var auth
    @State private var preset: Period = .today
    var initialPos: String? = nil
    @State private var pos: String? = nil
    @State private var data: API.Overview?
    @State private var hourly: [API.Shift.Hour] = []
    @State private var error: String?
    @State private var explain: MetricExplain?
    @State private var pushed: OrderQuery?
    @State private var loading = false
    @Environment(\.dismiss) private var dismiss
    private var range: (String, String) { preset.range }
    private var posIds: [String] { pos.map { [$0] } ?? [] }
    private var periodLabel: String { let r = range; return (r.0 == r.1 ? Fmt.day(r.0) : "\(Fmt.day(r.0)) – \(Fmt.day(r.1))") + " · " + (pos.map { PosBreakdown.names[$0] ?? $0 } ?? "Tất cả POS") }
    private func q(_ group: String, _ basis: String, _ title: String) -> OrderQuery { OrderQuery(start: range.0, end: range.1, posIds: posIds, group: group, basis: basis, title: title) }
    /// Danh sách đơn nguồn (/api/raw/orders) chỉ mở cho người được xem Đơn nguồn Pancake.
    private var canList: Bool { auth.me?.canView("raw-orders") ?? false }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                PageTitle(title: "Tổng quan POS", subtitle: "Hiệu suất bán hàng theo từng điểm", trailing: AnyView(Hint(text: "Số liệu Pancake")))
                PeriodMenu(period: $preset)
                PosChipRow(selection: Binding(get: { pos ?? "" }, set: { pos = $0.isEmpty ? nil : $0 }), label: nil)
                if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
                if let t = data?.current.total {
                    let p = data?.compare?.total
                    let rec = reconcile(t, data?.current.reconcile)
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        Button { explain = MetricExplain(title: "Tổng đơn hàng", value: Fmt.int(t.orders), definition: "Số đơn được tạo trong kỳ (theo ngày tạo), không tính đơn đã xóa.", period: periodLabel, previous: p.map { ("Kỳ trước", Fmt.int($0.orders)) }, count: canList ? Int(t.orders) : nil, query: canList ? q("", "created", "Đơn tạo") : nil) } label: {
                            KpiCard(icon: "ic_m_orders", tint: .good, label: "Tổng đơn hàng", value: Fmt.int(t.orders), delta: Fmt.delta(t.orders, p?.orders)) }
                        Button { explain = MetricExplain(title: "Doanh thu", value: Fmt.money(t.closedNet), definition: "Tiền (sau giảm giá và quà, không cộng phí ship) của các đơn chốt trong kỳ: đơn vào Chờ xác nhận lần đầu trong kỳ, xếp theo giờ vào Chờ xác nhận. Đơn đang huỷ không tính, đơn hoàn vẫn tính. Chỉ tính người bán có hậu tố SALE, CSKH, MKT (đơn chưa gắn người bán vẫn tính). Cùng số với ô \"Doanh thu đơn chốt\" ở Tổng quan POS trên web.", period: periodLabel, previous: p.map { ("Kỳ trước", Fmt.money($0.closedNet)) }, reconcile: rec) } label: {
                            KpiCard(icon: "ic_m_revenue", tint: .teal, label: "Doanh thu", value: Fmt.vnd(t.closedNet), delta: Fmt.delta(t.closedNet, p?.closedNet)) }
                        Button { explain = MetricExplain(title: "Tỷ lệ chốt", value: Fmt.pct(t.shownRate), definition: "\(MetricPrefs.shared.rateHint).\n\(t.rateFrac).\nĐổi ở Thêm → Cách tính.", period: periodLabel, previous: p.map { ("Kỳ trước", Fmt.pct($0.shownRate)) }) } label: {
                            KpiCard(icon: "ic_m_rate", tint: .purple, label: "Tỷ lệ chốt", value: Fmt.pct(t.shownRate), delta: (t.shownRate != nil && p?.shownRate != nil) ? String(format: "%+.1f điểm", t.shownRate! - p!.shownRate!).replacingOccurrences(of: ".", with: ",") : nil, deltaGood: (t.shownRate ?? 0) >= (p?.shownRate ?? 0), note: t.rateFrac) }
                        Button { explain = MetricExplain(title: "Khách mua hàng", value: Fmt.int(t.customers ?? 0), definition: "Số SĐT khác nhau có đơn tạo trong kỳ. Trong đó \(Fmt.int(t.closedCustomers ?? 0)) SĐT có đơn chốt.", period: periodLabel, previous: p.map { ("Kỳ trước", Fmt.int($0.customers ?? 0)) }, count: canList ? Int(t.orders) : nil, query: canList ? q("", "created", "Đơn tạo") : nil) } label: {
                            KpiCard(icon: "ic_m_customers", tint: .blue, label: "Khách mua hàng", value: Fmt.int(t.customers ?? 0), delta: Fmt.delta(t.customers ?? 0, p?.customers)) }
                    }.buttonStyle(.plain)
                    .environment(\.thinking, loading)
                    if let rec { ReconcileLine(state: rec).reveal() }
                    PancakeRefCard(start: range.0, end: range.1, posIds: posIds)
                    Panel {
                        HStack { Text("Xu hướng doanh thu").font(.system(size: 15, weight: .bold)); Spacer(); Hint(text: range.0 == range.1 ? "Theo giờ" : "Theo ngày") }
                        if range.0 == range.1 {
                            if hourly.isEmpty { Text("Chưa có đơn chốt trong ngày.").font(.caption).foregroundStyle(Color.inkSoft) }
                            else { LineChart(points: hourly.map { (String($0.hour.prefix(2)) + "h", $0.value) }) }
                        } else if let s = data?.current.series { LineChart(points: byDay(s)) }
                    }
                    Panel {
                        HStack { Text("Trạng thái đơn hàng").font(.system(size: 15, weight: .bold)); Spacer(); Hint(text: "Đơn tạo trong kỳ") }
                        StackedBar(parts: [("Đã thanh toán", t.groups["delivered"]?.orders ?? 0, .good), ("Đang xử lý", (t.groups["confirmed"]?.orders ?? 0) + (t.groups["shipping"]?.orders ?? 0), .warn), ("Chờ xác nhận", t.groups["new"]?.orders ?? 0, .orange), ("Đã hủy", (t.groups["cancelled"]?.orders ?? 0) + (t.groups["returned"]?.orders ?? 0), .bad)])
                        HStack(spacing: 8) {
                            ForEach(StatusStrip.items, id: \.0) { k, title, c in
                                let cell = VStack(spacing: 2) { Text(Fmt.int(t.groups[k]?.orders ?? 0)).font(.system(size: 13, weight: .bold)).foregroundStyle(c); Text(title).font(.system(size: 8)).foregroundStyle(Color.inkSoft).lineLimit(1).minimumScaleFactor(0.7) }.frame(maxWidth: .infinity)
                                if canList { NavigationLink(value: Route.orders(q(k, "created", title))) { cell }.buttonStyle(.plain) } else { cell }
                            }
                        }.padding(.top, 4)
                    }
                    if pos == nil { PosBreakdown(rows: data?.current.byPos ?? [], total: t.closedNet, pick: { pos = $0 }, prev: data?.compare?.byPos ?? []) }
                    if let synced = data?.syncedAt { Text("Đồng bộ Pancake lúc \(Fmt.dateTime(synced))").font(.caption).foregroundStyle(Color.inkSoft) }
                } else { SkeletonGrid(tiles: 4) }
            }.padding(16)
        }
        .navigationTitle("Tổng quan POS").navigationBarTitleDisplayMode(.inline).brandNav()
        .onAppear { if let initialPos, pos == nil { pos = initialPos } }
        .navigationDestination(item: $pushed) { OrderListView(query: $0) }
        .refreshable { await load() }
        .task(id: "\(preset.key)|\(pos ?? "")") { await load() }
        .sheet(item: $explain) { m in ExplainSheet(m: m) { pushed = $0 } }
    }
    private func byDay(_ s: [API.SeriesRow]) -> [(String, Double)] { var m: [String: Double] = [:]; for r in s { m[r.bucket, default: 0] += r.closedNet }; return m.keys.sorted().map { (String($0.suffix(2)), m[$0]!) } }
    private func reconcile(_ t: API.Metrics, _ r: API.Reconcile?) -> (ok: Bool, text: String)? {
        guard let r else { return nil }
        let ok = Int(t.closedOrders - r.orders) == 0 && abs(t.closedNet - r.net) < 1000
        return ok ? (true, "Khớp với đơn gốc: \(Fmt.int(r.orders)) đơn · \(Fmt.money(r.net)).") : (false, "Lệch: bảng số liệu \(Fmt.int(t.closedOrders)) / \(Fmt.money(t.closedNet)); đơn gốc \(Fmt.int(r.orders)) / \(Fmt.money(r.net)). Kéo để làm mới.")
    }
    @MainActor private func load() async {
        loading = true; defer { loading = false }
        do {
            data = try await API.overview(start: range.0, end: range.1, posIds: posIds); error = nil
            if range.0 == range.1 { hourly = (try? await API.shift(date: range.0, shift: "day"))?.hourly ?? [] }
        } catch { self.error = error.localizedDescription }
    }
}


// MARK: Các khối như trang web Điều khiển trung tâm

struct CenterBlocks: View {
    @Environment(SyncStatus.self) private var sync
    @Binding var period: Period
    var team = "all"; var pos = ""; var product = "all"
    private var posIds: [String] { pos.isEmpty ? [] : [pos] }
    @State private var report: API.Overview?
    @State private var trend: API.Overview?
    @State private var shift: API.Shift?
    @State private var pipeline: API.Pipeline?
    @State private var customers: API.CustomerPage?
    @State private var repurchase: API.Repurchase?
    @State private var batches: API.Batches?
    @State private var targets: API.Targets?
    @State private var loading = false
    private var r: (String, String) { period.range }
    private func q(_ group: String, _ basis: String, _ title: String, posIds: [String]? = nil) -> Route { .orders(OrderQuery(start: r.0, end: r.1, posIds: posIds ?? self.posIds, group: group, basis: basis, title: title, team: team, product: product)) }

    var body: some View {
        // Kỳ
        HStack {
            Text("Số liệu theo kỳ").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink)
            Spacer()
            PeriodMenu(period: $period, prefix: "Kỳ: ")
        }.padding(.top, 6)
        Text("\(period.label) · so với kỳ liền trước\(team == "all" ? "" : " · " + (team == "sale" ? "Sale" : "CSKH"))\(pos.isEmpty ? "" : " · " + (PosBreakdown.short[pos] ?? pos))\(product == "all" ? "" : " · " + (product == "gentadox" ? "Gentadox" : "SK + GK"))").font(.system(size: 10)).foregroundStyle(Color.inkSoft).padding(.top, -8)
        if let t = report?.current.total {
            let p = report?.compare?.total
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                NavigationLink(value: q("", "created", "Đơn tạo mới")) { KpiCard(icon: "ic_m_orders", tint: .blue, label: "Đơn tạo mới", value: Fmt.int(t.orders), delta: Fmt.delta(t.orders, p?.orders), note: "\(Fmt.int(t.customers ?? 0)) khách") }
                NavigationLink(value: q("closed", "confirmed", "Đơn chốt")) { KpiCard(icon: "ic_m_closed", tint: .good, label: "Đơn chốt", value: Fmt.int(t.closedOrders), delta: Fmt.delta(t.closedOrders, p?.closedOrders), note: "Tỷ lệ chốt \(Fmt.pct(t.shownRate)) · \(t.rateFrac)") }
                NavigationLink(value: q("closed", "confirmed", "Đơn chốt")) { KpiCard(icon: "ic_m_revenue", tint: .teal, label: "Doanh thu đơn chốt", value: Fmt.short(t.closedNet) + " ₫", delta: Fmt.delta(t.closedNet, p?.closedNet), note: "GTTB \(Fmt.short(t.averageOrder ?? 0)) ₫") }
                KpiCard(icon: "ic_m_aov", tint: .gray, label: "Giá trị TB đơn (AOV)", value: Fmt.short(t.averageOrder ?? 0) + " ₫", delta: Fmt.delta(t.averageOrder ?? 0, p?.averageOrder), note: "Doanh thu ÷ đơn chốt")
                NavigationLink(value: q("delivered", "created", "Giao thành công")) { KpiCard(icon: "shippingbox.fill", tint: .lime, label: "Giao thành công", value: Fmt.int(t.groups["delivered"]?.orders ?? 0), delta: Fmt.delta(t.groups["delivered"]?.orders ?? 0, p?.groups["delivered"]?.orders), note: "\(Fmt.short(t.groups["delivered"]?.net ?? 0)) ₫ · tính theo ngày tạo") }
                NavigationLink(value: Route.page("shift")) { KpiCard(icon: "flame.fill", tint: .warn, label: "Chốt nóng \(shiftName) hôm nay", value: Fmt.pct(shift?.total.rate), delta: shift.flatMap { s in (s.total.rate != nil && s.yesterday.rate != nil) ? String(format: "%+.1f điểm", s.total.rate! - s.yesterday.rate!).replacingOccurrences(of: ".", with: ",") : nil }, deltaGood: (shift?.total.rate ?? 0) >= (shift?.yesterday.rate ?? 0), note: shift.map { "\(Fmt.int($0.total.closed)) chốt / \(Fmt.int($0.total.received)) số nhận" } ?? "—") }
            }.buttonStyle(.plain)
            .environment(\.thinking, loading)
            PancakeRefCard(start: r.0, end: r.1, posIds: posIds)
            // Mục tiêu tháng
            let goal = (targets?.items ?? []).filter { $0.scope == "pos" && (pos.isEmpty || $0.refId == pos) }.reduce(0.0) { $0 + $1.revenue }
            NavigationLink(value: Route.page("cskh-kpi")) {
                Panel(padding: 12) {
                    HStack(spacing: 10) {
                        MetricIcon("ic_m_kpi", size: 15).foregroundStyle(.purple).frame(width: 34, height: 34).background(Color.purple.opacity(0.13), in: .rect(cornerRadius: 9))
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

        // Xếp hạng từng POS và cảnh báo / đồng bộ từng POS: không còn ở trang chủ (anh Vũ 10/10/2026), xem tab Cảnh báo
        // và Thêm › Bộ phận › Tổng quan theo từng POS.

        // Nhân viên
        if let emps = report?.current.byEmployee {
            let staff = emps.filter { !$0.sellerId.isEmpty && $0.assignedOrders >= 10 && ($0.department == nil || $0.department!.range(of: "sale|bán hàng|cskh|chăm sóc", options: [.regularExpression, .caseInsensitive]) != nil) }
            let top = staff.sorted { ($0.shownRate ?? -1) > ($1.shownRate ?? -1) }.prefix(5)
            let low = staff.sorted { ($0.shownRate ?? 999) < ($1.shownRate ?? 999) }.prefix(5)
            Panel {
                HStack { Text("Nhân viên").font(.system(size: 15, weight: .bold)); Spacer(); NavigationLink(value: Route.compare(team: "all")) { HStack(spacing: 2) { Text("So sánh nhân viên"); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }.font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.brand) }.buttonStyle(.plain) }
                Text("Tỷ lệ chốt (\(MetricPrefs.shared.rateShort)) · từ 10 đơn chia · Sale và CSKH").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
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
        Color.clear.frame(height: 0).task(id: "\(period.key)|\(team)|\(pos)|\(product)") { await load() }
    }
    private var shiftName: String { ["morning": "ca sáng", "afternoon": "ca chiều", "evening": "ca tối", "day": "cả ngày"][shift?.shift ?? ""] ?? "ca hiện tại" }
    private func byDay(_ s: [API.SeriesRow]) -> [(String, Double)] { var m: [String: Double] = [:]; for x in s { m[x.bucket, default: 0] += x.closedNet }; return m.keys.sorted().map { ($0, m[$0]!) } }
    private func byDayOrders(_ s: [API.SeriesRow]) -> [(String, Double)] { var m: [String: Double] = [:]; for x in s { m[x.bucket, default: 0] += x.closedOrders }; return m.keys.sorted().map { ($0, m[$0]!) } }
    @MainActor private func load() async {
        loading = true; defer { loading = false }
        let today = VNDate.string(.now)
        report = try? await API.overview(start: r.0, end: r.1, posIds: posIds, team: team, product: product)
        shift = try? await API.shift(date: today, shift: "auto", posIds: posIds, team: team)
        pipeline = try? await API.pipeline(start: r.0, end: r.1, basis: "confirmed", posIds: posIds, team: team, product: product)
        targets = try? await API.targets(month: String(r.1.prefix(7)))
        trend = try? await API.overview(start: VNDate.string(VNDate.add(-29)), end: today, posIds: posIds, team: team, compare: "none", product: product)
        if customers == nil { customers = try? await API.customers(segment: "", sort: "spend", q: "", page: 1, size: 1) }
        repurchase = try? await API.repurchase(start: r.0, end: r.1, posIds: posIds, team: team, product: product)
        batches = try? await API.batches(start: r.0, end: r.1, posIds: posIds, team: team)
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
                        VStack(alignment: .trailing, spacing: 1) { Text(Fmt.pct(e.shownRate)).font(.system(size: 11, weight: .bold)).foregroundStyle(tone); Text(e.rateFrac).font(.system(size: 9)).foregroundStyle(Color.inkSoft) }
                        Bar(value: min(1, (e.shownRate ?? 0) / 100), tint: tone, height: 4).frame(width: 60)
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
        PosInfo.color(id)
    }
}
