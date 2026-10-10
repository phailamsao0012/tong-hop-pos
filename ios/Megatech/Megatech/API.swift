import Foundation
import UniformTypeIdentifiers

/// Gọi API của web tonghopposmegatech.io.vn. Phiên đăng nhập là cookie `thp_session`; app giữ token trong Keychain
/// (SessionStore) và tự gắn vào header Cookie, kèm X-Megatech-Client / X-Megatech-Device để máy chủ ghi đúng tên máy.
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
        c.httpCookieStorage = nil
        c.httpShouldSetCookies = false
        c.timeoutIntervalForRequest = 45
        return URLSession(configuration: c)
    }()

    /// Phiên bản app (MARKETING_VERSION + số build) gửi trong User-Agent, ví dụ "MEGATECH-iOS/0.2 (2)".
    static let userAgent: String = {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "0"
        let build = info?["CFBundleVersion"] as? String ?? "0"
        return "MEGATECH-iOS/\(version) (\(build))"
    }()

    struct APIError: LocalizedError { let message: String; var status = 0; var errorDescription: String? { message } }
    /// Máy chủ báo phiên hết hạn (401) khi app đang dùng: AuthModel nghe để quay về màn đăng nhập.
    static let sessionExpired = Notification.Name("megatech.sessionExpired")

    static func makeRequest(_ path: String, method: String = "GET", body: [String: Any]? = nil) throws -> URLRequest {
        var path = path
        // Cách tính dùng chung với web (tài khoản chọn ở "Cách tính"): gắn vào mọi báo cáo.
        if path.hasPrefix("/api/reports/") { path += (path.contains("?") ? "&" : "?") + MetricPrefs.queryString }
        let url = URL(string: path, relativeTo: base)!
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        req.setValue("ios", forHTTPHeaderField: "X-Megatech-Client")
        req.setValue(DeviceName.current, forHTTPHeaderField: "X-Megatech-Device")
        if let cookie = SessionStore.cookieHeader(for: url) { req.setValue(cookie, forHTTPHeaderField: "Cookie") }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        return req
    }

    static func request<T: Decodable>(_ path: String, method: String = "GET", body: [String: Any]? = nil, as: T.Type = T.self) async throws -> T {
        let req = try makeRequest(path, method: method, body: body)
        #if DEBUG
        // Máy thử: MEGATECH_SLOW_MS làm chậm mỗi request để xem hiệu ứng đang tải.
        if let ms = ProcessInfo.processInfo.environment["MEGATECH_SLOW_MS"].flatMap(Int.init), ms > 0 { try? await Task.sleep(for: .milliseconds(ms)) }
        #endif
        let (data, resp) = try await session.data(for: req)
        SessionStore.absorb(resp)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            if code == 401 {
                if !path.hasPrefix("/api/auth/login") && !path.hasPrefix("/api/auth/verify") && !path.hasPrefix("/api/auth/me") && !path.hasPrefix("/api/auth/reauth") && SessionStore.hasSession {
                    NotificationCenter.default.post(name: sessionExpired, object: nil)
                }
                throw APIError(message: msg ?? "Phiên đăng nhập đã hết, đăng nhập lại.", status: code)
            }
            throw APIError(message: msg ?? "Máy chủ trả lỗi \(code).", status: code)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// Tải một file (CV ứng viên…) bằng phiên đăng nhập của app về thư mục tạm để xem bằng Quick Look.
    /// Tên file: tên truyền vào → Content-Disposition → "file"; thiếu đuôi thì lấy theo Content-Type.
    static func download(_ path: String, filename: String? = nil) async throws -> URL {
        var req = try makeRequest(path)
        req.setValue("*/*", forHTTPHeaderField: "Accept")
        req.timeoutInterval = 90
        let (data, resp) = try await session.data(for: req)
        SessionStore.absorb(resp)
        let http = resp as? HTTPURLResponse
        let code = http?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            if code == 401 && SessionStore.hasSession { NotificationCenter.default.post(name: sessionExpired, object: nil) }
            throw APIError(message: msg ?? "Máy chủ trả lỗi \(code).", status: code)
        }
        let fromHeader = http?.value(forHTTPHeaderField: "Content-Disposition").flatMap { dispositionName($0) }
        var name = [filename, fromHeader].compactMap { $0?.trimmingCharacters(in: .whitespaces) }.first { !$0.isEmpty } ?? "file"
        name = name.replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: ":", with: "_")
        if (name as NSString).pathExtension.isEmpty {
            let mime = http?.mimeType ?? ""
            name += "." + (UTType(mimeType: mime)?.preferredFilenameExtension ?? "pdf")
        }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("files", isDirectory: true).appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let file = dir.appendingPathComponent(name)
        try data.write(to: file, options: .atomic)
        return file
    }
    /// filename trong header Content-Disposition (inline; filename="cv.pdf").
    private static func dispositionName(_ header: String) -> String? {
        guard let r = header.range(of: "filename=") else { return nil }
        let value = header[r.upperBound...].split(separator: ";").first.map { String($0) } ?? ""
        let s = value.trimmingCharacters(in: CharacterSet(charactersIn: "\" "))
        return s.isEmpty ? nil : s
    }

    // MARK: Đăng nhập
    struct LoginStep: Decodable {
        let step: String; let challengeId: String?; let to: String?; let minutes: Int?
        // Bước 'approve': duyệt trên app khác đang đăng nhập
        let requestId: String?; let pollToken: String?; let number: Int?; let seconds: Int?; let fallback: String?
    }
    struct Me: Decodable {
        let userId: String; let email: String; let displayName: String; let role: String; let title: String?
        let views: [String]?; let posIds: [String]?; let team: String?; let mfaEnabled: Bool?
        /// Cùng quy tắc với web (lib/access.ts): chủ hệ thống xem hết; Tuyển dụng và Nhân sự (recruit, people, person, levels, org)
        /// chỉ giám đốc; các trang chỉ chủ (config, audit, dispatch, cskh-kpi, sale-kpi) người khác không thấy.
        static let directorViews: Set<String> = ["recruit", "people", "person", "levels", "org"]
        static let ownerViews: Set<String> = ["config", "audit", "dispatch", "cskh-kpi", "sale-kpi"]
        /// Trang tự mở theo trang đã được cấp (IMPLIED trong lib/access.ts): xem được một trang ở vế phải là xem được trang ở vế trái.
        static let implied: [String: [String]] = [
            "origin": ["calls", "care"],
            "cskh-overview": ["calls", "care", "origin", "repurchase", "dormant"],
            "sale-overview": ["compare", "batches", "overview"],
            "sale-teams": ["sale-overview", "compare", "batches", "overview", "sale-analytics"],
            "cskh-teams": ["cskh-overview", "calls", "care", "origin", "repurchase", "dormant", "cskh-analytics"],
            "mkt-roas": ["marketing"],
            "products": ["overview", "center", "pipeline"],
            "van-don": ["pipeline"],
            "uncounted": ["overview"],
            "customer360": ["customers", "repurchase", "dormant", "care"],
            "sale-analytics": ["compare", "batches", "overview", "sale-overview", "shift"],
            "sale-quality": ["sale-analytics", "compare", "sale-overview"],
            "cskh-analytics": ["calls", "care", "origin", "repurchase", "dormant", "cskh-overview"],
        ]
        func canView(_ v: String) -> Bool {
            if v == "security" || v == "metrics" { return true }
            if role == "owner" { return true }
            if Self.directorViews.contains(v) { return role == "director" }
            if Self.ownerViews.contains(v) { return false }
            let granted = views ?? []
            return ([v] + (Self.implied[v] ?? [])).contains { granted.contains($0) }
        }
    }

    static func login(email: String, password: String, remember: Bool = true) async throws -> LoginStep {
        try await request("/api/auth/login", method: "POST", body: ["email": email, "password": password, "remember": remember])
    }
    static func verify(challengeId: String, code: String, kind: String) async throws -> LoginStep {
        try await request("/api/auth/verify", method: "POST", body: ["challengeId": challengeId, "code": code, "kind": kind])
    }
    struct PollResult: Decodable { let status: String }
    /// Chờ duyệt trên app khác: pending | done (đã có cookie) | denied | expired | invalid | consumed.
    static func pollLogin(id: String, pollToken: String) async throws -> PollResult {
        try await request("/api/auth/qr", method: "POST", body: ["action": "poll", "id": id, "pollToken": pollToken])
    }
    /// Không mở được app kia: nhận mã qua email thay thế.
    static func loginByEmail(id: String, pollToken: String) async throws -> LoginStep {
        try await request("/api/auth/qr", method: "POST", body: ["action": "email", "id": id, "pollToken": pollToken])
    }
    static func me() async throws -> Me {
        #if DEBUG
        // Máy thử: nạp sẵn phiên qua biến môi trường MEGATECH_SESSION (token cookie thp_session) để khỏi gõ đăng nhập trên máy ảo.
        if let t = ProcessInfo.processInfo.environment["MEGATECH_SESSION"], !t.isEmpty, SessionStore.token == nil { SessionStore.token = t }
        #endif
        return try await request("/api/auth/me")
    }
    enum Reauth { case ok, wrong(String), expired }
    /// Xác nhận lại bằng mật khẩu MEGATECH khi không dùng được Face ID (phiên còn hạn).
    static func reauth(password: String) async -> Reauth {
        do { _ = try await request("/api/auth/reauth", method: "POST", body: ["password": password]) as AnyDecodable; return .ok }
        catch let e as APIError where e.status == 401 {
            // 401: mật khẩu sai hoặc phiên đã hết hạn — hỏi /me để phân biệt.
            if let m = try? await me(), !m.userId.isEmpty { return .wrong(e.message) }
            return .expired
        } catch { return .wrong(error.localizedDescription) }
    }
    static func logout() async {
        _ = try? await request("/api/auth/logout", method: "POST", body: [:]) as [String: Bool]
        SessionStore.clear()
    }

    // MARK: Duyệt đăng nhập máy tính (QR / bước hai)
    struct Approval: Decodable, Identifiable {
        let id: String; let kind: String; let device: String?; let place: String?; let ip: String?
        let createdAt: String?; let expiresAt: String?; let choices: [Int]
    }
    struct ApprovalItem: Decodable { let item: Approval }
    struct Approvals: Decodable { let items: [Approval] }
    struct Decision: Decodable { let ok: Bool?; let status: String? }
    static func approvals() async throws -> [Approval] { try await request("/api/auth/approvals", as: Approvals.self).items }
    static func approval(id: String) async throws -> Approval {
        try await request("/api/auth/approvals?id=\(id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? id)", as: ApprovalItem.self).item
    }
    static func decide(id: String, number: Int?, approve: Bool) async throws -> Decision {
        try await request("/api/auth/approvals", method: "POST", body: ["id": id, "number": number.map { $0 as Any } ?? NSNull(), "decision": approve ? "approve" : "deny"])
    }

    // MARK: Thiết bị đang đăng nhập
    struct LoginSession: Decodable, Identifiable {
        let id: String; let userId: String; let name: String?; let email: String?; let client: String; let device: String
        let method: String?; let methodLabel: String?; let ip: String?; let place: String?
        let createdAt: String?; let lastSeenAt: String?; let expiresAt: String?; let current: Bool
    }
    struct Sessions: Decodable { let sessions: [LoginSession] }
    static func sessions(all: Bool = false) async throws -> [LoginSession] { try await request("/api/auth/sessions\(all ? "?scope=all" : "")", as: Sessions.self).sessions }
    static func revokeSession(id: String) async throws { _ = try await request("/api/auth/sessions?id=\(id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? id)", method: "DELETE") as AnyDecodable }
    static func revokeOtherSessions() async throws { _ = try await request("/api/auth/sessions?others=1", method: "DELETE") as AnyDecodable }

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
        let closedCustomers: Double?
        let closeRate: Double?
        /// Tỷ lệ chốt theo cách tính đang chọn; tỷ lệ hoàn / hủy (máy chủ tính, %).
        var rate: Double? = nil
        var assignedOrders: Double? = nil
        var returnRatio: Double? = nil
        var cancelRatio: Double? = nil
        let groups: [String: Group]
    }
    struct PosRow: Decodable { let posId: String; let closedOrders: Double; let closedNet: Double; let orders: Double; var assignedOrders: Double? = nil; var rate: Double? = nil; var returnRatio: Double? = nil; var cancelRatio: Double? = nil }
    struct EmployeeRow: Decodable, Identifiable { let sellerId: String; let name: String?; let department: String?; let orders: Double; let closedOrders: Double; let closedNet: Double; let assignedOrders: Double; let closeRate: Double?; let assignedCloseRate: Double?; let averageOrder: Double?; var rate: Double? = nil; var returnRatio: Double? = nil; var cancelRatio: Double? = nil; var id: String { sellerId } }
    struct Reconcile: Decodable { let orders: Double; let gross: Double; let net: Double; let discount: Double }
    struct SeriesRow: Decodable { let bucket: String; let posId: String; let orders: Double; let closedOrders: Double; let closedNet: Double; var rate: Double? = nil; let groups: [String: Group] }
    struct Period: Decodable { let total: Metrics; let byPos: [PosRow]; let byEmployee: [EmployeeRow]?; let series: [SeriesRow]?; let reconcile: Reconcile? }
    struct Overview: Decodable { let current: Period; let compare: Period?; let syncedAt: String? }

    static func overview(start: String, end: String, posIds: [String] = [], groupBy: String = "day", team: String = "all", compare: String = "previous", employeeIds: [String] = [], product: String = "all") async throws -> Overview {
        try await request("/api/reports/overview?posIds=\(posIds.joined(separator: ","))&start=\(start)&end=\(end)&compare=\(compare)&groupBy=\(groupBy)&team=\(team)&employeeIds=\(employeeIds.joined(separator: ","))&productSegment=\(product)")
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
        let id: String; let sourceOrderId: String; let createdAt: String?; let statusCode: Int?; let statusName: String
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
        struct Hour: Decodable { let hour: String; let received: Double; let closed: Double; let value: Double }
        struct Hours: Decodable { let start: Int; let end: Int }
    }
    static func shift(date: String, shift: String, posIds: [String] = [], team: String = "all") async throws -> Shift {
        try await request("/api/reports/shift?posIds=\(posIds.joined(separator: ","))&date=\(date)&shift=\(shift)&team=\(team)")
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
    static func pipeline(start: String, end: String, basis: String, posIds: [String] = [], team: String = "all", product: String = "all") async throws -> Pipeline {
        try await request("/api/reports/pipeline?posIds=\(posIds.joined(separator: ","))&start=\(start)&end=\(end)&basis=\(basis)&team=\(team)&productSegment=\(product)")
    }

    // MARK: Tuyển dụng
    struct Candidate: Decodable, Identifiable {
        let id: String; let fileName: String; let tab: String; let rowNum: Int
        let name: String; let phone: String?; let position: String?; let team: String?; let handler: String?
        let birthYear: String?; let receivedOn: String?; let cvUrl: String?; let status: String
        let data: [String: String]; let firstSeenAt: String; let updatedAt: String; let deletedAt: String?
        let cvViewable: Bool?
    }
    struct RecruitList: Decodable { let candidates: [Candidate]; let statusLabels: [String: String]; let sources: [RecruitSource]? }
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
    struct CallDay: Decodable { let notes: Double; let customers: Double; let orders: Double; let net: Double }
    struct CallStaff: Decodable, Identifiable { let authorId: String; let name: String; let department: String?; let assigned: Double; let notes: Double; let customers: Double; let orders: Double; let net: Double; let activeDays: Double; let byDay: [String: CallDay]?; var id: String { authorId } }
    struct CallCoverage: Decodable { let customers: Double; let notes: Double; let firstNote: String?; let lastFetch: String? }
    struct CallPeriod: Decodable { let days: [String] }
    struct Calls: Decodable { let staff: [CallStaff]; let coverage: CallCoverage?; let period: CallPeriod? }
    static func calls(start: String, end: String, team: String = "cskh") async throws -> Calls { try await request("/api/reports/calls?posIds=&start=\(start)&end=\(end)&team=\(team)") }

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
    static func repurchase(start: String, end: String, sellerId: String = "", posIds: [String] = [], team: String = "all", product: String = "all") async throws -> Repurchase {
        try await request("/api/reports/repurchase?posIds=\(posIds.joined(separator: ","))&start=\(start)&end=\(end)&sellerId=\(sellerId)&team=\(team)&productSegment=\(product)")
    }

    // MARK: Hồ sơ khách hàng (danh sách theo nhóm)
    struct CustomerRow: Decodable, Identifiable {
        let posId: String; let posName: String; let phone: String; let name: String?; let sellerName: String?
        let lastOrderAt: String?; let successOrders: Double; let successNet: Double; let lastSuccessAt: String?; let daysSinceSuccess: Double?
        var id: String { posId + ":" + phone }
    }
    struct CustomerPage: Decodable { let page: Int; let hasMore: Bool; let total: Double; let segments: [String: Double]?; let groups: [String: Double]?; let groupNets: [String: Double]?; let customers: [CustomerRow] }
    static func customers(segment: String, sort: String, q: String, page: Int, size: Int = 50) async throws -> CustomerPage {
        try await request("/api/reports/customers?posIds=&segment=\(segment)&sort=\(sort)&q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")&page=\(page)&size=\(size)")
    }

    // MARK: Data được cấp
    struct Batch: Decodable, Identifiable {
        let posId: String; let posName: String; let month: String; let sellerId: String; let sellerName: String
        let received: Double; let buyers: Double; let repeatBuyers: Double; let buyRate: Double?; let orders: Double; let net: Double
        var id: String { posId + month + sellerId }
    }
    struct Batches: Decodable { let batches: [Batch] }
    static func batches(start: String, end: String, posIds: [String] = [], team: String = "all") async throws -> Batches { try await request("/api/reports/batches?posIds=\(posIds.joined(separator: ","))&start=\(start)&end=\(end)&team=\(team)") }

    // MARK: Bảo mật
    struct Passkey: Decodable, Identifiable { let id: String; let name: String?; let created_at: String? }
    struct Device: Decodable, Identifiable { let id: String; let created_at: String?; let last_used_at: String?; let user_agent: String?; let expires_at: String?; let current: Bool }
    struct Security: Decodable { let totpEnabled: Bool; let passkeys: [Passkey]; let devices: [Device]; let mfaRequired: Bool; let mfaEnabled: Bool }
    static func security() async throws -> Security { try await request("/api/auth/security") }
    static func removeDevice(id: String) async throws { _ = try await request("/api/auth/security?device=\(id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id)", method: "DELETE") as [String: Bool] }

    // MARK: Nhật ký hoạt động
    struct AuditItem: Decodable, Identifiable { let id: String; let at: String; let email: String?; let name: String?; let action: String; let target: String?; let detail: String?; let status: Int?; let ip: String?; let device: String? }
    struct Audit: Decodable { let items: [AuditItem]; let total: Double; let page: Int; let labels: [String: String]?; let groups: [AuditGroup]? }
    struct AuditGroup: Decodable, Identifiable { let id: String; let label: String; let actions: [String] }
    static func audit(q: String, page: Int, group: String = "", from: String = "", to: String = "") async throws -> Audit { try await request("/api/audit?size=60&page=\(page)&group=\(group)&from=\(from)&to=\(to)&q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")") }
    struct ConfigAlert: Codable { var enabled: Bool; var threshold: Int; var minReceived: Int; var cooldownMinutes: Int; var shiftStart: String; var shiftEnd: String; var `repeat`: Bool; var chatId: String?; var employeeIds: [String] }
    struct ConfigShop: Decodable, Identifiable { let id: String; let name: String; let shopId: String?; let status: String?; let lastSyncAt: String?; let historyStart: String?; let lastError: String? }
    struct Config: Decodable { let alert: ConfigAlert; let shops: [ConfigShop] }
    static func config() async throws -> Config { try await request("/api/config") }
    static func saveShop(id: String, shopId: String) async throws { _ = try await request("/api/config", method: "PUT", body: ["type": "shop", "id": id, "shopId": shopId]) as Ok }
    static func saveAlert(_ a: ConfigAlert) async throws {
        let body: [String: Any] = ["type": "alert", "alert": ["enabled": a.enabled, "threshold": a.threshold, "minReceived": a.minReceived, "cooldownMinutes": a.cooldownMinutes, "shiftStart": a.shiftStart, "shiftEnd": a.shiftEnd, "repeat": a.repeat, "chatId": a.chatId ?? "", "employeeIds": a.employeeIds]]
        _ = try await request("/api/config", method: "PUT", body: body) as Ok
    }
    // Người dùng (chủ hệ thống)
    struct User: Decodable, Identifiable { let id: String; let email: String; let name: String; let role: String; let disabled: Bool; let lastLoginAt: String?; let title: String?; let views: [String]; let posIds: [String]; let team: String? }
    static func users() async throws -> [User] { try await request("/api/users") }
    static func updateUser(_ body: [String: Any]) async throws { _ = try await request("/api/users", method: "PUT", body: body) as Ok }
    static func createUser(_ body: [String: Any]) async throws { _ = try await request("/api/users", method: "POST", body: body) as AnyDecodable }
    // Team marketing
    struct MktTeam: Codable, Identifiable { var id: String; var name: String; var memberIds: [String] }
    struct MktPerson: Decodable, Identifiable { let id: String; let name: String; let department: String?; let active: Bool?; let marketer: Bool? }
    struct MktTeams: Decodable { let teams: [MktTeam]; let people: [MktPerson] }
    static func marketingTeams() async throws -> MktTeams { try await request("/api/marketing-teams") }
    static func saveMarketingTeams(_ teams: [MktTeam]) async throws { _ = try await request("/api/marketing-teams", method: "PUT", body: ["teams": teams.map { ["id": $0.id, "name": $0.name, "memberIds": $0.memberIds] }]) as AnyDecodable }
    // Telegram
    struct TgChat: Decodable, Identifiable { let chat_id: String; let name: String?; let role: String?; var id: String { chat_id } }
    struct TgRecent: Decodable, Identifiable { let id: String; let type: String?; let name: String? }
    struct TgBot: Decodable { let username: String?; let first_name: String? }
    struct Telegram: Decodable { let hasToken: Bool; let bot: TgBot?; let botError: String?; let chats: [TgRecent]; let allowed: [TgChat]; let hasPassword: Bool; let pairingCode: String? }
    static func telegram() async throws -> Telegram { try await request("/api/telegram") }
    static func telegramAction(_ body: [String: Any]) async throws { _ = try await request("/api/telegram", method: "POST", body: body) as AnyDecodable }
    // Ca cá nhân
    struct StaffSetting: Decodable, Identifiable { let userId: String; let shiftStart: Int?; let shiftEnd: Int?; var id: String { userId } }
    struct StaffSettings: Decodable { let items: [StaffSetting] }
    static func staffSettings() async throws -> StaffSettings { try await request("/api/staff-settings") }
    static func saveStaffSettings(_ items: [[String: Any]]) async throws { _ = try await request("/api/staff-settings", method: "PUT", body: ["items": items]) as StaffSettings }
    struct RecruitSource: Decodable, Identifiable { let fileId: String; let fileName: String; let lastSnapshotAt: String?; let lastChangeAt: String?; var id: String { fileId } }

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

    // MARK: Bảo mật riêng của app: đổi mật khẩu, mã ứng dụng, passkey
    struct Ok: Decodable { let ok: Bool?; let reLogin: Bool? }
    static func changePassword(current: String, next: String) async throws -> Ok { try await request("/api/auth/password", method: "PUT", body: ["current": current, "next": next]) }
    struct TotpSetup: Decodable { let secret: String; let uri: String }
    static func totpSetup() async throws -> TotpSetup { try await request("/api/auth/totp", method: "POST", body: ["action": "setup"]) }
    static func totp(action: String, code: String) async throws -> Ok { try await request("/api/auth/totp", method: "POST", body: ["action": action, "code": code]) }
    static func removePasskey(id: String) async throws { _ = try await request("/api/auth/passkey?id=\(id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id)", method: "DELETE") as Ok }
}

/// Giải mã mọi JSON (chỉ để bỏ qua kết quả).
struct AnyDecodable: Decodable { init(from decoder: Decoder) throws {} }
