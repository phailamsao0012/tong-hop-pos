import SwiftUI

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
        .sheet(isPresented: $custom) { CustomRangeSheet(initial: period.range) { period = .custom($0, $1) } }
    }
}

struct CustomRangeSheet: View {
    let initial: (String, String); let apply: (String, String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var start = Date.now
    @State private var end = Date.now
    var body: some View {
        NavigationStack {
            Form {
                Section("Khoảng thời gian") {
                    DatePicker("Từ ngày", selection: $start, in: ...Date.now, displayedComponents: .date)
                    DatePicker("Đến ngày", selection: $end, in: ...Date.now, displayedComponents: .date)
                }
                Section {
                    HStack { ForEach([("Tuần này", 0), ("Tuần trước", 1)], id: \.0) { l, w in Button(l) { let (a, b) = VNDate.week(offset: -w); start = VNDate.date(a) ?? .now; end = VNDate.date(b) ?? .now } } }.buttonStyle(.bordered).font(.caption)
                }
            }
            .navigationTitle("Khoảng tuỳ chọn").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Áp dụng") { apply(VNDate.string(min(start, end)), VNDate.string(max(start, end))); dismiss() } }
            }
            .onAppear { start = VNDate.date(initial.0) ?? .now; end = VNDate.date(initial.1) ?? .now }
        }.presentationDetents([.medium])
    }
}
extension VNDate {
    static func date(_ s: String) -> Date? { let f = DateFormatter(); f.timeZone = tz; f.dateFormat = "yyyy-MM-dd"; return f.date(from: s) }
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
        let f = DateFormatter(); f.timeZone = tz; f.dateFormat = "yyyy-MM"
        guard let d = f.date(from: String(ym.prefix(7))), let next = cal.date(byAdding: .month, value: 1, to: d) else { return ym + "-28" }
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
        if embedded { VStack(alignment: .leading, spacing: 14) { content } }
        else { ScrollView { VStack(alignment: .leading, spacing: 14) { content }.padding(16) }.navigationTitle(title).navigationBarTitleDisplayMode(.inline).brandNav() }
    }
}

// MARK: Cuộc gọi CSKH (ảnh 2.1)

struct CallsView: View {
    var team = "cskh"; var embedded = false
    @State private var period: Period = .today
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
            PageTitle(title: isCskh ? "Cuộc gọi CSKH" : "Cuộc gọi Sale", subtitle: "Kết nối nhiều hơn. Khách hàng hài lòng hơn.", icon: "phone.fill", trailing: AnyView(
                PeriodMenu(period: $period, options: [Period.today, .week, .month, .last])))
            if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
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
                            Image(systemName: "phone.fill").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.good).frame(width: 32, height: 32).background(Color.brandSoft, in: .rect(cornerRadius: 9))
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Tổng cuộc gọi \(period == .today ? "hôm nay" : period.rawValue.lowercased())").font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1)
                                Text(Fmt.int(notes)).font(.system(size: 24, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).rolling(Fmt.int(notes))
                                if let dl = Fmt.delta(notes, pn) { HStack(spacing: 3) { Image(systemName: dl.hasPrefix("-") ? "arrowtriangle.down.fill" : "arrowtriangle.up.fill").font(.system(size: 7)); Text(dl).font(.system(size: 10, weight: .bold)) }.foregroundStyle(dl.hasPrefix("-") ? Color.bad : Color.good) }
                                Text(period == .today ? "So với hôm qua" : "So với kỳ trước").font(.system(size: 9)).foregroundStyle(Color.inkSoft)
                            }
                        }
                    }
                    Panel(padding: 12) {
                        HStack(spacing: 10) {
                            Ring(value: assigned > 0 ? cust / assigned : 0, size: 56, line: 6)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Hoàn thành liên hệ").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                                Text("\(Fmt.int(cust))/\(Fmt.int(assigned)) khách").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink)
                                Text("đang cầm").font(.system(size: 9)).foregroundStyle(Color.inkSoft)
                            }
                        }
                    }
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    KpiCard(icon: "ic_m_calls", tint: .good, label: "Cuộc gọi (ghi chú)", value: Fmt.int(notes), note: "\(rows.filter { $0.notes > 0 }.count) nhân viên · \(Int(days)) ngày")
                    KpiCard(icon: "ic_m_customers", tint: .good, label: "Số khách đã gọi", value: Fmt.int(cust), note: "TB \(Fmt.int(cust / people / days)) khách/người/ngày")
                    KpiCard(icon: "ic_m_calls", tint: .blue, label: "Cuộc gọi / người / ngày", value: Fmt.int(notes / people / days), note: "Trung bình toàn nhóm")
                    NavigationLink(value: Route.orders(OrderQuery(start: period.range.0, end: period.range.1, group: "closed", basis: "confirmed", title: "Đơn chốt \(isCskh ? "CSKH" : "Sale")"))) { KpiCard(icon: "ic_m_closed", tint: .bad, label: "Đơn chốt (theo người bán)", value: Fmt.int(orders), note: "\(Fmt.short(net)) ₫ · AOV \(Fmt.short(orders > 0 ? net / orders : 0)) ₫") }.buttonStyle(.plain)
                    if let cv = d.coverage { KpiCard(icon: "cylinder.split.1x2.fill", tint: .gray, label: "Dữ liệu ghi chú đã gom", value: Fmt.int(cv.notes), note: "\(Fmt.int(cv.customers)) khách · cập nhật \(cv.lastFetch.map { Fmt.dateTime($0) } ?? "—")") }
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
                        HStack { Text("Theo ngày").font(.system(size: 15, weight: .bold)); Spacer(); Hint(text: countBy == "customers" ? "Số khách đã gọi" : "Số cuộc gọi") }
                        let pts: [(String, Double)] = days.map { day in (String(Fmt.day(day).prefix(5)), rows.reduce(0.0) { $0 + (countBy == "customers" ? ($1.byDay?[day]?.customers ?? 0) : ($1.byDay?[day]?.notes ?? 0)) }) }
                        BarChart(points: pts)
                    }
                }
                if filter == "all" {
                    HStack { Text("Theo nhân viên · \(rows.count) người").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink); Spacer(); ExportButton(filename: "cuoc-goi-\(isCskh ? "cskh" : "sale")-\(period.range.0)-\(period.range.1)", headers: ["Nhân viên", "Bộ phận", "Cuộc gọi", "Khách đã gọi", "Đơn chốt", "Doanh thu", "Data đang cầm", "Ngày hoạt động"]) { rows.map { [$0.name, $0.department ?? "", Fmt.int($0.notes), Fmt.int($0.customers), Fmt.int($0.orders), Fmt.int($0.net), Fmt.int($0.assigned), Fmt.int($0.activeDays)] } } }
                    VStack(spacing: 0) {
                        let list = rows.sorted { countBy == "customers" ? $0.customers > $1.customers : $0.notes > $1.notes }
                        ForEach(Array(list.enumerated()), id: \.element.id) { i, s in
                            NavigationLink(value: Route.orders(OrderQuery(start: period.range.0, end: period.range.1, group: "closed", sellerId: s.authorId, basis: "confirmed", title: s.name))) {
                                HStack(spacing: 10) {
                                    Avatar(name: s.name, size: 38)
                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack { Text(s.name).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1); Spacer(); Text("\(Fmt.int(s.notes)) cuộc gọi").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink) }
                                        HStack(spacing: 6) { Image(systemName: "phone").font(.system(size: 9)); Text("\(Fmt.int(s.customers)) khách · cầm \(Fmt.int(s.assigned)) data").font(.system(size: 10)) ; Tag(text: s.orders > 0 ? "\(Fmt.int(s.orders)) đơn chốt" : "Chưa chốt", tone: s.orders > 0 ? .green : .red) }.foregroundStyle(Color.inkSoft)
                                        Text("Doanh thu \(Fmt.money(s.net)) · hoạt động \(Fmt.int(s.activeDays)) ngày").font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1)
                                    }
                                    IconButton(icon: "chevron.right", tint: .good)
                                }.padding(12).contentShape(.rect)
                            }.buttonStyle(.plain)
                            if i < list.count - 1 { Divider().padding(.leading, 60) }
                        }
                        if list.isEmpty { Text("Chưa có cuộc gọi trong kỳ.").font(.system(size: 12)).foregroundStyle(Color.inkSoft).padding(12) }
                    }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                } else if let c = care {
                    SectionHead(title: filter == "todo" ? "Khách chưa liên hệ" : "Khách vừa liên hệ", action: "\(Fmt.int(c.total)) khách")
                    CustomerCallList(rows: c.rows, done: filter == "done")
                }
                Text("Cuộc gọi = một ghi chú nhân viên viết trên hồ sơ khách ở Pancake. Đơn chốt tính theo người bán trên đơn, ngày xác nhận lần đầu.").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
            } else if error == nil { SkeletonGrid(tiles: 2); Skeleton(height: 200) }
        }
        .task(id: "\(period.key)|\(filter)|\(staffPick)") { await load() }
    }
    @MainActor private func load() async {
        do {
            data = try await API.calls(start: period.range.0, end: period.range.1, team: team)
            prev = try? await API.calls(start: period.previous.0, end: period.previous.1, team: team); error = nil
            if filter != "all", isCskh { care = try? await API.care(assigned: staffPick, sort: filter == "todo" ? "note_old" : "note_new", minDays: 0, q: "", page: 1) }
        } catch { self.error = error.localizedDescription }
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
                        Avatar(name: r.name ?? "K", size: 40, tint: done ? .brand : .blue)
                        VStack(alignment: .leading, spacing: 4) {
                            HStack { Text(r.name ?? r.phone ?? "Khách").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1); Spacer(); Text(r.lastNoteAt.map { Fmt.time($0) } ?? "").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                            HStack(spacing: 8) { HStack(spacing: 4) { Image(systemName: "phone").font(.system(size: 9)); Text(r.phone ?? "") }.font(.system(size: 10)).foregroundStyle(Color.inkSoft); Tag(text: r.lastNoteAt == nil ? "Chưa liên hệ" : "Đã liên hệ", tone: r.lastNoteAt == nil ? .red : .green) }
                            if let n = r.notes.first?.message, !n.isEmpty { Text(n).font(.system(size: 11)).foregroundStyle(Color.inkSoft).lineLimit(2) }
                            else { HStack(spacing: 4) { PosLabel(id: r.posId, name: r.posName); if let a = r.assignedName { Text("· \(a)").lineLimit(1) } }.font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                        }
                        if let p = r.phone, let u = URL(string: "tel:\(p)") { IconButton(icon: "phone.fill", tint: .good, url: u) }
                    }.padding(12).background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                }.buttonStyle(.plain)
            }
        }
    }
}

