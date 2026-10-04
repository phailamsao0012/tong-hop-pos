import SwiftUI

/// Thanh dưới 5 mục: Trang chủ · CSKH · Sale · MKT · Thêm.
struct RootTabs: View {
    @Environment(\.scenePhase) private var phase
    @Environment(SatelliteCenter.self) private var satellites
    var body: some View {
        // Đổi "Cách tính" (ở app hoặc trên web) → revision tăng → các tab báo cáo dựng lại và tải số mới.
        let rev = MetricPrefs.shared.revision
        TabView {
            HomeView().id(rev).tabItem { Label("Trang chủ", systemImage: "house.fill") }
            CskhHome().id(rev).tabItem { Label("CSKH", systemImage: "person.2.wave.2.fill") }
            SaleHome().id(rev).tabItem { Label("Sale", systemImage: "cart.fill") }
            MktHome().id(rev).tabItem { Label("MKT", systemImage: "megaphone.fill") }
            // Huy hiệu: tổng việc chờ của các web vệ tinh (yêu cầu nhân sự chờ duyệt…).
            MoreHome().tabItem { Label("Thêm", systemImage: "ellipsis.circle.fill") }.badge(satellites.badge)
        }
        .tint(.brand)
        .task { await MetricPrefs.shared.load() }
        .onChange(of: phase) { _, p in if p == .active { Task { await MetricPrefs.shared.load() } } }
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
let SALE_PAGES = [
    WebPage(id: "shift", title: "Trong ca", icon: "clock.fill", path: "/?view=shift"),
    WebPage(id: "compare", title: "Nhân viên", icon: "person.3.fill", path: "/?view=compare"),
    WebPage(id: "batches", title: "Data", icon: "tray.full.fill", path: "/?view=batches"),
    WebPage(id: "pipeline", title: "Đơn hàng", icon: "shippingbox.fill", path: "/?view=pipeline"),
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

// MARK: CSKH

struct CskhHome: View {
    @Environment(AuthModel.self) private var auth
    // Vào CSKH là thấy doanh thu và tiến độ KPI trước (03/10/2026); cuộc gọi là trang con kế bên.
    @State private var page = "cskh-overview"
    private var pages: [WebPage] { CSKH_PAGES.filter { auth.me?.canView($0.id) ?? false } }
    var body: some View {
        NavigationStack {
            TabPage(tagline: "POS · CSKH · Tăng trưởng cùng bạn") {
                SubNav(selection: $page, pages: pages)
                switch page {
                case "care": CareView(embedded: true)
                case "repurchase": RepurchaseView(embedded: true)
                case "dormant": DormantView(embedded: true)
                case "cskh-kpi": KpiView(embedded: true)
                case "calls": CallsView(embedded: true)
                default: CskhOverviewView(embedded: true)
                }
            }
            .appRoutes()
            .onAppear { if !pages.contains(where: { $0.id == page }), let f = pages.first { page = f.id } }
        }
    }
}

// MARK: Sale

struct SaleHome: View {
    @Environment(AuthModel.self) private var auth
    @State private var page = "shift"
    private var pages: [WebPage] { SALE_PAGES.filter { auth.me?.canView($0.id) ?? false } }
    var body: some View {
        NavigationStack {
            TabPage(tagline: "Dữ liệu vận hành · Tăng trưởng bền vững") {
                SubNav(selection: $page, pages: pages)
                switch page {
                case "compare": CompareView(team: "sale", embedded: true)
                case "batches": BatchesView(embedded: true)
                case "pipeline": PipelineView(embedded: true)
                default: ShiftView()
                }
            }
            .appRoutes()
            .onAppear { if !pages.contains(where: { $0.id == page }), let f = pages.first { page = f.id } }
        }
    }
}

// MARK: MKT

struct MktHome: View {
    var body: some View {
        NavigationStack {
            TabPage(tagline: "Đồng hành cùng nhà chăn nuôi Việt") { MarketingView() }.appRoutes()
        }
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

/// Mục "Web vệ tinh" ở tab Thêm: mỗi web vệ tinh một dòng có chấm trạng thái (xanh: kết nối được, đỏ: mất kết nối),
/// số việc chờ và mô tả; chạm mở màn riêng trong app. Module app chưa có màn riêng thì báo cần cập nhật app.
struct SatelliteSection: View {
    let me: API.Me
    @Environment(SatelliteCenter.self) private var center
    private var rows: [API.SatModule] {
        if !center.modules.isEmpty || (center.loaded && !center.failed) { return center.modules }
        // Chưa hỏi được máy chủ: chủ hệ thống / giám đốc vẫn vào được Nhân sự (Tuyển dụng không cần web nhân sự).
        guard me.canView("people") else { return [] }
        return [API.SatModule(id: "hr", title: "Nhân sự", subtitle: "Quân số, hồ sơ, sơ đồ, duyệt thay đổi", icon: "person.3.fill", status: nil, badge: nil)]
    }
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
