import SwiftUI

/// Thanh dưới 5 mục (anh Vũ 10/10/2026): Tổng quan ở giữa và là mặc định (4 bộ phận Sale, CSKH, MKT, Vận đơn; chạm bộ phận
/// nào mở chi tiết bộ phận đó), hai bên là Trong ngày, Cảnh báo, Nhân sự, Thêm.
enum AppTab: Hashable { case today, alerts, overview, hr, more }

/// Tab đang mở và đường đi trong tab Tổng quan, để nút chuông ở thanh đầu chuyển sang tab Cảnh báo.
@Observable final class AppNav {
    var tab: AppTab = .overview
    var overviewPath: [Route] = []
    /// Cuộn tab Tổng quan tới một bảng (id = CompanyDept.rawValue); dùng cho lượt tự xem thử của bản Debug.
    var overviewScroll: String?
}

struct RootTabs: View {
    @Environment(\.scenePhase) private var phase
    @Environment(SatelliteCenter.self) private var satellites
    @Environment(SyncStatus.self) private var sync
    @Environment(AuthModel.self) private var auth
    @State private var nav = AppNav()
    @State private var alerts = AlertCenter()
    var body: some View {
        // Đổi "Cách tính" (ở app hoặc trên web) → revision tăng → các tab báo cáo dựng lại và tải số mới.
        let rev = MetricPrefs.shared.revision
        @Bindable var nav = nav
        TabView(selection: $nav.tab) {
            TodayHome().id(rev).tabItem { Label("Trong ngày", systemImage: "clock.fill") }.tag(AppTab.today)
            AlertsHome().tabItem { Label("Cảnh báo", systemImage: "bell.fill") }.badge(alerts.count(sync: sync)).tag(AppTab.alerts)
            HomeView().id(rev).tabItem { Label("Tổng quan", systemImage: "square.grid.2x2.fill") }.tag(AppTab.overview)
            // Huy hiệu: việc chờ của web nhân sự (yêu cầu thay đổi chờ duyệt…).
            HrTab().tabItem { Label("Nhân sự", systemImage: "person.3.fill") }.badge(satellites.badge).tag(AppTab.hr)
            MoreHome().tabItem { Label("Thêm", systemImage: "ellipsis.circle.fill") }.tag(AppTab.more)
        }
        .tint(.brand)
        .environment(nav)
        .environment(alerts)
        .task { await MetricPrefs.shared.load() }
        .task { await refreshBadges(maxAge: 0) }
        .onChange(of: phase) { _, p in if p == .active { Task { await MetricPrefs.shared.load(); await refreshBadges(maxAge: 60) } } }
        #if DEBUG
        .task { await DebugTour.run(nav: nav) }
        #endif
    }
    @MainActor private func refreshBadges(maxAge: TimeInterval) async {
        await sync.refresh()
        await alerts.refresh(maxAge: maxAge, canCare: auth.me?.canView("care") == true)
        await satellites.refresh(maxAge: maxAge)
    }
}

/// Việc cần xử lý ngay (tab Cảnh báo và số đỏ trên thanh dưới, chuông ở thanh đầu): đơn chờ xác nhận hôm nay,
/// POS lỗi / chậm đồng bộ, khách CSKH quá 20 ngày chưa ghi chú, cảnh báo trong ca.
@Observable final class AlertCenter {
    var unconfirmed: Double = 0
    var over20: Double = 0
    var callsToday: Double = 0
    var shift: API.Shift?
    var loaded = false
    var updatedAt: Date?
    @ObservationIgnored private var lastAt: Date?
    @ObservationIgnored private var canCare = false

    struct Item: Identifiable { let id: String; let icon: String; let tone: Tone; let title: String; let sub: String; let route: Route }

    /// Bỏ qua nếu vừa hỏi chưa quá maxAge giây (0 = hỏi ngay).
    @MainActor func refresh(maxAge: TimeInterval = 60, canCare: Bool) async {
        if let t = lastAt, Date.now.timeIntervalSince(t) < maxAge { return }
        lastAt = .now
        self.canCare = canCare
        let today = VNDate.string(.now)
        let o = try? await API.overview(start: today, end: today, compare: "none")
        let s = try? await API.shift(date: today, shift: "auto")
        let b: API.CskhBadge? = canCare ? (try? await API.cskhBadge()) : nil
        if let o { unconfirmed = o.current.total.groups["new"]?.orders ?? 0 }
        if let s { shift = s }
        if let b { over20 = b.over20; callsToday = b.callsToday } else if !canCare { over20 = 0 }
        loaded = true; updatedAt = .now
    }

