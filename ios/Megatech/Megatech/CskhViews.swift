import SwiftUI
import Charts

/// Kỳ báo cáo dùng chung: các mốc nhanh như web + khoảng tuỳ chọn.
enum Period: Hashable, Identifiable {
    case today, yesterday, week, month, last, d30, d60, d90
    case custom(String, String)
    var id: String { key }
    static let presets: [Period] = [.today, .yesterday, .week, .month, .last, .d30, .d90]
    var key: String { switch self { case .today: return "today"; case .yesterday: return "yesterday"; case .week: return "week"; case .month: return "month"; case .last: return "last"; case .d30: return "d30"; case .d60: return "d60"; case .d90: return "d90"; case .custom(let a, let b): return "custom:\(a):\(b)" } }
    init?(key: String) {
        switch key { case "today": self = .today; case "yesterday": self = .yesterday; case "week": self = .week; case "month": self = .month; case "last": self = .last; case "d30": self = .d30; case "d60": self = .d60; case "d90": self = .d90
        default: let p = key.split(separator: ":"); if p.count == 3, p[0] == "custom" { self = .custom(String(p[1]), String(p[2])) } else { return nil } }
    }
    var rawValue: String { title }
    var title: String {
        switch self {
        case .today: return "Hôm nay"; case .yesterday: return "Hôm qua"; case .week: return "7 ngày"; case .month: return "Tháng này"; case .last: return "Tháng trước"
        case .d30: return "30 ngày"; case .d60: return "60 ngày"; case .d90: return "90 ngày"
        case .custom(let a, let b): return a == b ? Fmt.day(a) : "\(Fmt.day(a).prefix(5)) – \(Fmt.day(b).prefix(5))"
        }
    }
    var range: (String, String) {
        let today = VNDate.string(.now)
        switch self {
        case .today: return (today, today)
        case .yesterday: let y = VNDate.string(VNDate.add(-1)); return (y, y)
        case .week: return (VNDate.string(VNDate.add(-6)), today)
        case .month: return (VNDate.monthStart(), today)
        case .last: return VNDate.lastMonth()
        case .d30: return (VNDate.string(VNDate.add(-29)), today)
        case .d60: return (VNDate.string(VNDate.add(-59)), today)
        case .d90: return (VNDate.string(VNDate.add(-89)), today)
        case .custom(let a, let b): return (min(a, b), max(a, b))
        }
    }
    /// Kỳ liền trước cùng độ dài (để so sánh).
    var previous: (String, String) {
        let r = range
        guard let a = VNDate.date(r.0), let b = VNDate.date(r.1) else { return r }
        let len = Int(b.timeIntervalSince(a) / 86400) + 1
        return (VNDate.string(VNDate.add(-len, to: a)), VNDate.string(VNDate.add(-len, to: b)))
    }
    var label: String { let r = range; return r.0 == r.1 ? Fmt.day(r.0) : "\(Fmt.day(r.0)) – \(Fmt.day(r.1))" }
}

/// Nút chọn kỳ như web: các mốc nhanh + "Khoảng tuỳ chọn…" mở bảng chọn 2 ngày.
struct PeriodMenu: View {
    @Binding var period: Period
    var options: [Period] = Period.presets
    var prefix: String = ""
    @State private var custom = false
    var body: some View {
        Menu {
            ForEach(options) { p in Button { period = p } label: { if period == p { Label(p.title, systemImage: "checkmark") } else { Text(p.title) } } }
            Divider()
            Button { custom = true } label: { Label("Khoảng tuỳ chọn…", systemImage: "calendar.badge.plus") }
        } label: { DatePill(text: prefix + period.title) }
        .sheet(isPresented: $custom) { MTFilterSheet(title: "Khoảng tuỳ chọn", existingNavigation: true) { CustomRangeSheet(initial: period.range) { period = .custom($0, $1) } } }
    }
}

struct CustomRangeSheet: View {
    let initial: (String, String); let apply: (String, String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var start = Date.now
    @State private var end = Date.now
    @State private var pickingStart = false
    @State private var pickingEnd = false
    var body: some View {
        NavigationStack {
            Form {
                Section("Khoảng thời gian") {
                    Button { pickingStart.toggle() } label: {
                        ListRow(icon: nil, tint: Palette.brand, title: "Từ ngày", subtitle: nil) { Text(Fmt.day(VNDate.string(start))) }
                    }
                    if pickingStart { DatePicker("Từ ngày", selection: $start, in: ...Date.now, displayedComponents: .date).datePickerStyle(.graphical) }
                    Button { pickingEnd.toggle() } label: {
                        ListRow(icon: nil, tint: Palette.brand, title: "Đến ngày", subtitle: nil) { Text(Fmt.day(VNDate.string(end))) }
                    }
                    if pickingEnd { DatePicker("Đến ngày", selection: $end, in: ...Date.now, displayedComponents: .date).datePickerStyle(.graphical) }
                }
                Section {
                    HStack { ForEach([("Tuần này", 0), ("Tuần trước", 1)], id: \.0) { l, w in Button(l) { let (a, b) = VNDate.week(offset: -w); start = VNDate.date(a) ?? .now; end = VNDate.date(b) ?? .now } } }.buttonStyle(.bordered).font(.caption)
                }
            }
            .safeAreaInset(edge: .bottom) {
                PrimaryButton(title: "Áp dụng", icon: "checkmark") {
                    apply(VNDate.string(min(start, end)), VNDate.string(max(start, end))); dismiss()
                }.padding(16).background(Palette.card)
            }
            .navigationTitle("Khoảng tuỳ chọn").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Đóng") { dismiss() } } }
            .onAppear { start = VNDate.date(initial.0) ?? .now; end = VNDate.date(initial.1) ?? .now }
        }.tint(Palette.brand).environment(\.locale, Locale(identifier: "vi_VN"))
        .presentationDetents([.medium]).presentationCornerRadius(28).presentationBackground(Palette.card).presentationDragIndicator(.visible)
    }
}
extension VNDate {
    /// Tuần (thứ Hai → hôm nay hoặc Chủ nhật) với offset tuần.
    static func week(offset: Int) -> (String, String) {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = tz; cal.firstWeekday = 2
        let now = cal.date(byAdding: .weekOfYear, value: offset, to: .now)!
        let start = cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: now))!
        let end = min(Date.now, cal.date(byAdding: .day, value: 6, to: start)!)
        return (string(start), string(end))
    }
    static func lastMonth(_ d: Date = .now) -> (String, String) {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = tz
        let start = cal.date(from: cal.dateComponents([.year, .month], from: d))!
        let prev = cal.date(byAdding: .month, value: -1, to: start)!
        return (string(prev), string(start.addingTimeInterval(-1)))
    }
    static func monthEnd(_ ym: String) -> String {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = tz
        guard let d = monthDate(String(ym.prefix(7))), let next = cal.date(byAdding: .month, value: 1, to: d) else { return ym + "-28" }
        return string(next.addingTimeInterval(-1))
    }
    static func shiftMonth(_ ym: String, _ n: Int) -> String {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = tz
        guard let d = date(ym + "-01"), let s = cal.date(byAdding: .month, value: n, to: d) else { return ym }
        return String(string(s).prefix(7))
    }
}

/// Bọc nội dung: nhúng trong tab (không cuộn riêng) hoặc mở như trang con (có cuộn + thanh xanh).
struct Embed<Content: View>: View {
    let embedded: Bool; let title: String; @ViewBuilder let content: Content
    var body: some View {
        if embedded { VStack(alignment: .leading, spacing: MT.cardGap) { content } }
        else { ScrollView { VStack(alignment: .leading, spacing: MT.cardGap) { content }.padding(MT.gutter) }.background(Palette.bg).navigationTitle(title).navigationBarTitleDisplayMode(.inline).brandNav() }
    }
}

// MARK: Cuộc gọi CSKH (ảnh 2.1)

