import SwiftUI

// Nhân sự (web vệ tinh) trong app của sếp — toàn bộ là màn riêng, không mở web:
// Tổng quan quân số · Danh sách · Hồ sơ một người · Sơ đồ tổ chức · Duyệt thay đổi · Tuyển dụng.
// Số liệu lấy qua web tổng (/api/sat/hr/*), không có trường nhạy cảm (CCCD, ngân hàng, địa chỉ…).

/// Kỳ xem tổng quan nhân sự.
enum HRPeriod: String, CaseIterable {
    case month, last, m3, m6, year
    var title: String {
        switch self {
        case .month: return "Tháng này"
        case .last: return "Tháng trước"
        case .m3: return "3 tháng"
        case .m6: return "6 tháng"
        case .year: return "Năm nay"
        }
    }
    /// (từ ngày, đến ngày) dạng yyyy-MM-dd theo giờ Việt Nam.
    var range: (String, String) {
        let today = VNDate.string(.now)
        let ym = String(today.prefix(7))
        switch self {
        case .month: return (VNDate.monthStart(), today)
        case .last: return VNDate.lastMonth()
        case .m3: return (VNDate.shiftMonth(ym, -2) + "-01", today)
        case .m6: return (VNDate.shiftMonth(ym, -5) + "-01", today)
        case .year: return (String(today.prefix(4)) + "-01-01", today)
        }
    }
}

/// Nhãn, màu, định dạng dùng chung cho các màn Nhân sự.
enum HRText {
    static func tone(_ status: String?) -> Tone {
        switch status ?? "" {
        case "thu_viec": return .orange
        case "chinh_thuc": return .green
        case "tam_nghi": return .blue
        case "thai_san": return .purple
        default: return .gray
        }
    }
    static func gender(_ g: String?) -> String? {
        switch g ?? "" {
        case "": return nil
        case "nam": return "Nam"
        case "nu": return "Nữ"
        case "khac": return "Khác"
        default: return g
        }
    }
    static let contracts: [String: String] = ["thu_viec": "Thử việc", "xac_dinh": "Có thời hạn", "khong_xac_dinh": "Không thời hạn", "cong_tac_vien": "Cộng tác viên", "thuc_tap": "Thực tập"]
    static let sources: [String: String] = ["pos": "theo ngày tạo tài khoản POS", "pos_activity": "theo ngày đầu có đơn trên POS", "manual": "HR nhập", "form": "theo file hồ sơ"]
    static func contract(_ c: String?) -> String? { c.map { contracts[$0] ?? $0 } }
    static func kind(_ k: String?) -> String {
        switch k ?? "" {
        case "assignment.create": return "Thêm chức vụ"
        case "assignment.update": return "Đổi chức vụ"
        case "status.change": return "Đổi trạng thái"
        default: return "Thay đổi hồ sơ"
        }
    }
    static func state(_ s: String?) -> (String, Tone) {
        switch s ?? "" {
        case "pending": return ("Chờ duyệt", .orange)
        case "approved": return ("Đã duyệt", .green)
        case "rejected": return ("Từ chối", .red)
        default: return (s ?? "—", .gray)
        }
    }
    static func kindIcon(_ k: String?) -> String {
        switch k ?? "" {
        case "board": return "building.columns.fill"
        case "team": return "person.2.fill"
        default: return "square.stack.3d.up.fill"
        }
    }
    /// "2026-09" → "T9".
    static func monthShort(_ ym: String?) -> String {
        guard let ym, ym.count >= 7, let m = Int(ym.dropFirst(5).prefix(2)) else { return "—" }
        return "T\(m)"
    }
    /// "2026-09" → "9/2026".
    static func monthLabel(_ ym: String?) -> String {
        guard let ym, ym.count >= 7, let m = Int(ym.dropFirst(5).prefix(2)) else { return "này" }
        return "\(m)/\(ym.prefix(4))"
    }
    static func span(_ start: String?, _ end: String?) -> String {
        if let s = start, let e = end { return "\(Fmt.day(s)) – \(Fmt.day(e))" }
        if let s = start { return "Từ \(Fmt.day(s))" }
        if let e = end { return "Đến \(Fmt.day(e))" }
        return "Chưa ghi ngày"
    }
    /// Số gọi được (chỉ chữ số và dấu +), không có thì nil.
    static func dial(_ phone: String?) -> String? {
        let s = (phone ?? "").filter { $0.isNumber || $0 == "+" }
        return s.isEmpty ? nil : s
    }
    /// So khớp không dấu: gõ "nguyen" vẫn ra "Nguyễn".
    static func fold(_ s: String) -> String {
        s.lowercased().folding(options: .diacriticInsensitive, locale: Locale(identifier: "vi_VN")).replacingOccurrences(of: "đ", with: "d")
    }
    static func num(_ v: Int?) -> String { Fmt.int(Double(v ?? 0)) }
    /// Độ sâu từng phòng trong cây (danh sách đã theo thứ tự cha trước con).
    static func depths(_ rows: [(String, String?)]) -> [String: Int] {
        var out: [String: Int] = [:]
        for (id, parent) in rows {
            let d = parent.flatMap { out[$0] }.map { $0 + 1 } ?? 0
            out[id] = d
        }
        return out
    }
}

/// Dữ liệu Nhân sự dùng chung giữa các trang con: đổi trang không tải lại, kéo xuống để tải mới.
/// Bộ lọc danh sách nằm ở đây để giữ nguyên khi đổi trang (và để Tổng quan mở sẵn danh sách đã lọc).
@Observable final class HRStore {
    var period: HRPeriod = .month
    var overview: API.HR.Overview?
    var overviewError: String?
    var overviewLoading = false
    /// Kỳ "từ|đến" của số đang giữ trong overview.
    private(set) var overviewKey = ""
    /// Vừa duyệt / từ chối: lần mở Tổng quan tới tải lại dù cùng kỳ.
    @ObservationIgnored private var overviewDirty = false
    var people: API.HR.People?
    var peopleError: String?
    var org: API.HR.Org?
    var orgError: String?
    var pending: [API.HR.ChangeRequest]?
    var done: [API.HR.ChangeRequest]?
    var approvalsError: String?
    // Bộ lọc danh sách: chi nhánh ("" tất cả, "__none" chưa rõ), trạng thái, phòng ban ("__none" chưa xếp phòng).
    var q = ""
    var office = ""
    var status = "working"
    var dept = ""

    /// Số yêu cầu đang chờ mà người dùng này duyệt được.
    var decidable: Int { pending.map { $0.filter { $0.can_decide == true }.count } ?? overview?.pending ?? 0 }

