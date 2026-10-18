import SwiftUI

/// Chỉ sống trong AppNav của lần đăng nhập hiện tại, không ghi vào NavMemory.
struct HrUnit: Hashable {
    let id: String
    let name: String
    let dept: String
    var shortName: String { name.components(separatedBy: " · ").last ?? name }
    static func applies(_ unit: HrUnit?, to dept: String) -> HrUnit? {
        guard let unit, dept == "all" || unit.dept == dept else { return nil }
        return unit
    }
    static func notice(for pageId: String) -> Bool {
        !["compare", "cskh-overview", "config", "audit", "security", "metrics", "app-settings"].contains(pageId)
    }
    static func serverMessage(_ error: Error, applied: HrUnit?) -> String? {
        guard applied != nil, let error = error as? API.APIError, error.status == 400 else { return nil }
        return error.message
    }
    static func suffix(_ id: String?) -> String {
        guard let id, !id.isEmpty else { return "" }
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
        return "&hrTeam=" + (id.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")
    }
}

struct HrTeamChip: View {
    @Environment(AppNav.self) private var nav: AppNav?
    @Environment(AuthModel.self) private var auth
    @State private var open = false
    private var allowed: Bool { ["sale-teams", "cskh-teams", "van-don"].contains { auth.me?.canView($0) == true } }
    var body: some View {
        if allowed {
            Button { open = true } label: { Pill(title: nav?.hrUnit?.shortName ?? "Team", icon: "person.2", on: nav?.hrUnit != nil, chevron: false) }
                .buttonStyle(.plain).accessibilityLabel("Team: \(nav?.hrUnit?.shortName ?? "Team")")
                .sheet(isPresented: $open) { HrTeamSheet() }
                #if DEBUG
                .onChange(of: DebugTap.shared.tick) { _, _ in
                    if DebugTap.shared.target == "team-mo" { open = true }
                }
                #endif
        }
    }
}

struct HrTeamSheet: View {
    @Environment(AppNav.self) private var nav: AppNav?
    @Environment(\.dismiss) private var dismiss
    @State private var teams: [API.HrTeamItem] = []
    @State private var error: String?
    @State private var loading = true
    private func office(_ t: API.HrTeamItem) -> String { t.office.flatMap { $0.isEmpty ? nil : $0 } ?? "Khác" }
    private var ordered: [API.HrTeamItem] {
        ["sale", "cskh"].flatMap { dept in
            teams.filter { $0.dept == dept }.sorted {
                let a = office($0), b = office($1)
                return (a == b ? $0.name : a).compare(a == b ? $1.name : b, locale: Locale(identifier: "vi")) == .orderedAscending
            }
        }
    }
    private struct Group: Identifiable {
        let id: String
        let title: String
        let teams: [API.HrTeamItem]
    }
    private var groups: [Group] {
        var result: [Group] = []
        for dept in ["sale", "cskh"] {
            let branches = Set(teams.filter { $0.dept == dept }.map(office)).sorted { $0.compare($1, locale: Locale(identifier: "vi")) == .orderedAscending }
            for branch in branches {
                let department: String = dept == "sale" ? "Sale" : "CSKH"
                let label: String = "\(department) · \(branch)"
                result.append(Group(id: "\(dept):\(branch)", title: label,
                                    teams: ordered.filter { $0.dept == dept && office($0) == branch }))
            }
        }
        return result
    }
    private func teamDetail(_ team: API.HrTeamItem) -> String {
        let people: String = Fmt.int(Double(team.people))
        let mentor: String = team.mentor.map { " · Mentor \($0)" } ?? ""
        return "\(people) người\(mentor)"
    }
    private func teamRow(_ t: API.HrTeamItem) -> some View {
        Button { pick(t) } label: {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(t.name)
                    Text(teamDetail(t))
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if nav?.hrUnit?.id == t.id { Image(systemName: "checkmark") }
            }
        }
    }
    var body: some View {
        NavigationStack {
            List {
                Button("Mọi team") { pick(nil) }
                if loading { StateView(loading: "Đang tải team…") }
                if let error { StateView(error: error) { await load() } }
                ForEach(groups) { group in
                    Section(group.title) {
                        ForEach(group.teams) { t in teamRow(t) }
                    }
                }
            }
            .navigationTitle("Team").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Đóng") { dismiss() } } }
            .task { await load() }
            .refreshable { await load() }
            #if DEBUG
            .onChange(of: DebugTap.shared.tick) { _, _ in
                let target = DebugTap.shared.target
                if target == "team-chon" || target == "team-chon-cskh" {
                    if let t = ordered.first(where: { $0.dept == (target == "team-chon" ? "sale" : "cskh") }) { pick(t) }
                }
            }
            #endif
        }.tint(Palette.accent).presentationCornerRadius(28).presentationBackground(Palette.card).presentationDragIndicator(.visible)
    }
    private func pick(_ t: API.HrTeamItem?) {
        nav?.hrUnit = t.map { HrUnit(id: $0.id, name: $0.name, dept: $0.dept) }
        #if DEBUG
        TeamTourStatus.chosen = t != nil
        #endif
        dismiss()
    }
    @MainActor private func load() async {
        loading = true; error = nil
        defer { loading = false }
        do {
            let result = try await API.hrTeams()
            try Task.checkCancellation()
            teams = result
            // Cập nhật tên team đang chọn ngay khi mở lại danh sách.
            if let id = nav?.hrUnit?.id, let t = result.first(where: { $0.id == id }) {
                nav?.hrUnit = HrUnit(id: t.id, name: t.name, dept: t.dept)
            }
            #if DEBUG
            if TeamTourStatus.enabled {
                print("[TEAM] ds team=\(Fmt.int(Double(ordered.count))) nguoi=\(ordered.map { Fmt.int(Double($0.people)) }.joined(separator: ","))")
                TeamTourStatus.hasCskh = ordered.contains { $0.dept == "cskh" }
                TeamTourStatus.listReady = true; fflush(stdout)
            }
            #endif
        } catch { if let text = LoadError.text(error) { self.error = text } }
    }
}