struct CallsView: View {
    var team = "cskh"; var embedded = false
    @Environment(AppNav.self) private var nav: AppNav?
    /// R-POS: POS chung đang chọn (pill lọc); chọn POS nào chỉ tính POS đó.
    private var posIds: [String] { let p = nav?.pos ?? ""; return p.isEmpty ? [] : [p] }
    /// Mở theo kỳ chung (AppNav, kế hoạch 1.4), đổi riêng ở trang này được.
    @State private var period: Period = NavMemory.period
    @State private var data: API.Calls?
    @State private var prev: API.Calls?
    @State private var care: API.Care?
    @State private var filter = "all"
    @State private var staffPick = ""
    @State private var dept = ""
    @State private var countBy = "customers"
    @State private var error: String?
    private var isCskh: Bool { team == "cskh" }
    private var staffRows: [API.CallStaff] { (data?.staff ?? []).filter { (dept.isEmpty || $0.department == dept) && (staffPick.isEmpty || $0.authorId == staffPick) } }
    var body: some View {
        Embed(embedded: embedded, title: isCskh ? "Cuộc gọi CSKH" : "Cuộc gọi & đơn chốt Sale") {
            PageTitle(title: isCskh ? "Cuộc gọi CSKH" : "Cuộc gọi Sale", subtitle: "Kết nối nhiều hơn. Khách hàng hài lòng hơn.", icon: "phone.fill")
            ScopeFilterPill(period: $period)
            if let error, data == nil { StateView(error: error) { await load() } }
            if let d = data {
                let rows = staffRows
                let notes = rows.reduce(0) { $0 + $1.notes }, pn = prev?.staff.filter { dept.isEmpty || $0.department == dept }.reduce(0) { $0 + $1.notes }
                let cust = rows.reduce(0) { $0 + $1.customers }, assigned = rows.reduce(0) { $0 + $1.assigned }
                let orders = rows.reduce(0) { $0 + $1.orders }, net = rows.reduce(0) { $0 + $1.net }
                let days = max(1, Double(d.period?.days.count ?? 1)), people = max(1, Double(rows.filter { $0.notes > 0 }.count))
                let depts = Array(Set(d.staff.compactMap(\.department))).sorted()
                HStack(spacing: 10) {
                    Panel(padding: 12) {
                        HStack(spacing: 10) {
                            Image(systemName: "phone.fill").mtFont(.cardHeader).foregroundStyle(Color.good).frame(width: 32, height: 32).background(Color.brandSoft, in: .rect(cornerRadius: 9))
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Tổng ghi chú \(period == .today ? "hôm nay" : period.rawValue.lowercased())").mtFont(.caption).foregroundStyle(Color.inkSoft).lineLimit(1)
                                Text(Fmt.int(notes)).mtFont(.heroNumber).lineLimit(1).minimumScaleFactor(0.6).foregroundStyle(Color.ink).rolling(Fmt.int(notes))
                                if let dl = Fmt.delta(notes, pn) { HStack(spacing: 3) { Image(systemName: dl.hasPrefix("-") ? "arrowtriangle.down.fill" : "arrowtriangle.up.fill").font(.system(size: 7)); Text(dl).mtFont(.caption) }.foregroundStyle(dl.hasPrefix("-") ? Color.bad : Color.good) }
                                Text(period == .today ? "So với hôm qua" : "So với kỳ trước").mtFont(.caption).foregroundStyle(Color.inkSoft)
                            }
                        }
                    }
                    Panel(padding: 12) {
                        HStack(spacing: 10) {
                            Ring(value: assigned > 0 ? cust / assigned : 0, size: 56, line: 6)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Khách được ghi chú").mtFont(.caption).foregroundStyle(Color.inkSoft)
                                Text("\(Fmt.int(cust))/\(Fmt.int(assigned)) khách").mtFont(.body).foregroundStyle(Color.ink)
                                Text("đang cầm").mtFont(.caption).foregroundStyle(Color.inkSoft)
                            }
                        }
                    }
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    KpiCard(icon: "ic_m_calls", tint: .good, label: "Cuộc gọi (ghi chú)", value: Fmt.int(notes), note: "\(rows.filter { $0.notes > 0 }.count) nhân viên · \(Int(days)) ngày")
                    KpiCard(icon: "ic_m_customers", tint: .good, label: "Số khách đã gọi", value: Fmt.int(cust), note: "TB \(Fmt.int(cust / people / days)) khách/người/ngày")
                    KpiCard(icon: "ic_m_calls", tint: Palette.info, label: "Cuộc gọi / người / ngày", value: Fmt.int(notes / people / days), note: "Trung bình toàn nhóm")
                    NavigationLink(value: Route.orders(OrderQuery(start: period.range.0, end: period.range.1, group: "closed", basis: "confirmed", title: "Đơn chốt \(isCskh ? "CSKH" : "Sale")"))) { KpiCard(icon: "ic_m_closed", tint: .bad, label: "Đơn chốt (theo người bán)", value: Fmt.int(orders), note: "\(Fmt.shortMoney(net)) · AOV \(Fmt.shortMoney(orders > 0 ? net / orders : 0))") }.buttonStyle(.plain)
                    if let cv = d.coverage { KpiCard(icon: "cylinder.split.1x2.fill", tint: Palette.gray, label: "Dữ liệu ghi chú đã gom", value: Fmt.int(cv.notes), note: "\(Fmt.int(cv.customers)) khách · cập nhật \(cv.lastFetch.map { Fmt.dateTime($0) } ?? "—")") }
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        FilterChip(label: "Tất cả", on: filter == "all") { filter = "all" }
                        FilterChip(label: "Chưa liên hệ", on: filter == "todo", badge: Int(care?.summary.neverNoted ?? 0)) { filter = "todo" }
                        FilterChip(label: "Đã liên hệ", on: filter == "done") { filter = "done" }
                        Menu { Button("Tất cả nhân viên") { staffPick = "" }; ForEach(d.staff) { s in Button(s.name) { staffPick = s.authorId } } } label: { FilterChip(label: staffPick.isEmpty ? "Nhân viên" : (d.staff.first { $0.authorId == staffPick }?.name ?? "Nhân viên"), on: !staffPick.isEmpty, chevron: true) {} }
                        if depts.count > 1 { Menu { Button("Mọi bộ phận") { dept = "" }; ForEach(depts, id: \.self) { x in Button(x) { dept = x } } } label: { FilterChip(label: dept.isEmpty ? "Mọi bộ phận" : dept, on: !dept.isEmpty, chevron: true) {} } }
                        Menu { Button("Đếm: khách đã gọi") { countBy = "customers" }; Button("Đếm: cuộc gọi") { countBy = "notes" } } label: { FilterChip(label: countBy == "customers" ? "Đếm: khách đã gọi" : "Đếm: cuộc gọi", on: false, chevron: true) {} }
                    }
                }
                if let days = d.period?.days, days.count > 0 {
                    Panel {
                        HStack { Text("Theo ngày").mtFont(.cardHeader); Spacer(); Hint(text: countBy == "customers" ? "Số khách đã gọi" : "Số cuộc gọi") }
                        let pts: [(String, Double)] = days.map { day in (String(Fmt.day(day).prefix(5)), rows.reduce(0.0) { $0 + (countBy == "customers" ? ($1.byDay?[day]?.customers ?? 0) : ($1.byDay?[day]?.notes ?? 0)) }) }
                        BarChart(points: pts)
                    }
                }
                if filter == "all" {
                    HStack { Text("Theo nhân viên · \(rows.count) người").mtFont(.cardHeader).foregroundStyle(Color.ink); Spacer(); ExportButton(view: "calls", filename: "cuoc-goi-\(isCskh ? "cskh" : "sale")-\(period.range.0)-\(period.range.1)", headers: ["Nhân viên", "Bộ phận", "Cuộc gọi", "Khách đã gọi", "Đơn chốt", "Doanh thu", "Data đang cầm", "Ngày hoạt động"]) { rows.map { [$0.name, $0.department ?? "", Fmt.int($0.notes), Fmt.int($0.customers), Fmt.int($0.orders), Fmt.int($0.net), Fmt.int($0.assigned), Fmt.int($0.activeDays)] } } }
                    VStack(spacing: 0) {
                        let list = rows.sorted { countBy == "customers" ? $0.customers > $1.customers : $0.notes > $1.notes }
                        ForEach(Array(list.enumerated()), id: \.element.id) { i, s in
                            NavigationLink(value: Route.orders(OrderQuery(start: period.range.0, end: period.range.1, group: "closed", sellerId: s.authorId, basis: "confirmed", title: s.name))) {
                                HStack(spacing: 10) {
                                    Avatar(name: s.name, size: 38)
                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack { Text(s.name).mtFont(.body).foregroundStyle(Color.ink).lineLimit(1); Spacer(); Text("\(Fmt.int(s.notes)) cuộc gọi").mtFont(.body).foregroundStyle(Color.ink) }
                                        HStack(spacing: 6) { Image(systemName: "phone").mtFont(.caption); Text("\(Fmt.int(s.customers)) khách · cầm \(Fmt.int(s.assigned)) data").mtFont(.caption) ; Tag(text: s.orders > 0 ? "\(Fmt.int(s.orders)) đơn chốt" : "Chưa chốt", tone: s.orders > 0 ? .green : .red) }.foregroundStyle(Color.inkSoft)
                                        Text("Doanh thu \(Fmt.money(s.net)) · hoạt động \(Fmt.int(s.activeDays)) ngày").mtFont(.caption).foregroundStyle(Color.inkSoft).lineLimit(1)
                                    }
                                    IconButton(icon: "chevron.right", tint: .good)
                                }.padding(12).contentShape(.rect)
                            }.buttonStyle(.plain)
                            if i < list.count - 1 { Divider().padding(.leading, 60) }
                        }
                        if list.isEmpty { Text("Chưa có cuộc gọi trong kỳ.").mtFont(.body).foregroundStyle(Color.inkSoft).padding(12) }
                    }.background(Color.card, in: .rect(cornerRadius: MT.rCard)).cardShadow()
                } else if let c = care {
                    SectionHead(title: filter == "todo" ? "Khách chưa liên hệ" : "Khách vừa liên hệ", action: "\(Fmt.int(c.total)) khách")
                    CustomerCallList(rows: c.rows, done: filter == "done")
                }
                Text("Cuộc gọi = một ghi chú nhân viên viết trên hồ sơ khách ở Pancake. Đơn chốt tính theo người bán trên đơn, ngày xác nhận lần đầu.").mtFont(.caption).foregroundStyle(Color.inkSoft)
            } else if error == nil { SkeletonGrid(tiles: 2); Skeleton(height: 200) }
        }
        .task(id: "\(period.key)|\(filter)|\(staffPick)|\(posIds.joined())") { await load() }
        .pullToReload { await load() }
    }
    /// Kỳ này, kỳ trước và danh sách khách (khi lọc) tải cùng lúc.
    @MainActor private func load() async {
        let cur = period.range, pre = period.previous, tm = team, pickId = staffPick, ids = posIds
        let wantCare = filter != "all" && isCskh, order = filter == "todo" ? "note_old" : "note_new"
        let trace = LoadTrace("cuoc-goi", requests: wantCare ? 3 : 2)
        async let pReq = attempt(true, trace) { try await API.calls(start: pre.0, end: pre.1, team: tm, posIds: ids) }
        async let cReq = attempt(wantCare, trace) { try await API.care(assigned: pickId, sort: order, minDays: 0, q: "", page: 1, posIds: ids) }
        var ok = false
        do {
            data = try await trace.run { try await API.calls(start: cur.0, end: cur.1, team: tm, posIds: ids) }
            error = nil; ok = true
        } catch {
            if let text = LoadError.text(error) { self.error = text }
        }
        let pRes = await pReq
        let cRes = await cReq
        trace.end(cancelled: Task.isCancelled)
        guard ok else { return }
        prev = try? pRes?.get()
        if wantCare { care = try? cRes?.get() }
    }
}

/// Danh sách khách kiểu "Danh sách cuộc gọi": avatar, tên, SĐT, giờ, chip, ghi chú, nút gọi.
struct CustomerCallList: View {
    let rows: [API.CareRow]; let done: Bool
    var body: some View {
        VStack(spacing: 10) {
            ForEach(rows.prefix(30)) { r in
                NavigationLink(value: Route.customer(posId: r.posId, phone: r.phone ?? "")) {
                    HStack(alignment: .top, spacing: 10) {
                        Avatar(name: r.name ?? "K", size: 40, tint: done ? .brand : Palette.info)
                        VStack(alignment: .leading, spacing: 4) {
                            HStack { Text(r.name ?? r.phone ?? "Khách").mtFont(.body).foregroundStyle(Color.ink).lineLimit(1); Spacer(); Text(r.lastNoteAt.map { Fmt.time($0) } ?? "").mtFont(.caption).foregroundStyle(Color.inkSoft) }
                            HStack(spacing: 8) { HStack(spacing: 4) { Image(systemName: "phone").mtFont(.caption); Text(r.phone ?? "") }.mtFont(.caption).foregroundStyle(Color.inkSoft); Tag(text: r.lastNoteAt == nil ? "Chưa liên hệ" : "Đã liên hệ", tone: r.lastNoteAt == nil ? .red : .green) }
                            if let n = r.notes.first?.message, !n.isEmpty { Text(n).mtFont(.caption).foregroundStyle(Color.inkSoft).lineLimit(2) }
                            else { HStack(spacing: 4) { PosLabel(id: r.posId, name: r.posName); if let a = r.assignedName { Text("· \(a)").lineLimit(1) } }.mtFont(.caption).foregroundStyle(Color.inkSoft) }
                        }
                        if let p = r.phone, let u = URL(string: "tel:\(p)") { IconButton(icon: "phone.fill", tint: .good, url: u) }
                    }.padding(12).background(Color.card, in: .rect(cornerRadius: MT.rCard)).cardShadow()
                }.buttonStyle(.plain)
            }
        }
    }
}

// MARK: Khách theo nhân viên (ảnh 2.2)

