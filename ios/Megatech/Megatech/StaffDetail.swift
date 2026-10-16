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
    #if DEBUG
    @Environment(AppNav.self) private var tourNav: AppNav?
    #endif
    let query: StaffDetailQuery
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
            VStack(alignment: .leading, spacing: 16) {
                HStack { Avatar(name: query.name); VStack(alignment: .leading) { Text(query.name).bold(); Text(query.department).font(.caption) } }
                ScopeLine(period: query.period, pos: query.pos, product: query.product)
                if let data { content(data) }
                else if loading { StateView(loading: StaffDetailTerms.loading) }
                if let error { StateView(error: error, retry: { await load() }) }
                if missing { NavigationLink(StaffDetailTerms.fallback, value: Route.orders(query.closedOrders)) }
            }.padding()
        }
        .background(Color.cream).navigationTitle(query.name).brandNav()
        .task { await load() }.refreshable { await load() }
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
    private func color(_ kind: String) -> Color { kind == "tag" ? .orange : kind == "note" ? .blue : .gray }
    private func statusColor(_ key: String) -> Color {
        StatusChip.tint(code: ["new": 0, "confirmed": 1, "shipping": 2, "delivered": 3, "returned": 4, "cancelled": 6][key])
    }
    @ViewBuilder private func content(_ d: API.StaffDetailReport) -> some View {
        summary(d)
        Panel {
            Text(d.base.kind == "assigned" ? StaffDetailTerms.assignedStatus : StaffDetailTerms.createdStatus).bold()
            GeometryReader { g in
                HStack(spacing: 0) {
                    ForEach(d.statuses, id: \.key) { s in
                        statusColor(s.key).frame(width: g.size.width * (d.base.total > 0 ? s.n / d.base.total : 0))
                    }
                }
            }.frame(height: 8)
            ForEach(d.statuses, id: \.key) { s in
                Button { if s.key == "new" || s.key == "cancelled" { status = status == s.key ? nil : s.key } } label: {
                    HStack { Circle().fill(statusColor(s.key)).frame(width: 7, height: 7); Text(s.label); Spacer(); Text(Fmt.int(s.n)).bold(); if status == s.key { Image(systemName: "checkmark") } }
                }.buttonStyle(.plain).disabled(s.key != "new" && s.key != "cancelled")
            }
            Text(StaffDetailTerms.base(d.base)).font(.caption)
            Text(d.definitions["closed"] ?? "").font(.caption).foregroundStyle(.secondary)
        }
        #if DEBUG
        .id("nv-status")
        #endif
        Panel {
            Text(StaffDetailTerms.reasons(d.base.open)).bold()
            if d.base.open == 0 { Text(StaffDetailTerms.noOpen) }
            ForEach(d.reasons, id: \.reason) { r in
                Button { reason = reason == r.reason ? nil : r.reason } label: {
                    VStack(alignment: .leading) {
                        HStack { Circle().fill(color(r.kind)).frame(width: 7, height: 7); Text(r.reason); Spacer(); Text(Fmt.int(r.n)).bold() }
                        Bar(value: d.base.open > 0 ? r.n / d.base.open : 0, tint: color(r.kind), height: 4)
                        Text(StaffDetailTerms.counts(r.byStatus)).font(.caption)
                    }
                }.buttonStyle(.plain)
            }
            if d.reasonsPartial { Text(StaffDetailTerms.partial).font(.caption) }
            Text(d.definitions["reasons"] ?? "").font(.caption).foregroundStyle(.secondary)
            if let text = d.definitions["productFilter"] { Text(text).font(.caption).foregroundStyle(.secondary) }
        }
        #if DEBUG
        .id("nv-reasons")
        #endif
        if let tags = d.otherTags, !tags.isEmpty {
            Panel { Text(StaffDetailTerms.otherTags).bold(); ForEach(tags, id: \.tag) { t in Text("\(t.tag) · \(Fmt.int(t.n))").font(.caption).padding(5).background(Color.gray.opacity(0.1), in: Capsule()) } }
        }
        if let reason { Button(StaffDetailTerms.filter(reason)) { self.reason = nil } }
        if let status { Button(StaffDetailTerms.filter(d.statuses.first { $0.key == status }?.label ?? status)) { self.status = nil } }
        Text(StaffDetailTerms.openOrders).bold()
            #if DEBUG
            .id("nv-orders")
            #endif
        ForEach(visible) { o in
            NavigationLink(value: Route.order(o.id)) {
                Panel {
                    HStack { Text("#" + o.orderId).bold(); PosBadge(id: o.posId); StatusChip(name: o.statusName, code: o.statusCode); Spacer(); Text(Fmt.dateTime(o.at)).font(.caption) }
                    Text(o.reason).font(.caption).padding(5).background(color(o.reasonKind).opacity(0.12), in: Capsule())
                    if !o.tags.isEmpty { Text(StaffDetailTerms.tags + o.tags.joined(separator: ", ")) }
                    if let note = o.note, !note.isEmpty { Text(StaffDetailTerms.orderNote + note) }
                    if let note = o.customerNote, let text = StaffDetailTerms.customerNote(note) { Text(text) }
                    if let phone = o.phone { Text(StaffDetailTerms.phone + phone).font(.caption) }
                }
            }.buttonStyle(.plain)
        }
        if d.hasMore { Text(StaffDetailTerms.more(d.orders.count, d.base.open)).font(.caption) }
    }
    private func rateDelta(_ now: Double?, _ previous: Double?) -> String? {
        guard let now, let previous else { return nil }
        return Fmt.points(now - previous)
    }
    private func number(_ n: Double?) -> String { n.map(Fmt.int) ?? "—" }
    @ViewBuilder private func summary(_ d: API.StaffDetailReport) -> some View {
        let s = d.summary, p = d.previousSummary
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())]) {
            VStack(alignment: .leading) {
                KpiCard(icon: "percent", label: StaffDetailTerms.rate, value: Fmt.pct(s?.rate), delta: rateDelta(s?.rate, p?.rate))
                Text(StaffDetailTerms.fraction(s?.rateTop, s?.rateDen, assigned: d.rateBase == "assigned")).font(.caption)
            }
            NavigationLink(value: Route.orders(query.closedOrders)) {
                VStack(alignment: .leading) {
                    KpiCard(icon: "checkmark", label: StaffDetailTerms.closed, value: number(s?.closedOrders), delta: s.map { Fmt.delta($0.closedOrders, p?.closedOrders) } ?? nil)
                    Text(StaffDetailTerms.closedDate).font(.caption)
                }
            }.buttonStyle(.plain)
            VStack(alignment: .leading) {
                KpiCard(icon: "banknote", label: StaffDetailTerms.revenue, value: s.map { Fmt.vnd($0.closedNet) } ?? "—", delta: s.map { Fmt.delta($0.closedNet, p?.closedNet) } ?? nil)
                Text(StaffDetailTerms.aov + (s?.averageOrder.map(Fmt.short) ?? "—")).font(.caption)
            }
            if s?.assignedHidden == true {
                VStack(alignment: .leading) {
                    KpiCard(icon: "person", label: StaffDetailTerms.assigned, value: "—")
                    Text(StaffDetailTerms.hidden).font(.caption)
                }
            } else {
                NavigationLink(value: Route.orders(query.orders("assigned", title: StaffDetailTerms.assignedOrders))) {
                    KpiCard(icon: "person", label: StaffDetailTerms.assigned, value: number(s?.assignedOrders), note: StaffDetailTerms.phones(s?.assignedPhones))
                }.buttonStyle(.plain)
            }
            NavigationLink(value: Route.orders(query.orders("created", title: StaffDetailTerms.created))) {
                KpiCard(icon: "plus", label: StaffDetailTerms.created, value: number(s?.orders), note: StaffDetailTerms.phones(s?.createdPhones))
            }.buttonStyle(.plain)
        }
    }
    @MainActor private func load() async {
        guard !loading else { return }
        loading = true; error = nil; missing = false
        let trace = LoadTrace("nhan-vien-chi-tiet", requests: 1)
        defer { loading = false; trace.end(cancelled: Task.isCancelled) }
        do {
            let result: API.StaffDetailReport = try await trace.run { try await API.request(query.path) }
            guard !Task.isCancelled else { return }
            data = result
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
            guard !Task.isCancelled else { return }
            missing = (error as? API.APIError)?.status == 404
            data = nil
            self.error = missing ? StaffDetailTerms.missing : error.localizedDescription
            #if DEBUG
            if MktNvTour.active { MktNvTour.failed = true; print("[NV] moc=loi-tai") }
            #endif
        }
    }
}