// MARK: Khách theo nhân viên (ảnh 2.2)

struct CareView: View {
    var embedded = false
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
            if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
            if let d = data {
                let cur = d.staff.first { $0.id == assigned }
                Menu {
                    Button("Tất cả nhân viên CSKH") { assigned = "" }
                    ForEach(d.staff) { s in Button("\(s.name) · \(Fmt.int(s.assigned))") { assigned = s.id } }
                } label: {
                    Panel(padding: 12) {
                        HStack(spacing: 10) {
                            Avatar(name: cur?.name ?? "Tất cả", size: 40)
                            VStack(alignment: .leading, spacing: 2) { Text(cur?.name ?? "Tất cả nhân viên CSKH").font(.system(size: 14, weight: .bold)).foregroundStyle(Color.ink); Text(cur?.department ?? "Đội CSKH · \(d.staff.count) người").font(.system(size: 11)).foregroundStyle(Color.inkSoft) }
                            Spacer(); Image(systemName: "chevron.down").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.inkSoft)
                        }
                    }
                }.buttonStyle(.plain)
                let total = cur.map { $0.assigned } ?? d.summary.total
                Panel(padding: 12) {
                    HStack(spacing: 10) {
                        Image(systemName: "person.2.fill").font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.good).frame(width: 36, height: 36).background(Color.brandSoft, in: .rect(cornerRadius: 10))
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Khách được phân công").font(.system(size: 11)).foregroundStyle(Color.inkSoft)
                            HStack(alignment: .firstTextBaseline, spacing: 6) { Text(Fmt.int(total)).font(.system(size: 24, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).rolling(Fmt.int(total)); Text("đã mua \(Fmt.int(cur == nil ? d.summary.buyers : 0)) · \(Fmt.short(d.summary.closedNet)) ₫").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                        }
                        Spacer()
                        NavigationLink(value: Route.calls(team: "cskh")) { HStack(spacing: 3) { Text("Xem chi tiết"); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }.font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink).padding(.horizontal, 10).padding(.vertical, 7).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.black.opacity(0.12))) }.buttonStyle(.plain)
                    }
                }
                Text("Phân loại theo mức độ ưu tiên").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink)
                let over20 = cur?.over20 ?? d.summary.over20, over7 = cur?.over7 ?? d.staff.reduce(0) { $0 + $1.over7 }, never = cur?.neverNoted ?? d.summary.neverNoted, today = cur?.notedToday ?? d.staff.reduce(0) { $0 + $1.notedToday }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                    PrioTile(label: "Cần chăm sóc", n: over20, tint: .bad, on: prio == "20") { prio = prio == "20" ? "" : "20"; minDays = prio.isEmpty ? 0 : 20; sort = "note_old" }
                    PrioTile(label: "Có nguy cơ rời", n: over7, tint: .warn, on: prio == "7") { prio = prio == "7" ? "" : "7"; minDays = prio.isEmpty ? 0 : 7; sort = "note_old" }
                    PrioTile(label: "Chưa ghi chú", n: never, tint: .blue, on: prio == "never") { prio = prio == "never" ? "" : "never"; minDays = 0; sort = prio.isEmpty ? "note_old" : "note_old" }
                    PrioTile(label: "Vừa chăm sóc", n: today, tint: .good, on: prio == "today") { prio = prio == "today" ? "" : "today"; minDays = 0; sort = prio.isEmpty ? "note_old" : "note_new" }
                }
                HStack(spacing: 8) {
                    HStack(spacing: 8) { Image(systemName: "magnifyingglass").foregroundStyle(Color.inkSoft); TextField("Tìm khách hàng (tên, SĐT, ghi chú…)", text: $q).font(.system(size: 13)).onSubmit { Task { await load() } } }
                        .padding(.horizontal, 12).padding(.vertical, 10).background(Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.08)))
                    Menu { Button("Lâu chưa ghi chú") { sort = "note_old" }; Button("Ghi chú mới nhất") { sort = "note_new" }; Button("Mua nhiều tiền") { sort = "purchased" }; Button("Đặt gần đây") { sort = "last_order" }; Button("Tên A–Z") { sort = "name" } } label: { Image(systemName: "line.3.horizontal.decrease").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.ink).frame(width: 40, height: 40).background(Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.08))) }
                }
                SectionHead(title: "Danh sách khách hàng", action: sort == "note_new" ? "Ghi chú mới nhất" : sort == "note_old" ? "Lâu chưa ghi chú" : sort == "purchased" ? "Mua nhiều tiền" : "Sắp xếp", count: nil)
                VStack(spacing: 10) {
                    ForEach(d.rows) { r in
                        NavigationLink(value: Route.customer(posId: r.posId, phone: r.phone ?? "")) {
                            HStack(alignment: .top, spacing: 10) {
                                Avatar(name: r.name ?? "K", size: 40, tint: tint(r))
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack(spacing: 6) { Text(r.name ?? r.phone ?? "Khách").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1); Tag(text: label(r), tone: tone(r)); Spacer() }
                                    HStack(spacing: 4) { Image(systemName: "phone").font(.system(size: 9)); Text("\(r.phone ?? "") ·"); PosLabel(id: r.posId, name: r.posName) }.font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1)
                                    if let n = r.notes.first?.message, !n.isEmpty { Text(n).font(.system(size: 11)).foregroundStyle(Color.inkSoft).lineLimit(2) }
                                    else { Text("\(Fmt.int(r.succeedOrders)) đơn TC · \(Fmt.short(r.purchased)) ₫\(r.assignedName.map { " · \($0)" } ?? "")").font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1) }
                                }
                                VStack(alignment: .trailing, spacing: 2) {
                                    if let dn = r.daysSinceNote { Text("\(Fmt.int(dn)) ngày").font(.system(size: 12, weight: .bold)).foregroundStyle(dn > 20 ? Color.bad : dn > 7 ? Color.warn : Color.good); Text("chưa liên hệ").font(.system(size: 9)).foregroundStyle(Color.inkSoft) }
                                    else { Text("chưa note").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.warn) }
                                    Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.inkSoft).padding(.top, 2)
                                }
                            }.padding(12).background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                        }.buttonStyle(.plain)
                    }
                    if d.rows.isEmpty { Panel { Text("Không có khách khớp bộ lọc.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) } }
                }
            } else if error == nil { Skeleton(height: 70); Skeleton(height: 80); SkeletonGrid(tiles: 4) }
        }
        .task(id: "\(assigned)|\(sort)|\(minDays)|\(prio)") { await load() }
    }
    private func label(_ r: API.CareRow) -> String { guard let d = r.daysSinceNote else { return "Cần chăm sóc" }; return d > 20 ? "Cần chăm sóc" : d > 7 ? "Có nguy cơ rời" : r.succeedOrders > 0 ? "Ổn định" : "Tiềm năng" }
    private func tone(_ r: API.CareRow) -> Tone { guard let d = r.daysSinceNote else { return .red }; return d > 20 ? .red : d > 7 ? .orange : r.succeedOrders > 0 ? .green : .blue }
    private func tint(_ r: API.CareRow) -> Color { tone(r).color }
    @MainActor private func load() async {
        do {
            var d = try await API.care(assigned: assigned, sort: sort, minDays: minDays, q: q, page: 1)
            if prio == "never" { d = API.Care(total: Double(d.rows.filter { $0.lastNoteAt == nil }.count), summary: d.summary, staff: d.staff, rows: d.rows.filter { $0.lastNoteAt == nil }) }
            if prio == "today" { d = API.Care(total: Double(d.rows.filter { ($0.daysSinceNote ?? 99) < 1 }.count), summary: d.summary, staff: d.staff, rows: d.rows.filter { ($0.daysSinceNote ?? 99) < 1 }) }
            data = d; error = nil
        } catch { self.error = error.localizedDescription }
    }
}

