import SwiftUI
import Charts

// Trang Marketing (anh Vũ 10/10/2026: "mkt phần chi phí đâu, toàn thông số vớ vẩn gì vậy"; "phải tách doanh thu của 3 cái ra";
// "mkt là đưa số về"). Cùng nguồn với trang Marketing trên web (/api/marketing/analytics, lib/mkt-analytics.ts). Số chính: doanh thu MKT,
// chi phí quảng cáo (Google Sheet CPQC Daily + nhập tay), số về, đơn chốt, chi phí mỗi số, chi phí mỗi đơn chốt; so kỳ trước;
// biểu đồ số về và đơn chốt theo ngày; tách theo marketer, team, sản phẩm, ngày. Chạm một marketer / team / sản phẩm thì cả trang lọc theo đó.

extension API {
    /// Một ô số Marketing. ROAS, chi phí / đơn, chi phí / số chỉ tính marketer có chi phí trong phạm vi đang xem (coveredNet…).
    struct RoasMetrics: Decodable {
        let cost: Double; let net: Double; let closed: Double; let orders: Double; let phones: Double
        let coveredNet: Double?; let coveredClosed: Double?; let coveredPhones: Double?; let marketers: Double?
        let roas: Double?; let costPerClosed: Double?; let costPerLead: Double?
        /// Một phần doanh thu thuộc marketer chưa có chi phí nên không vào ROAS.
        var partial: Bool { net > (coveredNet ?? net) + 0.5 }
    }
    struct RoasPerson: Decodable, Identifiable {
        let id: String; let name: String; let teamId: String; let picked: Bool; let prevNet: Double; let m: RoasMetrics
        private enum K: String, CodingKey { case id, name, teamId, picked, prevNet }
        init(from d: Decoder) throws {
            let c = try d.container(keyedBy: K.self)
            id = try c.decode(String.self, forKey: .id); name = try c.decode(String.self, forKey: .name)
            teamId = (try? c.decode(String.self, forKey: .teamId)) ?? ""
            picked = (try? c.decode(Bool.self, forKey: .picked)) ?? true
            prevNet = (try? c.decode(Double.self, forKey: .prevNet)) ?? 0
            m = try RoasMetrics(from: d)
        }
    }
    struct RoasTeam: Decodable, Identifiable {
        let id: String; let name: String; let people: Double; let prevNet: Double; let m: RoasMetrics
        private enum K: String, CodingKey { case id, name, people, prevNet }
        init(from d: Decoder) throws {
            let c = try d.container(keyedBy: K.self)
            id = try c.decode(String.self, forKey: .id); name = try c.decode(String.self, forKey: .name)
            people = (try? c.decode(Double.self, forKey: .people)) ?? 0
            prevNet = (try? c.decode(Double.self, forKey: .prevNet)) ?? 0
            m = try RoasMetrics(from: d)
        }
    }
    /// Sản phẩm theo cột Sản phẩm của sheet chi phí; "" = dòng chi phí chưa ghi sản phẩm.
    struct RoasProduct: Decodable, Identifiable {
        let product: String; let matched: [String]; let linked: Bool; let m: RoasMetrics
        var id: String { product }
        private enum K: String, CodingKey { case product, matched, linked }
        init(from d: Decoder) throws {
            let c = try d.container(keyedBy: K.self)
            product = (try? c.decode(String.self, forKey: .product)) ?? ""
            matched = (try? c.decode([String].self, forKey: .matched)) ?? []
            linked = (try? c.decode(Bool.self, forKey: .linked)) ?? false
            m = try RoasMetrics(from: d)
        }
    }
    /// Một ngày / tuần / tháng của biểu đồ (key: YYYY-MM-DD, tuần = thứ Hai đầu tuần, tháng = YYYY-MM).
    struct RoasPoint: Decodable, Identifiable {
        let key: String; let m: RoasMetrics
        var id: String { key }
        private enum K: String, CodingKey { case key }
        init(from d: Decoder) throws { key = try d.container(keyedBy: K.self).decode(String.self, forKey: .key); m = try RoasMetrics(from: d) }
    }
    struct MktAnalytics: Decodable {
        struct Range: Decodable { let start: String; let end: String; let cutoff: String?; let costUntil: String? }
        struct Filters: Decodable { let marketerName: String?; let teamName: String? }
        let period: Range; let previous: Range; let bucket: String
        let filters: Filters
        let current: RoasMetrics; let prev: RoasMetrics
        let timeline: [RoasPoint]; let people: [RoasPerson]; let teams: [RoasTeam]; let products: [RoasProduct]
    }
    /// marketerId hoặc teamId (marketer được ưu tiên như web); product nil = mọi sản phẩm, "" = chi phí chưa ghi sản phẩm.
    static func mktAnalytics(start: String, end: String, posIds: [String] = [], marketerId: String?, teamId: String?, product: String?) async throws -> MktAnalytics {
        var q = "start=\(start)&end=\(end)&posIds=\(posIds.joined(separator: ","))"
        if let marketerId { q += "&marketerId=\(queryValue(marketerId))" } else if let teamId { q += "&teamId=\(queryValue(teamId))" }
        if let product { q += "&product=\(queryValue(product))" }
        return try await request("/api/marketing/analytics?\(q)")
    }
    /// Mã hoá một giá trị trên URL (tên sản phẩm, mã "sheet:Tên"…): chỉ giữ chữ số ASCII và -._~.
    static func queryValue(_ s: String) -> String {
        s.addingPercentEncoding(withAllowedCharacters: CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")) ?? s
    }
}

extension Fmt {
    /// ROAS kiểu web: "3,95×", "—" khi chưa có chi phí.
    static func roas(_ n: Double?) -> String { n.map { String(format: "%.2f×", $0).replacingOccurrences(of: ".", with: ",") } ?? "—" }
    static func roasPlain(_ n: Double) -> String { String(format: "%.2f", n).replacingOccurrences(of: ".", with: ",") }
}

struct MarketingView: View {
    @Environment(AuthModel.self) private var auth
    enum Tab: Hashable { case people, teams, products, time }
    @State private var period: Period
    /// POS đang xem ("" = mọi POS), mang theo từ Tổng quan.
    @State private var pos: String
    /// period, pos: kỳ và POS mở sẵn (khi mở từ bảng MKT ở Tổng quan, Trang chủ); period nil = Tháng này.
    init(period: Period? = nil, pos: String = "") { _period = State(initialValue: period ?? .month); _pos = State(initialValue: pos) }
    @State private var marketerId: String?
    @State private var teamId: String?
    /// nil = mọi sản phẩm; "" = chi phí chưa ghi sản phẩm.
    @State private var product: String?
    @State private var tab: Tab = .people
    @State private var showAll = false
    @State private var data: API.MktAnalytics?
    /// Bộ lọc của số đang hiện: tải bộ lọc mới lỗi thì bỏ số cũ (không để số cũ nằm dưới bộ lọc mới).
    @State private var dataKey = ""
    /// POS của số đang hiện (trong lúc tải bộ lọc mới, số cũ vẫn là của POS cũ).
    @State private var dataPos = ""
    @State private var error: String?
    @State private var loading = false
    @State private var explain: MetricExplain?

