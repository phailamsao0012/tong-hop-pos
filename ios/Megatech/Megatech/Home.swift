import SwiftUI

// Tab Tổng quan ở giữa thanh dưới, mở app vào đây (anh Vũ 10/10/2026): 4 bộ phận Sale, CSKH, MKT, Vận đơn như 4 bảng đầu trang
// Tổng quan POS trên web, không còn ô từng POS ("không cần thông tin như theo các pos hiện tại"). Chạm bảng nào mở chi tiết
// bộ phận đó. Bên dưới giữ các khối số liệu chung; việc khẩn cấp và đồng bộ từng POS ở trang Thông báo (chuông).
struct HomeView: View {
    @Environment(AppNav.self) private var nav
    @Environment(AuthModel.self) private var auth
    /// Kỳ, POS, nhóm đơn chung (AppNav, kế hoạch 1.4): nhớ giữa các lần mở app; bảng nào chạm vào cũng mở trang con đúng bộ lọc này.
    private var period: Period { nav.period }
    private var pos: String { nav.pos }
    private var product: String { nav.product }
    @State private var sections: API.Sections?
    /// Số Marketing cho bảng MKT (/api/marketing/analytics, như trang Marketing; chưa lọc được theo nhóm đơn).
    @State private var mkt: API.MktAnalytics?
    @State private var error: String?
    @State private var loading = false
    /// Lần tải mới nhất: lần cũ (đã huỷ hoặc kéo làm mới bộ lọc cũ) xong sau không tắt cờ đang tải của lần mới.
    @State private var gen = 0
    /// Kỳ|POS|nhóm đơn của số đang hiện (tải kỳ mới lỗi thì bỏ số cũ).
    @State private var dataKey = ""
    /// POS của số đang hiện (trong lúc tải POS mới, số cũ vẫn là của POS cũ).
    @State private var dataPos = ""
    /// Mở lại tab mà số chưa quá 60 giây thì không tải lại (kéo để làm mới thì luôn tải).
    @State private var fresh = Freshness()
    private var key: String { "\(period.key)|\(pos)|\(product)" }
    /// 4 bảng đọc /api/reports/sections, web chỉ mở cho người xem được Tổng quan POS.
    private var allowed: Bool { auth.me?.canView("overview") ?? false }
    /// Đang xem một số POS (chọn POS hoặc tài khoản giới hạn POS): chi phí quảng cáo là của mọi POS nên không chia được.
    private var posLimited: Bool { !pos.isEmpty || !dataPos.isEmpty || (auth.me?.role != "owner" && !(auth.me?.posIds ?? []).isEmpty) }

    var body: some View {
        @Bindable var nav = nav
        NavigationStack(path: $nav.overviewPath) {
            if !allowed {
                TabPage(title: "Tổng quan", subtitle: "4 bộ phận") {
                    ContentUnavailableView("Chưa được cấp quyền", systemImage: "lock.fill", description: Text("Tài khoản này chưa được xem Tổng quan POS. Các phần khác xem ở Hôm nay và Phòng ban."))
                }
                .appRoutes()
            } else {
                TabPage(title: "Tổng quan", subtitle: "4 bộ phận · \(period.label)") {
                    ScrollViewReader { proxy in
                        VStack(alignment: .leading, spacing: 14) {
                            // Một bộ chọn kỳ cho cả trang (khối Số liệu theo kỳ bên dưới dùng cùng kỳ này), đổi bằng 1 chạm.
                            FilterBar {
                                PeriodChips(period: $nav.period)
                                PosChipRow(selection: $nav.pos)
                                ProductPill(selection: $nav.product)
                                HrTeamChip()
                            }
                            ScopeLine(period: period, pos: pos)
                            if let error, sections == nil {
                                StateView(error: error) { await load(force: true) }
                            }
                            if let s = sections { footnote(s) }
                            Text("Xem riêng, không cộng lại").font(.footnote).foregroundStyle(Palette.muted)
                            DeptBoards(data: sections, mkt: mkt?.current, mktRatios: !posLimited, mktNote: product == "all" ? nil : "MKT chưa lọc được theo nhóm đơn: số của mọi sản phẩm.",
                                       period: period, pos: pos, product: product, me: auth.me, failed: error != nil)
                                .environment(\.thinking, loading && sections != nil)
                            if nav.hrUnit != nil { Text("4 bảng bộ phận chưa lọc theo team.").font(.caption).foregroundStyle(Color.inkSoft) }
                            CenterBlocks(period: period, team: "all", pos: pos, product: product)
                        }
                        .onChange(of: nav.overviewScroll) { _, id in
                            guard let id else { return }
                            withAnimation(.easeInOut(duration: 0.7)) { proxy.scrollTo(id, anchor: .top) }
                            nav.overviewScroll = nil
                        }
                    }
                }
                .appRoutes()
                // Kéo để làm mới: TabPage chạy việc này cùng lúc với các khối bên dưới (CenterBlocks, PancakeRefCard).
                .refreshable { await load(force: true) }
                .task(id: key) { await load() }
            }
        }
    }

    /// Giờ đồng bộ Pancake và cách tính từng bộ phận (như nút "i" trên web).
    private func syncFootnote(_ sections: API.Sections) -> String {
        let synced: String = sections.syncedAt.map { " · số Pancake đồng bộ \(Fmt.time($0))" } ?? ""
        return "Chạm vào bộ phận để xem chi tiết\(synced)"
    }
    private func footnote(_ s: API.Sections) -> some View {
        let definitions = CompanyDept.allCases.compactMap { dept -> String? in
            let text = dept == .vandon ? CompanyDept.vanDonDefinition(VdBasis(s.sentBasis)) : s.definitions?[dept.definitionKey]
            return text.map { "\(dept.title)\n\($0)" }
        }.joined(separator: "\n\n")
        return GroupTitle(title: "4 bộ phận", subtitle: syncFootnote(s), info: InfoText(title: "Cách tính 4 bộ phận", body: definitions))
    }

