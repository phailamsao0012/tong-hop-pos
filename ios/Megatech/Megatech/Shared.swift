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
    /// all · sale · cskh
    var team = "all"
    /// all · gentadox · skgk
    var product = "all"

    var queryString: String {
        var parts = ["posIds=\(posIds.joined(separator: ","))", "start=\(start)", "end=\(end)", "basis=\(basis)"]
        if !group.isEmpty { parts.append("group=\(group)") }
        if !sellerId.isEmpty { parts.append("sellerId=\(sellerId)") }
        if let hour { parts.append("hour=\(hour)") }
        if team != "all" { parts.append("team=\(team)") }
        if product != "all" { parts.append("productSegment=\(product)") }
        if !q.isEmpty { parts.append("q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q)") }
        return parts.joined(separator: "&")
    }
    var contextLine: String {
        var s = start == end ? Fmt.day(start) : "\(Fmt.day(start)) – \(Fmt.day(end))"
        s += basis == "confirmed" ? " · theo ngày chốt" : basis == "assigned" ? " · theo ngày chia" : " · theo ngày tạo"
        if let hour { s += " · \(hour):00–\(hour + 1):00" }
        if team != "all" { s += " · " + (team == "sale" ? "Sale" : "CSKH") }
        if product != "all" { s += " · " + (product == "gentadox" ? "Gentadox" : "SK + GK") }
        if !posIds.isEmpty { s += " · " + posIds.map { PosBreakdown.names[$0] ?? $0 }.joined(separator: ", ") }
        return s
    }
}

// MARK: Danh sách đơn có lọc

struct OrderListView: View {
    let query: OrderQuery
    var filterable = false
    @State private var edited: OrderQuery? = nil
    @State private var showFilter = false
    private var active: OrderQuery { edited ?? query }
    @State private var rows: [API.OrderRow] = []
    @State private var page = 1
    @State private var hasMore = false
    @State private var loading = false
    @State private var error: String?
    @State private var search = ""

    var body: some View {
        List {
            Section {
                Text(active.contextLine).font(.caption).foregroundStyle(.secondary).listRowBackground(Color.clear)
            }
            if let error, rows.isEmpty { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
            if rows.isEmpty && !loading && error == nil { ContentUnavailableView("Không có đơn", systemImage: "tray", description: Text("Không có đơn nào khớp bộ lọc này.")) }
            ForEach(rows) { o in
                NavigationLink(value: Route.order(o.id)) { OrderRowView(o: o) }
            }
            if hasMore {
                Button { Task { await load(next: true) } } label: {
                    HStack { Spacer(); if loading { Text("Đang tải thêm…").padding(.horizontal, 14).padding(.vertical, 6).overlay(ThinkingBorder(radius: 10, line: 2, glow: false)) } else { Text("Tải thêm") }; Spacer() }
                }
            }
        }
        .overlay { if loading && rows.isEmpty { ThinkingLoader() } }
        .navigationTitle(active.title)
        .navigationBarTitleDisplayMode(.inline).brandNav()
        .toolbar { if filterable { ToolbarItem(placement: .primaryAction) { Button { showFilter = true } label: { Label("Lọc", systemImage: "line.3.horizontal.decrease.circle") } } } }
        .sheet(isPresented: $showFilter) { OrderFilterSheet(query: active) { edited = $0 } }
        .searchable(text: $search, prompt: "Mã đơn, SĐT, tên khách")
        .onSubmit(of: .search) { Task { await load(next: false) } }
        .onChange(of: search) { _, v in if v.isEmpty { Task { await load(next: false) } } }
        .refreshable { await load(next: false) }
        .task(id: active) { await load(next: false) }
    }

    @MainActor private func load(next: Bool) async {
        loading = true; defer { loading = false }
        var q = active; q.q = search
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
                PosLabel(id: o.posId, name: o.posName, size: 14)
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
    /// Luôn mở bản web (dùng từ trong màn bản riêng cùng tên để tránh mở lại chính nó).
    case site(WebPage)
    case calls(team: String)
    case compare(team: String)
    case overview
    case overviewPos(String)
    case alerts
    case page(String)
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
            case .overview: OverviewView()
            case .overviewPos(let id): OverviewView(initialPos: id)
            case .alerts: AlertsView()
            case .page(let id): PageDestination(p: ALL_PAGES.first { $0.id == id } ?? WebPage(id: id, title: id, icon: "square", path: "/?view=\(id)"))
            case .calls(let t): CallsView(team: t)
            case .compare(let t): CompareView(team: t)
            case .site(let p): WebView(url: URL(string: p.path, relativeTo: API.base)!).navigationTitle(p.title).navigationBarTitleDisplayMode(.inline).ignoresSafeArea(edges: .bottom)
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
                            PosLabel(id: d.posId, name: d.posName, size: 18, short: false).font(.caption).foregroundStyle(.secondary)
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
            } else if error == nil { ThinkingLoader().listRowBackground(Color.clear) }
        }
        .navigationTitle("Đơn hàng")
        .navigationBarTitleDisplayMode(.inline).brandNav()
        .task { do { d = try await API.orderDetail(id: id) } catch { self.error = error.localizedDescription } }
    }
    private func row(_ k: String, _ v: String, bold: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline) { Text(k).foregroundStyle(.secondary); Spacer(); Text(v).multilineTextAlignment(.trailing).fontWeight(bold ? .semibold : .regular).monospacedDigit() }.font(.subheadline)
    }
}