    private var key: String { [period.key, pos, marketerId ?? "-", teamId ?? "-", product.map { "p:" + $0 } ?? "-"].joined(separator: "|") }
    private var filtered: Bool { marketerId != nil || teamId != nil || product != nil || !pos.isEmpty }
    private var posName: String { PosBreakdown.names[pos] ?? pos }
    /// Tài khoản bị giới hạn POS: máy chủ tự thu hẹp số đơn về các POS được cấp (lib/access.ts).
    private var grantedPos: Int { auth.me?.role == "owner" ? 0 : (auth.me?.posIds?.count ?? 0) }
    /// Phạm vi đơn: một POS đang lọc, các POS được cấp, hoặc mọi POS.
    private var posScope: String { !pos.isEmpty ? "POS \(posName)" : grantedPos > 0 ? "\(grantedPos) POS được cấp" : "mọi POS" }
    /// Phạm vi đơn ghi trong phần giải thích.
    private var scopeText: String { pos.isEmpty && grantedPos == 0 ? "Cộng mọi POS" : "Chỉ đơn của \(posScope)" }
    /// Đơn, số về chỉ của một số POS nhưng chi phí quảng cáo là của mọi POS (sheet không chia theo POS): không chia chi phí
    /// cho số về / đơn và không tính ROAS được, kẻo ra số sai.
    private var posLimited: Bool { !pos.isEmpty || !dataPos.isEmpty || grantedPos > 0 }

