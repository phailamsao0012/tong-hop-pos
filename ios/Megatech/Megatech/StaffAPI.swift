import Foundation

extension API {
    /// Hợp đồng riêng cho 17C: giữ nguyên decoder và hàm hồ sơ của các màn cũ.
    struct HRProfileAchievements: Decodable {
        struct Best: Decodable { let month: ProfileMonth?; let rateMonth: ProfileMonth? }
        let profile: StaffProfileReport
        let best: Best?
        let topMonths: [ProfileMonth]?
        private enum CodingKeys: String, CodingKey { case best, topMonths }
        init(from decoder: Decoder) throws {
            profile = try StaffProfileReport(from: decoder)
            let values = try decoder.container(keyedBy: CodingKeys.self)
            best = try values.decodeIfPresent(Best.self, forKey: .best)
            topMonths = try values.decodeIfPresent([ProfileMonth].self, forKey: .topMonths)
        }
    }
    static func hrProfileAchievements(id: String) async throws -> HRProfileAchievements {
        try await request("/api/reports/staff-profile?id=\(queryValue(id))&pos=")
    }
    struct Kpi2Goal: Decodable {
        let assigned: Double?
        let closed: Double?
        let orders: Double?
        let upsellRate: Double?
        let products: [String: Double]?
    }
    struct Kpi2Report: Decodable {
        let month: String
        let items: [String: Kpi2Goal]
    }
    static func kpi2(month: String) async throws -> Kpi2Report {
        try await request("/api/kpi2?month=\(queryValue(month))")
    }
    struct ProfileTenure: Decodable {
        let joined: String
        let source: String
        let t: Int
    }
    struct StaffTenureReport: Decodable {
        let today: String
        let people: [String: ProfileTenure]
    }
    struct ProfileBadge: Decodable, Identifiable {
        let key: String
        let tier: String
        let label: String
        let note: String
        let month: String?
        var id: String { key }
    }
    struct ProfileMonth: Decodable, Identifiable {
        let month: String
        let net: Double
        let closedOrders: Double
        let rate: Double?
        let rank: Int?
        let of: Int
        var id: String { month }
    }
    struct StaffProfileReport: Decodable {
        let tenure: ProfileTenure?
        let posCreated: String?
        let firstOrderDay: String?
        let months: [ProfileMonth]
        let badges: [ProfileBadge]
        let definitions: [String: String]
    }
    static func staffTenure() async throws -> StaffTenureReport {
        try await request("/api/staff-tenure")
    }
    static func staffProfile(id: String, pos: String) async throws -> StaffProfileReport {
        try await request("/api/reports/staff-profile?id=\(queryValue(id))&pos=\(queryValue(pos))")
    }
    struct ProductGroupCell: Decodable, Identifiable {
        let label: String
        let closed: Double
        let closedNet: Double
        var id: String { label }
    }
    struct ProductGroupStaff: Decodable, Identifiable {
        let sellerId: String
        let name: String
        let groups: [String: ProductGroupValue]
        var id: String { sellerId }
    }
    struct ProductGroupValue: Decodable {
        let closed: Double
        let closedNet: Double
    }
    struct ProductGroupsReport: Decodable {
        let groups: [ProductGroupCell]
        let staff: [ProductGroupStaff]
        let definitions: [String: String]
    }
    static func saleProductGroups(start: String, end: String, pos: String, hrTeam: String?) async throws -> ProductGroupsReport {
        try await request("/api/reports/product-groups?start=\(queryValue(start))&end=\(queryValue(end))&posIds=\(queryValue(pos))&team=sale&dim=main&basis=both&by=seller" + HrUnit.suffix(hrTeam))
    }
}

/// Bộ lọc của danh sách cấu thành một ô; giữ nguyên kỳ, POS và team khi mở từ bảng (I3).
struct StaffOrderQuery: Hashable {
    let team: String
    let by: String
    let start: String
    let end: String
    let posIds: [String]
    let staffId: String
    let packed: Bool
    let hrTeam: String?
    let title: String
}

