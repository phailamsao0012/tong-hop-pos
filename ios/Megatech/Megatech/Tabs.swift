import SwiftUI

/// Thanh dưới 5 mục (anh Vũ 10/10/2026, học cách xếp của app lớn): Trang chủ ngoài cùng bên trái (việc cần xử lý hôm nay, lối tắt),
/// Đơn hàng (đơn mọi POS theo từng bước), Tổng quan ở giữa và là mặc định (4 bộ phận; chạm bộ phận nào mở chi tiết bộ phận đó),
/// Phòng ban (danh bạ các phòng), Thêm ngoài cùng bên phải (tiện ích, Cài đặt). Thông báo ở nút chuông thanh đầu, không chiếm ô.
/// Mở app vào tab cuối cùng đang xem (kế hoạch 1.4; đổi ở Thêm › Cài đặt trên máy này › Mở app vào).
enum AppTab: String, Hashable { case home, orders, overview, depts, more }

/// Tab đang mở, đường đi trong từng tab (mỗi tab giữ trang đang xem của riêng nó), kỳ, POS và nhóm đơn dùng chung (kế hoạch 1.4).
/// Tất cả nhớ giữa các lần mở app (NavMemory.swift); trang một đơn, một khách thì không.
@Observable final class AppNav {
    var tab: AppTab = .overview
    /// Kỳ, POS ("" = tất cả), nhóm đơn (all · gentadox · skgk) chung: Tổng quan và tab Đơn hàng dùng thẳng; trang con mở ra theo
    /// kỳ chung, đổi riêng được và ghi rõ phạm vi (ScopeLine). Trang chủ luôn là Hôm nay.
    var period: Period = .today
    var pos = ""
    var product = "all"
    var homePath: [Route] = []
    var ordersPath: [Route] = []
    var overviewPath: [Route] = []
    var deptsPath: [Route] = []
    /// Cuộn tab Tổng quan tới một bảng (id = CompanyDept.rawValue); dùng cho lượt tự xem thử của bản Debug.
    var overviewScroll: String?
    /// Đã mở lại đường đi đã lưu (một lần cho mỗi lần vào app).
    @ObservationIgnored var pathsRestored = false
}

