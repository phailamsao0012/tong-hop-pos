import SwiftUI

// Ba mẫu màn dùng chung cho cả app: danh sách có lọc (OrderListView), hồ sơ chi tiết (OrderDetailView, CustomerDetailView)
// và bảng giải thích cách tính (ExplainSheet). Quy tắc: chạm chỉ số → giải thích → danh sách cấu thành → hồ sơ gốc.

/// Bộ lọc được mang theo khi đi sâu: kỳ, POS, nhóm trạng thái, nhân viên, cơ sở thời gian.
/// Codable: đường đi trong tab được lưu để mở lại (NavMemory.swift); danh sách có từ khoá tìm hoặc theo một nhân viên thì không lưu.
struct OrderQuery: Hashable, Codable {
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

    /// Không có ngày (tìm SĐT, mã đơn trong mọi đơn, kế hoạch 1.5): không gửi khoảng ngày và mốc ngày, máy chủ không lọc ngày.
    var hasDates: Bool { !start.isEmpty || !end.isEmpty }
    var queryString: String {
        var parts = ["posIds=\(posIds.joined(separator: ","))"]
        if hasDates || hour != nil { parts += ["start=\(start)", "end=\(end)", "basis=\(basis)"] }
        if !group.isEmpty { parts.append("group=\(group)") }
        if !sellerId.isEmpty { parts.append("sellerId=\(sellerId)") }
        if let hour { parts.append("hour=\(hour)") }
        if team != "all" { parts.append("team=\(team)") }
        if product != "all" { parts.append("productSegment=\(product)") }
        if !q.isEmpty { parts.append("q=\(SearchText.urlValue(q))") }
        return parts.joined(separator: "&")
    }
    var contextLine: String {
        var s: String
        if !hasDates {
            s = "Mọi ngày"
            if posIds.isEmpty { s += " · mọi POS" }
        } else {
            s = start == end ? Fmt.day(start) : "\(Fmt.day(start)) – \(Fmt.day(end))"
            s += basis == "confirmed" ? " · theo ngày chốt" : basis == "assigned" ? " · theo ngày chia" : " · theo ngày tạo"
        }
        if let hour { s += " · \(hour):00–\(hour + 1):00" }
        if team != "all" { s += " · " + (team == "sale" ? "Sale" : "CSKH") }
        if product != "all" { s += " · " + (product == "gentadox" ? "Gentadox" : "SK + GK") }
        if !posIds.isEmpty { s += " · " + posIds.map { PosBreakdown.names[$0] ?? $0 }.joined(separator: ", ") }
        return s
    }
}

/// Bộ lọc của trang đang xem: kỳ, POS, bộ phận, nhóm đơn. Chạm một số trên trang thì danh sách đơn mở ra mang đúng bộ lọc này
/// (kế hoạch 1.6): dựng bằng OrderQuery.from, không tự ghép từng chỗ (trước đây chạm một nhân viên là mất POS, bộ phận, nhóm đơn).
struct OrderFilters: Hashable {
    var start: String
    var end: String
    /// "" = tất cả POS.
    var pos = ""
    /// all · sale · cskh
    var team = "all"
    /// all · gentadox · skgk
    var product = "all"
    init(range: (String, String), pos: String = "", team: String = "all", product: String = "all") {
        start = range.0; end = range.1
        self.pos = pos; self.team = team; self.product = product
    }
    init(period: Period, pos: String = "", team: String = "all", product: String = "all") {
        self.init(range: period.range, pos: pos, team: team, product: product)
    }
}

extension OrderQuery {
    /// Danh sách đơn cấu thành một số trên trang có bộ lọc f: cùng kỳ, POS, bộ phận, nhóm đơn; thêm nhóm trạng thái, mốc ngày
    /// và người bán (số của một người).
    static func from(_ f: OrderFilters, group: String, basis: String, sellerId: String = "", title: String) -> OrderQuery {
        OrderQuery(start: f.start, end: f.end, posIds: f.pos.isEmpty ? [] : [f.pos], group: group, sellerId: sellerId, basis: basis,
                   title: title, team: f.team, product: f.product)
    }
    /// Đơn chốt của một nhân viên trong bảng xếp hạng (khối Nhân viên ở Tổng quan, So sánh nhân viên), giữ bộ lọc của trang.
    static func closedOrders(of e: API.EmployeeRow, in f: OrderFilters) -> OrderQuery {
        from(f, group: "closed", basis: "confirmed", sellerId: e.sellerId, title: e.name ?? "Nhân viên")
    }
    /// Danh sách "Đơn chốt" lọc theo ngày xác nhận (raw/orders basis=confirmed), còn số Đơn chốt tính theo ngày vào Chờ xác nhận:
    /// danh sách có thể ít đơn hơn số trên thẻ cho tới khi web lọc được theo ngày vào Chờ xác nhận (Q8, basis=closed).
    var listsFewerThanClosedCount: Bool { group == "closed" && basis == "confirmed" }
}

