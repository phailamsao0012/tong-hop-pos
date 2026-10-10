import SwiftUI

/// Thanh dưới 5 mục (anh Vũ 10/10/2026, học cách xếp của app lớn): Trang chủ ngoài cùng bên trái (việc cần xử lý hôm nay, lối tắt),
/// Đơn hàng (đơn mọi POS theo từng bước), Tổng quan ở giữa và là mặc định (4 bộ phận; chạm bộ phận nào mở chi tiết bộ phận đó),
/// Phòng ban (danh bạ các phòng), Thêm ngoài cùng bên phải (tiện ích, Cài đặt). Thông báo ở nút chuông thanh đầu, không chiếm ô.
enum AppTab: Hashable { case home, orders, overview, depts, more }

/// Tab đang mở và đường đi trong từng tab (mỗi tab giữ trang đang xem của riêng nó).
@Observable final class AppNav {
    var tab: AppTab = .overview
    var homePath: [Route] = []
    var ordersPath: [Route] = []
    var overviewPath: [Route] = []
    var deptsPath: [Route] = []
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
            HomeFeed().id(rev).tabItem { Label { Text("Trang chủ") } icon: { Reicon.tab("house.fill", "ri_home", on: nav.tab == .home) } }.tag(AppTab.home)
            OrdersHome().id(rev).tabItem { Label { Text("Đơn hàng") } icon: { Reicon.tab("shippingbox.fill", "ri_box", on: nav.tab == .orders) } }.tag(AppTab.orders)
            // Ô giữa tròn xanh nổi bật: mở app vào đây.
            HomeView().id(rev).tabItem { Label { Text("Tổng quan") } icon: { Image(uiImage: CenterTabIcon.image) } }.tag(AppTab.overview)
            DeptsHome().tabItem { Label { Text("Phòng ban") } icon: { Reicon.tab("building.2.fill", "ri_buildings", on: nav.tab == .depts) } }.tag(AppTab.depts)
            MoreHome().tabItem { Label { Text("Thêm") } icon: { Reicon.tab("line.3.horizontal", "ri_menu2", on: nav.tab == .more) } }.tag(AppTab.more)
        }
        .tint(.brand)
        .environment(nav)
        .environment(alerts)
        .task { await MetricPrefs.shared.load() }
        .task { await refreshBadges(maxAge: 0) }
        .onChange(of: phase) { _, p in if p == .active { Task { await MetricPrefs.shared.load(); await refreshBadges(maxAge: 60) } } }
        .onChange(of: satellites.hrBadge, initial: true) { _, n in alerts.hrPending = n }
        // Chưa được xem Tổng quan POS: mở app vào Trang chủ thay vì trang báo chưa cấp quyền.
        .onAppear { if nav.tab == .overview && !(auth.me?.canView("overview") ?? false) { nav.tab = .home } }
        #if DEBUG
        .task { await DebugTour.run(nav: nav) }
        #endif
    }
    @MainActor private func refreshBadges(maxAge: TimeInterval) async {
        await sync.refresh()
        await alerts.refresh(maxAge: maxAge, me: auth.me)
        await satellites.refresh(maxAge: maxAge)
    }
}

/// Việc cần xử lý ngay (trang Thông báo và số đỏ trên chuông ở thanh đầu, mục Cần xử lý ở Trang chủ): đơn chờ xác
/// nhận hôm nay, POS lỗi / chậm đồng bộ, khách CSKH quá 20 ngày chưa ghi chú, yêu cầu nhân sự chờ duyệt, cảnh báo trong ca.
@Observable final class AlertCenter {
    var unconfirmed: Double = 0
    var over20: Double = 0
    var callsToday: Double = 0
    var shift: API.Shift?
    var loaded = false
    /// Lần hỏi gần nhất không đọc được gì (mất mạng…): không báo "không có việc khẩn cấp".
    var failed = false
    var updatedAt: Date?
    /// Yêu cầu nhân sự chờ người dùng duyệt (số việc chờ của web nhân sự, RootTabs gán).
    var hrPending = 0
    @ObservationIgnored private var lastAt: Date?
    @ObservationIgnored private var me: API.Me?

    /// route nil: người dùng không mở được trang đích, dòng chỉ để biết.
    struct Item: Identifiable { let id: String; let icon: String; let tone: Tone; let title: String; let sub: String; let route: Route? }

