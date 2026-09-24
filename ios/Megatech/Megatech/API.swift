import Foundation

/// Gọi API của web tonghopposmegatech.io.vn. Phiên đăng nhập là cookie `thp_session` (HttpOnly),
/// URLSession tự lưu vào HTTPCookieStorage nên mở lại app vẫn còn đăng nhập.
enum API {
    /// Bản DEBUG cho phép trỏ sang máy chủ thử (biến môi trường MEGATECH_BASE, ví dụ http://localhost:8787) để kiểm tra với dữ liệu thử.
    static let base: URL = {
        #if DEBUG
        if let s = ProcessInfo.processInfo.environment["MEGATECH_BASE"], let u = URL(string: s) { return u }
        #endif
        return URL(string: "https://tonghopposmegatech.io.vn")!
    }()
    static let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.httpCookieStorage = .shared
        c.httpShouldSetCookies = true
        c.httpCookieAcceptPolicy = .always
        c.timeoutIntervalForRequest = 45
        return URLSession(configuration: c)
    }()

    struct APIError: LocalizedError { let message: String; var errorDescription: String? { message } }

    static func request<T: Decodable>(_ path: String, method: String = "GET", body: [String: Any]? = nil, as: T.Type = T.self) async throws -> T {
        var req = URLRequest(url: URL(string: path, relativeTo: base)!)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue("MEGATECH-iOS/0.1", forHTTPHeaderField: "User-Agent")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, resp) = try await session.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
            if code == 401 { throw APIError(message: msg ?? "Phiên đăng nhập đã hết, đăng nhập lại.") }
            throw APIError(message: msg ?? "Máy chủ trả lỗi \(code).")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    // MARK: Đăng nhập
    struct LoginStep: Decodable { let step: String; let challengeId: String?; let to: String? }
    struct Me: Decodable {
        let userId: String; let email: String; let displayName: String; let role: String; let title: String?
        let views: [String]?; let posIds: [String]?; let team: String?; let mfaEnabled: Bool?
        /// Cùng quy tắc với web: chủ hệ thống xem hết; 'recruit' chỉ giám đốc; các trang chỉ chủ (config, audit, cskh-kpi) người khác không thấy.
        func canView(_ v: String) -> Bool {
            if v == "security" { return true }
            if role == "owner" { return true }
            if v == "recruit" { return role == "director" }
            if ["config", "audit", "cskh-kpi"].contains(v) { return false }
            return (views ?? []).contains(v)
        }
    }

    static func login(email: String, password: String) async throws -> LoginStep {
        try await request("/api/auth/login", method: "POST", body: ["email": email, "password": password])
    }
    static func verify(challengeId: String, code: String, kind: String) async throws -> LoginStep {
        try await request("/api/auth/verify", method: "POST", body: ["challengeId": challengeId, "code": code, "kind": kind])
    }
    static func me() async throws -> Me {
        #if DEBUG
        // Máy thử: nạp sẵn phiên qua biến môi trường MEGATECH_SESSION (token cookie thp_session) để khỏi gõ đăng nhập trên máy ảo.
        if let t = ProcessInfo.processInfo.environment["MEGATECH_SESSION"], let host = base.host,
           let c = HTTPCookie(properties: [.name: "thp_session", .value: t, .domain: host, .path: "/", .expires: Date().addingTimeInterval(86400)]) {
            HTTPCookieStorage.shared.setCookie(c)
        }
        #endif
        return try await request("/api/auth/me")
    }
    static func logout() async {
        _ = try? await request("/api/auth/logout", method: "POST", body: [:]) as [String: Bool]
        HTTPCookieStorage.shared.cookies?.forEach { HTTPCookieStorage.shared.deleteCookie($0) }
    }

    // MARK: Báo cáo tổng quan
    struct Group: Decodable { let orders: Double; let net: Double }
    struct Metrics: Decodable {
        let orders: Double
        let closedOrders: Double
        let closedNet: Double
        let closedDiscount: Double
        let closedGross: Double?
        let averageOrder: Double?
        let customers: Double?
        let closeRate: Double?
        let groups: [String: Group]
    }
    struct PosRow: Decodable { let posId: String; let closedOrders: Double; let closedNet: Double; let orders: Double }
    struct EmployeeRow: Decodable, Identifiable { let sellerId: String; let name: String?; let department: String?; let orders: Double; let closedOrders: Double; let closedNet: Double; let assignedOrders: Double; let closeRate: Double?; let assignedCloseRate: Double?; let averageOrder: Double?; var id: String { sellerId } }
    struct Reconcile: Decodable { let orders: Double; let gross: Double; let net: Double; let discount: Double }
    struct SeriesRow: Decodable { let bucket: String; let posId: String; let orders: Double; let closedOrders: Double; let closedNet: Double; let groups: [String: Group] }
    struct Period: Decodable { let total: Metrics; let byPos: [PosRow]; let byEmployee: [EmployeeRow]?; let series: [SeriesRow]?; let reconcile: Reconcile? }
    struct Overview: Decodable { let current: Period; let compare: Period?; let syncedAt: String? }

    static func overview(start: String, end: String, posIds: [String] = [], groupBy: String = "day", team: String = "all", compare: String = "previous") async throws -> Overview {
        try await request("/api/reports/overview?posIds=\(posIds.joined(separator: ","))&start=\(start)&end=\(end)&compare=\(compare)&groupBy=\(groupBy)&team=\(team)")
    }

    // MARK: Đơn nguồn (danh sách cấu thành một con số, chi tiết một đơn)
    struct OrderRow: Decodable, Identifiable {
        let id: String; let orderId: String; let posId: String; let posName: String
        let phone: String?; let customer: String?; let createdAt: String?
        let statusCode: Int?; let statusName: String
        let marketerName: String?; let sellerName: String?; let closerName: String?
        let currentTotal: Double?; let net: Double?; let firstConfirmedAt: String?; let deliveredAt: String?
    }
    struct OrderPage: Decodable { let page: Int; let hasMore: Bool; let orders: [OrderRow] }
    static func orders(_ q: OrderQuery, page: Int) async throws -> OrderPage {
        try await request("/api/raw/orders?" + q.queryString + "&page=\(page)&size=50")
    }
    struct OrderItem: Decodable { let name: String?; let quantity: Double?; let price: Double?; let discount: Double?; let total: Double?; let returned: Double?; let bonus: Bool? }
    struct OrderHistory: Decodable { let fromName: String?; let toName: String?; let by: String?; let at: String? }
    struct OrderDetail: Decodable {
        let id: String; let orderId: String; let posId: String; let posName: String; let pancakeUrl: String?
        let phone: String?; let customer: String?; let createdAt: String?; let updatedAt: String?
        let statusName: String; let subStatus: String?
        let sellerName: String?; let sellerAssignedAt: String?; let careName: String?; let closerName: String?; let firstConfirmedAt: String?
        let deliveredAt: String?; let returnedAt: String?; let cancelledAt: String?
        let creatorName: String?; let marketerName: String?
        let gross: Double?; let discount: Double?; let net: Double?; let shippingFee: Double?; let cod: Double?; let quantity: Double?
        let note: String?; let source: String?; let warehouse: String?
        let address: String?; let province: String?; let receiver: String?
        let returnedReason: String?; let trackingLink: String?
        let items: [OrderItem]; let history: [OrderHistory]
    }
    static func orderDetail(id: String) async throws -> OrderDetail {
        try await request("/api/raw/orders/detail?id=\(id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id)")
    }

    // MARK: Hồ sơ khách
    struct CustomerStats: Decodable {
        let name: String?; let sellerName: String?; let orders: Double; let closedOrders: Double; let successOrders: Double
        let successNet: Double; let averageOrder: Double?; let returnedOrders: Double; let cancelledOrders: Double
        let firstOrderAt: String?; let lastOrderAt: String?; let lastSuccessAt: String?
    }
    struct CustomerProfile: Decodable {
        let address: String?; let province: String?; let customerSince: String?
        let tags: [String]; let notes: [String]; let sources: [String]; let marketers: [String]
    }
    struct CustomerOrder: Decodable, Identifiable {
        let id: String; let sourceOrderId: String; let createdAt: String?; let statusName: String
        let sellerName: String?; let closerName: String?; let confirmedAt: String?; let deliveredAt: String?
        let gross: Double?; let net: Double; let note: String?; let successRank: Int?
        let items: [OrderItem]
    }
    struct CustomerDetail: Decodable { let phone: String?; let posId: String?; let posName: String?; let stats: CustomerStats?; let profile: CustomerProfile?; let orders: [CustomerOrder] }
    static func customer(posId: String, phone: String) async throws -> CustomerDetail {
        try await request("/api/reports/customers/detail?posId=\(posId)&phone=\(phone)")
    }

    // MARK: Điều hành trong ca
    struct ShiftStaff: Decodable, Identifiable {
        let employeeId: String; let name: String; let department: String?
        let received: Double; let closed: Double; let rate: Double?; let hotValue: Double; let pending: Double
        let posIds: [String]; let yesterday: ShiftTotal?; let assignedHidden: Bool?
        var id: String { employeeId }
    }
    struct ShiftTotal: Decodable { let received: Double; let closed: Double; let rate: Double? }
    struct ShiftFeed: Decodable, Identifiable { let id: String; let orderId: String; let posName: String; let customer: String?; let closer: String; let at: String; let net: Double }
    struct ShiftAlert: Decodable { let level: String; let title: String; let detail: String; let at: String? }
    struct Shift: Decodable {
        let date: String; let shift: String; let hours: Hours; let isToday: Bool; let syncedAt: String?
        let total: ShiftTotal; let yesterday: ShiftTotal; let staff: [ShiftStaff]; let feed: [ShiftFeed]; let alerts: [ShiftAlert]
        let hourly: [Hour]
        struct Hour: Decodable { let hour: String; let received: Double; let closed: Double }
        struct Hours: Decodable { let start: Int; let end: Int }
    }
    static func shift(date: String, shift: String) async throws -> Shift {
        try await request("/api/reports/shift?posIds=&date=\(date)&shift=\(shift)")
    }

    // MARK: Marketing
    struct MktSummary: Decodable {
        let orders: Double; let phones: Double; let net: Double; let refundNet: Double?; let netAfterRefund: Double?
        let averageOrder: Double?; let revenuePerPhone: Double?
        let createdOrders: Double; let createdPhones: Double; let confirmedOrders: Double; let confirmationRate: Double?
        let deliveredOrders: Double; let deliveryRate: Double?; let returnedOrders: Double; let cancelledOrders: Double
    }
    struct Marketer: Decodable, Identifiable {
        let marketerId: String; let marketerName: String; let marketingTeamName: String
        let orders: Double; let phones: Double; let net: Double; let refundNet: Double?; let netAfterRefund: Double?
        let averageOrder: Double?; let revenuePerPhone: Double?
        let createdOrders: Double; let createdPhones: Double; let confirmedOrders: Double; let confirmationRate: Double?
        let deliveredOrders: Double; let returnedOrders: Double; let cancelledOrders: Double
        var id: String { marketerId }
    }
    struct Marketing: Decodable { let summary: MktSummary; let byMarketer: [Marketer] }
    static func marketing(start: String, end: String) async throws -> Marketing {
        try await request("/api/reports/marketing?posIds=&start=\(start)&end=\(end)&basis=created&stage=all")
    }

    // MARK: Vận hành đơn
    struct Bucket: Decodable { let orders: Double; let net: Double; let gross: Double }
    struct PipelineEmployee: Decodable, Identifiable { let sellerId: String; let name: String; let department: String?; let posIds: [String]; let buckets: [String: Bucket]; var id: String { sellerId } }
    struct PipelinePos: Decodable, Identifiable { let posId: String; let posName: String; let buckets: [String: Bucket]; var id: String { posId } }
    struct Pipeline: Decodable { let basis: String; let total: [String: Bucket]; let byEmployee: [PipelineEmployee]; let byPos: [PipelinePos] }
    static func pipeline(start: String, end: String, basis: String, posIds: [String] = []) async throws -> Pipeline {
        try await request("/api/reports/pipeline?posIds=\(posIds.joined(separator: ","))&start=\(start)&end=\(end)&basis=\(basis)")
    }

    // MARK: Tuyển dụng
    struct Candidate: Decodable, Identifiable {
        let id: String; let fileName: String; let tab: String; let rowNum: Int
        let name: String; let phone: String?; let position: String?; let team: String?; let handler: String?
        let birthYear: String?; let receivedOn: String?; let cvUrl: String?; let status: String
        let data: [String: String]; let firstSeenAt: String; let updatedAt: String; let deletedAt: String?
        let cvViewable: Bool?
    }
    struct RecruitList: Decodable { let candidates: [Candidate]; let statusLabels: [String: String] }
    struct RecruitEvent: Decodable, Identifiable { let id: Int; let kind: String; let changes: [Change]; let createdAt: String
        struct Change: Decodable { let field: String?; let from: String?; let to: String? } }
    struct RecruitCv: Decodable { let name: String; let mime: String; let size: Double; let viewable: Bool }
    struct CandidateDetail: Decodable { let candidate: Candidate; let events: [RecruitEvent]; let cv: RecruitCv? }
    static func recruit() async throws -> RecruitList { try await request("/api/recruit/candidates") }
    static func candidate(id: String) async throws -> CandidateDetail { try await request("/api/recruit/candidates?id=\(id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id)") }

    // MARK: Trung tâm: tình trạng đồng bộ, việc cần xử lý
    struct SyncPos: Decodable, Identifiable { let posId: String; let records: Double; let lastSyncAt: String?; let lastError: String?; let status: String; let errors24h: Double; var id: String { posId } }
    static func syncStatus() async throws -> [SyncPos] { try await request("/api/sync/pos") }
    struct CskhBadge: Decodable { let callsToday: Double; let over20: Double }
    static func cskhBadge() async throws -> CskhBadge { try await request("/api/reports/cskh-badge") }
    struct Employee: Decodable, Identifiable { let id: String; let name: String; let department: String?; let posIds: [String]?; let active: Bool? }
    static func employees() async throws -> [Employee] { try await request("/api/employees") }

    // MARK: Khách theo nhân viên (CSKH)
    struct CareSummary: Decodable { let total: Double; let neverNoted: Double; let over20: Double; let buyers: Double; let purchased: Double; let closedOrders: Double; let closedNet: Double }
    struct CareStaff: Decodable, Identifiable { let id: String; let name: String; let department: String?; let assigned: Double; let neverNoted: Double; let over7: Double; let over20: Double; let notedToday: Double }
    struct CareNote: Decodable { let id: String?; let author: String?; let message: String?; let createdAt: String? }
    struct CareRow: Decodable, Identifiable {
        let id: String; let posId: String; let posName: String; let name: String?; let phone: String?; let assignedName: String?
        let orderCount: Double; let succeedOrders: Double; let purchased: Double; let lastOrderAt: String?
        let noteCount: Double; let lastNoteAt: String?; let daysSinceNote: Double?; let notes: [CareNote]
    }
    struct Care: Decodable { let total: Double; let summary: CareSummary; let staff: [CareStaff]; let rows: [CareRow] }
    static func care(assigned: String, sort: String, minDays: Int, q: String, page: Int) async throws -> Care {
        try await request("/api/reports/care?posIds=&assigned=\(assigned.isEmpty ? "all" : assigned)&sort=\(sort)&minDays=\(minDays)&q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")&page=\(page)&size=50")
    }

    // MARK: Cuộc gọi CSKH
    struct CallStaff: Decodable, Identifiable { let authorId: String; let name: String; let department: String?; let assigned: Double; let notes: Double; let customers: Double; let orders: Double; let net: Double; let activeDays: Double; var id: String { authorId } }
    struct Calls: Decodable { let staff: [CallStaff] }
    static func calls(start: String, end: String) async throws -> Calls { try await request("/api/reports/calls?posIds=&start=\(start)&end=\(end)&team=cskh") }

    // MARK: Mua lại & Upsell
    struct Level: Decodable { let level: Int; let label: String; let customers: Double; let orders: Double; let net: Double }
    struct RepTotal: Decodable { let customers: Double; let orders: Double; let net: Double }
    struct RepEmployee: Decodable, Identifiable { let sellerId: String; let name: String; let levels: [Level]; let repurchase: RepTotal; var id: String { sellerId } }
    struct RepRecent: Decodable { let posName: String; let posId: String; let phone: String; let createdAt: String?; let net: Double; let level: Int; let prior: Double; let sellerName: String; let tags: [String] }
    struct RepTag: Decodable { let tag: String; let orders: Double; let customers: Double; let net: Double; let resaleOrders: Double; let resaleCustomers: Double; let resaleNet: Double; let resaleRate: Double? }
    struct Repurchase: Decodable {
        struct Summary: Decodable { let levels: [Level]; let repurchase: RepTotal; let successOrders: Double }
        struct Funnel: Decodable { let once: Double; let twice: Double; let thrice: Double }
        let summary: Summary; let funnel: Funnel; let byEmployee: [RepEmployee]; let byTag: [RepTag]; let recent: [RepRecent]
    }
    static func repurchase(start: String, end: String, sellerId: String = "") async throws -> Repurchase {
        try await request("/api/reports/repurchase?posIds=&start=\(start)&end=\(end)&sellerId=\(sellerId)")
    }

    // MARK: Hồ sơ khách hàng (danh sách theo nhóm)
    struct CustomerRow: Decodable, Identifiable {
        let posId: String; let posName: String; let phone: String; let name: String?; let sellerName: String?
        let lastOrderAt: String?; let successOrders: Double; let successNet: Double; let lastSuccessAt: String?; let daysSinceSuccess: Double?
        var id: String { posId + ":" + phone }
    }
    struct CustomerPage: Decodable { let page: Int; let hasMore: Bool; let total: Double; let segments: [String: Double]?; let customers: [CustomerRow] }
    static func customers(segment: String, sort: String, q: String, page: Int) async throws -> CustomerPage {
        try await request("/api/reports/customers?posIds=&segment=\(segment)&sort=\(sort)&q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")&page=\(page)&size=50")
    }

    // MARK: Data được cấp
    struct Batch: Decodable, Identifiable {
        let posId: String; let posName: String; let month: String; let sellerId: String; let sellerName: String
        let received: Double; let buyers: Double; let repeatBuyers: Double; let buyRate: Double?; let orders: Double; let net: Double
        var id: String { posId + month + sellerId }
    }
    struct Batches: Decodable { let batches: [Batch] }
    static func batches(start: String, end: String) async throws -> Batches { try await request("/api/reports/batches?posIds=&start=\(start)&end=\(end)") }

    // MARK: Bảo mật
    struct Passkey: Decodable, Identifiable { let id: String; let name: String?; let created_at: String? }
    struct Device: Decodable, Identifiable { let id: String; let created_at: String?; let last_used_at: String?; let user_agent: String?; let expires_at: String?; let current: Bool }
    struct Security: Decodable { let totpEnabled: Bool; let passkeys: [Passkey]; let devices: [Device]; let mfaRequired: Bool; let mfaEnabled: Bool }
    static func security() async throws -> Security { try await request("/api/auth/security") }
    static func removeDevice(id: String) async throws { _ = try await request("/api/auth/security?device=\(id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id)", method: "DELETE") as [String: Bool] }

    // MARK: Nhật ký hoạt động
    struct AuditItem: Decodable, Identifiable { let id: String; let at: String; let email: String?; let name: String?; let action: String; let target: String?; let detail: String?; let status: Int?; let ip: String?; let device: String? }
    struct Audit: Decodable { let items: [AuditItem]; let total: Double; let page: Int; let labels: [String: String]? }
    static func audit(q: String, page: Int) async throws -> Audit { try await request("/api/audit?size=60&page=\(page)&q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")") }

    // MARK: KPI (mục tiêu tháng)
    struct Target: Decodable { let scope: String; let refId: String; let revenue: Double; let closedOrders: Double; let workingDays: Double? }
    struct Targets: Decodable { let month: String; let items: [Target] }
    static func targets(month: String) async throws -> Targets { try await request("/api/targets?month=\(month)") }
    static func saveTargets(month: String, only: [String], items: [[String: Any]]) async throws {
        _ = try await request("/api/targets", method: "PUT", body: ["month": month, "only": only, "items": items]) as Targets
    }
    static func employees(team: String) async throws -> [Employee] { try await request("/api/employees?team=\(team)") }

    // MARK: Đồng bộ (chủ hệ thống)
    struct SyncResult: Decodable { let ok: Bool; let records: Double? }
    static func syncNow(posId: String) async throws -> SyncResult { try await request("/api/sync/pos", method: "POST", body: ["posId": posId, "action": "recent"]) }
}
