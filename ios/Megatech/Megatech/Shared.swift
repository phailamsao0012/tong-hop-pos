import SwiftUI

// Ba mẫu màn dùng chung cho cả app: danh sách có lọc (OrderListView), hồ sơ chi tiết (OrderDetailView, CustomerDetailView)
// và bảng giải thích cách tính (ExplainSheet). Quy tắc: chạm chỉ số → giải thích → danh sách cấu thành → hồ sơ gốc.

/// Bộ lọc được mang theo khi đi sâu: kỳ, POS, nhóm trạng thái, nhân viên, cơ sở thời gian.
struct OrderQuery: Hashable {
    var start = ""; var end = ""
    var posIds: [String] = []
    /// closed · unconfirmed · new · confirmed · shipping · delivered · returned · cancelled · "" (tất cả)
    var group = ""
    var sellerId = ""
    /// created (ngày tạo) · confirmed (ngày chốt) · assigned (ngày chia)
    var basis = "created"
    var q = ""
    var hour: Int? = nil
    var title = "Đơn hàng"

    var queryString: String {
        var parts = ["posIds=\(posIds.joined(separator: ","))", "start=\(start)", "end=\(end)", "basis=\(basis)"]
        if !group.isEmpty { parts.append("group=\(group)") }
        if !sellerId.isEmpty { parts.append("sellerId=\(sellerId)") }
        if let hour { parts.append("hour=\(hour)") }
        if !q.isEmpty { parts.append("q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q)") }
        return parts.joined(separator: "&")
    }
    var contextLine: String {
        var s = start == end ? Fmt.day(start) : "\(Fmt.day(start)) – \(Fmt.day(end))"
        s += basis == "confirmed" ? " · theo ngày chốt" : basis == "assigned" ? " · theo ngày chia" : " · theo ngày tạo"
        if let hour { s += " · \(hour):00–\(hour + 1):00" }
        if !posIds.isEmpty { s += " · " + posIds.map { PosBreakdown.names[$0] ?? $0 }.joined(separator: ", ") }
        return s
    }
}

// MARK: Danh sách đơn có lọc

struct OrderListView: View {
    let query: OrderQuery
    @State private var rows: [API.OrderRow] = []
    @State private var page = 1
    @State private var hasMore = false
    @State private var loading = false
    @State private var error: String?
    @State private var search = ""

    var body: some View {
        List {
            Section {
                Text(query.contextLine).font(.caption).foregroundStyle(.secondary).listRowBackground(Color.clear)
            }
            if let error, rows.isEmpty { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
            if rows.isEmpty && !loading && error == nil { ContentUnavailableView("Không có đơn", systemImage: "tray", description: Text("Không có đơn nào khớp bộ lọc này.")) }
            ForEach(rows) { o in
                NavigationLink(value: Route.order(o.id)) { OrderRowView(o: o) }
            }
            if hasMore {
                Button { Task { await load(next: true) } } label: {
                    HStack { Spacer(); if loading { ProgressView() } else { Text("Tải thêm") }; Spacer() }
                }
            }
        }
        .overlay { if loading && rows.isEmpty { ProgressView() } }
        .navigationTitle(query.title)
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "Mã đơn, SĐT, tên khách")
        .onSubmit(of: .search) { Task { await load(next: false) } }
        .onChange(of: search) { _, v in if v.isEmpty { Task { await load(next: false) } } }
        .refreshable { await load(next: false) }
        .task(id: query) { await load(next: false) }
    }

    @MainActor private func load(next: Bool) async {
        loading = true; defer { loading = false }
        var q = query; q.q = search
        let p = next ? page + 1 : 1
        do {
            let r = try await API.orders(q, page: p)
            rows = next ? rows + r.orders : r.orders
            page = r.page; hasMore = r.hasMore; error = nil
        } catch { self.error = error.localizedDescription }
    }
}

struct OrderRowView: View {
    let o: API.OrderRow
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text("#\(o.orderId)").font(.subheadline.weight(.semibold)).monospacedDigit()
                StatusChip(name: o.statusName, code: o.statusCode)
                Spacer()
                Text(Fmt.money(o.net ?? o.currentTotal ?? 0)).font(.subheadline.weight(.semibold)).monospacedDigit()
            }
            Text([o.customer, o.phone].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            HStack(spacing: 6) {
                Text(o.posName).lineLimit(1)
                if let s = o.sellerName { Text("·"); Text(s).lineLimit(1) }
                Spacer()
                Text(Fmt.time(o.firstConfirmedAt ?? o.createdAt)).monospacedDigit()
            }.font(.caption2).foregroundStyle(.tertiary)
        }
        .padding(.vertical, 2)
    }
}