    /// Cảnh báo trong ca mức cao (đỏ).
    var highShiftAlerts: Int { shift?.alerts.filter { $0.level == "high" }.count ?? 0 }

    func items(sync: SyncStatus) -> [Item] {
        var out: [Item] = []
        let today = VNDate.string(.now)
        if unconfirmed > 0 {
            out.append(Item(id: "unconfirmed", icon: "clock.badge.exclamationmark", tone: .red, title: "\(Fmt.int(unconfirmed)) đơn chờ xác nhận", sub: "Tạo hôm nay · cần xử lý gấp",
                            route: .orders(OrderQuery(start: today, end: today, group: "unconfirmed", basis: "created", title: "Chờ xác nhận"))))
        }
        for p in sync.pos where p.lastError != nil || sync.age(p) > 15 {
            out.append(Item(id: "sync-\(p.posId)", icon: "exclamationmark.triangle.fill", tone: .orange, title: "\(PosBreakdown.short[p.posId] ?? p.posId) \(p.lastError != nil ? "lỗi đồng bộ" : "đang chậm")",
                            sub: p.lastError ?? "Chưa đồng bộ \(sync.age(p)) phút · kiểm tra kết nối", route: .page("config")))
        }
        if canCare, over20 > 0 {
            out.append(Item(id: "over20", icon: "person.crop.circle.badge.exclamationmark", tone: .orange, title: "\(Fmt.int(over20)) khách quá 20 ngày chưa ghi chú",
                            sub: "CSKH · hôm nay đã ghi \(Fmt.int(callsToday)) cuộc gọi", route: .page("care")))
        }
        return out
    }
    /// Số đỏ trên tab Cảnh báo: việc cần xử lý + cảnh báo đỏ trong ca.
    func count(sync: SyncStatus) -> Int { items(sync: sync).count + highShiftAlerts }
}

/// Tab Trong ngày: ca đang chạy (đơn chốt theo giờ, chốt nóng, ai đang chậm).
struct TodayHome: View {
    var body: some View {
        NavigationStack {
            TabPage(tagline: "Theo dõi ca đang chạy") { ShiftView() }
                .appRoutes()
        }
    }
}