    var body: some View {
        PageTitle(title: "Marketing", subtitle: "Doanh thu, chi phí quảng cáo, số về", trailing: AnyView(PeriodMenu(period: $period, options: [.today, .yesterday, .week, .month, .last])))
        if let d = data {
            if let error {
                HStack(spacing: 8) {
                    Label(error, systemImage: "wifi.exclamationmark").font(.system(size: 12)).foregroundStyle(Color.bad).lineLimit(2)
                    Spacer(minLength: 4)
                    Button("Tải lại") { Task { await load() } }.font(.system(size: 12, weight: .semibold))
                }
            }
            filterLine(d)
            hero(d).environment(\.thinking, loading)
            MktChart(points: d.timeline, bucket: d.bucket, blocked: posLimited)
            breakdown(d)
            Text(source(d)).font(.system(size: 10)).foregroundStyle(Color.inkSoft).fixedSize(horizontal: false, vertical: true)
        } else if let error {
            Panel {
                Label(error, systemImage: "wifi.exclamationmark").font(.system(size: 13)).foregroundStyle(Color.bad)
                Button("Tải lại") { Task { await load() } }.font(.system(size: 13, weight: .semibold))
            }
        } else {
            SkeletonGrid(tiles: 4); Skeleton(height: 200)
        }
        Color.clear.frame(height: 0)
            .task(id: key) { await load() }
            .sheet(item: $explain) { m in ExplainSheet(m: m) { _ in } }
    }

    // MARK: Đang xem

