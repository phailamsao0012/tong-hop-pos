import SwiftUI

/// Thanh dưới 5 mục: Trang chủ · CSKH · Bán hàng · MKT · Thêm. Thanh kính là của hệ thống (iOS 26), app chỉ chọn icon.
struct RootTabs: View {
    var body: some View {
        TabView {
            DashboardView().tabItem { Label("Trang chủ", systemImage: "house.fill") }
            CskhHome().tabItem { Label("CSKH", systemImage: "person.2.wave.2.fill") }
            SalesHome().tabItem { Label("Bán hàng", systemImage: "cart.fill") }
            MarketingView().tabItem { Label("MKT", systemImage: "megaphone.fill") }
            MoreView().tabItem { Label("Thêm", systemImage: "ellipsis.circle.fill") }
        }
        .tint(.brand)
    }
}

/// Một trang web chưa có bản riêng, mở trong app với cùng phiên đăng nhập.
struct WebPage: Identifiable, Hashable {
    let id: String; let title: String; let icon: String; let path: String
}

let CSKH_PAGES = [
    WebPage(id: "calls", title: "Cuộc gọi CSKH", icon: "phone.fill", path: "/?view=calls"),
    WebPage(id: "care", title: "Khách theo nhân viên", icon: "person.2.fill", path: "/?view=care"),
    WebPage(id: "repurchase", title: "Mua lại & Upsell", icon: "arrow.triangle.2.circlepath", path: "/?view=repurchase"),
    WebPage(id: "dormant", title: "Khách lâu chưa mua", icon: "moon.zzz.fill", path: "/?view=dormant"),
    WebPage(id: "cskh-kpi", title: "KPI CSKH", icon: "target", path: "/?view=cskh-kpi"),
]
let SALES_PAGES = [
    WebPage(id: "compare", title: "So sánh nhân viên", icon: "person.3.fill", path: "/?view=compare"),
    WebPage(id: "batches", title: "Data được cấp", icon: "tray.full.fill", path: "/?view=batches"),
    WebPage(id: "pipeline", title: "Vận hành đơn", icon: "shippingbox.fill", path: "/?view=pipeline"),
]
let MORE_GROUPS: [(String, [WebPage])] = [
    ("Báo cáo", [
        WebPage(id: "monthly", title: "Báo cáo cuối tháng", icon: "calendar", path: "/?view=monthly"),
        WebPage(id: "custom", title: "Báo cáo tùy chỉnh", icon: "slider.horizontal.3", path: "/?view=custom"),
        WebPage(id: "raw-orders", title: "Đơn nguồn Pancake POS", icon: "cylinder.split.1x2", path: "/?view=raw-orders"),
    ]),
    ("Nhân sự", [WebPage(id: "recruit", title: "Tuyển dụng", icon: "person.badge.plus", path: "/?view=recruit")]),
    ("Hệ thống", [
        WebPage(id: "config", title: "Cấu hình & kết nối", icon: "gearshape.2.fill", path: "/?view=config"),
        WebPage(id: "audit", title: "Nhật ký hoạt động", icon: "list.bullet.clipboard", path: "/?view=audit"),
        WebPage(id: "security", title: "Bảo mật tài khoản", icon: "lock.shield.fill", path: "/?view=security"),
    ]),
]

struct WebPageLink: View {
    let p: WebPage
    var body: some View {
        NavigationLink { WebView(url: URL(string: p.path, relativeTo: API.base)!).navigationTitle(p.title).navigationBarTitleDisplayMode(.inline).ignoresSafeArea(edges: .bottom) } label: {
            Label { Text(p.title) } icon: { Image(systemName: p.icon).foregroundStyle(Color.brand) }
        }
    }
}

// MARK: CSKH — tìm khách bản riêng + các trang CSKH