// MARK: Danh sách đơn có lọc

struct OrderListView: View {
    @Environment(AppNav.self) private var nav: AppNav?
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
    /// Chữ trong ô tìm của danh sách. Mở sẵn từ khóa của trang gọi tới ("Xem tất cả" ở ô tìm tab Đơn hàng): giữ từ khóa đó,
    /// không ghi đè bằng ô trống (kế hoạch 1.5).
    @State private var search: String
    /// Danh sách không lọc ngày mà chữ trong ô không phải SĐT hay mã đơn: không gửi (không lọc ngày là máy chủ đọc cả bảng đơn).
    @State private var searchNote: String?
    /// Mở từ một số "Đơn chốt" (chưa đổi bộ lọc): ghi rõ danh sách lọc theo ngày xác nhận (QA app-chi-so điểm 6, kế hoạch 1.6).
    private var confirmedNote: Bool { edited == nil && query.listsFewerThanClosedCount }

    init(query: OrderQuery, filterable: Bool = false) {
        self.query = query
        self.filterable = filterable
        // Mã đơn ngắn từ ô tìm ("#123" gửi "123"): giữ dấu # để ô của danh sách vẫn hiểu là mã đơn.
        let shortCode = SearchText.code("#" + query.q) == query.q && SearchText.parse(query.q).term == nil
        _search = State(initialValue: shortCode ? "#" + query.q : query.q)
    }

    var body: some View {
        List {
            Section {
                if nav?.hrUnit != nil {
                    Text("Danh sách đơn chưa lọc theo team.").font(.caption).foregroundStyle(.secondary)
                        .listRowBackground(Color.clear)
                }
                Text(active.contextLine).font(.caption).foregroundStyle(.secondary).listRowBackground(Color.clear)
                if confirmedNote {
                    Label("Lọc theo ngày xác nhận, có thể ít hơn số trên thẻ", systemImage: "info.circle")
                        .font(.caption.weight(.semibold)).foregroundStyle(Color.warn)
                        .listRowBackground(Color.clear)
                }
                if let searchNote {
                    Label(searchNote, systemImage: "info.circle")
                        .font(.caption.weight(.semibold)).foregroundStyle(Color.warn)
                        .listRowBackground(Color.clear)
                }
            }
            if let error, rows.isEmpty {
                StateView(error: error) { await load(next: false) }
                    .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16)).listRowBackground(Color.clear)
            }
            if rows.isEmpty && !loading && error == nil && searchNote == nil { ContentUnavailableView("Không có đơn", systemImage: "tray", description: Text("Không có đơn nào khớp bộ lọc này.")) }
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
        #if DEBUG
        // Lượt tự xem MEGATECH_TOUR=chamso ghi bộ lọc của danh sách vừa mở (không có tên, SĐT, mã người).
        .onAppear { DebugTour.listOpened(query, note: confirmedNote) }
        #endif
    }

    @MainActor private func load(next: Bool) async {
        var q = active
        let input = SearchText.parse(search)
        // Danh sách không lọc ngày (mở từ ô tìm SĐT, mã đơn): chỉ gửi khi ô có SĐT, hoặc mã đơn khi máy chủ đã tra mã theo khóa chính
        // (SearchText.codesByKey). Ô trống, tên khách hay mã đơn (máy chủ chưa tra theo khóa chính) mà không lọc ngày là máy chủ đọc
        // cả bảng đơn (kế hoạch 1.5), nên không gửi.
        let datelessOK = input.term.map({ $0.kind == .phone || ($0.kind == .code && SearchText.codesByKey) }) ?? false
        if !q.hasDates, !datelessOK {
            rows = []; hasMore = false; error = nil
            searchNote = SearchText.codesByKey
                ? "Danh sách này không lọc ngày: chỉ tìm được SĐT đủ 9–11 số hoặc mã đơn."
                : "Danh sách này không lọc ngày: chỉ tìm được SĐT đủ 9–11 số."
            return
        }
        searchNote = nil
        // SĐT chuẩn hóa về 0…, mã đơn bỏ "#", chữ khác bỏ "%" và "_".
        q.q = input.term?.value ?? SearchText.clean(search)
        loading = true; defer { loading = false }
        let p = next ? page + 1 : 1
        let trace: SearchTrace? = q.q.isEmpty ? nil : SearchTrace("danh-sach", kind: input.term?.kind)
        do {
            let r = try await API.orders(q, page: p)
            rows = next ? rows + r.orders : r.orders
            page = r.page; hasMore = r.hasMore; error = nil
            trace?.end(r.orders.isEmpty ? .empty : .found)
        } catch {
            // Bị hủy (đổi bộ lọc, rời trang): không báo lỗi.
            if let text = q.q.isEmpty ? LoadError.text(error) : SearchError.text(error) { self.error = text; trace?.end(.failed) }
            else { trace?.end(.cancelled) }
        }
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
    static func tint(code: Int?) -> Color {
        switch code ?? -1 {
        case 3, 16: return Palette.stDel
        case 2: return Palette.stShip
        case 4, 5, 15: return Palette.stRet
        case 6, 7: return Palette.stCan
        case 0, 17: return Palette.stNew
        default: return Palette.stConf
        }
    }
    static func bg(code: Int?) -> Color {
        switch code ?? -1 {
        case 3, 16: return Palette.stDelBg
        case 2: return Palette.stShipBg
        case 4, 5, 15: return Palette.stRetBg
        case 6, 7: return Palette.stCanBg
        case 0, 17: return Palette.stNewBg
        default: return Palette.stConfBg
        }
    }
    var body: some View { StatusPill(name: name, code: code) }
}