struct CareView: View {
    var embedded = false
    @Environment(AppNav.self) private var nav: AppNav?
    /// R-POS: POS chung đang chọn (pill lọc); chọn POS nào chỉ tính POS đó.
    private var posIds: [String] { let p = nav?.pos ?? ""; return p.isEmpty ? [] : [p] }
    @State private var data: API.Care?
    @State private var error: String?
    @State private var assigned = ""
    @State private var sort = "note_old"
    @State private var minDays = 0
    @State private var q = ""
    @State private var prio = ""
    var body: some View {
        Embed(embedded: embedded, title: "Khách theo nhân viên") {
            PageTitle(title: "Khách theo nhân viên", subtitle: "Phân công rõ ràng. Chăm sóc tốt hơn.", icon: "person.2.fill")
            if let error, data == nil { StateView(error: error) { await load() } }
            if let d = data {
                let cur = d.staff.first { $0.id == assigned }
                Menu {
                    Button("Tất cả nhân viên CSKH") { assigned = "" }
                    ForEach(d.staff) { s in Button("\(s.name) · \(Fmt.int(s.assigned))") { assigned = s.id } }
                } label: {
                    Panel(padding: 12) {
                        HStack(spacing: 10) {
                            Avatar(name: cur?.name ?? "Tất cả", size: 40)
                            VStack(alignment: .leading, spacing: 2) { Text(cur?.name ?? "Tất cả nhân viên CSKH").mtFont(.cardHeader).foregroundStyle(Color.ink); Text(cur?.department ?? "Đội CSKH · \(d.staff.count) người").mtFont(.caption).foregroundStyle(Color.inkSoft) }
                            Spacer(); Image(systemName: "chevron.down").mtFont(.body).foregroundStyle(Color.inkSoft)
                        }
                    }
                }.buttonStyle(.plain)
                let total = cur.map { $0.assigned } ?? d.summary.total
                Panel(padding: 12) {
                    HStack(spacing: 10) {
                        Image(systemName: "person.2.fill").mtFont(.cardHeader).foregroundStyle(Color.good).frame(width: 36, height: 36).background(Color.brandSoft, in: .rect(cornerRadius: 10))
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Khách được phân công").mtFont(.caption).foregroundStyle(Color.inkSoft)
                            HStack(alignment: .firstTextBaseline, spacing: 6) { Text(Fmt.int(total)).mtFont(.heroNumber).lineLimit(1).minimumScaleFactor(0.6).foregroundStyle(Color.ink).rolling(Fmt.int(total)); Text("đã mua \(Fmt.int(cur == nil ? d.summary.buyers : 0)) · \(Fmt.shortMoney(d.summary.closedNet))").mtFont(.caption).foregroundStyle(Color.inkSoft) }
                        }
                        Spacer()
                        NavigationLink(value: Route.calls(team: "cskh")) { HStack(spacing: 3) { Text("Xem chi tiết"); Image(systemName: "chevron.right").mtFont(.caption) }.mtFont(.caption).foregroundStyle(Color.ink).padding(.horizontal, 10).padding(.vertical, 7).overlay(RoundedRectangle(cornerRadius: 8).stroke(Palette.line)) }.buttonStyle(.plain)
                    }
                }
                Text("Phân loại theo mức độ ưu tiên").mtFont(.body).foregroundStyle(Color.ink)
                let over20 = cur?.over20 ?? d.summary.over20, over7 = cur?.over7 ?? d.staff.reduce(0) { $0 + $1.over7 }, never = cur?.neverNoted ?? d.summary.neverNoted, today = cur?.notedToday ?? d.staff.reduce(0) { $0 + $1.notedToday }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 2), spacing: MT.cellGap) {
                    PrioTile(label: "Cần chăm sóc", n: over20, tint: .bad, on: prio == "20") { prio = prio == "20" ? "" : "20"; minDays = prio.isEmpty ? 0 : 20; sort = "note_old" }
                    PrioTile(label: "Có nguy cơ rời", n: over7, tint: .warn, on: prio == "7") { prio = prio == "7" ? "" : "7"; minDays = prio.isEmpty ? 0 : 7; sort = "note_old" }
                    PrioTile(label: "Chưa ghi chú", n: never, tint: Palette.info, on: prio == "never") { prio = prio == "never" ? "" : "never"; minDays = 0; sort = prio.isEmpty ? "note_old" : "note_old" }
                    PrioTile(label: "Vừa chăm sóc", n: today, tint: .good, on: prio == "today") { prio = prio == "today" ? "" : "today"; minDays = 0; sort = prio.isEmpty ? "note_old" : "note_new" }
                }
                HStack(spacing: 8) {
                    HStack(spacing: 8) { Image(systemName: "magnifyingglass").foregroundStyle(Color.inkSoft); TextField("Tìm khách hàng (tên, SĐT)", text: $q).mtFont(.body).onSubmit { Task { await load() } } }
                        .padding(.horizontal, 12).padding(.vertical, 10).background(Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Palette.line))
                    Menu { Button("Lâu chưa ghi chú") { sort = "note_old" }; Button("Ghi chú mới nhất") { sort = "note_new" }; Button("Mua nhiều tiền") { sort = "purchased" }; Button("Đặt gần đây") { sort = "last_order" }; Button("Tên A–Z") { sort = "name" } } label: { Image(systemName: "line.3.horizontal.decrease").mtFont(.cardHeader).foregroundStyle(Color.ink).frame(width: 40, height: 40).background(Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Palette.line)) }
                }
                SectionHead(title: "Danh sách khách hàng", action: sort == "note_new" ? "Ghi chú mới nhất" : sort == "note_old" ? "Lâu chưa ghi chú" : sort == "purchased" ? "Mua nhiều tiền" : "Sắp xếp", count: nil)
                VStack(spacing: 10) {
                    ForEach(d.rows) { r in
                        NavigationLink(value: Route.customer(posId: r.posId, phone: r.phone ?? "")) {
                            HStack(alignment: .top, spacing: 10) {
                                Avatar(name: r.name ?? "K", size: 40, tint: tint(r))
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack(spacing: 6) { Text(r.name ?? r.phone ?? "Khách").mtFont(.body).foregroundStyle(Color.ink).lineLimit(1); Tag(text: label(r), tone: tone(r)); Spacer() }
                                    HStack(spacing: 4) { Image(systemName: "phone").mtFont(.caption); Text("\(r.phone ?? "") ·"); PosLabel(id: r.posId, name: r.posName) }.mtFont(.caption).foregroundStyle(Color.inkSoft).lineLimit(1)
                                    if let n = r.notes.first?.message, !n.isEmpty { Text(n).mtFont(.caption).foregroundStyle(Color.inkSoft).lineLimit(2) }
                                    else { Text("\(Fmt.int(r.succeedOrders)) đơn TC · \(Fmt.shortMoney(r.purchased))\(r.assignedName.map { " · \($0)" } ?? "")").mtFont(.caption).foregroundStyle(Color.inkSoft).lineLimit(1) }
                                }
                                VStack(alignment: .trailing, spacing: 2) {
                                    if let dn = r.daysSinceNote { Text("\(Fmt.int(dn)) ngày").mtFont(.body).foregroundStyle(dn > 20 ? Color.bad : dn > 7 ? Color.warn : Color.good); Text("chưa liên hệ").mtFont(.caption).foregroundStyle(Color.inkSoft) }
                                    else { Text("chưa note").mtFont(.caption).foregroundStyle(Color.warn) }
                                    Image(systemName: "chevron.right").mtFont(.caption).foregroundStyle(Color.inkSoft).padding(.top, 2)
                                }
                            }.padding(12).background(Color.card, in: .rect(cornerRadius: MT.rCard)).cardShadow()
                        }.buttonStyle(.plain)
                    }
                    if d.rows.isEmpty { Panel { Text("Không có khách khớp bộ lọc.").mtFont(.body).foregroundStyle(Color.inkSoft) } }
                }
            } else if error == nil { Skeleton(height: 70); Skeleton(height: 80); SkeletonGrid(tiles: 4) }
        }
        .task(id: "\(assigned)|\(sort)|\(minDays)|\(prio)|\(posIds.joined())") { await load() }
        .pullToReload { await load() }
    }
    private func label(_ r: API.CareRow) -> String { guard let d = r.daysSinceNote else { return "Cần chăm sóc" }; return d > 20 ? "Cần chăm sóc" : d > 7 ? "Có nguy cơ rời" : r.succeedOrders > 0 ? "Ổn định" : "Tiềm năng" }
    private func tone(_ r: API.CareRow) -> Tone { guard let d = r.daysSinceNote else { return .red }; return d > 20 ? .red : d > 7 ? .orange : r.succeedOrders > 0 ? .green : .blue }
    private func tint(_ r: API.CareRow) -> Color { tone(r).color }
    @MainActor private func load() async {
        do {
            var d = try await API.care(assigned: assigned, sort: sort, minDays: minDays, q: q, page: 1, posIds: posIds)
            if prio == "never" { d = API.Care(total: Double(d.rows.filter { $0.lastNoteAt == nil }.count), summary: d.summary, staff: d.staff, rows: d.rows.filter { $0.lastNoteAt == nil }) }
            if prio == "today" { d = API.Care(total: Double(d.rows.filter { ($0.daysSinceNote ?? 99) < 1 }.count), summary: d.summary, staff: d.staff, rows: d.rows.filter { ($0.daysSinceNote ?? 99) < 1 }) }
            data = d; error = nil
        } catch { if let text = LoadError.text(error) { self.error = text } }
    }
}

struct PrioTile: View {
    let label: String; let n: Double; let tint: Color; let on: Bool; let tap: () -> Void
    var body: some View {
        Button(action: tap) {
            VStack(spacing: 3) { Text(label).mtFont(.caption).foregroundStyle(tint).lineLimit(1).minimumScaleFactor(0.7); Text(Fmt.int(n)).font(.system(size: 18, weight: .bold, design: .rounded)).foregroundStyle(tint).rolling(Fmt.int(n)) }
                .frame(maxWidth: .infinity).padding(.vertical, 10).background(tint.opacity(on ? 0.25 : 0.11), in: .rect(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(on ? tint : .clear, lineWidth: 1.5))
        }.buttonStyle(.plain)
    }
}

// MARK: Mua lại & Upsell (ảnh 2.3)

struct RepurchaseView: View {
    var embedded = false
    @Environment(AppNav.self) private var nav: AppNav?
    /// R-POS: POS chung đang chọn (pill lọc); chọn POS nào chỉ tính POS đó.
    private var posIds: [String] { let p = nav?.pos ?? ""; return p.isEmpty ? [] : [p] }
    @State private var period: Period = .d30
    @State private var data: API.Repurchase?
    @State private var prev: API.Repurchase?
    @State private var error: String?
    @State private var sellerId = ""
    var body: some View {
        Embed(embedded: embedded, title: "Mua lại & Upsell") {
            PageTitle(title: "Mua lại & Upsell", subtitle: "Khai thác giá trị thật. Đồng hành lâu dài.", icon: "chart.bar.fill")
            MTSegmentedControl(selection: $period, options: [(.d30, "30 ngày"), (.d60, "60 ngày"), (.d90, "90 ngày")])
            if let error, data == nil { StateView(error: error) { await load() } }
            if let d = data {
                HStack(spacing: 10) {
                    KpiCard(icon: "ic_m_upsell", tint: .good, label: "Khách mua lại", value: Fmt.int(d.summary.repurchase.customers), delta: Fmt.delta(d.summary.repurchase.customers, prev?.summary.repurchase.customers), note: "So với kỳ trước")
                    KpiCard(icon: "ic_m_revenue", tint: Palette.teal, label: "Doanh thu từ khách cũ", value: Fmt.vnd(d.summary.repurchase.net), delta: Fmt.delta(d.summary.repurchase.net, prev?.summary.repurchase.net))
                }
                Panel {
                    HStack { Text("Phễu cơ hội mua lại").mtFont(.cardHeader); Spacer(); Hint(text: "Trọn đời") }
                    let f = d.funnel
                    FunnelLine(label: "Tổng khách đã mua", n: f.once, of: f.once, tint: .good)
                    FunnelLine(label: "Mua từ 2 lần", n: f.twice, of: f.once, tint: .good)
                    FunnelLine(label: "Mua từ 3 lần", n: f.thrice, of: f.once, tint: .good)
                    FunnelLine(label: "Mua lại trong kỳ", n: d.summary.repurchase.customers, of: f.once, tint: .brand)
                }
                if !d.byTag.isEmpty {
                    HStack { Text("Sản phẩm mua lại nhiều").mtFont(.cardHeader); Spacer(); Hint(text: "Theo thẻ trên đơn") }
                    HStack(spacing: 10) {
                        ForEach(d.byTag.sorted { $0.resaleOrders > $1.resaleOrders }.prefix(2), id: \.tag) { t in
                            Panel(padding: 12) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Image(systemName: "leaf.fill").mtFont(.cardHeader).foregroundStyle(Color.good).frame(width: 30, height: 30).background(Color.brandSoft, in: .rect(cornerRadius: 8))
                                    Text(t.tag).mtFont(.body).foregroundStyle(Color.ink).lineLimit(1)
                                    Text("\(Fmt.int(t.resaleOrders)) đơn mua lại / \(Fmt.int(t.orders))").mtFont(.caption).foregroundStyle(Color.inkSoft)
                                    Tag(text: "Tỷ lệ mua lại \(Fmt.pct(t.resaleRate))", tone: .green)
                                }
                            }
                        }
                    }
                }
                HStack { Text("Theo nhân viên").mtFont(.cardHeader); Spacer(); if !sellerId.isEmpty { Button("Bỏ lọc") { sellerId = "" }.mtFont(.caption).foregroundStyle(Color.brand) } }
                VStack(spacing: 0) {
                    let list = Array(d.byEmployee.prefix(8))
                    ForEach(Array(list.enumerated()), id: \.element.id) { i, e in
                        Button { sellerId = sellerId == e.sellerId ? "" : e.sellerId } label: {
                            HStack(spacing: 10) {
                                Medal(rank: i + 1); Avatar(name: e.name, size: 32)
                                Text(e.name).font(.system(size: 13, weight: sellerId == e.sellerId ? .bold : .medium)).foregroundStyle(sellerId == e.sellerId ? Color.brand : Color.ink).lineLimit(1)
                                Spacer(); Text("\(Fmt.int(e.repurchase.orders)) đơn · \(Fmt.shortMoney(e.repurchase.net))").mtFont(.caption).foregroundStyle(Color.inkSoft).monospacedDigit()
                            }.padding(10).contentShape(.rect)
                        }.buttonStyle(.plain)
                        if i < list.count - 1 { Divider().padding(.leading, 40) }
                    }
                }.background(Color.card, in: .rect(cornerRadius: MT.rCard)).cardShadow()
                HStack { Text("Khách vừa mua lại").mtFont(.cardHeader); Spacer(); Hint(text: "\(d.recent.count) đơn") }
                VStack(spacing: 10) {
                    ForEach(Array(d.recent.prefix(15).enumerated()), id: \.offset) { _, r in
                        Panel(padding: 12) {
                            HStack(spacing: 10) {
                                Avatar(name: r.phone, size: 38, tint: Palette.info)
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack { Text(r.phone).mtFont(.body).foregroundStyle(Color.ink); Spacer(); Text(Fmt.vnd(r.net)).mtFont(.body).foregroundStyle(Color.good) }
                                    HStack(spacing: 4) { PosLabel(id: r.posId, name: r.posName); Text("· \(r.sellerName)").lineLimit(1) }.mtFont(.caption).foregroundStyle(Color.inkSoft)
                                    Text("Upsell lần \(r.level) · đơn thứ \(Int(r.prior) + 1) · \(Fmt.day(r.createdAt))\(r.tags.isEmpty ? "" : " · " + r.tags.prefix(2).joined(separator: ", "))").mtFont(.caption).foregroundStyle(Color.inkSoft).lineLimit(1)
                                }
                            }
                            HStack(spacing: 8) {
                                if let u = URL(string: "tel:\(r.phone)") { Link(destination: u) { ActionPill(icon: "phone.fill", text: "Gọi ngay", tint: .good) } }
                                if let u = URL(string: "sms:\(r.phone)") { Link(destination: u) { ActionPill(icon: "message.fill", text: "Nhắn tin", tint: .brand) } }
                                NavigationLink(value: Route.customer(posId: r.posId, phone: r.phone)) { ActionPill(icon: "person.text.rectangle", text: "Hồ sơ", tint: Palette.mtRolePurpleInk) }.buttonStyle(.plain)
                            }.padding(.top, 8)
                        }
                    }
                }
            } else if error == nil { SkeletonGrid(tiles: 2); Skeleton(height: 150) }
        }
        .task(id: "\(period.key)|\(sellerId)|\(posIds.joined())") { await load() }
        .pullToReload { await load() }
    }
    /// Kỳ này và kỳ trước tải cùng lúc.
    @MainActor private func load() async {
        let cur = period.range, pre = period.previous, sid = sellerId, ids = posIds
        let trace = LoadTrace("mua-lai", requests: 2)
        async let pReq = attempt(true, trace) { try await API.repurchase(start: pre.0, end: pre.1, sellerId: sid, posIds: ids) }
        var ok = false
        do {
            data = try await trace.run { try await API.repurchase(start: cur.0, end: cur.1, sellerId: sid, posIds: ids) }
            error = nil; ok = true
        } catch {
            if let text = LoadError.text(error) { self.error = text }
        }
        let pRes = await pReq
        trace.end(cancelled: Task.isCancelled)
        if ok { prev = try? pRes?.get() }
    }
}