struct RootTabs: View {
    @Environment(\.scenePhase) private var phase
    @Environment(SatelliteCenter.self) private var satellites
    @Environment(SyncStatus.self) private var sync
    @Environment(AuthModel.self) private var auth
    /// Tab, kỳ, POS, nhóm đơn của lần mở trước (kế hoạch 1.4).
    @State private var nav = AppNav.restored()
    @State private var alerts = AlertCenter()
    /// Đường đi trong các tab (JSON, chỉ các trang được lưu; Route.restorable).
    @SceneStorage(NavMemory.pathsKey) private var savedPaths = ""
    var body: some View {
        // Đổi "Cách tính" (ở app hoặc trên web) → revision tăng → các tab báo cáo dựng lại và tải số mới.
        let rev = MetricPrefs.shared.revision
        @Bindable var nav = nav
        TabView(selection: $nav.tab) {
            HomeFeed().id(rev).tabItem { Label { Text("Trang chủ") } icon: { Reicon.tab("house.fill", "ri_home", on: nav.tab == .home) } }.tag(AppTab.home)
            OrdersHome().id(rev).tabItem { Label { Text("Đơn hàng") } icon: { Reicon.tab("shippingbox.fill", "ri_box", on: nav.tab == .orders) } }.tag(AppTab.orders)
            // Ô giữa tròn xanh nổi bật: mở app vào đây khi chưa nhớ tab nào (sau đó mở vào tab cuối cùng, NavMemory).
            HomeView().id(rev).tabItem { Label { Text("Tổng quan") } icon: { Image(uiImage: CenterTabIcon.image) } }.tag(AppTab.overview)
            DeptsHome().tabItem { Label { Text("Phòng ban") } icon: { Reicon.tab("building.2.fill", "ri_buildings", on: nav.tab == .depts) } }.tag(AppTab.depts)
            MoreHome().tabItem { Label { Text("Thêm") } icon: { Reicon.tab("line.3.horizontal", "ri_menu2", on: nav.tab == .more) } }.tag(AppTab.more)
        }
        .tint(.brand)
        .environment(nav)
        .environment(alerts)
        .modifier(NavMemoryKeeper(nav: nav, savedPaths: $savedPaths))
        .task { await MetricPrefs.shared.load() }
        .task { await refreshBadges(maxAge: 0) }
        .onChange(of: phase) { _, p in if p == .active { Task { await MetricPrefs.shared.load(); await refreshBadges(maxAge: 60) } } }
        .onChange(of: satellites.hrBadge, initial: true) { _, n in alerts.hrPending = n }
        // Chưa được xem Tổng quan POS: mở app vào Trang chủ thay vì trang báo chưa cấp quyền.
        // Cùng quy tắc với UnlockPrefetch.firstTabPaths (tải trước số của tab mở app lúc hộp Face ID đang hiện): đổi ở đây thì sửa cả ở đó.
        .onAppear { if nav.tab == .overview && !(auth.me?.canView("overview") ?? false) { nav.tab = .home } }
        #if DEBUG
        .task { await DebugTour.run(nav: nav) }
        #endif
    }
    /// Trạng thái đồng bộ, việc cần xử lý, việc chờ của web vệ tinh: hỏi cùng lúc.
    @MainActor private func refreshBadges(maxAge: TimeInterval) async {
        let me = auth.me
        await runTogether([
            { await sync.refresh(maxAge: maxAge) },
            { await alerts.refresh(maxAge: maxAge, me: me) },
            { await satellites.refresh(maxAge: maxAge) },
        ])
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
    /// Câu lỗi dễ hiểu của lần hỏi gần nhất không đọc được gì (LoadError).
    var failText: String?
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
        // Ba nguồn hỏi cùng lúc.
        let trace = LoadTrace("canh-bao", requests: canCare ? 3 : 2)
        async let oReq = attempt(true, trace) { try await API.overview(start: today, end: today, compare: "none") }
        async let sReq = attempt(true, trace) { try await API.shift(date: today, shift: "auto") }
        async let bReq = attempt(canCare, trace) { try await API.cskhBadge() }
        let (oRes, sRes, bRes) = await (oReq, sReq, bReq)
        trace.end(cancelled: Task.isCancelled)
        let o = try? oRes?.get(), s = try? sRes?.get(), b = try? bRes?.get()
        func failure<T>(_ r: Result<T, Error>?) -> Error? { if case .failure(let e)? = r { return e } else { return nil } }
        let firstError = failure(oRes) ?? failure(sRes) ?? failure(bRes)
        let got = o != nil || s != nil || b != nil
        // Bị huỷ giữa chừng (rời tab) mà chưa đọc được gì: lần sau hỏi lại ngay, không đổi trạng thái.
        if Task.isCancelled && !got { lastAt = nil; return }
        if let o { unconfirmed = o.current.total.groups["new"]?.orders ?? 0 }
        if let s { shift = s }
        if let b { over20 = b.over20; callsToday = b.callsToday } else if !canCare { over20 = 0 }
        loaded = true; failed = !got
        failText = got ? nil : (firstError.flatMap { LoadError.text($0) } ?? "Không tải được")
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
    /// Mở từ ô trạng thái đồng bộ ở thanh đầu (Route.alertsSync): cuộn tới khối "Đồng bộ Pancake".
    var focusSync = false
    @State private var scrolled = false
    private static let syncAnchor = "dong-bo-pancake"
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    PageTitle(title: "Thông báo", subtitle: alerts.updatedAt.map { "Cập nhật lúc \(Fmt.hm($0))" } ?? "Đang kiểm tra…")
                    let items = alerts.items(sync: sync)
                    SectionHead(title: "Cần xử lý", count: items.isEmpty ? nil : items.count)
                    if !alerts.loaded && items.isEmpty { ThinkingLoader() }
                    else if items.isEmpty { AlertsEmpty(failed: alerts.failed, text: alerts.failText) { await alerts.refresh(maxAge: 0, me: auth.me) } }
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
                    SectionHead(title: "Đồng bộ Pancake").padding(.top, 6).id(Self.syncAnchor)
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
            .task {
                guard focusSync, !scrolled else { return }
                await scrollToSync(proxy)
            }
        }
        .navigationTitle("Thông báo").navigationBarTitleDisplayMode(.inline).brandNav()
        .refreshable { await refreshBoth() }
        .task { await alerts.refresh(maxAge: 30, me: auth.me) }
    }
    /// Cuộn tới khối "Đồng bộ Pancake" một lần mỗi lần mở trang, sau khi trang đẩy vào xong.
    @MainActor private func scrollToSync(_ proxy: ScrollViewProxy) async {
        try? await Task.sleep(for: .milliseconds(450))
        guard !Task.isCancelled else { return }
        scrolled = true
        withAnimation(.easeInOut(duration: 0.5)) { proxy.scrollTo(Self.syncAnchor, anchor: .top) }
    }
    /// Kéo để làm mới: trạng thái đồng bộ và việc cần xử lý hỏi lại cùng lúc.
    @MainActor private func refreshBoth() async {
        let me = auth.me
        await runTogether([{ await sync.refresh() }, { await alerts.refresh(maxAge: 0, me: me) }])
    }
}