    /// Kỳ "từ|đến" đang chọn.
    var periodKey: String { let r = period.range; return "\(r.0)|\(r.1)" }
    @MainActor func loadOverview(force: Bool = false) async {
        let r = period.range
        let key = "\(r.0)|\(r.1)"
        if !force && !overviewDirty && overview != nil && key == overviewKey { return }
        overviewLoading = true; defer { overviewLoading = false }
        do {
            let o = try await API.hrOverview(from: r.0, to: r.1)
            // Đã đổi sang kỳ khác khi đang tải: bỏ số của kỳ cũ.
            guard key == periodKey else { return }
            overview = o; overviewKey = key; overviewDirty = false; overviewError = nil
        } catch { if !Task.isCancelled && key == periodKey { overviewError = error.localizedDescription } }
    }
    /// Sau khi duyệt: lần mở Tổng quan tới tải lại số.
    func staleOverview() { overviewDirty = true }
    @MainActor func loadPeople(force: Bool = false) async {
        if !force && people != nil { return }
        do { people = try await API.hrPeople(); peopleError = nil } catch { if !Task.isCancelled { peopleError = error.localizedDescription } }
    }
    @MainActor func loadOrg(force: Bool = false) async {
        if !force && org != nil { return }
        do { org = try await API.hrOrg(); orgError = nil } catch { if !Task.isCancelled { orgError = error.localizedDescription } }
    }
    @MainActor func loadApprovals(_ state: String, force: Bool = false) async {
        if !force && (state == "done" ? done : pending) != nil { return }
        do {
            let rows = try await API.hrApprovals(state: state)
            if state == "done" { done = rows } else { pending = rows }
            approvalsError = nil
        } catch { if !Task.isCancelled { approvalsError = error.localizedDescription } }
    }
    /// Mở Danh sách với bộ lọc định sẵn (từ ô số / chi nhánh / phòng ở Tổng quan).
    func filter(office: String = "", status: String = "working", dept: String = "") {
        q = ""; self.office = office; self.status = status; self.dept = dept
    }
}

// MARK: Trang chính Nhân sự