// MARK: Hồ sơ khách (ảnh 5.1)

struct CustomerDetailView: View {
    let posId: String; let phone: String
    @State private var d: API.CustomerDetail?
    @State private var error: String?
    @State private var tab = "overview"
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let error { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
                if let d {
                    let name = d.stats?.name ?? d.orders.first.map { _ in "Khách" } ?? "Khách"
                    Panel {
                        HStack(alignment: .top, spacing: 12) {
                            Avatar(name: name, size: 56)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(name).font(.system(size: 16, weight: .bold)).foregroundStyle(Color.ink)
                                Tag(text: (d.stats?.successOrders ?? 0) >= 3 ? "Khách hàng thân thiết" : (d.stats?.successOrders ?? 0) > 0 ? "Đã mua hàng" : "Chưa mua", tone: (d.stats?.successOrders ?? 0) > 0 ? .green : .gray)
                                HStack(spacing: 4) { Image(systemName: "phone").font(.system(size: 9)); Text(phone) }.font(.system(size: 11)).foregroundStyle(Color.inkSoft)
                                if let p = d.profile, let a = p.address { HStack(spacing: 4) { Image(systemName: "mappin").font(.system(size: 9)); Text([a, p.province].compactMap { $0 }.joined(separator: ", ")).lineLimit(1) }.font(.system(size: 11)).foregroundStyle(Color.inkSoft) }
                                HStack(spacing: 4) { Image(systemName: "calendar").font(.system(size: 9)); Text("Khách từ \(Fmt.day(d.stats?.firstOrderAt ?? d.profile?.customerSince)) ·"); PosLabel(id: d.posId ?? posId, name: d.posName, short: false) }.font(.system(size: 11)).foregroundStyle(Color.inkSoft)
                            }
                            Spacer()
                            VStack(alignment: .leading, spacing: 6) {
                                VStack(alignment: .leading, spacing: 0) { Text("Tổng chi tiêu").font(.system(size: 9)).foregroundStyle(Color.inkSoft); Text(Fmt.vnd(d.stats?.successNet ?? 0)).font(.system(size: 13, weight: .bold)).foregroundStyle(Color.good) }
                                VStack(alignment: .leading, spacing: 0) { Text("Số đã mua").font(.system(size: 9)).foregroundStyle(Color.inkSoft); Text(Fmt.int(d.stats?.successOrders ?? 0)).font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink) }
                            }.padding(10).background(Color.brandSoft, in: .rect(cornerRadius: 10))
                        }
                    }
                    Segmented(selection: $tab, options: [("overview", "Tổng quan"), ("history", "Lịch sử mua"), ("care", "CSKH"), ("notes", "Ghi chú")])
                    switch tab {
                    case "history":
                        Panel { OrderTimeline(orders: d.orders) }
                    case "care":
                        Panel {
                            Text("Nhân viên chăm sóc").font(.system(size: 13, weight: .bold))
                            if let s = d.stats?.sellerName { HStack(spacing: 10) { Avatar(name: s, size: 40); VStack(alignment: .leading, spacing: 1) { Text(s).font(.system(size: 13, weight: .semibold)); Text("Người phụ trách hiện tại").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }; Spacer() } } else { Text("Chưa gán người phụ trách.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) }
                            if let p = d.profile, !p.marketers.isEmpty { Text("Marketing: \(p.marketers.joined(separator: ", "))").font(.system(size: 11)).foregroundStyle(Color.inkSoft) }
                            if let p = d.profile, !p.sources.isEmpty { Text("Nguồn: \(p.sources.joined(separator: ", "))").font(.system(size: 11)).foregroundStyle(Color.inkSoft) }
                            if let p = d.profile, !p.tags.isEmpty { HStack { ForEach(p.tags.prefix(5), id: \.self) { Tag(text: $0, tone: .blue) } } }
                        }
                    case "notes":
                        Panel {
                            Text("Ghi chú").font(.system(size: 13, weight: .bold))
                            let notes = (d.profile?.notes ?? []) + d.orders.compactMap { o in o.note.flatMap { $0.isEmpty ? nil : "Đơn #\(o.sourceOrderId): \($0)" } }
                            if notes.isEmpty { Text("Chưa có ghi chú.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) }
                            ForEach(Array(notes.enumerated()), id: \.offset) { _, n in HStack(alignment: .top, spacing: 8) { Image(systemName: "quote.opening").font(.system(size: 10)).foregroundStyle(Color.good); Text(n).font(.system(size: 12)).foregroundStyle(Color.ink) }.padding(.vertical, 3) }
                        }
                    default:
                        if let s = d.stats {
                            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                                KpiCard(icon: "cart.fill", tint: .good, label: "Đơn tạo / chốt", value: "\(Fmt.int(s.orders)) / \(Fmt.int(s.closedOrders))")
                                KpiCard(icon: "checkmark.seal.fill", tint: .good, label: "Mua thành công", value: Fmt.int(s.successOrders))
                                KpiCard(icon: "banknote.fill", tint: .teal, label: "Giá trị TB đơn", value: Fmt.short(s.averageOrder ?? 0) + " ₫")
                                KpiCard(icon: "arrow.uturn.backward", tint: .orange, label: "Hoàn / hủy", value: "\(Fmt.int(s.returnedOrders)) / \(Fmt.int(s.cancelledOrders))")
                            }
                        }
                        Panel { SectionHead(title: "Lịch sử mua hàng", action: "Xem tất cả").onTapGesture { tab = "history" }; OrderTimeline(orders: Array(d.orders.prefix(4))) }
                        if let s = d.stats?.sellerName { Panel { Text("Nhân viên chăm sóc").font(.system(size: 13, weight: .bold)); HStack(spacing: 10) { Avatar(name: s, size: 40); VStack(alignment: .leading, spacing: 1) { Text(s).font(.system(size: 13, weight: .semibold)); Text("Chuyên viên phụ trách").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }; Spacer(); if let u = URL(string: "tel:\(phone)") { IconButton(icon: "phone.fill", tint: .good, url: u) } } } }
                        if let n = (d.profile?.notes.first ?? d.orders.first { !($0.note ?? "").isEmpty }?.note) { Panel { HStack { Text("Ghi chú gần nhất").font(.system(size: 13, weight: .bold)); Spacer() }; HStack(alignment: .top, spacing: 8) { Image(systemName: "quote.opening").font(.system(size: 10)).foregroundStyle(Color.good); Text(n).font(.system(size: 12)) } } }
                    }
                    HStack(spacing: 10) {
                        if let u = URL(string: "tel:\(phone)") { Link(destination: u) { HStack { Image(systemName: "phone.fill"); Text("Gọi điện") }.font(.system(size: 13, weight: .bold)).foregroundStyle(.white).frame(maxWidth: .infinity).padding(.vertical, 12).background(Color.brandDeep, in: .rect(cornerRadius: 10)) } }
                        if let u = URL(string: "sms:\(phone)") { Link(destination: u) { HStack { Image(systemName: "message.fill"); Text("Nhắn tin") }.font(.system(size: 13, weight: .bold)).foregroundStyle(Color.brandDeep).frame(maxWidth: .infinity).padding(.vertical, 12).background(Color.brandSoft, in: .rect(cornerRadius: 10)) } }
                    }
                } else if error == nil { Skeleton(height: 120); SkeletonGrid(tiles: 4) }
            }.padding(16)
        }
        .navigationTitle("Hồ sơ khách hàng").navigationBarTitleDisplayMode(.inline).brandNav()
        .task { do { d = try await API.customer(posId: posId, phone: phone) } catch { self.error = error.localizedDescription } }
    }
}

