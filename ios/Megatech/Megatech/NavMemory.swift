import SwiftUI

// Nhớ lựa chọn giữa các lần mở app (kế hoạch 1.4).
// - Tab cuối, kỳ, POS, nhóm đơn: @AppStorage (UserDefaults của app trên máy này), ghi mỗi khi đổi.
// - Đường đi trong từng tab: @SceneStorage (iOS giữ theo cửa sổ app; vuốt tắt app ở màn đa nhiệm thì iOS bỏ phần này).
// Không lưu dữ liệu cá nhân: không SĐT, tên, mã đơn. Trang một đơn (mã đơn), một khách (SĐT), hồ sơ một nhân sự, danh sách
// đơn của một nhân viên (tên trên tiêu đề) hay theo từ khoá tìm (có thể là SĐT) không được lưu: mở lại thì dừng ở trang trước nó.
// Đăng xuất, đổi tài khoản: bỏ các lựa chọn này (NavMemory.reset), trừ "Mở app vào" là cài đặt của máy.

/// "Mở app vào" (Thêm › Cài đặt trên máy này). Mặc định: tab cuối cùng đang xem.
enum OpenTab: String, CaseIterable {
    case last, home, overview
    var title: String {
        switch self {
        case .last: return "Tab cuối cùng"
        case .home: return "Hôm nay"
        case .overview: return "Tổng quan"
        }
    }
    var hint: String {
        switch self {
        case .last: return "Mở lại tab và trang đang xem lần trước, giữ kỳ, POS và nhóm đơn đã chọn. Trang một đơn hay một khách không được lưu: mở lại thì về trang danh sách."
        case .home: return "Luôn mở vào Hôm nay (số hôm nay)."
        case .overview: return "Luôn mở vào Tổng quan, giữ kỳ, POS và nhóm đơn đã chọn."
        }
    }
}

/// Các lựa chọn đã lưu (UserDefaults, không phải dữ liệu cá nhân). Đọc được từ mọi luồng (UnlockPrefetch đọc ở luồng nền).
enum NavMemory {
    static let tabKey = "thp_nav_tab"
    static let periodKey = "thp_nav_period"
    static let posKey = "thp_nav_pos"
    static let productKey = "thp_nav_product"
    static let openKey = "thp_open_tab"
    /// Khoá @SceneStorage của đường đi trong các tab (RootTabs).
    static let pathsKey = "thp_nav_paths"
    /// Tăng mỗi lần đăng xuất / đổi tài khoản: đường đi đã lưu của lượt trước không mở lại nữa.
    private static let genKey = "thp_nav_gen"
    private static var store: UserDefaults { .standard }

    static var open: OpenTab { OpenTab(rawValue: store.string(forKey: openKey) ?? "") ?? .last }
    /// Tab mở app theo "Mở app vào"; chưa lưu tab nào thì Tổng quan như trước. RootTabs còn đổi Tổng quan sang Trang chủ cho
    /// người chưa được xem Tổng quan POS (UnlockPrefetch.firstTabPaths theo cùng quy tắc).
    static var launchTab: AppTab {
        switch open {
        case .home: return .home
        case .overview: return .overview
        case .last: return AppTab(rawValue: store.string(forKey: tabKey) ?? "") ?? .overview
        }
    }
    /// Kỳ chung; chưa lưu thì Hôm nay.
    static var period: Period { store.string(forKey: periodKey).flatMap { Period(key: $0) } ?? .today }
    /// Kỳ chung nếu trang có mốc đó, không thì kỳ mặc định của trang.
    static func period(in options: [Period], else fallback: Period) -> Period { let p = period; return options.contains(p) ? p : fallback }
    /// POS chung ("" = tất cả POS).
    static var pos: String { let p = store.string(forKey: posKey) ?? ""; return PosInfo.has(p) ? p : "" }
    /// Nhóm đơn chung: all · gentadox · skgk.
    static var product: String { let p = store.string(forKey: productKey) ?? ""; return p == "gentadox" || p == "skgk" ? p : "all" }
    static var generation: Int { store.integer(forKey: genKey) }