/// Tab Cảnh báo: việc cần xử lý ngay, cảnh báo trong ca, đồng bộ Pancake từng POS.
struct AlertsHome: View {
    @Environment(SyncStatus.self) private var sync
    @Environment(AlertCenter.self) private var alerts
    @Environment(AuthModel.self) private var auth
    var body: some View {
        NavigationStack {
            TabPage(tagline: "Việc bất thường cần xử lý ngay") {
                PageTitle(title: "Cảnh báo", subtitle: alerts.updatedAt.map { "Cập nhật lúc \($0.formatted(date: .omitted, time: .shortened))" } ?? "Đang kiểm tra…")
                let items = alerts.items(sync: sync)
                SectionHead(title: "Cần xử lý", count: items.isEmpty ? nil : items.count)
                if !alerts.loaded && items.isEmpty { ThinkingLoader() }
                else if items.isEmpty { Panel { Label("Không có việc khẩn cấp lúc này.", systemImage: "checkmark.circle.fill").font(.system(size: 13)).foregroundStyle(Color.good) } }
                ForEach(items) { a in
                    NavigationLink(value: a.route) {
                        HStack(spacing: 12) {
                            Image(systemName: a.icon).font(.system(size: 14, weight: .semibold)).foregroundStyle(a.tone.color).frame(width: 36, height: 36).background(a.tone.color.opacity(0.12), in: .rect(cornerRadius: 10))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(a.title).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink)
                                Text(a.sub).font(.system(size: 11)).foregroundStyle(Color.inkSoft).lineLimit(2)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft)
                        }
                        .padding(12).background(Color.card, in: .rect(cornerRadius: 12)).cardShadow()
                    }.buttonStyle(.plain)
                }
                SectionHead(title: "Trong ca", action: "Xem ca", route: .page("shift"), count: alerts.highShiftAlerts > 0 ? alerts.highShiftAlerts : nil).padding(.top, 6)
                Panel {
                    if let s = alerts.shift {
                        if s.alerts.isEmpty { Label("Không có cảnh báo trong ca.", systemImage: "checkmark.circle.fill").font(.system(size: 12)).foregroundStyle(Color.good) }
                        ForEach(Array(s.alerts.enumerated()), id: \.offset) { _, a in
                            HStack(alignment: .top, spacing: 8) {
                                Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 12)).foregroundStyle(a.level == "high" ? Color.bad : Color.warn)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(a.title).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink)
                                    Text(a.detail).font(.system(size: 11)).foregroundStyle(Color.inkSoft)
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(8).frame(maxWidth: .infinity, alignment: .leading)
                            .background((a.level == "high" ? Color.bad : Color.warn).opacity(0.08), in: .rect(cornerRadius: 8))
                        }
                    } else if alerts.loaded {
                        Text("Chưa đọc được số trong ca.").font(.system(size: 12)).foregroundStyle(Color.inkSoft)
                    } else { Skeleton(height: 60) }
                }
                SectionHead(title: "Đồng bộ Pancake").padding(.top, 6)
                Panel {
                    ForEach(PosBreakdown.order, id: \.self) { id in
                        let p = sync.pos.first { $0.posId == id }
                        let tone: Color = p == nil ? .inkSoft : p?.lastError != nil ? .bad : sync.age(p!) > 15 ? .warn : .good
                        HStack(spacing: 8) {
                            PosBadge(id: id, size: 20)
                            VStack(alignment: .leading, spacing: 0) {
                                Text(PosBreakdown.names[id] ?? id).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink)
                                Text(p?.lastError ?? "đồng bộ lúc \(Fmt.dateTime(p?.lastSyncAt))").font(.system(size: 10)).foregroundStyle(p?.lastError != nil ? Color.bad : Color.inkSoft).lineLimit(1)
                            }
                            Spacer()
                            Circle().fill(tone).frame(width: 8, height: 8)
                            Text(p.map { sync.age($0) < 60 ? "\(sync.age($0)) phút" : "\(sync.age($0) / 60) giờ" } ?? "—").font(.system(size: 10)).foregroundStyle(tone)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
            .appRoutes()
            .refreshable { await sync.refresh(); await alerts.refresh(maxAge: 0, canCare: auth.me?.canView("care") == true) }
            .task { await alerts.refresh(maxAge: 30, canCare: auth.me?.canView("care") == true) }
        }
    }
}

/// Tab Nhân sự: phần Nhân sự của web nhân sự (quân số, hồ sơ, sơ đồ, duyệt thay đổi), chỉ chủ hệ thống / giám đốc.
struct HrTab: View {
    @Environment(AuthModel.self) private var auth
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                AppHeader(tagline: "Con người là gốc của tăng trưởng")
                if auth.me?.canView("people") ?? false {
                    HRHome()
                } else {
                    ContentUnavailableView("Chưa được cấp quyền", systemImage: "lock.fill", description: Text("Phần Nhân sự chỉ dành cho chủ hệ thống và giám đốc."))
                        .frame(maxHeight: .infinity)
                }
            }
            .background(Color.cream)
            .toolbar(.hidden, for: .navigationBar)
            .appRoutes()
        }
    }
}

struct WebPage: Identifiable, Hashable { let id: String; let title: String; let icon: String; let path: String }