/// Tab Đơn hàng: đơn theo từng bước (Mới, Xác nhận, Giao vận, Đã giao, Trả hàng), tìm đơn, đơn cần lưu ý, theo kỳ và POS chung;
/// như mục Đơn hàng trên thanh dưới của Shopify, Sapo, TikTok Shop.
struct OrdersHome: View {
    @Environment(AuthModel.self) private var auth
    @Environment(AppNav.self) private var nav
    var body: some View {
        @Bindable var nav = nav
        NavigationStack(path: $nav.ordersPath) {
            TabPage(tagline: "Theo dõi từng đơn, giao đúng hẹn") {
                if auth.me?.canView("pipeline") ?? false {
                    // Gốc tab Đơn hàng: kỳ và POS chung với Tổng quan (đổi ở đây là đổi cả ở Tổng quan).
                    PipelineView(embedded: true, followsShared: true)
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
            case "app-settings": AppSettingsView()
            case "shift": DeptPage(title: "Điều hành trong ca") { ShiftView() }
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
                PrivacyRow()
                if WidgetProbeBridge.installed { WidgetDiagnosticsRow() }
                PrimaryButton(title: "Đăng xuất", icon: "rectangle.portrait.and.arrow.right", tint: .bad) { Task { await auth.logout() } }.padding(.top, 8)
                Text("Phiên bản \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—") · MEGATECH POS Operations").font(.system(size: 10)).foregroundStyle(Color.inkSoft).frame(maxWidth: .infinity)
            }
            .appRoutes()
            // Kéo để làm mới: hỏi lại trạng thái web vệ tinh ngay.
            .refreshable { await satellites.refresh(maxAge: 0) }
            // Mở tab Thêm (hoặc quay lại từ trang con): hỏi lại trạng thái web vệ tinh nếu đã quá 10 giây.
            .task { await satellites.refresh(maxAge: 10) }
        }
    }
    /// Dòng của một nhóm theo quyền; Tiện ích có thêm Tổng quan theo từng POS (số từng POS riêng lẻ, trước ở trang chủ);
    /// Cài đặt có thêm "Cài đặt trên máy này" (lựa chọn chỉ lưu trên iPhone này, ai cũng mở được).
    static func rows(_ title: String, _ pages: [WebPage], _ me: API.Me) -> [MoreRow] {
        var r = pages.filter { me.canView($0.id) }.map { MoreRow(id: $0.id, title: $0.title, icon: $0.icon, route: .web($0)) }
        if title == "Tiện ích" && me.canView("overview") { r.insert(MoreRow(id: "pos", title: "Tổng quan theo từng POS", icon: "building.2.fill", route: .overview), at: 0) }
        if title == "Cài đặt" { r.append(MoreRow(id: "app-settings", title: "Cài đặt trên máy này", icon: "iphone", route: .page("app-settings"))) }
        return r
    }
}

struct MoreRow: Identifiable { let id: String; let title: String; let icon: String; let route: Route }

/// Dòng "Chính sách bảo mật" ở tab Thêm: mở trang /privacy của web bằng Safari.
struct PrivacyRow: View {
    var body: some View {
        Link(destination: API.privacyURL) {
            HStack(spacing: 12) {
                MetricIcon("lock.shield.fill", size: 14).foregroundStyle(Color.brand).frame(width: 34, height: 34).background(Color.brandSoft, in: .rect(cornerRadius: 9))
                Text("Chính sách bảo mật").font(.system(size: 14, weight: .medium)).foregroundStyle(Color.ink)
                Spacer(); Image(systemName: "arrow.up.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft)
            }.padding(12).contentShape(.rect)
        }
        .buttonStyle(.plain)
        .background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
        .padding(.top, 4)
    }
}

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
/// "iOS preview" quay video trên máy ảo (máy ảo không chạm được). MEGATECH_TOUR=reload: lượt xem tải lại (xem reload).
/// MEGATECH_TOUR=kypos / kypos-mo-lai: đổi kỳ, POS rồi tắt app, mở lại vẫn giữ (xem periodPos).
/// MEGATECH_TOUR=chamso: chạm số mở đúng trang, giữ bộ lọc (xem tapNumbers).
/// MEGATECH_TOUR_SEARCH=1: ô tìm tab Đơn hàng và Hồ sơ khách (xem search).
enum DebugTour {
    @MainActor static func run(nav: AppNav) async {
        if ProcessInfo.processInfo.environment["MEGATECH_TOUR_SEARCH"] == "1" { await search(nav: nav); return }
        let mode = ProcessInfo.processInfo.environment["MEGATECH_TOUR"]
        if mode == "reload" { await reload(nav: nav); return }
        if mode == "kypos" { await periodPos(nav: nav); return }
        if mode == "kypos-mo-lai" { await periodPosReopened(nav: nav); return }
        if mode == "chamso" { await tapNumbers(nav: nav); return }
        if mode == "xnkho" { await warehouse(nav: nav); return }
        guard mode == "1" else { return }
        let steps: [(Double, () -> Void)] = [
            (6, { nav.overviewScroll = CompanyDept.mkt.rawValue }),
            (4, { nav.overviewPath = [.dept(.mkt, period: .month)] }),
            (8, { nav.overviewPath = [] }),
            (3, { nav.overviewScroll = CompanyDept.vandon.rawValue }),
            (4, { nav.overviewPath = [.dept(.vandon, period: .month)] }),
            (8, { nav.overviewPath = [] }),
            (2, { nav.tab = .home }),
            (8, { nav.homePath = [.dept(.vandon, period: .today)] }),
            (6, { nav.homePath = [] }),
            (2, { nav.tab = .orders }),
            (6, { nav.tab = .depts }),
            (6, { nav.tab = .more }),
            (6, { nav.tab = .overview; nav.overviewScroll = CompanyDept.sale.rawValue }),
        ]
        await play(steps)
    }

