import SwiftUI
import UIKit
import WidgetKit
import Security

// Bản thăm dò widget (plan 2.9, mục 4.6): app gửi probe.json sang widget qua App Group, và màn "Thêm → Chẩn đoán widget"
// cho biết công cụ ký đang dùng có giữ widget, App Group, keychain theo group hay không (đường A hay đường B).
// Không có số liệu hay thông tin cá nhân.

enum WidgetProbeBridge {
    /// Gói app có widget không. Bản phát hành thường (Megatech-unsigned.ipa) đã bỏ PlugIns, nên không hiện dòng
    /// Chẩn đoán widget và không chạy gì của bản thăm dò; chỉ bản thử Megatech-widget-thu.ipa mới có.
    static let installed: Bool = {
        guard let plugins = Bundle.main.builtInPlugInsURL else { return false }
        return FileManager.default.fileExists(atPath: plugins.appendingPathComponent("MegatechWidget.appex", isDirectory: true).path)
    }()
    /// Tiền tố team dò một lần mỗi lần chạy app (dò bằng cách ghi rồi xoá một mục keychain thử).
    private static let teamPrefixOnce: String? = ProbeKeychain.teamPrefix().prefix

    /// Đã vào được app (sau Face ID, app đang mở): ghi probe.json, để lại mục đánh dấu trong keychain (nhóm App Group và
    /// nhóm TEAMID, không bí mật) cho widget thử đọc, rồi báo widget vẽ lại. Chạy nền, lỗi bỏ qua. Không có widget thì thôi.
    static func appUnlocked() {
        guard installed else { return }
        Task.detached(priority: .utility) {
            let found = ProbeGroup.discover()
            if let container = found.container { ProbeStore.writeAppNote(container) }
            ProbeKeychain.leaveMarkers(group: found.group, prefix: teamPrefixOnce)
            await MainActor.run { WidgetCenter.shared.reloadAllTimelines() }
        }
    }
    /// Đăng xuất / đổi tài khoản / phiên hết hạn: xoá thư mục widget-probe trong App Group và các mục thử trong keychain.
    /// Chạy cả khi gói không có widget, để dọn phần bản thử để lại nếu anh cài bản thường đè lên bản thử.
    static func purge() {
        let found = ProbeGroup.discover()
        if let container = found.container { ProbeStore.purge(container) }
        ProbeKeychain.removeProbeItems(group: found.group, prefix: teamPrefixOnce)
        Task { @MainActor in WidgetCenter.shared.reloadAllTimelines() }
    }
}

/// Dòng "Chẩn đoán widget" ở tab Thêm.
struct WidgetDiagnosticsRow: View {
    var body: some View {
        NavigationLink { WidgetDiagnosticsView() } label: {
            HStack(spacing: 12) {
                MetricIcon("square.grid.2x2.fill", size: 14).foregroundStyle(Color.brand).frame(width: 34, height: 34).background(Color.brandSoft, in: .rect(cornerRadius: 9))
                Text("Chẩn đoán widget").font(.system(size: 14, weight: .medium)).foregroundStyle(Color.ink)
                Spacer(); Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft)
            }.padding(12).contentShape(.rect)
        }
        .buttonStyle(.plain)
        .background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
    }
}

/// Một dòng kết quả: ok true = đạt (dấu tích), false = không đạt (dấu chéo), nil = chỉ để biết.
struct WidgetCheckRow: Identifiable {
    let id: Int
    let label: String
    let value: String
    let ok: Bool?
}

/// Kết luận của màn Chẩn đoán: đường A chỉ khi cả app và widget cùng dùng được App Group và keychain theo group.
enum WidgetVerdict {
    case pathA, pathB, pending, noWidget
}

struct WidgetCheckReport {
    let rows: [WidgetCheckRow]
    let verdict: WidgetVerdict
    let at: Date
    var conclusion: String {
        switch verdict {
        case .pathA: return "Đường A dùng được: app gửi dữ liệu thẳng sang widget"
        case .pathB: return "Cần đường B: ghép nối qua máy chủ"
        case .pending: return "Chưa chốt: thêm widget ra màn hình chính, chờ widget chạy rồi bấm Làm mới. Widget ghi \"Không có App Group\" thì cần đường B"
        case .noWidget: return "Không có widget: công cụ ký đã gỡ widget khỏi app"
        }
    }
    /// Chữ thường để gửi lại qua tin nhắn.
    var text: String {
        var lines = ["Chẩn đoán widget MEGATECH · \(ProbeTime.dayTime(at))"]
        for r in rows { lines.append("\(r.ok == true ? "✓" : r.ok == false ? "✗" : "·") \(r.label): \(r.value)") }
        lines.append("Kết luận: \(conclusion)")
        return lines.joined(separator: "\n")
    }
}

