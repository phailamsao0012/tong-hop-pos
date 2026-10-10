import SwiftUI

/// Tab Trang chủ (ngoài cùng bên trái, anh Vũ 10/10/2026): như trang chủ app ngân hàng / app bán hàng lớn, chỉ "hôm nay":
/// lời chào, số chính hôm nay của cả công ty (chạm mở chi tiết), việc cần xử lý (mở trang Thông báo), lối tắt chức năng,
/// ca đang chạy. Số theo kỳ của từng bộ phận nằm ở Tổng quan (giữa), không lặp ở đây.
struct HomeFeed: View {
    @Environment(AuthModel.self) private var auth
    @Environment(SyncStatus.self) private var sync
    @Environment(AlertCenter.self) private var alerts
    @Environment(AppNav.self) private var nav
    @State private var today: API.Overview?
    @State private var week: API.Overview?
    @State private var error: String?
    @State private var loading = false
    /// Ẩn số tiền như app ngân hàng (con mắt trên thẻ), nhớ trên máy.
    @AppStorage("thp_hide_money") private var hideMoney = false

    var body: some View {
        @Bindable var nav = nav
        NavigationStack(path: $nav.homePath) {
            TabPage(tagline: "Hôm nay của công ty") {
                greeting
                hero
                todo
                if let me = auth.me { HomeShortcuts(me: me) }
                shiftCard
            }
            .appRoutes()
            .refreshable { await reload(force: true) }
            .task { await load() }
        }
    }

    // MARK: Lời chào