/// Dòng thời gian đơn hàng như ảnh: chấm xanh, ngày giờ, mã đơn, tiền, trạng thái.
struct OrderTimeline: View {
    let orders: [API.CustomerOrder]
    var body: some View {
        VStack(spacing: 0) {
            if orders.isEmpty { Text("Chưa có đơn.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) }
            ForEach(Array(orders.enumerated()), id: \.element.id) { i, o in
                NavigationLink(value: Route.order(o.id)) {
                    HStack(alignment: .top, spacing: 10) {
                        VStack(spacing: 0) { Circle().fill(Color.good).frame(width: 9, height: 9).padding(.top, 5); if i < orders.count - 1 { Rectangle().fill(Color.good.opacity(0.25)).frame(width: 2).frame(maxHeight: .infinity) } }
                        VStack(alignment: .leading, spacing: 2) { Text(Fmt.day(o.createdAt)).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink); Text(Fmt.time(o.createdAt)).font(.system(size: 9)).foregroundStyle(Color.inkSoft) }.frame(width: 76, alignment: .leading)
                        VStack(alignment: .leading, spacing: 2) { Text("Đơn #\(o.sourceOrderId)").font(.system(size: 12)).foregroundStyle(Color.ink); if let r = o.successRank { Text(r == 1 ? "Lần đầu" : "Mua lại \(r - 1)").font(.system(size: 9, weight: .semibold)).foregroundStyle(Color.good) } else if !o.items.isEmpty { Text(o.items.compactMap(\.name).joined(separator: ", ")).font(.system(size: 9)).foregroundStyle(Color.inkSoft).lineLimit(1) } }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 3) { Text(Fmt.vnd(o.net)).font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink); Tag(text: o.statusName, tone: [3, 16].contains(o.statusCode) ? .green : [6, 7].contains(o.statusCode) ? .red : [4, 5, 15].contains(o.statusCode) ? .orange : .blue) }
                    }.padding(.vertical, 6).contentShape(.rect)
                }.buttonStyle(.plain)
            }
        }
    }
}