    @ViewBuilder private func filterLine(_ d: API.MktAnalytics) -> some View {
        if filtered {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    Text("Đang xem").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.inkSoft)
                    if !pos.isEmpty { chip("storefront", posName) { pos = "" } }
                    if let id = marketerId { chip("person.fill", d.filters.marketerName ?? d.people.first { $0.id == id }?.name ?? "Marketer") { marketerId = nil } }
                    else if let id = teamId { chip("person.2.fill", d.filters.teamName ?? d.teams.first { $0.id == id }?.name ?? "Team") { teamId = nil } }
                    if let p = product { chip("shippingbox.fill", Self.productName(p)) { product = nil } }
                    Button { marketerId = nil; teamId = nil; product = nil; pos = "" } label: { Text("Bỏ lọc").font(.system(size: 12)).foregroundStyle(Color.inkSoft).underline() }.buttonStyle(.plain)
                }
            }
        } else {
            Text("Toàn bộ Marketing, \(posScope). Chạm một marketer, team hoặc sản phẩm ở bảng dưới để xem riêng.").font(.system(size: 11)).foregroundStyle(Color.inkSoft)
        }
    }
    private func chip(_ icon: String, _ text: String, clear: @escaping () -> Void) -> some View {
        Button(action: clear) {
            HStack(spacing: 4) { Image(systemName: icon).font(.system(size: 10)); Text(text).lineLimit(1); Image(systemName: "xmark").font(.system(size: 9, weight: .bold)) }
                .font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand)
                .padding(.horizontal, 10).padding(.vertical, 6).background(Color.brandSoft, in: .capsule)
        }.buttonStyle(.plain).accessibilityHint("Bỏ lọc")
    }

    // MARK: Số chính

    /// Anh Vũ 10/10/2026: doanh thu tách riêng Sale, CSKH, MKT; MKT còn đo bằng số đưa về. Số chính: doanh thu MKT, chi phí quảng cáo,
    /// số về, đơn chốt, chi phí mỗi số, chi phí mỗi đơn chốt (ROAS ghi kèm doanh thu).
    private func hero(_ d: API.MktAnalytics) -> some View {
        let c = d.current, p = d.prev
        return VStack(spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                MktBig(icon: "banknote.fill", tint: .good, label: "Doanh thu MKT", value: Fmt.shortVnd(c.net),
                       delta: Fmt.delta(c.net, p.net), upIsGood: true, sub: "\(Fmt.int(c.closed)) đơn chốt" + (posLimited ? "" : " · ROAS \(Fmt.roas(c.roas))")) {
                    explain = MetricExplain(title: "Doanh thu MKT", value: Fmt.money(c.net),
                        definition: "Tiền các đơn có Marketer đã xác nhận trên Pancake trong kỳ (theo ngày xác nhận lần đầu), sau giảm giá và quà tặng, không cộng phí ship. Không tính đơn mới, chờ xác nhận, huỷ, xoá. \(scopeText).\nĐơn MKT do Sale hoặc CSKH gọi chốt nên cũng có trong doanh thu bộ phận đó; doanh thu Sale, CSKH, MKT xem riêng, không cộng lại.\n" + (posLimited ? "Không tính ROAS khi chỉ xem một số POS: chi phí quảng cáo là của mọi POS." : "ROAS = doanh thu ÷ chi phí quảng cáo, chỉ tính marketer có chi phí\(c.partial ? " (kỳ này \(Fmt.money(c.coveredNet ?? 0)) trên \(Fmt.money(c.net)))" : ""): kỳ này \(Fmt.roas(c.roas)), kỳ trước \(Fmt.roas(p.roas)).") ,
                        period: periodLabel(d), previous: ("Kỳ trước", Fmt.money(p.net)))
                }
                MktBig(icon: "wallet.pass.fill", tint: .orange, label: "Chi phí quảng cáo", value: Fmt.shortVnd(c.cost),
                       delta: Fmt.delta(c.cost, p.cost), upIsGood: false,
                       sub: c.cost > 0 ? "\(Fmt.int(c.marketers ?? 0)) marketer có chi phí\(posLimited ? " · mọi POS" : "") · kỳ trước \(Fmt.short(p.cost))" : "Chưa có chi phí trong kỳ (sheet chưa gửi hoặc chưa nhập)") {
                    explain = MetricExplain(title: "Chi phí quảng cáo", value: Fmt.money(c.cost),
                        definition: "Tổng chi phí quảng cáo của marketer trong kỳ, lấy từ Google Sheet CPQC Daily (cột Chi phí QC Tổng, sheet tự gửi lên web mỗi giờ) và chi phí nhập tay ở trang Chi phí & ROAS trên web. Chi phí tính cho mọi POS. Ngày hôm nay thường chưa có cho tới khi marketer ghi vào sheet.",
                        period: periodLabel(d), previous: ("Kỳ trước", Fmt.money(p.cost)))
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                Button { explain = MetricExplain(title: "Số về", value: "\(Fmt.int(c.phones)) số", definition: "Số điện thoại khác nhau trên các đơn có Marketer được tạo trong kỳ (số MKT đưa về cho Sale, CSKH gọi). Kỳ này có \(Fmt.int(c.orders)) đơn có Marketer được tạo. Không tính đơn đã xoá. \(scopeText).", period: periodLabel(d), previous: ("Kỳ trước", "\(Fmt.int(p.phones)) số")) } label: {
                    KpiCard(icon: "phone.fill", tint: .teal, label: "Số về", value: Fmt.int(c.phones), delta: Fmt.delta(c.phones, p.phones), note: "\(Fmt.int(c.orders)) đơn lên")
                }.buttonStyle(.plain)
                Button { explain = MetricExplain(title: "Đơn chốt", value: Fmt.int(c.closed), definition: "Số đơn có Marketer đã xác nhận trên Pancake trong kỳ (theo ngày xác nhận lần đầu): số MKT đưa về đã thành đơn. Không tính đơn mới, chờ xác nhận, huỷ, xoá. \(scopeText).", period: periodLabel(d), previous: ("Kỳ trước", Fmt.int(p.closed))) } label: {
                    KpiCard(icon: "ic_m_closed", tint: .good, label: "Đơn chốt", value: Fmt.int(c.closed), delta: Fmt.delta(c.closed, p.closed))
                }.buttonStyle(.plain)
            }
            CostCard(now: c, prev: p, blocked: posLimited) {
                explain = MetricExplain(title: "Chi phí mỗi số", value: Fmt.shortVnd(posLimited ? nil : c.costPerLead),
                    definition: (posLimited ? "Đang xem \(posScope): chi phí quảng cáo là của mọi POS (sheet không chia theo POS) nên không chia cho số về được, xem ở mọi POS.\n" : "") + "Chi phí quảng cáo ÷ số về. Chỉ tính marketer có chi phí trong kỳ, để người chưa ghi chi phí không làm số này thấp giả" + (c.coveredPhones.map { ": kỳ này \(Fmt.int($0)) trên \(Fmt.int(c.phones)) số" } ?? "") + ". Càng thấp càng tốt.",
                    period: periodLabel(d), previous: posLimited ? nil : (label: "Kỳ trước", value: Fmt.shortVnd(p.costPerLead)))
            } closed: {
                explain = MetricExplain(title: "Chi phí mỗi đơn chốt", value: Fmt.shortVnd(posLimited ? nil : c.costPerClosed),
                    definition: (posLimited ? "Đang xem \(posScope): chi phí quảng cáo là của mọi POS (sheet không chia theo POS) nên không chia cho đơn được, xem ở mọi POS.\n" : "") + "Chi phí quảng cáo ÷ đơn chốt (đơn có Marketer đã xác nhận trong kỳ). Chỉ tính marketer có chi phí trong kỳ" + (c.coveredClosed.map { ": kỳ này \(Fmt.int($0)) trên \(Fmt.int(c.closed)) đơn" } ?? "") + ". Càng thấp càng tốt.",
                    period: periodLabel(d), previous: posLimited ? nil : (label: "Kỳ trước", value: Fmt.shortVnd(p.costPerClosed)))
            }
        }
    }

    // MARK: Tách theo

    private struct Row: Identifiable {
        let id: String; let name: String; var sub: String? = nil; let m: API.RoasMetrics
        var active = false; var dim = false
    }

    @ViewBuilder private func breakdown(_ d: API.MktAnalytics) -> some View {
        let unit = d.bucket == "week" ? "Tuần" : d.bucket == "month" ? "Tháng" : "Ngày"
        VStack(alignment: .leading, spacing: 10) {
            Text("Tách theo").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink)
            Segmented(selection: $tab, options: [(.people, "Marketer"), (.teams, "Team"), (.products, "Sản phẩm"), (.time, unit)])
            let rows = rowsFor(d)
            if tab == .products { Text("Sản phẩm theo cột Sản phẩm của sheet chi phí; số về, đơn, doanh thu lấy từ đơn Pancake có nhãn hoặc tên sản phẩm khớp. Một đơn nhiều sản phẩm được tính ở mỗi sản phẩm.").font(.system(size: 10)).foregroundStyle(Color.inkSoft).fixedSize(horizontal: false, vertical: true) }
            if tab != .time && !rows.isEmpty { Text("Chạm một dòng để xem riêng, chạm lại để bỏ.").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
            if rows.isEmpty {
                Panel { Text("Không có chi phí hoặc đơn Marketing trong phạm vi đang chọn.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) }
            } else {
                let shown = showAll ? rows : Array(rows.prefix(12))
                let maxCost = max(1, rows.map(\.m.cost).max() ?? 1), maxPhones = max(1, rows.map(\.m.phones).max() ?? 1)
                VStack(spacing: 0) {
                    ForEach(Array(shown.enumerated()), id: \.element.id) { i, r in
                        let line = MktRowView(row: r.name, sub: r.sub, m: r.m, maxCost: maxCost, maxPhones: maxPhones, active: r.active, dim: r.dim, rank: tab == .people ? i + 1 : nil, ratios: !posLimited)
                        if tab == .time { line } else { Button { pick(r.id) } label: { line }.buttonStyle(.plain) }
                        if i < shown.count - 1 { Divider().padding(.leading, 12) }
                    }
                }
                .background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                if rows.count > 12 {
                    Button { withAnimation(.snappy) { showAll.toggle() } } label: {
                        Text(showAll ? "Thu gọn" : "Xem tất cả \(rows.count) dòng").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand).frame(maxWidth: .infinity)
                    }.buttonStyle(.plain)
                }
            }
        }
        .padding(.top, 4)
        .onChange(of: tab) { showAll = false }
    }

    private func rowsFor(_ d: API.MktAnalytics) -> [Row] {
        var teamName: [String: String] = [:]
        for t in d.teams where teamName[t.id] == nil { teamName[t.id] = t.name }
        var r: [Row] = []
        switch tab {
        case .people:
            for x in d.people where teamId == nil || marketerId != nil || x.picked {
                let sub: String? = teamName[x.teamId] ?? (x.teamId == "__unassigned" ? "Chưa phân team" : nil)
                r.append(Row(id: x.id, name: x.name, sub: sub, m: x.m, active: x.id == marketerId, dim: marketerId != nil && x.id != marketerId))
            }
        case .teams:
            for x in d.teams { r.append(Row(id: x.id, name: x.name, sub: "\(Fmt.int(x.people)) marketer", m: x.m, active: x.id == teamId && marketerId == nil)) }
        case .products:
            for x in d.products {
                var sub: String? = nil
                if x.linked { sub = "Khớp đơn: " + x.matched.prefix(3).joined(separator: ", ") }
                else if !x.product.isEmpty { sub = "Chưa khớp nhãn / sản phẩm nào trên đơn Pancake" }
                r.append(Row(id: x.product, name: Self.productName(x.product), sub: sub, m: x.m, active: x.product == product))
            }
        case .time:
            for x in d.timeline.reversed() { r.append(Row(id: x.key, name: Self.bucketLabel(x.key, d.bucket), m: x.m)) }
        }
        // Marketer, team xếp theo số về (rồi chi phí): MKT đo bằng số đưa về.
        if tab == .people || tab == .teams { r.sort { ($0.m.phones, $0.m.cost) > ($1.m.phones, $1.m.cost) } }
        return r
    }
    private func pick(_ id: String) {
        switch tab {
        case .people: teamId = nil; marketerId = id == marketerId ? nil : id
        case .teams: marketerId = nil; teamId = id == teamId ? nil : id
        case .products: product = id == product ? nil : id
        case .time: break
        }
    }

    // MARK: Chữ phụ

    static func productName(_ p: String) -> String { p.isEmpty ? "Chưa ghi sản phẩm" : p }
    static func bucketLabel(_ key: String, _ bucket: String) -> String {
        let p = key.split(separator: "-")
        if bucket == "month", p.count >= 2 { return "Tháng \(p[1])/\(p[0])" }
        if p.count == 3 { return (bucket == "week" ? "Tuần " : "") + "\(p[2])/\(p[1])" }
        return key
    }
    private func range(_ a: String, _ b: String) -> String { a == b ? Fmt.day(a) : "\(Fmt.day(a).prefix(5))–\(Fmt.day(b))" }
    private func periodLabel(_ d: API.MktAnalytics) -> String {
        "\(period.title) · \(range(d.period.start, d.period.end))" + (filtered ? " · đang lọc" : "")
    }
    private func source(_ d: API.MktAnalytics) -> String {
        var s = "Chi phí quảng cáo từ Google Sheet CPQC Daily (và chi phí nhập tay trên web), tính cho mọi POS. Số về, đơn lên từ đơn Pancake có Marketer tạo trong kỳ; đơn chốt và doanh thu MKT là đơn có Marketer đã xác nhận, theo ngày xác nhận, sau giảm giá; \(posScope). Chi phí mỗi số, mỗi đơn chỉ tính marketer có chi phí\(posLimited ? ", và chỉ tính khi xem mọi POS" : ""). So với kỳ trước \(range(d.previous.start, d.previous.end))"
        if let c = d.previous.cutoff { s += " tới \(c)" }
        if let u = d.previous.costUntil, u < d.previous.end { s += "; hôm nay chưa có chi phí nên chi phí kỳ trước tính tới hết \(Fmt.day(u))" }
        return s + "."
    }

    // MARK: Tải số

    @MainActor private func load() async {
        let k = key, r = period.range
        loading = true
        do {
            let d = try await API.mktAnalytics(start: r.0, end: r.1, posIds: pos.isEmpty ? [] : [pos], marketerId: marketerId, teamId: teamId, product: product)
            guard k == key else { return }
            data = d; dataKey = k; dataPos = pos; error = nil
        } catch {
            guard k == key, !Task.isCancelled else { return }
            self.error = error.localizedDescription
            if dataKey != k { data = nil; dataPos = "" }
        }
        loading = false
    }
}