enum WidgetCheck {
    /// Chạy mọi phép kiểm (không mạng). Gọi khi app đang mở và đã mở khóa: ghi luôn probe.json và mục đánh dấu để widget nhận.
    static func run() async -> WidgetCheckReport {
        var rows: [WidgetCheckRow] = []
        func add(_ label: String, _ value: String, _ ok: Bool?) { let n = rows.count; rows.append(WidgetCheckRow(id: n, label: label, value: value, ok: ok)) }
        let fm = FileManager.default
        let info = Bundle.main.infoDictionary ?? [:]
        let version = info["CFBundleShortVersionString"] as? String ?? "?"
        let build = info["CFBundleVersion"] as? String ?? "?"
        let appID = Bundle.main.bundleIdentifier ?? "?"
        add("Phiên bản app", "\(version) (\(build))", nil)
        add("Bundle id app", appID, nil)

        // Widget có còn trong app không (công cụ ký có thể gỡ PlugIns).
        let plugins = Bundle.main.bundleURL.appendingPathComponent("PlugIns", isDirectory: true)
        let appex = plugins.appendingPathComponent("MegatechWidget.appex", isDirectory: true)
        let hasWidget = fm.fileExists(atPath: appex.path)
        if hasWidget, let ext = Bundle(url: appex) {
            add("Có widget trong app", "Có", true)
            let id = ext.bundleIdentifier ?? "?"
            let v = ext.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
            let b = ext.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?"
            add("Bundle id widget", id, id.hasPrefix(appID + "."))
            add("Phiên bản widget", "\(v) (\(b))", v == version && b == build)
        } else {
            let others = ((try? fm.contentsOfDirectory(atPath: plugins.path)) ?? []).sorted()
            add("Có widget trong app", others.isEmpty ? "Không (công cụ ký có thể đã gỡ)" : "Không thấy MegatechWidget.appex (có: \(others.joined(separator: ", ")))", false)
        }

        // Hồ sơ ký và App Group. Không hiện tên hồ sơ (có thể là tên người hoặc công ty khác).
        let found = ProbeGroup.discover()
        let profile = found.profile
        let team = ProbeKeychain.teamPrefix()
        let prefix = team.prefix ?? profile?.appIDPrefix
        add("Tiền tố team (hồ sơ)", profile.map { $0.appIDPrefix ?? $0.teamID ?? "Không ghi" } ?? "Không có hồ sơ", profile == nil ? nil : true)
        add("Tiền tố team (keychain)", team.prefix ?? ProbeKeychain.describe(team.status), team.prefix != nil)
        if let p = profile {
            add("Hồ sơ ký: loại", p.kind, nil)
            if let exp = p.expires { add("Hồ sơ ký: hạn", ProbeTime.day(exp), exp > Date()) } else { add("Hồ sơ ký: hạn", "Không ghi", nil) }
            // keychain-access-groups: chỉ hiện nhóm dạng "TEAMID.*" (kênh dự phòng), nhóm riêng chỉ đếm (có thể mang tên công ty khác).
            let wild = p.keychainGroups.filter { $0.split(separator: ".", maxSplits: 1).last == "*" }
            let others = p.keychainGroups.count - wild.count
            add("Nhóm keychain TEAMID.* trong hồ sơ", wild.isEmpty ? (others > 0 ? "Không (có \(others) nhóm riêng)" : "Không") : wild.joined(separator: ", "), nil)
        } else {
            add("Hồ sơ ký", "Không có hồ sơ (máy ảo hoặc bản chưa ký lại)", nil)
        }
        add("App Group trong hồ sơ", found.fromProfile.isEmpty ? "Không có" : found.fromProfile.joined(separator: ", "), !found.fromProfile.isEmpty)
        add("App Group trong ALTAppGroups", found.fromInfoPlist.isEmpty ? "Không có" : found.fromInfoPlist.joined(separator: ", "), nil)
        add("App Group dùng được", found.group ?? "Không có", found.group != nil)

        var folderOK = false
        if let container = found.container {
            folderOK = ProbeStore.writeAppNote(container)
            if case .ok = ProbeStore.readAppNote(container) {} else { folderOK = false }
            add("Thư mục chung", folderOK ? "Có, ghi và đọc được" : "Có, nhưng ghi hoặc đọc không được", folderOK)
        } else {
            add("Thư mục chung", "Không có", false)
        }

        var keychainOK = false
        if let group = found.group {
            let s = ProbeKeychain.testGroup(group)
            keychainOK = s == errSecSuccess
            add("Ghi/đọc keychain theo group", ProbeKeychain.describe(s), keychainOK)
        } else {
            add("Ghi/đọc keychain theo group", "Không thử (không có App Group)", false)
        }

        // Kênh dự phòng (plan 4.5): nhóm keychain TEAMID.vn.megatech.shared, chỉ được khi hồ sơ có "TEAMID.*".
        if let prefix {
            let s = ProbeKeychain.testTeamGroup(prefix)
            add("Ghi/đọc keychain nhóm TEAMID", ProbeKeychain.describe(s), s == errSecSuccess)
        } else {
            add("Ghi/đọc keychain nhóm TEAMID", "Không thử (không có tiền tố team)", false)
        }
        // Mục đánh dấu (WhenUnlockedThisDeviceOnly như token thật) để widget thử đọc ở lần chạy sau, cả lúc máy khóa.
        ProbeKeychain.leaveMarkers(group: found.group, prefix: prefix)

        // Widget đã chạy chưa: widget ghi widget-run.json mỗi lần chạy; không có App Group thì ghi vào keychain nhóm TEAMID.
        let fileRun = found.container.flatMap { ProbeStore.readWidgetRun($0) }
        var keyRun: ProbeWidgetRun? = nil
        if fileRun == nil, let prefix { keyRun = ProbeStore.readWidgetRun(teamPrefix: prefix) }
        let appHash = await ProbeDevice.vendorHash()
        if let r = fileRun ?? keyRun {
            let family = r.lastFamily == "systemSmall" ? "cỡ nhỏ" : r.lastFamily == "accessoryRectangular" ? "màn khóa" : r.lastFamily
            add("Widget chạy gần nhất", "\(ProbeTime.dayTime(r.lastRunAt)) · \(r.runs) lần · \(family)", true)
            add("App Group widget dùng", r.group ?? "Không có", r.group != nil && r.group == found.group)
            add("Widget từng chạy lúc máy khóa", r.everRanWhileUnreadable || r.lockedKeychain != nil ? "Có" : "Chưa thấy", nil)
            add("Widget đọc được file bảo vệ", r.lastProtectedReadable ? "Có" : "Không", r.lastProtectedReadable)
            add("Widget đọc keychain theo group", widgetRead(r.groupKeychain), readOK(r.groupKeychain))
            add("Widget đọc keychain nhóm TEAMID", widgetRead(r.teamKeychain), readOK(r.teamKeychain))
            add("Widget đọc keychain lúc máy khóa", lockedRead(r.lockedKeychain), lockedOK(r.lockedKeychain))
            let same: Bool? = appHash != nil && r.vendorHash != nil ? appHash == r.vendorHash : nil
            add("Mã máy (băm) app / widget", "\(appHash ?? "—") / \(r.vendorHash ?? "—")", same)
        } else {
            add("Widget chạy gần nhất", "Chưa chạy, hãy thêm widget ra màn hình chính", false)
            for label in ["Widget từng chạy lúc máy khóa", "Widget đọc được file bảo vệ", "Widget đọc keychain theo group",
                          "Widget đọc keychain nhóm TEAMID", "Widget đọc keychain lúc máy khóa"] {
                add(label, "Chưa rõ", nil)
            }
            add("Mã máy (băm) app / widget", "\(appHash ?? "—") / chưa có", nil)
        }

        // Đường A cần cả hai phía: app ghi/đọc được thư mục chung và keychain theo group, widget cùng group và đọc được
        // mục đánh dấu theo group. Widget chưa chạy (hoặc chưa đọc lại) thì chưa chốt.
        let verdict: WidgetVerdict
        if !hasWidget {
            verdict = .noWidget
        } else if found.container == nil || !folderOK || !keychainOK {
            verdict = .pathB
        } else if let r = fileRun, r.group != nil {
            if r.group != found.group {
                verdict = .pathB
            } else if r.groupKeychain == errSecSuccess {
                verdict = .pathA
            } else if let s = r.groupKeychain, s != errSecItemNotFound && s != errSecInteractionNotAllowed {
                verdict = .pathB
            } else {
                verdict = .pending
            }
        } else if keyRun != nil {
            // Widget ghi qua keychain TEAMID nghĩa là widget không có App Group.
            verdict = .pathB
        } else {
            verdict = .pending
        }

        await MainActor.run { WidgetCenter.shared.reloadAllTimelines() }
        return WidgetCheckReport(rows: rows, verdict: verdict, at: Date())
    }

