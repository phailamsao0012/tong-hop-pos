import Foundation
import Observation

// Web vệ tinh trong app của sếp. App chỉ gọi web tổng: /api/app/modules (các web vệ tinh được xem) và /api/sat/hr/* (Nhân sự);
// web tổng gọi tiếp web nhân sự. Web nhân sự không bao giờ trả trường nhạy cảm (CCCD, ngân hàng, địa chỉ, mã số thuế…).
// Mô hình dữ liệu để mở: trường phụ là Optional, thiếu hay null vẫn đọc được.
extension API {
    // MARK: Web vệ tinh (tab Thêm)
    struct SatModule: Decodable, Identifiable {
        let id: String; let title: String; let subtitle: String?
        /// Tên SF Symbol.
        let icon: String?
        /// ok · down (web vệ tinh không trả lời).
        let status: String?
        /// Số việc chờ (yêu cầu chờ duyệt…); null khi mất kết nối.
        let badge: Int?
        var down: Bool { status == "down" }
    }
    struct SatModules: Decodable { let modules: [SatModule] }
    static func satModules() async throws -> [SatModule] { try await request("/api/app/modules", as: SatModules.self).modules }

    // MARK: Nhân sự (web nhân sự qua web tổng)
    enum HR {
        struct Office: Decodable, Identifiable { let id: String; let name: String }
        /// Ban / phòng / team đang dùng, theo thứ tự cây (cha trước con).
        struct Dept: Decodable, Identifiable { let id: String; let name: String; let parent_id: String?; let kind: String?; let office_id: String? }

        // Tổng quan
        struct Total: Decodable { let start: Int?; let end: Int?; let joined: Int?; let left: Int?; let turnover: Double? }
        struct OfficeStat: Decodable, Identifiable { let id: String; let name: String; let headcount: Int?; let joined: Int?; let left: Int?; let probation: Int? }
        struct DeptStat: Decodable, Identifiable {
            let id: String; let name: String; let parent_id: String?; let kind: String?; let office_id: String?
            let headcount: Int?; let joined: Int?; let left: Int?; let turnover: Double?
        }
        struct MonthPoint: Decodable { let month: String; let headcount: Int?; let joined: Int?; let left: Int? }
        /// Một người vào / nghỉ trong kỳ (phòng, chi nhánh là tên hiển thị).
        struct Flow: Decodable { let employee_id: String; let name: String?; let day: String?; let department: String?; let office: String?; let reason: String? }
        struct Overview: Decodable {
            let from: String?; let to: String?; let total: Total
            /// Đang thử việc; đang làm nhưng chưa xếp phòng; yêu cầu chờ mà người này duyệt được.
            let probation: Int?; let unplaced: Int?; let pending: Int?
            let offices: [OfficeStat]; let departments: [DeptStat]; let series: [MonthPoint]
            let joined: [Flow]; let left: [Flow]
            private enum CodingKeys: String, CodingKey { case from, to, total, probation, unplaced, pending, offices, departments, series, joined, left }
            init(from decoder: Decoder) throws {
                let c = try decoder.container(keyedBy: CodingKeys.self)
                self.from = try c.decodeIfPresent(String.self, forKey: .from)
                self.to = try c.decodeIfPresent(String.self, forKey: .to)
                total = try c.decodeIfPresent(Total.self, forKey: .total) ?? Total(start: nil, end: nil, joined: nil, left: nil, turnover: nil)
                probation = try c.decodeIfPresent(Int.self, forKey: .probation)
                unplaced = try c.decodeIfPresent(Int.self, forKey: .unplaced)
                pending = try c.decodeIfPresent(Int.self, forKey: .pending)
                offices = try c.listOrEmpty(.offices); departments = try c.listOrEmpty(.departments); series = try c.listOrEmpty(.series)
                joined = try c.listOrEmpty(.joined); left = try c.listOrEmpty(.left)
            }
        }

