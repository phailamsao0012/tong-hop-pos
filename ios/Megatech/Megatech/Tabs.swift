import SwiftUI

/// Thanh dưới 5 mục: Trang chủ · CSKH · Sale · MKT · Thêm.
struct RootTabs: View {
    var body: some View {
        TabView {
            HomeView().tabItem { Label("Trang chủ", systemImage: "house.fill") }
            CskhHome().tabItem { Label("CSKH", systemImage: "person.2.wave.2.fill") }
            SaleHome().tabItem { Label("Sale", systemImage: "cart.fill") }
            MktHome().tabItem { Label("MKT", systemImage: "megaphone.fill") }
            MoreHome().tabItem { Label("Thêm", systemImage: "ellipsis.circle.fill") }
        }
        .tint(.brand)
    }
}

struct WebPage: Identifiable, Hashable { let id: String; let title: String; let icon: String; let path: String }

let CSKH_PAGES = [
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
    ("Nhân sự", [WebPage(id: "recruit", title: "Tuyển dụng", icon: "person.badge.plus", path: "/?view=recruit")]),
    ("Hệ thống", [
        WebPage(id: "config", title: "Cấu hình & kết nối", icon: "gearshape.2.fill", path: "/?view=config"),
        WebPage(id: "audit", title: "Nhật ký hoạt động", icon: "list.bullet.clipboard.fill", path: "/?view=audit"),
        WebPage(id: "security", title: "Bảo mật tài khoản", icon: "lock.shield.fill", path: "/?view=security"),
    ]),
]
let ALL_PAGES: [WebPage] = CSKH_PAGES + SALE_PAGES + MORE_GROUPS.flatMap(\.1)

/// Trang có bản riêng thì mở bản riêng, còn lại mở web trong app.
struct PageDestination: View {
    let p: WebPage
    var body: some View {
        Group {
            switch p.id {
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
            case "config": ConfigView()
            case "customers": CustomerSearchView()
            case "shift": ScrollView { ShiftView().padding(16) }.navigationTitle("Điều hành trong ca").navigationBarTitleDisplayMode(.inline)
            default: WebView(url: URL(string: p.path, relativeTo: API.base)!).navigationTitle(p.title).navigationBarTitleDisplayMode(.inline).ignoresSafeArea(edges: .bottom)
            }
        }.brandNav()
    }
}

/// Dải chip chuyển trang con trong một tab (như thanh dưới của từng bộ ảnh).
struct SubNav: View {
    @Binding var selection: String; let pages: [WebPage]
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) { ForEach(pages) { p in FilterChip(label: p.title, on: selection == p.id) { withAnimation(.snappy(duration: 0.25)) { selection = p.id } } } }
        }
    }
}

// MARK: CSKH

struct CskhHome: View {
    @Environment(AuthModel.self) private var auth
    @State private var page = "calls"
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
                default: CallsView(embedded: true)
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
                    ForEach(MORE_GROUPS, id: \.0) { title, pages in
                        let allowed = pages.filter { me.canView($0.id) }
                        if !allowed.isEmpty {
                            Text(title).font(.system(size: 13, weight: .bold)).foregroundStyle(Color.inkSoft).padding(.top, 4)
                            VStack(spacing: 0) {
                                ForEach(Array(allowed.enumerated()), id: \.element.id) { i, p in
                                    NavigationLink(value: Route.web(p)) {
                                        HStack(spacing: 12) {
                                            Image(systemName: p.icon).font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.brand).frame(width: 34, height: 34).background(Color.brandSoft, in: .rect(cornerRadius: 9))
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
        }
    }
}
