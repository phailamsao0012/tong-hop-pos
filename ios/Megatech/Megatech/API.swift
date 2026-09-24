import Foundation

/// Gọi API của web tonghopposmegatech.io.vn. Phiên đăng nhập là cookie `thp_session` (HttpOnly),
/// URLSession tự lưu vào HTTPCookieStorage nên mở lại app vẫn còn đăng nhập.
enum API {
    static let base = URL(string: "https://tonghopposmegatech.io.vn")!
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
    static func me() async throws -> Me { try await request("/api/auth/me") }
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
}