struct StatusPill: View {
    let name: String
    let code: Int?
    var body: some View {
        Text(name).font(.caption.weight(.bold)).foregroundStyle(StatusChip.tint(code: code))
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(StatusChip.tint(code: code).opacity(0.16), in: .capsule)
    }
}
/// Đích điều hướng dùng chung: một đơn, một khách, một danh sách đơn. Lưu được để mở lại (Codable, NavMemory.swift), trừ trang
/// một đơn, một khách, một nhân sự (Route.restorable).
enum Route: Hashable {
    case order(String)
    case customer(posId: String, phone: String)
    /// Hồ sơ khách mở sẵn một từ khóa tìm (tên khách, từ "Tìm trong Hồ sơ khách" ở ô tìm tab Đơn hàng). Không lưu để mở lại.
    case customerSearch(String)
    case orders(OrderQuery)
    case staffOrders(StaffOrderQuery)
    case staffDetail(StaffDetailQuery)
    case web(WebPage)
    case calls(team: String)
    case compare(team: String)
    case overview
    /// Tổng quan POS với khối "Số tham chiếu Pancake" lên đầu (chạm số Doanh thu hôm nay ở Trang chủ).
    case overviewRef
    case overviewPos(String)
    case alerts
    /// Trang Thông báo cuộn tới khối "Đồng bộ Pancake" (chạm ô trạng thái đồng bộ ở thanh đầu).
    case alertsSync
    case page(String)
    /// Web vệ tinh (id theo /api/app/modules, ví dụ "hr") và hồ sơ một nhân sự trong phần Nhân sự.
    case satellite(String)
    case hrPerson(String)
    /// Chi tiết một bộ phận. Mở từ bảng ở Tổng quan thì kỳ và POS đang xem đi theo (bấm số nào ra đúng số đó);
    /// period nil (mở từ Phòng ban, lối tắt) = trang tự chọn kỳ mặc định. page: trang con mở sẵn, rỗng = trang đầu.
    case dept(CompanyDept, period: Period? = nil, pos: String = "", product: String = "all", page: String = "")
    /// Phòng Nhân sự mở sẵn một trang con (overview, list, org, approvals, recruit).
    case hr(String)
}

