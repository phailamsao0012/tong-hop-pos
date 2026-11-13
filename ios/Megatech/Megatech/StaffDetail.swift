import SwiftUI

struct StaffDetailQuery: Hashable {
    let period: Period
    let pos: String; let team: String; let product: String; let hrTeam: String?
    let sellerId: String; let name: String; let department: String
    static func of(_ e: API.EmployeeRow, in f: OrderFilters, period: Period, hrTeam: String?) -> Self {
        .init(period: period, pos: f.pos, team: f.team, product: f.product, hrTeam: hrTeam,
              sellerId: e.sellerId, name: e.name ?? StaffDetailTerms.employee, department: e.department ?? "")
    }
    var filters: OrderFilters { .init(period: period, pos: pos, team: team, product: product) }
    var path: String {
        let r = period.range
        return "/api/reports/staff-detail?start=\(r.0)&end=\(r.1)&posIds=\(API.queryValue(pos))&team=\(API.queryValue(team))&productSegment=\(API.queryValue(product))&sellerId=\(API.queryValue(sellerId))" + HrUnit.suffix(hrTeam)
    }
    func orders(_ basis: String, title: String, group: String = "") -> OrderQuery {
        .from(filters, group: group, basis: basis, sellerId: sellerId, title: title)
    }
    var closedOrders: OrderQuery { orders("confirmed", title: name, group: "closed") }
}

extension API {
    struct StaffDetailReport: Decodable {
        struct Person: Decodable { let sellerId: String; let name: String?; let department: String? }
        struct Summary: Decodable {
            let orders: Double; let closedOrders: Double; let closedNet: Double
            let averageOrder: Double?; let assignedOrders: Double?; let assignedHidden: Bool?
            let rate: Double?; let rateTop: Double?; let rateDen: Double?
            let createdPhones: Double?; let assignedPhones: Double?
        }
        struct Base: Decodable { let kind: String; let total: Double; let closed: Double; let open: Double }
        struct Status: Decodable { let key: String; let label: String; let n: Double; let closed: Bool }
        struct Reason: Decodable {
            struct Counts: Decodable { let new: Double; let cancelled: Double }
            let reason: String; let kind: String; let n: Double; let byStatus: Counts
        }
        struct Tag: Decodable { let tag: String; let n: Double }
        struct Order: Decodable, Identifiable {
            struct Note: Decodable { let text: String?; let by: String?; let at: String }
            let id: String; let orderId: String; let posId: String; let posName: String?
            let phone: String?; let at: String; let statusCode: Int; let statusName: String
            let group: String?; let reason: String; let reasonKind: String; let tags: [String]
            let note: String?; let customerNote: Note?; let marketerName: String?; let net: Double
        }
        let person: Person; let rateBase: String; let assignedVisible: Bool
        let summary: Summary?; let previousSummary: Summary?; let base: Base
        let statuses: [Status]; let reasons: [Reason]; let reasonsPartial: Bool
        let otherTags: [Tag]?; let orders: [Order]; let hasMore: Bool; let definitions: [String: String]
    }
}

