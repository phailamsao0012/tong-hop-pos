import WidgetKit
import SwiftUI
import AppIntents
import Security

struct ProbeEntry: TimelineEntry {
    let date: Date
    let state: ProbeState
}

/// Nút "Làm mới" trên widget (iOS 17, không tốn hạn mức làm mới). Bấm xong iOS tự gọi lại getTimeline.
struct ProbeRefreshIntent: AppIntent {
    static var title: LocalizedStringResource = "Làm mới"
    func perform() async throws -> some IntentResult { .result() }
}

/// Một lần widget chạy: dò App Group, đọc probe.json và mục đánh dấu app để lại trong keychain, ghi widget-run.json
/// (không có App Group thì ghi vào keychain nhóm TEAMID nếu được). Không mạng, không đụng phiên đăng nhập của app.
enum ProbeRun {
    static func record(family: WidgetFamily, at now: Date, vendorHash: String?) -> ProbeState {
        let found = ProbeGroup.discover()
        let prefix = ProbeKeychain.teamPrefix().prefix ?? found.profile?.appIDPrefix
        let read = found.container.map { ProbeStore.readAppNote($0) }
        let groupStatus = found.group.map { ProbeKeychain.readMarker(group: $0) }
        let teamStatus = prefix.map { ProbeKeychain.readMarker(group: ProbeKeychain.teamGroup($0)) }
        // Máy đang khóa: probe.json (file bảo vệ) không đọc được, hoặc keychain báo -25308.
        var locked = groupStatus == errSecInteractionNotAllowed || teamStatus == errSecInteractionNotAllowed
        if case .some(.unreadable) = read { locked = true }
        let name: String
        switch family {
        case .systemSmall: name = "systemSmall"
        case .accessoryRectangular: name = "accessoryRectangular"
        default: name = "khác"
        }
        // Máy khoá thì widget-run.json cũ (file bảo vệ) cũng không đọc được: đếm lại từ đầu, vẫn ghi nhận lần chạy lúc khoá.
        // Không có App Group thì bản ghi cũ nằm trong keychain nhóm TEAMID.
        let old: ProbeWidgetRun?
        if let container = found.container { old = ProbeStore.readWidgetRun(container) } else { old = prefix.flatMap { ProbeStore.readWidgetRun(teamPrefix: $0) } }
        var run = old ?? ProbeWidgetRun(lastRunAt: now, runs: 0, lastProtectedReadable: false, everRanWhileUnreadable: false, lastFamily: name)
        run.lastRunAt = now
        run.runs += 1
        run.lastFamily = name
        run.group = found.group
        if let vendorHash { run.vendorHash = vendorHash }
        if locked {
            // Token thật dùng WhenUnlockedThisDeviceOnly: lúc máy khóa phải không đọc được (-25308). Có nhóm nào đọc được là lộ.
            let reads = [groupStatus, teamStatus].compactMap { $0 }.filter { $0 != errSecItemNotFound }
            if !reads.isEmpty { run.lockedKeychain = reads.contains(errSecSuccess) ? errSecSuccess : reads[0] }
        } else {
            run.groupKeychain = groupStatus
            run.teamKeychain = teamStatus
        }
        let state: ProbeState
        switch read {
        case .none:
            state = .noGroup
        case .some(.ok(let note)):
            run.lastProtectedReadable = true
            state = .received(note.appWroteAt)
        case .some(.unreadable):
            run.lastProtectedReadable = false
            run.everRanWhileUnreadable = true
            state = .locked
        case .some(.missing):
            state = .waiting
        }
        if let container = found.container {
            ProbeStore.write(run, name: ProbeStore.widgetFile, container: container, fallback: true)
            // Có App Group thì bản trong keychain (nếu còn từ lần cài trước) đã cũ: xoá để app không đọc nhầm.
            if let prefix { ProbeKeychain.removeRun(prefix: prefix) }
        } else if let prefix {
            ProbeStore.writeWidgetRun(run, teamPrefix: prefix)
        }
        return state
    }

    /// Xem nhanh cho ảnh chụp (không ghi gì).
    static func peek() -> ProbeState {
        guard let container = ProbeGroup.discover().container else { return .noGroup }
        switch ProbeStore.readAppNote(container) {
        case .ok(let note): return .received(note.appWroteAt)
        case .unreadable: return .locked
        case .missing: return .waiting
        }
    }
}

struct ProbeProvider: TimelineProvider {
    func placeholder(in context: Context) -> ProbeEntry {
        ProbeEntry(date: Date(), state: .waiting)
    }

    /// Ảnh chụp (cả trong thư viện widget) hiện trạng thái thật, không ghi gì: bản thử không được giả là đã nhận dữ liệu.
    func getSnapshot(in context: Context, completion: @escaping (ProbeEntry) -> ()) {
        completion(ProbeEntry(date: Date(), state: ProbeRun.peek()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ProbeEntry>) -> ()) {
        let family = context.family
        Task {
            // UIDevice chỉ đọc trên main actor.
            let hash = await ProbeDevice.vendorHash()
            let now = Date()
            let entry = ProbeEntry(date: now, state: ProbeRun.record(family: family, at: now, vendorHash: hash))
            // 6h–22h: 30 phút một lần; 22h–6h: hẹn thẳng 6h sáng (iOS không bảo đảm đúng giờ).
            completion(Timeline(entries: [entry], policy: .after(ProbeTime.nextReload(after: now))))
        }
    }
}

struct ProbeWidgetEntryView: View {
    let entry: ProbeEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        if family == .accessoryRectangular {
            ProbeWidgetView(state: entry.state, ranAt: entry.date, family: .rectangular)
                .containerBackground(for: .widget) { Color.clear }
        } else {
            ProbeWidgetView(state: entry.state, ranAt: entry.date, family: .small, refresh: AnyView(
                Button(intent: ProbeRefreshIntent()) { ProbeWidgetView.refreshLabel }.buttonStyle(.plain)
            ))
            .containerBackground(for: .widget) { ProbeColors.paper }
        }
    }
}

struct ProbeWidget: Widget {
    let kind = "MegatechProbe"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ProbeProvider()) { entry in
            ProbeWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("MEGATECH (bản thử)")
        .description("Kiểm tra app gửi được dữ liệu sang widget")
        .supportedFamilies([.systemSmall, .accessoryRectangular])
        // View tự chừa lề (giống hệt khung xem trong app).
        .contentMarginsDisabled()
    }
}