extension API {
    // Hợp đồng 4.2.1; không đọc total (gồm cả đơn chưa gán người) thay cho staffTotal của W1.
    struct StaffTable: Decodable {
        let period: StaffPeriod
        let team: String
        let staff: [StaffRow]
        let definitions: StaffDefinitions
        let orders: [PGOrder]?
        let staffTotal: StaffSum?
    }
    struct StaffPeriod: Decodable { let start: String; let end: String }
    struct StaffDefinitions: Decodable { let packed: String?; let closed: String; let rate: String }
    struct StaffRow: Decodable, Identifiable {
        let delivered: Double?
        let deliveredNet: Double?
        let paidNet: Double?
        let sellerId: String
        let name: String
        let department: String?
        let created: Double
        let createdClosed: Double
        let closed: Double
        let closedNet: Double
        let closeRate: Double?
        let aov: Double?
        let packed: Double?
        let packedRate: Double?
        let confirmedNotPacked: Double?
        let cancelledBeforePack: Double?
        let waiting: Double
        // W1 chưa có: để nil, không tự tính thay số máy chủ.
        let closedFromCreated: Double?
        let closedFromEarlier: Double?
        let createdOpen: Double?
        var id: String { sellerId }
    }
    struct StaffSum: Decodable {
        let delivered: Double?
        let deliveredNet: Double?
        let paidNet: Double?
        let people: Double
        let created: Double
        let createdClosed: Double
        let closed: Double
        let closedNet: Double
        let closeRate: Double?
        let aov: Double?
        let packed: Double?
        let packedRate: Double?
        let confirmedNotPacked: Double?
        let cancelledBeforePack: Double?
        let waiting: Double
        let closedFromCreated: Double?
        let closedFromEarlier: Double?
        let createdOpen: Double?
    }
    /// Chỉ đọc danh sách trường an toàn của 4.2.1; khóa lạ trong JSON được bỏ qua.
    struct PGOrder: Decodable, Identifiable {
        let id: String
        let orderCode: String
        let posId: String
        let posName: String
        let createdAt: String?
        let closedAt: String?
        let net: Double?
        let products: [String]

        enum CodingKeys: String, CodingKey {
            case id, posName, net, products
            case orderCode = "source_order_id"
            case posId = "pos_id"
            case createdAt = "created_at"
            // first_confirmed_at của API này là bí danh first_closed_at, không phải giờ XN kho.
            case closedAt = "first_confirmed_at"
        }
    }

    // Hợp đồng 4.2.2: số tổng, chuỗi mini và điểm biểu đồ to đều do máy chủ tính.
    struct StaffCompare: Decodable {
        let mode: String
        let step: Int
        let bucket: String
        let group: Int
        let period: StaffPeriod
        let compare: CmpPeriod
        let current: CmpSide
        let previous: CmpSide
        let staff: [CmpStaff]
        let rowsTotal: CmpTotals?
        let chart: CmpChart?
    }
    struct CmpPeriod: Decodable { let start: String; let end: String; let cutoff: String? }
    struct CmpSide: Decodable { let total: CmpCell }
    struct CmpCell: Decodable {
        let closed: Double
        let closedNet: Double
        let created: Double
        let createdClosed: Double
        let closeRate: Double?
    }
    struct CmpSeries: Decodable {
        // Điểm ngắn vẫn giữ nguyên; chỗ vẽ phải kiểm chỉ số trước khi lấy phần tử.
        let current: [[Double]]
        let previous: [[Double]]
    }
    struct CmpSeriesRate: Decodable { let current: [Double?]; let previous: [Double?] }
    struct CmpStaff: Decodable, Identifiable {
        let sellerId: String
        let current: CmpCell
        let previous: CmpCell
        let series: CmpSeries
        let seriesRate: CmpSeriesRate?
        let chart: CmpChart?
        var id: String { sellerId }
    }
    struct CmpTotals: Decodable {
        let current: CmpCell
        let previous: CmpCell
        let series: CmpSeries
        let seriesRate: CmpSeriesRate?
    }
    struct CmpChart: Decodable {
        let len: Int
        let current: [ChartPoint?]
        let previous: [ChartPoint?]
    }
    struct ChartPoint: Decodable {
        let closed: Double
        let closedNet: Double
        let closeRate: Double?
        let cumClosed: Double
        let cumClosedNet: Double
    }
    struct HrTeamItem: Decodable, Identifiable {
        let id: String
        let name: String
        let office: String?
        let dept: String
        let people: Int
        let mentor: String?
        /// Thành viên (mã tài khoản POS, tên); máy chủ cũ không có thì nil. Team MKT nhập tay có thể có id rỗng.
        let memberRefs: [MemberRef]?
        struct MemberRef: Decodable { let id: String; let name: String }
    }
    struct HrTeamList: Decodable { let teams: [HrTeamItem] }