    /// Đoạn 12-xn-kho: cùng đích chạm với bảng, kỳ Tháng trước, không ghi tên hay mã người.
    @MainActor private static func warehouse(nav: AppNav) async {
        if let test = ProcessInfo.processInfo.environment["MEGATECH_XNK_CASE"] {
            nav.tab = .overview; nav.overviewPath = [.dept(.sale, period: .last, page: "compare")]
            await playCompare([
                (8, { DebugTap.shared.tap("cuon:bang-nhan-vien") }),
                (2, { if test == "remember-set" { DebugTap.shared.tap("xnk-weekday") } }),
                (6, { if test == "remember-set" { DebugTap.shared.tap("xnk-diff") } }),
                (2, { DebugTap.shared.tap("xnk-cmp-log") }),
                (2, { warehouseMark(test) }),
            ])
            return
        }
        let steps: [(Double, () -> Void)] = [
            (2, { nav.tab = .overview; nav.overviewPath = [.dept(.sale, period: .last, page: "compare")] }),
            (7, { DebugTap.shared.tap("cuon:bang-nhan-vien") }),
            (4, { DebugTap.shared.tap("xnk-cot"); warehouseMark("cot") }),
            (3, { DebugTap.shared.tap("xnk-o"); warehouseMark("giai-thich") }),
            (5, { DebugTap.shared.tap("xnk-dong") }),
            (2, { DebugTap.shared.tap("xnk-ds"); warehouseMark("ds") }),
            (7, { nav.overviewPath = [.dept(.sale, period: .last, page: "compare")] }),
            (4, { DebugTap.shared.tap("cuon:bang-nhan-vien") }),
            (2, { DebugTap.shared.tap("xnk-chot") }),
            (7, { nav.overviewPath = [.dept(.sale, period: .last, page: "compare")] }),
            (2, { nav.overviewPath = [.dept(.cskh, period: .last)] }),
            (7, { DebugTap.shared.tap("cuon:bang-nhan-vien"); warehouseMark("cskh") }),
            (6, { DebugTap.shared.tap("cuon:hang-nhan-vien") }),
            (1, { DebugTap.shared.tap("xnk-cuon-kho"); warehouseMark("chu-lon") }),
            (4, { nav.overviewPath = [.dept(.sale, period: .last, page: "compare")] }),
            (7, { DebugTap.shared.tap("xnk-cmp-default") }),
            (5, { DebugTap.shared.tap("cuon:bang-nhan-vien") }),
            (2, { warehouseMark("controls") }),
            (2, { DebugTap.shared.tap("xnk-wave") }),
            (2, { DebugTap.shared.tap("cuon:hang-nhan-vien") }),
            (2, { warehouseMark("wave") }),
            (3, { DebugTap.shared.tap("xnk-diff") }),
            (2, { warehouseMark("diff") }),
            (3, { DebugTap.shared.tap("xnk-cum") }),
            (2, { warehouseMark("cum") }),
            (3, { DebugTap.shared.tap("xnk-weekday") }),
            (7, { DebugTap.shared.tap("cuon:bang-nhan-vien") }),
            (2, { warehouseMark("weekday") }),
            (3, { DebugTap.shared.tap("xnk-rate") }),
            (2, { DebugTap.shared.tap("cuon:hang-nhan-vien") }),
            (2, { warehouseMark("rate") }),
            (3, { DebugTap.shared.tap("xnk-custom") }),
            (8, { DebugTap.shared.tap("cuon:bang-nhan-vien") }),
            (2, { warehouseMark("custom") }),
            (2, { DebugTap.shared.tap("xnk-chart-closed") }),
            (2, { DebugTap.shared.tap("xnk-wave") }),
            (2, { DebugTap.shared.tap("cuon:bieu-do-so-cung-ky") }),
            (2, { warehouseMark("chart-closed-wave") }),
            (2, { DebugTap.shared.tap("xnk-chart-first") }),
            (2, { warehouseMark("chart-tip-first") }),
            (2, { DebugTap.shared.tap("xnk-chart-middle") }),
            (2, { warehouseMark("chart-tip-middle") }),
            (2, { DebugTap.shared.tap("xnk-chart-last") }),
            (2, { warehouseMark("chart-tip-last") }),
            (2, { DebugTap.shared.tap("xnk-chart-clear") }),
            (2, { DebugTap.shared.tap("xnk-diff") }),
            (2, { DebugTap.shared.tap("cuon:bieu-do-so-cung-ky") }),
            (2, { warehouseMark("chart-closed-diff") }),
            (2, { DebugTap.shared.tap("xnk-cum") }),
            (2, { DebugTap.shared.tap("cuon:bieu-do-so-cung-ky") }),
            (2, { warehouseMark("chart-closed-cum") }),
            (2, { DebugTap.shared.tap("xnk-chart-net") }),
            (2, { DebugTap.shared.tap("xnk-wave") }),
            (2, { DebugTap.shared.tap("cuon:bieu-do-so-cung-ky") }),
            (2, { warehouseMark("chart-net-wave") }),
            (2, { DebugTap.shared.tap("xnk-diff") }),
            (2, { DebugTap.shared.tap("cuon:bieu-do-so-cung-ky") }),
            (2, { warehouseMark("chart-net-diff") }),
            (2, { DebugTap.shared.tap("xnk-cum") }),
            (2, { DebugTap.shared.tap("cuon:bieu-do-so-cung-ky") }),
            (2, { warehouseMark("chart-net-cum") }),
            (2, { DebugTap.shared.tap("xnk-chart-rate") }),
            (2, { DebugTap.shared.tap("xnk-wave") }),
            (2, { DebugTap.shared.tap("cuon:bieu-do-so-cung-ky") }),
            (2, { warehouseMark("chart-rate-wave") }),
            (2, { DebugTap.shared.tap("xnk-diff") }),
            (2, { DebugTap.shared.tap("cuon:bieu-do-so-cung-ky") }),
            (2, { warehouseMark("chart-rate-diff") }),
            (2, { DebugTap.shared.tap("xnk-cum") }),
            (2, { DebugTap.shared.tap("cuon:bieu-do-so-cung-ky") }),
            (2, { warehouseMark("chart-rate-cum") }),
            (2, { DebugTap.shared.tap("xnk-chart-closed") }),
            (2, { DebugTap.shared.tap("xnk-wave") }),
            (2, { CompareTourStatus.ready = false; DebugTap.shared.tap("xnk-chart-year") }),
            (2, { DebugTap.shared.tap("cuon:bieu-do-so-cung-ky") }),
            (2, { warehouseMark("chart-year") }),
            (2, { CompareTourStatus.ready = false; DebugTap.shared.tap("xnk-chart-unequal") }),
            (2, { DebugTap.shared.tap("cuon:bieu-do-so-cung-ky") }),
            (2, { warehouseMark("chart-unequal") }),
            (3, { nav.overviewPath = [.dept(.sale, period: .month, page: "compare")] }),
            (8, { DebugTap.shared.tap("cuon:bang-nhan-vien") }),
            (2, { DebugTap.shared.tap("cuon:bieu-do-so-cung-ky") }),
            (2, { warehouseMark("chart-through-today") }),
            (3, { nav.overviewPath = [.dept(.sale, period: .today, page: "compare")] }),
            (8, { DebugTap.shared.tap("cuon:bang-nhan-vien") }),
            (2, { warehouseMark("today") }),
            (2, { DebugTap.shared.tap("xnk-wave") }),
            (2, { DebugTap.shared.tap("xnk-closed") }),
            (2, { DebugTap.shared.tap("cuon:bieu-do-so-cung-ky") }),
            (2, { warehouseMark("chart-today") }),
            (2, { DebugTap.shared.tap("xnk-chart-last") }),
            (2, { warehouseMark("chart-today-tip") }),
            (2, { DebugTap.shared.tap("xnk-chart-clear") }),
            (2, { DebugTap.shared.tap("cuon:hang-nhan-vien") }),
            (2, { warehouseMark("today-mini") }),
        ]
        await playCompare(steps)
    }