    /// Lần tải đầu (kỳ, POS, nhóm đơn nhớ từ lần mở trước, NavMemory) được tải trước lúc hộp Face ID đang hiện: đổi cách tải thì
    /// sửa cả UnlockPrefetch.firstTabPaths.
    /// force: kéo để làm mới / Thử lại. Không force (mở lại tab) mà số của đúng bộ lọc này chưa quá 60 giây thì không tải.
    @MainActor private func load(force: Bool = false) async {
        let k = key
        if !force, sections != nil, dataKey == k, let age = fresh.age(k) { LoadTrace.skip("tong-quan", age: age); return }
        gen += 1; let g = gen
        loading = true; defer { if g == gen { loading = false } }
        let r = period.range, p = pos, prod = product, posIds = pos.isEmpty ? [] : [pos]
        let wantMkt = auth.me?.canView("mkt-roas") ?? false
        let trace = LoadTrace("tong-quan", requests: wantMkt ? 2 : 1)
        // Hai nguồn tải cùng lúc: bảng Sale, CSKH, Vận đơn hiện ngay, không chờ số Marketing.
        async let mReq = attempt(wantMkt, trace) { try await API.mktAnalytics(start: r.0, end: r.1, posIds: posIds, marketerId: nil, teamId: nil, product: nil) }
        var ok = false
        do {
            let s = try await trace.run { try await API.sections(start: r.0, end: r.1, posIds: posIds, product: prod) }
            // Kéo làm mới không bị huỷ khi đổi kỳ / POS: số của bộ lọc cũ không được ghi đè bộ lọc mới.
            if !Task.isCancelled, k == key {
                if dataKey != k { mkt = nil }   // không để số MKT của bộ lọc khác nằm dưới bộ lọc mới
                sections = s; dataKey = k; dataPos = p; error = nil; ok = true
                LaunchClock.mark("so-dau-tien")
            }
        } catch {
            if !Task.isCancelled, k == key {
                if let text = LoadError.text(error) { self.error = text }
                if dataKey != k { sections = nil; mkt = nil; dataPos = "" }
                fresh.clear()
            }
        }
        let m = await mReq
        trace.end(cancelled: Task.isCancelled || k != key)
        guard ok, !Task.isCancelled, k == key else { return }
        switch m {
        case .success(let v)?: mkt = v
        case .failure?: break   // lỗi khi làm mới cùng bộ lọc: giữ số MKT đang hiện; bộ lọc mới thì bảng MKT dùng số của bảng chung
        case nil: mkt = nil
        }
        fresh.stamp(k)
    }
}