/// Nhân sự: dải chip trang con (Tổng quan · Danh sách · Sơ đồ · Duyệt · Tuyển dụng), mỗi trang tự cuộn và kéo xuống để tải mới.
struct HRHome: View {
    @Environment(AuthModel.self) private var auth
    @State private var store = HRStore()
    @State private var page: String
    /// initial: trang con mở sẵn (mở từ tab Phòng ban), rỗng = Tổng quan.
    init(initial: String = "") { _page = State(initialValue: initial.isEmpty ? "overview" : initial) }
    private var pages: [WebPage] {
        var p = [
            WebPage(id: "overview", title: "Tổng quan", icon: "chart.bar.fill", path: ""),
            WebPage(id: "list", title: "Danh sách", icon: "person.3.fill", path: ""),
            WebPage(id: "org", title: "Sơ đồ", icon: "point.3.connected.trianglepath.dotted", path: ""),
            WebPage(id: "approvals", title: "Duyệt", icon: "checkmark.seal.fill", path: ""),
        ]
        if auth.me?.canView("recruit") ?? false { p.append(WebPage(id: "recruit", title: "Tuyển dụng", icon: "person.badge.plus", path: "")) }
        return p
    }
    var body: some View {
        VStack(spacing: 0) {
            SubNav(selection: $page, pages: pages, badges: ["approvals": store.decidable]).padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 4)
            Group {
                switch page {
                case "list": HRPeopleList(store: store)
                case "org": HROrgView(store: store)
                case "approvals": HRApprovalsView(store: store)
                case "recruit": RecruitView(embedded: true)
                default: HROverviewView(store: store) { page = $0 }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .navigationTitle("Nhân sự").navigationBarTitleDisplayMode(.inline).brandNav()
    }
}

// MARK: Tổng quan

struct HROverviewView: View {
    let store: HRStore
    /// Chuyển sang trang con khác (list, approvals…).
    let go: (String) -> Void
    @State private var allJoined = false
    @State private var allLeft = false
    private static let grid = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                PageTitle(title: "Tổng quan nhân sự", subtitle: periodLabel, trailing: AnyView(periodMenu))
                // Tải kỳ mới lỗi: chỉ báo lỗi, không để số của kỳ trước hiện dưới tên và ngày của kỳ mới.
                let stale = store.overviewError != nil && store.overviewKey != store.periodKey
                if let e = store.overviewError, store.overview == nil || stale {
                    Label(stale ? "Không tải được số \(store.period.title.lowercased()). \(e)" : e, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline)
                }
                if let d = store.overview, !stale {
                    if (d.unplaced ?? 0) > 0 { unplaced(d.unplaced ?? 0) }
                    kpis(d)
                    if !d.offices.isEmpty { offices(d) }
                    if !d.departments.isEmpty { departments(d) }
                    if !d.series.isEmpty { chart(d) }
                    flows("Người mới vào", d.joined, leaving: false, all: $allJoined)
                    flows("Người nghỉ việc", d.left, leaving: true, all: $allLeft)
                    Text("Quân số = người đang làm ở cuối kỳ. Tỉ lệ nghỉ = số nghỉ trong kỳ / quân số bình quân đầu và cuối kỳ. Chi nhánh lấy theo hồ sơ, không có thì theo phòng của vai trò chính.").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                } else if store.overviewError == nil { SkeletonGrid(tiles: 6); Skeleton(height: 160) }
            }.padding(16)
        }
        .refreshable { await store.loadOverview(force: true) }
        .task(id: store.period) { await store.loadOverview() }
    }
    private var periodLabel: String { let r = store.period.range; return "\(Fmt.day(r.0)) – \(Fmt.day(r.1))" }
    private var periodMenu: some View {
        Menu {
            ForEach(HRPeriod.allCases, id: \.self) { p in
                Button { store.period = p } label: { if store.period == p { Label(p.title, systemImage: "checkmark") } else { Text(p.title) } }
            }
        } label: { DatePill(text: store.period.title) }
    }
    private func unplaced(_ n: Int) -> some View {
        Button { store.filter(dept: "__none"); go("list") } label: {
            HStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 15, weight: .bold)).foregroundStyle(.white).frame(width: 34, height: 34).background(Color.warn, in: .circle)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(n) người đang làm chưa được xếp phòng ban").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.warn)
                    Text("Nhờ HR xếp phòng để số theo phòng ban và chi nhánh đúng. Chạm để xem danh sách.").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.warn)
            }.padding(12).background(Color.warn.opacity(0.08), in: .rect(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.warn.opacity(0.25)))
        }.buttonStyle(.plain)
    }
    private func kpis(_ d: API.HR.Overview) -> some View {
        let t = d.total
        let change = (t.end ?? 0) - (t.start ?? 0)
        let changeText: String? = change == 0 ? nil : (change > 0 ? "+\(change)" : "\(change)") + " người"
        return LazyVGrid(columns: Self.grid, spacing: 10) {
            KpiCard(icon: "ic_m_staff", tint: .good, label: "Quân số", value: HRText.num(t.end), delta: changeText, note: "Đầu kỳ \(HRText.num(t.start)) người")
            KpiCard(icon: "person.badge.plus", tint: .blue, label: "Vào", value: HRText.num(t.joined), note: "Người mới trong kỳ")
            KpiCard(icon: "person.badge.minus", tint: .bad, label: "Nghỉ", value: HRText.num(t.left), note: "Nghỉ việc trong kỳ")
            KpiCard(icon: "ic_m_rate", tint: .purple, label: "Tỉ lệ nghỉ", value: Fmt.pct(t.turnover), note: "Số nghỉ / quân số bình quân")
            Button { store.filter(status: "thu_viec"); go("list") } label: { KpiCard(icon: "hourglass", tint: .warn, label: "Thử việc", value: HRText.num(d.probation), note: "Đang thử việc · chạm để xem") }.buttonStyle(.plain)
            Button { go("approvals") } label: { KpiCard(icon: "checkmark.seal.fill", tint: store.decidable > 0 ? .bad : .good, label: "Chờ duyệt", value: Fmt.int(Double(store.decidable)), note: store.decidable > 0 ? "Bạn duyệt được · chạm để xem" : "Không có việc chờ") }.buttonStyle(.plain)
        }
        .environment(\.thinking, store.overviewLoading)
    }
    private func offices(_ d: API.HR.Overview) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHead(title: "Theo chi nhánh", action: "Chạm để xem người")
            LazyVGrid(columns: Self.grid, spacing: 10) {
                ForEach(d.offices) { o in
                    let none = o.id == "__none"
                    Button { store.filter(office: o.id); go("list") } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            HStack(spacing: 6) {
                                Image(systemName: none ? "questionmark.circle.fill" : "building.2.fill").font(.system(size: 12, weight: .semibold)).foregroundStyle(none ? Color.warn : Color.brand)
                                Text(o.name).font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink).lineLimit(1)
                            }
                            HStack(alignment: .firstTextBaseline, spacing: 4) {
                                Text(HRText.num(o.headcount)).font(.system(size: 22, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).monospacedDigit()
                                Text("người").font(.system(size: 11)).foregroundStyle(Color.inkSoft)
                            }
                            Text("+\(HRText.num(o.joined)) vào · \(HRText.num(o.left)) nghỉ").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                            Text((o.probation ?? 0) > 0 ? "\(HRText.num(o.probation)) đang thử việc" : "Không ai thử việc").font(.system(size: 10, weight: .semibold)).foregroundStyle((o.probation ?? 0) > 0 ? Color.warn : Color.inkSoft)
                        }
                        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                    }.buttonStyle(.plain)
                }
            }
        }
    }
    private func departments(_ d: API.HR.Overview) -> some View {
        let depth = HRText.depths(d.departments.map { ($0.id, $0.parent_id) })
        let maxN = Double(max(1, d.departments.map { $0.headcount ?? 0 }.max() ?? 1))
        return Panel {
            HStack { Text("Theo phòng ban").font(.system(size: 15, weight: .bold)); Spacer(); Hint(text: "Quân số cuối kỳ") }
            ForEach(d.departments) { x in
                let level = min(3, depth[x.id] ?? 0)
                let flow = (x.joined ?? 0) + (x.left ?? 0) > 0 ? "+\(HRText.num(x.joined)) −\(HRText.num(x.left))" : ""
                Button { store.filter(dept: x.id); go("list") } label: {
                    HStack(spacing: 8) {
                        Text(x.name).font(.system(size: 12, weight: level == 0 ? .semibold : .regular)).foregroundStyle(Color.ink).lineLimit(1)
                            .padding(.leading, CGFloat(level) * 10).frame(width: 130, alignment: .leading)
                        Bar(value: Double(x.headcount ?? 0) / maxN, tint: level == 0 ? .good : Color.good.opacity(0.6), height: 7)
                        Text(HRText.num(x.headcount)).font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink).monospacedDigit().frame(width: 32, alignment: .trailing)
                        Text(flow).font(.system(size: 9)).foregroundStyle(Color.inkSoft).monospacedDigit().frame(width: 44, alignment: .trailing)
                    }.padding(.vertical, 3).contentShape(.rect)
                }.buttonStyle(.plain)
            }
        }
    }
    private func chart(_ d: API.HR.Overview) -> some View {
        let pts: [(String, Double)] = d.series.map { (HRText.monthShort($0.month), Double($0.headcount ?? 0)) }
        let maxFlow = CGFloat(max(1, d.series.map { max($0.joined ?? 0, $0.left ?? 0) }.max() ?? 1))
        return Panel {
            HStack { Text("Quân số 12 tháng").font(.system(size: 15, weight: .bold)); Spacer(); Hint(text: "Cuối mỗi tháng") }
            if pts.count > 1 { LineChart(points: pts, tint: .good, height: 120) }
            Text("Vào / nghỉ theo tháng").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink).padding(.top, 4)
            HStack(alignment: .bottom, spacing: 4) {
                ForEach(Array(d.series.enumerated()), id: \.offset) { _, m in
                    VStack(spacing: 3) {
                        HStack(alignment: .bottom, spacing: 2) {
                            GrowBar(height: max(2, 44 * CGFloat(m.joined ?? 0) / maxFlow), color: .good)
                            GrowBar(height: max(2, 44 * CGFloat(m.left ?? 0) / maxFlow), color: .bad)
                        }.frame(height: 44, alignment: .bottom)
                        Text(HRText.monthShort(m.month)).font(.system(size: 8)).foregroundStyle(Color.inkSoft).lineLimit(1)
                    }.frame(maxWidth: .infinity)
                }
            }
            HStack(spacing: 12) {
                HStack(spacing: 4) { Circle().fill(Color.good).frame(width: 7, height: 7); Text("Vào").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                HStack(spacing: 4) { Circle().fill(Color.bad).frame(width: 7, height: 7); Text("Nghỉ").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
            }
        }
    }
    private func flows(_ title: String, _ rows: [API.HR.Flow], leaving: Bool, all: Binding<Bool>) -> some View {
        let shown = all.wrappedValue ? rows : Array(rows.prefix(8))
        return Panel {
            HStack {
                Text("\(title) · \(rows.count)").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink)
                Spacer()
                if rows.count > 8 { Button(all.wrappedValue ? "Thu gọn" : "Xem tất cả") { withAnimation { all.wrappedValue.toggle() } }.font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand) }
            }
            if rows.isEmpty { Text(leaving ? "Không ai nghỉ trong kỳ." : "Chưa có người mới trong kỳ.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) }
            ForEach(Array(shown.enumerated()), id: \.offset) { _, f in
                let place = [f.department, f.office].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                NavigationLink(value: Route.hrPerson(f.employee_id)) {
                    HStack(spacing: 10) {
                        Avatar(name: f.name ?? "?", size: 34, tint: leaving ? Color.bad : Color.good)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(API.HR.displayName(f.name)).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                            Text(place.isEmpty ? (leaving ? "Không rõ phòng" : "Chưa xếp phòng") : place).font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1)
                            if leaving, let r = f.reason, !r.isEmpty { Text("Lý do: \(r)").font(.system(size: 10)).foregroundStyle(Color.bad).lineLimit(1) }
                        }
                        Spacer(minLength: 4)
                        Text(Fmt.day(f.day)).font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.inkSoft).monospacedDigit()
                        Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.inkSoft)
                    }.padding(.vertical, 4).contentShape(.rect)
                }.buttonStyle(.plain)
            }
        }
    }
}

// MARK: Danh sách