    @MainActor private static func playCompare(_ steps: [(Double, () -> Void)]) async {
        for step in steps {
            await play([step])
            if ["xnk-cmp-default", "xnk-weekday", "xnk-custom", "xnk-cmp-log", "xnk-chart-year", "xnk-chart-unequal", "cuon:bang-nhan-vien", "cuon:hang-nhan-vien"].contains(DebugTap.shared.target) {
                for _ in 0..<160 {
                    if CompareTourStatus.ready || Task.isCancelled { break }
                    try? await Task.sleep(for: .milliseconds(250))
                }
                if !CompareTourStatus.ready { warehouseMark("loi-tai-so"); return }
            }
        }
    }

    private static func warehouseMark(_ code: String) {
        print("[XNK] moc=\(code)")
        fflush(stdout)
    }

    /// MEGATECH_TOUR=reload (đoạn 8-tai-lai của "iOS preview", chạy cùng MEGATECH_FAIL_NET=once: request đầu tiên của mỗi đường dẫn
    /// báo mất mạng). Tổng quan hiện khung lỗi có nút Thử lại → cuộn xuống khối Số liệu theo kỳ (khung lỗi, số phần chưa tải được) →
    /// "bấm" Thử lại (DebugRetry) → số về → lên đầu trang → qua Trang chủ (nguồn chưa hỏi lần nào báo lỗi) → "bấm" Thử lại →
    /// quay lại Tổng quan trong 60 giây: không tải lại (log "[MOC] tai ... bo-qua").
    @MainActor private static func reload(nav: AppNav) async {
        let steps: [(Double, () -> Void)] = [
            (5, { nav.overviewScroll = "center" }),
            (4, { DebugRetry.shared.tick += 1 }),
            (6, { nav.overviewScroll = CompanyDept.sale.rawValue }),
            (3, { nav.tab = .home }),
            (5, { DebugRetry.shared.tick += 1 }),
            (6, { nav.tab = .overview }),
        ]
        await play(steps)
    }