struct PrioTile: View {
    let label: String; let n: Double; let tint: Color; let on: Bool; let tap: () -> Void
    var body: some View {
        Button(action: tap) {
            VStack(spacing: 3) { Text(label).font(.system(size: 9, weight: .semibold)).foregroundStyle(tint).lineLimit(1).minimumScaleFactor(0.7); Text(Fmt.int(n)).font(.system(size: 18, weight: .bold, design: .rounded)).foregroundStyle(tint).rolling(Fmt.int(n)) }
                .frame(maxWidth: .infinity).padding(.vertical, 10).background(tint.opacity(on ? 0.25 : 0.11), in: .rect(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(on ? tint : .clear, lineWidth: 1.5))
        }.buttonStyle(.plain)
    }
}

// MARK: Mua lại & Upsell (ảnh 2.3)

struct RepurchaseView: View {
    var embedded = false
    @State private var period: Period = .d30
    @State private var data: API.Repurchase?
    @State private var prev: API.Repurchase?
    @State private var error: String?
    @State private var sellerId = ""
    var body: some View {
        Embed(embedded: embedded, title: "Mua lại & Upsell") {
            PageTitle(title: "Mua lại & Upsell", subtitle: "Khai thác giá trị thật. Đồng hành lâu dài.", icon: "chart.bar.fill")
            Segmented(selection: $period, options: [(.d30, "30 ngày"), (.d60, "60 ngày"), (.d90, "90 ngày")])
            if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
            if let d = data {
                HStack(spacing: 10) {
                    KpiCard(icon: "ic_m_upsell", tint: .good, label: "Khách mua lại", value: Fmt.int(d.summary.repurchase.customers), delta: Fmt.delta(d.summary.repurchase.customers, prev?.summary.repurchase.customers), note: "So với kỳ trước")
                    KpiCard(icon: "ic_m_revenue", tint: .teal, label: "Doanh thu từ khách cũ", value: Fmt.vnd(d.summary.repurchase.net), delta: Fmt.delta(d.summary.repurchase.net, prev?.summary.repurchase.net))
                }
                Panel {
                    HStack { Text("Phễu cơ hội mua lại").font(.system(size: 15, weight: .bold)); Spacer(); Hint(text: "Trọn đời") }
                    let f = d.funnel
                    FunnelLine(label: "Tổng khách đã mua", n: f.once, of: f.once, tint: .good)
                    FunnelLine(label: "Mua từ 2 lần", n: f.twice, of: f.once, tint: .good)
                    FunnelLine(label: "Mua từ 3 lần", n: f.thrice, of: f.once, tint: .good)
                    FunnelLine(label: "Mua lại trong kỳ", n: d.summary.repurchase.customers, of: f.once, tint: .brand)
                }
                if !d.byTag.isEmpty {
                    HStack { Text("Sản phẩm mua lại nhiều").font(.system(size: 15, weight: .bold)); Spacer(); Hint(text: "Theo thẻ trên đơn") }
                    HStack(spacing: 10) {
                        ForEach(d.byTag.sorted { $0.resaleOrders > $1.resaleOrders }.prefix(2), id: \.tag) { t in
                            Panel(padding: 12) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Image(systemName: "leaf.fill").font(.system(size: 14)).foregroundStyle(Color.good).frame(width: 30, height: 30).background(Color.brandSoft, in: .rect(cornerRadius: 8))
                                    Text(t.tag).font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink).lineLimit(1)
                                    Text("\(Fmt.int(t.resaleOrders)) đơn mua lại / \(Fmt.int(t.orders))").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                                    Tag(text: "Tỷ lệ mua lại \(Fmt.pct(t.resaleRate))", tone: .green)
                                }
                            }
                        }
                    }
                }
                HStack { Text("Theo nhân viên").font(.system(size: 15, weight: .bold)); Spacer(); if !sellerId.isEmpty { Button("Bỏ lọc") { sellerId = "" }.font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.brand) } }
                VStack(spacing: 0) {
                    let list = Array(d.byEmployee.prefix(8))
                    ForEach(Array(list.enumerated()), id: \.element.id) { i, e in
                        Button { sellerId = sellerId == e.sellerId ? "" : e.sellerId } label: {
                            HStack(spacing: 10) {
                                Medal(rank: i + 1); Avatar(name: e.name, size: 32)
                                Text(e.name).font(.system(size: 13, weight: sellerId == e.sellerId ? .bold : .medium)).foregroundStyle(sellerId == e.sellerId ? Color.brand : Color.ink).lineLimit(1)
                                Spacer(); Text("\(Fmt.int(e.repurchase.orders)) đơn · \(Fmt.short(e.repurchase.net)) ₫").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.inkSoft).monospacedDigit()
                            }.padding(10).contentShape(.rect)
                        }.buttonStyle(.plain)
                        if i < list.count - 1 { Divider().padding(.leading, 40) }
                    }
                }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                HStack { Text("Khách vừa mua lại").font(.system(size: 15, weight: .bold)); Spacer(); Hint(text: "\(d.recent.count) đơn") }
                VStack(spacing: 10) {
                    ForEach(Array(d.recent.prefix(15).enumerated()), id: \.offset) { _, r in
                        Panel(padding: 12) {
                            HStack(spacing: 10) {
                                Avatar(name: r.phone, size: 38, tint: .blue)
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack { Text(r.phone).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink); Spacer(); Text(Fmt.vnd(r.net)).font(.system(size: 12, weight: .bold)).foregroundStyle(Color.good) }
                                    HStack(spacing: 4) { PosLabel(id: r.posId, name: r.posName); Text("· \(r.sellerName)").lineLimit(1) }.font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                                    Text("Upsell lần \(r.level) · đơn thứ \(Int(r.prior) + 1) · \(Fmt.day(r.createdAt))\(r.tags.isEmpty ? "" : " · " + r.tags.prefix(2).joined(separator: ", "))").font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1)
                                }
                            }
                            HStack(spacing: 8) {
                                if let u = URL(string: "tel:\(r.phone)") { Link(destination: u) { ActionPill(icon: "phone.fill", text: "Gọi ngay", tint: .good) } }
                                if let u = URL(string: "sms:\(r.phone)") { Link(destination: u) { ActionPill(icon: "message.fill", text: "Nhắn tin", tint: .brand) } }
                                NavigationLink(value: Route.customer(posId: r.posId, phone: r.phone)) { ActionPill(icon: "person.text.rectangle", text: "Hồ sơ", tint: .purple) }.buttonStyle(.plain)
                            }.padding(.top, 8)
                        }
                    }
                }
            } else if error == nil { SkeletonGrid(tiles: 2); Skeleton(height: 150) }
        }
        .task(id: "\(period.key)|\(sellerId)") { await load() }
    }
    @MainActor private func load() async {
        do {
            data = try await API.repurchase(start: period.range.0, end: period.range.1, sellerId: sellerId)
            prev = try? await API.repurchase(start: period.previous.0, end: period.previous.1, sellerId: sellerId); error = nil
        } catch { self.error = error.localizedDescription }
    }
}

