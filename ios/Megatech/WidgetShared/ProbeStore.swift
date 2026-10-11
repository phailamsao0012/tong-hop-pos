import Foundation

/// App ghi khi người dùng đã vào được app (sau Face ID). Không có số liệu.
struct ProbeAppNote: Codable {
    var appWroteAt: Date
    var appVersion: String
    var appBuild: String
}

/// Widget ghi mỗi lần chạy, để màn Chẩn đoán trong app đọc.
struct ProbeWidgetRun: Codable {
    var lastRunAt: Date
    var runs: Int
    /// Lần chạy gần nhất đọc được probe.json (file bảo vệ .completeFileProtection).
    var lastProtectedReadable: Bool
    /// Có lần chạy nào thấy probe.json mà không đọc được (máy đang khoá).
    var everRanWhileUnreadable: Bool
    var lastFamily: String
    // Các trường dưới đây thêm sau, đều là optional để file cũ vẫn đọc được.
    /// Tên App Group widget dò được (nil: widget không có App Group).
    var group: String? = nil
    /// 8 ký tự đầu SHA-256 của identifierForVendor phía widget (không giữ giá trị gốc).
    var vendorHash: String? = nil
    /// Mã lỗi lần đọc mục đánh dấu gần nhất lúc máy không khóa: nhóm App Group, nhóm TEAMID. 0 = đọc được.
    var groupKeychain: Int32? = nil
    var teamKeychain: Int32? = nil
    /// Mã lỗi đọc mục đánh dấu (WhenUnlockedThisDeviceOnly) ở lần chạy lúc máy khóa. -25308 = không đọc được (đúng mong đợi).
    var lockedKeychain: Int32? = nil
}

/// File dùng chung trong thư mục "widget-probe" của App Group. Mọi lỗi đọc / ghi đều bỏ qua (trả nil / false).
enum ProbeStore {
    static let folderName = "widget-probe"
    static let appFile = "probe.json"
    static let widgetFile = "widget-run.json"

    /// Kết quả đọc probe.json: chưa có file, có mà không đọc được (máy khoá), hoặc đọc được.
    enum Read { case missing, unreadable, ok(ProbeAppNote) }

    static func folder(_ container: URL) -> URL { container.appendingPathComponent(folderName, isDirectory: true) }

    private static let encoder: JSONEncoder = { let e = JSONEncoder(); e.dateEncodingStrategy = .iso8601; return e }()
    private static let decoder: JSONDecoder = { let d = JSONDecoder(); d.dateDecodingStrategy = .iso8601; return d }()

    /// Ghi .atomic + .completeFileProtection. fallback: máy khoá thì không tạo được file bảo vệ đầy đủ, ghi bảo vệ
    /// tới lần mở khoá đầu (chỉ dùng cho widget-run.json, không có số liệu).
    @discardableResult
    static func write<T: Encodable>(_ value: T, name: String, container: URL, fallback: Bool = false) -> Bool {
        let dir = folder(container)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        guard let data = try? encoder.encode(value) else { return false }
        let url = dir.appendingPathComponent(name)
        if (try? data.write(to: url, options: [.atomic, .completeFileProtection])) != nil { return true }
        guard fallback else { return false }
        return (try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])) != nil
    }

    static func read<T: Decodable>(_ type: T.Type, name: String, container: URL) -> T? {
        guard let data = try? Data(contentsOf: folder(container).appendingPathComponent(name)) else { return nil }
        return try? decoder.decode(type, from: data)
    }

    /// Đọc probe.json, phân biệt "chưa có" với "có mà không đọc được" (file bảo vệ khi máy đang khoá).
    static func readAppNote(_ container: URL) -> Read {
        let url = folder(container).appendingPathComponent(appFile)
        guard FileManager.default.fileExists(atPath: url.path) else { return .missing }
        guard let data = try? Data(contentsOf: url) else { return .unreadable }
        guard let note = try? decoder.decode(ProbeAppNote.self, from: data) else { return .missing }
        return .ok(note)
    }

    /// App: ghi probe.json (giờ ghi, phiên bản app).
    @discardableResult
    static func writeAppNote(_ container: URL, at date: Date = Date()) -> Bool {
        let info = Bundle.main.infoDictionary ?? [:]
        let note = ProbeAppNote(appWroteAt: date,
                                appVersion: info["CFBundleShortVersionString"] as? String ?? "?",
                                appBuild: info["CFBundleVersion"] as? String ?? "?")
        return write(note, name: appFile, container: container)
    }

    static func readWidgetRun(_ container: URL) -> ProbeWidgetRun? { read(ProbeWidgetRun.self, name: widgetFile, container: container) }

    /// Widget không có App Group: bản ghi lần chạy nằm trong keychain nhóm TEAMID (nếu hồ sơ cho phép).
    static func writeWidgetRun(_ run: ProbeWidgetRun, teamPrefix: String) {
        guard let data = try? encoder.encode(run) else { return }
        ProbeKeychain.putRun(data, prefix: teamPrefix)
    }
    static func readWidgetRun(teamPrefix: String) -> ProbeWidgetRun? {
        guard let data = ProbeKeychain.readRun(prefix: teamPrefix) else { return nil }
        return try? decoder.decode(ProbeWidgetRun.self, from: data)
    }

    /// Xoá cả thư mục widget-probe (đăng xuất, đổi tài khoản, phiên hết hạn).
    static func purge(_ container: URL) { try? FileManager.default.removeItem(at: folder(container)) }
}
