import Foundation

// Bản thăm dò widget (plan 2.9, mục 4.5): tên App Group không bao giờ ghi cứng. App và widget tự dò theo thứ tự:
// khoá ALTAppGroups trong Info.plist; entitlement trong embedded.mobileprovision; các tên ứng viên.
// Lấy tên đầu tiên mà containerURL khác nil. Mã ở đây chạy được trong extension (không dùng UIApplication).

/// Hồ sơ ký (embedded.mobileprovision) trong gói app. Không giữ danh sách máy, chỉ đếm số máy; không giữ tên hồ sơ
/// (tên hồ sơ mua hay dùng chung có thể là tên người hoặc công ty khác).
struct ProbeProfile {
    let teamID: String?
    let appIDPrefix: String?
    let expires: Date?
    let allDevices: Bool
    let deviceCount: Int?
    let getTaskAllow: Bool?
    let appGroups: [String]
    /// keychain-access-groups của hồ sơ; profile wildcard thường có "TEAMID.*" (kênh dự phòng, plan 4.5).
    let keychainGroups: [String]

    /// Đoán loại hồ sơ: doanh nghiệp, ad hoc, phát triển, App Store.
    var kind: String {
        if allDevices { return "Doanh nghiệp (enterprise)" }
        if let n = deviceCount { return (getTaskAllow == true ? "Phát triển (development)" : "Ad hoc") + " · \(n) máy" }
        return "Phát hành (App Store / TestFlight)"
    }

    /// Đọc hồ sơ: file CMS bọc một plist XML. Lấy từ "<?xml" tới "</plist>" rồi đọc bằng PropertyListSerialization.
    static func load(_ url: URL) -> ProbeProfile? {
        guard let data = try? Data(contentsOf: url),
              let start = data.range(of: Data("<?xml".utf8)),
              let end = data.range(of: Data("</plist>".utf8), options: [], in: start.lowerBound..<data.endIndex) else { return nil }
        let xml = data.subdata(in: start.lowerBound..<end.upperBound)
        guard let p = (try? PropertyListSerialization.propertyList(from: xml, options: [], format: nil)) as? [String: Any] else { return nil }
        let ent = p["Entitlements"] as? [String: Any] ?? [:]
        return ProbeProfile(
            teamID: (p["TeamIdentifier"] as? [String])?.first,
            appIDPrefix: (p["ApplicationIdentifierPrefix"] as? [String])?.first,
            expires: p["ExpirationDate"] as? Date,
            allDevices: p["ProvisionsAllDevices"] as? Bool ?? false,
            deviceCount: (p["ProvisionedDevices"] as? [Any])?.count,
            getTaskAllow: ent["get-task-allow"] as? Bool,
            appGroups: (ent["com.apple.security.application-groups"] as? [String]) ?? [],
            keychainGroups: (ent["keychain-access-groups"] as? [String]) ?? []
        )
    }
}

enum ProbeGroup {
    /// Tên ứng viên cố định (đúng tên CI xin khi ký tạm).
    static let defaultGroup = "group.vn.megatech.tonghoppos"

    /// Đang chạy trong widget (gói .appex)?
    static var isExtension: Bool { Bundle.main.bundleURL.pathExtension == "appex" }
    /// Gói app: trong widget là thư mục chứa PlugIns (App.app/PlugIns/MegatechWidget.appex).
    static var appBundleURL: URL {
        isExtension ? Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent() : Bundle.main.bundleURL
    }
    /// Bundle id của app đang chạy; trong widget là bundle id của app chứa widget (công cụ ký có thể đổi id widget theo
    /// cách khác), không đọc được thì bỏ đuôi ".widget" của bundle id widget.
    static var appBundleID: String {
        let id = Bundle.main.bundleIdentifier ?? ""
        guard isExtension else { return id }
        if let app = Bundle(url: appBundleURL)?.bundleIdentifier, !app.isEmpty { return app }
        return id.hasSuffix(".widget") ? String(id.dropLast(".widget".count)) : id
    }

    /// Hồ sơ ký: của chính gói đang chạy, không có thì của app chứa widget. Không có hồ sơ (máy ảo, bản CI) → nil.
    static func profile() -> ProbeProfile? {
        let own = ProbeProfile.load(Bundle.main.bundleURL.appendingPathComponent("embedded.mobileprovision"))
        if own != nil || !isExtension { return own }
        return ProbeProfile.load(appBundleURL.appendingPathComponent("embedded.mobileprovision"))
    }

    /// Kết quả dò: tên dùng được (nếu có), thư mục chung, và các nguồn để màn Chẩn đoán hiện.
    struct Discovery {
        let group: String?
        let container: URL?
        let fromInfoPlist: [String]
        let fromProfile: [String]
        let profile: ProbeProfile?
    }

    static func discover() -> Discovery {
        var plist = (Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String]) ?? []
        if isExtension, let app = Bundle(url: appBundleURL), let more = app.object(forInfoDictionaryKey: "ALTAppGroups") as? [String] { plist += more }
        let prof = profile()
        let fromProfile = (prof?.appGroups ?? []).filter { !$0.contains("*") }
        let candidates = plist + fromProfile + [defaultGroup, "group." + appBundleID]
        var seen = Set<String>()
        for g in candidates where !g.isEmpty {
            guard seen.insert(g).inserted else { continue }
            if let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: g) {
                return Discovery(group: g, container: url, fromInfoPlist: plist, fromProfile: fromProfile, profile: prof)
            }
        }
        return Discovery(group: nil, container: nil, fromInfoPlist: plist, fromProfile: fromProfile, profile: prof)
    }
}