struct ActionPill: View {
    let icon: String; let text: String; let tint: Color
    var body: some View {
        HStack(spacing: 5) { Image(systemName: icon).font(.system(size: 10, weight: .semibold)); Text(text).font(.system(size: 11, weight: .semibold)) }
            .foregroundStyle(tint).frame(maxWidth: .infinity).padding(.vertical, 8).overlay(RoundedRectangle(cornerRadius: 9).stroke(tint.opacity(0.5)))
    }
}

// MARK: Khách lâu chưa mua (ảnh 3.1)

struct DormantView: View {
    var embedded = false
    @State private var days = 30
    @State private var q = ""
    @State private var data: API.CustomerPage?
    @State private var rows: [API.CustomerRow] = []
    @State private var error: String?
    private var segment: String { days == 30 ? "potential" : days == 60 ? "risk" : "dormant" }
    var body: some View {
        Embed(embedded: embedded, title: "Khách lâu chưa mua") {
            PageTitle(title: "Khách lâu chưa mua", subtitle: "Gọi lại đúng lúc, giữ khách ở lại.", icon: "moon.zzz.fill", trailing: AnyView(Menu { Button("Lâu chưa mua nhất") { }; Button("Mua nhiều tiền") { } } label: { Image(systemName: "line.3.horizontal.decrease").font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.ink) }))
            Segmented(selection: $days, options: [(30, "30 ngày"), (60, "60 ngày"), (90, "90 ngày")])
            if let error, rows.isEmpty { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
            if let d = data {
                HStack(spacing: 12) {
                    Image(systemName: "bell.fill").font(.system(size: 18, weight: .bold)).foregroundStyle(.white).frame(width: 44, height: 44).background(Color.bad, in: .circle)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(days == 30 ? "Mua 1 lần, 31–90 ngày chưa quay lại" : days == 60 ? "Từng mua ≥2 lần, quá 60 ngày chưa mua" : "Ngủ đông: quá 90 ngày chưa mua").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                        HStack(alignment: .firstTextBaseline, spacing: 4) { Text(Fmt.int(d.total)).font(.system(size: 22, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).rolling(Fmt.int(d.total)); Text("khách hàng").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink) }
                        Text("cần liên hệ lại").font(.system(size: 11)).foregroundStyle(Color.inkSoft)
                    }
                    Spacer(); Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.bad)
                }.padding(12).background(Color.bad.opacity(0.08), in: .rect(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.bad.opacity(0.2)))
                HStack(spacing: 8) { Image(systemName: "magnifyingglass").foregroundStyle(Color.inkSoft); TextField("Tìm theo tên hoặc SĐT", text: $q).font(.system(size: 13)).onSubmit { Task { await load(next: false) } } }
                    .padding(.horizontal, 12).padding(.vertical, 10).background(Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.08)))
                SectionHead(title: "Khách hàng ưu tiên liên hệ (\(days) ngày)", action: "\(Fmt.int(d.total)) khách")
                VStack(spacing: 10) {
                    ForEach(rows) { r in
                        NavigationLink(value: Route.customer(posId: r.posId, phone: r.phone)) {
                            HStack(spacing: 10) {
                                Avatar(name: r.name ?? r.phone, size: 40, tint: .blue)
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack(spacing: 6) { Text(r.name ?? r.phone).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1); Tag(text: r.successNet >= 2_000_000 ? "Ưu tiên cao" : r.successNet >= 700_000 ? "Ưu tiên trung bình" : "Ưu tiên thấp", tone: r.successNet >= 2_000_000 ? .red : r.successNet >= 700_000 ? .orange : .green) }
                                    Text("\(Fmt.int(r.daysSinceSuccess ?? 0)) ngày chưa mua").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.bad)
                                    HStack(spacing: 4) { Text("\(r.phone) ·"); PosLabel(id: r.posId, name: r.posName); if let s = r.sellerName { Text("· \(s)").lineLimit(1) } }.font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                                }
                                Spacer()
                                if let u = URL(string: "tel:\(r.phone)") { IconButton(icon: "phone.fill", tint: .good, url: u) }
                            }.padding(12).background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                        }.buttonStyle(.plain)
                    }
                    if d.hasMore { Button { Task { await load(next: true) } } label: { Text("Xem thêm").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand).frame(maxWidth: .infinity).padding(10) } }
                }
            } else if error == nil { Skeleton(height: 80); Skeleton(height: 200) }
        }
        .task(id: days) { await load(next: false) }
    }
    @MainActor private func load(next: Bool) async {
        do {
            let p = try await API.customers(segment: segment, sort: "dormant", q: q, page: next ? (data?.page ?? 0) + 1 : 1)
            rows = next ? rows + p.customers : p.customers; data = p; error = nil
        } catch { self.error = error.localizedDescription }
    }
}

// MARK: KPI CSKH (ảnh 3.2)