struct HRPeopleList: View {
    @Bindable var store: HRStore
    private static let statuses: [(String, String)] = [("working", "Đang làm"), ("thu_viec", "Thử việc"), ("chinh_thuc", "Chính thức"), ("paused", "Tạm nghỉ / thai sản"), ("da_nghi", "Đã nghỉ"), ("all", "Tất cả")]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass").font(.system(size: 12)).foregroundStyle(Color.inkSoft)
                    TextField("Tìm theo tên, mã nhân sự, số điện thoại", text: $store.q).font(.system(size: 13)).textInputAutocapitalization(.never).autocorrectionDisabled()
                    if !store.q.isEmpty { Button { store.q = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Color.inkSoft) }.buttonStyle(.plain) }
                }
                .padding(.horizontal, 12).padding(.vertical, 10).background(Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.08)))
                if let e = store.peopleError, store.people == nil { Label(e, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
                if let d = store.people {
                    filters(d)
                    let list = rows(d)
                    let names = Dictionary(d.offices.map { ($0.id, $0.name) }, uniquingKeysWith: { a, _ in a })
                    let live = Set(d.departments.map(\.id))
                    SectionHead(title: "Danh sách nhân sự", action: "\(list.count) người")
                    LazyVStack(spacing: 10) {
                        ForEach(list) { p in row(p, offices: names, live: live) }
                    }
                    if list.isEmpty { Panel { Text("Không có ai khớp bộ lọc.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) } }
                } else if store.peopleError == nil { Skeleton(height: 44); Skeleton(height: 300) }
            }.padding(16)
        }
        .refreshable { await store.loadPeople(force: true) }
        .task { await store.loadPeople() }
    }
    private func filters(_ d: API.HR.People) -> some View {
        let known = Set(d.offices.map(\.id))
        let hasNone = d.people.contains { p in p.status != "da_nghi" && !(p.office_id.map { known.contains($0) } ?? false) }
        let depth = HRText.depths(d.departments.map { ($0.id, $0.parent_id) })
        let picked: String? = d.departments.first { $0.id == store.dept }?.name
        let deptName: String = store.dept == "__none" ? "Chưa xếp phòng" : picked ?? "Mọi phòng ban"
        return VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    FilterChip(label: "Mọi chi nhánh", on: store.office.isEmpty) { store.office = "" }
                    ForEach(d.offices) { o in FilterChip(label: o.name, on: store.office == o.id) { store.office = o.id } }
                    if hasNone || store.office == "__none" { FilterChip(label: "Chưa rõ chi nhánh", on: store.office == "__none") { store.office = "__none" } }
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Menu {
                        Button("Mọi phòng ban") { store.dept = "" }
                        Button("Chưa xếp phòng") { store.dept = "__none" }
                        ForEach(d.departments) { x in Button(String(repeating: "· ", count: min(3, depth[x.id] ?? 0)) + x.name) { store.dept = x.id } }
                    } label: { FilterChip(label: deptName, on: !store.dept.isEmpty, chevron: true) {} }
                    ForEach(Self.statuses, id: \.0) { k, l in FilterChip(label: l, on: store.status == k) { store.status = k } }
                }
            }
        }
    }
    /// Lọc theo chi nhánh, trạng thái, phòng (gồm cả phòng con) và ô tìm (không dấu, mã, số điện thoại).
    private func rows(_ d: API.HR.People) -> [API.HR.Person] {
        let known = Set(d.offices.map(\.id))
        let live = Set(d.departments.map(\.id))
        var scope: Set<String> = [store.dept]
        for x in d.departments { if let p = x.parent_id, scope.contains(p) { scope.insert(x.id) } }
        let t = HRText.fold(store.q.trimmingCharacters(in: .whitespaces))
        let digits = store.q.filter(\.isNumber)
        return d.people.filter { p in
            let s = p.status ?? ""
            let okStatus: Bool
            switch store.status {
            case "working": okStatus = s != "da_nghi"
            case "paused": okStatus = s == "tam_nghi" || s == "thai_san"
            case "all": okStatus = true
            default: okStatus = s == store.status
            }
            if !okStatus { return false }
            if store.office == "__none" { if let o = p.office_id, known.contains(o) { return false } }
            else if !store.office.isEmpty && p.office_id != store.office { return false }
            // "Chưa xếp phòng" khớp số cảnh báo ở Tổng quan: gồm cả người có vai trò chính ở phòng đã ngừng dùng.
            if store.dept == "__none" { if !p.unplaced(in: live) { return false } }
            else if !store.dept.isEmpty { guard let dp = p.department_id, scope.contains(dp) else { return false } }
            if t.isEmpty { return true }
            if HRText.fold(p.name).contains(t) || HRText.fold(p.code ?? "").contains(t) || HRText.fold(p.nickname ?? "").contains(t) { return true }
            return digits.count >= 3 && (p.phone ?? "").filter(\.isNumber).contains(digits)
        }
    }
    /// Dòng vai trò dưới tên: người đã nghỉ không còn vai trò nên ghi ngày nghỉ; người đang làm chưa xếp phòng thì tô cam.
    private func roleLine(_ p: API.HR.Person, live: Set<String>) -> (text: String, warn: Bool) {
        let role = p.role_label ?? ""
        if p.status == "da_nghi" {
            if !role.isEmpty { return (role, false) }
            return (p.left_on.map { "Đã nghỉ từ \(Fmt.day($0))" } ?? "Đã nghỉ việc", false)
        }
        if p.unplaced(in: live) { return (role.isEmpty ? "Chưa xếp phòng" : "\(role) · chưa xếp phòng", true) }
        return (role.isEmpty ? "Chưa ghi chức danh" : role, false)
    }
    private func row(_ p: API.HR.Person, offices: [String: String], live: Set<String>) -> some View {
        let sub = [p.code, p.office_id.flatMap { offices[$0] }, p.phone].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        let role = roleLine(p, live: live)
        return NavigationLink(value: Route.hrPerson(p.id)) {
            HStack(spacing: 10) {
                Avatar(name: p.name, size: 40, tint: HRText.tone(p.status).color)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Text(p.name).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                        if let n = p.nickname, !n.isEmpty { Text("(\(n))").font(.system(size: 11)).foregroundStyle(Color.inkSoft).lineLimit(1) }
                    }
                    Text(role.text).font(.system(size: 11)).foregroundStyle(role.warn ? Color.warn : Color.inkSoft).lineLimit(1)
                    if !sub.isEmpty { Text(sub).font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1) }
                }
                Spacer(minLength: 4)
                VStack(alignment: .trailing, spacing: 4) {
                    Tag(text: p.status_label ?? p.status ?? "—", tone: HRText.tone(p.status))
                    if (p.concurrent ?? 0) > 0 { Text("+\(p.concurrent ?? 0) kiêm nhiệm").font(.system(size: 9, weight: .semibold)).foregroundStyle(Color.blue) }
                }
                Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.inkSoft)
            }.padding(12).background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
        }.buttonStyle(.plain)
    }
}

// MARK: Hồ sơ một người