// MARK: Thẻ số

/// Ô số lớn (doanh thu MKT, chi phí quảng cáo) có dải màu trên đầu như web; chạm xem cách tính.
private struct MktBig: View {
    @Environment(\.thinking) private var thinking
    let icon: String; let tint: Color; let label: String; let value: String
    var delta: String? = nil; var upIsGood = true; let sub: String
    let tap: () -> Void
    var body: some View {
        Button(action: tap) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    MetricIcon(icon, size: 12).foregroundStyle(tint)
                        .frame(width: 26, height: 26).background(tint.opacity(0.14), in: .rect(cornerRadius: 8))
                    Text(label).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.inkSoft).lineLimit(1).minimumScaleFactor(0.8)
                }
                Text(value).font(.system(size: 24, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).monospacedDigit()
                    .lineLimit(1).minimumScaleFactor(0.5).rolling(value)
                if let delta { MktDelta(text: delta, good: delta.hasPrefix("-") ? !upIsGood : upIsGood) }
                Text(sub).font(.system(size: 10)).foregroundStyle(Color.inkSoft).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(12).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Color.card)
            .overlay(alignment: .top) { Rectangle().fill(tint).frame(height: 3) }
            .clipShape(.rect(cornerRadius: 16))
            .cardShadow()
            .thinkingGlow(thinking, radius: 16)
            .contentShape(.rect)
        }.buttonStyle(.plain)
    }
}