    private var greeting: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 2) {
                Text(Self.hello()).font(.system(size: 13)).foregroundStyle(Color.inkSoft)
                Text(auth.me?.displayName ?? "MEGATECH").font(.system(size: 22, weight: .bold)).foregroundStyle(Color.ink).lineLimit(1)
            }
            Spacer()
            Text(Self.weekday()).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand)
                .padding(.horizontal, 10).padding(.vertical, 6).background(Color.brandSoft, in: .capsule)
        }
    }
    static func hello(_ d: Date = .now) -> String {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = VNDate.tz
        let h = cal.component(.hour, from: d)
        return h < 11 ? "Chào buổi sáng," : h < 13 ? "Chào buổi trưa," : h < 18 ? "Chào buổi chiều," : "Chào buổi tối,"
    }
    /// "Thứ Sáu, 10/10"
    static func weekday(_ d: Date = .now) -> String {
        let f = DateFormatter(); f.timeZone = VNDate.tz; f.locale = Locale(identifier: "vi_VN"); f.dateFormat = "EEEE, d/M"
        let s = f.string(from: d)
        return s.prefix(1).uppercased() + s.dropFirst()
    }

    // MARK: Thẻ số chính hôm nay

    private var hero: some View {
        let t = today?.current.total
        let prev = today?.compare?.total
        // Chạm thẻ mở chi tiết số hôm nay của cả công ty ngay trong tab này; nút con mắt bên trong vẫn bấm riêng được.
        return VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 6) {
                    Text("Doanh thu hôm nay").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white.opacity(0.85))
                    Button { withAnimation(.snappy(duration: 0.2)) { hideMoney.toggle() } } label: {
                        Image(systemName: hideMoney ? "eye.slash.fill" : "eye.fill").font(.system(size: 12)).foregroundStyle(.white.opacity(0.75)).frame(width: 28, height: 22).contentShape(.rect)
                    }.buttonStyle(.plain).accessibilityLabel(hideMoney ? "Hiện số tiền" : "Ẩn số tiền")
                    Spacer()
                    HStack(spacing: 3) { Text("Chi tiết"); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }
                        .font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.lime)
                }
                HStack(alignment: .bottom, spacing: 10) {
                    VStack(alignment: .leading, spacing: 6) {
                        if let t {
                            Text(hideMoney ? "••••••••" : Fmt.vnd(t.closedNet)).font(.system(size: 30, weight: .bold, design: .rounded)).foregroundStyle(.white)
                                .monospacedDigit().minimumScaleFactor(0.6).lineLimit(1).contentTransition(.numericText())
                            if let d = Fmt.delta(t.closedNet, prev?.closedNet) {
                                let down = d.hasPrefix("-")
                                HStack(spacing: 4) {
                                    Image(systemName: down ? "arrowtriangle.down.fill" : "arrowtriangle.up.fill").font(.system(size: 8))
                                    Text("\(d) so với cùng giờ hôm qua").font(.system(size: 11, weight: .semibold))
                                }
                                .foregroundStyle(down ? Color(red: 1, green: 0.62, blue: 0.6) : Color.lime)
                                .padding(.horizontal, 8).padding(.vertical, 4).background(.white.opacity(0.1), in: .capsule)
                            } else {
                                Text("Chưa có số cùng giờ hôm qua để so").font(.system(size: 11)).foregroundStyle(.white.opacity(0.7))
                            }
                        } else if let error {
                            Label(error, systemImage: "wifi.exclamationmark").font(.system(size: 12)).foregroundStyle(.white.opacity(0.85)).lineLimit(2)
                        } else {
                            RoundedRectangle(cornerRadius: 8).fill(.white.opacity(0.14)).frame(width: 190, height: 34)
                            RoundedRectangle(cornerRadius: 8).fill(.white.opacity(0.1)).frame(width: 150, height: 18)
                        }
                    }
                    Spacer(minLength: 0)
                    if let s = week?.current.series, !s.isEmpty { HeroSpark(points: Self.byDay(s)).frame(width: 96, height: 46) }
                }
                Rectangle().fill(.white.opacity(0.12)).frame(height: 1)
                HStack(spacing: 0) {
                    heroStat("Đơn chốt", t.map { Fmt.int($0.closedOrders) })
                    heroStat("Tỷ lệ chốt", t.map { Fmt.pct($0.shownRate) })
                    heroStat("Chờ xác nhận", t.map { Fmt.int($0.groups["new"]?.orders ?? 0) }, alert: (t?.groups["new"]?.orders ?? 0) > 0)
                }
            }
            .padding(16)
            .background(LinearGradient(colors: [Color.brandDark, Color.brandDeep], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(alignment: .topTrailing) { Circle().fill(Color.lime.opacity(0.08)).frame(width: 180, height: 180).offset(x: 60, y: -70).allowsHitTesting(false) }
            .clipShape(.rect(cornerRadius: 20))
            .shadow(color: Color.brandDeep.opacity(0.25), radius: 12, y: 6)
            .environment(\.thinking, loading && today != nil)
            .contentShape(.rect(cornerRadius: 20))
            .onTapGesture { nav.homePath.append(.overview) }
            .accessibilityAddTraits(.isButton)
    }
    private func heroStat(_ label: String, _ value: String?, alert: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.system(size: 10)).foregroundStyle(.white.opacity(0.7))
            Text(value ?? "—").font(.system(size: 15, weight: .bold, design: .rounded)).foregroundStyle(alert ? Color.lime : .white).monospacedDigit()
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private static func byDay(_ s: [API.SeriesRow]) -> [Double] { var m: [String: Double] = [:]; for r in s { m[r.bucket, default: 0] += r.closedNet }; return m.keys.sorted().map { m[$0]! } }

    // MARK: Việc cần xử lý

    @ViewBuilder private var todo: some View {
        let items = alerts.items(sync: sync)
        HStack {
            Text("Cần xử lý").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink)
            if !items.isEmpty { Text("\(items.count)").font(.system(size: 10, weight: .bold)).foregroundStyle(.white).padding(.horizontal, 6).padding(.vertical, 2).background(Color.bad, in: .capsule) }
            Spacer()
            NavigationLink(value: Route.alerts) {
                HStack(spacing: 2) { Text("Xem tất cả"); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }.font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand)
            }.buttonStyle(.plain)
        }
        if !alerts.loaded && items.isEmpty { Skeleton(height: 56) }
        else if items.isEmpty { AlertsEmpty(failed: alerts.failed) }
        ForEach(items.prefix(3)) { AlertLink(item: $0) }
    }

    // MARK: Ca đang chạy

    @ViewBuilder private var shiftCard: some View {
        if auth.me?.canView("shift") ?? false {
            SectionHead(title: "Ca đang chạy", action: "Xem ca", route: .page("shift")).padding(.top, 4)
            if let s = alerts.shift {
                NavigationLink(value: Route.page("shift")) {
                    Panel {
                        HStack(spacing: 0) {
                            shiftStat("Số đã nhận", Fmt.int(s.total.received), Fmt.delta(s.total.received, s.yesterday.received))
                            shiftStat("Số đã chốt", Fmt.int(s.total.closed), Fmt.delta(s.total.closed, s.yesterday.closed))
                            shiftStat("Chốt nóng", Fmt.pct(s.total.rate), nil)
                        }
                        let top = Array(s.staff.sorted { $0.closed > $1.closed }.prefix(3))
                        if !top.isEmpty {
                            Divider().padding(.vertical, 2)
                            let maxC = max(1, top.map(\.closed).max() ?? 1)
                            ForEach(Array(top.enumerated()), id: \.element.id) { i, p in
                                HStack(spacing: 8) {
                                    Medal(rank: i + 1)
                                    Text(p.name).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1).frame(width: 120, alignment: .leading)
                                    GeometryReader { g in
                                        Capsule().fill(Color.good.opacity(0.15)).overlay(alignment: .leading) { Capsule().fill(Color.good).frame(width: max(4, g.size.width * p.closed / maxC)) }
                                    }.frame(height: 6)
                                    Text("\(Fmt.int(p.closed)) chốt").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.inkSoft).monospacedDigit()
                                }
                            }
                        }
                    }
                }.buttonStyle(.plain)
            } else if alerts.loaded {
                Panel { Text("Chưa đọc được số trong ca.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) }
            } else { Skeleton(height: 90) }
        }
    }
    private func shiftStat(_ label: String, _ value: String, _ delta: String?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.system(size: 10)).foregroundStyle(Color.inkSoft)
            Text(value).font(.system(size: 17, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).monospacedDigit()
            if let delta { Text("\(delta) hôm qua").font(.system(size: 9, weight: .semibold)).foregroundStyle(delta.hasPrefix("-") ? Color.bad : Color.good) }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Tải số

    @MainActor private func load() async {
        loading = true; defer { loading = false }
        let d = VNDate.string(.now)
        do { today = try await API.overview(start: d, end: d); error = nil }
        catch { if !Task.isCancelled { self.error = error.localizedDescription } }
        week = try? await API.overview(start: VNDate.string(VNDate.add(-6)), end: d, compare: "none")
    }
    @MainActor private func reload(force: Bool) async {
        await load()
        await sync.refresh()
        await alerts.refresh(maxAge: force ? 0 : 60, me: auth.me)
    }
}