struct ActionPill: View {
    let icon: String; let text: String; let tint: Color
    var body: some View {
        HStack(spacing: 5) { Image(systemName: icon).mtFont(.caption); Text(text).mtFont(.caption) }
            .foregroundStyle(tint).frame(maxWidth: .infinity).padding(.vertical, 8).overlay(RoundedRectangle(cornerRadius: 9).stroke(tint.opacity(0.5)))
    }
}

// MARK: Khách lâu chưa mua (ảnh 3.1)

struct DormantView: View {
    var embedded = false
    @Environment(AppNav.self) private var nav: AppNav?
    /// R-POS: POS chung đang chọn (pill lọc); chọn POS nào chỉ tính POS đó.
    private var posIds: [String] { let p = nav?.pos ?? ""; return p.isEmpty ? [] : [p] }
    @State private var days = 30
    @State private var q = ""
    @State private var data: API.CustomerPage?
    @State private var rows: [API.CustomerRow] = []
    @State private var error: String?
    private var segment: String { days == 30 ? "potential" : days == 60 ? "risk" : "dormant" }
    var body: some View {
        Embed(embedded: embedded, title: "Khách lâu chưa mua") {
            PageTitle(title: "Khách lâu chưa mua", subtitle: "Gọi lại đúng lúc, giữ khách ở lại.", icon: "moon.zzz.fill", trailing: AnyView(Menu { Button("Lâu chưa mua nhất") { }; Button("Mua nhiều tiền") { } } label: { Image(systemName: "line.3.horizontal.decrease").mtFont(.cardHeader).foregroundStyle(Color.ink) }))
            MTSegmentedControl(selection: $days, options: [(30, "30 ngày"), (60, "60 ngày"), (90, "90 ngày")])
            if let error, rows.isEmpty { StateView(error: error) { await load(next: false) } }
            if let d = data {
                HStack(spacing: 12) {
                    Image(systemName: "bell.fill").font(.system(size: 18, weight: .bold)).foregroundStyle(.white).frame(width: 44, height: 44).background(Color.bad, in: .circle)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(days == 30 ? "Mua 1 lần, 31–90 ngày chưa quay lại" : days == 60 ? "Từng mua ≥2 lần, quá 60 ngày chưa mua" : "Ngủ đông: quá 90 ngày chưa mua").mtFont(.caption).foregroundStyle(Color.inkSoft)
                        HStack(alignment: .firstTextBaseline, spacing: 4) { Text(Fmt.int(d.total)).mtFont(.heroNumber).lineLimit(1).minimumScaleFactor(0.6).foregroundStyle(Color.ink).rolling(Fmt.int(d.total)); Text("khách hàng").mtFont(.body).foregroundStyle(Color.ink) }
                        Text("cần liên hệ lại").mtFont(.caption).foregroundStyle(Color.inkSoft)
                    }
                    Spacer(); Image(systemName: "chevron.right").mtFont(.body).foregroundStyle(Color.bad)
                }.padding(12).background(Color.bad.opacity(0.08), in: .rect(cornerRadius: MT.rCard)).overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.bad.opacity(0.2)))
                HStack(spacing: 8) { Image(systemName: "magnifyingglass").foregroundStyle(Color.inkSoft); TextField("Tìm theo tên hoặc SĐT", text: $q).mtFont(.body).onSubmit { Task { await load(next: false) } } }
                    .padding(.horizontal, 12).padding(.vertical, 10).background(Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Palette.line))
                SectionHead(title: "Khách hàng ưu tiên liên hệ (\(days) ngày)", action: "\(Fmt.int(d.total)) khách")
                VStack(spacing: 10) {
                    ForEach(rows) { r in
                        NavigationLink(value: Route.customer(posId: r.posId, phone: r.phone)) {
                            HStack(spacing: 10) {
                                Avatar(name: r.name ?? r.phone, size: 40, tint: Palette.info)
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack(spacing: 6) { Text(r.name ?? r.phone).mtFont(.body).foregroundStyle(Color.ink).lineLimit(1); Tag(text: r.successNet >= 2_000_000 ? "Ưu tiên cao" : r.successNet >= 700_000 ? "Ưu tiên trung bình" : "Ưu tiên thấp", tone: r.successNet >= 2_000_000 ? .red : r.successNet >= 700_000 ? .orange : .green) }
                                    Text("\(Fmt.int(r.daysSinceSuccess ?? 0)) ngày chưa mua").mtFont(.caption).foregroundStyle(Color.bad)
                                    HStack(spacing: 4) { Text("\(r.phone) ·"); PosLabel(id: r.posId, name: r.posName); if let s = r.sellerName { Text("· \(s)").lineLimit(1) } }.mtFont(.caption).foregroundStyle(Color.inkSoft)
                                }
                                Spacer()
                                if let u = URL(string: "tel:\(r.phone)") { IconButton(icon: "phone.fill", tint: .good, url: u) }
                            }.padding(12).background(Color.card, in: .rect(cornerRadius: MT.rCard)).cardShadow()
                        }.buttonStyle(.plain)
                    }
                    if d.hasMore { Button { Task { await load(next: true) } } label: { Text("Xem thêm").mtFont(.body).foregroundStyle(Color.brand).frame(maxWidth: .infinity).padding(10) } }
                }
            } else if error == nil { Skeleton(height: 80); Skeleton(height: 200) }
        }
        .task(id: "\(days)|\(posIds.joined())") { await load(next: false) }
        .pullToReload { await load(next: false) }
    }
    @MainActor private func load(next: Bool) async {
        do {
            let p = try await API.customers(segment: segment, sort: "dormant", q: q, page: next ? (data?.page ?? 0) + 1 : 1, posIds: posIds)
            rows = next ? rows + p.customers : p.customers; data = p; error = nil
        } catch { if let text = LoadError.text(error) { self.error = text } }
    }
}

// MARK: KPI CSKH (ảnh 3.2)

struct KpiView: View {
    @AppStorage("thp_hide_money") private var hideMoney = false
    var embedded = false
    @Environment(AuthModel.self) private var auth
    @Environment(AppNav.self) private var nav: AppNav?
    /// R-POS: POS chung đang chọn (pill lọc); chọn POS nào chỉ tính POS đó.
    private var posIds: [String] { let p = nav?.pos ?? ""; return p.isEmpty ? [] : [p] }
    @State private var mode = "person"
    @State private var month = String(VNDate.string(.now).prefix(7))
    @State private var targets: API.Targets?
    @State private var actual: API.Overview?
    @State private var care: API.Care?
    @State private var staff: [API.Employee] = []
    @State private var pick = ""
    @State private var history: [(String, Double)] = []
    /// Đã hỏi số 6 tháng (có hay không), để không chờ mãi khi không có số.
    @State private var historyLoaded = false
    /// Chưa có mục tiêu tháng vì tải lỗi: câu lỗi dễ hiểu (LoadError).
    @State private var failText: String?
    @State private var editing: API.Employee?
    private var isOwner: Bool { auth.me?.role == "owner" }
    var body: some View {
        Embed(embedded: embedded, title: "KPI CSKH") {
            PageTitle(title: "KPI CSKH", subtitle: "Mục tiêu rõ, tiến độ rõ.", icon: "target", trailing: AnyView(Menu { Button("Tháng này") { month = String(VNDate.string(.now).prefix(7)) }; Button("Tháng trước") { month = VNDate.shiftMonth(String(VNDate.string(.now).prefix(7)), -1) } } label: { DatePill(text: "Tháng \(Int(month.suffix(2)) ?? 0)/\(month.prefix(4))") }))
            MTSegmentedControl(selection: $mode, options: [("person", "Cá nhân"), ("team", "Đội nhóm")])
            // R-POS: chỉ người thuộc POS đang chọn (người làm 2 POS hiện ở cả hai).
            let list = staff.filter { $0.active != false && CskhKpiProgress.inPos($0, nav?.pos ?? "") }
            let cur = list.first { $0.id == pick }
            if mode == "person" {
                Menu { ForEach(list) { e in Button(e.name) { pick = e.id } } } label: {
                    Panel(padding: 12) {
                        HStack(spacing: 10) {
                            Avatar(name: cur?.name ?? "?", size: 40)
                            VStack(alignment: .leading, spacing: 2) { Text(cur?.name ?? "Chọn nhân viên").mtFont(.cardHeader).foregroundStyle(Color.ink); Text(cur?.department ?? "Nhân viên CSKH").mtFont(.caption).foregroundStyle(Color.inkSoft) }
                            Spacer(); Text("Đổi nhân viên").mtFont(.caption).foregroundStyle(Color.ink).padding(.horizontal, 10).padding(.vertical, 7).overlay(RoundedRectangle(cornerRadius: 8).stroke(Palette.line))
                        }
                    }
                }.buttonStyle(.plain)
            }
            if let t = targets {
                let goals = Dictionary(uniqueKeysWithValues: t.items.filter { $0.scope == "employee" }.map { ($0.refId, $0) })
                let ids = mode == "person" ? [pick] : list.map(\.id)
                let goalRev = ids.reduce(0.0) { $0 + (goals[$1]?.revenue ?? 0) }, goalOrders = ids.reduce(0.0) { $0 + (goals[$1]?.closedOrders ?? 0) }
                let by = Dictionary(uniqueKeysWithValues: (actual?.current.byEmployee ?? []).map { ($0.sellerId, $0) })
                let actRev = ids.reduce(0.0) { $0 + (by[$1]?.closedNet ?? 0) }, actOrders = ids.reduce(0.0) { $0 + (by[$1]?.closedOrders ?? 0) }
                let cs = mode == "person" ? care?.staff.first { $0.id == pick } : nil
                let assigned = cs?.assigned ?? care?.summary.total ?? 0, noted = assigned - (cs?.neverNoted ?? care?.summary.neverNoted ?? 0)
                Panel {
                    MTMetricHeroCard(label: "Tiến độ KPI doanh số tháng", value: "\(Fmt.shortMoney(actRev)) / \(goalRev > 0 ? Fmt.shortMoney(goalRev) : "—")",
                                     scope: "\(Fmt.monthLabel(month)) · CSKH · \(mode == "person" ? (cur?.name ?? "Chưa chọn nhân viên") : "Cả đội")", isPrivacyMasked: hideMoney)
                    Text(Fmt.pct0(goalRev > 0 ? actRev / goalRev * 100 : nil)).mtFont(.cardMetric)
                    if goalRev > 0 { Bar(value: actRev / goalRev, tint: Palette.cskh, height: 8) }
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    KpiRing(label: "Khách cần chăm sóc", value: Fmt.int(assigned), sub: "đang được phân công", ring: nil, icon: "person.2.fill")
                    KpiRing(label: "Đã chăm sóc", value: Fmt.int(noted), sub: Fmt.pct0(assigned > 0 ? noted / assigned * 100 : nil) + " đã ghi chú", ring: assigned > 0 ? noted / assigned : 0, icon: nil)
                    KpiRing(label: "Đơn chốt", value: Fmt.int(actOrders), sub: goalOrders > 0 ? Fmt.pct0(actOrders / goalOrders * 100) + " đạt mục tiêu" : "chưa đặt mục tiêu", ring: goalOrders > 0 ? actOrders / goalOrders : 0, icon: nil)
                    KpiRing(label: "Doanh thu từ KH CSKH", value: hideMoney ? "••• tr ₫" : Fmt.shortMoney(actRev), sub: goalRev > 0 ? Fmt.pct0(actRev / goalRev * 100) + " đạt mục tiêu" : "chưa đặt mục tiêu", ring: goalRev > 0 ? actRev / goalRev : 0, icon: nil)
                }
                Panel {
                    HStack { Text("Mục tiêu tháng").mtFont(.cardHeader); Hint(text: mode == "person" ? "Cá nhân" : "Cả đội"); Spacer(); if isOwner && mode == "person", let cur { Button { editing = cur } label: { HStack(spacing: 4) { Image(systemName: "pencil"); Text("Sửa") }.mtFont(.caption).foregroundStyle(Color.ink).padding(.horizontal, 10).padding(.vertical, 6).overlay(RoundedRectangle(cornerRadius: 8).stroke(Palette.line)) } } }
                    GoalRow(label: "Số khách cần chăm sóc", value: Fmt.int(assigned))
                    GoalRow(label: "Số đơn chốt", value: goalOrders > 0 ? Fmt.int(goalOrders) : "—")
                    GoalRow(label: "Doanh thu (triệu đồng)", value: goalRev > 0 ? Fmt.int(goalRev / 1e6) : "—")
                }
                Panel {
                    HStack { Text("Hiệu suất 6 tháng gần đây").mtFont(.cardHeader); Spacer(); Hint(text: "Doanh thu đơn chốt") }
                    if !history.isEmpty {
                        Chart(Array(history.enumerated()), id: \.offset) { _, point in
                            BarMark(x: .value("Tháng", point.0), y: .value("Doanh thu", point.1))
                                .foregroundStyle(Palette.cskh).cornerRadius(4)
                        }
                        .chartYAxis { AxisMarks(position: .leading) { value in
                            AxisGridLine().foregroundStyle(Palette.line)
                            AxisValueLabel { if let amount = value.as(Double.self) { Text(Fmt.shortMoney(amount)) } }
                        } }
                        .frame(height: 150)
                    }
                    else if historyLoaded { Text("Chưa có số 6 tháng gần đây.").mtFont(.body).foregroundStyle(Color.inkSoft) }
                    else { Skeleton(height: 120) }
                }
                if mode == "team" {
                    Text("Theo nhân viên").mtFont(.cardHeader)
                    VStack(spacing: 0) {
                        ForEach(Array(list.enumerated()), id: \.element.id) { i, e in
                            let g = goals[e.id]?.revenue ?? 0, a = by[e.id]?.closedNet ?? 0
                            Button { if isOwner { editing = e } else { pick = e.id; mode = "person" } } label: {
                                HStack(spacing: 10) {
                                    Avatar(name: e.name, size: 34)
                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack { Text(e.name).mtFont(.body).foregroundStyle(Color.ink).lineLimit(1); Spacer(); Text(Fmt.pct0(g > 0 ? a / g * 100 : nil)).mtFont(.body).foregroundStyle(g > 0 && a / g >= 1 ? Color.good : g > 0 && a / g >= 0.7 ? Color.warn : g > 0 ? Color.bad : Color.inkSoft) }
                                        Bar(value: g > 0 ? a / g : 0, tint: .good, height: 5)
                                        Text("\(Fmt.short(a)) / \(g > 0 ? Fmt.shortMoney(g) : "chưa đặt ₫") · \(Fmt.int(by[e.id]?.closedOrders ?? 0)) đơn").mtFont(.caption).foregroundStyle(Color.inkSoft)
                                    }
                                }.padding(10).contentShape(.rect)
                            }.buttonStyle(.plain)
                            if i < list.count - 1 { Divider().padding(.leading, 54) }
                        }
                    }.background(Color.card, in: .rect(cornerRadius: MT.rCard)).cardShadow()
                }
            } else if let failText { StateView(error: failText) { await load() } }
            else { SkeletonGrid(tiles: 4) }
        }
        .sheet(item: $editing) { e in TargetEditor(employee: e, current: targets?.items.first { $0.scope == "employee" && $0.refId == e.id }, month: month) { Task { await load() } } }
        .task(id: "\(month)|\(pick)|\(mode)|\(posIds.joined())") { await load() }
        .pullToReload { await load() }
    }
    /// Danh sách nhân viên (một lần) rồi mục tiêu, số tháng, khách, số 6 tháng tải cùng lúc.
    @MainActor private func load() async {
        if staff.isEmpty { staff = (try? await API.employees(team: "cskh")) ?? [] }
        let posId = nav?.pos ?? ""
        // Người đang chọn không thuộc POS vừa chọn: chuyển sang người đầu tiên của POS đó.
        let inPos = staff.filter { $0.active != false && CskhKpiProgress.inPos($0, posId) }
        if pick.isEmpty || !inPos.contains(where: { $0.id == pick }) { pick = inPos.first?.id ?? "" }
        let m = month, person = mode == "person", pk = pick, pids = posIds
        let end = min(VNDate.monthEnd(m), VNDate.string(.now)), start = VNDate.shiftMonth(m, -5) + "-01"
        let ids = (person ? [pk] : []).filter { !$0.isEmpty }
        let trace = LoadTrace("kpi", requests: 4)
        async let tReq = attempt(true, trace) { try await API.targets(month: m) }
        async let aReq = attempt(true, trace) { try await API.overview(start: m + "-01", end: end, posIds: pids, team: "cskh", compare: "none") }
        async let cReq = attempt(true, trace) { try await API.care(assigned: person ? pk : "", sort: "note_old", minDays: 0, q: "", page: 1, posIds: pids) }
        async let hReq = attempt(true, trace) { try await API.overview(start: start, end: end, posIds: pids, groupBy: "month", team: "cskh", compare: "none", employeeIds: ids) }
        let (tRes, aRes, cRes, hRes) = await (tReq, aReq, cReq, hReq)
        trace.end(cancelled: Task.isCancelled)
        guard !Task.isCancelled else { return }
        var errors: [Error] = []
        func value<T>(_ r: Result<T, Error>?) -> T? {
            switch r {
            case .success(let v)?: return v
            case .failure(let e)?: errors.append(e); return nil
            case nil: return nil
            }
        }
        targets = value(tRes)
        actual = value(aRes)
        care = value(cRes)
        if let h = value(hRes) {
            var sums: [String: Double] = [:]; for r in h.current.series ?? [] { sums[r.bucket, default: 0] += r.closedNet }
            history = sums.keys.sorted().map { ("Th\(Int($0.suffix(2)) ?? 0)", sums[$0]!) }
        }
        historyLoaded = true
        failText = targets == nil ? (errors.compactMap { LoadError.text($0) }.first ?? "Không tải được") : nil
    }
}