struct PersonView: View {
    let id: String
    @Environment(\.openURL) private var openURL
    @State private var d: API.HR.PersonDetail?
    @State private var error: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let error, d == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
                if let d {
                    header(d.employee)
                    if let p = d.performance { performance(p) }
                    info(d.employee)
                    if !d.assignments.isEmpty { roles(d.assignments) }
                    if !d.chain.isEmpty || !d.reports.isEmpty { reporting(d) }
                    if !d.statusHistory.isEmpty { history(d.statusHistory) }
                    if !d.requests.isEmpty { requests(d.requests) }
                } else if error == nil { Skeleton(height: 120); Skeleton(height: 200) }
            }.padding(16)
        }
        .navigationTitle("Hồ sơ nhân sự").navigationBarTitleDisplayMode(.inline).brandNav()
        .refreshable { await load() }
        .task { await load() }
    }
    @MainActor private func load() async {
        do { d = try await API.hrPerson(id: id); error = nil } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
    /// Dòng vai trò ở đầu hồ sơ: người đã nghỉ không còn vai trò thì ghi ngày nghỉ (không báo "chưa xếp phòng").
    private func roleLine(_ e: API.HR.Profile) -> String? {
        if let r = e.role_label, !r.isEmpty { return r }
        if e.status == "da_nghi" { return e.left_on.map { "Đã nghỉ từ \(Fmt.day($0))" } }
        return "Chưa xếp phòng"
    }
    private func header(_ e: API.HR.Profile) -> some View {
        Panel {
            HStack(alignment: .top, spacing: 12) {
                Avatar(name: e.name, size: 56, tint: HRText.tone(e.status).color)
                VStack(alignment: .leading, spacing: 4) {
                    Text(e.name).font(.system(size: 17, weight: .bold)).foregroundStyle(Color.ink)
                    let nick: String? = (e.nickname ?? "").isEmpty ? nil : "“\(e.nickname ?? "")”"
                    let sub = [e.code, nick].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                    if !sub.isEmpty { Text(sub).font(.system(size: 11)).foregroundStyle(Color.inkSoft) }
                    if let line = roleLine(e) { Text(line).font(.system(size: 12)).foregroundStyle(Color.ink).lineLimit(2) }
                    HStack(spacing: 6) {
                        Tag(text: e.status_label ?? e.status ?? "—", tone: HRText.tone(e.status))
                        if let o = e.office_name, !o.isEmpty { Tag(text: o, tone: .blue, dot: true) }
                    }
                }
                Spacer(minLength: 0)
            }
            if let phone = HRText.dial(e.phone) {
                HStack(spacing: 8) {
                    Button { if let u = URL(string: "tel:\(phone)") { openURL(u) } } label: { ActionPill(icon: "phone.fill", text: "Gọi", tint: .good) }.buttonStyle(.plain)
                    Button { if let u = URL(string: "sms:\(phone)") { openURL(u) } } label: { ActionPill(icon: "message.fill", text: "Nhắn", tint: .brand) }.buttonStyle(.plain)
                }.padding(.top, 4)
            }
        }
    }
    private func performance(_ p: API.HR.Performance) -> some View {
        let pts: [(String, Double)] = (p.series ?? []).map { (HRText.monthShort($0.month), $0.revenue ?? 0) }
        let rank = p.rank.map { "\($0)/\(p.peers ?? 0)" } ?? "—"
        let since = (p.lifetime?.firstDay).map { " · từ \(Fmt.day($0))" } ?? ""
        return VStack(alignment: .leading, spacing: 10) {
            HStack { Text("Bán hàng tháng \(HRText.monthLabel(p.month))").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink); Spacer(); Hint(text: "Từ dữ liệu POS") }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                KpiCard(icon: "ic_m_revenue", tint: .good, label: "Doanh thu tháng", value: Fmt.short(p.revenue ?? 0) + " ₫", delta: Fmt.delta(p.revenue ?? 0, p.prevSameDays), note: "Chưa có số cùng kỳ")
                KpiCard(icon: "ic_m_closed", tint: .blue, label: "Đơn chốt", value: Fmt.int(p.closedOrders ?? 0), note: "Trong tháng")
                KpiCard(icon: "trophy.fill", tint: .warn, label: "Hạng trong bộ phận", value: rank, note: p.rank == nil ? "Chưa có doanh thu" : "Theo doanh thu tháng")
                KpiCard(icon: "sum", tint: .purple, label: "Từ trước tới nay", value: Fmt.short(p.lifetime?.revenue ?? 0) + " ₫", note: "\(Fmt.int(p.lifetime?.closedOrders ?? 0)) đơn chốt\(since)")
            }
            Text("So với cùng kỳ tháng trước (cùng số ngày): \(Fmt.short(p.prevSameDays ?? 0)) ₫").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
            if !pts.isEmpty {
                Panel {
                    HStack { Text("Doanh thu 6 tháng").font(.system(size: 14, weight: .bold)); Spacer(); Hint(text: "Doanh thu đơn chốt theo tháng") }
                    BarChart(points: pts, money: true)
                }
            }
        }
    }
    private func info(_ e: API.HR.Profile) -> some View {
        Panel {
            Text("Thông tin chung").font(.system(size: 13, weight: .bold))
            Group {
                infoRow("Mã nhân sự", e.code)
                infoRow("Giới tính", HRText.gender(e.gender))
                infoRow("Ngày sinh", e.birth_date.map { Fmt.day($0) })
                infoRow("Số điện thoại", e.phone)
                infoRow("Email", e.email)
                infoRow("Chi nhánh", e.office_name)
                infoRow("Trình độ", e.education)
            }
            Group {
                infoRow("Ngày vào", joined(e))
                infoRow("Chính thức từ", e.official_on.map { Fmt.day($0) })
                infoRow("Hợp đồng", HRText.contract(e.contract_type))
                infoRow("Ngày nghỉ", e.left_on.map { Fmt.day($0) })
                infoRow("Lý do nghỉ", e.leave_reason_label ?? e.leave_reason)
                infoRow("Ghi chú", e.note)
            }
        }
    }
    /// "01/03/2024 (theo ngày tạo tài khoản POS)".
    private func joined(_ e: API.HR.Profile) -> String? {
        guard let j = e.joined_on else { return nil }
        guard let s = e.joined_source, let label = HRText.sources[s] else { return Fmt.day(j) }
        return "\(Fmt.day(j)) (\(label))"
    }
    @ViewBuilder private func infoRow(_ k: String, _ v: String?) -> some View {
        if let v, !v.isEmpty { InfoRow(k: k, v: v) }
    }
    private func roles(_ list: [API.HR.Assignment]) -> some View {
        Panel {
            Text("Vai trò & chức vụ").font(.system(size: 13, weight: .bold))
            ForEach(list) { a in
                let open = a.open ?? (a.end_on == nil)
                let primary = a.is_primary == true
                let title = [a.level_name, a.title_name].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                let tag: (String, Tone) = !open ? ("Đã kết thúc", .gray) : primary ? ("Chính", .green) : ("Kiêm nhiệm", .blue)
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: open ? (primary ? "star.circle.fill" : "plus.circle.fill") : "clock.arrow.circlepath").font(.system(size: 15)).foregroundStyle(open ? Color.good : Color.inkSoft).frame(width: 20)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title.isEmpty ? "Chưa ghi chức danh" : title).font(.system(size: 12, weight: .semibold)).foregroundStyle(open ? Color.ink : Color.inkSoft)
                        if let dn = a.department_name, !dn.isEmpty { Text(dn).font(.system(size: 11)).foregroundStyle(Color.inkSoft) }
                        Text(HRText.span(a.start_on, a.end_on)).font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                        if let m = a.manager_name, !m.isEmpty { Text("Quản lý trực tiếp: \(m)").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                    }
                    Spacer(minLength: 4)
                    Tag(text: tag.0, tone: tag.1)
                }.padding(.vertical, 3)
            }
        }
    }
    private func reporting(_ d: API.HR.PersonDetail) -> some View {
        Panel {
            if !d.chain.isEmpty {
                Text("Báo cáo cho").font(.system(size: 13, weight: .bold))
                ForEach(Array(d.chain.enumerated()), id: \.element.id) { i, b in personRow(b, note: i == 0 ? "Quản lý trực tiếp" : "Cấp trên") }
            }
            if !d.reports.isEmpty {
                if !d.chain.isEmpty { Divider() }
                Text("Cấp dưới trực tiếp · \(d.reports.count) người").font(.system(size: 13, weight: .bold))
                ForEach(d.reports) { b in personRow(b, note: nil) }
            }
        }
    }
    private func personRow(_ b: API.HR.Brief, note: String?) -> some View {
        let sub = [note, b.role_label].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        return NavigationLink(value: Route.hrPerson(b.id)) {
            HStack(spacing: 10) {
                Avatar(name: b.full_name ?? "?", size: 32)
                VStack(alignment: .leading, spacing: 1) {
                    Text(API.HR.displayName(b.full_name)).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                    if !sub.isEmpty { Text(sub).font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1) }
                }
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.inkSoft)
            }.padding(.vertical, 4).contentShape(.rect)
        }.buttonStyle(.plain)
    }
    private func history(_ list: [API.HR.StatusEntry]) -> some View {
        Panel {
            Text("Lịch sử trạng thái").font(.system(size: 13, weight: .bold))
            ForEach(Array(list.enumerated()), id: \.offset) { i, s in
                HStack(alignment: .top, spacing: 10) {
                    VStack(spacing: 0) {
                        Circle().fill(HRText.tone(s.status).color).frame(width: 9, height: 9).padding(.top, 4)
                        if i < list.count - 1 { Rectangle().fill(Color.black.opacity(0.08)).frame(width: 2).frame(maxHeight: .infinity) }
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.status_label ?? s.status ?? "—").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink)
                        Text(s.effective_on.map { "Từ \(Fmt.day($0))" } ?? "Chưa ghi ngày").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                        if let r = s.reason, !r.isEmpty { Text("Lý do: \(r)").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                        if let n = s.note, !n.isEmpty { Text(n).font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                    }.padding(.bottom, 8)
                }
            }
        }
    }
    private func requests(_ list: [API.HR.ChangeRequest]) -> some View {
        Panel {
            Text("Yêu cầu thay đổi gần đây").font(.system(size: 13, weight: .bold))
            ForEach(list.prefix(10)) { r in
                let st = HRText.state(r.state)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(alignment: .top) {
                        Text(r.summary ?? HRText.kind(r.kind)).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink)
                        Spacer(minLength: 6)
                        Tag(text: st.0, tone: st.1)
                    }
                    Text("Gửi bởi \(r.requested_by_name ?? "—") · \(Fmt.dateTime(r.requested_at))").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                    if let by = r.decided_by_name, !by.isEmpty { Text("\(r.state == "rejected" ? "Từ chối" : "Duyệt") bởi \(by) · \(Fmt.dateTime(r.decided_at))").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                    if let n = r.decision_note, !n.isEmpty { Text("Ghi chú: \(n)").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                }.padding(.vertical, 4)
            }
        }
    }
}