struct HrTeamNotice: View {
    let applies: Bool
    let deptLabel: String
    @Environment(AppNav.self) private var nav: AppNav?
    var body: some View {
        if let unit = nav?.hrUnit {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "person.2.fill").foregroundStyle(Palette.hr)
                    Text(applies ? "Đang xem riêng team \(unit.name)" : "Trang này chưa lọc theo team \(unit.name)")
                        .font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink)
                    InfoButton(InfoText(title: "Team", body: applies
                     ? "Đang xem riêng team \(unit.name) — số trên trang chỉ tính người đang thuộc team này bên web nhân sự (theo team hiện tại: người chuyển team thì số các kỳ trước đi theo team mới; người đã nghỉ không tính)."
                     : "Trang này chưa lọc được theo team — đang hiện số cả nhóm \(deptLabel), không riêng team \(unit.name). Xem theo team ở Tổng quan, Sale › Nhân viên, CSKH › Tổng quan và Vận đơn."))
                }
                Button("Bỏ chọn team") { nav?.hrUnit = nil }
                    .font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink).padding(.horizontal, 10).padding(.vertical, 7)
                    .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.line) }
            }.fixedSize(horizontal: false, vertical: true).padding(12)
                .background(Palette.wash, in: .rect(cornerRadius: 16))
                .overlay(alignment: .leading) { UnevenRoundedRectangle(topLeadingRadius: 2, bottomLeadingRadius: 2).fill(Palette.hr).frame(width: 3).padding(.vertical, 12) }
                #if DEBUG
                .onChange(of: DebugTap.shared.tick) { _, _ in
                    if DebugTap.shared.target == "team-bo" { nav?.hrUnit = nil }
                }
                #endif
        }
    }
}

struct HrTeamErrorView: View {
    let message: String
    let clear: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(message).foregroundStyle(Palette.bad)
            Button("Bỏ chọn team", action: clear)
                .font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink).padding(.horizontal, 10).padding(.vertical, 7)
                .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.line) }
        }.font(.subheadline).fixedSize(horizontal: false, vertical: true)
    }
}

extension View {
    func hrNotice(dept: String, enabled: Bool = true) -> some View {
        modifier(HrNoticeModifier(dept: dept, enabled: enabled))
    }
}

private struct HrNoticeModifier: ViewModifier {
    let dept: String
    let enabled: Bool
    @Environment(AppNav.self) private var nav: AppNav?
    @ViewBuilder func body(content: Content) -> some View {
        if enabled, nav?.hrUnit != nil {
            content.safeAreaInset(edge: .top, spacing: 0) {
                HrTeamNotice(applies: false, deptLabel: dept)
                    .padding(.horizontal, 16).padding(.vertical, 8).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Palette.bg)
            }
        } else {
            content
        }
    }
}

#if DEBUG
@MainActor enum TeamTourStatus {
    static var enabled: Bool { ProcessInfo.processInfo.environment["MEGATECH_TOUR"] == "team" }
    static var hasCskh = false
    static var listReady = false
    static var chosen = false
    static var tableReady = false
    static var overviewReady = false
    static var vanDonReady = false
    static var cskhReady = false
}
#endif