/// Chi phí mỗi số (to, màu chanh) và chi phí mỗi đơn chốt trên nền xanh đậm như thẻ ở Trang chủ; giảm là tốt.
private struct CostCard: View {
    @Environment(\.thinking) private var thinking
    let now: API.RoasMetrics; let prev: API.RoasMetrics
    /// Đang xem một số POS: chi phí là của mọi POS nên không chia được.
    var blocked = false
    let lead: () -> Void; let closed: () -> Void
    var body: some View {
        let cpl = blocked ? nil : now.costPerLead, cpc = blocked ? nil : now.costPerClosed
        HStack(alignment: .top, spacing: 0) {
            Button(action: lead) {
                VStack(alignment: .leading, spacing: 4) {
                    head("Chi phí mỗi số")
                    Text(Fmt.shortVnd(cpl)).font(.system(size: 28, weight: .bold, design: .rounded)).foregroundStyle(Color.lime)
                        .monospacedDigit().lineLimit(1).minimumScaleFactor(0.6).rolling(Fmt.shortVnd(cpl))
                    if let d = cpl.flatMap({ Fmt.delta($0, prev.costPerLead) }) { MktDelta(text: d, good: d.hasPrefix("-"), onDark: true) }
                    Text(blocked ? "Chi phí là của mọi POS, không chia theo POS được" : cpl.map { "Mỗi số về tốn \(Fmt.money($0)) quảng cáo" } ?? "Cần chi phí trong kỳ để tính")
                        .font(.system(size: 11, weight: .medium)).foregroundStyle(.white.opacity(0.85)).fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading).contentShape(.rect)
            }.buttonStyle(.plain)
            Rectangle().fill(.white.opacity(0.14)).frame(width: 1).padding(.horizontal, 12)
            Button(action: closed) {
                VStack(alignment: .leading, spacing: 4) {
                    head("Chi phí mỗi đơn chốt")
                    Text(Fmt.shortVnd(cpc)).font(.system(size: 22, weight: .bold, design: .rounded)).foregroundStyle(.white)
                        .monospacedDigit().lineLimit(1).minimumScaleFactor(0.6).rolling(Fmt.shortVnd(cpc))
                    if let d = cpc.flatMap({ Fmt.delta($0, prev.costPerClosed) }) { MktDelta(text: d, good: d.hasPrefix("-"), onDark: true) }
                    Text("\(Fmt.int(now.closed)) đơn chốt").font(.system(size: 11, weight: .medium)).foregroundStyle(.white.opacity(0.85))
                }
                .frame(maxWidth: .infinity, alignment: .leading).contentShape(.rect)
            }.buttonStyle(.plain)
        }
        .padding(16)
        .background(LinearGradient(colors: [Color.brandDark, Color.brandDeep], startPoint: .topLeading, endPoint: .bottomTrailing))
        .overlay(alignment: .topTrailing) { Circle().fill(Color.lime.opacity(0.08)).frame(width: 150, height: 150).offset(x: 50, y: -60).allowsHitTesting(false) }
        .clipShape(.rect(cornerRadius: 18))
        .shadow(color: Color.brandDeep.opacity(0.22), radius: 10, y: 5)
        .thinkingGlow(thinking, radius: 18)
    }
    private func head(_ t: String) -> some View {
        HStack(spacing: 4) {
            Text(t).font(.system(size: 12, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.8)
            Image(systemName: "info.circle").font(.system(size: 10))
        }.foregroundStyle(.white.opacity(0.85))
    }
}

/// Viên tăng / giảm so kỳ trước; good quyết định màu (chi phí tăng là đỏ như web).
private struct MktDelta: View {
    let text: String; let good: Bool; var onDark = false
    var body: some View {
        let up = !text.hasPrefix("-")
        let color: Color = onDark ? (good ? Color.lime : Color(red: 1, green: 0.62, blue: 0.6)) : (good ? .good : .bad)
        HStack(spacing: 3) {
            Image(systemName: up ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill").font(.system(size: 8))
            Text(text).font(.system(size: 11, weight: .semibold))
        }
        .foregroundStyle(color).padding(.horizontal, 7).padding(.vertical, 3)
        .background(onDark ? Color.white.opacity(0.1) : color.opacity(0.1), in: .capsule)
    }
}

/// Một dòng ở bảng Tách theo: tên, số về, đơn chốt và doanh thu; thanh chi phí (cam) cạnh số về (xanh ngọc); chi phí, chi phí mỗi số, mỗi đơn.
private struct MktRowView: View {
    let row: String; let sub: String?; let m: API.RoasMetrics; let maxCost: Double; let maxPhones: Double
    let active: Bool; let dim: Bool; let rank: Int?
    /// false khi đang xem một số POS: chi phí là của mọi POS nên không chia cho số về / đơn.
    var ratios = true
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            if let rank { Medal(rank: rank) }
            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    if active { Image(systemName: "checkmark.circle.fill").font(.system(size: 12)).foregroundStyle(Color.brand) }
                    VStack(alignment: .leading, spacing: 1) {
                        Text(row).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                        if let sub { Text(sub).font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1) }
                    }
                    Spacer(minLength: 4)
                    VStack(alignment: .trailing, spacing: 1) {
                        Text("\(Fmt.int(m.phones)) số").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink).monospacedDigit()
                        Text("\(Fmt.int(m.closed)) đơn · \(Fmt.short(m.net))").font(.system(size: 10, weight: .semibold)).foregroundStyle(Color.good).monospacedDigit()
                    }
                }
                VStack(spacing: 3) {
                    Bar(value: m.cost / maxCost, tint: .orange, height: 5)
                    Bar(value: m.phones / maxPhones, tint: .teal, height: 5)
                }
                Text(ratios ? "Chi phí \(Fmt.short(m.cost)) · CP/số \(m.costPerLead.map { Fmt.short($0) } ?? "—") · CP/đơn \(m.costPerClosed.map { Fmt.short($0) } ?? "—")" : "Chi phí \(Fmt.short(m.cost)) (mọi POS)")
                    .font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1).minimumScaleFactor(0.85).monospacedDigit()
            }
        }
        .padding(12)
        .background(active ? Color.brandSoft : Color.clear)
        .opacity(dim ? 0.55 : 1)
        .contentShape(.rect)
    }
}