struct KpiView: View {
    var embedded = false
    @Environment(AuthModel.self) private var auth
    @State private var mode = "person"
    @State private var month = String(VNDate.string(.now).prefix(7))
    @State private var targets: API.Targets?
    @State private var actual: API.Overview?
    @State private var care: API.Care?
    @State private var staff: [API.Employee] = []
    @State private var pick = ""
    @State private var history: [(String, Double)] = []
    @State private var editing: API.Employee?
    private var isOwner: Bool { auth.me?.role == "owner" }
    var body: some View {
        Embed(embedded: embedded, title: "KPI CSKH") {
            PageTitle(title: "KPI CSKH", subtitle: "Mục tiêu rõ, tiến độ rõ.", icon: "target", trailing: AnyView(Menu { Button("Tháng này") { month = String(VNDate.string(.now).prefix(7)) }; Button("Tháng trước") { month = VNDate.shiftMonth(String(VNDate.string(.now).prefix(7)), -1) } } label: { DatePill(text: "Tháng \(Int(month.suffix(2)) ?? 0)/\(month.prefix(4))") }))
            Segmented(selection: $mode, options: [("person", "Cá nhân"), ("team", "Đội nhóm")])
            let list = staff.filter { $0.active != false }
            let cur = list.first { $0.id == pick }
            if mode == "person" {
                Menu { ForEach(list) { e in Button(e.name) { pick = e.id } } } label: {
                    Panel(padding: 12) {
                        HStack(spacing: 10) {
                            Avatar(name: cur?.name ?? "?", size: 40)
                            VStack(alignment: .leading, spacing: 2) { Text(cur?.name ?? "Chọn nhân viên").font(.system(size: 14, weight: .bold)).foregroundStyle(Color.ink); Text(cur?.department ?? "Nhân viên CSKH").font(.system(size: 11)).foregroundStyle(Color.inkSoft) }
                            Spacer(); Text("Đổi nhân viên").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink).padding(.horizontal, 10).padding(.vertical, 7).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.black.opacity(0.12)))
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
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    KpiRing(label: "Khách cần chăm sóc", value: Fmt.int(assigned), sub: "đang được phân công", ring: nil, icon: "person.2.fill")
                    KpiRing(label: "Đã chăm sóc", value: Fmt.int(noted), sub: Fmt.pct0(assigned > 0 ? noted / assigned * 100 : nil) + " đã ghi chú", ring: assigned > 0 ? noted / assigned : 0, icon: nil)
                    KpiRing(label: "Đơn chốt", value: Fmt.int(actOrders), sub: goalOrders > 0 ? Fmt.pct0(actOrders / goalOrders * 100) + " đạt mục tiêu" : "chưa đặt mục tiêu", ring: goalOrders > 0 ? actOrders / goalOrders : 0, icon: nil)
                    KpiRing(label: "Doanh thu từ KH CSKH", value: Fmt.short(actRev), sub: goalRev > 0 ? Fmt.pct0(actRev / goalRev * 100) + " đạt mục tiêu" : "chưa đặt mục tiêu", ring: goalRev > 0 ? actRev / goalRev : 0, icon: nil)
                }
                Panel {
                    HStack { Text("Mục tiêu tháng").font(.system(size: 14, weight: .bold)); Hint(text: mode == "person" ? "Cá nhân" : "Cả đội"); Spacer(); if isOwner && mode == "person", let cur { Button { editing = cur } label: { HStack(spacing: 4) { Image(systemName: "pencil"); Text("Sửa") }.font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink).padding(.horizontal, 10).padding(.vertical, 6).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.black.opacity(0.12))) } } }
                    GoalRow(label: "Số khách cần chăm sóc", value: Fmt.int(assigned))
                    GoalRow(label: "Số đơn chốt", value: goalOrders > 0 ? Fmt.int(goalOrders) : "—")
                    GoalRow(label: "Doanh thu (triệu đồng)", value: goalRev > 0 ? Fmt.int(goalRev / 1e6) : "—")
                }
                Panel {
                    HStack { Text("Hiệu suất 6 tháng gần đây").font(.system(size: 14, weight: .bold)); Spacer(); Hint(text: "Doanh thu đơn chốt") }
                    if history.isEmpty { Skeleton(height: 120) } else { LineChart(points: history, tint: .good, height: 120) }
                }
                if mode == "team" {
                    Text("Theo nhân viên").font(.system(size: 14, weight: .bold))
                    VStack(spacing: 0) {
                        ForEach(Array(list.enumerated()), id: \.element.id) { i, e in
                            let g = goals[e.id]?.revenue ?? 0, a = by[e.id]?.closedNet ?? 0
                            Button { if isOwner { editing = e } else { pick = e.id; mode = "person" } } label: {
                                HStack(spacing: 10) {
                                    Avatar(name: e.name, size: 34)
                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack { Text(e.name).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1); Spacer(); Text(Fmt.pct0(g > 0 ? a / g * 100 : nil)).font(.system(size: 13, weight: .bold)).foregroundStyle(g > 0 && a / g >= 1 ? Color.good : g > 0 && a / g >= 0.7 ? Color.warn : g > 0 ? Color.bad : Color.inkSoft) }
                                        Bar(value: g > 0 ? a / g : 0, tint: .good, height: 5)
                                        Text("\(Fmt.short(a)) / \(g > 0 ? Fmt.short(g) : "chưa đặt") ₫ · \(Fmt.int(by[e.id]?.closedOrders ?? 0)) đơn").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                                    }
                                }.padding(10).contentShape(.rect)
                            }.buttonStyle(.plain)
                            if i < list.count - 1 { Divider().padding(.leading, 54) }
                        }
                    }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                }
            } else { SkeletonGrid(tiles: 4) }
        }
        .sheet(item: $editing) { e in TargetEditor(employee: e, current: targets?.items.first { $0.scope == "employee" && $0.refId == e.id }, month: month) { Task { await load() } } }
        .task(id: "\(month)|\(pick)|\(mode)") { await load() }
    }
    @MainActor private func load() async {
        if staff.isEmpty { staff = (try? await API.employees(team: "cskh")) ?? []; if pick.isEmpty { pick = staff.first { $0.active != false }?.id ?? "" } }
        targets = try? await API.targets(month: month)
        actual = try? await API.overview(start: month + "-01", end: min(VNDate.monthEnd(month), VNDate.string(.now)), team: "cskh", compare: "none")
        care = try? await API.care(assigned: mode == "person" ? pick : "", sort: "note_old", minDays: 0, q: "", page: 1)
        let ids = mode == "person" ? [pick] : []
        let start = VNDate.shiftMonth(month, -5) + "-01"
        if let h = try? await API.overview(start: start, end: min(VNDate.monthEnd(month), VNDate.string(.now)), groupBy: "month", team: "cskh", compare: "none", employeeIds: ids.filter { !$0.isEmpty }) {
            var m: [String: Double] = [:]; for r in h.current.series ?? [] { m[r.bucket, default: 0] += r.closedNet }
            history = m.keys.sorted().map { ("Th\(Int($0.suffix(2)) ?? 0)", m[$0]!) }
        }
    }
}

struct KpiRing: View {
    let label: String; let value: String; let sub: String; let ring: Double?; let icon: String?
    var body: some View {
        Panel(padding: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(label).font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1)
                    Text(value).font(.system(size: 20, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).rolling(value)
                    Text(sub).font(.system(size: 9)).foregroundStyle(Color.good).lineLimit(1)
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
        HStack { Text(label).font(.system(size: 12)).foregroundStyle(Color.ink); Spacer(); Text(value).font(.system(size: 12, weight: .bold)).monospacedDigit().padding(.horizontal, 12).padding(.vertical, 6).frame(minWidth: 80).background(Color.card, in: .rect(cornerRadius: 8)).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.black.opacity(0.12))) }
    }
}

// MARK: So sánh nhân viên (như web)