        // Danh sách
        struct Person: Decodable, Identifiable {
            let id: String; let code: String?; let full_name: String?; let nickname: String?; let phone: String?; let email: String?; let avatar_url: String?
            let office_id: String?; let status: String?; let status_label: String?; let joined_on: String?; let left_on: String?
            /// Phòng của vai trò chính; số vai trò kiêm nhiệm khác.
            let department_id: String?; let role_label: String?; let manager_name: String?; let concurrent: Int?
            /// Có vai trò đang mở ở một phòng còn dùng (web nhân sự gửi thì dùng; bản cũ không có).
            let placed: Bool?
            var name: String { HR.displayName(full_name, code) }
            /// Chưa xếp phòng, cùng quy tắc với số "chưa xếp phòng" ở Tổng quan. Không có `placed` thì xét phòng của vai trò chính:
            /// thiếu, hoặc phòng đã ngừng dùng (không có trong `live` = id các phòng đang dùng) đều coi là chưa xếp.
            func unplaced(in live: Set<String>) -> Bool {
                if let placed = placed { return !placed }
                guard let d = department_id else { return true }
                return !live.contains(d)
            }
        }
        struct People: Decodable { let offices: [Office]; let departments: [Dept]; let people: [Person] }

        // Hồ sơ một người
        struct Profile: Decodable {
            let id: String; let code: String?; let full_name: String?; let nickname: String?; let gender: String?; let birth_date: String?
            let phone: String?; let email: String?; let avatar_url: String?; let office_id: String?; let office_name: String?
            let joined_on: String?; let joined_source: String?; let contract_type: String?; let status: String?; let status_label: String?
            let left_on: String?; let leave_reason: String?; let leave_reason_label: String?; let official_on: String?
            let education: String?; let note: String?; let role_label: String?
            var name: String { HR.displayName(full_name, code) }
        }
        struct Assignment: Decodable, Identifiable {
            let id: String; let department_name: String?; let level_name: String?; let title_name: String?; let manager_name: String?
            let is_primary: Bool?; let start_on: String?; let end_on: String?; let open: Bool?
        }
        struct StatusEntry: Decodable { let status: String?; let status_label: String?; let effective_on: String?; let reason: String?; let note: String? }
        /// Một người trong chuỗi quản lý / cấp dưới.
        struct Brief: Decodable, Identifiable { let id: String; let full_name: String?; let role_label: String? }
        /// Yêu cầu thay đổi (thêm / đổi chức vụ, đổi trạng thái) HR gửi lên chờ duyệt.
        struct ChangeRequest: Decodable, Identifiable {
            let id: String; let employee_id: String?; let employee_name: String?; let kind: String?; let kind_label: String?; let summary: String?
            /// pending · approved · rejected
            let state: String?; let approver_name: String?; let requested_by_name: String?; let requested_at: String?
            let decided_by_name: String?; let decided_at: String?; let decision_note: String?
            /// Người đang dùng app duyệt được yêu cầu này.
            let can_decide: Bool?
        }
        struct PerfMonth: Decodable { let month: String; let revenue: Double?; let closedOrders: Double? }
        struct Lifetime: Decodable { let revenue: Double?; let closedOrders: Double?; let firstDay: String? }
        /// Hiệu suất bán hàng do web tổng tính theo tài khoản POS của người này (tháng hiện tại + 6 tháng gần nhất).
        struct Performance: Decodable {
            let posUserId: String?; let month: String?; let revenue: Double?; let closedOrders: Double?
            /// Hạng doanh thu trong bộ phận / số người có doanh thu.
            let rank: Int?; let peers: Int?
            /// Doanh thu tháng trước tính cùng số ngày.
            let prevSameDays: Double?
            let lifetime: Lifetime?; let series: [PerfMonth]?
        }
        struct PersonDetail: Decodable {
            let employee: Profile; let assignments: [Assignment]; let statusHistory: [StatusEntry]
            /// Chuỗi quản lý lên trên (gần nhất trước) và cấp dưới trực tiếp.
            let chain: [Brief]; let reports: [Brief]
            let posAccounts: [String]?; let requests: [ChangeRequest]; let performance: Performance?
            private enum CodingKeys: String, CodingKey { case employee, assignments, statusHistory, chain, reports, posAccounts, requests, performance }
            init(from decoder: Decoder) throws {
                let c = try decoder.container(keyedBy: CodingKeys.self)
                employee = try c.decode(Profile.self, forKey: .employee)
                assignments = try c.listOrEmpty(.assignments); statusHistory = try c.listOrEmpty(.statusHistory)
                chain = try c.listOrEmpty(.chain); reports = try c.listOrEmpty(.reports); requests = try c.listOrEmpty(.requests)
                posAccounts = try? c.decodeIfPresent([String].self, forKey: .posAccounts)
                // Số bán hàng web tổng tính thêm: sai định dạng cũng không làm hỏng cả hồ sơ.
                performance = try? c.decodeIfPresent(Performance.self, forKey: .performance)
            }
        }

