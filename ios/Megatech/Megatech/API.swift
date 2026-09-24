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
    struct Me: Decodable { let userId: String; let email: String; let displayName: String; let role: String; let title: String? }

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
        let averageOrder: Double?
        let customers: Double?
        let closeRate: Double?
        let groups: [String: Group]
    }
    struct PosRow: Decodable { let posId: String; let closedOrders: Double; let closedNet: Double; let orders: Double }
    struct Period: Decodable { let total: Metrics; let byPos: [PosRow] }
    struct Overview: Decodable { let current: Period; let compare: Period?; let syncedAt: String? }

    static func overview(start: String, end: String) async throws -> Overview {
        try await request("/api/reports/overview?posIds=&start=\(start)&end=\(end)&compare=previous")
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
}
