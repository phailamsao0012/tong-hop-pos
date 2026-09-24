import SwiftUI

// MARK: Đơn nguồn Pancake POS

struct RawOrdersView: View {
    var body: some View {
        let today = VNDate.string(.now)
        OrderListView(query: OrderQuery(start: VNDate.string(VNDate.add(-6)), end: today, title: "Đơn nguồn Pancake"), filterable: true)
    }
}

// MARK: Báo cáo cuối tháng

struct MonthlyView: View {
    @State private var offset = 0   // 0 = tháng này, 1 = tháng trước…
    @State private var data: API.Overview?
    @State private var error: String?
    @State private var loading = false
    private var month: (String, String, String) {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = VNDate.tz
        let start = cal.date(byAdding: .month, value: -offset, to: cal.date(from: cal.dateComponents([.year, .month], from: .now))!)!
        let next = cal.date(byAdding: .month, value: 1, to: start)!
        let end = offset == 0 ? Date.now : next.addingTimeInterval(-1)
        let f = DateFormatter(); f.timeZone = VNDate.tz; f.locale = Locale(identifier: "vi_VN"); f.dateFormat = "'Tháng' M/yyyy"
        return (VNDate.string(start), VNDate.string(end), f.string(from: start))
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Button { offset += 1 } label: { Image(systemName: "chevron.left") }
                    Spacer(); Text(month.2).font(.headline).rolling(month.2); Spacer()
                    Button { offset = max(0, offset - 1) } label: { Image(systemName: "chevron.right") }.disabled(offset == 0)
                }.padding(.horizontal, 4)
                if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
                if let t = data?.current.total {
                    let p = data?.compare?.total
                    Text("So với tháng trước · đơn chốt theo giờ chốt, giao thành công theo ngày tạo").font(.caption).foregroundStyle(.secondary)
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                        NavigationLink(value: Route.orders(OrderQuery(start: month.0, end: month.1, group: "closed", basis: "confirmed", title: "Đơn chốt \(month.2)"))) { KpiTile(title: "Doanh thu đơn chốt", value: Fmt.short(t.closedNet), unit: "₫", now: t.closedNet, prev: p?.closedNet, icon: "banknote", tint: .teal) }
                        NavigationLink(value: Route.orders(OrderQuery(start: month.0, end: month.1, group: "closed", basis: "confirmed", title: "Đơn chốt \(month.2)"))) { KpiTile(title: "Đơn chốt", value: Fmt.int(t.closedOrders), unit: nil, now: t.closedOrders, prev: p?.closedOrders, icon: "checkmark.seal", tint: .green) }
                        NavigationLink(value: Route.orders(OrderQuery(start: month.0, end: month.1, group: "delivered", basis: "created", title: "Giao thành công"))) { KpiTile(title: "Giao thành công", value: Fmt.int(t.groups["delivered"]?.orders ?? 0), unit: nil, now: t.groups["delivered"]?.orders ?? 0, prev: p?.groups["delivered"]?.orders, icon: "shippingbox", tint: .mint) }
                        NavigationLink(value: Route.orders(OrderQuery(start: month.0, end: month.1, group: "returned", basis: "created", title: "Đơn hoàn"))) { KpiTile(title: "Hoàn", value: Fmt.int(t.groups["returned"]?.orders ?? 0), unit: nil, now: t.groups["returned"]?.orders ?? 0, prev: p?.groups["returned"]?.orders, icon: "arrow.uturn.backward", tint: .orange) }
                        NavigationLink(value: Route.orders(OrderQuery(start: month.0, end: month.1, group: "cancelled", basis: "created", title: "Đơn hủy"))) { KpiTile(title: "Hủy", value: Fmt.int(t.groups["cancelled"]?.orders ?? 0), unit: nil, now: t.groups["cancelled"]?.orders ?? 0, prev: p?.groups["cancelled"]?.orders, icon: "xmark.circle", tint: .red) }
                        KpiTile(title: "Giá trị TB đơn", value: Fmt.short(t.averageOrder ?? 0), unit: "₫", now: t.averageOrder ?? 0, prev: p?.averageOrder, icon: "equal.circle", tint: .gray)
                    }.buttonStyle(.plain)
                    if let s = data?.current.series, !s.isEmpty {
                        Card(title: "Doanh thu theo ngày") { SeriesChart(series: s, metric: .closedNet, groupBy: "day") { b in Route.orders(OrderQuery(start: b, end: b, group: "closed", basis: "confirmed", title: "Đơn chốt \(Fmt.day(b))")) } }
                    }
                    PosBreakdown(rows: data?.current.byPos ?? [], total: t.closedNet)
                    if let r = data?.current.reconcile {
                        ReconcileLine(state: (Int(t.closedOrders - r.orders) == 0 && abs(t.closedNet - r.net) < 1000, Int(t.closedOrders - r.orders) == 0 && abs(t.closedNet - r.net) < 1000 ? "Khớp với đơn gốc: \(Fmt.int(r.orders)) đơn · \(Fmt.money(r.net))." : "Lệch: bảng số liệu \(Fmt.int(t.closedOrders)) / \(Fmt.money(t.closedNet)); đơn gốc \(Fmt.int(r.orders)) / \(Fmt.money(r.net)).")).reveal()
                    }
                } else if loading { SkeletonGrid(tiles: 6) }
            }.padding(16)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Báo cáo cuối tháng").navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task(id: offset) { await load() }
    }
    @MainActor private func load() async {
        loading = true; defer { loading = false }
        do { data = try await API.overview(start: month.0, end: month.1, groupBy: "day"); error = nil } catch { self.error = error.localizedDescription }
    }
}