/// Một dòng việc cần xử lý, chạm được khi người dùng mở được trang đích.
struct AlertLink: View {
    let item: AlertCenter.Item
    var body: some View {
        if let r = item.route { NavigationLink(value: r) { AlertRow(item: item) }.buttonStyle(.plain) }
        else { AlertRow(item: item) }
    }
}

/// Không có dòng nào: báo không có việc khẩn cấp, hoặc báo chưa tải được (không báo yên khi mất mạng).
struct AlertsEmpty: View {
    let failed: Bool
    var body: some View {
        Panel {
            if failed { Label("Chưa tải được việc cần xử lý. Kéo xuống để thử lại.", systemImage: "wifi.exclamationmark").font(.system(size: 13)).foregroundStyle(Color.warn) }
            else { Label("Không có việc khẩn cấp lúc này.", systemImage: "checkmark.circle.fill").font(.system(size: 13)).foregroundStyle(Color.good) }
        }
    }
}

/// Một dòng việc cần xử lý (Trang chủ và trang Thông báo).
struct AlertRow: View {
    let item: AlertCenter.Item
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: item.icon).font(.system(size: 14, weight: .semibold)).foregroundStyle(item.tone.color).frame(width: 36, height: 36).background(item.tone.color.opacity(0.12), in: .rect(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink)
                Text(item.sub).font(.system(size: 11)).foregroundStyle(Color.inkSoft).lineLimit(2)
            }
            Spacer()
            if item.route != nil { Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft) }
        }
        .padding(12).background(Color.card, in: .rect(cornerRadius: 12)).cardShadow()
    }
}