struct StatusChip: View {
    let name: String; let code: Int?
    var tint: Color {
        switch code ?? -1 {
        case 3, 16: return .good
        case 4, 5, 15: return .orange
        case 6, 7: return .bad
        case 0, 17: return .gray
        default: return .brand
        }
    }
    var body: some View {
        Text(name).font(.caption2.weight(.semibold)).foregroundStyle(tint)
            .padding(.horizontal, 6).padding(.vertical, 2).background(tint.opacity(0.12), in: .capsule)
    }
}

/// Đích điều hướng dùng chung: một đơn, một khách, một danh sách đơn.
enum Route: Hashable {
    case order(String)
    case customer(posId: String, phone: String)
    case orders(OrderQuery)
    case web(WebPage)
}

extension View {
    /// Gắn vào NavigationStack để mọi màn con mở được đơn / khách / danh sách.
    func appRoutes() -> some View {
        navigationDestination(for: Route.self) { r in
            switch r {
            case .order(let id): OrderDetailView(id: id)
            case .customer(let posId, let phone): CustomerDetailView(posId: posId, phone: phone)
            case .orders(let q): OrderListView(query: q)
            case .web(let p): PageDestination(p: p)
            }
        }
    }
}

// MARK: Hồ sơ đơn

struct OrderDetailView: View {
    let id: String
    @State private var d: API.OrderDetail?
    @State private var error: String?