struct StaffDetailView: View {
    @Environment(AuthModel.self) private var auth
    @State private var profile: API.StaffProfileReport?
    @State private var profileError: String?
    @State private var profileMissing = false
    @State private var profileLoading = false
    #if DEBUG
    @Environment(AppNav.self) private var tourNav: AppNav?
    #endif
    @Environment(AppNav.self) private var nav: AppNav?
    /// Bộ lọc mở sẵn (kỳ, POS từ trang vừa bấm); đổi được ở pill lọc (khung 10).
    let opened: StaffDetailQuery
    @State private var period: Period
    @State private var pos: String
    init(query: StaffDetailQuery) {
        opened = query
        _period = State(initialValue: query.period)
        _pos = State(initialValue: query.pos)
    }
    /// Bộ lọc đang xem (đổi kỳ / POS ở pill thì tải lại).
    private var query: StaffDetailQuery {
        StaffDetailQuery(period: period, pos: pos, team: opened.team, product: opened.product, hrTeam: opened.hrTeam,
                         sellerId: opened.sellerId, name: opened.name, department: opened.department)
    }
    private var teamLabel: String { opened.team == "cskh" ? "CSKH" : opened.team == "sale" ? "Sale" : (opened.department.isEmpty ? "Nhân viên" : opened.department) }
    private var isSale: Bool { opened.team == "sale" || opened.department.lowercased() == "sale" }
    @State private var loadedFor: StaffDetailQuery?
    @AppStorage("thp_hide_money") private var hideMoney = false
    @State private var data: API.StaffDetailReport?
    @State private var loading = false
    @State private var error: String?
    @State private var missing = false
    @State private var reason: String?
    @State private var status: String?
    private var visible: [API.StaffDetailReport.Order] {
        (data?.orders ?? []).filter { (reason == nil || $0.reason == reason) && (status == nil || $0.group == status) }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MT.cardGap) {
                // Khung 10: "‹ Phòng ban · Sale", tiêu đề "Tên · Sale", nút mắt, pill lọc.
                ChildHeader(title: "\(opened.name) · \(teamLabel)", parent: "\(nav?.tab.crumb ?? "Quay lại") · \(teamLabel)")
                ScopeFilterPill(period: $period, pos: $pos, fixedProduct: opened.product)
                if let data { content(data) }
                else if loading { StateView(loading: StaffDetailTerms.loading) }
                if let error { StateView(error: error, retry: { await load() }) }
                if missing { NavigationLink(StaffDetailTerms.fallback, value: Route.orders(query.closedOrders)) }
                if auth.me?.role == "owner" { profileContent }
            }.padding(.horizontal, MT.gutter).padding(.top, 8).padding(.bottom, 24)
        }
        .background(Color.cream).navigationTitle(opened.name).brandNav()
        .childChrome()
        .task(id: query) { await load() }.refreshable { await load() }
        .task(id: query) { if auth.me?.role == "owner" { await loadProfile() } }
        #if DEBUG
        .modifier(MktNvScroll())
        .onChange(of: DebugTap.shared.tick) { _, _ in
            guard MktNvTour.active, let data else { return }
            switch DebugTap.shared.target {
            case "nv-trang-thai", "nv-ly-do":
                DebugTap.shared.tap("cuon:" + (DebugTap.shared.target == "nv-trang-thai" ? "nv-status" : "nv-reasons"))
            case "nv-loc":
                guard let first = data.reasons.first else { MktNvTour.failed = true; return }
                status = nil; reason = first.reason
                Task { @MainActor in
                    await Task.yield()
                    print("[NV] loc ly-do=1 hien=\(visible.count)")
                    print("[NV] ds hien=\(visible.count) con=\(data.hasMore ? 1 : 0)")
                    DebugTap.shared.tap("cuon:nv-orders"); MktNvTour.done = true
                }
                return
            case "nv-don":
                guard let first = visible.first else { MktNvTour.failed = true; return }
                tourNav?.deptsPath.append(.order(first.id))
            default: return
            }
            MktNvTour.done = true
        }
        #endif
    }
    private func color(_ kind: String) -> Color { kind == "tag" ? Palette.warn : kind == "note" ? Palette.accent : Palette.muted }
    @ViewBuilder private var profileContent: some View {
        if let profile {
            Panel {
                Text("Hành trình làm việc").mtFont(.cardHeader)
                if let t = profile.tenure {
                    Text("T" + Fmt.int(Double(t.t))).mtFont(.cardMetric).foregroundStyle(Palette.good)
                }
                milestone("Ngày vào", profile.tenure?.joined)
                milestone("Tài khoản POS", profile.posCreated)
                milestone("Đơn đầu", profile.firstOrderDay)
                if let definition = profile.definitions["joined"] { Text(definition).mtFont(.caption).foregroundStyle(Palette.muted) }
            }
            if !profile.badges.isEmpty {
                Panel {
                    Text("Huy hiệu").mtFont(.cardHeader)
                    Text("Huy hiệu tính trên mọi POS").mtFont(.caption).foregroundStyle(Palette.muted)
                    ForEach(profile.badges) { badge in
                        Label {
                            VStack(alignment: .leading, spacing: MT.cellGap) {
                                Text(badge.label).mtFont(.cardHeader)
                                Text(badge.note).mtFont(.caption)
                            }
                        } icon: { Image(systemName: "medal.fill").foregroundStyle(Palette.warn) }
                        .frame(maxWidth: .infinity, alignment: .leading).padding(MT.cellGap).tileSurface()
                    }
                }
            }
        } else if profileMissing {
            StateView(empty: "Chưa có trên máy chủ")
        } else if let profileError {
            StateView(error: profileError) { await loadProfile() }
        } else if profileLoading { StateView(loading: "Đang tải hành trình làm việc…") }
    }
    private func milestone(_ title: String, _ day: String?) -> some View {
        HStack(alignment: .top, spacing: MT.cellGap) {
            Image(systemName: "circle.inset.filled").foregroundStyle(Palette.accent)
            Text(title).mtFont(.body)
            Spacer()
            Text(day.map(Fmt.day) ?? "—").mtFont(.body).monospacedDigit()
        }.padding(.vertical, MT.cellGap).accessibilityElement(children: .combine)
    }
    @MainActor private func loadProfile() async {
        profile = nil; profileError = nil; profileMissing = false; profileLoading = true
        defer { profileLoading = false }
        do {
            let result = try await API.staffProfile(id: query.sellerId, pos: query.pos)
            try Task.checkCancellation()
            profile = result
        } catch {
            guard !Task.isCancelled else { return }
            profileMissing = (error as? API.APIError)?.status == 404
            if !profileMissing { profileError = LoadError.text(error) }
        }
    }
    private func statusColor(_ key: String) -> Color {
        StatusChip.tint(code: ["new": 0, "confirmed": 1, "shipping": 2, "delivered": 3, "returned": 4, "cancelled": 6][key])
    }
    @ViewBuilder private func content(_ d: API.StaffDetailReport) -> some View {
        summary(d)
        statusCard(d)
            #if DEBUG
            .id("nv-status")
            #endif
        reasonsCard(d)
            #if DEBUG
            .id("nv-reasons")
            #endif
    }
    /// "Trạng thái đơn chia (Chưa chốt)" (khung 10): thanh màu các trạng thái chưa chốt, ô từng trạng thái (Mới, Hủy chạm để lọc).
    private func statusCard(_ d: API.StaffDetailReport) -> some View {
        let open = d.statuses.filter { !$0.closed }
        let openTotal = max(1, open.reduce(0) { $0 + $1.n })
        return VStack(alignment: .leading, spacing: MT.cellGap) {
            HStack(alignment: .firstTextBaseline) {
                Text((d.base.kind == "assigned" ? StaffDetailTerms.assignedStatus : StaffDetailTerms.createdStatus) + " (Chưa chốt)")
                    .mtFont(.cardHeader).foregroundStyle(Palette.ink)
                Spacer(minLength: 6)
                Text("Chưa chốt · \(Fmt.int(d.base.open)) đơn").mtFont(.caption).fontWeight(.semibold).foregroundStyle(Palette.accent)
            }
            GeometryReader { g in
                HStack(spacing: 2) {
                    ForEach(open, id: \.key) { s in statusColor(s.key).frame(width: max(0, g.size.width * s.n / openTotal - 2)) }
                }
            }
            .frame(height: 8).clipShape(.capsule)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: MT.cellGap), GridItem(.flexible(), spacing: MT.cellGap)], spacing: MT.cellGap) {
                ForEach(open, id: \.key) { s in statusTile(s) }
            }
            Text(StaffDetailTerms.base(d.base)).mtFont(.caption).foregroundStyle(Palette.muted)
            if let text = d.definitions["closed"], !text.isEmpty { Text(text).mtFont(.caption).foregroundStyle(Palette.muted) }
        }
        .padding(MT.cardPad).frame(maxWidth: .infinity, alignment: .leading).cardSurface()
    }
    private func statusTile(_ s: API.StaffDetailReport.Status) -> some View {
        let tappable = s.key == "new" || s.key == "cancelled"
        let on = status == s.key
        return Button { if tappable { status = on ? nil : s.key } } label: {
            VStack(spacing: 2) {
                Text(s.label).mtFont(.caption).foregroundStyle(Palette.muted)
                Text("\(Fmt.int(s.n)) đơn").mtFont(.body).fontWeight(.bold).foregroundStyle(Palette.ink)
            }
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(Palette.wash, in: .rect(cornerRadius: MT.rCell))
            .overlay { RoundedRectangle(cornerRadius: MT.rCell).strokeBorder(on ? Palette.accent : Palette.line, lineWidth: on ? 2 : 1) }
            .contentShape(.rect)
        }
        .buttonStyle(.plain).disabled(!tappable)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
    /// "Lý do chưa chốt": hàng lý do kèm số Mới / Hủy (chạm để lọc), thẻ khác trên đơn, rồi các đơn chưa chốt.
    private func reasonsCard(_ d: API.StaffDetailReport) -> some View {
        VStack(alignment: .leading, spacing: MT.cellGap) {
            Text(StaffDetailTerms.reasons(d.base.open)).mtFont(.cardHeader).foregroundStyle(Palette.ink)
            if d.base.open == 0 { Text(StaffDetailTerms.noOpen).mtFont(.caption).foregroundStyle(Palette.muted) }
            ForEach(d.reasons, id: \.reason) { r in
                Button { reason = reason == r.reason ? nil : r.reason } label: {
                    HStack(spacing: 6) {
                        Circle().fill(color(r.kind)).frame(width: 7, height: 7)
                        Text(r.reason).mtFont(.body).fontWeight(.semibold).foregroundStyle(Palette.ink).lineLimit(2)
                        Spacer(minLength: 6)
                        Text(StaffDetailTerms.counts(r.byStatus)).mtFont(.caption).fontWeight(.bold).foregroundStyle(Palette.ink)
                        if reason == r.reason { Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.accent) }
                    }
                    .padding(10).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .background(Palette.wash, in: .rect(cornerRadius: MT.rCell)).contentShape(.rect)
                }.buttonStyle(.plain)
            }
            if let tags = d.otherTags, !tags.isEmpty {
                HStack(alignment: .top, spacing: 6) {
                    Text(StaffDetailTerms.otherTags).mtFont(.body).fontWeight(.semibold).foregroundStyle(Palette.ink)
                    Spacer(minLength: 6)
                    Text(tags.map { "\($0.tag) · \(Fmt.int($0.n))" }.joined(separator: ", ")).mtFont(.caption).fontWeight(.bold)
                        .foregroundStyle(Palette.ink).multilineTextAlignment(.trailing)
                }
                .padding(10).background(Palette.wash, in: .rect(cornerRadius: MT.rCell))
            }
            if d.reasonsPartial { Text(StaffDetailTerms.partial).mtFont(.caption).foregroundStyle(Palette.muted) }
            if let text = d.definitions["reasons"], !text.isEmpty { Text(text).mtFont(.caption).foregroundStyle(Palette.muted) }
            if let text = d.definitions["productFilter"] { Text(text).mtFont(.caption).foregroundStyle(Palette.muted) }
            if let reason { Button(StaffDetailTerms.filter(reason)) { self.reason = nil }.mtFont(.caption) }
            if let status { Button(StaffDetailTerms.filter(d.statuses.first { $0.key == status }?.label ?? status)) { self.status = nil }.mtFont(.caption) }
            Text(StaffDetailTerms.openOrders).mtFont(.body).fontWeight(.bold).foregroundStyle(Palette.ink)
                #if DEBUG
                .id("nv-orders")
                #endif
            ForEach(visible) { o in orderRow(o) }
            if d.hasMore { Text(StaffDetailTerms.more(d.orders.count, d.base.open)).mtFont(.caption).foregroundStyle(Palette.muted) }
        }
        .padding(MT.cardPad).frame(maxWidth: .infinity, alignment: .leading).cardSurface()
    }
    /// Một đơn chưa chốt (khung 10): "Đơn #mã · trạng thái" / "POS · marketer · giờ · lý do", tiền và ›; ghi chú bên dưới nếu có.
    private func orderRow(_ o: API.StaffDetailReport.Order) -> some View {
        let line2 = [o.posName ?? PosBreakdown.short[o.posId] ?? o.posId, o.marketerName, Fmt.dateTime(o.at), o.reason].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        return NavigationLink(value: Route.order(o.id)) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text("Đơn #\(o.orderId) · \(o.statusName)").mtFont(.body).fontWeight(.semibold).foregroundStyle(Palette.ink).lineLimit(1)
                    Spacer(minLength: 6)
                    Text(hideMoney ? "••• tr ₫" : Fmt.shortVnd(o.net)).mtFont(.body).fontWeight(.bold).foregroundStyle(Palette.ink)
                    Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Palette.muted)
                }
                Text(line2).mtFont(.caption).foregroundStyle(Palette.muted).lineLimit(2)
                if !o.tags.isEmpty { Text(StaffDetailTerms.tags + o.tags.joined(separator: ", ")).mtFont(.caption).foregroundStyle(Palette.muted) }
                if let note = o.note, !note.isEmpty { Text(StaffDetailTerms.orderNote + note).mtFont(.caption).foregroundStyle(Palette.muted) }
                if let note = o.customerNote, let text = StaffDetailTerms.customerNote(note) { Text(text).mtFont(.caption).foregroundStyle(Palette.muted) }
            }
            .padding(10).frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.wash, in: .rect(cornerRadius: MT.rCell)).contentShape(.rect)
            .accessibilityElement(children: .combine)
        }.buttonStyle(.plain)
    }
    private func rateDelta(_ now: Double?, _ previous: Double?) -> String? {
        guard let now, let previous else { return nil }
        return Fmt.points(now - previous)
    }
    private func number(_ n: Double?) -> String { n.map(Fmt.int) ?? "—" }
    /// Thẻ "TỶ LỆ CHỐT" (khung 10): badge tỷ lệ bên trái (Sale dưới 40% đỏ ▼), "Doanh thu chốt" bên phải, nút đầy "Xem đơn chốt (N) ›";
    /// ô Đơn chia, Đơn tạo giữ phía dưới (chạm mở danh sách như trước).
    private func summary(_ d: API.StaffDetailReport) -> some View {
        let s = d.summary, p = d.previousSummary
        return VStack(alignment: .leading, spacing: MT.cellGap) {
            HStack(alignment: .top, spacing: MT.cellGap) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("TỶ LỆ CHỐT").mtFont(.caption).fontWeight(.bold).foregroundStyle(Palette.muted)
                    if isSale { MTRateBadge(rate: s?.rate, kind: .saleClose) }
                    else { Text(Fmt.pct(s?.rate)).mtFont(.cardMetric).foregroundStyle(Palette.ink) }
                    Text(StaffDetailTerms.fraction(s?.rateTop, s?.rateDen, assigned: d.rateBase == "assigned")).mtFont(.caption).foregroundStyle(Palette.muted)
                    if let delta = rateDelta(s?.rate, p?.rate) { Text("So kỳ trước \(delta)").mtFont(.caption).foregroundStyle(Palette.muted) }
                }
                Spacer(minLength: 6)
                VStack(alignment: .trailing, spacing: 4) {
                    Text(StaffDetailTerms.revenue).mtFont(.caption).foregroundStyle(Palette.muted)
                    Text(s.map { hideMoney ? "••• tr ₫" : Fmt.shortVnd($0.closedNet) } ?? "—").mtFont(.heroNumber).foregroundStyle(Palette.ink)
                        .lineLimit(1).minimumScaleFactor(0.6)
                    Text(StaffDetailTerms.aov + (s?.averageOrder.map(Fmt.short) ?? "—") + " · " + StaffDetailTerms.phones(s?.assignedPhones))
                        .mtFont(.caption).foregroundStyle(Palette.muted).multilineTextAlignment(.trailing)
                }
            }
            NavigationLink(value: Route.orders(query.closedOrders)) {
                HStack(spacing: 4) { Text("Xem đơn chốt (\(number(s?.closedOrders)))"); Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)) }
                    .mtFont(.body).fontWeight(.bold).foregroundStyle(Color.white)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(Palette.mtBrandPrimary, in: .rect(cornerRadius: MT.rCell))
            }.buttonStyle(MTPressStyle())
            HStack(alignment: .top, spacing: MT.cellGap) {
                if s?.assignedHidden == true {
                    BoardCell(label: StaffDetailTerms.assigned, value: "—", note: StaffDetailTerms.hidden)
                } else {
                    NavigationLink(value: Route.orders(query.orders("assigned", title: StaffDetailTerms.assignedOrders))) {
                        BoardCell(label: StaffDetailTerms.assigned, value: number(s?.assignedOrders), note: StaffDetailTerms.phones(s?.assignedPhones))
                    }.buttonStyle(.plain)
                }
                NavigationLink(value: Route.orders(query.orders("created", title: StaffDetailTerms.created))) {
                    BoardCell(label: StaffDetailTerms.created, value: number(s?.orders), note: StaffDetailTerms.phones(s?.createdPhones))
                }.buttonStyle(.plain)
            }
        }
        .heroSurface()
    }
    @MainActor private func load() async {
        // Đổi kỳ / POS ở pill: lượt mới luôn chạy; lượt cũ về sau (bộ lọc khác) không ghi đè.
        let asked = query
        if data != nil, loadedFor != asked { data = nil }
        loading = true; error = nil; missing = false
        let trace = LoadTrace("nhan-vien-chi-tiet", requests: 1)
        defer { if query == asked { loading = false }; trace.end(cancelled: Task.isCancelled) }
        do {
            let result: API.StaffDetailReport = try await trace.run { try await API.request(asked.path) }
            guard !Task.isCancelled, query == asked else { return }
            data = result; loadedFor = asked
            #if DEBUG
            if MktNvTour.active {
                let s = result.summary, b = result.base
                print("[NVQ] path=\(MktNvTour.path(query.path))")
                let assigned = s?.assignedHidden == true ? "an" : MktNvTour.number(s?.assignedOrders)
                print("[NV] tom-tat chot=\(MktNvTour.number(s?.closedOrders)) tao=\(MktNvTour.number(s?.orders)) chia=\(assigned) tl=\(MktNvTour.number(s?.rate)) tu=\(MktNvTour.number(s?.rateTop)) mau=\(MktNvTour.number(s?.rateDen)) base=\(b.kind) tong=\(b.total) da-chot=\(b.closed) chua=\(b.open)")
                print("[NV] ly-do tong=\(result.reasons.reduce(0) { $0 + $1.n }) nhom=\(result.reasons.count) dau=\(result.reasons.prefix(3).map { String($0.n) }.joined(separator: ","))")
                print("[NV] ds hien=\(visible.count) con=\(result.hasMore ? 1 : 0)")
                MktNvTour.staff = true; fflush(stdout)
            }
            #endif
        } catch {
            guard !Task.isCancelled, query == asked else { return }
            missing = (error as? API.APIError)?.status == 404
            data = nil
            self.error = missing ? StaffDetailTerms.missing : error.localizedDescription
            #if DEBUG
            if MktNvTour.active { MktNvTour.failed = true; print("[NV] moc=loi-tai") }
            #endif
        }
    }
}