        // Sơ đồ tổ chức
        struct Head: Decodable { let id: String; let full_name: String? }
        struct Member: Decodable, Identifiable { let id: String; let full_name: String?; let level_name: String?; let title_name: String?; let is_primary: Bool? }
        struct OrgUnit: Decodable, Identifiable {
            let id: String; let name: String; let parent_id: String?; let kind: String?; let office_id: String?; let office_name: String?
            let head: Head?; let members: [Member]
        }
        struct Org: Decodable { let units: [OrgUnit] }

        // Duyệt
        struct ChangeList: Decodable { let requests: [ChangeRequest] }
        struct Decided: Decodable { let done: Int?; let skipped: Int? }

        /// Tên hiển thị: họ tên, thiếu thì mã nhân sự.
        static func displayName(_ name: String?, _ fallback: String? = nil) -> String {
            if let name, !name.trimmingCharacters(in: .whitespaces).isEmpty { return name }
            if let fallback, !fallback.isEmpty { return fallback }
            return "Chưa có tên"
        }
    }

    /// Tổng quan quân số trong kỳ [from, to] (yyyy-MM-dd).
    static func hrOverview(from: String, to: String) async throws -> HR.Overview { try await request("/api/sat/hr/overview?from=\(from)&to=\(to)") }
    /// Mọi nhân sự (cả người đã nghỉ, app tự lọc).
    static func hrPeople() async throws -> HR.People { try await request("/api/sat/hr/people") }
    static func hrPerson(id: String) async throws -> HR.PersonDetail { try await request("/api/sat/hr/person?id=\(id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? id)") }
    static func hrOrg() async throws -> HR.Org { try await request("/api/sat/hr/org") }
    /// state: pending (đang chờ) · done (100 yêu cầu xử lý gần nhất).
    static func hrApprovals(state: String) async throws -> [HR.ChangeRequest] { try await request("/api/sat/hr/approvals?state=\(state)", as: HR.ChangeList.self).requests }
    /// Duyệt / từ chối nhiều yêu cầu; từ chối bắt buộc có lý do.
    static func hrDecide(ids: [String], approve: Bool, note: String?) async throws -> HR.Decided {
        var body: [String: Any] = ["ids": ids, "decision": approve ? "approve" : "reject"]
        if let note, !note.isEmpty { body["note"] = note }
        return try await request("/api/sat/hr/approvals", method: "POST", body: body)
    }
}

fileprivate extension KeyedDecodingContainer {
    /// Mảng thiếu hoặc null thì coi là rỗng.
    func listOrEmpty<T: Decodable>(_ key: Key) throws -> [T] { try decodeIfPresent([T].self, forKey: key) ?? [] }
}

/// Web vệ tinh hiện ở tab Thêm (Nhân sự…): trạng thái kết nối và số việc chờ cho huy hiệu.
/// Hỏi khi mở tab Thêm, sau khi duyệt, và trong vòng hỏi 5 giây của app nhưng tối đa mỗi phút một lần cho nhẹ.
@Observable final class SatelliteCenter {
    var modules: [API.SatModule] = []
    /// Đã hỏi máy chủ ít nhất một lần; lần hỏi gần nhất lỗi.
    var loaded = false
    var failed = false
    @ObservationIgnored private var lastAt: Date?
    /// Module app đã có màn riêng; module khác hiện "Cần cập nhật app để dùng".
    static let known: Set<String> = ["hr"]
    /// Tổng việc chờ trên huy hiệu tab Thêm.
    var badge: Int { modules.filter { Self.known.contains($0.id) && !$0.down }.reduce(0) { $0 + max(0, $1.badge ?? 0) } }

    /// Bỏ qua nếu vừa hỏi chưa quá maxAge giây (0 = hỏi ngay).
    @MainActor func refresh(maxAge: TimeInterval = 60) async {
        if let t = lastAt, Date.now.timeIntervalSince(t) < maxAge { return }
        lastAt = .now
        do { modules = try await API.satModules(); failed = false } catch { if !Task.isCancelled { failed = true } }
        loaded = true
    }
    @MainActor func reset() { modules = []; loaded = false; failed = false; lastAt = nil }
}