    /// Đăng xuất, đổi tài khoản: bỏ tab, kỳ, POS, nhóm đơn và đường đi đã lưu (giữ "Mở app vào").
    static func reset() {
        for k in [tabKey, periodKey, posKey, productKey, "thp_mkt_sort"] { store.removeObject(forKey: k) }
        store.set(generation + 1, forKey: genKey)
    }
}

extension AppNav {
    /// Tab, kỳ, POS, nhóm đơn của lần mở trước (đường đi trong các tab mở lại sau, ở NavMemoryKeeper).
    static func restored() -> AppNav {
        let n = AppNav()
        n.tab = NavMemory.launchTab
        n.period = NavMemory.period
        n.pos = NavMemory.pos
        n.product = NavMemory.product
        return n
    }
}

// MARK: Lưu và mở lại

/// Gắn vào TabView của RootTabs: ghi tab, kỳ, POS, nhóm đơn mỗi khi đổi (@AppStorage) và đường đi trong các tab (chuỗi JSON
/// ở @SceneStorage của RootTabs); lần đầu hiện thì mở lại đường đi đã lưu.
struct NavMemoryKeeper: ViewModifier {
    let nav: AppNav
    @Binding var savedPaths: String
    @AppStorage(NavMemory.tabKey) private var savedTab = ""
    @AppStorage(NavMemory.periodKey) private var savedPeriod = ""
    @AppStorage(NavMemory.posKey) private var savedPos = ""
    @AppStorage(NavMemory.productKey) private var savedProduct = ""

    func body(content: Content) -> some View {
        content
            .onAppear { restorePaths() }
            .onChange(of: nav.tab) { _, t in savedTab = t.rawValue }
            .onChange(of: nav.period) { _, p in savedPeriod = p.key }
            .onChange(of: nav.pos) { _, p in savedPos = p }
            .onChange(of: nav.product) { _, p in savedProduct = p }
            .onChange(of: nav.homePath) { _, _ in savePaths() }
            .onChange(of: nav.ordersPath) { _, _ in savePaths() }
            .onChange(of: nav.overviewPath) { _, _ in savePaths() }
            .onChange(of: nav.deptsPath) { _, _ in savePaths() }
    }

    /// Mở lại đường đi trong các tab (một lần cho mỗi lần vào app). "Mở app vào" Trang chủ / Tổng quan: tab đó mở ở trang đầu.
    private func restorePaths() {
        guard !nav.pathsRestored else { return }
        nav.pathsRestored = true
        var saved: SavedPathsIn?
        if let data = savedPaths.data(using: .utf8), !data.isEmpty,
           let s = try? JSONDecoder().decode(SavedPathsIn.self, from: data), s.gen == NavMemory.generation { saved = s }
        if let saved {
            var home = Self.usable(saved.home), overview = Self.usable(saved.overview)
            switch NavMemory.open {
            case .home: home = []
            case .overview: overview = []
            case .last: break
            }
            var t = Transaction()
            t.disablesAnimations = true
            withTransaction(t) {
                nav.homePath = home
                nav.ordersPath = Self.usable(saved.orders)
                nav.overviewPath = overview
                nav.deptsPath = Self.usable(saved.depts)
            }
        }
        #if DEBUG
        // Chỉ ghi tab, mã kỳ, mã POS, nhóm đơn và số trang đã mở lại trong từng tab (không có số liệu hay dữ liệu cá nhân),
        // để video "iOS preview" (đoạn 9-ky-pos) kiểm được lần mở lại giữ đúng lựa chọn.
        print("[NHO] mo-app tab=\(nav.tab.rawValue) ky=\(nav.period.key) pos=\(nav.pos.isEmpty ? "tat-ca" : nav.pos) nhom=\(nav.product) trang=\(nav.homePath.count),\(nav.ordersPath.count),\(nav.overviewPath.count),\(nav.deptsPath.count)")
        fflush(stdout)
        #endif
    }