/// Biểu đồ cột theo kỳ (gộp mọi POS); chạm cột → danh sách đơn của kỳ đó.
enum SeriesMetric: String, CaseIterable, Identifiable { case closedNet = "Doanh thu", closedOrders = "Đơn chốt", orders = "Đơn tạo", delivered = "Giao TC"; var id: String { rawValue } }
struct SeriesChart: View {
    let series: [API.SeriesRow]; let metric: SeriesMetric; let groupBy: String
    let route: (String) -> Route
    private var points: [(String, Double)] {
        var m: [String: Double] = [:]
        for r in series {
            let v: Double = metric == .closedNet ? r.closedNet : metric == .closedOrders ? r.closedOrders : metric == .orders ? r.orders : (r.groups["delivered"]?.orders ?? 0)
            m[r.bucket, default: 0] += v
        }
        return m.keys.sorted().map { ($0, m[$0]!) }
    }
    private func label(_ b: String) -> String { groupBy == "month" ? "T" + String(b.suffix(2)) : String(b.suffix(2)) }
    var body: some View {
        let pts = points
        let maxV = max(1, pts.map(\.1).max() ?? 1)
        VStack(alignment: .leading, spacing: 6) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .bottom, spacing: 4) {
                    ForEach(pts, id: \.0) { b, v in
                        NavigationLink(value: route(groupBy == "month" ? b + "-01" : b)) {
                            VStack(spacing: 3) {
                                Text(v > 0 ? (metric == .closedNet ? Fmt.short(v) : Fmt.int(v)) : "").font(.system(size: 8)).monospacedDigit().foregroundStyle(.secondary).lineLimit(1)
                                GrowBar(height: max(2, 110 * v / maxV), color: .brand).frame(width: max(14, 320 / CGFloat(max(1, min(pts.count, 20)))))
                                Text(label(b)).font(.system(size: 9)).monospacedDigit().foregroundStyle(.secondary)
                            }.frame(height: 150, alignment: .bottom).contentShape(.rect)
                        }.buttonStyle(.plain)
                    }
                }
            }
            Text("Chạm một cột để xem đơn của kỳ đó").font(.caption2).foregroundStyle(.tertiary)
        }
    }
}

// MARK: Báo cáo tùy chỉnh