struct KpiRing: View {
    let label: String; let value: String; let sub: String; let ring: Double?; let icon: String?
    var body: some View {
        Panel(padding: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(label).mtFont(.caption).foregroundStyle(Color.inkSoft).lineLimit(1)
                    Text(value).mtFont(.heroNumber).lineLimit(1).minimumScaleFactor(0.6).foregroundStyle(Color.ink).rolling(value)
                    Text(sub).mtFont(.caption).foregroundStyle(Color.good).lineLimit(1)
                }
                Spacer()
                if let ring { Ring(value: ring, size: 44, line: 5, tint: ring >= 1 ? .good : ring >= 0.7 ? .good : .warn, label: "") }
                else if let icon { Image(systemName: icon).font(.system(size: 18)).foregroundStyle(Color.good) }
            }
        }
    }
}
struct GoalRow: View {
    let label: String; let value: String
    var body: some View {
        HStack { Text(label).mtFont(.body).foregroundStyle(Color.ink); Spacer(); Text(value).mtFont(.body).monospacedDigit().padding(.horizontal, 12).padding(.vertical, 6).frame(minWidth: 80).background(Color.card, in: .rect(cornerRadius: 8)).overlay(RoundedRectangle(cornerRadius: 8).stroke(Palette.line)) }
    }
}

// MARK: So sánh nhân viên (như web)

struct CompareView: View {
    /// full: bố cục cũ (CSKH, Tất cả); summary: trang Sale (khung 08A); table: "Từng nhân viên" (khung 09A1).
    enum Mode { case full, summary, table }
    var team = "all"; var embedded = false
    var mode: Mode = .full
    /// Nội dung chèn ngay dưới pill lọc (trang Sale: segmented Nhân viên / Data / Trong ca).
    var header: AnyView? = nil
    @Environment(AuthModel.self) private var auth
    @Environment(AppNav.self) private var nav: AppNav?
    @State private var teamError: String?
    @State private var generation = UUID()
    private var applied: HrUnit? { HrUnit.applies(nav?.hrUnit, to: effTeam) }
    private var loadKey: String { "\(period.key)|\(effTeam)|\(pos)|\(product)|\(applied?.id ?? "")" }
    @State private var teamPick = "sale"
    @State private var period: Period
    @State private var sort = "closedNet"
    @State private var dept = ""
    @State private var pos = ""
    @State private var q = ""
    @State private var data: API.Overview?
    @State private var error: String?
    /// Nhóm đơn của bảng Sale vừa bấm ở Tổng quan ("all" = mọi nhóm).
    private let product: String
    /// period, pos, product: kỳ, POS, nhóm đơn mở sẵn (khi mở từ bảng Sale ở Tổng quan); period nil = kỳ chung (AppNav, kế hoạch 1.4).
    init(team: String = "all", embedded: Bool = false, period: Period? = nil, pos: String = "", product: String = "all", mode: Mode = .full, header: AnyView? = nil) {
        self.team = team; self.embedded = embedded
        _period = State(initialValue: period ?? NavMemory.period)
        _pos = State(initialValue: pos)
        self.product = product
        self.mode = mode; self.header = header
    }
    /// Tài khoản chỉ xem một bộ phận: máy chủ ép team về bộ phận đó (lib/access.ts), nên hỏi và ghi nhãn theo bộ phận đó.
    private var myTeam: String { auth.me?.team ?? "all" }
    private var effTeam: String { myTeam != "all" ? myTeam : team == "all" ? teamPick : team }
    /// Kỳ, POS, bộ phận, nhóm đơn của trang (cùng bộ lọc với số đang hiện): chạm một số hay một người mở danh sách đơn đúng bộ lọc này.
    private var filters: OrderFilters { OrderFilters(period: period, pos: pos, team: effTeam, product: product) }
    private var all: [API.EmployeeRow] { (data?.current.byEmployee ?? []).filter { !$0.sellerId.isEmpty && (dept.isEmpty || $0.department == dept) && (q.isEmpty || ($0.name ?? "").lowercased().contains(q.lowercased())) } }
    private var prevBy: [String: API.EmployeeRow] { Dictionary(uniqueKeysWithValues: (data?.compare?.byEmployee ?? []).map { ($0.sellerId, $0) }) }
    private var rows: [API.EmployeeRow] { sort == "closedOrders" ? all.sorted { $0.closedOrders > $1.closedOrders } : sort == "rate" ? all.sorted { ($0.shownRate ?? -1) > ($1.shownRate ?? -1) } : all.sorted { $0.closedNet > $1.closedNet } }
    private func rankedStaff(high: Bool) -> [API.EmployeeRow] {
        let qualified = rows.filter { $0.assignedOrders >= 10 }
        return qualified.sorted {
            high ? ($0.shownRate ?? -1) > ($1.shownRate ?? -1) : ($0.shownRate ?? 999) < ($1.shownRate ?? 999)
        }
    }
    private var depts: [String] { Array(Set((data?.current.byEmployee ?? []).compactMap(\.department))).sorted() }
    private func median(_ xs: [Double]) -> Double? { let s = xs.sorted(); guard !s.isEmpty else { return nil }; return s.count % 2 == 1 ? s[s.count / 2] : (s[s.count / 2 - 1] + s[s.count / 2]) / 2 }
    var body: some View {
        Embed(embedded: embedded, title: "So sánh nhân viên") {
            if mode == .full { PageTitle(title: "So sánh nhân viên", subtitle: "Tỷ lệ chốt = \(MetricPrefs.shared.rateShort) · so với kỳ liền trước") }
            ScopeFilterPill(period: $period, pos: $pos, team: true, fixedProduct: product)
            if let header { header }
            if mode == .summary { summaryContent } else { fullContent }
        }
        .task(id: loadKey) { await load() }
        .pageReload(embedded: embedded) { await load() }
        #if DEBUG
        .onChange(of: DebugTap.shared.tick) { _, _ in
            guard MktNvTour.active, DebugTap.shared.target == "nv-mo" else { return }
            // Trang Sale nằm dưới trang "Từng nhân viên": chỉ trang trên cùng mở hồ sơ.
            if mode == .summary, case .dept(_, _, _, _, let pg)? = nav?.deptsPath.last, pg == "staff" { return }
            let low = rankedStaff(high: false).first
            let top = rankedStaff(high: true).first
            guard let e = low ?? top else { MktNvTour.failed = true; return }
            nav?.deptsPath.append(.staffDetail(.of(e, in: filters, period: period, hrTeam: applied?.id)))
        }
        #endif
    }

    // MARK: Trang Sale (khung 08A)