let CSKH_PAGES = [
    WebPage(id: "cskh-overview", title: "Tổng quan", icon: "chart.line.uptrend.xyaxis", path: "/?view=cskh-overview"),
    WebPage(id: "calls", title: "Cuộc gọi CSKH", icon: "phone.fill", path: "/?view=calls"),
    WebPage(id: "care", title: "Khách theo nhân viên", icon: "person.2.fill", path: "/?view=care"),
    WebPage(id: "repurchase", title: "Mua lại & Upsell", icon: "arrow.triangle.2.circlepath", path: "/?view=repurchase"),
    WebPage(id: "dormant", title: "Khách lâu chưa mua", icon: "moon.zzz.fill", path: "/?view=dormant"),
    WebPage(id: "cskh-kpi", title: "KPI CSKH", icon: "target", path: "/?view=cskh-kpi"),
]
// Trang Sale (mở từ bảng Sale ở Tổng quan): Nhân viên trước; Trong ca cũng là tab Trong ngày ở thanh dưới.
let SALE_PAGES = [
    WebPage(id: "compare", title: "Nhân viên", icon: "person.3.fill", path: "/?view=compare"),
    WebPage(id: "batches", title: "Data", icon: "tray.full.fill", path: "/?view=batches"),
    WebPage(id: "pipeline", title: "Đơn hàng", icon: "shippingbox.fill", path: "/?view=pipeline"),
    WebPage(id: "shift", title: "Trong ca", icon: "clock.fill", path: "/?view=shift"),
]
let MORE_GROUPS: [(String, [WebPage])] = [
    ("Khách hàng & báo cáo", [
        WebPage(id: "customers", title: "Hồ sơ khách hàng", icon: "person.text.rectangle.fill", path: "/?view=customers"),
        WebPage(id: "monthly", title: "Báo cáo cuối tháng", icon: "calendar", path: "/?view=monthly"),
        WebPage(id: "custom", title: "Báo cáo tùy chỉnh", icon: "slider.horizontal.3", path: "/?view=custom"),
        WebPage(id: "raw-orders", title: "Đơn nguồn Pancake POS", icon: "cylinder.split.1x2.fill", path: "/?view=raw-orders"),
    ]),
    ("Hệ thống", [
        WebPage(id: "config", title: "Cấu hình & kết nối", icon: "gearshape.2.fill", path: "/?view=config"),
        WebPage(id: "audit", title: "Nhật ký hoạt động", icon: "list.bullet.clipboard.fill", path: "/?view=audit"),
        WebPage(id: "metrics", title: "Cách tính", icon: "ic_m_rate", path: "/?view=metrics"),
        WebPage(id: "security", title: "Bảo mật tài khoản", icon: "lock.shield.fill", path: "/?view=security"),
    ]),
]
let ALL_PAGES: [WebPage] = CSKH_PAGES + SALE_PAGES + MORE_GROUPS.flatMap(\.1)

/// Mọi trang đều là bản riêng trong app (không mở web); trang chưa có bản riêng thì báo rõ.
struct PageDestination: View {
    let p: WebPage
    var body: some View {
        Group {
            switch p.id {
            case "cskh-overview": CskhOverviewView()
            case "pipeline": PipelineView()
            case "recruit": RecruitView()
            case "care": CareView()
            case "calls": CallsView()
            case "repurchase": RepurchaseView()
            case "dormant": DormantView()
            case "compare": CompareView()
            case "batches": BatchesView()
            case "raw-orders": RawOrdersView()
            case "monthly": MonthlyView()
            case "custom": CustomReportView()
            case "cskh-kpi": KpiView()
            case "audit": AuditView()
            case "security": SecurityView()
            case "metrics": MetricSettingsView()
            case "config": ConfigView()
            case "customers": CustomerSearchView()
            case "shift": ScrollView { ShiftView().padding(16) }.navigationTitle("Điều hành trong ca").navigationBarTitleDisplayMode(.inline)
            default: MissingPage(title: p.title)
            }
        }.brandNav()
    }
}

/// Dải chip chuyển trang con trong một tab (như thanh dưới của từng bộ ảnh); badges: số đỏ trên chip theo id trang.
struct SubNav: View {
    @Binding var selection: String; let pages: [WebPage]; var badges: [String: Int] = [:]
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) { ForEach(pages) { p in FilterChip(label: p.title, on: selection == p.id, badge: badges[p.id]) { withAnimation(.snappy(duration: 0.25)) { selection = p.id } } } }
        }
    }
}