/// Tìm khách theo SĐT / tên trên mọi POS → hồ sơ (mục Thêm).
struct CustomerSearchView: View {
    @State private var q = ""
    @State private var pos = ""
    @State private var results: [API.OrderRow] = []
    @State private var searching = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                PageTitle(title: "Hồ sơ khách hàng", subtitle: "Tìm theo số điện thoại hoặc tên", icon: "person.text.rectangle.fill")
                HStack(spacing: 8) {
                    HStack(spacing: 8) { Image(systemName: "magnifyingglass").foregroundStyle(Color.inkSoft); TextField("Tìm theo số điện thoại hoặc tên khách hàng", text: $q).font(.system(size: 13)).keyboardType(.default).onSubmit { Task { await search() } } }
                        .padding(.horizontal, 12).padding(.vertical, 10).background(Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.08)))
                    Menu { Button("Tất cả POS") { pos = "" }; ForEach(PosBreakdown.order, id: \.self) { id in Button(PosBreakdown.names[id] ?? id) { pos = id } } } label: { Image(systemName: "line.3.horizontal.decrease").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.ink).frame(width: 40, height: 40).background(Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.08))) }
                }
                if !pos.isEmpty { Tag(text: "Chỉ tìm trong \(PosBreakdown.names[pos] ?? pos)", tone: .blue) }
                if searching { ThinkingLoader(captions: ["Đang tìm khách…", "Đang đối chiếu 6 POS…", "Sắp xong…"]) }
                VStack(spacing: 10) {
                    ForEach(unique(results)) { r in
                        NavigationLink(value: Route.customer(posId: r.posId, phone: r.phone ?? "")) {
                            HStack(spacing: 10) { Avatar(name: r.customer ?? "K", size: 40); VStack(alignment: .leading, spacing: 2) { Text(r.customer ?? "Khách").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink); Text("\(r.phone ?? "") · \(r.posName)").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }; Spacer(); Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft) }
                                .padding(12).background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                        }.buttonStyle(.plain)
                    }
                    if !q.isEmpty && results.isEmpty && !searching { Panel { Text("Không thấy khách khớp.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) } }
                }
            }.padding(16)
        }
        .navigationTitle("Hồ sơ khách hàng").navigationBarTitleDisplayMode(.inline).brandNav()
        .onChange(of: pos) { _, _ in Task { await search() } }
    }
    private func unique(_ rows: [API.OrderRow]) -> [API.OrderRow] { var seen = Set<String>(); return rows.filter { let k = $0.posId + ($0.phone ?? ""); return $0.phone != nil && seen.insert(k).inserted } }
    @MainActor private func search() async {
        let t = q.trimmingCharacters(in: .whitespaces); guard !t.isEmpty else { results = []; return }
        searching = true; defer { searching = false }
        results = (try? await API.orders(OrderQuery(posIds: pos.isEmpty ? [] : [pos], q: t), page: 1))?.orders ?? []
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
    static func parseISO(_ iso: String) -> Date? { parse(iso) }
    private static func parse(_ iso: String) -> Date? {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: iso.hasSuffix("Z") ? iso : iso + "Z") { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: iso.hasSuffix("Z") ? iso : iso + "Z") ?? {
            let g = DateFormatter(); g.timeZone = TimeZone(identifier: "UTC"); g.dateFormat = "yyyy-MM-dd HH:mm:ss"; return g.date(from: iso)
        }()
    }
}