extension View {
    /// Gắn vào NavigationStack để mọi màn con mở được đơn / khách / danh sách.
    func appRoutes() -> some View {
        navigationDestination(for: Route.self) { r in
            switch r {
            case .order(let id): OrderDetailView(id: id)
            case .customer(let posId, let phone): CustomerDetailView(posId: posId, phone: phone)
            case .customerSearch(let term): CustomerSearchView(initial: term)
            case .orders(let q): OrderListView(query: q)
            case .staffOrders(let q): StaffOrdersView(query: q)
            case .staffDetail(let q): StaffDetailView(query: q)
            case .web(let p): PageDestination(p: p)
            case .overview: OverviewView().hrNotice(dept: "Tất cả")
            case .overviewRef: OverviewView(refFirst: true).hrNotice(dept: "Tất cả")
            case .overviewPos(let id): OverviewView(initialPos: id).hrNotice(dept: "Tất cả")
            case .alerts: AlertsPage().hrNotice(dept: "Tất cả")
            case .alertsSync: AlertsPage(focusSync: true).hrNotice(dept: "Tất cả")
            case .page(let id): PageDestination(p: ALL_PAGES.first { $0.id == id } ?? WebPage(id: id, title: id, icon: "square", path: "/?view=\(id)"))
            case .calls(let t): CallsView(team: t).hrNotice(dept: t == "sale" ? "Sale" : t == "cskh" ? "CSKH" : "Tất cả")
            case .compare(let t): CompareView(team: t)
            case .satellite(let id): SatelliteDestination(id: id)
            case .hrPerson(let id): PersonView(id: id)
            case .dept(let d, let period, let pos, let product, let page): DeptDestination(dept: d, period: period, pos: pos, product: product, page: page)
            case .hr(let page): HRHome(initial: page)
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
                                KpiCard(icon: "ic_m_orders", tint: .good, label: "Đơn tạo / chốt", value: "\(Fmt.int(s.orders)) / \(Fmt.int(s.closedOrders))")
                                KpiCard(icon: "checkmark.seal.fill", tint: .good, label: "Mua thành công", value: Fmt.int(s.successOrders))
                                KpiCard(icon: "ic_m_aov", tint: .teal, label: "Giá trị TB đơn", value: Fmt.shortMoney(s.averageOrder ?? 0))
                                KpiCard(icon: "ic_m_returned", tint: .orange, label: "Hoàn / hủy", value: "\(Fmt.int(s.returnedOrders)) / \(Fmt.int(s.cancelledOrders))")
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
                        VStack(alignment: .trailing, spacing: 3) { Text(Fmt.vnd(o.net)).font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink); Tag(text: o.statusName, tint: StatusChip.tint(code: o.statusCode)) }
                    }.padding(.vertical, 6).contentShape(.rect)
                }.buttonStyle(.plain)
            }
        }
    }
}