// MARK: Biểu đồ

/// Số về (cột xanh ngọc) và đơn chốt (đường xanh) theo ngày / tuần / tháng; chạm hoặc kéo để xem chi phí, chi phí mỗi số từng ngày.
private struct MktChart: View {
    let points: [API.RoasPoint]; let bucket: String
    /// Chỉ xem một số POS: chi phí là của mọi POS nên không chia cho số về.
    var blocked = false
    @State private var picked: Date?
    private struct P: Identifiable { let id: String; let date: Date; let phones: Double; let closed: Double; let p: API.RoasPoint }
    private var unit: Calendar.Component { bucket == "month" ? .month : bucket == "week" ? .weekOfYear : .day }
    private var axisFormat: Date.FormatStyle { bucket == "month" ? Date.FormatStyle().month(.defaultDigits).year(.twoDigits) : Date.FormatStyle().day().month(.defaultDigits) }
    private var word: String { bucket == "week" ? "tuần" : bucket == "month" ? "tháng" : "ngày" }
    private static func date(_ key: String) -> Date? {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = VNDate.tz
        let p = key.split(separator: "-").compactMap { Int($0) }
        guard p.count >= 2 else { return nil }
        return cal.date(from: DateComponents(year: p[0], month: p[1], day: p.count > 2 ? p[2] : 1, hour: 12))
    }
    private var rows: [P] { points.compactMap { x in Self.date(x.key).map { P(id: x.key, date: $0, phones: x.m.phones, closed: x.m.closed, p: x) } } }
    private var selected: P? {
        guard let picked else { return nil }
        return rows.min { abs($0.date.timeIntervalSince(picked)) < abs($1.date.timeIntervalSince(picked)) }
    }
    var body: some View {
        let list = rows
        if list.count > 1 {
            Panel {
                HStack {
                    Text("Số về và đơn chốt theo \(word)").font(.system(size: 14, weight: .bold)).foregroundStyle(Color.ink)
                    Spacer()
                    Text("số / đơn").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                }
                HStack(spacing: 12) {
                    legend(.teal, "Số về"); legend(.good, "Đơn chốt")
                    Spacer()
                }
                if let s = selected {
                    let m = s.p.m
                    Text("\(MarketingView.bucketLabel(s.id, bucket)): \(Fmt.int(m.phones)) số · \(Fmt.int(m.closed)) đơn chốt · chi phí \(Fmt.short(m.cost))" + (blocked ? " (mọi POS)" : " · CP/số \(m.costPerLead.map { Fmt.short($0) } ?? "—")"))
                        .font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink).monospacedDigit().lineLimit(2)
                } else {
                    Text("Chạm hoặc kéo trên biểu đồ để xem chi phí từng \(word).").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                }
                Chart {
                    ForEach(list) { r in
                        BarMark(x: .value("Ngày", r.date, unit: unit), y: .value("Số về", r.phones))
                            .foregroundStyle(Color.teal.opacity(0.75)).cornerRadius(3)
                    }
                    ForEach(list) { r in
                        LineMark(x: .value("Ngày", r.date, unit: unit), y: .value("Đơn chốt", r.closed))
                            .foregroundStyle(Color.good).lineStyle(StrokeStyle(lineWidth: 2.2, lineCap: .round))
                            .interpolationMethod(.monotone)
                        PointMark(x: .value("Ngày", r.date, unit: unit), y: .value("Đơn chốt", r.closed))
                            .foregroundStyle(Color.good).symbolSize(14)
                    }
                    if let s = selected {
                        RuleMark(x: .value("Ngày", s.date, unit: unit)).foregroundStyle(Color.ink.opacity(0.25)).lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                    }
                }
                .chartXSelection(value: $picked)
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 5)) { _ in
                        AxisGridLine().foregroundStyle(Color.black.opacity(0.05))
                        AxisValueLabel(format: axisFormat)
                    }
                }
                .chartYAxis { AxisMarks(position: .leading) { _ in AxisGridLine().foregroundStyle(Color.black.opacity(0.05)); AxisValueLabel() } }
                .frame(height: 190)
            }
        }
    }
    private func legend(_ c: Color, _ t: String) -> some View {
        HStack(spacing: 4) { RoundedRectangle(cornerRadius: 2).fill(c).frame(width: 10, height: 10); Text(t).font(.system(size: 11)).foregroundStyle(Color.inkSoft) }
    }
}
