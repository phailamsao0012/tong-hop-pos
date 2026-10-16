import SwiftUI

extension API {
    /// Only the aggregate fields are decoded; customer orders and filter options are ignored.
    struct MarketingRankRow: Decodable, Identifiable {
        let marketerId: String?
        let marketerName: String?
        let marketingTeamId: String?
        let marketingTeamName: String?
        let marketerCount: Double
        let values: [String: Double]
        var id: String { marketerId ?? marketingTeamId ?? "" }
        var name: String { marketerName ?? marketingTeamName ?? "—" }
        struct Key: CodingKey {
            let stringValue: String
            var intValue: Int? { nil }
            init?(stringValue: String) { self.stringValue = stringValue }
            init?(intValue: Int) { return nil }
        }
        static let fields = ["orders", "phones", "net", "createdOrders", "createdPhones", "confirmedOrders", "confirmationRate", "shippedOrders", "deliveredOrders", "deliveryRate", "returnedOrders", "cancelledOrders", "refundNet", "netAfterRefund", "newOrders", "newNet", "newAfterRefund", "cskhOrders", "cskhNet", "cskhAfterRefund", "averageOrder", "revenuePerPhone"]
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: Key.self)
            func text(_ key: String) throws -> String? { try c.decodeIfPresent(String.self, forKey: Key(stringValue: key)!) }
            marketerId = try text("marketerId"); marketerName = try text("marketerName")
            marketingTeamId = try text("marketingTeamId"); marketingTeamName = try text("marketingTeamName")
            marketerCount = try c.decodeIfPresent(Double.self, forKey: Key(stringValue: "marketerCount")!) ?? 0
            var numbers: [String: Double] = [:]
            for field in Self.fields {
                let value = try c.decodeIfPresent(Double.self, forKey: Key(stringValue: field)!)
                if let value { numbers[field] = value }
                else if field != "confirmationRate" && field != "deliveryRate" { numbers[field] = 0 }
            }
            values = numbers
        }
        func n(_ field: String) -> Double { values[field] ?? 0 }
    }
    struct MarketingRankReport: Decodable {
        let summary: MarketingRankRow
        let byMarketer: [MarketingRankRow]
        let byTeam: [MarketingRankRow]
        let definitions: [String: String]
    }
    static func marketingRankPath(start: String, end: String, pos: String, team: String?) -> String {
        "/api/reports/marketing?start=\(queryValue(start))&end=\(queryValue(end))&posIds=\(queryValue(pos))&basis=confirmed&stage=confirmed&marketingTeamId=\(queryValue(team ?? "__all"))"
    }
}

enum MarketingRankSort: String, CaseIterable {
    case name, team, created, phones, confirmed, rate, orders, net, newNet, cskhNet, refund, afterRefund, perPhone, aov, shipped, delivered, delivery, returned
    var title: String { MarketingRankTerms.sorts[Self.allCases.firstIndex(of: self)!] }
    var field: String {
        switch self {
        case .name, .team: return ""
        case .created: return "createdOrders"
        case .phones: return "createdPhones"
        case .confirmed: return "confirmedOrders"
        case .rate: return "confirmationRate"
        case .orders: return "orders"
        case .net: return "net"
        case .newNet: return "newNet"
        case .cskhNet: return "cskhNet"
        case .refund: return "refundNet"
        case .afterRefund: return "netAfterRefund"
        case .perPhone: return "revenuePerPhone"
        case .aov: return "averageOrder"
        case .shipped: return "shippedOrders"
        case .delivered: return "deliveredOrders"
        case .delivery: return "deliveryRate"
        case .returned: return ""
        }
    }
    var money: Bool { [.net, .newNet, .cskhNet, .refund, .afterRefund, .perPhone, .aov].contains(self) }
    func value(_ row: API.MarketingRankRow) -> Double? {
        self == .returned ? row.n("returnedOrders") + row.n("cancelledOrders") : row.values[field]
    }
    func display(_ row: API.MarketingRankRow, full: Bool = false) -> String {
        if self == .returned { return "\(Fmt.int(row.n("returnedOrders"))) / \(Fmt.int(row.n("cancelledOrders")))" }
        if self == .name { return row.name }
        if self == .team { return row.marketingTeamName ?? "—" }
        if self == .rate || self == .delivery { return Fmt.pct(value(row)) }
        guard let v = value(row) else { return "—" }
        return money ? (full ? Fmt.money(v) : Fmt.short(v)) : Fmt.int(v)
    }
}