/// Trang chưa có bản riêng trong app: báo rõ thay vì mở web.
struct MissingPage: View {
    let title: String; var message = "Xem trang này trên web tonghopposmegatech.io.vn bằng máy tính."
    var body: some View {
        ContentUnavailableView("Trang này chưa có trong app", systemImage: "iphone.slash", description: Text(message))
            .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: Thêm

struct MoreHome: View {
    @Environment(AuthModel.self) private var auth
    @Environment(SatelliteCenter.self) private var satellites
    var body: some View {
        NavigationStack {
            TabPage(tagline: "Vận hành thông minh · Trải nghiệm khác biệt") {
                if let me = auth.me {
                    Panel {
                        HStack(spacing: 12) {
                            Avatar(name: me.displayName, size: 48)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(me.displayName).font(.system(size: 16, weight: .bold)).foregroundStyle(Color.ink)
                                Text(me.title?.isEmpty == false ? me.title! : me.email).font(.system(size: 12)).foregroundStyle(Color.inkSoft)
                            }
                            Spacer()
                            Tag(text: me.role == "owner" ? "Chủ hệ thống" : me.role == "director" ? "Giám đốc" : me.role == "lead" ? "Trưởng nhóm" : "Nhân viên", tone: .green)
                        }
                    }
                    ScanLoginRow()
                    DeptLinks(me: me)
                    SatelliteSection(me: me)
                    ForEach(MORE_GROUPS, id: \.0) { title, pages in
                        let allowed = pages.filter { me.canView($0.id) }
                        if !allowed.isEmpty {
                            Text(title).font(.system(size: 13, weight: .bold)).foregroundStyle(Color.inkSoft).padding(.top, 4)
                            VStack(spacing: 0) {
                                ForEach(Array(allowed.enumerated()), id: \.element.id) { i, p in
                                    NavigationLink(value: Route.web(p)) {
                                        HStack(spacing: 12) {
                                            MetricIcon(p.icon, size: 14).foregroundStyle(Color.brand).frame(width: 34, height: 34).background(Color.brandSoft, in: .rect(cornerRadius: 9))
                                            Text(p.title).font(.system(size: 14, weight: .medium)).foregroundStyle(Color.ink)
                                            Spacer(); Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft)
                                        }.padding(12).contentShape(.rect)
                                    }.buttonStyle(.plain)
                                    if i < allowed.count - 1 { Divider().padding(.leading, 58) }
                                }
                            }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                        }
                    }
                }
                PrimaryButton(title: "Đăng xuất", icon: "rectangle.portrait.and.arrow.right", tint: .bad) { Task { await auth.logout() } }.padding(.top, 8)
                Text("Phiên bản \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—") · MEGATECH POS Operations").font(.system(size: 10)).foregroundStyle(Color.inkSoft).frame(maxWidth: .infinity)
            }
            .appRoutes()
            // Mở tab Thêm (hoặc quay lại từ trang con): hỏi lại trạng thái web vệ tinh nếu đã quá 10 giây.
            .task { await satellites.refresh(maxAge: 10) }
        }
    }
}

/// Mục "Bộ phận" ở tab Thêm: mở thẳng trang chi tiết từng bộ phận (bộ phận không còn tab riêng) và Tổng quan theo từng POS.
struct DeptLinks: View {
    let me: API.Me
    private struct Row: Identifiable { let id: String; let title: String; let icon: String; let tint: Color; let route: Route }
    private var rows: [Row] {
        var r: [Row] = []
        if SALE_PAGES.contains(where: { me.canView($0.id) }) { r.append(Row(id: "sale", title: "Sale", icon: CompanyDept.sale.icon, tint: CompanyDept.sale.tint, route: .dept(.sale))) }
        if CSKH_PAGES.contains(where: { me.canView($0.id) }) { r.append(Row(id: "cskh", title: "CSKH", icon: CompanyDept.cskh.icon, tint: CompanyDept.cskh.tint, route: .dept(.cskh))) }
        if me.canView("marketing") { r.append(Row(id: "mkt", title: "Marketing", icon: CompanyDept.mkt.icon, tint: CompanyDept.mkt.tint, route: .dept(.mkt))) }
        if me.canView("van-don") { r.append(Row(id: "vandon", title: "Vận đơn", icon: CompanyDept.vandon.icon, tint: CompanyDept.vandon.tint, route: .dept(.vandon))) }
        if me.canView("overview") { r.append(Row(id: "pos", title: "Tổng quan theo từng POS", icon: "building.2.fill", tint: .brand, route: .overview)) }
        return r
    }
    var body: some View {
        let list = rows
        if !list.isEmpty {
            Text("Bộ phận").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.inkSoft).padding(.top, 4)
            VStack(spacing: 0) {
                ForEach(Array(list.enumerated()), id: \.element.id) { i, x in
                    NavigationLink(value: x.route) {
                        HStack(spacing: 12) {
                            Image(systemName: x.icon).font(.system(size: 14, weight: .semibold)).foregroundStyle(x.tint).frame(width: 34, height: 34).background(x.tint.opacity(0.13), in: .rect(cornerRadius: 9))
                            Text(x.title).font(.system(size: 14, weight: .medium)).foregroundStyle(Color.ink)
                            Spacer(); Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft)
                        }.padding(12).contentShape(.rect)
                    }.buttonStyle(.plain)
                    if i < list.count - 1 { Divider().padding(.leading, 58) }
                }
            }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
        }
    }
}