    /// Mã hóa từng giá trị, giữ dấu phẩy phân cách POS đúng chuỗi ở plan 4.2.1–2.
    private static func staffQueryValue(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-._~"))) ?? ""
    }
    private static func staffTeamSuffix(_ hrTeam: String?) -> String {
        guard let hrTeam, !hrTeam.isEmpty else { return "" }
        return "&hrTeam=\(staffQueryValue(hrTeam))"
    }
    static func staffTablePath(start: String, end: String, posIds: [String], team: String, by: String, hrTeam: String? = nil) -> String {
        "/api/reports/product-groups?start=\(staffQueryValue(start))&end=\(staffQueryValue(end))&posIds=\(posIds.map(staffQueryValue).joined(separator: ","))&team=\(staffQueryValue(team))&dim=tag&basis=both&by=\(staffQueryValue(by))" + staffTeamSuffix(hrTeam)
    }
    static func staffTable(start: String, end: String, posIds: [String], team: String, by: String, hrTeam: String? = nil) async throws -> StaffTable {
        try await request(staffTablePath(start: start, end: end, posIds: posIds, team: team, by: by, hrTeam: hrTeam))
    }
    static func staffOrdersPath(_ q: StaffOrderQuery) -> String {
        staffTablePath(start: q.start, end: q.end, posIds: q.posIds, team: q.team, by: q.by, hrTeam: q.hrTeam)
            + "&staffId=\(staffQueryValue(q.staffId))" + (q.packed ? "&packed=1" : "")
    }
    static func staffOrders(_ q: StaffOrderQuery) async throws -> StaffTable {
        try await request(staffOrdersPath(q))
    }
    static func staffComparePath(start: String, end: String, posIds: [String], team: String, by: String, mode: String, step: Int, cstart: String? = nil, cend: String? = nil, hrTeam: String? = nil) -> String {
        let prefix = "/api/reports/staff-compare?start=\(staffQueryValue(start))&end=\(staffQueryValue(end))&posIds=\(posIds.map(staffQueryValue).joined(separator: ","))&team=\(staffQueryValue(team))&by=\(staffQueryValue(by))&mode=\(staffQueryValue(mode))"
        let range: String
        if mode == "custom" {
            // Ngày kỳ so phải lấy từ máy chủ; thiếu ngày để máy chủ báo lỗi, không tự tính kỳ so.
            range = "&cstart=\(staffQueryValue(cstart ?? ""))&cend=\(staffQueryValue(cend ?? ""))"
        } else {
            let levels = ["previous": [1, 2, 3, 4], "weekday": [1, 2, 3, 4, 8], "monthday": [1, 2, 3, 6, 12], "year": [1, 2]]
            let n = levels[mode]?.contains(step) == true ? step : 1
            range = "&step=\(n)"
        }
        return prefix + range + staffTeamSuffix(hrTeam)
    }
    static func staffCompare(start: String, end: String, posIds: [String], team: String, by: String, mode: String, step: Int, cstart: String? = nil, cend: String? = nil, hrTeam: String? = nil) async throws -> StaffCompare {
        try await request(staffComparePath(start: start, end: end, posIds: posIds, team: team, by: by, mode: mode, step: step, cstart: cstart, cend: cend, hrTeam: hrTeam))
    }
    static func hrTeams() async throws -> [HrTeamItem] {
        let sent = SessionStore.token
        var req = try makeRequest("/api/teams?list=1")
        req.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, code) = try await transfer(req, sent: sent, via: API.memoryOnlySession)
        guard (200..<300).contains(code) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            // Giữ xử lý phiên hết hạn như API.request dù lời gọi này bỏ qua bộ nhớ đệm.
            if code == 401 {
                if SessionStore.hasSession && SessionStore.token == sent {
                    NotificationCenter.default.post(name: sessionExpired, object: nil)
                }
                throw APIError(message: message ?? "Phiên đăng nhập đã hết, đăng nhập lại.", status: code)
            }
            throw APIError(message: message ?? "Máy chủ trả lỗi \(code).", status: code)
        }
        return try JSONDecoder().decode(HrTeamList.self, from: data).teams
    }
}