    /// MEGATECH_TOUR=kypos (đoạn 9-ky-pos của "iOS preview", lần mở thứ nhất, chạy cùng MEGATECH_NAV_RESET=1 để bắt đầu từ
    /// Tổng quan, Hôm nay, tất cả POS): "chạm" chip Tháng này → chip POS Thủy sản → nhóm Gentadox → mở trang Vận đơn (ghi
    /// "Đang xem: Tháng này · … · POS Thủy sản Megatech"). Workflow rồi rời app, tắt hẳn app và mở lại.
    @MainActor private static func periodPos(nav: AppNav) async {
        let steps: [(Double, () -> Void)] = [
            (3, { nav.period = .month }),
            (2, { nav.pos = "thuy-san" }),
            (2, { nav.product = "gentadox" }),
            (3, { nav.overviewPath = [.dept(.vandon, period: nav.period, pos: nav.pos, product: nav.product)] }),
        ]
        await play(steps)
    }

    /// MEGATECH_TOUR=kypos-mo-lai (đoạn 9-ky-pos, lần mở lại sau khi tắt hẳn app): app mở lại đúng trang Vận đơn, đúng kỳ và
    /// POS (đường đi khôi phục từ @SceneStorage; kỳ, POS từ @AppStorage) → quay về Tổng quan: chip vẫn Tháng này, Thủy sản,
    /// Gentadox → qua tab Đơn hàng: cũng Tháng này, Thủy sản (kỳ và POS chung).
    @MainActor private static func periodPosReopened(nav: AppNav) async {
        let steps: [(Double, () -> Void)] = [
            (4, { nav.overviewPath = [] }),
            (3, { nav.tab = .orders }),
        ]
        await play(steps)
    }