    var body: some View {
        List {
            if let error { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
            if let d {
                Section {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("#\(d.orderId)").font(.title3.weight(.bold)).monospacedDigit()
                            Text(d.posName).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 4) {
                            Text(d.statusName).font(.subheadline.weight(.semibold)).foregroundStyle(Color.brand)
                            if let s = d.subStatus, !s.isEmpty { Text(s).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    if let phone = d.phone {
                        NavigationLink(value: Route.customer(posId: d.posId, phone: phone)) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(d.customer ?? "Khách").font(.subheadline.weight(.semibold))
                                Text("\(phone) · xem hồ sơ khách").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        if let u = URL(string: "tel:\(phone)") { Link(destination: u) { Label("Gọi \(phone)", systemImage: "phone.fill") } }
                    }
                }
                Section("Tiền") {
                    row("Doanh số", Fmt.money(d.gross ?? 0))
                    row("Giảm giá / quà", "−" + Fmt.money(d.discount ?? 0))
                    row("Doanh thu", Fmt.money(d.net ?? 0), bold: true)
                    if let f = d.shippingFee, f > 0 { row("Phí ship", Fmt.money(f)) }
                    if let c = d.cod, c > 0 { row("COD", Fmt.money(c)) }
                }
                if !d.items.isEmpty { Section("Sản phẩm · \(d.items.count)") {
                    ForEach(Array(d.items.enumerated()), id: \.offset) { _, i in
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(i.name ?? "—").font(.subheadline)
                                Text("\(Fmt.int(i.quantity ?? 0)) × \(Fmt.money(i.price ?? 0))\(i.bonus == true ? " · quà" : "")").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(Fmt.money(i.total ?? 0)).font(.subheadline).monospacedDigit()
                        }
                    }
                } }
                Section("Người phụ trách") {
                    if let m = d.marketerName { row("Marketing", m) }
                    if let s = d.sellerName { row("Người bán", s) }
                    if let c = d.closerName { row("Người chốt", c) }
                    if let c = d.careName { row("CSKH", c) }
                    if let c = d.creatorName { row("Người tạo", c) }
                    if let s = d.source { row("Nguồn", s) }
                }
                Section("Mốc thời gian") {
                    row("Tạo", Fmt.dateTime(d.createdAt))
                    if let a = d.sellerAssignedAt { row("Chia người bán", Fmt.dateTime(a)) }
                    if let a = d.firstConfirmedAt { row("Chốt (xác nhận)", Fmt.dateTime(a)) }
                    if let a = d.deliveredAt { row("Giao thành công", Fmt.dateTime(a)) }
                    if let a = d.returnedAt { row("Hoàn", Fmt.dateTime(a)) }
                    if let a = d.cancelledAt { row("Hủy", Fmt.dateTime(a)) }
                }
                if !d.history.isEmpty {
                    Section("Lịch sử trạng thái") {
                        ForEach(Array(d.history.enumerated()), id: \.offset) { _, h in
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(h.fromName ?? "—") → \(h.toName ?? "—")").font(.subheadline)
                                Text("\(h.by ?? "Hệ thống") · \(Fmt.dateTime(h.at))").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                if d.address != nil || d.note != nil || d.returnedReason != nil {
                    Section("Giao hàng & ghi chú") {
                        if let a = d.address { row("Địa chỉ", [d.receiver, a].compactMap { $0 }.joined(separator: " · ")) }
                        if let w = d.warehouse { row("Kho", w) }
                        if let r = d.returnedReason { row("Lý do hoàn", r) }
                        if let n = d.note, !n.isEmpty { Text(n).font(.subheadline) }
                    }
                }
                if let u = d.pancakeUrl.flatMap(URL.init) { Section { Link(destination: u) { Label("Mở trên Pancake POS", systemImage: "arrow.up.right.square") } } }
            } else if error == nil { ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear) }
        }
        .navigationTitle("Đơn hàng")
        .navigationBarTitleDisplayMode(.inline)
        .task { do { d = try await API.orderDetail(id: id) } catch { self.error = error.localizedDescription } }
    }
    private func row(_ k: String, _ v: String, bold: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline) { Text(k).foregroundStyle(.secondary); Spacer(); Text(v).multilineTextAlignment(.trailing).fontWeight(bold ? .semibold : .regular).monospacedDigit() }.font(.subheadline)
    }
}

// MARK: Hồ sơ khách

struct CustomerDetailView: View {
    let posId: String; let phone: String
    @State private var d: API.CustomerDetail?
    @State private var error: String?

    var body: some View {
        List {
            if let error { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
            if let d {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(d.stats?.name ?? d.orders.first.map { _ in "Khách" } ?? "Khách").font(.title3.weight(.bold))
                        Text("\(phone) · \(d.posName ?? posId)").font(.caption).foregroundStyle(.secondary)
                        if let p = d.profile, let a = p.address { Text([a, p.province].compactMap { $0 }.joined(separator: ", ")).font(.caption).foregroundStyle(.secondary) }
                    }
                    if let u = URL(string: "tel:\(phone)") { Link(destination: u) { Label("Gọi \(phone)", systemImage: "phone.fill") } }
                }
                if let s = d.stats {
                    Section("Số liệu") {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                            mini("Đơn tạo", Fmt.int(s.orders)); mini("Đơn chốt", Fmt.int(s.closedOrders)); mini("Mua thành công", Fmt.int(s.successOrders))
                            mini("Doanh thu TC", Fmt.short(s.successNet)); mini("TB đơn", Fmt.short(s.averageOrder ?? 0)); mini("Hoàn / hủy", "\(Fmt.int(s.returnedOrders)) / \(Fmt.int(s.cancelledOrders))")
                        }.padding(.vertical, 4)
                        if let n = s.sellerName { row("Người phụ trách", n) }
                        row("Đơn đầu", Fmt.day(s.firstOrderAt)); row("Mua gần nhất", Fmt.day(s.lastSuccessAt ?? s.lastOrderAt))
                    }
                }
                if let p = d.profile, !(p.tags.isEmpty && p.notes.isEmpty && p.marketers.isEmpty) {
                    Section("Hồ sơ Pancake") {
                        if !p.tags.isEmpty { row("Thẻ", p.tags.joined(separator: ", ")) }
                        if !p.marketers.isEmpty { row("Marketing", p.marketers.joined(separator: ", ")) }
                        if !p.sources.isEmpty { row("Nguồn", p.sources.joined(separator: ", ")) }
                        ForEach(Array(p.notes.enumerated()), id: \.offset) { _, n in Text(n).font(.subheadline) }
                    }
                }
                Section("Lịch sử mua · \(d.orders.count) đơn") {
                    ForEach(d.orders) { o in
                        NavigationLink(value: Route.order(o.id)) {
                            VStack(alignment: .leading, spacing: 3) {
                                HStack {
                                    Text("#\(o.sourceOrderId)").font(.subheadline.weight(.semibold)).monospacedDigit()
                                    if let r = o.successRank { Text(r == 1 ? "Lần đầu" : "Mua lại \(r - 1)").font(.caption2.weight(.semibold)).foregroundStyle(Color.good) }
                                    Spacer()
                                    Text(Fmt.money(o.net)).font(.subheadline).monospacedDigit()
                                }
                                Text("\(o.statusName) · \(Fmt.day(o.createdAt))\(o.sellerName.map { " · \($0)" } ?? "")").font(.caption).foregroundStyle(.secondary)
                                if !o.items.isEmpty { Text(o.items.compactMap(\.name).joined(separator: ", ")).font(.caption2).foregroundStyle(.tertiary).lineLimit(2) }
                            }
                        }
                    }
                }
            } else if error == nil { ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear) }
        }
        .navigationTitle("Hồ sơ khách")
        .navigationBarTitleDisplayMode(.inline)
        .task { do { d = try await API.customer(posId: posId, phone: phone) } catch { self.error = error.localizedDescription } }
    }
    private func mini(_ k: String, _ v: String) -> some View {
        VStack(alignment: .leading, spacing: 2) { Text(v).font(.headline).monospacedDigit(); Text(k).font(.caption2).foregroundStyle(.secondary) }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private func row(_ k: String, _ v: String) -> some View {
        HStack(alignment: .firstTextBaseline) { Text(k).foregroundStyle(.secondary); Spacer(); Text(v).multilineTextAlignment(.trailing) }.font(.subheadline)
    }
}