// MARK: Sơ đồ tổ chức

struct HROrgView: View {
    let store: HRStore
    @State private var open: Set<String> = []
    @State private var q = ""
    /// Một dòng của cây đã trải phẳng: phòng (có thể mở) hoặc một người trong phòng đang mở.
    private struct Line: Identifiable { let id: String; let depth: Int; let unit: API.HR.OrgUnit?; let member: API.HR.Member?; var isHead = false }
    /// Các phòng của một chi nhánh.
    private struct Branch: Identifiable { let id: String; let name: String; let units: [API.HR.OrgUnit] }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PageTitle(title: "Sơ đồ tổ chức", subtitle: "Chạm một phòng để xem người trong đó", trailing: AnyView(toggleAll))
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass").font(.system(size: 12)).foregroundStyle(Color.inkSoft)
                    TextField("Tìm người hoặc phòng ban", text: $q).font(.system(size: 13)).textInputAutocapitalization(.never).autocorrectionDisabled()
                    if !q.isEmpty { Button { q = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Color.inkSoft) }.buttonStyle(.plain) }
                }
                .padding(.horizontal, 12).padding(.vertical, 10).background(Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.08)))
                if let e = store.orgError, store.org == nil { Label(e, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
                if let d = store.org {
                    if q.trimmingCharacters(in: .whitespaces).isEmpty {
                        let totals = headcounts(d.units)
                        ForEach(branches(d.units)) { b in branch(b, totals: totals) }
                        if d.units.isEmpty { Panel { Text("Chưa có phòng ban nào.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) } }
                    } else { matches(d) }
                } else if store.orgError == nil { Skeleton(height: 60); Skeleton(height: 220) }
            }.padding(16)
        }
        .refreshable { await store.loadOrg(force: true) }
        .task { await store.loadOrg() }
    }
    private var toggleAll: some View {
        Button {
            withAnimation(.snappy(duration: 0.25)) { open = open.isEmpty ? Set((store.org?.units ?? []).map(\.id)) : [] }
        } label: {
            Text(open.isEmpty ? "Mở hết" : "Thu gọn").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink)
                .padding(.horizontal, 10).padding(.vertical, 7).background(Color.card, in: .rect(cornerRadius: 8)).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.black.opacity(0.12)))
        }.buttonStyle(.plain)
    }
    /// Nhóm theo chi nhánh: phòng chưa gắn chi nhánh (thường là Ban Giám đốc) lên đầu, rồi theo thứ tự xuất hiện.
    private func branches(_ units: [API.HR.OrgUnit]) -> [Branch] {
        var order: [String] = []
        var groups: [String: [API.HR.OrgUnit]] = [:]
        var names: [String: String] = [:]
        for u in units {
            let k = u.office_id ?? ""
            if groups[k] == nil { order.append(k) }
            groups[k, default: []].append(u)
            if let n = u.office_name { names[k] = n }
        }
        let sorted = order.filter { $0.isEmpty } + order.filter { !$0.isEmpty }
        return sorted.map { k in Branch(id: k.isEmpty ? "__none" : k, name: k.isEmpty ? "Chung · chưa gắn chi nhánh" : names[k] ?? "Chi nhánh", units: groups[k] ?? []) }
    }
    /// Số người (không trùng) của mỗi phòng, gồm cả các phòng con.
    private func headcounts(_ units: [API.HR.OrgUnit]) -> [String: Int] {
        var kids: [String: [String]] = [:]
        for u in units { if let p = u.parent_id { kids[p, default: []].append(u.id) } }
        let byId = Dictionary(units.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        var memo: [String: Set<String>] = [:]
        func people(_ id: String, _ path: Set<String>) -> Set<String> {
            if let m = memo[id] { return m }
            if path.contains(id) { return [] }
            var s = Set((byId[id]?.members ?? []).map(\.id))
            for k in kids[id] ?? [] { s.formUnion(people(k, path.union([id]))) }
            memo[id] = s
            return s
        }
        var out: [String: Int] = [:]
        for u in units { out[u.id] = people(u.id, []).count }
        return out
    }
    /// Trải cây của một chi nhánh thành các dòng; chỉ đi vào phòng đang mở.
    private func lines(_ units: [API.HR.OrgUnit]) -> [Line] {
        let ids = Set(units.map(\.id))
        var kids: [String: [API.HR.OrgUnit]] = [:]
        var roots: [API.HR.OrgUnit] = []
        for u in units { if let p = u.parent_id, ids.contains(p) { kids[p, default: []].append(u) } else { roots.append(u) } }
        var out: [Line] = []
        var seen = Set<String>()
        func walk(_ u: API.HR.OrgUnit, _ depth: Int) {
            guard seen.insert(u.id).inserted else { return }
            out.append(Line(id: "u:" + u.id, depth: depth, unit: u, member: nil))
            guard open.contains(u.id) else { return }
            for m in u.members { out.append(Line(id: "m:\(u.id):\(m.id)", depth: depth + 1, unit: nil, member: m, isHead: m.id == u.head?.id)) }
            for k in kids[u.id] ?? [] { walk(k, depth + 1) }
        }
        for r in roots { walk(r, 0) }
        return out
    }
    private func branch(_ b: Branch, totals: [String: Int]) -> some View {
        let rows = lines(b.units)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: b.id == "__none" ? "building.columns.fill" : "building.2.fill").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand)
                Text(b.name).font(.system(size: 14, weight: .bold)).foregroundStyle(Color.ink)
                Spacer()
                Text("\(b.units.count) phòng / team").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
            }
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { i, l in
                    if let u = l.unit { unitRow(u, depth: l.depth, total: totals[u.id] ?? u.members.count) }
                    else if let m = l.member { memberRow(m, depth: l.depth, head: l.isHead) }
                    if i < rows.count - 1 { Divider().padding(.leading, CGFloat(l.depth) * 14 + 12) }
                }
            }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
        }
    }
    private func unitRow(_ u: API.HR.OrgUnit, depth: Int, total: Int) -> some View {
        let isOpen = open.contains(u.id)
        return Button {
            withAnimation(.snappy(duration: 0.25)) { toggle(u.id) }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: isOpen ? "chevron.down" : "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.inkSoft).frame(width: 12)
                Image(systemName: HRText.kindIcon(u.kind)).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand).frame(width: 28, height: 28).background(Color.brandSoft, in: .rect(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 1) {
                    Text(u.name).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                    Text(u.head.map { "Phụ trách: \(API.HR.displayName($0.full_name))" } ?? "Chưa có người phụ trách").font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1)
                }
                Spacer(minLength: 4)
                Text("\(total) người").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.ink).monospacedDigit()
            }
            .padding(.vertical, 9).padding(.trailing, 12).padding(.leading, 10 + CGFloat(depth) * 14).contentShape(.rect)
        }.buttonStyle(.plain)
    }
    private func toggle(_ id: String) {
        if open.contains(id) { _ = open.remove(id) } else { _ = open.insert(id) }
    }
    private func memberRow(_ m: API.HR.Member, depth: Int, head: Bool) -> some View {
        let role = [m.level_name, m.title_name].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        let sub = m.is_primary == false ? (role.isEmpty ? "Kiêm nhiệm" : role + " · kiêm nhiệm") : role
        return NavigationLink(value: Route.hrPerson(m.id)) {
            HStack(spacing: 8) {
                Avatar(name: m.full_name ?? "?", size: 28, tint: head ? Color.good : Color.brand)
                VStack(alignment: .leading, spacing: 1) {
                    Text(API.HR.displayName(m.full_name)).font(.system(size: 12, weight: head ? .bold : .medium)).foregroundStyle(Color.ink).lineLimit(1)
                    if !sub.isEmpty { Text(sub).font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1) }
                }
                Spacer(minLength: 4)
                if head { Tag(text: "Phụ trách", tone: .green) }
                Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)).foregroundStyle(Color.inkSoft)
            }
            .padding(.vertical, 6).padding(.trailing, 12).padding(.leading, 10 + CGFloat(depth) * 14 + 20).contentShape(.rect)
        }.buttonStyle(.plain)
    }
    /// Kết quả tìm: phòng khớp tên (chạm để mở trong cây) và người khớp tên (chạm để xem hồ sơ).
    private func matches(_ d: API.HR.Org) -> some View {
        let t = HRText.fold(q.trimmingCharacters(in: .whitespaces))
        let units = d.units.filter { HRText.fold($0.name).contains(t) }
        var seen = Set<String>()
        var people: [(API.HR.Member, String)] = []
        for u in d.units {
            for m in u.members where HRText.fold(m.full_name ?? "").contains(t) {
                if seen.insert(m.id).inserted { people.append((m, u.name)) }
            }
        }
        let parents = Dictionary(d.units.map { ($0.id, $0.parent_id) }, uniquingKeysWith: { a, _ in a })
        return VStack(alignment: .leading, spacing: 10) {
            if units.isEmpty && people.isEmpty { Panel { Text("Không thấy người hay phòng nào khớp.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) } }
            if !units.isEmpty {
                SectionHead(title: "Phòng ban", action: "\(units.count)")
                VStack(spacing: 0) {
                    ForEach(units) { u in
                        Button {
                            // Mở đường đi từ gốc tới phòng này rồi quay về cây.
                            var path: Set<String> = [u.id]
                            var cur = u.parent_id
                            while let c = cur, !path.contains(c) { path.insert(c); cur = parents[c] ?? nil }
                            open.formUnion(path); q = ""
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: HRText.kindIcon(u.kind)).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand).frame(width: 28, height: 28).background(Color.brandSoft, in: .rect(cornerRadius: 8))
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(u.name).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink)
                                    Text([u.office_name, "\(u.members.count) người"].compactMap { $0 }.joined(separator: " · ")).font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.inkSoft)
                            }.padding(10).contentShape(.rect)
                        }.buttonStyle(.plain)
                    }
                }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
            }
            if !people.isEmpty {
                SectionHead(title: "Nhân sự", action: "\(people.count) người")
                VStack(spacing: 0) {
                    ForEach(people, id: \.0.id) { m, unit in
                        NavigationLink(value: Route.hrPerson(m.id)) {
                            HStack(spacing: 8) {
                                Avatar(name: m.full_name ?? "?", size: 30)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(API.HR.displayName(m.full_name)).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink)
                                    Text([m.title_name ?? m.level_name, unit].compactMap { $0 }.joined(separator: " · ")).font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.inkSoft)
                            }.padding(10).contentShape(.rect)
                        }.buttonStyle(.plain)
                    }
                }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
            }
        }
    }
}