    private var deptLabel: String { effTeam == "sale" ? "Sale" : effTeam == "cskh" ? "CSKH" : "Tất cả" }
    /// Hero "DOANH THU CHỐT · SALE", bảng theo nhóm sản phẩm, "Hiệu suất đội ngũ", nút "So sánh nhân viên ›", rồi bảng nhân viên
    /// theo nhóm sản phẩm (StaffTableBlock: giữ vì xác nhận kho, team dùng bảng này).
    @ViewBuilder private var summaryContent: some View {
        HrTeamNotice(applies: applied != nil, deptLabel: deptLabel)
        if let teamError { HrTeamErrorView(message: teamError) { nav?.hrUnit = nil } }
        else if let error, data == nil { StateView(error: error) { await load() } }
        if let d = data {
            saleHero(d)
            if effTeam == "sale" { ProductGroupsBlock(period: period, pos: pos, product: product, hrTeam: applied?.id) }
            teamCard
            NavigationLink(value: Route.dept(.sale, period: period, pos: pos, product: product, page: "staff")) {
                HStack(spacing: 4) { Text("So sánh nhân viên"); Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)) }
                    .mtFont(.body).fontWeight(.bold).foregroundStyle(Color.white)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(Palette.mtBrandPrimary, in: .rect(cornerRadius: MT.rCell))
            }.buttonStyle(MTPressStyle())
        } else if error == nil { Skeleton(height: 140); Skeleton(height: 220) }
        if effTeam == "sale", auth.me?.canView("sale-overview") == true {
            StaffTableBlock(team: "sale", by: "seller", period: period, pos: pos, product: product, hrTeam: applied)
        }
    }
    /// Hero: badge so kỳ trước, số lớn, 2 thanh Kỳ trước / Kỳ này.
    private func saleHero(_ d: API.Overview) -> some View {
        let t = d.current.total, previous = d.compare?.total.closedNet
        return NavigationLink(value: Route.orders(OrderQuery.from(filters, group: "closed", basis: "confirmed", title: "Đơn chốt"))) {
            VStack(alignment: .leading, spacing: MT.cellGap) {
                HStack(alignment: .top) {
                    Text("DOANH THU CHỐT · \(deptLabel.uppercased())").mtFont(.caption).fontWeight(.bold).foregroundStyle(Palette.muted)
                    Spacer(minLength: 6)
                    if let delta = Fmt.delta(t.closedNet, previous) { DeltaPill(delta) }
                }
                Text(Fmt.shortVnd(t.closedNet)).mtFont(.heroNumber).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.6)
                Text("\(Fmt.int(t.closedOrders)) đơn chốt" + (product == "all" ? "" : " · nhóm \(Fmt.productGroup(product))"))
                    .mtFont(.caption).foregroundStyle(Palette.muted)
                if let previous {
                    MTComparisonBarRow(previous: previous, previousText: Fmt.shortMoney(previous), previousLabel: "Kỳ trước",
                                       current: t.closedNet, currentText: Fmt.shortMoney(t.closedNet), currentLabel: "Kỳ này")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading).contentShape(.rect)
            .heroSurface()
        }.buttonStyle(.plain)
    }
    /// "Hiệu suất đội ngũ": lưới 2×2 và các hàng nhân viên kèm badge tỷ lệ chốt (dưới 40% đỏ ▼).
    private var teamCard: some View {
        let list = rows
        let assigned = list.reduce(0) { $0 + $1.assignedOrders }, closed = list.reduce(0) { $0 + $1.closedOrders }
        let qualified = list.filter { $0.assignedOrders >= 10 }
        let med = median(qualified.compactMap(\.shownRate))
        let best = qualified.max { ($0.shownRate ?? -1) < ($1.shownRate ?? -1) }
        return VStack(alignment: .leading, spacing: MT.cellGap) {
            Text("Hiệu suất đội ngũ").mtFont(.cardHeader).foregroundStyle(Palette.ink)
            Grid(horizontalSpacing: MT.cellGap, verticalSpacing: MT.cellGap) {
                GridRow {
                    BoardCell(label: "Tổng nhân sự", value: Fmt.int(Double(list.count)))
                    BoardCell(label: "Tổng đơn chia / chốt", value: "\(Fmt.int(assigned)) / \(Fmt.int(closed))")
                }
                GridRow {
                    BoardCell(label: "Trung vị tỷ lệ chốt", note: "người từ 10 đơn chia") { MTRateBadge(rate: med, kind: .saleClose) }
                    BoardCell(label: "Nổi bật · \(best?.name ?? "—")") { MTRateBadge(rate: best?.shownRate, kind: .saleClose) }
                }
            }
            ForEach(list.prefix(10)) { e in
                NavigationLink(value: Route.staffDetail(.of(e, in: filters, period: period, hrTeam: applied?.id))) {
                    HStack(spacing: 6) {
                        Text("\(e.name ?? "NV") · \(Fmt.int(e.closedOrders))/\(Fmt.int(e.assignedOrders))")
                            .mtFont(.body).fontWeight(.semibold).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
                        Spacer(minLength: 4)
                        Text(Fmt.shortVnd(e.closedNet)).mtFont(.body).fontWeight(.bold).foregroundStyle(Palette.ink).lineLimit(1)
                        MTRateBadge(rate: e.shownRate, kind: .saleClose)
                        Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Palette.muted)
                    }
                    .padding(10).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .background(Palette.wash, in: .rect(cornerRadius: MT.rCell)).contentShape(.rect)
                }.buttonStyle(.plain)
            }
            if list.count > 10 { Text("Xem đủ \(list.count) người ở So sánh nhân viên.").mtFont(.caption).foregroundStyle(Palette.muted) }
        }
        .padding(MT.cardPad).frame(maxWidth: .infinity, alignment: .leading).cardSurface()
    }

    // MARK: Bố cục cũ (CSKH, Tất cả) và "Từng nhân viên" (khung 09A1)

    @ViewBuilder private var fullContent: some View {
            if mode == .full, team == "all" && myTeam == "all" { Segmented(selection: $teamPick, options: [("sale", "Sale"), ("cskh", "CSKH"), ("all", "Tất cả")]) }
            HrTeamNotice(applies: applied != nil, deptLabel: effTeam == "sale" ? "Sale" : effTeam == "cskh" ? "CSKH" : "Tất cả")
            if mode == .full, effTeam == "sale", auth.me?.canView("sale-overview") == true {
                StaffTableBlock(team: "sale", by: "seller", period: period, pos: pos, product: product, hrTeam: applied)
            }
            HStack(spacing: 8) {
                Menu { Button("Tất cả bộ phận") { dept = "" }; ForEach(depts, id: \.self) { d in Button(d) { dept = d } } } label: { SelectBox(text: dept.isEmpty ? "Tất cả bộ phận" : dept, icon: "person.2") }
                HStack(spacing: 6) { Image(systemName: "magnifyingglass").mtFont(.caption).foregroundStyle(Color.inkSoft); TextField("Tìm tên nhân viên", text: $q).mtFont(.body) }.padding(.horizontal, 10).padding(.vertical, 9).background(Color.card, in: .rect(cornerRadius: 9)).overlay(RoundedRectangle(cornerRadius: 9).stroke(Palette.mtCardBorder))
            }
            if let teamError { HrTeamErrorView(message: teamError) { nav?.hrUnit = nil } }
            else if let error, data == nil { StateView(error: error) { await load() } }
            if data != nil {
                let list = rows
                let assigned = list.reduce(0) { $0 + $1.assignedOrders }, closed = list.reduce(0) { $0 + $1.closedOrders }, den = list.reduce(0) { $0 + $1.legacyRateDen }
                let pAssigned = list.reduce(0.0) { $0 + (prevBy[$1.sellerId]?.assignedOrders ?? 0) }, pClosed = list.reduce(0.0) { $0 + (prevBy[$1.sellerId]?.closedOrders ?? 0) }
                let qualified = list.filter { $0.assignedOrders >= 10 }
                let med = median(qualified.compactMap(\.shownRate))
                let pMed = median(qualified.compactMap { prevBy[$0.sellerId]?.shownRate })
                let best = qualified.max { ($0.shownRate ?? -1) < ($1.shownRate ?? -1) }
                // Doanh thu chốt của một bộ phận trong kỳ (cùng số với dòng Sale / CSKH ở Trang chủ và bảng ở Tổng quan; không theo ô tìm,
                // bộ phận con). "Tất cả" không hiện: số đó gồm cả người bán MKT và đơn chưa gán, không phải doanh thu một bộ phận (anh Vũ 10/10).
                // Khung 09A1: hero gọn (2 thanh Kỳ trước / Kỳ này nằm trong thẻ) rồi bảng ngay dưới.
                if mode == .table, let d = data, effTeam != "all" { saleHero(d) }
                else if let t = data?.current.total, effTeam != "all" {
                    NavigationLink(value: Route.orders(OrderQuery.from(filters, group: "closed", basis: "confirmed", title: "Đơn chốt"))) {
                        MTMetricHeroCard(label: "Doanh thu chốt · bộ phận " + (effTeam == "cskh" ? "CSKH" : "Sale"),
                                         value: Fmt.shortMoney(t.closedNet), scope: "\(Fmt.int(t.closedOrders)) đơn chốt" + (product == "all" ? "" : " · nhóm \(Fmt.productGroup(product))"),
                                         comparison: Fmt.delta(t.closedNet, data?.compare?.total.closedNet))
                    }.buttonStyle(.plain)
                    if let previous = data?.compare?.total.closedNet {
                        MTComparisonBarRow(previous: previous, previousText: Fmt.shortMoney(previous), previousLabel: "Kỳ trước",
                                           current: t.closedNet, currentText: Fmt.shortMoney(t.closedNet), currentLabel: "Kỳ này")
                    }
                }
                // Trang "Từng nhân viên" (table): bảng theo nhóm sản phẩm đã có ở trang Sale, không tải lại.
                if mode == .full, effTeam == "sale" {
                    ProductGroupsBlock(period: period, pos: pos, product: product, hrTeam: applied?.id)
                }
                // Trang "Từng nhân viên" (09A1) chỉ có hero và bảng; các khối phân tích giữ ở bố cục cũ (CSKH, Tất cả).
                if mode != .table {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    KpiCard(icon: "ic_m_staff", tint: .good, label: "Tổng nhân sự", value: Fmt.int(Double(list.count)), note: "Có đơn chia hoặc đơn chốt trong kỳ")
                    KpiCard(icon: "ic_m_orders", tint: Palette.info, label: "Tổng đơn chia", value: Fmt.int(assigned), delta: Fmt.delta(assigned, pAssigned), note: "Trung bình \(Fmt.int(assigned / Double(max(1, list.count)))) đơn/người")
                    NavigationLink(value: Route.orders(OrderQuery.from(filters, group: "closed", basis: "confirmed", title: "Đơn chốt"))) { KpiCard(icon: "ic_m_closed", tint: .good, label: "Tổng đơn chốt", value: Fmt.int(closed), delta: Fmt.delta(closed, pClosed), note: "Tỷ lệ chốt chung \(Fmt.pct(den > 0 ? closed / den * 100 : nil))") }.buttonStyle(.plain)
                    KpiCard(icon: "ic_m_rate", tint: Palette.mtRolePurpleInk, label: "Trung vị tỷ lệ chốt", value: Fmt.pct(med), delta: (med != nil && pMed != nil) ? Fmt.points(med! - pMed!) : nil, deltaGood: (med ?? 0) >= (pMed ?? 0), note: "Mục tiêu tham chiếu \(Fmt.pct0(MetricPrefs.shared.goodRate))")
                }
                if let b = best {
                    NavigationLink(value: Route.staffDetail(.of(b, in: filters, period: period, hrTeam: applied?.id))) {
                        HStack(spacing: 10) {
                            Image(systemName: "trophy.fill").mtFont(.cardHeader).foregroundStyle(Color.good).frame(width: 34, height: 34).background(Color.brandSoft, in: .rect(cornerRadius: 9))
                            VStack(alignment: .leading, spacing: 2) { Text("NHÂN VIÊN NỔI BẬT").mtFont(.caption).tracking(0.6).foregroundStyle(Color.inkSoft); Group { if effTeam == "sale" { MTRateBadge(rate: b.shownRate, kind: .saleClose) } else { Text(Fmt.pct(b.shownRate)).mtFont(.cardMetric) } }; Text("\(b.name ?? "") · \(b.rateFrac)").mtFont(.caption).foregroundStyle(Color.inkSoft) }
                            Spacer(); Image(systemName: "chevron.right").mtFont(.caption).foregroundStyle(Color.inkSoft)
                        }.padding(12).background(Color.card, in: .rect(cornerRadius: MT.rCard)).overlay(RoundedRectangle(cornerRadius: MT.rCard).stroke(Color.good.opacity(0.35))).cardShadow()
                    }.buttonStyle(.plain)
                }
                // Hiệu suất đội ngũ
                Panel {
                    HStack { Text("Hiệu suất đội ngũ").mtFont(.cardHeader); Spacer(); Hint(text: "Vạch xám: trung vị · vạch xanh: mục tiêu \(Fmt.pct0(MetricPrefs.shared.goodRate))") }
                    Text("Tỷ lệ chốt (%) của 15 nhân viên cao nhất").mtFont(.caption).foregroundStyle(Color.inkSoft)
                    ForEach(Array(all.sorted { ($0.shownRate ?? -1) > ($1.shownRate ?? -1) }.prefix(15).enumerated()), id: \.element.id) { _, e in
                        NavigationLink(value: Route.staffDetail(.of(e, in: filters, period: period, hrTeam: applied?.id))) {
                            HStack(spacing: 8) {
                                Text(e.name ?? "NV").mtFont(.caption).foregroundStyle(Color.ink).lineLimit(1).frame(width: 118, alignment: .trailing)
                                ZStack(alignment: .leading) {
                                    GeometryReader { g in
                                        Capsule().fill(Palette.mtCardBorder)
                                        Capsule().fill(Fmt.rateTone(e.shownRate)).frame(width: g.size.width * CGFloat(min(1, (e.shownRate ?? 0) / 100)))
                                        if let m = med { Rectangle().fill(Color.inkSoft).frame(width: 1.5).offset(x: g.size.width * CGFloat(min(1, m / 100))) }
                                        Rectangle().fill(Color.good.opacity(0.6)).frame(width: 1.5).offset(x: g.size.width * CGFloat(MetricPrefs.shared.goodRate / 100))
                                    }
                                }.frame(height: 10)
                                Text(Fmt.pct(e.shownRate)).mtFont(.caption).monospacedDigit().frame(width: 48, alignment: .trailing)
                            }.padding(.vertical, 2).contentShape(.rect)
                        }.buttonStyle(.plain)
                    }
                    HStack { Text("0%"); Spacer(); Text("25%"); Spacer(); Text("50%"); Spacer(); Text("75%"); Spacer(); Text("100%") }.mtFont(.caption).foregroundStyle(Color.inkSoft).padding(.leading, 126).padding(.trailing, 56)
                }
                // Scatter
                Panel {
                    HStack { Text("Đơn chia vs. tỷ lệ chốt").mtFont(.cardHeader); Spacer(); Hint(text: "Mỗi chấm một người · cỡ theo doanh thu") }
                    Scatter(points: all.map { (x: $0.assignedOrders, y: $0.shownRate ?? 0, w: $0.closedNet, name: $0.name ?? "") })
                    HStack { Text("Chốt tốt, cần thêm data").mtFont(.caption); Spacer(); Text("Hiệu suất cao").mtFont(.caption) }.foregroundStyle(Color.inkSoft)
                    HStack { Text("Cần hỗ trợ, ưu tiên coaching").mtFont(.caption); Spacer(); Text("Cân bằng data").mtFont(.caption) }.foregroundStyle(Color.inkSoft)
                }
                // Nổi bật / cần hỗ trợ / cân bằng data
                let top = rankedStaff(high: true).prefix(3)
                let low = rankedStaff(high: false).prefix(3)
                let medAssigned = median(all.map(\.assignedOrders)) ?? 0
                let balance = qualified.filter { ($0.shownRate ?? 0) >= (med ?? 0) && $0.assignedOrders <= medAssigned }.sorted { ($0.shownRate ?? 0) > ($1.shownRate ?? 0) }.prefix(3)
                RankBlock(title: "Nhân viên nổi bật", sub: "Tỷ lệ cao nhất, ≥ 10 đơn chia", icon: "crown.fill", tone: .good, rows: Array(top), prev: prevBy, filters: filters, period: period, hrTeam: applied?.id)
                RankBlock(title: "Cần hỗ trợ", sub: "Tỷ lệ thấp nhất, ≥ 10 đơn chia", icon: "person.2.fill", tone: .bad, rows: Array(low), prev: prevBy, filters: filters, period: period, hrTeam: applied?.id)
                RankBlock(title: "Cân bằng data", sub: "Chốt tốt nhưng ít data, nên cấp thêm số", icon: "arrow.left.arrow.right", tone: .warn, rows: Array(balance), prev: prevBy, filters: filters, period: period, hrTeam: applied?.id)
                }
                // Bảng chi tiết (trang "Từng nhân viên" 09A1: bảng gọn 4 cột vừa màn hình).
                if mode == .table { compactTable(list) } else {
                HStack { Text("So sánh chi tiết nhân viên (\(list.count) người)").mtFont(.cardHeader); Spacer(); ExportButton(view: "compare", filename: "so-sanh-nhan-vien-\(period.range.0)-\(period.range.1)", headers: ["Nhân viên", "Bộ phận", "Đơn chia", "Đơn chốt", "Tỷ lệ chốt", "Doanh thu", "AOV", "Tỷ lệ kỳ trước", "Doanh thu kỳ trước"]) { list.map { [$0.name ?? "", $0.department ?? "", Fmt.int($0.assignedOrders), Fmt.int($0.closedOrders), Fmt.pct($0.shownRate), Fmt.int($0.closedNet), Fmt.int($0.averageOrder ?? 0), Fmt.pct(prevBy[$0.sellerId]?.shownRate), Fmt.int(prevBy[$0.sellerId]?.closedNet ?? 0)] } }; Menu { Button("Theo doanh thu") { sort = "closedNet" }; Button("Theo đơn chốt") { sort = "closedOrders" }; Button("Theo tỷ lệ chốt") { sort = "rate" } } label: { HStack(spacing: 3) { Text(sort == "closedNet" ? "Doanh thu" : sort == "closedOrders" ? "Đơn chốt" : "Tỷ lệ chốt"); Image(systemName: "chevron.down").mtFont(.caption) }.mtFont(.caption).foregroundStyle(Color.ink) } }
                MTStickyColumnTable(
                    rows: Array(list.prefix(60)), total: nil, columns: ScoreColumn.allCases,
                    title: { $0.title }, sort: { column in if let key = column.sortKey { sort = key } },
                    firstTitle: "Nhân viên", columnWidth: 140, rowHeight: 96,
                    selectedColumn: ScoreColumn.allCases.first { $0.sortKey == sort }
                ) { employee in
                    NavigationLink(value: Route.staffDetail(.of(employee, in: filters, period: period, hrTeam: applied?.id))) {
                        VStack(alignment: .leading, spacing: MT.cellGap) {
                            Text(employee.name ?? "NV").mtFont(.body)
                            Text(employee.department ?? "—").mtFont(.caption).foregroundStyle(Palette.muted)
                        }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }.buttonStyle(.plain)
                } cell: { employee, column in
                    NavigationLink(value: Route.staffDetail(.of(employee, in: filters, period: period, hrTeam: applied?.id))) {
                        scoreCell(employee, column: column)
                    }.buttonStyle(.plain)
                }
                }
                Text("Cách tính: đơn chia = đơn có người bán được gán trong kỳ; đơn chốt theo ngày xác nhận lần đầu; tỷ lệ chốt = \(MetricPrefs.shared.rateShort) (đổi ở Thêm → Cách tính). Nổi bật và cần hỗ trợ chỉ xét người có từ 10 đơn chia.").mtFont(.caption).foregroundStyle(Color.inkSoft)
            } else if error == nil { SkeletonGrid(tiles: 4); Skeleton(height: 220) }
    }
    /// Khung 09A1: Nhân viên | Số chia | Đơn chốt | Tỷ lệ chốt, dòng Tổng cuối; chạm tiêu đề cột để xếp, chạm một dòng mở trang nhân viên.
    @ViewBuilder private func compactTable(_ list: [API.EmployeeRow]) -> some View {
        let assigned = list.reduce(0) { $0 + $1.assignedOrders }, closed = list.reduce(0) { $0 + $1.closedOrders }, den = list.reduce(0) { $0 + $1.legacyRateDen }
        VStack(spacing: 0) {
            HStack(spacing: MT.cellGap) {
                headerCell("Nhân viên", key: "closedNet").frame(maxWidth: .infinity, alignment: .leading)
                Text("Số chia").frame(width: 56, alignment: .trailing)
                headerCell("Đơn chốt", key: "closedOrders").frame(width: 64, alignment: .trailing)
                headerCell("Tỷ lệ chốt", key: "rate").frame(width: 84, alignment: .trailing)
            }
            .mtFont(.caption).fontWeight(.bold).foregroundStyle(Palette.muted)
            .padding(.horizontal, 10).frame(minHeight: 40)
            ForEach(list.prefix(60)) { e in
                NavigationLink(value: Route.staffDetail(.of(e, in: filters, period: period, hrTeam: applied?.id))) {
                    compactRow(e.name ?? "NV", assigned: e.assignedOrders, closed: e.closedOrders, rate: e.shownRate)
                }.buttonStyle(.plain)
            }
            compactRow("Tổng (\(list.count) người)", assigned: assigned, closed: closed, rate: den > 0 ? closed / den * 100 : nil, total: true)
        }
        .background(Palette.wash, in: .rect(cornerRadius: MT.rCell))
        .overlay { RoundedRectangle(cornerRadius: MT.rCell).strokeBorder(Palette.line, lineWidth: 1) }
    }
    private func headerCell(_ title: String, key: String) -> some View {
        Button { sort = key } label: {
            HStack(spacing: 2) { Text(title); if sort == key { Image(systemName: "arrow.down").font(.system(size: 9, weight: .bold)) } }
        }.buttonStyle(.plain)
    }
    private func compactRow(_ name: String, assigned: Double, closed: Double, rate: Double?, total: Bool = false) -> some View {
        HStack(spacing: MT.cellGap) {
            Text(name).lineLimit(1).truncationMode(.tail).frame(maxWidth: .infinity, alignment: .leading)
            Text(Fmt.int(assigned)).frame(width: 56, alignment: .trailing)
            Text(Fmt.int(closed)).frame(width: 64, alignment: .trailing)
            Group {
                if effTeam == "sale" { MTRateBadge(rate: rate, kind: .saleClose) } else { Text(Fmt.pct(rate)) }
            }.frame(width: 84, alignment: .trailing)
        }
        .mtFont(.body).fontWeight(total ? .bold : .regular).foregroundStyle(Palette.ink).monospacedDigit()
        .padding(.horizontal, 10).frame(minHeight: 44)
        .overlay(alignment: .top) { Rectangle().fill(Palette.line).frame(height: 1) }
        .contentShape(.rect)
    }
    private enum ScoreColumn: CaseIterable, Identifiable {
        case revenue, rate, assigned, closed, average, previous
        var id: Self { self }
        var title: String {
            switch self {
            case .revenue: return "Doanh thu"
            case .rate: return "Tỷ lệ chốt"
            case .assigned: return "Đơn chia"
            case .closed: return "Đơn chốt"
            case .average: return "AOV"
            case .previous: return "Kỳ trước"
            }
        }
        var sortKey: String? {
            switch self {
            case .revenue: return "closedNet"
            case .rate: return "rate"
            case .closed: return "closedOrders"
            default: return nil
            }
        }
    }
    @ViewBuilder private func scoreCell(_ employee: API.EmployeeRow, column: ScoreColumn) -> some View {
        switch column {
        case .revenue: Text(Fmt.shortMoney(employee.closedNet))
        case .rate:
            VStack(alignment: .trailing, spacing: MT.cellGap) {
                if effTeam == "sale" { MTRateBadge(rate: employee.shownRate, kind: .saleClose) }
                else { Text(Fmt.pct(employee.shownRate)) }
                Text(employee.rateFrac).mtFont(.caption).foregroundStyle(Palette.muted)
            }
        case .assigned: Text(Fmt.int(employee.assignedOrders))
        case .closed: Text(Fmt.int(employee.closedOrders))
        case .average: Text(Fmt.shortVnd(employee.averageOrder))
        case .previous:
            VStack(alignment: .trailing, spacing: MT.cellGap) {
                Text(Fmt.pct(prevBy[employee.sellerId]?.shownRate))
                Text(Fmt.shortVnd(prevBy[employee.sellerId]?.closedNet))
            }
        }
    }
    private struct ProductGroupsBlock: View {
        let period: Period
        let pos: String
        let product: String
        let hrTeam: String?
        @State private var report: API.ProductGroupsReport?
        @State private var error: String?
        @State private var missing = false
        @State private var explanation: InfoText?
        private var key: String { period.key + "|" + pos + "|" + (hrTeam ?? "") }
        var body: some View {
            VStack(alignment: .leading, spacing: MT.cardGap) {
                if let report {
                    // Khung 08A: mỗi nhóm sản phẩm một bảng Nhân viên | Đơn chốt | Doanh thu, có dòng Tổng.
                    ForEach(report.groups) { group in
                        Panel {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(group.label).mtFont(.cardHeader)
                                    Text(Fmt.int(group.closed) + " đơn chốt").mtFont(.caption).foregroundStyle(Palette.muted)
                                }
                                Spacer()
                                Button {
                                    explain(group.label, closed: group.closed, net: group.closedNet, report: report)
                                } label: {
                                    Text(Fmt.shortVnd(group.closedNet)).mtFont(.cardMetric).lineLimit(1).minimumScaleFactor(0.6).frame(minHeight: 44)
                                }.buttonStyle(.plain)
                            }
                            VStack(spacing: 0) {
                                tableRow("Nhân viên", "Đơn chốt", "Doanh thu", header: true)
                                ForEach(report.staff) { person in
                                    if let value = person.groups[group.label] {
                                        Button { explain(person.name + " · " + group.label, closed: value.closed, net: value.closedNet, report: report) } label: {
                                            tableRow(person.name, Fmt.int(value.closed), Fmt.shortVnd(value.closedNet))
                                        }.buttonStyle(.plain)
                                    }
                                }
                                tableRow("Tổng", Fmt.int(group.closed), Fmt.shortVnd(group.closedNet), total: true)
                            }
                            .background(Palette.wash, in: .rect(cornerRadius: MT.rCell))
                            .overlay { RoundedRectangle(cornerRadius: MT.rCell).strokeBorder(Palette.line, lineWidth: 1) }
                        }
                    }
                    if let definition = report.definitions["groups"] {
                        Text(definition).mtFont(.caption).foregroundStyle(Palette.muted)
                    }
                    if product != "all" { Text(StaffTerms.productUnfiltered).mtFont(.caption).foregroundStyle(Palette.warn) }
                } else if missing { StateView(empty: "Chưa có trên máy chủ") }
                else if let error { StateView(error: error) { await loadGroups() } }
                else { StateView(loading: "Đang tải nhóm sản phẩm…") }
            }.task(id: key) { await loadGroups() }
                .sheet(item: $explanation) { InfoSheet(info: $0) }
        }
        /// Một dòng bảng nhóm sản phẩm: tên (cột cố định trái), đơn chốt, doanh thu.
        private func tableRow(_ name: String, _ closed: String, _ net: String, header: Bool = false, total: Bool = false) -> some View {
            HStack(spacing: MT.cellGap) {
                Text(name).frame(maxWidth: .infinity, alignment: .leading).lineLimit(1).minimumScaleFactor(0.8)
                Text(closed).frame(width: 64, alignment: .trailing)
                Text(net).frame(width: 92, alignment: .trailing).lineLimit(1).minimumScaleFactor(0.7)
            }
            .mtFont(header ? .caption : .body).fontWeight(header || total ? .bold : .regular)
            .foregroundStyle(header ? Palette.muted : Palette.ink).monospacedDigit()
            .padding(.horizontal, 10).frame(minHeight: header ? 36 : 40)
            .overlay(alignment: .top) { if !header { Rectangle().fill(Palette.line).frame(height: 1) } }
            .contentShape(.rect)
            .accessibilityElement(children: .combine)
        }
        private func explain(_ title: String, closed: Double, net: Double, report: API.ProductGroupsReport) {
            let scope = Fmt.day(period.range.0) + " – " + Fmt.day(period.range.1) + " · " + (pos.isEmpty ? "Mọi POS" : PosBreakdown.short[pos] ?? pos) + " · " + (hrTeam == nil ? "Mọi team" : "Team đang chọn")
            explanation = InfoText(title: title, body: scope + "\n" + Fmt.int(closed) + " đơn chốt · " + Fmt.shortMoney(net) + "\n\n" + (report.definitions["closed"] ?? "") + "\n\n" + (report.definitions["groups"] ?? ""))
        }
        @MainActor private func loadGroups() async {
            report = nil; error = nil; missing = false
            do {
                let result = try await API.saleProductGroups(start: period.range.0, end: period.range.1, pos: pos, hrTeam: hrTeam)
                try Task.checkCancellation()
                report = result
            } catch {
                guard !Task.isCancelled else { return }
                missing = (error as? API.APIError)?.status == 404
                if !missing { self.error = LoadError.text(error) }
            }
        }
    }
    @MainActor private func load() async {
        let k = loadKey, ticket = UUID(), unit = applied
        generation = ticket; data = nil; error = nil; teamError = nil
        let r = period.range, ids = pos.isEmpty ? [] : [pos], tm = effTeam, prod = product
        let trace = LoadTrace("nhan-vien", requests: 1)
        defer { trace.end(cancelled: Task.isCancelled || generation != ticket) }
        do {
            let result = try await trace.run { try await API.overview(start: r.0, end: r.1, posIds: ids, team: tm, product: prod, hrTeam: unit?.id) }
            try Task.checkCancellation()
            guard generation == ticket, loadKey == k else { return }
            data = result
            #if DEBUG
            if MktNvTour.active { MktNvTour.compare = true }
            #endif
        } catch {
            guard generation == ticket, loadKey == k, !Task.isCancelled else { return }
            teamError = HrUnit.serverMessage(error, applied: unit)
            self.error = LoadError.text(error)
        }
    }
}