    /// Widget đọc mục đánh dấu app để lại (lúc máy không khóa).
    private static func widgetRead(_ s: Int32?) -> String {
        guard let s else { return "Chưa rõ" }
        switch s {
        case errSecSuccess: return "Có"
        case errSecItemNotFound: return "Chưa thấy mục (-25300), mở app rồi chờ widget chạy lại"
        default: return "Không · \(ProbeKeychain.describe(s))"
        }
    }
    /// 0 = đạt; chưa có mục hoặc máy đang khóa = chưa rõ; lỗi khác = không đạt.
    private static func readOK(_ s: Int32?) -> Bool? {
        guard let s, s != errSecItemNotFound, s != errSecInteractionNotAllowed else { return nil }
        return s == errSecSuccess
    }
    /// Lúc máy khóa widget phải không đọc được token (-25308 là đúng mong đợi).
    private static func lockedRead(_ s: Int32?) -> String {
        guard let s else { return "Chưa thấy lần chạy lúc máy khóa" }
        switch s {
        case errSecInteractionNotAllowed: return "Không (-25308), đúng như mong đợi"
        case errSecSuccess: return "Có: token sẽ đọc được khi máy khóa"
        default: return "Chưa rõ · \(ProbeKeychain.describe(s))"
        }
    }
    private static func lockedOK(_ s: Int32?) -> Bool? {
        switch s {
        case .some(errSecInteractionNotAllowed): return true
        case .some(errSecSuccess): return false
        default: return nil
        }
    }
}