// MARK: Duyệt thay đổi

/// Từ chối một hay nhiều yêu cầu (sheet hỏi lý do).
struct HRReject: Identifiable { let id = UUID(); let ids: [String]; let title: String }

struct HRApprovalsView: View {
    let store: HRStore
    @Environment(SatelliteCenter.self) private var satellites
    @State private var tab = "pending"
    @State private var confirming = false
    @State private var confirmIds: [String]?
    @State private var rejecting: HRReject?
    @State private var busy: Set<String> = []
    @State private var toast: (ok: Bool, text: String)?
    var body: some View {
        let list = tab == "done" ? store.done : store.pending
        let mine = (store.pending ?? []).filter { $0.can_decide == true }
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PageTitle(title: "Duyệt thay đổi", subtitle: "Đổi chức vụ, trạng thái do HR gửi lên")
                Segmented(selection: $tab, options: [("pending", "Chờ duyệt"), ("done", "Đã xử lý")])
                if let t = toast {
                    Label(t.text, systemImage: t.ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill").font(.system(size: 12, weight: .semibold)).foregroundStyle(t.ok ? Color.good : Color.bad)
                        .padding(10).frame(maxWidth: .infinity, alignment: .leading).background((t.ok ? Color.good : Color.bad).opacity(0.1), in: .rect(cornerRadius: 10))
                }
                if let e = store.approvalsError, list == nil { Label(e, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
                if tab == "pending" && !mine.isEmpty {
                    PrimaryButton(title: "Duyệt tất cả (\(mine.count))", icon: "checkmark.circle.fill", tint: .good) { confirmIds = mine.map(\.id); confirming = true }
                        .disabled(!busy.isEmpty).opacity(busy.isEmpty ? 1 : 0.5)
                }
                if let rows = list {
                    if rows.isEmpty { Panel { Text(tab == "done" ? "Chưa có yêu cầu nào được xử lý." : "Không có yêu cầu nào đang chờ duyệt.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) } }
                    ForEach(rows) { r in card(r) }
                } else if store.approvalsError == nil { Skeleton(height: 130); Skeleton(height: 130) }
            }.padding(16)
        }
        .refreshable { await store.loadApprovals(tab, force: true); await satellites.refresh(maxAge: 0) }
        .task(id: tab) { await store.loadApprovals(tab) }
        .confirmationDialog("Duyệt thay đổi?", isPresented: $confirming, titleVisibility: .visible, presenting: confirmIds) { ids in
            Button(ids.count > 1 ? "Duyệt \(ids.count) yêu cầu" : "Duyệt") { Task { await decide(ids, approve: true) } }
            Button("Hủy", role: .cancel) {}
        } message: { ids in
            Text(ids.count > 1 ? "Cả \(ids.count) thay đổi được áp dụng ngay vào hồ sơ nhân sự." : "Thay đổi được áp dụng ngay vào hồ sơ nhân sự.")
        }
        .sheet(item: $rejecting) { r in
            HRRejectSheet(title: r.title) { note in Task { await decide(r.ids, approve: false, note: note) } }
        }
    }
    private func card(_ r: API.HR.ChangeRequest) -> some View {
        let st = HRText.state(r.state)
        let working = busy.contains(r.id)
        let rejected = r.state == "rejected"
        return VStack(alignment: .leading, spacing: 8) {
            NavigationLink(value: Route.hrPerson(r.employee_id ?? "")) {
                HStack(spacing: 10) {
                    Avatar(name: r.employee_name ?? "?", size: 36)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(API.HR.displayName(r.employee_name)).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                        Tag(text: r.kind_label ?? HRText.kind(r.kind), tone: .blue)
                    }
                    Spacer(minLength: 4)
                    VStack(alignment: .trailing, spacing: 3) {
                        Tag(text: st.0, tone: st.1)
                        Text(Ago.text(r.requested_at) ?? "").font(.system(size: 9)).foregroundStyle(Color.inkSoft)
                    }
                }.contentShape(.rect)
            }.buttonStyle(.plain).disabled(r.employee_id == nil)
            Text(r.summary ?? "—").font(.system(size: 13)).foregroundStyle(Color.ink)
            Text("Gửi bởi \(r.requested_by_name ?? "—") · \(Fmt.dateTime(r.requested_at))").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
            if r.state == "pending" {
                if r.can_decide == true {
                    HStack(spacing: 8) {
                        Button { confirmIds = [r.id]; confirming = true } label: {
                            HStack(spacing: 5) { Image(systemName: "checkmark"); Text("Duyệt") }.font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
                                .frame(maxWidth: .infinity).padding(.vertical, 10).background(Color.good, in: .rect(cornerRadius: 10))
                        }.buttonStyle(.plain)
                        Button { rejecting = HRReject(ids: [r.id], title: r.summary ?? HRText.kind(r.kind)) } label: {
                            HStack(spacing: 5) { Image(systemName: "xmark"); Text("Từ chối") }.font(.system(size: 13, weight: .bold)).foregroundStyle(Color.bad)
                                .frame(maxWidth: .infinity).padding(.vertical, 10).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.bad.opacity(0.5), lineWidth: 1.5))
                        }.buttonStyle(.plain)
                    }.disabled(working).opacity(working ? 0.5 : 1)
                } else {
                    Text("Chờ \(r.approver_name ?? "người có quyền") duyệt").font(.system(size: 11)).foregroundStyle(Color.inkSoft)
                }
            } else {
                if let by = r.decided_by_name, !by.isEmpty { Text("\(rejected ? "Từ chối" : "Duyệt") bởi \(by) · \(Fmt.dateTime(r.decided_at))").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                if let n = r.decision_note, !n.isEmpty { Text("\(rejected ? "Lý do" : "Ghi chú"): \(n)").font(.system(size: 11)).foregroundStyle(rejected ? Color.bad : Color.inkSoft) }
            }
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
        .thinkingGlow(working, radius: 14)
    }
    /// Gửi duyệt / từ chối, rồi tải lại danh sách chờ và số trên huy hiệu.
    @MainActor private func decide(_ ids: [String], approve: Bool, note: String? = nil) async {
        busy.formUnion(ids); defer { busy.subtract(ids) }
        do {
            let r = try await API.hrDecide(ids: ids, approve: approve, note: note)
            let done = r.done ?? 0, skipped = r.skipped ?? 0
            var text = approve ? "Đã duyệt \(done) yêu cầu." : "Đã từ chối \(done) yêu cầu."
            if skipped > 0 { text += " Bỏ qua \(skipped) yêu cầu (đã có người xử lý hoặc không thuộc quyền bạn)." }
            toast = (done > 0, text)
        } catch { toast = (false, error.localizedDescription) }
        store.staleOverview()
        store.done = nil
        await store.loadApprovals("pending", force: true)
        await satellites.refresh(maxAge: 0)
    }
}

/// Hỏi lý do từ chối (bắt buộc, HR sẽ thấy để sửa lại).
struct HRRejectSheet: View {
    let title: String; let send: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    private var trimmed: String { note.trimmingCharacters(in: .whitespacesAndNewlines) }
    var body: some View {
        NavigationStack {
            Form {
                Section { Text(title).font(.subheadline) } header: { Text("Yêu cầu") }
                Section {
                    TextField("Lý do từ chối (bắt buộc)", text: $note, axis: .vertical).lineLimit(3...6)
                } footer: { Text("HR sẽ thấy lý do này để sửa lại yêu cầu.") }
            }
            .navigationTitle("Từ chối thay đổi").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Từ chối", role: .destructive) { let n = trimmed; dismiss(); send(n) }.disabled(trimmed.isEmpty) }
            }
        }.presentationDetents([.medium])
    }
}