/// Mục "Web vệ tinh" ở tab Thêm: mỗi web vệ tinh một dòng có chấm trạng thái (xanh: kết nối được, đỏ: mất kết nối),
/// số việc chờ và mô tả; chạm mở màn riêng trong app. Module app chưa có màn riêng thì báo cần cập nhật app.
struct SatelliteSection: View {
    let me: API.Me
    @Environment(SatelliteCenter.self) private var center
    /// Nhân sự đã có tab riêng ở thanh dưới (10/10/2026) nên không lặp ở đây; mục này chỉ hiện các web vệ tinh khác.
    private var rows: [API.SatModule] { center.modules.filter { $0.id != "hr" } }
    var body: some View {
        let list = rows
        if !list.isEmpty {
            Text("Web vệ tinh").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.inkSoft).padding(.top, 4)
            VStack(spacing: 0) {
                ForEach(Array(list.enumerated()), id: \.element.id) { i, m in
                    if SatelliteCenter.known.contains(m.id) {
                        NavigationLink(value: Route.satellite(m.id)) { row(m, known: true) }.buttonStyle(.plain)
                    } else {
                        row(m, known: false)
                    }
                    if i < list.count - 1 { Divider().padding(.leading, 58) }
                }
            }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
        }
    }
    private func row(_ m: API.SatModule, known: Bool) -> some View {
        let dot: Color = m.status == nil ? .gray : m.down ? .bad : .good
        let sub: String = !known ? "Cần cập nhật app để dùng" : m.down ? "Mất kết nối web vệ tinh, thử lại sau" : (m.subtitle ?? "")
        return HStack(spacing: 12) {
            MetricIcon(m.icon ?? "square.grid.2x2.fill", size: 14).foregroundStyle(Color.brand).frame(width: 34, height: 34).background(Color.brandSoft, in: .rect(cornerRadius: 9))
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(m.title).font(.system(size: 14, weight: .medium)).foregroundStyle(Color.ink)
                    Circle().fill(dot).frame(width: 7, height: 7)
                }
                if !sub.isEmpty { Text(sub).font(.system(size: 10)).foregroundStyle(known && m.down ? Color.bad : Color.inkSoft).lineLimit(1) }
            }
            Spacer()
            if known, let b = m.badge, b > 0 { Text("\(b)").font(.system(size: 10, weight: .bold)).foregroundStyle(.white).padding(.horizontal, 6).padding(.vertical, 2).background(Color.bad, in: .capsule) }
            if known { Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft) }
        }
        .padding(12).contentShape(.rect).opacity(known ? 1 : 0.55)
    }
}

/// Màn riêng của từng web vệ tinh (id theo /api/app/modules).
struct SatelliteDestination: View {
    let id: String
    var body: some View {
        switch id {
        case "hr": HRHome()
        default: MissingPage(title: "Web vệ tinh", message: "Cần cập nhật app để dùng phần này.").brandNav()
        }
    }
}

#if DEBUG
/// Bản Debug: MEGATECH_TOUR=1 tự đi qua tab Tổng quan (cuộn các bảng, mở trang bộ phận) rồi các tab khác, để workflow
/// "iOS preview" quay video trên máy ảo (máy ảo không chạm được).
enum DebugTour {
    @MainActor static func run(nav: AppNav) async {
        guard ProcessInfo.processInfo.environment["MEGATECH_TOUR"] == "1" else { return }
        let steps: [(Double, () -> Void)] = [
            (7, { nav.overviewScroll = CompanyDept.mkt.rawValue }),
            (5, { nav.overviewScroll = CompanyDept.vandon.rawValue }),
            (5, { nav.overviewPath = [.dept(.vandon)] }),
            (8, { nav.overviewPath = [] }),
            (2, { nav.overviewPath = [.dept(.sale)] }),
            (6, { nav.overviewPath = [.dept(.cskh)] }),
            (6, { nav.overviewPath = []; nav.tab = .alerts }),
            (7, { nav.tab = .today }),
            (7, { nav.tab = .hr }),
            (8, { nav.tab = .more }),
            (6, { nav.tab = .overview; nav.overviewScroll = CompanyDept.sale.rawValue }),
        ]
        for (wait, act) in steps {
            try? await Task.sleep(for: .seconds(wait))
            if Task.isCancelled { return }
            withAnimation(.snappy(duration: 0.35)) { act() }
        }
    }
}
#endif