    /// Bỏ qua nếu vừa hỏi chưa quá maxAge giây (0 = hỏi ngay). Quyền của người dùng quyết dòng nào hiện và dòng nào chạm được.
    @MainActor func refresh(maxAge: TimeInterval = 60, me: API.Me?) async {
        if let t = lastAt, Date.now.timeIntervalSince(t) < maxAge { return }
        lastAt = .now
        self.me = me
        let canCare = me?.canView("care") == true
        let today = VNDate.string(.now)
        let o = try? await API.overview(start: today, end: today, compare: "none")
        let s = try? await API.shift(date: today, shift: "auto")
        let b: API.CskhBadge? = canCare ? (try? await API.cskhBadge()) : nil
        let got = o != nil || s != nil || b != nil
        // Bị huỷ giữa chừng (rời tab) mà chưa đọc được gì: lần sau hỏi lại ngay, không đổi trạng thái.
        if Task.isCancelled && !got { lastAt = nil; return }
        if let o { unconfirmed = o.current.total.groups["new"]?.orders ?? 0 }
        if let s { shift = s }
        if let b { over20 = b.over20; callsToday = b.callsToday } else if !canCare { over20 = 0 }
        loaded = true; failed = !got
        if got { updatedAt = .now } else { lastAt = nil }
    }

    /// Cảnh báo trong ca mức cao (đỏ).
    var highShiftAlerts: Int { shift?.alerts.filter { $0.level == "high" }.count ?? 0 }

    func items(sync: SyncStatus) -> [Item] {
        var out: [Item] = []
        let today = VNDate.string(.now)
        // Số lấy từ nhóm "new" (trạng thái Mới trên Pancake) nên danh sách mở cùng nhóm đó cho khớp số.
        if unconfirmed > 0 {
            out.append(Item(id: "unconfirmed", icon: "clock.badge.exclamationmark", tone: .red, title: "\(Fmt.int(unconfirmed)) đơn mới chưa chốt", sub: "Tạo hôm nay · đang ở trạng thái Mới",
                            route: me?.canView("raw-orders") == true ? .orders(HomeShortcuts.newOrders(today)) : nil))
        }
        for p in sync.pos where p.lastError != nil || sync.age(p) > 15 {
            out.append(Item(id: "sync-\(p.posId)", icon: "exclamationmark.triangle.fill", tone: .orange, title: "\(PosBreakdown.short[p.posId] ?? p.posId) \(p.lastError != nil ? "lỗi đồng bộ" : "đang chậm")",
                            sub: p.lastError ?? "Chưa đồng bộ \(sync.age(p)) phút · kiểm tra kết nối", route: me?.canView("config") == true ? .page("config") : nil))
        }
        if me?.canView("care") == true, over20 > 0 {
            out.append(Item(id: "over20", icon: "person.crop.circle.badge.exclamationmark", tone: .orange, title: "\(Fmt.int(over20)) khách quá 20 ngày chưa ghi chú",
                            sub: "CSKH · hôm nay đã ghi \(Fmt.int(callsToday)) cuộc gọi", route: .page("care")))
        }
        if hrPending > 0 {
            out.append(Item(id: "hr", icon: "checkmark.seal.fill", tone: .purple, title: "\(hrPending) yêu cầu nhân sự chờ duyệt",
                            sub: "Phòng Nhân sự · thêm, đổi chức vụ, đổi trạng thái", route: .hr("approvals")))
        }
        return out
    }
    /// Số đỏ trên chuông: việc cần xử lý + cảnh báo đỏ trong ca.
    func count(sync: SyncStatus) -> Int { items(sync: sync).count + highShiftAlerts }
}

/// Trang Thông báo (chuông ở thanh đầu, "Xem tất cả" ở Trang chủ): việc cần xử lý ngay, cảnh báo trong ca, đồng bộ Pancake từng POS.
/// Mở ngay trong tab đang xem, không nhảy tab.
struct AlertsPage: View {
    @Environment(SyncStatus.self) private var sync
    @Environment(AlertCenter.self) private var alerts
    @Environment(AuthModel.self) private var auth
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                PageTitle(title: "Thông báo", subtitle: alerts.updatedAt.map { "Cập nhật lúc \($0.formatted(date: .omitted, time: .shortened))" } ?? "Đang kiểm tra…")
                let items = alerts.items(sync: sync)
                SectionHead(title: "Cần xử lý", count: items.isEmpty ? nil : items.count)
                if !alerts.loaded && items.isEmpty { ThinkingLoader() }
                else if items.isEmpty { AlertsEmpty(failed: alerts.failed) }
                ForEach(items) { AlertLink(item: $0) }
                let canShift = auth.me.map { $0.canView("shift") || $0.canView("center") } ?? false
                SectionHead(title: "Trong ca", action: canShift ? "Xem ca" : nil, route: canShift ? .page("shift") : nil, count: alerts.highShiftAlerts > 0 ? alerts.highShiftAlerts : nil).padding(.top, 6)
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
            }.padding(16).padding(.bottom, 24)
        }
        .navigationTitle("Thông báo").navigationBarTitleDisplayMode(.inline).brandNav()
        .refreshable { await sync.refresh(); await alerts.refresh(maxAge: 0, me: auth.me) }
        .task { await alerts.refresh(maxAge: 30, me: auth.me) }
    }
}