struct RankBlock: View {
    let title: String; let sub: String; let icon: String; let tone: Color; let rows: [API.EmployeeRow]; let prev: [String: API.EmployeeRow]
    /// Bộ lọc của trang So sánh nhân viên (kỳ, POS, bộ phận, nhóm đơn): chạm một người mở trang chi tiết của người đó với đúng bộ lọc này.
    let filters: OrderFilters
    let period: Period; let hrTeam: String?
    var body: some View {
        Panel {
            HStack(spacing: 6) { Image(systemName: icon).foregroundStyle(tone); Text(title).mtFont(.cardHeader).foregroundStyle(Color.ink); Spacer() }
            Text(sub).mtFont(.caption).foregroundStyle(Color.inkSoft)
            if rows.isEmpty { Text("Chưa đủ dữ liệu.").mtFont(.caption).foregroundStyle(Color.inkSoft) }
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, e in
                NavigationLink(value: Route.staffDetail(.of(e, in: filters, period: period, hrTeam: hrTeam))) {
                    HStack(spacing: 8) {
                        Text("\(i + 1)").mtFont(.caption).foregroundStyle(tone).frame(width: 14)
                        VStack(alignment: .leading, spacing: 1) { Text(e.name ?? "NV").mtFont(.body).foregroundStyle(Color.ink); Text("Kỳ trước \(Fmt.pct(prev[e.sellerId]?.shownRate)) · \(Fmt.shortMoney(e.closedNet)) · \(e.department ?? "")").mtFont(.caption).foregroundStyle(Color.inkSoft).lineLimit(1) }
                        Spacer()
                        if filters.team == "sale" { MTRateBadge(rate: e.shownRate, kind: .saleClose) }
                        else { Text(Fmt.pct(e.shownRate)).mtFont(.body).foregroundStyle(tone) }
                        Text(e.rateFrac).mtFont(.caption).foregroundStyle(Color.inkSoft).monospacedDigit()
                    }.frame(minHeight: 44).padding(.vertical, 4).contentShape(.rect)
                }.buttonStyle(.plain)
            }
        }
    }
}