struct WidgetDiagnosticsView: View {
    @State private var report: WidgetCheckReport?
    @State private var busy = false
    @State private var copied = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let r = report {
                    VStack(spacing: 0) {
                        ForEach(r.rows) { row in
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                mark(row.ok)
                                Text(row.label).font(.system(size: 13, weight: .medium)).foregroundStyle(Color.ink)
                                Spacer(minLength: 8)
                                Text(row.value).font(.system(size: 12)).foregroundStyle(Color.inkSoft).multilineTextAlignment(.trailing).textSelection(.enabled)
                            }
                            .padding(.horizontal, 12).padding(.vertical, 10)
                            if row.id < r.rows.count - 1 { Divider().padding(.leading, 36) }
                        }
                    }
                    .background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Kết luận").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.inkSoft)
                        Text(r.conclusion).font(.system(size: 15, weight: .bold)).foregroundStyle(r.verdict == .pathA ? Color.good : Color.warn)
                    }
                    .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                    PrimaryButton(title: copied ? "Đã sao chép" : "Sao chép kết quả", icon: copied ? "checkmark" : "doc.on.doc") {
                        UIPasteboard.general.string = r.text
                        copied = true
                    }
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(40)
                }
                Text("Không có số liệu hay thông tin cá nhân trong màn này").font(.system(size: 11)).foregroundStyle(Color.inkSoft)
            }
            .padding(16)
        }
        .navigationTitle("Chẩn đoán widget").navigationBarTitleDisplayMode(.inline).brandNav()
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(busy ? "Đang kiểm…" : "Làm mới") { Task { await check() } }.disabled(busy)
            }
        }
        .task { await check() }
    }

    @MainActor private func check() async {
        guard !busy else { return }
        busy = true; copied = false
        report = await WidgetCheck.run()
        busy = false
    }

    @ViewBuilder private func mark(_ ok: Bool?) -> some View {
        switch ok {
        case .some(true): Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.good)
        case .some(false): Image(systemName: "xmark.circle.fill").foregroundStyle(Color.bad)
        case .none: Image(systemName: "info.circle").foregroundStyle(Color.inkSoft)
        }
    }
}