/// Đường 7 ngày trên thẻ xanh đậm (màu chanh).
struct HeroSpark: View {
    let points: [Double]
    @State private var shown = false
    var body: some View {
        GeometryReader { g in
            let maxV = max(1, points.max() ?? 1), n = max(1, points.count - 1)
            let pts = points.enumerated().map { i, v in CGPoint(x: g.size.width * CGFloat(i) / CGFloat(n), y: g.size.height * (1 - v / maxV) * 0.85 + 4) }
            if pts.count > 1 {
                Path { p in p.move(to: CGPoint(x: 0, y: g.size.height)); for q in pts { p.addLine(to: q) }; p.addLine(to: CGPoint(x: g.size.width, y: g.size.height)) }
                    .fill(LinearGradient(colors: [Color.lime.opacity(0.28), .clear], startPoint: .top, endPoint: .bottom))
                Path { p in p.move(to: pts[0]); for q in pts.dropFirst() { p.addLine(to: q) } }
                    .trim(from: 0, to: shown ? 1 : 0).stroke(Color.lime, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                Circle().fill(Color.lime).frame(width: 6, height: 6).position(pts.last!).opacity(shown ? 1 : 0)
            }
        }
        .accessibilityLabel("Doanh thu 7 ngày gần nhất")
        .onAppear { withAnimation(.easeOut(duration: 0.8)) { shown = true } }
    }
}

/// Lối tắt chức năng kiểu app ngân hàng: lưới 4 cột, icon trong ô màu, theo quyền của người dùng.
struct HomeShortcuts: View {
    let me: API.Me
    struct Item: Identifiable { let id: String; let title: String; let icon: String; let tint: Color; let route: Route }
    /// Đơn tạo trong ngày đang ở trạng thái Mới (nhóm "new"), cùng nhóm với số đơn mới ở mục Cần xử lý.
    static func newOrders(_ day: String) -> OrderQuery { OrderQuery(start: day, end: day, group: "new", basis: "created", title: "Đơn mới chưa chốt") }
    private var items: [Item] {
        let d = VNDate.string(.now)
        var r: [Item] = []
        if me.canView("shift") { r.append(Item(id: "shift", title: "Trong ca", icon: "clock.fill", tint: .good, route: .page("shift"))) }
        if me.canView("raw-orders") { r.append(Item(id: "new", title: "Đơn mới chưa chốt", icon: "hourglass", tint: .orange, route: .orders(Self.newOrders(d)))) }
        if me.canView("customers") { r.append(Item(id: "customers", title: "Tra khách", icon: "person.text.rectangle.fill", tint: .blue, route: .page("customers"))) }
        if me.canView("overview") { r.append(Item(id: "pos", title: "Theo từng POS", icon: "building.2.fill", tint: .brand, route: .overview)) }
        if me.canView("calls") { r.append(Item(id: "calls", title: "Cuộc gọi CSKH", icon: "phone.fill", tint: .teal, route: .dept(.cskh, page: "calls"))) }
        if me.canView("batches") { r.append(Item(id: "batches", title: "Data Sale", icon: "tray.full.fill", tint: .good, route: .dept(.sale, page: "batches"))) }
        if me.canView("monthly") { r.append(Item(id: "monthly", title: "Báo cáo tháng", icon: "calendar", tint: .purple, route: .page("monthly"))) }
        if me.canView("people") { r.append(Item(id: "approvals", title: "Duyệt nhân sự", icon: "checkmark.seal.fill", tint: .warn, route: .hr("approvals"))) }
        return Array(r.prefix(8))
    }
    var body: some View {
        let list = items
        if !list.isEmpty {
            Text("Lối tắt").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink).padding(.top, 4)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 14) {
                ForEach(list) { x in
                    NavigationLink(value: x.route) {
                        VStack(spacing: 6) {
                            Image(systemName: x.icon).font(.system(size: 19, weight: .semibold)).foregroundStyle(x.tint)
                                .frame(width: 52, height: 52).background(x.tint.opacity(0.12), in: .rect(cornerRadius: 16))
                            Text(x.title).font(.system(size: 11, weight: .medium)).foregroundStyle(Color.ink).multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.85)
                                .frame(height: 28, alignment: .top)
                        }.frame(maxWidth: .infinity).contentShape(.rect)
                    }.buttonStyle(.plain)
                }
            }
            .padding(.vertical, 14).padding(.horizontal, 8)
            .background(Color.card, in: .rect(cornerRadius: 16)).cardShadow()
        }
    }
}