struct CustomReportView: View {
    @State private var metric: SeriesMetric = .closedNet
    @State private var groupBy = "day"
    @State private var period: Period = .month
    @State private var pos: String? = nil
    @State private var data: API.Overview?
    @State private var error: String?
    @State private var loading = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Picker("Chỉ số", selection: $metric) { ForEach(SeriesMetric.allCases) { Text($0.rawValue).tag($0) } }.pickerStyle(.segmented)
                PeriodPicker(period: $period, options: [.week, .month, .last, .quarter])
                Picker("Gộp theo", selection: $groupBy) { Text("Ngày").tag("day"); Text("Tuần").tag("week"); Text("Tháng").tag("month") }.pickerStyle(.segmented)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        Chip(label: "Tất cả POS", on: pos == nil) { pos = nil }
                        ForEach(PosBreakdown.order, id: \.self) { id in Chip(label: PosBreakdown.names[id] ?? id, on: pos == id) { pos = pos == id ? nil : id } }
                    }
                }
                if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
                if let d = data, let s = d.current.series {
                    let t = d.current.total
                    let total: Double = metric == .closedNet ? t.closedNet : metric == .closedOrders ? t.closedOrders : metric == .orders ? t.orders : (t.groups["delivered"]?.orders ?? 0)
                    MiniStat(title: "\(metric.rawValue) · \(period.label)", value: metric == .closedNet ? Fmt.money(total) : Fmt.int(total), tint: .brand)
                    Card(title: "\(metric.rawValue) theo \(groupBy == "day" ? "ngày" : groupBy == "week" ? "tuần" : "tháng")") {
                        SeriesChart(series: s, metric: metric, groupBy: groupBy) { b in
                            let end = groupBy == "day" ? b : groupBy == "week" ? VNDate.string(VNDate.add(6, to: VNDate.date(b) ?? .now)) : VNDate.monthEnd(b)
                            return Route.orders(OrderQuery(start: b, end: end, posIds: pos.map { [$0] } ?? [], group: metric == .delivered ? "delivered" : metric == .orders ? "" : "closed", basis: metric == .orders || metric == .delivered ? "created" : "confirmed", title: metric.rawValue))
                        }
                    }
                    Card(title: "Bảng số liệu") {
                        ForEach(rowsOf(s), id: \.0) { b, v in
                            HStack { Text(groupBy == "month" ? "Tháng " + String(b.suffix(2)) : Fmt.day(b)).font(.subheadline); Spacer(); Text(metric == .closedNet ? Fmt.money(v) : Fmt.int(v)).font(.subheadline.weight(.semibold)).monospacedDigit() }.padding(.vertical, 3)
                            Divider()
                        }
                    }
                } else if loading { Skeleton(height: 200) }
            }.padding(16)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Báo cáo tùy chỉnh").navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task(id: "\(period.rawValue)|\(groupBy)|\(pos ?? "")") { await load() }
    }
    private func rowsOf(_ s: [API.SeriesRow]) -> [(String, Double)] {
        var m: [String: Double] = [:]
        for r in s { m[r.bucket, default: 0] += metric == .closedNet ? r.closedNet : metric == .closedOrders ? r.closedOrders : metric == .orders ? r.orders : (r.groups["delivered"]?.orders ?? 0) }
        return m.keys.sorted(by: >).map { ($0, m[$0]!) }
    }
    @MainActor private func load() async {
        loading = true; defer { loading = false }
        do { data = try await API.overview(start: period.range.0, end: period.range.1, posIds: pos.map { [$0] } ?? [], groupBy: groupBy, compare: "none"); error = nil } catch { self.error = error.localizedDescription }
    }
}

extension VNDate {
    static func date(_ s: String) -> Date? { let f = DateFormatter(); f.timeZone = tz; f.dateFormat = "yyyy-MM-dd"; return f.date(from: s) }
}

// MARK: KPI CSKH

