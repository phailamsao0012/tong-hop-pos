import Foundation
import Security

/// Thử keychain cho màn Chẩn đoán widget. Chỉ đụng tới mục thử của riêng mình (service "vn.megatech.widget-probe…");
/// không bao giờ đọc, ghi hay xoá phiên đăng nhập của app (SessionStore). Màn Chẩn đoán chỉ hiện mã lỗi, không hiện nội dung.
enum ProbeKeychain {
    private static let groupService = "vn.megatech.widget-probe"
    private static let teamService = "vn.megatech.widget-probe.team"
    private static let teamGroupService = "vn.megatech.widget-probe.teamgroup"
    /// Mục đánh dấu app để lại cho widget đọc (không bí mật).
    private static let markerService = "vn.megatech.widget-probe.marker"
    /// Bản ghi lần chạy của widget khi widget không có App Group (để app đọc qua nhóm TEAMID).
    private static let runService = "vn.megatech.widget-probe.run"
    private static let account = "probe"
    private static let marker = Data("probe".utf8)

    /// Nhóm keychain dùng chung dưới tiền tố team (kênh dự phòng, plan 4.5): "TEAMID.vn.megatech.shared".
    /// Chỉ ghi được khi hồ sơ có keychain-access-groups dạng "TEAMID.*".
    static func teamGroup(_ prefix: String) -> String { prefix + ".vn.megatech.shared" }

    private static func query(_ service: String, _ group: String?) -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        if let group { q[kSecAttrAccessGroup as String] = group }
        return q
    }

    /// Ghi (hoặc ghi đè) một mục. Trả mã lỗi: 0 = được; -34018 = thiếu quyền với nhóm đó.
    @discardableResult
    private static func put(_ data: Data, service: String, group: String, accessible: CFString) -> OSStatus {
        let q = query(service, group)
        let attrs: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: accessible]
        let updated = SecItemUpdate(q as CFDictionary, attrs as CFDictionary)
        guard updated == errSecItemNotFound else { return updated }
        return SecItemAdd(q.merging(attrs) { $1 } as CFDictionary, nil)
    }

    private static func get(service: String, group: String) -> (data: Data?, status: OSStatus) {
        var q = query(service, group)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        let s = SecItemCopyMatching(q as CFDictionary, &out)
        return (s == errSecSuccess ? out as? Data : nil, s)
    }

    /// Ghi một mục thử vào nhóm `group`, đọc lại, rồi xoá. 0 = được; -34018 = thiếu quyền (errSecMissingEntitlement).
    /// Dùng WhenUnlockedThisDeviceOnly như token thật sẽ dùng (plan 4.4); app đang mở nên máy đã mở khóa.
    private static func roundTrip(service: String, group: String) -> OSStatus {
        let base = query(service, group)
        SecItemDelete(base as CFDictionary)
        let added = put(marker, service: service, group: group, accessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly)
        guard added == errSecSuccess else { return added }
        let found = get(service: service, group: group)
        let removed = SecItemDelete(base as CFDictionary)
        guard found.status == errSecSuccess else { return found.status }
        guard found.data == marker else { return errSecDecode }
        return removed
    }

    /// Ghi/đọc keychain với access group = tên App Group (đường A).
    static func testGroup(_ group: String) -> OSStatus { roundTrip(service: groupService, group: group) }

    /// Ghi/đọc keychain nhóm TEAMID.vn.megatech.shared (kênh dự phòng khi ký bằng profile wildcard).
    static func testTeamGroup(_ prefix: String) -> OSStatus { roundTrip(service: teamGroupService, group: teamGroup(prefix)) }

    /// Tiền tố team mà keychain thật sự dùng: ghi một mục thử không ghi access group, đọc lại access group mặc định
    /// (dạng "TEAMID.vn.megatech…"), lấy phần trước dấu "." đầu tiên, rồi xoá mục thử.
    static func teamPrefix() -> (prefix: String?, status: OSStatus) {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: teamService,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(base as CFDictionary)
        var add = base
        add[kSecValueData as String] = marker
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let added = SecItemAdd(add as CFDictionary, nil)
        guard added == errSecSuccess else { return (nil, added) }
        var query = base
        query[kSecReturnAttributes as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        let found = SecItemCopyMatching(query as CFDictionary, &out)
        SecItemDelete(base as CFDictionary)
        guard found == errSecSuccess else { return (nil, found) }
        guard let attrs = out as? [String: Any], let group = attrs[kSecAttrAccessGroup as String] as? String,
              let dot = group.firstIndex(of: ".") else { return (nil, errSecDecode) }
        return (String(group[..<dot]), errSecSuccess)
    }

    /// App (đã mở khóa): để lại mục đánh dấu ở nhóm App Group và ở nhóm TEAMID, với WhenUnlockedThisDeviceOnly như token
    /// thật, để widget thử đọc, cả lúc máy khóa. Nhóm nào không có quyền thì bỏ qua.
    static func leaveMarkers(group: String?, prefix: String?) {
        if let group { put(marker, service: markerService, group: group, accessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly) }
        if let prefix { put(marker, service: markerService, group: teamGroup(prefix), accessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly) }
    }

    /// Widget: đọc mục đánh dấu app để lại. 0 = đọc được; -25300 = chưa có; -25308 = máy đang khóa; -34018 = thiếu quyền.
    static func readMarker(group: String) -> OSStatus {
        let r = get(service: markerService, group: group)
        guard r.status == errSecSuccess else { return r.status }
        return r.data == marker ? errSecSuccess : errSecDecode
    }

    /// Widget không có App Group: cất bản ghi lần chạy (không có số liệu) vào nhóm TEAMID để app đọc.
    /// AfterFirstUnlockThisDeviceOnly để ghi được cả lúc máy khóa.
    static func putRun(_ data: Data, prefix: String) {
        put(data, service: runService, group: teamGroup(prefix), accessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly)
    }
    static func readRun(prefix: String) -> Data? { get(service: runService, group: teamGroup(prefix)).data }
    static func removeRun(prefix: String) { SecItemDelete(query(runService, teamGroup(prefix)) as CFDictionary) }

    /// Đăng xuất: xoá mục đánh dấu và bản ghi widget ở mọi nhóm (App Group, TEAMID, nhóm mặc định).
    static func removeProbeItems(group: String?, prefix: String?) {
        let groups: [String?] = [nil, group, prefix.map(teamGroup)]
        for service in [markerService, runService] {
            for g in groups { SecItemDelete(query(service, g) as CFDictionary) }
        }
    }

    /// Mô tả mã lỗi cho người đọc.
    static func describe(_ s: OSStatus) -> String {
        switch s {
        case errSecSuccess: return "OK"
        case -34018: return "Lỗi -34018 (thiếu quyền)"
        case errSecDuplicateItem: return "Lỗi \(s) (mục đã có)"
        case errSecItemNotFound: return "Lỗi \(s) (chưa có mục)"
        case errSecInteractionNotAllowed: return "Lỗi \(s) (máy đang khóa)"
        default: return "Lỗi \(s)"
        }
    }
}