struct MarketingRank: View {
    let period: Period
    let pos: String
    let teamId: String?
    let marketerId: String?
    let productFiltered: Bool
    let refresh: Int
    let pick: (String, Bool) -> Void
    @AppStorage("thp_hide_money") private var hideMoney = false
    @State private var team = false
    @State private var sort: MarketingRankSort = .net
    @State private var showAll = false
    @State private var data: API.MarketingRankReport?
    @State private var dataKey = ""
    @State private var error: String?
    @State private var gen = 0
    @State private var selected: API.MarketingRankRow?
    @State private var loading = false
    private var path: String { let r = period.range; return API.marketingRankPath(start: r.0, end: r.1, pos: pos, team: teamId) }
    private var key: String { path + "|\(refresh)" }
    private var effectiveSort: MarketingRankSort { team && sort == .team ? .name : sort }
    private var sortTitle: String { team && effectiveSort == .name ? MarketingRankTerms.teamName : effectiveSort.title }
    private var rows: [API.MarketingRankRow] {
        let input = team ? data?.byTeam : data?.byMarketer
        return (input ?? []).sorted { a, b in
            let s = effectiveSort
            if s == .name || s == .team {
                let an = s == .team ? a.marketingTeamName ?? "" : a.name
                let bn = s == .team ? b.marketingTeamName ?? "" : b.name
                let comparison = an.compare(bn, locale: Locale(identifier: "vi_VN"))
                if comparison != .orderedSame { return comparison == .orderedAscending }
            } else {
                switch (s.value(a), s.value(b)) {
                case let (x?, y?) where x != y: return x > y
                case (_?, nil): return true
                case (nil, _?): return false
                default: break
                }
            }
            if a.n("net") != b.n("net") { return a.n("net") > b.n("net") }
            return a.id < b.id
        }
    }
    var body: some View {
        Panel {
            Text(team ? MarketingRankTerms.teamTitle : MarketingRankTerms.title).font(.headline)
            Text(MarketingRankTerms.subtitle).font(.caption).foregroundStyle(Color.inkSoft)
            if productFiltered { Text(MarketingRankTerms.productNote).font(.caption).foregroundStyle(Color.inkSoft) }
            Segmented(selection: $team, options: [(true, MarketingRankTerms.byTeam), (false, MarketingRankTerms.byPerson)])
            Menu {
                ForEach(MarketingRankSort.allCases.filter { !team || $0 != .team }, id: \.self) { s in
                    Button(team && s == .name ? MarketingRankTerms.teamName : s.title) { sort = s }
                }
            } label: { Text("Xếp theo: \(sortTitle) ▾").font(.subheadline) }
            if let error { StateView(error: error, compact: true) { await load() } }
            if let d = data {
                if rows.isEmpty { Text(MarketingRankTerms.empty).font(.caption).foregroundStyle(Color.inkSoft) }
                ForEach(Array(rows.prefix(showAll ? rows.count : 12).enumerated()), id: \.element.id) { i, row in
                    Button { selected = row } label: { rankRow(row, rank: i + 1) }.buttonStyle(.plain)
                }
                if rows.count > 12 { Button(showAll ? "Thu gọn" : "Xem tất cả \(Fmt.int(Double(rows.count))) dòng") { showAll.toggle() } }
                if effectiveSort != .name && effectiveSort != .team {
                    Text("Tổng đơn duy nhất: \(display(effectiveSort, d.summary))").font(.caption).foregroundStyle(Color.inkSoft)
                }
                DisclosureGroup(MarketingRankTerms.definitions) {
                    ForEach(d.definitions.keys.sorted(), id: \.self) { key in
                        Text("\(key): \(d.definitions[key] ?? "")").font(.caption).frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            } else if error == nil { Skeleton(height: 160) }
        }
        .environment(\.thinking, loading)
        .task(id: key) { await load() }
        .onChange(of: team) { showAll = false }
        .sheet(item: $selected) { row in detail(row) }
        #if DEBUG
        .id("mkt-hang")
        .onChange(of: DebugTap.shared.tick) { _, _ in
            guard MktNvTour.active else { return }
            switch DebugTap.shared.target {
            case "mkt-hang":
                guard data != nil, !loading else { return }
                sort = .net; DebugTap.shared.tap("cuon:mkt-hang")
            case "mkt-hang-tl": sort = .rate
            case "mkt-hang-team": team = true
            case "mkt-hang-chi-tiet":
                team = false
                guard let row = data?.byMarketer.sorted(by: { a, b in
                    let av = a.values["confirmationRate"], bv = b.values["confirmationRate"]
                    if av != bv { return (av ?? -.infinity) > (bv ?? -.infinity) }
                    if a.n("net") != b.n("net") { return a.n("net") > b.n("net") }
                    return a.id < b.id
                }).first else { MktNvTour.failed = true; return }
                selected = row
            case "mkt-hang-xem-rieng":
                guard let row = selected else { MktNvTour.failed = true; return }
                selected = nil
                Task { @MainActor in await Task.yield(); pick(row.id, false) }
                return
            default: return
            }
            Task { @MainActor in await Task.yield(); tourNumbers(); MktNvTour.done = true }
        }
        #endif
    }
    private func rankRow(_ row: API.MarketingRankRow, rank: Int) -> some View {
        HStack(alignment: .top) {
            Medal(rank: rank)
            VStack(alignment: .leading) {
                Text(row.name).font(.system(size: 13, weight: .bold)).lineLimit(1)
                Text(team ? "\(Fmt.int(row.marketerCount)) marketer" : row.marketingTeamName ?? "—").font(.caption)
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing) {
                Text(display(effectiveSort, row)).font(.system(size: 13, weight: .bold))
                Text(secondary(row)).font(.system(size: 10)).foregroundStyle(Color.inkSoft)
            }
        }
        .foregroundStyle(Color.ink).padding(8)
        .background(!team && row.marketerId == marketerId ? Color.brandSoft : Color.clear, in: .rect(cornerRadius: 8))
    }
    private func secondary(_ row: API.MarketingRankRow) -> String {
        let phones = "SĐT \(Fmt.int(row.n("createdPhones")))"
        return (effectiveSort == .net ? phones : "Doanh thu \(display(.net, row))") + " · " + (effectiveSort == .rate ? phones : "Tỷ lệ XN \(Fmt.pct(row.values["confirmationRate"]))")
    }
    private func display(_ sort: MarketingRankSort, _ row: API.MarketingRankRow, full: Bool = false) -> String {
        hideMoney && sort.money ? "••••" : sort.display(row, full: full)
    }
    private func detail(_ row: API.MarketingRankRow) -> some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    ForEach(Array(MarketingRankTerms.detailSorts.enumerated()), id: \.offset) { i, s in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(MarketingRankTerms.detailLabels[i]); Spacer()
                                Text(s == .refund && row.n("refundNet") > 0 && !hideMoney ? "−" + Fmt.money(row.n("refundNet")) : display(s, row, full: true))
                                    .foregroundStyle(s == .refund ? Color.bad : Color.ink)
                            }
                            if s == .newNet || s == .cskhNet {
                                let prefix = s == .newNet ? "new" : "cskh"
                                let afterRefund = hideMoney ? "••••" : Fmt.money(row.n(prefix + "AfterRefund"))
                                Text("\(Fmt.int(row.n(prefix + "Orders"))) đơn · sau hoàn hủy \(afterRefund)").font(.caption).foregroundStyle(Color.inkSoft)
                            }
                        }
                    }
                    Button(team ? MarketingRankTerms.pickTeam : MarketingRankTerms.pickPerson) {
                        let isTeam = team
                        selected = nil
                        Task { @MainActor in
                            await Task.yield()
                            pick(row.id, isTeam)
                        }
                    }.buttonStyle(.borderedProminent)
                }.padding()
            }.navigationTitle(row.name).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button(MarketingRankTerms.close) { selected = nil } } }
        }
    }
    @MainActor private func load() async {
        let k = key, requestPath = path
        #if DEBUG
        if MktNvTour.active { MktNvTour.rank = false }
        #endif
        gen += 1; let g = gen
        loading = true
        defer { if gen == g { loading = false } }
        let trace = LoadTrace("marketing-xep-hang", requests: 1)
        defer { trace.end(cancelled: Task.isCancelled || key != k || gen != g) }
        do {
            let report: API.MarketingRankReport = try await trace.run { try await API.request(requestPath) }
            guard key == k, gen == g, !Task.isCancelled else { return }
            data = report; dataKey = k; error = nil
            #if DEBUG
            if MktNvTour.active { print("[MKTRQ] path=\(MktNvTour.path(requestPath))"); MktNvTour.rank = true; tourNumbers() }
            #endif
        } catch {
            guard key == k, gen == g, !Task.isCancelled, let text = LoadError.text(error) else { return }
            self.error = text
            if dataKey != k { data = nil }
            #if DEBUG
            if MktNvTour.active { MktNvTour.failed = true; print("[MKT] moc=loi-tai") }
            #endif
        }
    }
    #if DEBUG
    private func tourNumbers() {
        let values = rows.prefix(3).map { MktNvTour.number(effectiveSort.value($0)) }.joined(separator: ",")
        print("[MKT] hang mode=\(team ? "team" : "marketer") sort=\(effectiveSort.rawValue) n=\(rows.count) dau=\(values)")
        fflush(stdout)
    }
    #endif
}