struct KpiView: View {
    @Environment(AuthModel.self) private var auth
    @State private var month = String(VNDate.string(.now).prefix(7))
    @State private var targets: API.Targets?
    @State private var actual: API.Overview?
    @State private var staff: [API.Employee] = []
    @State private var error: String?
    @State private var editing: API.Employee?
    private var isOwner: Bool { auth.me?.role == "owner" }
    var body: some View {
        List {
            Section {
                HStack {
                    Button { month = VNDate.shiftMonth(month, -1) } label: { Image(systemName: "chevron.left") }
                    Spacer(); Text("Tháng \(month.suffix(2))/\(month.prefix(4))").font(.headline); Spacer()
                    Button { month = VNDate.shiftMonth(month, 1) } label: { Image(systemName: "chevron.right") }
                }.buttonStyle(.borderless)
            }
            if let error { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
            if let t = targets {
                let actualBy = Dictionary(uniqueKeysWithValues: (actual?.current.byEmployee ?? []).map { ($0.sellerId, $0) })
                let goals = Dictionary(uniqueKeysWithValues: t.items.filter { $0.scope == "employee" }.map { ($0.refId, $0) })
                let list = staff.filter { $0.active != false }
                let sumGoal = list.reduce(0.0) { $0 + (goals[$1.id]?.revenue ?? 0) }, sumAct = list.reduce(0.0) { $0 + (actualBy[$1.id]?.closedNet ?? 0) }
                Section("Toàn đội CSKH") {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack { Text("Doanh thu").font(.subheadline); Spacer(); Text("\(Fmt.short(sumAct)) / \(Fmt.short(sumGoal)) ₫ · \(Fmt.pct(sumGoal > 0 ? sumAct / sumGoal * 100 : nil))").font(.subheadline.weight(.semibold)).monospacedDigit() }
                        Bar(value: sumGoal > 0 ? sumAct / sumGoal : 0, tint: .good, height: 8)
                    }.padding(.vertical, 4)
                }
                Section(isOwner ? "Theo nhân viên · chạm để sửa mục tiêu" : "Theo nhân viên") {
                    ForEach(list) { e in
                        let g = goals[e.id], a = actualBy[e.id]
                        Button { if isOwner { editing = e } } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                HStack { Text(e.name).font(.subheadline.weight(.semibold)).lineLimit(1); Spacer(); Text(Fmt.pct((g?.revenue ?? 0) > 0 ? (a?.closedNet ?? 0) / g!.revenue * 100 : nil)).font(.subheadline.weight(.bold)).monospacedDigit().foregroundStyle(pctColor((g?.revenue ?? 0) > 0 ? (a?.closedNet ?? 0) / g!.revenue : nil)) }
                                Bar(value: (g?.revenue ?? 0) > 0 ? (a?.closedNet ?? 0) / g!.revenue : 0, tint: .brand)
                                Text("\(Fmt.short(a?.closedNet ?? 0)) / \(g.map { Fmt.short($0.revenue) } ?? "chưa đặt") ₫ · \(Fmt.int(a?.closedOrders ?? 0)) / \(g.map { Fmt.int($0.closedOrders) } ?? "—") đơn").font(.caption).foregroundStyle(.secondary).monospacedDigit()
                            }.contentShape(.rect)
                        }.buttonStyle(.plain)
                    }
                }
            } else if error == nil { ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear) }
        }
        .navigationTitle("KPI CSKH").navigationBarTitleDisplayMode(.inline)
        .sheet(item: $editing) { e in
            TargetEditor(employee: e, current: targets?.items.first { $0.scope == "employee" && $0.refId == e.id }, month: month) { Task { await load() } }
        }
        .refreshable { await load() }
        .task(id: month) { await load() }
    }
    private func pctColor(_ r: Double?) -> Color { guard let r else { return .secondary }; return r >= 1 ? .good : r >= 0.7 ? .orange : .bad }
    @MainActor private func load() async {
        do {
            if staff.isEmpty { staff = try await API.employees(team: "cskh") }
            async let t = API.targets(month: month)
            async let a = API.overview(start: month + "-01", end: min(VNDate.monthEnd(month), VNDate.string(.now)), team: "cskh", compare: "none")
            targets = try await t; actual = try await a; error = nil
        } catch { self.error = error.localizedDescription }
    }
}