/// Tab Đơn hàng: đơn mọi POS theo từng bước (Mới, Xác nhận, Giao vận, Đã giao, Trả hàng), tìm đơn, đơn cần lưu ý; như mục Đơn hàng
/// trên thanh dưới của Shopify, Sapo, TikTok Shop.
struct OrdersHome: View {
    @Environment(AuthModel.self) private var auth
    @Environment(AppNav.self) private var nav
    var body: some View {
        @Bindable var nav = nav
        NavigationStack(path: $nav.ordersPath) {
            TabPage(tagline: "Theo dõi từng đơn, giao đúng hẹn") {
                if auth.me?.canView("pipeline") ?? false {
                    PipelineView(embedded: true)
                } else {
                    ContentUnavailableView("Chưa được cấp quyền", systemImage: "lock.fill", description: Text("Tài khoản này chưa được xem Vận hành đơn."))
                }
            }
            .appRoutes()
        }
    }
}

/// Icon ô giữa thanh dưới: tròn xanh thương hiệu, ô lưới trắng, giữ nguyên màu (không theo màu chọn của thanh dưới).
enum CenterTabIcon {
    static let image: UIImage = {
        let size = CGSize(width: 30, height: 30)
        let img = UIGraphicsImageRenderer(size: size).image { _ in
            // Luôn màu xanh đậm bản sáng (AccentColor có bản tối nhạt màu, ảnh vẽ một lần nên không đổi theo giao diện).
            UIColor(red: 0x17 / 255, green: 0x68 / 255, blue: 0x4b / 255, alpha: 1).setFill()
            UIBezierPath(ovalIn: CGRect(origin: .zero, size: size)).fill()
            if Reicon.enabled, let sym = UIImage(named: "ri_category_fill")?.withTintColor(.white, renderingMode: .alwaysOriginal) {
                // Icon Category (Reicon, kiểu đặc) màu trắng ở giữa.
                let s: CGFloat = 16
                sym.draw(in: CGRect(x: (size.width - s) / 2, y: (size.height - s) / 2, width: s, height: s))
            } else {
                let conf = UIImage.SymbolConfiguration(pointSize: 13, weight: .bold)
                if let sym = UIImage(systemName: "square.grid.2x2.fill", withConfiguration: conf)?.withTintColor(.white, renderingMode: .alwaysOriginal) {
                    sym.draw(in: CGRect(x: (size.width - sym.size.width) / 2, y: (size.height - sym.size.height) / 2, width: sym.size.width, height: sym.size.height))
                }
            }
        }
        return img.withRenderingMode(.alwaysOriginal)
    }()
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
// Trang Sale (mở từ bảng Sale ở Tổng quan hoặc thẻ Sale ở Phòng ban): Nhân viên trước; Trong ca cũng là lối tắt ở Trang chủ.
// Đơn hàng (Vận hành đơn) là cả công ty nên thành ô riêng ở thanh dưới, không lặp ở đây.
let SALE_PAGES = [
    WebPage(id: "compare", title: "Nhân viên", icon: "person.3.fill", path: "/?view=compare"),
    WebPage(id: "batches", title: "Data", icon: "tray.full.fill", path: "/?view=batches"),
    WebPage(id: "shift", title: "Trong ca", icon: "clock.fill", path: "/?view=shift"),
]
// Tab Thêm (ngoài cùng bên phải): tiện ích dùng chung và Cài đặt.
let MORE_GROUPS: [(String, [WebPage])] = [
    ("Tiện ích", [
        WebPage(id: "customers", title: "Hồ sơ khách hàng", icon: "person.text.rectangle.fill", path: "/?view=customers"),
        WebPage(id: "monthly", title: "Báo cáo cuối tháng", icon: "calendar", path: "/?view=monthly"),
        WebPage(id: "custom", title: "Báo cáo tùy chỉnh", icon: "slider.horizontal.3", path: "/?view=custom"),
        WebPage(id: "raw-orders", title: "Đơn nguồn Pancake POS", icon: "cylinder.split.1x2.fill", path: "/?view=raw-orders"),
    ]),
    ("Cài đặt", [
        WebPage(id: "security", title: "Bảo mật tài khoản", icon: "lock.shield.fill", path: "/?view=security"),
        WebPage(id: "metrics", title: "Cách tính", icon: "ic_m_rate", path: "/?view=metrics"),
        WebPage(id: "config", title: "Cấu hình & kết nối", icon: "gearshape.2.fill", path: "/?view=config"),
        WebPage(id: "audit", title: "Nhật ký hoạt động", icon: "list.bullet.clipboard.fill", path: "/?view=audit"),
    ]),
]
let ALL_PAGES: [WebPage] = CSKH_PAGES + SALE_PAGES + MORE_GROUPS.flatMap(\.1)
    + [WebPage(id: "pipeline", title: "Vận hành đơn", icon: "shippingbox.fill", path: "/?view=pipeline")]

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
        // Mở sẵn trang con ở cuối dải (từ Phòng ban): cuộn cho chip đang chọn hiện ra.
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) { ForEach(pages) { p in FilterChip(label: p.title, on: selection == p.id, badge: badges[p.id]) { withAnimation(.snappy(duration: 0.25)) { selection = p.id } }.id(p.id) } }
            }
            .onAppear { proxy.scrollTo(selection, anchor: .center) }
            .onChange(of: selection) { _, s in withAnimation(.snappy(duration: 0.25)) { proxy.scrollTo(s, anchor: .center) } }
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
                    ForEach(MORE_GROUPS, id: \.0) { title, pages in MoreGroup(title: title, rows: Self.rows(title, pages, me)) }
                    SatelliteSection(me: me)
                }
                PrimaryButton(title: "Đăng xuất", icon: "rectangle.portrait.and.arrow.right", tint: .bad) { Task { await auth.logout() } }.padding(.top, 8)
                Text("Phiên bản \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—") · MEGATECH POS Operations").font(.system(size: 10)).foregroundStyle(Color.inkSoft).frame(maxWidth: .infinity)
            }
            .appRoutes()
            // Mở tab Thêm (hoặc quay lại từ trang con): hỏi lại trạng thái web vệ tinh nếu đã quá 10 giây.
            .task { await satellites.refresh(maxAge: 10) }
        }
    }
    /// Dòng của một nhóm theo quyền; Tiện ích có thêm Tổng quan theo từng POS (số từng POS riêng lẻ, trước ở trang chủ).
    static func rows(_ title: String, _ pages: [WebPage], _ me: API.Me) -> [MoreRow] {
        var r = pages.filter { me.canView($0.id) }.map { MoreRow(id: $0.id, title: $0.title, icon: $0.icon, route: .web($0)) }
        if title == "Tiện ích" && me.canView("overview") { r.insert(MoreRow(id: "pos", title: "Tổng quan theo từng POS", icon: "building.2.fill", route: .overview), at: 0) }
        return r
    }
}