struct CompareView: View {
    var team = "all"; var embedded = false
    @State private var teamPick = "sale"
    @State private var period: Period = .month
    @State private var sort = "closedNet"
    @State private var dept = ""
    @State private var pos = ""
    @State private var q = ""
    @State private var data: API.Overview?
    @State private var error: String?
    private var all: [API.EmployeeRow] { (data?.current.byEmployee ?? []).filter { !$0.sellerId.isEmpty && (dept.isEmpty || $0.department == dept) && (q.isEmpty || ($0.name ?? "").lowercased().contains(q.lowercased())) } }
    private var prevBy: [String: API.EmployeeRow] { Dictionary(uniqueKeysWithValues: (data?.compare?.byEmployee ?? []).map { ($0.sellerId, $0) }) }
    private var rows: [API.EmployeeRow] { sort == "closedOrders" ? all.sorted { $0.closedOrders > $1.closedOrders } : sort == "rate" ? all.sorted { ($0.shownRate ?? -1) > ($1.shownRate ?? -1) } : all.sorted { $0.closedNet > $1.closedNet } }
    private var depts: [String] { Array(Set((data?.current.byEmployee ?? []).compactMap(\.department))).sorted() }
    private func median(_ xs: [Double]) -> Double? { let s = xs.sorted(); guard !s.isEmpty else { return nil }; return s.count % 2 == 1 ? s[s.count / 2] : (s[s.count / 2 - 1] + s[s.count / 2]) / 2 }
    var body: some View {
        Embed(embedded: embedded, title: "So sánh nhân viên") {
            PageTitle(title: "So sánh nhân viên", subtitle: "Tỷ lệ chốt = \(MetricPrefs.shared.rateShort) · so với kỳ liền trước", trailing: AnyView(PeriodMenu(period: $period, options: [Period.today, .week, .month, .last])))
            if team == "all" { Segmented(selection: $teamPick, options: [("sale", "Sale"), ("cskh", "CSKH"), ("all", "Tất cả")]) }
            PosChipRow(selection: $pos, label: nil, allLabel: "Tất cả POS")
            HStack(spacing: 8) {
                Menu { Button("Tất cả bộ phận") { dept = "" }; ForEach(depts, id: \.self) { d in Button(d) { dept = d } } } label: { SelectBox(text: dept.isEmpty ? "Tất cả bộ phận" : dept, icon: "person.2") }
                HStack(spacing: 6) { Image(systemName: "magnifyingglass").font(.system(size: 11)).foregroundStyle(Color.inkSoft); TextField("Tìm tên nhân viên", text: $q).font(.system(size: 12)) }.padding(.horizontal, 10).padding(.vertical, 9).background(Color.card, in: .rect(cornerRadius: 9)).overlay(RoundedRectangle(cornerRadius: 9).stroke(Color.black.opacity(0.1)))
            }
            if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
            if data != nil {
                let list = rows
                let assigned = list.reduce(0) { $0 + $1.assignedOrders }, closed = list.reduce(0) { $0 + $1.closedOrders }, den = list.reduce(0) { $0 + $1.rateDen }
                let pAssigned = list.reduce(0.0) { $0 + (prevBy[$1.sellerId]?.assignedOrders ?? 0) }, pClosed = list.reduce(0.0) { $0 + (prevBy[$1.sellerId]?.closedOrders ?? 0) }
                let qualified = list.filter { $0.assignedOrders >= 10 }
                let med = median(qualified.compactMap(\.shownRate))
                let pMed = median(qualified.compactMap { prevBy[$0.sellerId]?.shownRate })
                let best = qualified.max { ($0.shownRate ?? -1) < ($1.shownRate ?? -1) }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    KpiCard(icon: "ic_m_staff", tint: .good, label: "Tổng nhân sự", value: Fmt.int(Double(list.count)), note: "Có đơn chia hoặc đơn chốt trong kỳ")
                    KpiCard(icon: "ic_m_orders", tint: .blue, label: "Tổng đơn chia", value: Fmt.int(assigned), delta: Fmt.delta(assigned, pAssigned), note: "Trung bình \(Fmt.int(assigned / Double(max(1, list.count)))) đơn/người")
                    NavigationLink(value: Route.orders(OrderQuery(start: period.range.0, end: period.range.1, posIds: pos.isEmpty ? [] : [pos], group: "closed", basis: "confirmed", title: "Đơn chốt"))) { KpiCard(icon: "ic_m_closed", tint: .good, label: "Tổng đơn chốt", value: Fmt.int(closed), delta: Fmt.delta(closed, pClosed), note: "Tỷ lệ chốt chung \(Fmt.pct(den > 0 ? closed / den * 100 : nil))") }.buttonStyle(.plain)
                    KpiCard(icon: "ic_m_rate", tint: .purple, label: "Trung vị tỷ lệ chốt", value: Fmt.pct(med), delta: (med != nil && pMed != nil) ? String(format: "%+.1f điểm", med! - pMed!).replacingOccurrences(of: ".", with: ",") : nil, deltaGood: (med ?? 0) >= (pMed ?? 0), note: "Mục tiêu tham chiếu \(Fmt.pct0(MetricPrefs.shared.goodRate))")
                }
                if let b = best {
                    NavigationLink(value: Route.orders(OrderQuery(start: period.range.0, end: period.range.1, group: "closed", sellerId: b.sellerId, basis: "confirmed", title: b.name ?? "Nhân viên"))) {
                        HStack(spacing: 10) {
                            Image(systemName: "trophy.fill").font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.good).frame(width: 34, height: 34).background(Color.brandSoft, in: .rect(cornerRadius: 9))
                            VStack(alignment: .leading, spacing: 2) { Text("NHÂN VIÊN NỔI BẬT").font(.system(size: 9, weight: .bold)).tracking(0.6).foregroundStyle(Color.inkSoft); Text(Fmt.pct(b.shownRate)).font(.system(size: 19, weight: .bold, design: .rounded)).foregroundStyle(Color.ink); Text("\(b.name ?? "") · \(b.rateFrac)").font(.system(size: 11)).foregroundStyle(Color.inkSoft) }
                            Spacer(); Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft)
                        }.padding(12).background(Color.card, in: .rect(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.good.opacity(0.35))).cardShadow()
                    }.buttonStyle(.plain)
                }
                // Hiệu suất đội ngũ
                Panel {
                    HStack { Text("Hiệu suất đội ngũ").font(.system(size: 15, weight: .bold)); Spacer(); Hint(text: "Vạch xám: trung vị · vạch xanh: mục tiêu \(Fmt.pct0(MetricPrefs.shared.goodRate))") }
                    Text("Tỷ lệ chốt (%) của 15 nhân viên cao nhất").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                    ForEach(Array(all.sorted { ($0.shownRate ?? -1) > ($1.shownRate ?? -1) }.prefix(15).enumerated()), id: \.element.id) { _, e in
                        NavigationLink(value: Route.orders(OrderQuery(start: period.range.0, end: period.range.1, group: "closed", sellerId: e.sellerId, basis: "confirmed", title: e.name ?? "Nhân viên"))) {
                            HStack(spacing: 8) {
                                Text(e.name ?? "NV").font(.system(size: 11)).foregroundStyle(Color.ink).lineLimit(1).frame(width: 118, alignment: .trailing)
                                ZStack(alignment: .leading) {
                                    GeometryReader { g in
                                        Capsule().fill(Color.black.opacity(0.05))
                                        Capsule().fill(Fmt.rateTone(e.shownRate)).frame(width: g.size.width * CGFloat(min(1, (e.shownRate ?? 0) / 100)))
                                        if let m = med { Rectangle().fill(Color.inkSoft).frame(width: 1.5).offset(x: g.size.width * CGFloat(min(1, m / 100))) }
                                        Rectangle().fill(Color.good.opacity(0.6)).frame(width: 1.5).offset(x: g.size.width * CGFloat(MetricPrefs.shared.goodRate / 100))
                                    }
                                }.frame(height: 10)
                                Text(Fmt.pct(e.shownRate)).font(.system(size: 11, weight: .bold)).monospacedDigit().frame(width: 48, alignment: .trailing)
                            }.padding(.vertical, 2).contentShape(.rect)
                        }.buttonStyle(.plain)
                    }
                    HStack { Text("0%"); Spacer(); Text("25%"); Spacer(); Text("50%"); Spacer(); Text("75%"); Spacer(); Text("100%") }.font(.system(size: 8)).foregroundStyle(Color.inkSoft).padding(.leading, 126).padding(.trailing, 56)
                }
                // Scatter
                Panel {
                    HStack { Text("Đơn chia vs. tỷ lệ chốt").font(.system(size: 15, weight: .bold)); Spacer(); Hint(text: "Mỗi chấm một người · cỡ theo doanh thu") }
                    Scatter(points: all.map { (x: $0.assignedOrders, y: $0.shownRate ?? 0, w: $0.closedNet, name: $0.name ?? "") })
                    HStack { Text("Chốt tốt, cần thêm data").font(.system(size: 9)); Spacer(); Text("Hiệu suất cao").font(.system(size: 9)) }.foregroundStyle(Color.inkSoft)
                    HStack { Text("Cần hỗ trợ, ưu tiên coaching").font(.system(size: 9)); Spacer(); Text("Cân bằng data").font(.system(size: 9)) }.foregroundStyle(Color.inkSoft)
                }
                // Nổi bật / cần hỗ trợ / cân bằng data
                let top = qualified.sorted { ($0.shownRate ?? -1) > ($1.shownRate ?? -1) }.prefix(3)
                let low = qualified.sorted { ($0.shownRate ?? 999) < ($1.shownRate ?? 999) }.prefix(3)
                let medAssigned = median(all.map(\.assignedOrders)) ?? 0
                let balance = qualified.filter { ($0.shownRate ?? 0) >= (med ?? 0) && $0.assignedOrders <= medAssigned }.sorted { ($0.shownRate ?? 0) > ($1.shownRate ?? 0) }.prefix(3)
                RankBlock(title: "Nhân viên nổi bật", sub: "Tỷ lệ cao nhất, ≥ 10 đơn chia", icon: "crown.fill", tone: .good, rows: Array(top), prev: prevBy, period: period)
                RankBlock(title: "Cần hỗ trợ", sub: "Tỷ lệ thấp nhất, ≥ 10 đơn chia", icon: "person.2.fill", tone: .bad, rows: Array(low), prev: prevBy, period: period)
                RankBlock(title: "Cân bằng data", sub: "Chốt tốt nhưng ít data, nên cấp thêm số", icon: "arrow.left.arrow.right", tone: .warn, rows: Array(balance), prev: prevBy, period: period)
                // Bảng chi tiết
                HStack { Text("So sánh chi tiết nhân viên (\(list.count) người)").font(.system(size: 15, weight: .bold)); Spacer(); ExportButton(filename: "so-sanh-nhan-vien-\(period.range.0)-\(period.range.1)", headers: ["Nhân viên", "Bộ phận", "Đơn chia", "Đơn chốt", "Tỷ lệ chốt", "Doanh thu", "AOV", "Tỷ lệ kỳ trước", "Doanh thu kỳ trước"]) { list.map { [$0.name ?? "", $0.department ?? "", Fmt.int($0.assignedOrders), Fmt.int($0.closedOrders), Fmt.pct($0.shownRate), Fmt.int($0.closedNet), Fmt.int($0.averageOrder ?? 0), Fmt.pct(prevBy[$0.sellerId]?.shownRate), Fmt.int(prevBy[$0.sellerId]?.closedNet ?? 0)] } }; Menu { Button("Theo doanh thu") { sort = "closedNet" }; Button("Theo đơn chốt") { sort = "closedOrders" }; Button("Theo tỷ lệ chốt") { sort = "rate" } } label: { HStack(spacing: 3) { Text(sort == "closedNet" ? "Doanh thu" : sort == "closedOrders" ? "Đơn chốt" : "Tỷ lệ chốt"); Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold)) }.font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink) } }
                VStack(spacing: 0) {
                    ForEach(Array(list.prefix(60).enumerated()), id: \.element.id) { i, e in
                        let p = prevBy[e.sellerId]
                        NavigationLink(value: Route.orders(OrderQuery(start: period.range.0, end: period.range.1, group: "closed", sellerId: e.sellerId, basis: "confirmed", title: e.name ?? "Nhân viên"))) {
                            HStack(spacing: 10) {
                                Medal(rank: i + 1)
                                Avatar(name: e.name ?? "?", size: 34)
                                VStack(alignment: .leading, spacing: 1) { Text(e.name ?? "NV \(e.sellerId.prefix(8))").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1); Text("\(e.department ?? "—") · kỳ trước \(Fmt.pct(p?.shownRate)) · \(Fmt.short(p?.closedNet ?? 0)) ₫").font(.system(size: 9)).foregroundStyle(Color.inkSoft).lineLimit(1) }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 1) { Text(Fmt.pct(e.shownRate)).font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink); Text(e.rateFrac).font(.system(size: 9)).foregroundStyle(Color.inkSoft) }.frame(width: 62)
                                VStack(alignment: .trailing, spacing: 1) { Text(Fmt.short(e.closedNet)).font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink); Text("AOV \(Fmt.short(e.averageOrder ?? 0))").font(.system(size: 9)).foregroundStyle(Color.inkSoft) }.frame(width: 72)
                            }.padding(10).contentShape(.rect)
                        }.buttonStyle(.plain)
                        if i < min(60, list.count) - 1 { Divider().padding(.leading, 40) }
                    }
                }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                Text("Cách tính: đơn chia = đơn có người bán được gán trong kỳ; đơn chốt theo ngày xác nhận lần đầu; tỷ lệ chốt = \(MetricPrefs.shared.rateShort) (đổi ở Thêm → Cách tính). Nổi bật và cần hỗ trợ chỉ xét người có từ 10 đơn chia.").font(.system(size: 9)).foregroundStyle(Color.inkSoft)
            } else if error == nil { SkeletonGrid(tiles: 4); Skeleton(height: 220) }
        }
        .task(id: "\(period.key)|\(teamPick)|\(pos)") { await load() }
    }
    @MainActor private func load() async {
        do { data = try await API.overview(start: period.range.0, end: period.range.1, posIds: pos.isEmpty ? [] : [pos], team: team == "all" ? teamPick : team); error = nil } catch { self.error = error.localizedDescription }
    }
}