/// Bộ lọc đơn nguồn: POS, khoảng ngày, cơ sở thời gian, nhóm trạng thái.
struct OrderFilterSheet: View {
    @State var query: OrderQuery
    let apply: (OrderQuery) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var start = Date.now
    @State private var end = Date.now
    static let groups = [("", "Tất cả"), ("closed", "Đơn chốt"), ("unconfirmed", "Chờ xác nhận"), ("new", "Mới"), ("confirmed", "Đã XN / đang xử lý"), ("shipping", "Đang giao"), ("delivered", "Đã nhận"), ("returned", "Hoàn"), ("cancelled", "Hủy")]
    var body: some View {
        NavigationStack {
            Form {
                Section("POS") {
                    Picker("POS", selection: Binding(get: { query.posIds.first ?? "" }, set: { query.posIds = $0.isEmpty ? [] : [$0] })) {
                        Text("Tất cả POS").tag("")
                        ForEach(PosBreakdown.order, id: \.self) { Text(PosBreakdown.names[$0] ?? $0).tag($0) }
                    }
                }
                Section("Khoảng ngày") {
                    DatePicker("Từ", selection: $start, in: ...Date.now, displayedComponents: .date)
                    DatePicker("Đến", selection: $end, in: ...Date.now, displayedComponents: .date)
                    Picker("Tính theo", selection: $query.basis) { Text("Ngày tạo").tag("created"); Text("Ngày chốt").tag("confirmed"); Text("Ngày chia").tag("assigned") }
                }
                Section("Trạng thái") {
                    Picker("Nhóm", selection: $query.group) { ForEach(Self.groups, id: \.0) { Text($0.1).tag($0.0) } }
                }
            }
            .navigationTitle("Lọc đơn").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Áp dụng") { var q = query; q.start = VNDate.string(min(start, end)); q.end = VNDate.string(max(start, end)); apply(q); dismiss() } }
            }
            .onAppear {
                let f = DateFormatter(); f.timeZone = VNDate.tz; f.dateFormat = "yyyy-MM-dd"
                start = f.date(from: query.start) ?? .now; end = f.date(from: query.end) ?? .now
            }
        }
        .presentationDetents([.medium, .large])
    }
}