struct TargetEditor: View {
    let employee: API.Employee; let current: API.Target?; let month: String; let done: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var revenue = ""
    @State private var orders = ""
    @State private var saving = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                Section(employee.name) {
                    LabeledContent("Doanh thu (₫)") { TextField("0", text: $revenue).keyboardType(.numberPad).multilineTextAlignment(.trailing) }
                    LabeledContent("Đơn chốt") { TextField("0", text: $orders).keyboardType(.numberPad).multilineTextAlignment(.trailing) }
                }
                if let error { Text(error).foregroundStyle(Color.bad).font(.caption) }
            }
            .navigationTitle("Mục tiêu tháng \(month.suffix(2))").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(saving ? "Đang lưu…" : "Lưu") { Task { await save() } }.disabled(saving) }
            }
            .onAppear { revenue = current.map { Fmt.int($0.revenue).filter(\.isNumber) } ?? ""; orders = current.map { Fmt.int($0.closedOrders) } ?? "" }
        }
        .presentationDetents([.medium])
    }
    @MainActor private func save() async {
        saving = true; defer { saving = false }
        do {
            try await API.saveTargets(month: month, only: ["employee:\(employee.id)"], items: [["scope": "employee", "refId": employee.id, "revenue": Double(revenue.filter(\.isNumber)) ?? 0, "closedOrders": Double(orders.filter(\.isNumber)) ?? 0]])
            done(); dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

extension VNDate {
    static func shiftMonth(_ ym: String, _ n: Int) -> String {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = tz
        guard let d = date(ym + "-01"), let s = cal.date(byAdding: .month, value: n, to: d) else { return ym }
        return String(string(s).prefix(7))
    }
}

// MARK: Nhật ký hoạt động

struct AuditView: View {
    @State private var data: API.Audit?
    @State private var items: [API.AuditItem] = []
    @State private var q = ""
    @State private var error: String?
    var body: some View {
        List {
            if let error, items.isEmpty { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
            Section(data.map { "\(Fmt.int($0.total)) sự kiện" } ?? "Đang tải") {
                ForEach(items) { a in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(data?.labels?[a.action] ?? a.action).font(.subheadline.weight(.semibold))
                            Spacer()
                            if let s = a.status, s >= 400 { Text("\(s)").font(.caption2.weight(.bold)).foregroundStyle(Color.bad) }
                            Text(Fmt.dateTime(a.at)).font(.caption2).foregroundStyle(.secondary).monospacedDigit()
                        }
                        Text([a.name ?? a.email, a.target].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        if let d = a.detail, !d.isEmpty { Text(d).font(.caption).lineLimit(2) }
                        if let dv = a.device { Text("\(dv)\(a.ip.map { " · \($0)" } ?? "")").font(.caption2).foregroundStyle(.tertiary).lineLimit(1) }
                    }
                }
                if let d = data, Double(items.count) < d.total { Button("Tải thêm") { Task { await load(next: true) } } }
            }
        }
        .navigationTitle("Nhật ký hoạt động").navigationBarTitleDisplayMode(.inline)
        .searchable(text: $q, prompt: "Tìm theo nội dung")
        .onSubmit(of: .search) { Task { await load(next: false) } }
        .refreshable { await load(next: false) }
        .task { await load(next: false) }
    }
    @MainActor private func load(next: Bool) async {
        do { let r = try await API.audit(q: q, page: next ? (data?.page ?? 0) + 1 : 1); items = next ? items + r.items : r.items; data = r; error = nil } catch { self.error = error.localizedDescription }
    }
}

// MARK: Cấu hình & kết nối

struct ConfigView: View {
    @Environment(AuthModel.self) private var auth
    @State private var sync: [API.SyncPos] = []
    @State private var error: String?
    @State private var busy: Set<String> = []
    @State private var toast: String?
    var body: some View {
        List {
            if let error, sync.isEmpty { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
            if let toast { Text(toast).font(.caption).foregroundStyle(Color.good) }
            Section("Kết nối Pancake POS · \(sync.count) shop") {
                ForEach(sync) { p in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Circle().fill(p.lastError != nil ? Color.bad : ageMinutes(p) > 15 ? .orange : .good).frame(width: 8, height: 8)
                            Text(PosBreakdown.names[p.posId] ?? p.posId).font(.subheadline.weight(.semibold))
                            Spacer()
                            if auth.me?.role == "owner" {
                                Button { Task { await syncNow(p.posId) } } label: { if busy.contains(p.posId) { ProgressView().controlSize(.small) } else { Text("Đồng bộ ngay").font(.caption.weight(.semibold)) } }
                                    .buttonStyle(.bordered).tint(.brand).disabled(busy.contains(p.posId))
                            }
                        }
                        Text("\(Fmt.int(p.records)) đơn đã lưu · đồng bộ \(p.lastSyncAt.map { Fmt.dateTime($0) } ?? "chưa")\(p.errors24h > 0 ? " · \(Fmt.int(p.errors24h)) lỗi 24h" : "")").font(.caption).foregroundStyle(.secondary)
                        if let e = p.lastError { Text(e).font(.caption2).foregroundStyle(Color.bad).lineLimit(2) }
                    }.padding(.vertical, 2)
                }
            }
            Section {
                NavigationLink(value: Route.site(WebPage(id: "config", title: "Cấu hình & kết nối", icon: "gearshape.2.fill", path: "/?view=config"))) { Label("Cấu hình đầy đủ trên web (API key, cảnh báo, người dùng, đội nhóm)", systemImage: "arrow.up.right.square") }
            }
        }
        .navigationTitle("Cấu hình & kết nối").navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
    }
    private func ageMinutes(_ p: API.SyncPos) -> Int { guard let t = p.lastSyncAt, let d = Fmt.parseISO(t) else { return 99999 }; return Int(Date.now.timeIntervalSince(d) / 60) }
    @MainActor private func load() async { do { sync = try await API.syncStatus(); error = nil } catch { self.error = error.localizedDescription } }
    @MainActor private func syncNow(_ posId: String) async {
        busy.insert(posId); defer { busy.remove(posId) }
        do { let r = try await API.syncNow(posId: posId); toast = "\(PosBreakdown.names[posId] ?? posId): đã đồng bộ \(Fmt.int(r.records ?? 0)) đơn mới."; await load() } catch { toast = error.localizedDescription }
    }
}