struct RankBlock: View {
    let title: String; let sub: String; let icon: String; let tone: Color; let rows: [API.EmployeeRow]; let prev: [String: API.EmployeeRow]; let period: Period
    var body: some View {
        Panel {
            HStack(spacing: 6) { Image(systemName: icon).foregroundStyle(tone); Text(title).font(.system(size: 14, weight: .bold)).foregroundStyle(Color.ink); Spacer() }
            Text(sub).font(.system(size: 10)).foregroundStyle(Color.inkSoft)
            if rows.isEmpty { Text("Chưa đủ dữ liệu.").font(.system(size: 11)).foregroundStyle(Color.inkSoft) }
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, e in
                NavigationLink(value: Route.orders(OrderQuery(start: period.range.0, end: period.range.1, group: "closed", sellerId: e.sellerId, basis: "confirmed", title: e.name ?? "Nhân viên"))) {
                    HStack(spacing: 8) {
                        Text("\(i + 1)").font(.system(size: 10, weight: .bold)).foregroundStyle(tone).frame(width: 14)
                        VStack(alignment: .leading, spacing: 1) { Text(e.name ?? "NV").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink); Text("Kỳ trước \(Fmt.pct(prev[e.sellerId]?.shownRate)) · \(Fmt.short(e.closedNet)) ₫ · \(e.department ?? "")").font(.system(size: 9)).foregroundStyle(Color.inkSoft).lineLimit(1) }
                        Spacer()
                        Text(Fmt.pct(e.shownRate)).font(.system(size: 13, weight: .bold)).foregroundStyle(tone); Text(e.rateFrac).font(.system(size: 10)).foregroundStyle(Color.inkSoft).monospacedDigit()
                    }.padding(.vertical, 4).contentShape(.rect)
                }.buttonStyle(.plain)
            }
        }
    }
}