    /// MEGATECH_TOUR=chamso (đoạn 10-cham-so của "iOS preview", kế hoạch 1.6; chạy cùng MEGATECH_NAV_RESET=1 để bắt đầu từ Tổng
    /// quan, Hôm nay, tất cả POS): "chạm" chip Tháng trước (đủ người từ 10 đơn chia) → POS Thủy sản → nhóm Gentadox → cuộn tới khối
    /// Nhân viên → "chạm" người đầu bảng TOP 5: danh sách đơn chốt của người đó giữ kỳ, POS, nhóm đơn, đầu danh sách ghi "Lọc theo
    /// ngày xác nhận…" → quay lại → trang Vận đơn → "chạm" thẻ Đơn chuyển đi: bảng giải thích → đóng → về Tổng quan → "chạm" ô
    /// Đồng bộ ở thanh đầu (đẩy đúng Route.alertsSync của ô đó): Thông báo cuộn tới Đồng bộ Pancake.
    @MainActor private static func tapNumbers(nav: AppNav) async {
        let steps: [(Double, () -> Void)] = [
            (2, { nav.period = .last }),
            (2, { nav.pos = "thuy-san" }),
            (2, { nav.product = "gentadox" }),
            (5, { nav.overviewScroll = "nhan-vien" }),
            (3, { DebugTap.shared.tap("nhan-vien") }),
            (5, { nav.overviewPath = [] }),
            (2, { nav.overviewPath = [.dept(.vandon, period: nav.period, pos: nav.pos, product: nav.product)] }),
            (5, { DebugTap.shared.tap("van-don") }),
            (5, { DebugTap.shared.tap("dong") }),
            (2, { nav.overviewPath = [] }),
            (2, { nav.overviewPath = [.alertsSync] }),
        ]
        await play(steps)
    }

    /// MEGATECH_TOUR_SEARCH=1 (đoạn 11-tim của "iOS preview", kế hoạch 1.5; chạy cùng MEGATECH_NAV_RESET=1). Lấy mẫu từ site demo
    /// lúc chạy (chỉ bản Debug, không in ra log): SĐT của một đơn tạo tháng trước, SĐT của một đơn đang ở trạng thái Mới, mã của một
    /// đơn tháng trước (máy chủ chưa tra mã theo khóa chính, SearchText.codesByKey: mã một đơn chốt tháng này, vì mã đơn chỉ tìm trong
    /// kỳ đang xem), một tên khách 3 chữ cái. Rồi qua tab Đơn hàng, kỳ Tháng này, "gõ" lần lượt vào ô tìm: SĐT đơn tháng trước
    /// (dạng 09xx.xxx.xxx) → SĐT đơn Mới (dạng +84 9xx xxx xxx) → mã đơn (#…) → tên 3 chữ cái (tìm trong kỳ, có "Tìm trong Hồ sơ
    /// khách") → mở Hồ sơ khách với tên đó (như chạm "Tìm trong Hồ sơ khách"). Log chỉ có dòng "[MOC] tim …" (loại từ khóa, mili giây)
    /// và dòng có / không lấy được từng mẫu.
    @MainActor private static func search(nav: AppNav) async {
        let m = await searchSamples()
        print("[MOC] tim mau sdt-thang-truoc=\(m.oldPhone == nil ? "khong" : "co") sdt-don-moi=\(m.newPhone == nil ? "khong" : "co") ma-don=\(m.code == nil ? "khong" : "co") ten=\(m.name == nil ? "mac-dinh" : "co")")
        fflush(stdout)
        var steps: [(Double, () -> Void)] = [(1, { nav.period = .month; nav.ordersPath = []; nav.tab = .orders })]
        var pause = 2.0
        if let p = m.oldPhone { steps += typing(Self.dotted(p), after: pause); pause = 4.5 }
        if let p = m.newPhone { steps += typing(Self.plus84(p), after: pause); pause = 4.5 }
        if let c = m.code { steps += typing("#" + c, after: pause); pause = 4 }
        let name = m.name ?? "Anh"
        steps += typing(name, after: pause)
        steps.append((3.5, { nav.ordersPath = [.customerSearch(name)] }))
        await play(steps)
    }
    /// Xóa ô tìm tab Đơn hàng (sau `wait` giây) rồi gõ từng ký tự.
    private static func typing(_ text: String, after wait: Double) -> [(Double, () -> Void)] {
        var out: [(Double, () -> Void)] = [(wait, { DebugSearch.shared.orders = "" })]
        var typed = ""
        for c in text {
            typed.append(c)
            let now = typed
            out.append((0.09, { DebugSearch.shared.orders = now }))
        }
        return out
    }