/// Đường xu hướng nhỏ trong thẻ Doanh thu hôm nay.
struct Spark: View {
    let points: [Double]
    @State private var shown = false
    private func positions(in size: CGSize) -> [CGPoint] {
        let maxV: Double = max(1, points.max() ?? 1)
        let n: Int = max(1, points.count - 1)
        return points.enumerated().map { i, v -> CGPoint in
            let x: CGFloat = size.width * CGFloat(i) / CGFloat(n)
            let y: CGFloat = size.height * (1 - v / maxV) * 0.9 + 3
            return CGPoint(x: x, y: y)
        }
    }
    var body: some View {
        GeometryReader { g in
            let pts: [CGPoint] = positions(in: g.size)
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
    @State private var preset: Period
    var initialPos: String? = nil
    /// Mở từ số Doanh thu hôm nay ở Trang chủ: khối Số tham chiếu Pancake (cùng số đó) lên đầu.
    var refFirst = false
    @State private var pos: String?
    /// Mở từ Tổng quan, Thêm: kỳ và POS chung (AppNav, kế hoạch 1.4), đổi riêng ở trang này được. Mở từ số Doanh thu hôm nay ở
    /// Trang chủ (refFirst): Hôm nay, mọi POS, như số vừa chạm. initialPos: POS mở sẵn.
    init(initialPos: String? = nil, refFirst: Bool = false) {
        self.initialPos = initialPos
        self.refFirst = refFirst
        _preset = State(initialValue: refFirst ? .today : NavMemory.period)
        let shared = NavMemory.pos
        _pos = State(initialValue: initialPos ?? (refFirst || shared.isEmpty ? nil : shared))
    }
    @State private var data: API.Overview?
    @State private var hourly: [API.Shift.Hour] = []
    @State private var error: String?
    @State private var explain: MetricExplain?
    @State private var pushed: OrderQuery?
    @State private var loading = false
    @Environment(\.dismiss) private var dismiss
    private var range: (String, String) { preset.range }
    private var posIds: [String] { pos.map { [$0] } ?? [] }
    private var periodLabel: String {
        let r: (String, String) = range
        let dates: String = r.0 == r.1 ? Fmt.day(r.0) : "\(Fmt.day(r.0)) – \(Fmt.day(r.1))"
        let posName: String = pos.map { PosBreakdown.names[$0] ?? $0 } ?? "Tất cả POS"
        return "\(dates) · \(posName)"
    }
    private var hourlyPoints: [(String, Double)] { hourly.map { ("\($0.hour.prefix(2))h", $0.value) } }
    private func statusParts(_ metrics: API.Metrics) -> [(String, Double, Color)] {
        let groups: [String: API.Group] = metrics.groups
        let processing: Double = (groups["confirmed"]?.orders ?? 0) + (groups["shipping"]?.orders ?? 0)
        let cancelled: Double = (groups["cancelled"]?.orders ?? 0) + (groups["returned"]?.orders ?? 0)
        return [("Đã thanh toán", groups["delivered"]?.orders ?? 0, .good),
                ("Đang xử lý", processing, .warn),
                ("Chờ xác nhận", groups["new"]?.orders ?? 0, .orange),
                ("Đã hủy", cancelled, .bad)]
    }
    private func q(_ group: String, _ basis: String, _ title: String) -> OrderQuery { OrderQuery(start: range.0, end: range.1, posIds: posIds, group: group, basis: basis, title: title) }
    /// Danh sách đơn nguồn (/api/raw/orders) chỉ mở cho người được xem Đơn nguồn Pancake.
    private var canList: Bool { auth.me?.canView("raw-orders") ?? false }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                PageTitle(title: "Tổng quan POS", subtitle: "Hiệu suất bán hàng theo từng điểm", trailing: AnyView(Hint(text: "Số liệu Pancake")))
                FilterBar {
                    PeriodChips(period: $preset)
                    PosChipRow(selection: Binding(get: { pos ?? "" }, set: { pos = $0.isEmpty ? nil : $0 }), label: nil)
                }
                ScopeLine(period: preset, pos: pos ?? "")
                if let error, data == nil { StateView(error: error) { await load() } }
                if refFirst { PancakeRefCard(start: range.0, end: range.1, posIds: posIds) }
                if let t = data?.current.total {
                    let p = data?.compare?.total
                    let rec = reconcile(t, data?.current.reconcile)
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Doanh thu theo POS").font(.headline).foregroundStyle(Palette.heroInk)
                        OverviewMoney(money: t.closedNet, onHero: true).loadingPlaceholder(loading)
                        if let delta = Fmt.delta(t.closedNet, p?.closedNet) { DeltaPill(delta, onHero: true) }
                        HStack(alignment: .bottom, spacing: 10) {
                            ForEach(data?.current.byPos ?? [], id: \.posId) { row in
                                Button { pos = row.posId } label: {
                                    VStack(spacing: 8) {
                                        Text(Fmt.shortMoney(row.closedNet)).font(.caption.weight(.bold))
                                        ColumnBar(height: 100 * row.closedNet / max(1, data?.current.byPos.map(\.closedNet).max() ?? 1), tint: PosInfo.color(row.posId))
                                        Text(PosBreakdown.short[row.posId] ?? row.posId).font(.caption).foregroundStyle(Palette.heroMuted)
                                    }.frame(maxWidth: .infinity)
                                }.buttonStyle(.plain)
                            }
                        }
                    }.heroSurface()
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        Button { explain = MetricExplain(title: "Tổng đơn hàng", value: Fmt.int(t.orders), definition: "Số đơn được tạo trong kỳ (theo ngày tạo), không tính đơn đã xóa.", period: periodLabel, previous: p.map { ("Kỳ trước", Fmt.int($0.orders)) }, count: canList ? Int(t.orders) : nil, query: canList ? q("", "created", "Đơn tạo") : nil) } label: {
                            KpiCard(icon: "ic_m_orders", tint: .good, label: "Tổng đơn hàng", value: Fmt.int(t.orders), delta: Fmt.delta(t.orders, p?.orders)) }
                        Button { explain = MetricExplain(title: "Doanh thu đơn chốt", value: Fmt.money(t.closedNet), definition: "Tiền (sau giảm giá và quà, không cộng phí ship) của các đơn chốt trong kỳ: đơn vào Chờ xác nhận lần đầu trong kỳ, xếp theo giờ vào Chờ xác nhận. Đơn đang huỷ không tính, đơn hoàn vẫn tính. Chỉ tính người bán có hậu tố SALE, CSKH, MKT (đơn chưa gắn người bán vẫn tính). Cùng số với ô \"Doanh thu đơn chốt\" ở Tổng quan POS trên web.", period: periodLabel, previous: p.map { ("Kỳ trước", Fmt.money($0.closedNet)) }, reconcile: rec) } label: {
                            KpiCard(icon: "ic_m_revenue", tint: .teal, label: "Doanh thu đơn chốt", value: Fmt.vnd(t.closedNet), delta: Fmt.delta(t.closedNet, p?.closedNet), money: t.closedNet) }
                        Button { explain = MetricExplain(title: "Tỷ lệ chốt", value: Fmt.pct(t.shownRate), definition: "\(MetricPrefs.shared.rateHint).\n\(t.rateFrac).\nĐổi ở Thêm → Cách tính.", period: periodLabel, previous: p.map { ("Kỳ trước", Fmt.pct($0.shownRate)) }) } label: {
                            KpiCard(icon: "ic_m_rate", tint: .purple, label: "Tỷ lệ chốt", value: Fmt.pct(t.shownRate), delta: (t.shownRate != nil && p?.shownRate != nil) ? Fmt.points(t.shownRate! - p!.shownRate!) : nil, deltaGood: (t.shownRate ?? 0) >= (p?.shownRate ?? 0), note: t.rateFrac) }
                        Button { explain = MetricExplain(title: "Khách mua hàng", value: Fmt.int(t.customers ?? 0), definition: "Số SĐT khác nhau có đơn tạo trong kỳ. Trong đó \(Fmt.int(t.closedCustomers ?? 0)) SĐT có đơn chốt.", period: periodLabel, previous: p.map { ("Kỳ trước", Fmt.int($0.customers ?? 0)) }, count: canList ? Int(t.orders) : nil, query: canList ? q("", "created", "Đơn tạo") : nil) } label: {
                            KpiCard(icon: "ic_m_customers", tint: .blue, label: "Khách mua hàng", value: Fmt.int(t.customers ?? 0), delta: Fmt.delta(t.customers ?? 0, p?.customers)) }
                    }.buttonStyle(.plain)
                    .environment(\.thinking, loading)
                    if let rec { ScopeStrip(text: rec.text, trailing: rec.ok ? "✓" : "⚠", tone: rec.ok ? Palette.good : Palette.warn).reveal() }
                    if !refFirst { PancakeRefCard(start: range.0, end: range.1, posIds: posIds) }
                    Panel {
                        HStack { Text("Xu hướng doanh thu").font(.title3.weight(.bold)); Spacer(); Hint(text: range.0 == range.1 ? "Theo giờ" : "Theo ngày") }
                        if range.0 == range.1 {
                            if hourly.isEmpty { Text("Chưa có đơn chốt trong ngày.").font(.caption).foregroundStyle(Color.inkSoft) }
                            else { LineChart(points: hourlyPoints) }
                        } else if let s = data?.current.series { LineChart(points: byDay(s)) }
                    }
                    Panel {
                        HStack { Text("Trạng thái đơn hàng").font(.title3.weight(.bold)); Spacer(); Hint(text: "Đơn tạo trong kỳ") }
                        if StatusStrip.items.reduce(0.0, { $0 + (t.groups[$1.0]?.orders ?? 0) }) == t.orders {
                            SplitBar(parts: StatusStrip.items.map { ($0.1, t.groups[$0.0]?.orders ?? 0, Fmt.int(t.groups[$0.0]?.orders ?? 0), $0.2) })
                        }
                        VStack(spacing: 8) {
                            ForEach(StatusStrip.items, id: \.0) { k, title, c in
                                let cell = HStack {
                                    StatusPill(name: title, code: ["new": 0, "confirmed": 1, "shipping": 2, "delivered": 3, "returned": 4, "cancelled": 6][k])
                                    Spacer()
                                    Text(Fmt.int(t.groups[k]?.orders ?? 0)).font(.callout.weight(.bold)).monospacedDigit().foregroundStyle(c)
                                }
                                if canList { NavigationLink(value: Route.orders(q(k, "created", title))) { cell }.buttonStyle(.plain) } else { cell }
                            }
                        }.padding(.top, 4)
                    }
                    if pos == nil { PosBreakdown(rows: data?.current.byPos ?? [], total: t.closedNet, pick: { pos = $0 }, prev: data?.compare?.byPos ?? []) }
                    if let synced = data?.syncedAt { Text("Đồng bộ Pancake lúc \(Fmt.dateTime(synced))").font(.caption).foregroundStyle(Color.inkSoft) }
                } else if error == nil { SkeletonGrid(tiles: 4) }
            }.padding(16)
        }
        .navigationTitle("Tổng quan POS").navigationBarTitleDisplayMode(.inline).brandNav()
        .navigationDestination(item: $pushed) { OrderListView(query: $0) }
        // Kéo để làm mới: số của trang và khối Số tham chiếu Pancake tải lại cùng lúc.
        .refreshHost { await load() }
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
        let r = range, ids = posIds, oneDay = r.0 == r.1
        let trace = LoadTrace("tong-quan-pos", requests: oneDay ? 2 : 1)
        // Số theo giờ (chỉ khi xem một ngày) tải cùng lúc với số chính.
        async let hReq = attempt(oneDay, trace) { try await API.shift(date: r.0, shift: "day") }
        do {
            data = try await trace.run { try await API.overview(start: r.0, end: r.1, posIds: ids) }
            error = nil
        } catch {
            if let text = LoadError.text(error) { self.error = text }
        }
        if let h = await hReq { hourly = (try? h.get())?.hourly ?? [] }
        trace.end(cancelled: Task.isCancelled)
    }
}