/// Tìm khách theo SĐT / tên trên mọi POS → hồ sơ (mục Thêm; "Tìm trong Hồ sơ khách" ở ô tìm tab Đơn hàng). Tìm trong bảng khách
/// (/api/reports/customers, cần quyền xem khách), không quét bảng đơn như bản 0.9 (kế hoạch 1.5). SĐT chỉ gửi khi đủ 9–11 số, tên
/// từ 3 chữ cái; chờ ngừng gõ khoảng 0,55 giây mới gửi, gõ tiếp thì hủy lượt cũ; "không thấy" chỉ hiện sau khi đã tìm xong thật.
struct CustomerSearchView: View {
    @State private var q: String
    @State private var pos = ""
    @State private var found = SearchState<API.CustomerRow>()
    @State private var runner = SearchRunner()
    @State private var started = false
    /// initial: từ khóa mở sẵn (tìm ngay khi mở trang).
    init(initial: String = "") { _q = State(initialValue: initial) }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                PageTitle(title: "Hồ sơ khách hàng", subtitle: "Tìm theo số điện thoại hoặc tên", icon: "person.text.rectangle.fill")
                HStack(spacing: 8) {
                    SearchField(prompt: "Tìm theo số điện thoại hoặc tên khách hàng", text: $q) { scheduleSearch(delay: .zero) }
                    Menu { Button("Tất cả POS") { pos = "" }; ForEach(PosBreakdown.order, id: \.self) { id in Button(PosBreakdown.names[id] ?? id) { pos = id } } } label: { Image(systemName: "line.3.horizontal.decrease").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.ink).frame(width: 40, height: 40).background(Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.08))) }
                }
                if !pos.isEmpty { Tag(text: "Chỉ tìm trong \(PosBreakdown.names[pos] ?? pos)", tone: .blue) }
                results
            }.padding(16)
        }
        .navigationTitle("Hồ sơ khách hàng").navigationBarTitleDisplayMode(.inline).brandNav()
        .onChange(of: q) { _, _ in scheduleSearch(delay: SearchRunner.pause) }
        .onChange(of: pos) { _, _ in scheduleSearch(delay: .zero, force: true) }
        .onAppear {
            guard !started else { return }
            started = true
            if !q.isEmpty { scheduleSearch(delay: .zero) }
        }
    }

    @ViewBuilder private var results: some View {
        switch found.input {
        case .empty:
            EmptyView()
        case .incomplete:
            Label("Gõ SĐT đủ 9–11 số hoặc tên khách từ 3 chữ cái.", systemImage: "info.circle")
                .font(.system(size: 11, weight: .medium)).foregroundStyle(Color.inkSoft)
        case .term(let t):
            if found.loading { ThinkingLoader(captions: ["Đang tìm khách…", "Đang đối chiếu 6 POS…", "Sắp xong…"]) }
            else if let e = found.error { StateView(error: e, compact: true) { await retry() } }
            else if found.done {
                if found.rows.isEmpty {
                    Panel {
                        Text(t.kind == .name && SearchText.isPlain(t.value)
                             ? "Không thấy khách khớp. Máy chủ chưa tìm được tên không dấu, thử gõ có dấu (ví dụ Hòa)."
                             : "Không thấy khách khớp.")
                            .font(.system(size: 12)).foregroundStyle(Color.inkSoft)
                    }
                } else {
                    Text(countLine).font(.system(size: 11, weight: .medium)).foregroundStyle(Color.inkSoft)
                    VStack(spacing: 10) {
                        ForEach(found.rows) { r in
                            NavigationLink(value: Route.customer(posId: r.posId, phone: r.phone)) {
                                HStack(spacing: 10) { Avatar(name: r.name ?? "K", size: 40); VStack(alignment: .leading, spacing: 2) { Text(r.name ?? "Khách").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink); Text("\(r.phone) · \(r.posName)").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }; Spacer(); Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft) }
                                    .padding(12).background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                            }.buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }
    /// "3 khách khớp · tất cả POS" / "Hiện 20 / 57 khách khớp · POS …".
    private var countLine: String {
        let n = found.rows.count
        let scope = pos.isEmpty ? "tất cả POS" : "POS \(PosBreakdown.names[pos] ?? pos)"
        if let total = found.total, Int(total) > n { return "Hiện \(n) / \(Fmt.int(total)) khách khớp · \(scope)" }
        return "\(n) khách khớp · \(scope)"
    }

    /// Chữ trong ô đổi: đủ dạng thì chờ ngừng gõ rồi tìm; chưa đủ thì hủy lượt đang chờ và chỉ hiện gợi ý.
    /// force: đổi POS / Thử lại (tìm lại dù từ khóa không đổi).
    private func scheduleSearch(delay: Duration, force: Bool = false) {
        let input = SearchText.parse(q, codes: false)
        guard let t = input.term else { runner.cancel(); found.reset(input); return }
        if !force && found.covers(t) { runner.cancelPending(); return }
        runner.run(after: delay) { await runSearch(t) }
    }
    @MainActor private func retry() async { scheduleSearch(delay: .zero, force: true) }
    @MainActor private func runSearch(_ t: SearchTerm) async {
        found.begin(t)
        let trace = SearchTrace("ho-so-khach", kind: t.kind)
        do {
            let r = try await API.customerSearch(t.value, posIds: pos.isEmpty ? [] : [pos])
            guard !Task.isCancelled, found.term == t else { trace.end(.cancelled); return }
            found.finish(r.customers, hasMore: r.hasMore, total: r.total)
            trace.end(r.customers.isEmpty ? .empty : .found)
        } catch {
            guard !Task.isCancelled, found.term == t else { trace.end(.cancelled); return }
            found.fail(SearchError.text(error, forbidden: "Tài khoản chưa có quyền xem khách") ?? "Không tải được")
            trace.end(.failed)
        }
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
                start = VNDate.date(query.start) ?? .now; end = VNDate.date(query.end) ?? .now
            }
        }
        .presentationDetents([.medium, .large])
    }
}