/// Đồ thị điểm: x = đơn chia, y = tỷ lệ chốt, cỡ chấm theo doanh thu.
struct Scatter: View {
    let points: [(x: Double, y: Double, w: Double, name: String)]
    var body: some View {
        let maxX = max(1, points.map(\.x).max() ?? 1), maxW = max(1, points.map(\.w).max() ?? 1)
        GeometryReader { g in
            let w = g.size.width - 34, h = g.size.height - 18
            ZStack(alignment: .topLeading) {
                ForEach([0.0, 0.25, 0.5, 0.75, 1.0], id: \.self) { f in
                    Path { p in p.move(to: CGPoint(x: 34, y: h * (1 - f))); p.addLine(to: CGPoint(x: 34 + w, y: h * (1 - f))) }.stroke(Color.black.opacity(0.06))
                    Text(Fmt.pct0(f * 100)).font(.system(size: 8)).foregroundStyle(Color.inkSoft).position(x: 16, y: h * (1 - f))
                }
                Path { p in p.move(to: CGPoint(x: 34 + w / 2, y: 0)); p.addLine(to: CGPoint(x: 34 + w / 2, y: h)) }.stroke(Color.black.opacity(0.06))
                ForEach(Array(points.enumerated()), id: \.offset) { _, pt in
                    let r = 4 + 10 * CGFloat(pt.w / maxW)
                    Circle().fill(Color.good.opacity(0.75)).frame(width: r * 2, height: r * 2).position(x: 34 + w * CGFloat(pt.x / maxX), y: h * CGFloat(1 - min(1, pt.y / 100)))
                }
                Text("Đơn chia →").font(.system(size: 8)).foregroundStyle(Color.inkSoft).position(x: 34 + w - 30, y: h + 10)
                Text("0").font(.system(size: 8)).foregroundStyle(Color.inkSoft).position(x: 36, y: h + 10)
                Text(Fmt.int(maxX)).font(.system(size: 8)).foregroundStyle(Color.inkSoft).position(x: 34 + w - 80, y: h + 10)
            }
        }.frame(height: 180)
    }
}

// MARK: Data được cấp (ảnh 4.2)

struct BatchesView: View {
    var embedded = false
    @State private var period: Period = .d90
    @State private var filter = "all"
    @State private var data: API.Batches?
    @State private var error: String?
    private var thisMonth: String { String(VNDate.string(.now).prefix(7)) }
    var body: some View {
        Embed(embedded: embedded, title: "Data được cấp") {
            PageTitle(title: "Data được cấp", subtitle: "Mỗi đợt số được giao, kết quả rõ ràng.", trailing: AnyView(PeriodMenu(period: $period, options: [Period.month, .last, .d90])))
            if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
            if let d = data {
                let all = d.batches, recv = all.reduce(0) { $0 + $1.received }, buy = all.reduce(0) { $0 + $1.buyers }
                HStack(spacing: 10) {
                    StatCard(icon: "iphone", tint: .good, label: "Tổng số điện thoại đã nhận", value: Fmt.int(recv), sub: "\(all.count) đợt")
                    StatCard(icon: "target", tint: .good, label: "Tỷ lệ mua (toàn bộ)", value: Fmt.pct(recv > 0 ? buy / recv * 100 : nil), sub: "\(Fmt.int(buy)) SĐT đã mua")
                }
                let months = Array(Set(all.map(\.month))).sorted(by: >)
                let list = months.filter { filter == "all" || (filter == "active" ? $0 == thisMonth : $0 != thisMonth) }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        FilterChip(label: "Tất cả (\(months.count))", on: filter == "all") { filter = "all" }
                        FilterChip(label: "Đang triển khai (\(months.filter { $0 == thisMonth }.count))", on: filter == "active") { filter = "active" }
                        FilterChip(label: "Đã hoàn thành (\(months.filter { $0 != thisMonth }.count))", on: filter == "done") { filter = "done" }
                    }
                }
                SectionHead(title: "Danh sách đợt", action: "Mới nhất")
                VStack(spacing: 10) {
                    ForEach(list, id: \.self) { m in
                        let rows = all.filter { $0.month == m }
                        let r = rows.reduce(0) { $0 + $1.received }, b = rows.reduce(0) { $0 + $1.buyers }, net = rows.reduce(0) { $0 + $1.net }
                        NavigationLink(value: Route.orders(OrderQuery(start: m + "-01", end: VNDate.monthEnd(m), basis: "assigned", title: "Data tháng \(m.suffix(2))/\(m.prefix(4))"))) {
                            Panel(padding: 12) {
                                HStack { Text("#BT\(m.replacingOccurrences(of: "-", with: ""))").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink); Spacer(); Tag(text: m == thisMonth ? "Đang triển khai" : "Đã hoàn thành", tone: m == thisMonth ? .green : .blue) }
                                HStack(spacing: 14) {
                                    HStack(spacing: 5) { Image(systemName: "iphone").font(.system(size: 10)); VStack(alignment: .leading, spacing: 0) { Text(Fmt.int(r)).font(.system(size: 12, weight: .bold)); Text("điện thoại").font(.system(size: 9)) } }
                                    HStack(spacing: 5) { Image(systemName: "person.2").font(.system(size: 10)); VStack(alignment: .leading, spacing: 0) { Text("\(rows.count) nhân viên").font(.system(size: 12, weight: .bold)); Text("được giao").font(.system(size: 9)) } }
                                    HStack(spacing: 5) { Image(systemName: "calendar").font(.system(size: 10)); VStack(alignment: .leading, spacing: 0) { Text("\(m.suffix(2))/\(m.prefix(4))").font(.system(size: 12, weight: .bold)); Text("tháng giao").font(.system(size: 9)) } }
                                }.foregroundStyle(Color.inkSoft).padding(.top, 6)
                                HStack {
                                    HStack(spacing: -6) { ForEach(rows.prefix(3)) { x in Avatar(name: x.sellerName, size: 24).overlay(Circle().stroke(Color.card, lineWidth: 2)) }; if rows.count > 3 { Text("+\(rows.count - 3)").font(.system(size: 9, weight: .bold)).foregroundStyle(Color.inkSoft).frame(width: 24, height: 24).background(Color.black.opacity(0.06), in: .circle).overlay(Circle().stroke(Color.card, lineWidth: 2)) } }
                                    Spacer()
                                    Text("mua \(Fmt.pct(r > 0 ? b / r * 100 : nil)) · \(Fmt.short(net)) ₫").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.good)
                                }.padding(.top, 8)
                            }
                        }.buttonStyle(.plain)
                    }
                    if list.isEmpty { Panel { Text("Không có đợt nào trong kỳ.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) } }
                }
            } else if error == nil { SkeletonGrid(tiles: 2); Skeleton(height: 120) }
        }
        .task(id: period.key) { await load() }
    }
    @MainActor private func load() async { do { data = try await API.batches(start: period.range.0, end: period.range.1); error = nil } catch { self.error = error.localizedDescription } }
}