/// Đồ thị điểm: x = đơn chia, y = tỷ lệ chốt, cỡ chấm theo doanh thu.
struct Scatter: View {
    let points: [(x: Double, y: Double, w: Double, name: String)]
    var body: some View {
        Chart(Array(points.enumerated()), id: \.offset) { _, point in
            PointMark(x: .value("Đơn chia", point.x), y: .value("Tỷ lệ chốt", point.y))
                .symbolSize(by: .value("Doanh thu", point.w))
                .foregroundStyle(Palette.good)
                .accessibilityLabel(point.name)
                .accessibilityValue(Fmt.int(point.x) + " đơn chia, " + Fmt.pct(point.y) + ", " + Fmt.shortMoney(point.w))
        }
        .chartXAxis { AxisMarks { axis in AxisGridLine(); AxisValueLabel { if let value = axis.as(Double.self) { Text(Fmt.int(value)) } } } }
        .chartYAxis { AxisMarks { axis in AxisGridLine(); AxisValueLabel { if let value = axis.as(Double.self) { Text(Fmt.pct0(value)) } } } }
        .chartYAxisLabel("Tỷ lệ chốt")
        .chartXAxisLabel("Đơn chia")
        .frame(height: 180)
    }
}

// MARK: Data được cấp (ảnh 4.2)

struct BatchesView: View {
    var embedded = false
    /// Kỳ chung nếu là Tháng này hoặc Tháng trước (kế hoạch 1.4), không thì 90 ngày như trước.
    @State private var period: Period = NavMemory.period(in: [.month, .last, .d90], else: .d90)
    @Environment(AppNav.self) private var nav: AppNav?
    /// R-POS: POS chung đang chọn (pill lọc); chọn POS nào chỉ tính POS đó.
    private var posIds: [String] { let p = nav?.pos ?? ""; return p.isEmpty ? [] : [p] }
    @State private var filter = "all"
    @State private var data: API.Batches?
    @State private var error: String?
    private var thisMonth: String { String(VNDate.string(.now).prefix(7)) }
    var body: some View {
        Embed(embedded: embedded, title: "Data được cấp") {
            PageTitle(title: "Data được cấp", subtitle: "Mỗi đợt số được giao, kết quả rõ ràng.")
            ScopeFilterPill(period: $period, periodOptions: [.month, .last, .d90])
            if let error, data == nil { StateView(error: error) { await load() } }
            if let d = data {
                let all = d.batches, recv = all.reduce(0) { $0 + $1.received }, buy = all.reduce(0) { $0 + $1.buyers }
                MTMetricHeroCard(label: "Tổng số điện thoại đã nhận", value: Fmt.int(recv), scope: "\(all.count) đợt")
                MTStatCell(label: "Tỷ lệ mua (toàn bộ)", value: Fmt.pct(recv > 0 ? buy / recv * 100 : nil), note: "\(Fmt.int(buy)) SĐT đã mua")
                let months = Array(Set(all.map(\.month))).sorted(by: >)
                let list = months.filter { filter == "all" || (filter == "active" ? $0 == thisMonth : $0 != thisMonth) }
                MTFlowLayout(spacing: MT.cellGap) {
                        FilterChip(label: "Tất cả (\(months.count))", on: filter == "all") { filter = "all" }
                        FilterChip(label: "Đang triển khai (\(months.filter { $0 == thisMonth }.count))", on: filter == "active") { filter = "active" }
                        FilterChip(label: "Đã hoàn thành (\(months.filter { $0 != thisMonth }.count))", on: filter == "done") { filter = "done" }
                }
                SectionHead(title: "Danh sách đợt", action: "Mới nhất")
                VStack(spacing: 10) {
                    ForEach(list, id: \.self) { m in
                        let rows = all.filter { $0.month == m }
                        let r = rows.reduce(0) { $0 + $1.received }, b = rows.reduce(0) { $0 + $1.buyers }, net = rows.reduce(0) { $0 + $1.net }
                        NavigationLink(value: Route.orders(OrderQuery(start: m + "-01", end: VNDate.monthEnd(m), basis: "assigned", title: "Data tháng \(m.suffix(2))/\(m.prefix(4))"))) {
                            Panel(padding: 12) {
                                HStack { Text("#BT\(m.replacingOccurrences(of: "-", with: ""))").mtFont(.body).foregroundStyle(Color.ink); Spacer(); Tag(text: m == thisMonth ? "Đang triển khai" : "Đã hoàn thành", tone: m == thisMonth ? .green : .blue) }
                                HStack(spacing: MT.cardGap) {
                                    HStack(spacing: 5) { Image(systemName: "iphone").mtFont(.caption); VStack(alignment: .leading, spacing: 0) { Text(Fmt.int(r)).mtFont(.body); Text("điện thoại").mtFont(.caption) } }
                                    HStack(spacing: 5) { Image(systemName: "person.2").mtFont(.caption); VStack(alignment: .leading, spacing: 0) { Text("\(rows.count) nhân viên").mtFont(.body); Text("được giao").mtFont(.caption) } }
                                    HStack(spacing: 5) { Image(systemName: "calendar").mtFont(.caption); VStack(alignment: .leading, spacing: 0) { Text("\(m.suffix(2))/\(m.prefix(4))").mtFont(.body); Text("tháng giao").mtFont(.caption) } }
                                }.foregroundStyle(Color.inkSoft).padding(.top, 6)
                                HStack {
                                    HStack(spacing: -6) { ForEach(rows.prefix(3)) { x in Avatar(name: x.sellerName, size: 24).overlay(Circle().stroke(Color.card, lineWidth: 2)) }; if rows.count > 3 { Text("+\(rows.count - 3)").mtFont(.caption).foregroundStyle(Color.inkSoft).frame(width: 24, height: 24).background(Palette.mtCardBorder, in: .circle).overlay(Circle().stroke(Color.card, lineWidth: 2)) } }
                                    Spacer()
                                    Text("mua \(Fmt.pct(r > 0 ? b / r * 100 : nil)) · \(Fmt.shortMoney(net))").mtFont(.caption).foregroundStyle(Color.good)
                                }.padding(.top, 8)
                                ForEach(rows) { row in
                                    HStack(alignment: .top, spacing: MT.cellGap) {
                                        VStack(alignment: .leading, spacing: MT.cellGap) {
                                            Text(row.sellerName).mtFont(.body)
                                            Text(row.posName).mtFont(.caption).foregroundStyle(Palette.muted)
                                            Text(Fmt.int(row.received) + " số · " + Fmt.int(row.buyers) + " đã mua").mtFont(.caption).foregroundStyle(Palette.muted)
                                        }
                                        Spacer()
                                        VStack(alignment: .trailing, spacing: MT.cellGap) {
                                            Text(Fmt.pct(row.buyRate)).mtFont(.body)
                                            Text(Fmt.shortMoney(row.net)).mtFont(.body)
                                        }
                                    }.frame(minHeight: 44).padding(MT.cellGap).tileSurface()
                                        .accessibilityElement(children: .combine)
                                }
                            }
                        }.buttonStyle(.plain)
                    }
                    if list.isEmpty { Panel { Text("Không có đợt nào trong kỳ.").mtFont(.body).foregroundStyle(Color.inkSoft) } }
                }
            } else if error == nil { SkeletonGrid(tiles: 2); Skeleton(height: 120) }
        }
        .task(id: "\(period.key)|\(posIds.joined())") { await load() }
        .pullToReload { await load() }
    }
    @MainActor private func load() async {
        do { data = try await API.batches(start: period.range.0, end: period.range.1, posIds: posIds); error = nil }
        catch { if let text = LoadError.text(error) { self.error = text } }
    }
}