// MARK: Các khối như trang web Điều khiển trung tâm

struct CenterBlocks: View {
    @Environment(SyncStatus.self) private var sync
    @Environment(AppNav.self) private var nav: AppNav?
    private var applied: HrUnit? { HrUnit.applies(nav?.hrUnit, to: team) }
    @State private var teamError: String?
    /// Kỳ của trang chứa khối (Tổng quan: kỳ chung, chọn ở dải chip đầu trang; khối không có bộ chọn kỳ riêng).
    let period: Period
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
    /// Lần tải mới nhất (lần cũ về sau không ghi đè), bộ lọc của số đang hiện, tuổi số (mở lại tab không tải lại nếu chưa quá 60 giây).
    @State private var gen = 0
    @State private var dataKey = ""
    @State private var fresh = Freshness()
    /// Lần tải gần nhất có phần chưa tải được: câu lỗi và số phần lỗi (trong 8 nguồn).
    @State private var failText: String?
    @State private var failCount = 0
    private var key: String { "\(period.key)|\(team)|\(pos)|\(product)|\(applied?.id ?? "")" }
    private var r: (String, String) { period.range }
    /// Kỳ, POS, bộ phận, nhóm đơn của khối: chạm một nhân viên mở đơn chốt của người đó với đúng bộ lọc này (kế hoạch 1.6).
    private var filters: OrderFilters { OrderFilters(range: r, pos: pos, team: team, product: product) }
    /// " · Sale · POS · nhóm đơn" của bộ lọc đang chọn (rỗng khi xem tất cả).
    private var filterSuffix: String {
        let department: String = team == "sale" ? "Sale" : "CSKH"
        let departmentSuffix: String = team == "all" ? "" : " · \(department)"
        let posSuffix: String = pos.isEmpty ? "" : " · \(PosBreakdown.short[pos] ?? pos)"
        let productName: String = product == "gentadox" ? "Gentadox" : "SK + GK"
        let productSuffix: String = product == "all" ? "" : " · \(productName)"
        let teamSuffix: String = applied.map { " · team \($0.shortName)" } ?? ""
        return "\(departmentSuffix)\(posSuffix)\(productSuffix)\(teamSuffix)"
    }
    private var departmentLabel: String {
        if team == "sale" { return "Sale" }
        if team == "cskh" { return "CSKH" }
        return "Tất cả"
    }
    private var batchTotals: (Double, Double, Double) {
        let rows: [API.Batch] = batches?.batches ?? []
        return rows.reduce((0.0, 0.0, 0.0)) { total, row -> (Double, Double, Double) in
            (total.0 + row.received, total.1 + row.buyers, total.2 + row.net)
        }
    }
    private var purchasedText: String {
        guard batches != nil else { return "—" }
        let totals: (Double, Double, Double) = batchTotals
        let rate: Double? = totals.0 > 0 ? totals.1 / totals.0 * 100 : nil
        return "\(Fmt.int(totals.1)) · \(Fmt.pct0(rate))"
    }
    private var repurchaseRate: String {
        guard let repurchase else { return "—" }
        let rate: Double? = repurchase.funnel.once > 0 ? repurchase.funnel.twice / repurchase.funnel.once * 100 : nil
        return Fmt.pct(rate)
    }
    private func dormantTone(_ bucket: String) -> Color {
        if bucket == "90+" { return .bad }
        if bucket == "61-90" { return Palette.orange }
        if bucket == "46-60" { return Palette.warn }
        return .good
    }
    private func purchasedSummary(net: Double?, count: Double) -> String {
        let average: String
        if let net, count > 0 { average = " · TB \(Fmt.shortMoney(net / count))/khách" }
        else { average = "" }
        return "Đã mua \(Fmt.shortVnd(net))\(average)"
    }
    #if DEBUG
    /// Lượt tự xem MEGATECH_TOUR=chamso "chạm" dòng nhân viên (máy ảo không chạm được).
    @Environment(AppNav.self) private var tourNav: AppNav?
    #endif
    private func q(_ group: String, _ basis: String, _ title: String, posIds: [String]? = nil) -> Route { .orders(OrderQuery(start: r.0, end: r.1, posIds: posIds ?? self.posIds, group: group, basis: basis, title: title, team: team, product: product)) }
    @State private var staffGroup = "top"