    /// Mẫu cho lượt tìm (chỉ giữ trong bộ nhớ, không in, không lưu).
    private struct SearchSamples { var oldPhone: String?; var newPhone: String?; var code: String?; var name: String? }
    @MainActor private static func searchSamples() async -> SearchSamples {
        var m = SearchSamples()
        let last = Period.last.range, recent = Period.d30.range
        // Đơn tạo tháng trước; đơn đang ở trạng thái Mới (nhóm "new"), tạo trong 30 ngày.
        let lastMonth = (try? await API.orders(OrderQuery(start: last.0, end: last.1, basis: "created", title: "Mẫu"), page: 1))?.orders ?? []
        let newOnes = (try? await API.orders(OrderQuery(start: recent.0, end: recent.1, group: "new", basis: "created", title: "Mẫu"), page: 1))?.orders ?? []
        let oldPhones: [String] = lastMonth.compactMap { o in o.phone.flatMap { p in SearchText.phone(p) } }
        let newPhones: [String] = newOnes.compactMap { o in o.phone.flatMap { p in SearchText.phone(p) } }
        let firstOld = oldPhones.first
        m.oldPhone = firstOld
        m.newPhone = newPhones.first(where: { p in p != firstOld })
        // Mã đơn: máy chủ chưa tra mã theo khóa chính thì ô tìm chỉ tìm mã trong kỳ đang xem (Tháng này, theo giờ chốt).
        var codeSource = lastMonth
        if !SearchText.codesByKey {
            let month = Period.month.range
            codeSource = (try? await API.orders(OrderQuery(start: month.0, end: month.1, basis: "confirmed", title: "Mẫu"), page: 1))?.orders ?? []
        }
        m.code = codeSource.map { o in o.orderId }.first(where: { id in SearchText.code(id) == id })
        // Tên 3 chữ cái: một chữ trong tên khách (thường là tên gọi ở cuối, ví dụ "Lan").
        let names: [String] = (lastMonth + newOnes).compactMap { o in o.customer }
        let words: [String] = names.flatMap { n in n.split(separator: " ").reversed().map { part in String(part) } }
        m.name = words.first(where: { word in word.count == 3 && word.allSatisfy({ c in c.isLetter }) })
        return m
    }
    /// "09xxxxxxxx" → "09xx.xxx.xxx" (ô tìm bỏ dấu chấm).
    private static func dotted(_ p: String) -> String {
        guard p.count == 10 else { return p }
        let a = Array(p)
        return String(a[0..<4]) + "." + String(a[4..<7]) + "." + String(a[7..<10])
    }
    /// "09xxxxxxxx" → "+84 9xx xxx xxx" (ô tìm đổi +84 thành 0).
    private static func plus84(_ p: String) -> String {
        guard p.count == 10, p.hasPrefix("0") else { return p }
        let a = Array(p.dropFirst())
        return "+84 " + String(a[0..<3]) + " " + String(a[3..<6]) + " " + String(a[6..<9])
    }

    /// Dòng "[CHAM]" (đoạn 10-cham-so): bộ lọc của khối Nhân viên lúc "chạm" một người. Chỉ mã kỳ, mã POS, nhóm đơn, bộ phận;
    /// không có tên, SĐT hay mã người.
    static func employeeTapped(_ f: OrderFilters) {
        guard ProcessInfo.processInfo.environment["MEGATECH_TOUR"] == "chamso" else { return }
        print("[CHAM] cham-nhan-vien tu=\(f.start) den=\(f.end) pos=\(f.pos.isEmpty ? "tat-ca" : f.pos) nhom=\(f.product) bo-phan=\(f.team)")
        fflush(stdout)
    }

    /// Dòng "[CHAM]" (đoạn 10-cham-so): bộ lọc của danh sách đơn vừa mở, để so với dòng cham-nhan-vien. Chỉ ngày, mã POS, nhóm,
    /// mốc ngày và có lọc theo người bán hay không; không có tên, SĐT hay mã người.
    static func listOpened(_ q: OrderQuery, note: Bool) {
        guard ProcessInfo.processInfo.environment["MEGATECH_TOUR"] == "chamso" else { return }
        let pos = q.posIds.isEmpty ? "tat-ca" : q.posIds.joined(separator: ",")
        print("[CHAM] danh-sach tu=\(q.start) den=\(q.end) pos=\(pos) nhom=\(q.product) bo-phan=\(q.team) trang-thai=\(q.group) moc=\(q.basis) nguoi-ban=\(q.sellerId.isEmpty ? "khong" : "co") dong-ngay-xac-nhan=\(note ? "co" : "khong")")
        fflush(stdout)
    }

    @MainActor private static func play(_ steps: [(Double, () -> Void)]) async {
        for (wait, act) in steps {
            try? await Task.sleep(for: .seconds(wait))
            if Task.isCancelled { return }
            withAnimation(.snappy(duration: 0.35)) { act() }
        }
    }
}

/// Bản Debug: lượt tự xem (MEGATECH_TOUR=chamso) "chạm" một chỗ trên màn (máy ảo không chạm được). target: tên chỗ chạm
/// ("nhan-vien": dòng đầu bảng TOP 5 ở Tổng quan; "van-don": thẻ Đơn chuyển đi; "dong": đóng bảng giải thích); tick tăng mỗi lần.
@Observable final class DebugTap {
    static let shared = DebugTap()
    var target = ""
    var tick = 0
    func tap(_ t: String) { target = t; tick += 1 }
}
#endif