// MARK: Bảng giải thích cách tính

/// Mô tả một con số: định nghĩa, kỳ, so kỳ trước, dòng đối chiếu, và danh sách đơn cấu thành (nếu có).
struct MetricExplain: Identifiable {
    let id = UUID()
    let title: String
    let value: String
    let definition: String
    var period = ""
    var previous: (label: String, value: String)? = nil
    var reconcile: (ok: Bool, text: String)? = nil
    var count: Int? = nil
    var query: OrderQuery? = nil
}

struct ExplainSheet: View {
    let m: MetricExplain
    let open: (OrderQuery) -> Void
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(m.value).font(.system(.largeTitle, design: .rounded).weight(.bold)).monospacedDigit()
                        if !m.period.isEmpty { Text(m.period).font(.caption).foregroundStyle(.secondary) }
                    }
                    if let p = m.previous { LabeledContent(p.label, value: p.value) }
                }
                Section("Cách tính") { Text(m.definition).font(.subheadline) }
                if let r = m.reconcile {
                    Section("Đối chiếu") {
                        Label(r.text, systemImage: r.ok ? "checkmark.seal.fill" : "exclamationmark.triangle.fill").foregroundStyle(r.ok ? Color.good : .orange).font(.subheadline)
                    }
                }
                if let q = m.query {
                    Section {
                        Button { dismiss(); open(q) } label: {
                            Label(m.count.map { "Xem \(Fmt.int(Double($0))) đơn cấu thành" } ?? "Xem đơn cấu thành", systemImage: "list.bullet.rectangle")
                        }
                    }
                }
            }
            .navigationTitle(m.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Đóng") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
}

extension Fmt {
    /// "2026-09-24" → "24/09/2026"; giữ nguyên nếu không đúng dạng.
    static func day(_ s: String?) -> String {
        guard let s, s.count >= 10 else { return "—" }
        let p = s.prefix(10).split(separator: "-")
        return p.count == 3 ? "\(p[2])/\(p[1])/\(p[0])" : String(s.prefix(10))
    }
    static func time(_ iso: String?) -> String {
        guard let iso, let d = parse(iso) else { return "" }
        let f = DateFormatter(); f.timeZone = VNDate.tz; f.dateFormat = "HH:mm dd/MM"; return f.string(from: d)
    }
    static func dateTime(_ iso: String?) -> String {
        guard let iso, let d = parse(iso) else { return "—" }
        let f = DateFormatter(); f.timeZone = VNDate.tz; f.dateFormat = "HH:mm dd/MM/yyyy"; return f.string(from: d)
    }
    private static func parse(_ iso: String) -> Date? {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: iso.hasSuffix("Z") ? iso : iso + "Z") { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: iso.hasSuffix("Z") ? iso : iso + "Z") ?? {
            let g = DateFormatter(); g.timeZone = TimeZone(identifier: "UTC"); g.dateFormat = "yyyy-MM-dd HH:mm:ss"; return g.date(from: iso)
        }()
    }
}