    private func savePaths() {
        let s = SavedPathsOut(gen: NavMemory.generation, home: Self.keep(nav.homePath), orders: Self.keep(nav.ordersPath),
                              overview: Self.keep(nav.overviewPath), depts: Self.keep(nav.deptsPath))
        guard let data = try? JSONEncoder().encode(s), let text = String(data: data, encoding: .utf8) else { return }
        if text != savedPaths { savedPaths = text }
    }

    /// Phần đầu đường đi, tới trước trang không được lưu (trang một đơn, một khách…).
    private static func keep(_ path: [Route]) -> [Route] { Array(path.prefix(while: { $0.restorable })) }
    /// Đường đi đọc lại: dừng ở trang đầu tiên không đọc được (trang đã bỏ khỏi app) hoặc không được lưu.
    private static func usable(_ list: [LenientRoute]?) -> [Route] {
        (list ?? []).prefix(while: { $0.route?.restorable == true }).compactMap { $0.route }
    }
}

/// Đường đi trong 4 tab có đường đi (tab Thêm không giữ đường đi).
private struct SavedPathsOut: Encodable {
    let gen: Int
    let home: [Route]
    let orders: [Route]
    let overview: [Route]
    let depts: [Route]
}

private struct SavedPathsIn: Decodable {
    let gen: Int
    let home: [LenientRoute]?
    let orders: [LenientRoute]?
    let overview: [LenientRoute]?
    let depts: [LenientRoute]?
}

/// Một trang đã lưu; đọc lỗi (bản app mới bỏ trang đó) thì nil, không làm hỏng cả đường đi.
private struct LenientRoute: Decodable {
    let route: Route?
    init(from decoder: Decoder) throws { route = try? Route(from: decoder) }
}

// MARK: Route lưu được

extension Route: Codable {
    private enum Kind: String, Codable {
        case orders, web, calls, compare, overview, overviewRef, overviewPos, alerts, alertsSync, page, satellite, dept, hr
    }
    private enum RouteKey: String, CodingKey { case kind, id, query, period, pos, product, page }
    /// Tên danh sách đơn khi mở lại, theo nhóm trạng thái (cùng chữ với bộ lọc đơn).
    private static let listTitles = ["closed": "Đơn chốt", "unconfirmed": "Chờ xác nhận", "new": "Đơn mới", "confirmed": "Đã xác nhận",
                                     "justconfirmed": "Đã xác nhận", "waiting": "Chờ chuyển hàng", "shipping": "Đang giao",
                                     "delivered": "Đã nhận", "returned": "Hoàn", "cancelled": "Hủy sau chốt"]