struct MoreRow: Identifiable { let id: String; let title: String; let icon: String; let route: Route }

/// Một nhóm dòng ở tab Thêm (Tiện ích, Cài đặt).
struct MoreGroup: View {
    let title: String; let rows: [MoreRow]
    var body: some View {
        if !rows.isEmpty {
            Text(title).font(.system(size: 13, weight: .bold)).foregroundStyle(Color.inkSoft).padding(.top, 4)
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { i, x in
                    NavigationLink(value: x.route) {
                        HStack(spacing: 12) {
                            MetricIcon(x.icon, size: 14).foregroundStyle(Color.brand).frame(width: 34, height: 34).background(Color.brandSoft, in: .rect(cornerRadius: 9))
                            Text(x.title).font(.system(size: 14, weight: .medium)).foregroundStyle(Color.ink)
                            Spacer(); Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft)
                        }.padding(12).contentShape(.rect)
                    }.buttonStyle(.plain)
                    if i < rows.count - 1 { Divider().padding(.leading, 58) }
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
    /// Nhân sự đã nằm ở tab Phòng ban (10/10/2026) nên không lặp ở đây; mục này chỉ hiện các web vệ tinh khác.
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
            (6, { nav.overviewScroll = CompanyDept.mkt.rawValue }),
            (4, { nav.overviewPath = [.dept(.mkt, period: .month)] }),
            (10, { nav.overviewPath = [] }),
            (2, { nav.tab = .home }),
            (8, { nav.homePath = [.alerts] }),
            (4, { nav.homePath = [] }),
            (2, { nav.tab = .orders }),
            (6, { nav.tab = .depts }),
            (6, { nav.deptsPath = [.dept(.cskh, page: "calls")] }),
            (6, { nav.deptsPath = []; nav.tab = .more }),
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