struct CskhHome: View {
    @Environment(AuthModel.self) private var auth
    @State private var q = ""
    @State private var pos = PosBreakdown.order[0]
    @State private var results: [API.OrderRow] = []
    @State private var searching = false
    var body: some View {
        NavigationStack {
            List {
                Section("Tìm khách") {
                    Picker("POS", selection: $pos) { ForEach(PosBreakdown.order, id: \.self) { Text(PosBreakdown.names[$0] ?? $0).tag($0) } }
                    if searching { ProgressView() }
                    ForEach(uniquePhones(results), id: \.0) { phone, name in
                        NavigationLink(value: Route.customer(posId: pos, phone: phone)) {
                            VStack(alignment: .leading, spacing: 2) { Text(name ?? "Khách").font(.subheadline.weight(.semibold)); Text(phone).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    if !q.isEmpty && results.isEmpty && !searching { Text("Không thấy khách khớp trên POS này.").font(.caption).foregroundStyle(.secondary) }
                }
                Section("Trang CSKH") { ForEach(CSKH_PAGES.filter { auth.me?.canView($0.id) ?? false }) { WebPageLink(p: $0) } }
            }
            .navigationTitle("CSKH")
            .appRoutes()
            .searchable(text: $q, prompt: "SĐT hoặc tên khách")
            .onSubmit(of: .search) { Task { await search() } }
            .onChange(of: pos) { _, _ in Task { await search() } }
        }
    }
    private func uniquePhones(_ rows: [API.OrderRow]) -> [(String, String?)] {
        var seen = Set<String>(); var out: [(String, String?)] = []
        for r in rows { if let p = r.phone, !seen.contains(p) { seen.insert(p); out.append((p, r.customer)) } }
        return out
    }
    @MainActor private func search() async {
        let t = q.trimmingCharacters(in: .whitespaces); guard !t.isEmpty else { results = []; return }
        searching = true; defer { searching = false }
        results = (try? await API.orders(OrderQuery(posIds: [pos], q: t), page: 1))?.orders ?? []
    }
}

// MARK: Bán hàng — Trong ca bản riêng + các trang bán hàng

struct SalesHome: View {
    @Environment(AuthModel.self) private var auth
    var body: some View {
        ShiftView(extra: AnyView(
            Card(title: "Trang bán hàng khác") {
                ForEach(SALES_PAGES.filter { auth.me?.canView($0.id) ?? false }) { p in
                    NavigationLink { WebView(url: URL(string: p.path, relativeTo: API.base)!).navigationTitle(p.title).navigationBarTitleDisplayMode(.inline).ignoresSafeArea(edges: .bottom) } label: {
                        HStack { Label { Text(p.title).foregroundStyle(.primary) } icon: { Image(systemName: p.icon).foregroundStyle(Color.brand) }; Spacer(); Image(systemName: "chevron.right").font(.caption2.weight(.bold)).foregroundStyle(.quaternary) }.padding(.vertical, 6)
                    }
                }
            }
        ))
    }
}

// MARK: Thêm — theo quyền tài khoản

struct MoreView: View {
    @Environment(AuthModel.self) private var auth
    var body: some View {
        NavigationStack {
            List {
                if let me = auth.me {
                    Section {
                        HStack(spacing: 12) {
                            Image(systemName: "person.crop.circle.fill").font(.system(size: 40)).foregroundStyle(Color.brand)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(me.displayName).font(.headline)
                                Text(me.title?.isEmpty == false ? me.title! : me.email).font(.caption).foregroundStyle(.secondary)
                            }
                        }.padding(.vertical, 4)
                    }
                    ForEach(MORE_GROUPS, id: \.0) { title, pages in
                        let allowed = pages.filter { me.canView($0.id) }
                        if !allowed.isEmpty { Section(title) { ForEach(allowed) { WebPageLink(p: $0) } } }
                    }
                }
                Section { Button("Đăng xuất", role: .destructive) { Task { await auth.logout() } } }
                Section { LabeledContent("Phiên bản", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—") }
            }
            .navigationTitle("Thêm")
        }
    }
}