    /// Lưu được vào @SceneStorage. Không lưu: trang một đơn (mã đơn), một khách (SĐT), hồ sơ một nhân sự, danh sách đơn theo
    /// từ khóa tìm (có thể là SĐT) hoặc của một nhân viên (tiêu đề là tên nhân viên), Hồ sơ khách mở sẵn từ khóa (tên khách).
    var restorable: Bool {
        switch self {
        case .order, .customer, .customerSearch, .hrPerson, .staffOrders, .staffDetail: return false
        case .orders(let q): return q.q.isEmpty && q.sellerId.isEmpty
        case .web, .calls, .compare, .overview, .overviewRef, .overviewPos, .alerts, .alertsSync, .page, .satellite, .dept, .hr: return true
        }
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: RouteKey.self)
        switch try c.decode(Kind.self, forKey: .kind) {
        case .orders:
            // Tiêu đề không lưu (xem encode): đặt lại theo nhóm trạng thái của danh sách.
            var q = try c.decode(OrderQuery.self, forKey: .query)
            q.title = Self.listTitles[q.group] ?? "Đơn hàng"
            self = .orders(q)
        case .web:
            let id = try c.decode(String.self, forKey: .id)
            guard let p = ALL_PAGES.first(where: { $0.id == id }) else {
                throw DecodingError.dataCorruptedError(forKey: .id, in: c, debugDescription: "Trang không còn trong app")
            }
            self = .web(p)
        case .calls: self = .calls(team: try c.decode(String.self, forKey: .id))
        case .compare: self = .compare(team: try c.decode(String.self, forKey: .id))
        case .overview: self = .overview
        case .overviewRef: self = .overviewRef
        case .overviewPos: self = .overviewPos(try c.decode(String.self, forKey: .id))
        case .alerts: self = .alerts
        case .alertsSync: self = .alertsSync
        case .page: self = .page(try c.decode(String.self, forKey: .id))
        case .satellite: self = .satellite(try c.decode(String.self, forKey: .id))
        case .dept:
            guard let d = CompanyDept(rawValue: try c.decode(String.self, forKey: .id)) else {
                throw DecodingError.dataCorruptedError(forKey: .id, in: c, debugDescription: "Bộ phận không còn trong app")
            }
            let period = try c.decodeIfPresent(String.self, forKey: .period).flatMap { Period(key: $0) }
            self = .dept(d, period: period,
                         pos: try c.decodeIfPresent(String.self, forKey: .pos) ?? "",
                         product: try c.decodeIfPresent(String.self, forKey: .product) ?? "all",
                         page: try c.decodeIfPresent(String.self, forKey: .page) ?? "")
        case .hr: self = .hr(try c.decode(String.self, forKey: .id))
        }
    }

    func encode(to encoder: Encoder) throws {
        guard restorable else {
            // Không đưa giá trị của trang vào lỗi (có thể là mã đơn, SĐT).
            throw EncodingError.invalidValue("route", EncodingError.Context(codingPath: encoder.codingPath, debugDescription: "Trang không được lưu"))
        }
        var c = encoder.container(keyedBy: RouteKey.self)
        switch self {
        case .order, .customer, .customerSearch, .hrPerson, .staffOrders, .staffDetail: break   // đã chặn ở trên
        case .orders(var q):
            // Không lưu tiêu đề (chữ tự do, sau này có thể mang tên người); khi mở lại lấy tên theo nhóm trạng thái.
            q.title = ""
            try c.encode(Kind.orders, forKey: .kind); try c.encode(q, forKey: .query)
        case .web(let p): try c.encode(Kind.web, forKey: .kind); try c.encode(p.id, forKey: .id)
        case .calls(let t): try c.encode(Kind.calls, forKey: .kind); try c.encode(t, forKey: .id)
        case .compare(let t): try c.encode(Kind.compare, forKey: .kind); try c.encode(t, forKey: .id)
        case .overview: try c.encode(Kind.overview, forKey: .kind)
        case .overviewRef: try c.encode(Kind.overviewRef, forKey: .kind)
        case .overviewPos(let id): try c.encode(Kind.overviewPos, forKey: .kind); try c.encode(id, forKey: .id)
        case .alerts: try c.encode(Kind.alerts, forKey: .kind)
        case .alertsSync: try c.encode(Kind.alertsSync, forKey: .kind)
        case .page(let id): try c.encode(Kind.page, forKey: .kind); try c.encode(id, forKey: .id)
        case .satellite(let id): try c.encode(Kind.satellite, forKey: .kind); try c.encode(id, forKey: .id)
        case .dept(let d, let period, let pos, let product, let page):
            try c.encode(Kind.dept, forKey: .kind); try c.encode(d.rawValue, forKey: .id)
            try c.encodeIfPresent(period?.key, forKey: .period)
            try c.encode(pos, forKey: .pos); try c.encode(product, forKey: .product); try c.encode(page, forKey: .page)
        case .hr(let page): try c.encode(Kind.hr, forKey: .kind); try c.encode(page, forKey: .id)
        }
    }
}