    var body: some View {
        HrTeamNotice(applies: applied != nil, deptLabel: departmentLabel)
        // Kỳ: cùng kỳ chọn ở đầu trang (kế hoạch 1.4 bỏ nút chọn kỳ thứ hai ở đây).
        GroupTitle(title: "Số liệu theo kỳ", subtitle: "\(ScopeText.text(period: period, pos: nil)) · so với kỳ liền trước\(filterSuffix)")
            .padding(.top, 6).id("center")
        if let teamError { HrTeamErrorView(message: teamError) { nav?.hrUnit = nil } }
        else if let failText {
            StateView(error: failCount > 1 ? "\(failText) · \(failCount) phần chưa tải được" : failText, compact: true) { await load(force: true) }
        }
        if let t = report?.current.total {
            let p = report?.compare?.total
            NavigationLink(value: q("closed", "confirmed", "Đơn chốt")) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Doanh thu đơn chốt").font(.headline)
                    OverviewMoney(money: t.closedNet, onHero: true).loadingPlaceholder(loading)
                    if let delta = Fmt.delta(t.closedNet, p?.closedNet) { DeltaPill(delta, onHero: true) }
                }.frame(maxWidth: .infinity, alignment: .leading).heroSurface()
            }.buttonStyle(.plain)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                NavigationLink(value: q("", "created", "Đơn tạo mới")) { KpiCard(icon: "ic_m_orders", tint: .blue, label: "Đơn tạo mới", value: Fmt.int(t.orders), delta: Fmt.delta(t.orders, p?.orders), note: "\(Fmt.int(t.customers ?? 0)) khách") }
                NavigationLink(value: q("closed", "confirmed", "Đơn chốt")) { KpiCard(icon: "ic_m_closed", tint: .good, label: "Đơn chốt", value: Fmt.int(t.closedOrders), delta: Fmt.delta(t.closedOrders, p?.closedOrders), note: "Tỷ lệ chốt \(Fmt.pct(t.shownRate)) · \(t.rateFrac)") }
                NavigationLink(value: q("closed", "confirmed", "Đơn chốt")) { KpiCard(icon: "ic_m_revenue", tint: .teal, label: "Doanh thu đơn chốt", value: Fmt.shortMoney(t.closedNet), delta: Fmt.delta(t.closedNet, p?.closedNet), note: "GTTB \(Fmt.shortMoney(t.averageOrder ?? 0))", money: t.closedNet) }
                KpiCard(icon: "ic_m_aov", tint: .gray, label: "Giá trị TB đơn (AOV)", value: Fmt.shortMoney(t.averageOrder ?? 0), delta: Fmt.delta(t.averageOrder ?? 0, p?.averageOrder), note: "Doanh thu ÷ đơn chốt", money: t.averageOrder ?? 0)
                NavigationLink(value: q("delivered", "created", "Giao thành công")) { KpiCard(icon: "shippingbox.fill", tint: .lime, label: "Giao thành công", value: Fmt.int(t.groups["delivered"]?.orders ?? 0), delta: Fmt.delta(t.groups["delivered"]?.orders ?? 0, p?.groups["delivered"]?.orders), note: "\(Fmt.shortMoney(t.groups["delivered"]?.net ?? 0)) · tính theo ngày tạo") }
                NavigationLink(value: Route.page("shift")) { KpiCard(icon: "flame.fill", tint: .warn, label: "Chốt nóng \(shiftName) hôm nay", value: Fmt.pct(shift?.total.rate), delta: shift.flatMap { s in (s.total.rate != nil && s.yesterday.rate != nil) ? Fmt.points(s.total.rate! - s.yesterday.rate!) : nil }, deltaGood: (shift?.total.rate ?? 0) >= (shift?.yesterday.rate ?? 0), note: shift.map { "\(Fmt.int($0.total.closed)) chốt / \(Fmt.int($0.total.received)) số nhận" } ?? "—") }
            }.buttonStyle(.plain)
            .environment(\.thinking, loading)
            if applied != nil { Text("Chốt nóng chưa lọc theo team.").font(.caption).foregroundStyle(Color.inkSoft) }
            PancakeRefCard(start: r.0, end: r.1, posIds: posIds)
            if applied != nil { Text("Số tham chiếu Pancake chưa lọc theo team.").font(.caption).foregroundStyle(Color.inkSoft) }
            if applied != nil { Color.clear.frame(height: 0).id("muc-tieu-team") }
            if applied != nil {
                Text("Mục tiêu tháng chưa tính theo team").font(.subheadline).foregroundStyle(Color.inkSoft)
            } else {
                // Mục tiêu tháng
                let goal = (targets?.items ?? []).filter { $0.scope == "pos" && (pos.isEmpty || $0.refId == pos) }.reduce(0.0) { $0 + $1.revenue }
                NavigationLink(value: Route.page("cskh-kpi")) {
                    Panel(padding: 12) {
                        HStack(spacing: 10) {
                            if goal > 0 { Ring(value: t.closedNet / goal, size: 96, tint: Palette.accent) }
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Mục tiêu tháng \(r.1.suffix(5).prefix(2))").font(.footnote).foregroundStyle(Color.inkSoft)
                                Text(Fmt.shortMoney(t.closedNet)).font(.system(size: 28, weight: .heavy, design: .rounded)).foregroundStyle(Palette.ink).monospacedDigit().lineLimit(1).minimumScaleFactor(0.5)
                            }
                            Spacer()
                            Text(goal > 0 ? "\(Fmt.short(t.closedNet)) / \(Fmt.shortMoney(goal)) · còn \(Fmt.shortMoney(max(0, goal - t.closedNet)))" : "Chưa đặt mục tiêu (Cấu hình → Mục tiêu tháng)").font(.footnote).foregroundStyle(Color.inkSoft).multilineTextAlignment(.trailing)
                        }
                        if goal > 0 { Bar(value: t.closedNet / goal, tint: Palette.accent, height: 7) }
                    }
                }.buttonStyle(.plain)
            }
        } else if failText == nil || loading { SkeletonGrid(tiles: 6) }

        // Xu hướng 30 ngày
        Panel {
            HStack { Text("Xu hướng 30 ngày").font(.title3.weight(.bold)); Spacer(); NavigationLink(value: Route.overview) { HStack(spacing: 2) { Text("Xem chi tiết"); Image(systemName: "chevron.right").font(.caption.weight(.bold)) }.font(.footnote.weight(.semibold)).foregroundStyle(Color.brand) }.buttonStyle(.plain) }
            // Biểu đồ đường, chưa chạm được (biểu đồ chạm được ở kế hoạch 2.8): chỉ ghi biểu đồ là gì và phạm vi.
            Text("Doanh thu đơn chốt từng ngày (triệu ₫) · 30 ngày gần nhất, không theo kỳ đã chọn\(filterSuffix)").font(.footnote).foregroundStyle(Color.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
            if let s = trend?.current.series, !s.isEmpty {
                let pts = byDay(s)
                LineChart(points: pts.map { (String(Fmt.day($0.0).prefix(5)), $0.1) }, tint: .brand, height: 120)
                HStack(spacing: 12) { HStack(spacing: 4) { Circle().fill(Color.brand).frame(width: 7, height: 7); Text("Doanh thu đơn chốt") }; Text("Đơn chốt 30 ngày: \(Fmt.int(byDayOrders(s).reduce(0) { $0 + $1.1 }))") }.font(.caption).foregroundStyle(Color.inkSoft)
            } else if trend != nil {
                Text("Chưa có đơn chốt trong 30 ngày qua.").font(.caption).foregroundStyle(Color.inkSoft)
            } else if failText != nil && !loading {
                Text("Chưa tải được xu hướng 30 ngày. Bấm Thử lại ở trên.").font(.caption).foregroundStyle(Color.inkSoft)
            } else { Skeleton(height: 120) }
        }

        // Trạng thái đơn + Vận hành đơn
        if let t = report?.current.total {
            Panel {
                HStack { Text("Trạng thái đơn").font(.title3.weight(.bold)); Spacer(); Hint(text: "Đơn tạo trong kỳ · lúc đồng bộ") }
                HStack(spacing: 14) {
                    if StatusStrip.items.reduce(0.0, { $0 + (t.groups[$1.0]?.orders ?? 0) }) == t.orders {
                        OverviewStatusRing(parts: StatusStrip.items.map { ($0.1, t.groups[$0.0]?.orders ?? 0, $0.2) }, center: Fmt.int(t.orders))
                    } else {
                        Text(Fmt.int(t.orders)).font(.system(.title, design: .rounded, weight: .heavy)).monospacedDigit()
                    }
                    VStack(alignment: .leading, spacing: 5) {
                        ForEach(StatusStrip.items, id: \.0) { k, title, c in
                            NavigationLink(value: q(k, "created", title)) {
                                HStack(spacing: 6) { Circle().fill(c).frame(width: 8, height: 8); Text(title).font(.footnote).foregroundStyle(Color.ink).lineLimit(1); Spacer(); Text(Fmt.int(t.groups[k]?.orders ?? 0)).font(.footnote.weight(.bold)).monospacedDigit(); Text(Fmt.pct0(t.orders > 0 ? (t.groups[k]?.orders ?? 0) / t.orders * 100 : nil)).font(.footnote).foregroundStyle(Color.inkSoft).frame(width: 34, alignment: .trailing) }
                            }.buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        if applied != nil { Color.clear.frame(height: 0).id("van-hanh-team") }
        if let d = pipeline {
            let T = d.total, closed = T["closed"]?.orders ?? 0, shipped = T["shipped"]?.orders ?? 0, dl = T["delivered"]?.orders ?? 0
            Panel {
                HStack { Text("Vận hành đơn").font(.title3.weight(.bold)); Spacer(); NavigationLink(value: Route.page("pipeline")) { HStack(spacing: 2) { Text("Xem chi tiết"); Image(systemName: "chevron.right").font(.caption.weight(.bold)) }.font(.footnote.weight(.semibold)).foregroundStyle(Color.brand) }.buttonStyle(.plain) }
                if applied != nil { Text("Vận hành đơn chưa lọc theo team.").font(.caption).foregroundStyle(Color.inkSoft) }
                Text("Chốt → xuất đi → đã nhận · theo giờ chốt trong kỳ").font(.footnote).foregroundStyle(Color.inkSoft)
                NavigationLink(value: q("closed", "confirmed", "Đơn chốt")) { FunnelLine(label: "Đơn chốt", n: closed, of: closed, tint: .good) }.buttonStyle(.plain)
                NavigationLink(value: q("shipped", "confirmed", "Đã xuất đi")) { FunnelLine(label: "Đã xuất đi", n: shipped, of: closed, tint: .blue) }.buttonStyle(.plain)
                NavigationLink(value: q("delivered", "confirmed", "Đã nhận")) { FunnelLine(label: "Đã nhận", n: dl, of: closed, tint: .good) }.buttonStyle(.plain)
                ViewThatFits(in: .horizontal) {
                    HStack { pipelinePills(T) }
                    VStack(alignment: .leading, spacing: 8) { pipelinePills(T) }
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
                HStack { Text("Nhân viên").font(.title3.weight(.bold)); Spacer(); NavigationLink(value: Route.compare(team: "all")) { HStack(spacing: 2) { Text("So sánh nhân viên"); Image(systemName: "chevron.right").font(.caption.weight(.bold)) }.font(.footnote.weight(.semibold)).foregroundStyle(Color.brand) }.buttonStyle(.plain) }
                Text("Tỷ lệ chốt (\(MetricPrefs.shared.rateShort)) · từ 10 đơn chia · Sale và CSKH").font(.footnote).foregroundStyle(Color.inkSoft)
                Segmented(selection: $staffGroup, options: [("top", "TOP 5"), ("low", "Cần hỗ trợ")])
                EmpRows(rows: staffGroup == "top" ? Array(top) : Array(low), tone: Palette.accent, filters: filters, period: period, hrTeam: applied?.id)
            }
            .id("nhan-vien")
            #if DEBUG
            .onChange(of: DebugTap.shared.tick) { _, _ in
                // "Chạm" người đầu bảng TOP 5: cùng đích với NavigationLink của dòng đó (EmpRows).
                guard DebugTap.shared.target == "nhan-vien", let e = top.first else { return }
                DebugTour.employeeTapped(filters)
                tourNav?.overviewPath.append(Route.staffDetail(.of(e, in: filters, period: period, hrTeam: applied?.id)))
            }
            #endif
        }

        if applied != nil { Color.clear.frame(height: 0).id("mua-lai-team") }
        // Mua lại & data
        Panel {
            HStack { Text("Mua lại & data").font(.title3.weight(.bold)); Spacer(); NavigationLink(value: Route.page("repurchase")) { Text("Mua lại ›").font(.footnote.weight(.semibold)).foregroundStyle(Color.brand) }.buttonStyle(.plain); NavigationLink(value: Route.page("batches")) { Text("Data ›").font(.footnote.weight(.semibold)).foregroundStyle(Color.brand) }.buttonStyle(.plain) }
            if applied != nil { Text("Mua lại & data chưa lọc theo team.").font(.caption).foregroundStyle(Color.inkSoft) }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                MiniCell(label: "Tỷ lệ mua lại (trọn đời)", value: repurchaseRate)
                MiniCell(label: "Doanh thu mua lại", value: repurchase.map { Fmt.shortMoney($0.summary.repurchase.net) } ?? "—")
                MiniCell(label: "Đơn mua lại", value: repurchase.map { Fmt.int($0.summary.repurchase.orders) } ?? "—")
                MiniCell(label: "Khách mua lại", value: repurchase.map { Fmt.int($0.summary.repurchase.customers) } ?? "—")
                MiniCell(label: "Data được cấp", value: batches == nil ? "—" : Fmt.int(batchTotals.0))
                MiniCell(label: "Đã mua", value: purchasedText)
            }
        }

        if applied != nil { Color.clear.frame(height: 0).id("khach-hang-team") }

        // Khách hàng
        if let c = customers, let g = c.groups, let seg = c.segments {
            Panel {
                HStack { Text("Khách hàng").font(.title3.weight(.bold)); Spacer(); NavigationLink(value: Route.page("customers")) { HStack(spacing: 2) { Text("Xem chi tiết"); Image(systemName: "chevron.right").font(.caption.weight(.bold)) }.font(.footnote.weight(.semibold)).foregroundStyle(Color.brand) }.buttonStyle(.plain) }
                if applied != nil { Text("Khách hàng chưa lọc theo team.").font(.caption).foregroundStyle(Color.inkSoft) }
                Text("Toàn bộ lịch sử · bấm một ô để mở trang tương ứng").font(.footnote).foregroundStyle(Color.inkSoft)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                    NavigationLink(value: Route.page("customers")) { MiniCell(label: "Tổng khách", value: Fmt.int(g["total"] ?? 0)) }
                    NavigationLink(value: Route.page("customers")) { MiniCell(label: "Hoạt động 30 ngày", value: Fmt.int(seg["active"] ?? 0)) }
                    NavigationLink(value: Route.page("customers")) { MiniCell(label: "Thân thiết", value: Fmt.int(seg["loyal"] ?? 0)) }
                    NavigationLink(value: Route.page("dormant")) { MiniCell(label: "Nguy cơ rời bỏ", value: Fmt.int(seg["risk"] ?? 0)) }
                    NavigationLink(value: Route.page("dormant")) { MiniCell(label: "Lâu chưa mua (>90)", value: Fmt.int(seg["dormant"] ?? 0)) }
                    NavigationLink(value: Route.page("customers")) { MiniCell(label: "Tổng chi tiêu", value: Fmt.shortMoney(seg["ltvTotal"] ?? 0)) }
                }.buttonStyle(.plain)
            }
            Panel {
                HStack { Text("Khách lâu chưa mua").font(.title3.weight(.bold)); Spacer(); NavigationLink(value: Route.page("dormant")) { HStack(spacing: 2) { Text("Xem chi tiết"); Image(systemName: "chevron.right").font(.caption.weight(.bold)) }.font(.footnote.weight(.semibold)).foregroundStyle(Color.brand) }.buttonStyle(.plain) }
                if applied != nil { Text("Khách hàng chưa lọc theo team.").font(.caption).foregroundStyle(Color.inkSoft) }
                Text("Theo số ngày từ lần mua thành công gần nhất tới hôm nay").font(.footnote).foregroundStyle(Color.inkSoft)
                let buckets = [("30-45", "30–45 ngày"), ("46-60", "46–60 ngày"), ("61-90", "61–90 ngày"), ("90+", "Trên 90 ngày")]
                let buyers = max(1, (g["total"] ?? 0) - (g["never"] ?? 0))
                let maxV = max(1, buckets.map { g[$0.0] ?? 0 }.max() ?? 1)
                ForEach(buckets, id: \.0) { k, label in
                    let n = g[k] ?? 0, net = c.groupNets?[k]
                    NavigationLink(value: Route.page("dormant")) {
                        VStack(alignment: .leading, spacing: 3) {
                            HStack { Text(label).font(.footnote.weight(.semibold)).foregroundStyle(Color.ink); Spacer(); VStack(alignment: .trailing, spacing: 0) { Text(Fmt.int(n)).font(.footnote.weight(.bold)).monospacedDigit(); Text("\(Fmt.pct0(n / buyers * 100)) khách đã mua").font(.caption).foregroundStyle(Color.inkSoft) } }
                            Bar(value: n / maxV, tint: dormantTone(k), height: 5)
                            Text(purchasedSummary(net: net, count: n)).font(.caption).foregroundStyle(Color.inkSoft)
                        }.padding(.vertical, 4).contentShape(.rect)
                    }.buttonStyle(.plain)
                }
            }
        }
        Color.clear.frame(height: 0)
            .task(id: key) { await load() }
            // Kéo để làm mới trang chứa khối này: 8 nguồn tải lại cùng lúc với số của trang.
            .pullToReload { await load(force: true) }
    }
    private var shiftName: String { ["morning": "ca sáng", "afternoon": "ca chiều", "evening": "ca tối", "day": "cả ngày"][shift?.shift ?? ""] ?? "ca hiện tại" }
    @ViewBuilder private func pipelinePills(_ total: [String: API.Bucket]) -> some View {
        NavigationLink(value: q("shipping", "confirmed", "Đang giao")) { StatusPill(name: "Đang giao \(Fmt.int(total["shipping"]?.orders ?? 0))", code: 2) }
        NavigationLink(value: q("returned", "confirmed", "Hoàn")) { StatusPill(name: "Hoàn \(Fmt.int(total["returned"]?.orders ?? 0))", code: 4) }
        NavigationLink(value: q("cancelled", "confirmed", "Hủy sau chốt")) { StatusPill(name: "Hủy \(Fmt.int(total["cancelled"]?.orders ?? 0))", code: 6) }
        NavigationLink(value: q("processing", "confirmed", "Chưa xuất kho")) { StatusPill(name: "Chưa xuất \(Fmt.int(total["processing"]?.orders ?? 0))", code: 0) }
    }
    private func byDay(_ s: [API.SeriesRow]) -> [(String, Double)] { var m: [String: Double] = [:]; for x in s { m[x.bucket, default: 0] += x.closedNet }; return m.keys.sorted().map { ($0, m[$0]!) } }
    private func byDayOrders(_ s: [API.SeriesRow]) -> [(String, Double)] { var m: [String: Double] = [:]; for x in s { m[x.bucket, default: 0] += x.closedOrders }; return m.keys.sorted().map { ($0, m[$0]!) } }
    /// 8 nguồn tải cùng lúc, nguồn nào về trước hiện trước. Nguồn lỗi: cùng bộ lọc thì giữ số đang hiện, bộ lọc mới thì bỏ số cũ;
    /// báo một dòng lỗi có nút Thử lại. force: kéo để làm mới / Thử lại; không force mà số chưa quá 60 giây thì không tải.
    @MainActor private func load(force: Bool = false) async {
        let k = key
        if !force, report != nil, dataKey == k, let age = fresh.age(k) { LoadTrace.skip("trung-tam", age: age); return }
        gen += 1; let g = gen
        loading = true; defer { if g == gen { loading = false } }
        let r = self.r, ids = posIds, tm = team, prod = product, unit = applied
        let today = VNDate.string(.now), trendStart = VNDate.string(VNDate.add(-29)), month = String(r.1.prefix(7))
        let wantCustomers = customers == nil
        let trace = LoadTrace("trung-tam", requests: wantCustomers ? 8 : 7)
        let newFilter = dataKey != k
        teamError = nil
        if newFilter { report = nil; trend = nil }
        var errors: [Error] = []
        func take<T>(_ res: Result<T, Error>?, _ set: (T?) -> Void) {
            switch res {
            case .success(let v)?: set(v)
            case .failure(let e)?: errors.append(e); if newFilter { set(nil) }
            case nil: break
            }
        }
        enum Part: @unchecked Sendable {
            case report(Result<API.Overview, Error>?), shift(Result<API.Shift, Error>?), pipeline(Result<API.Pipeline, Error>?)
            case targets(Result<API.Targets, Error>?), trend(Result<API.Overview, Error>?), customers(Result<API.CustomerPage, Error>?)
            case repurchase(Result<API.Repurchase, Error>?), batches(Result<API.Batches, Error>?)
        }
        let current = await withTaskGroup(of: Part.self, returning: Bool.self) { group in
            group.addTask { .report(await attempt(true, trace) { try await API.overview(start: r.0, end: r.1, posIds: ids, team: tm, product: prod, hrTeam: unit?.id) }) }
            group.addTask { .shift(await attempt(true, trace) { try await API.shift(date: today, shift: "auto", posIds: ids, team: tm) }) }
            group.addTask { .pipeline(await attempt(true, trace) { try await API.pipeline(start: r.0, end: r.1, basis: "confirmed", posIds: ids, team: tm, product: prod) }) }
            group.addTask { .targets(await attempt(true, trace) { try await API.targets(month: month) }) }
            group.addTask { .trend(await attempt(true, trace) { try await API.overview(start: trendStart, end: today, posIds: ids, team: tm, compare: "none", product: prod, hrTeam: unit?.id) }) }
            group.addTask { .customers(await attempt(wantCustomers, trace) { try await API.customers(segment: "", sort: "spend", q: "", page: 1, size: 1) }) }
            group.addTask { .repurchase(await attempt(true, trace) { try await API.repurchase(start: r.0, end: r.1, posIds: ids, team: tm, product: prod) }) }
            group.addTask { .batches(await attempt(true, trace) { try await API.batches(start: r.0, end: r.1, posIds: ids, team: tm) }) }
            for await part in group {
                // Bị huỷ, có lần tải mới hơn hoặc đã đổi bộ lọc: bỏ cả lượt, không ghi đè.
                guard !Task.isCancelled, g == gen, k == key else { group.cancelAll(); return false }
                switch part {
                case .report(let x):
                    if case .failure(let e)? = x { teamError = HrUnit.serverMessage(e, applied: unit) }
                    take(x) { report = $0 }
                    if teamError != nil { report = nil; trend = nil }
                    #if DEBUG
                    if TeamTourStatus.enabled, let t = report?.current.total {
                        print("[TEAM] dept=\(tm) ap=\(unit == nil ? "khong" : "co") trang=tong-quan")
                        if unit != nil {
                            print("[TEAM] tq don-chot=\(Fmt.int(t.closedOrders)) dt=\(Fmt.shortMoney(t.closedNet)) tao-moi=\(Fmt.int(t.orders)) gttb=\(Fmt.shortMoney(t.averageOrder ?? 0)) giao=\(Fmt.int(t.groups["delivered"]?.orders ?? 0))")
                            TeamTourStatus.overviewReady = true
                        }
                        fflush(stdout)
                    }
                    #endif
                case .shift(let x): take(x) { shift = $0 }
                case .pipeline(let x): take(x) { pipeline = $0 }
                case .targets(let x): take(x) { targets = $0 }
                case .trend(let x): take(x) { trend = teamError == nil ? $0 : nil }
                case .customers(let x): take(x) { customers = $0 }
                case .repurchase(let x): take(x) { repurchase = $0 }
                case .batches(let x): take(x) { batches = $0 }
                }
            }
            return true
        }
        trace.end(cancelled: !current)
        guard current else { return }
        dataKey = k
        let texts = errors.compactMap { LoadError.text($0) }
        failCount = texts.count
        failText = texts.first
        if texts.isEmpty { fresh.stamp(k) } else { fresh.clear() }
    }
}

struct EmpRows: View {
    let rows: [API.EmployeeRow]; let tone: Color
    /// Bộ lọc của khối chứa bảng (kỳ, POS, bộ phận, nhóm đơn): chạm một người mở trang chi tiết của người đó với đúng bộ lọc này.
    let filters: OrderFilters
    let period: Period; let hrTeam: String?
    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, e in
                NavigationLink(value: Route.staffDetail(.of(e, in: filters, period: period, hrTeam: hrTeam))) {
                    RankRow(rank: i + 1, name: e.name ?? "NV", valueText: Fmt.pct(e.shownRate), fraction: min(1, (e.shownRate ?? 0) / 100), tint: tone, sub: e.rateFrac)
                        .padding(.vertical, 8).contentShape(.rect)
                }.buttonStyle(.plain)
            }
            if rows.isEmpty { Text("Chưa đủ dữ liệu (từ 10 đơn chia).").font(.footnote).foregroundStyle(Color.inkSoft) }
        }
    }
}

struct MiniCell: View {
    let label: String; let value: String
    var body: some View {
        StatCell(label: label, value: value)
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
            VStack(spacing: 0) { Text(center).font(.system(size: 16, weight: .bold, design: .rounded)).foregroundStyle(Color.ink); Text(label).font(.caption).foregroundStyle(Color.inkSoft) }
        }.frame(width: 110, height: 110)
        .onAppear { withAnimation(.spring(duration: 0.9, bounce: 0.05)) { shown = true } }
    }
}

extension PosBreakdown {
    static func color(_ id: String) -> Color {
        PosInfo.color(id)
    }
}
