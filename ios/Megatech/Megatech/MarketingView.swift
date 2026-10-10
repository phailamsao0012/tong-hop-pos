import SwiftUI
import Charts

// Trang Marketing (anh Vũ 10/10/2026: "mkt phần chi phí đâu, toàn thông số vớ vẩn gì vậy"): giống khối "Số chính Marketing" đầu trang
// Tổng quan Marketing trên web (app/mkt-headline.tsx, /api/marketing/analytics, lib/mkt-analytics.ts).
// Chi phí quảng cáo (Google Sheet CPQC Daily + nhập tay), doanh thu MKT, ROAS thật to; đơn chốt, số, chi phí mỗi đơn / mỗi số; so kỳ trước;
// biểu đồ chi phí với doanh thu theo ngày; tách theo marketer, team, sản phẩm, ngày. Chạm một marketer / team / sản phẩm thì cả trang lọc theo đó.

extension API {
    /// Một ô số Marketing. ROAS, chi phí / đơn, chi phí / số chỉ tính marketer có chi phí trong phạm vi đang xem (coveredNet…).
    struct RoasMetrics: Decodable {
        let cost: Double; let net: Double; let closed: Double; let orders: Double; let phones: Double
        let coveredNet: Double?; let marketers: Double?
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
    static func mktAnalytics(start: String, end: String, marketerId: String?, teamId: String?, product: String?) async throws -> MktAnalytics {
        var q = "start=\(start)&end=\(end)&posIds="
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
    enum Tab: Hashable { case people, teams, products, time }
    @State private var period: Period
    /// period: kỳ mở sẵn (khi mở từ bảng MKT ở Tổng quan); nil = Tháng này.
    init(period: Period? = nil) { _period = State(initialValue: period ?? .month) }
    @State private var marketerId: String?
    @State private var teamId: String?
    /// nil = mọi sản phẩm; "" = chi phí chưa ghi sản phẩm.
    @State private var product: String?
    @State private var tab: Tab = .people
    @State private var showAll = false
    @State private var data: API.MktAnalytics?
    @State private var error: String?
    @State private var loading = false
    @State private var explain: MetricExplain?

    private var key: String { [period.key, marketerId ?? "-", teamId ?? "-", product.map { "p:" + $0 } ?? "-"].joined(separator: "|") }
    private var filtered: Bool { marketerId != nil || teamId != nil || product != nil }

    var body: some View {
        PageTitle(title: "Marketing", subtitle: "Chi phí quảng cáo, doanh thu, ROAS", trailing: AnyView(PeriodMenu(period: $period, options: [.today, .yesterday, .week, .month, .last])))
        if let d = data {
            if let error { Label(error, systemImage: "wifi.exclamationmark").font(.system(size: 12)).foregroundStyle(Color.bad) }
            filterLine(d)
            Group {
                hero(d)
                stats(d)
            }.environment(\.thinking, loading)
            MktChart(points: d.timeline, bucket: d.bucket)
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
                    if let id = marketerId { chip("person.fill", d.filters.marketerName ?? d.people.first { $0.id == id }?.name ?? "Marketer") { marketerId = nil } }
                    else if let id = teamId { chip("person.2.fill", d.filters.teamName ?? d.teams.first { $0.id == id }?.name ?? "Team") { teamId = nil } }
                    if let p = product { chip("shippingbox.fill", Self.productName(p)) { product = nil } }
                    Button { marketerId = nil; teamId = nil; product = nil } label: { Text("Bỏ lọc").font(.system(size: 12)).foregroundStyle(Color.inkSoft).underline() }.buttonStyle(.plain)
                }
            }
        } else {
            Text("Toàn bộ Marketing, mọi POS. Chạm một marketer, team hoặc sản phẩm ở bảng dưới để xem riêng.").font(.system(size: 11)).foregroundStyle(Color.inkSoft)
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

    private func hero(_ d: API.MktAnalytics) -> some View {
        let c = d.current, p = d.prev
        return VStack(spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                MktBig(icon: "wallet.pass.fill", tint: .orange, label: "Chi phí quảng cáo", value: Fmt.shortVnd(c.cost),
                       delta: Fmt.delta(c.cost, p.cost), upIsGood: false,
                       sub: c.cost > 0 ? "\(Fmt.int(c.marketers ?? 0)) marketer có chi phí · kỳ trước \(Fmt.short(p.cost))" : "Chưa có chi phí trong kỳ (sheet chưa gửi hoặc chưa nhập)") {
                    explain = MetricExplain(title: "Chi phí quảng cáo", value: Fmt.money(c.cost),
                        definition: "Tổng chi phí quảng cáo của marketer trong kỳ, lấy từ Google Sheet CPQC Daily (cột Chi phí QC Tổng, sheet tự gửi lên web mỗi giờ) và chi phí nhập tay ở trang Chi phí & ROAS trên web. Chi phí tính cho mọi POS. Ngày hôm nay thường chưa có cho tới khi marketer ghi vào sheet.",
                        period: periodLabel(d), previous: ("Kỳ trước", Fmt.money(p.cost)))
                }
                MktBig(icon: "banknote.fill", tint: .good, label: "Doanh thu MKT", value: Fmt.shortVnd(c.net),
                       delta: Fmt.delta(c.net, p.net), upIsGood: true, sub: "\(Fmt.int(c.closed)) đơn chốt · kỳ trước \(Fmt.short(p.net))") {
                    explain = MetricExplain(title: "Doanh thu MKT", value: Fmt.money(c.net),
                        definition: "Tổng tiền các đơn có Marketer đã xác nhận trên Pancake trong kỳ (theo ngày xác nhận lần đầu), sau giảm giá và quà tặng, chưa gồm phí vận chuyển. Cộng mọi POS. Không tính đơn mới, chờ xác nhận, hủy, xóa.",
                        period: periodLabel(d), previous: ("Kỳ trước", Fmt.money(p.net)))
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            RoasCard(now: c, prev: p) {
                explain = MetricExplain(title: "ROAS", value: Fmt.roas(c.roas),
                    definition: "ROAS = doanh thu MKT ÷ chi phí quảng cáo: 1 đồng quảng cáo mang về bao nhiêu đồng doanh thu. Chỉ tính doanh thu của marketer có chi phí trong kỳ, để người chưa ghi chi phí không làm ROAS cao giả." + (c.partial ? " Kỳ này tính \(Fmt.money(c.coveredNet ?? 0)) trên tổng \(Fmt.money(c.net)) doanh thu." : ""),
                    period: periodLabel(d), previous: ("Kỳ trước", Fmt.roas(p.roas)))
            }
        }
    }

    private func stats(_ d: API.MktAnalytics) -> some View {
        let c = d.current, p = d.prev
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            Button { explain = MetricExplain(title: "Đơn chốt", value: Fmt.int(c.closed), definition: "Số đơn có Marketer đã xác nhận trên Pancake trong kỳ (theo ngày xác nhận lần đầu).", period: periodLabel(d), previous: ("Kỳ trước", Fmt.int(p.closed))) } label: {
                KpiCard(icon: "ic_m_closed", tint: .good, label: "Đơn chốt", value: Fmt.int(c.closed), delta: Fmt.delta(c.closed, p.closed))
            }.buttonStyle(.plain)
            Button { explain = MetricExplain(title: "Số về", value: Fmt.int(c.phones), definition: "Số SĐT khác nhau trên các đơn có Marketer tạo trong kỳ (số MKT đưa về). Kỳ này có \(Fmt.int(c.orders)) đơn tạo.", period: periodLabel(d), previous: ("Kỳ trước", Fmt.int(p.phones))) } label: {
                KpiCard(icon: "phone.fill", tint: .teal, label: "Số về (SĐT)", value: Fmt.int(c.phones), delta: Fmt.delta(c.phones, p.phones))
            }.buttonStyle(.plain)
            Button { explain = MetricExplain(title: "Chi phí / đơn chốt", value: Fmt.shortVnd(c.costPerClosed), definition: "Chi phí quảng cáo ÷ đơn chốt, chỉ tính marketer có chi phí trong kỳ. Càng thấp càng tốt.", period: periodLabel(d), previous: ("Kỳ trước", Fmt.shortVnd(p.costPerClosed))) } label: {
                KpiCard(icon: "creditcard.fill", tint: .orange, label: "Chi phí / đơn chốt", value: Fmt.shortVnd(c.costPerClosed), delta: c.costPerClosed.flatMap { Fmt.delta($0, p.costPerClosed) }, deltaGood: c.costPerClosed.flatMap { a in p.costPerClosed.map { a <= $0 } })
            }.buttonStyle(.plain)
            Button { explain = MetricExplain(title: "Chi phí / số", value: Fmt.shortVnd(c.costPerLead), definition: "Chi phí quảng cáo ÷ số SĐT về, chỉ tính marketer có chi phí trong kỳ. Càng thấp càng tốt.", period: periodLabel(d), previous: ("Kỳ trước", Fmt.shortVnd(p.costPerLead))) } label: {
                KpiCard(icon: "megaphone.fill", tint: .orange, label: "Chi phí / số", value: Fmt.shortVnd(c.costPerLead), delta: c.costPerLead.flatMap { Fmt.delta($0, p.costPerLead) }, deltaGood: c.costPerLead.flatMap { a in p.costPerLead.map { a <= $0 } })
            }.buttonStyle(.plain)
        }
    }

    // MARK: Tách theo

    private struct Row: Identifiable {
        let id: String; let name: String; var sub: String? = nil; let m: API.RoasMetrics; var prevNet: Double? = nil
        var active = false; var dim = false
    }

    @ViewBuilder private func breakdown(_ d: API.MktAnalytics) -> some View {
        let unit = d.bucket == "week" ? "Tuần" : d.bucket == "month" ? "Tháng" : "Ngày"
        VStack(alignment: .leading, spacing: 10) {
            Text("Tách theo").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink)
            Segmented(selection: $tab, options: [(.people, "Marketer"), (.teams, "Team"), (.products, "Sản phẩm"), (.time, unit)])
            let rows = rowsFor(d)
            if tab == .products { Text("Sản phẩm theo cột Sản phẩm của sheet chi phí; doanh thu, đơn, số lấy từ đơn Pancake có nhãn hoặc tên sản phẩm khớp. Một đơn nhiều sản phẩm được tính ở mỗi sản phẩm.").font(.system(size: 10)).foregroundStyle(Color.inkSoft).fixedSize(horizontal: false, vertical: true) }
            if tab != .time && !rows.isEmpty { Text("Chạm một dòng để xem riêng, chạm lại để bỏ.").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
            if rows.isEmpty {
                Panel { Text("Không có chi phí hoặc đơn Marketing trong phạm vi đang chọn.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) }
            } else {
                let shown = showAll ? rows : Array(rows.prefix(12))
                let maxV = max(1, rows.map { max($0.m.net, $0.m.cost) }.max() ?? 1)
                VStack(spacing: 0) {
                    ForEach(Array(shown.enumerated()), id: \.element.id) { i, r in
                        let line = MktRowView(row: r.name, sub: r.sub, m: r.m, prevNet: r.prevNet, maxV: maxV, active: r.active, dim: r.dim, rank: tab == .people ? i + 1 : nil)
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
                r.append(Row(id: x.id, name: x.name, sub: sub, m: x.m, prevNet: x.prevNet, active: x.id == marketerId, dim: marketerId != nil && x.id != marketerId))
            }
        case .teams:
            for x in d.teams { r.append(Row(id: x.id, name: x.name, sub: "\(Fmt.int(x.people)) marketer", m: x.m, prevNet: x.prevNet, active: x.id == teamId && marketerId == nil)) }
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
        var s = "Chi phí quảng cáo từ Google Sheet CPQC Daily (và chi phí nhập tay trên web). Doanh thu từ đơn Pancake có Marketer đã xác nhận, theo ngày xác nhận, sau giảm giá. So với kỳ trước \(range(d.previous.start, d.previous.end))"
        if let c = d.previous.cutoff { s += " tới \(c)" }
        if let u = d.previous.costUntil, u < d.previous.end { s += "; hôm nay chưa có chi phí nên chi phí kỳ trước tính tới hết \(Fmt.day(u))" }
        return s + "."
    }

    // MARK: Tải số

    @MainActor private func load() async {
        let k = key, r = period.range
        loading = true
        do {
            let d = try await API.mktAnalytics(start: r.0, end: r.1, marketerId: marketerId, teamId: teamId, product: product)
            guard k == key else { return }
            data = d; error = nil
        } catch {
            guard k == key, !Task.isCancelled else { return }
            self.error = error.localizedDescription
        }
        loading = false
    }
}

// MARK: Thẻ số

/// Ô số lớn (chi phí, doanh thu MKT) có dải màu trên đầu như web; chạm xem cách tính.
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

/// ROAS trên nền xanh đậm như thẻ doanh thu ở Trang chủ: số to màu chanh và câu "1 ₫ quảng cáo mang về … ₫".
private struct RoasCard: View {
    @Environment(\.thinking) private var thinking
    let now: API.RoasMetrics; let prev: API.RoasMetrics
    let tap: () -> Void
    var body: some View {
        let d = now.roas.flatMap { a in Fmt.delta(a, prev.roas) }
        Button(action: tap) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Image(systemName: "chart.line.uptrend.xyaxis").font(.system(size: 12, weight: .semibold))
                        Text("ROAS").font(.system(size: 13, weight: .semibold))
                        Image(systemName: "info.circle").font(.system(size: 11))
                    }.foregroundStyle(.white.opacity(0.85))
                    Text(Fmt.roas(now.roas)).font(.system(size: 34, weight: .bold, design: .rounded)).foregroundStyle(Color.lime).monospacedDigit().rolling(Fmt.roas(now.roas))
                    Text(now.roas.map { "1 ₫ quảng cáo mang về \(Fmt.roasPlain($0)) ₫ doanh thu" } ?? "Cần chi phí trong kỳ để tính ROAS")
                        .font(.system(size: 12, weight: .medium)).foregroundStyle(.white.opacity(0.9)).fixedSize(horizontal: false, vertical: true)
                    if now.partial, now.roas != nil {
                        Text("Chỉ tính \(Fmt.shortVnd(now.coveredNet)) doanh thu của marketer có chi phí").font(.system(size: 10)).foregroundStyle(.white.opacity(0.7)).fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 6) {
                    if let d { MktDelta(text: d, good: !d.hasPrefix("-"), onDark: true) }
                    Text("kỳ trước \(Fmt.roas(prev.roas))").font(.system(size: 11)).foregroundStyle(.white.opacity(0.75))
                }
            }
            .padding(16)
            .background(LinearGradient(colors: [Color.brandDark, Color.brandDeep], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(alignment: .topTrailing) { Circle().fill(Color.lime.opacity(0.08)).frame(width: 150, height: 150).offset(x: 50, y: -60).allowsHitTesting(false) }
            .clipShape(.rect(cornerRadius: 18))
            .shadow(color: Color.brandDeep.opacity(0.22), radius: 10, y: 5)
            .thinkingGlow(thinking, radius: 18)
            .contentShape(.rect)
        }.buttonStyle(.plain)
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

/// Một dòng ở bảng Tách theo: tên, doanh thu và so kỳ trước; thanh chi phí (cam) cạnh doanh thu (xanh); chi phí, ROAS, đơn, chi phí / đơn.
private struct MktRowView: View {
    let row: String; let sub: String?; let m: API.RoasMetrics; let prevNet: Double?; let maxV: Double
    let active: Bool; let dim: Bool; let rank: Int?
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
                        Text(Fmt.shortVnd(m.net)).font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink).monospacedDigit()
                        if let prevNet, prevNet > 0 || m.net > 0, let d = Fmt.delta(m.net, prevNet) {
                            Text(d).font(.system(size: 10, weight: .semibold)).foregroundStyle(d.hasPrefix("-") ? Color.bad : Color.good)
                        }
                    }
                }
                VStack(spacing: 3) {
                    Bar(value: m.cost / maxV, tint: .orange, height: 5)
                    Bar(value: m.net / maxV, tint: .good, height: 5)
                }
                Text("Chi phí \(Fmt.short(m.cost)) · ROAS \(Fmt.roas(m.roas)) · \(Fmt.int(m.closed)) đơn · CP/đơn \(m.costPerClosed.map { Fmt.short($0) } ?? "—")")
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

/// Chi phí (cột cam) và doanh thu MKT (đường xanh) theo ngày / tuần / tháng, đơn vị triệu ₫; chạm hoặc kéo để xem từng ngày.
private struct MktChart: View {
    let points: [API.RoasPoint]; let bucket: String
    @State private var picked: Date?
    private struct P: Identifiable { let id: String; let date: Date; let cost: Double; let net: Double; let p: API.RoasPoint }
    private var unit: Calendar.Component { bucket == "month" ? .month : bucket == "week" ? .weekOfYear : .day }
    private var axisFormat: Date.FormatStyle { bucket == "month" ? Date.FormatStyle().month(.defaultDigits).year(.twoDigits) : Date.FormatStyle().day().month(.defaultDigits) }
    private static func date(_ key: String) -> Date? {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = VNDate.tz
        let p = key.split(separator: "-").compactMap { Int($0) }
        guard p.count >= 2 else { return nil }
        return cal.date(from: DateComponents(year: p[0], month: p[1], day: p.count > 2 ? p[2] : 1, hour: 12))
    }
    private var rows: [P] { points.compactMap { x in Self.date(x.key).map { P(id: x.key, date: $0, cost: x.m.cost / 1e6, net: x.m.net / 1e6, p: x) } } }
    private var selected: P? {
        guard let picked else { return nil }
        return rows.min { abs($0.date.timeIntervalSince(picked)) < abs($1.date.timeIntervalSince(picked)) }
    }
    var body: some View {
        let list = rows
        if list.count > 1 {
            Panel {
                HStack {
                    Text("Chi phí và doanh thu theo \(bucket == "week" ? "tuần" : bucket == "month" ? "tháng" : "ngày")").font(.system(size: 14, weight: .bold)).foregroundStyle(Color.ink)
                    Spacer()
                    Text("triệu ₫").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                }
                HStack(spacing: 12) {
                    legend(.orange, "Chi phí QC"); legend(.good, "Doanh thu MKT")
                    Spacer()
                }
                if let s = selected {
                    Text("\(MarketingView.bucketLabel(s.id, bucket)): chi phí \(Fmt.short(s.p.m.cost)) · doanh thu \(Fmt.short(s.p.m.net)) · ROAS \(Fmt.roas(s.p.m.roas)) · \(Fmt.int(s.p.m.closed)) đơn")
                        .font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink).monospacedDigit().lineLimit(2)
                } else {
                    Text("Chạm hoặc kéo trên biểu đồ để xem từng \(bucket == "week" ? "tuần" : bucket == "month" ? "tháng" : "ngày").").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                }
                Chart {
                    ForEach(list) { r in
                        BarMark(x: .value("Ngày", r.date, unit: unit), y: .value("Chi phí", r.cost))
                            .foregroundStyle(Color.orange.opacity(0.8)).cornerRadius(3)
                    }
                    ForEach(list) { r in
                        AreaMark(x: .value("Ngày", r.date, unit: unit), y: .value("Doanh thu", r.net))
                            .foregroundStyle(LinearGradient(colors: [Color.good.opacity(0.22), Color.good.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                            .interpolationMethod(.monotone)
                        LineMark(x: .value("Ngày", r.date, unit: unit), y: .value("Doanh thu", r.net))
                            .foregroundStyle(Color.good).lineStyle(StrokeStyle(lineWidth: 2.2, lineCap: .round))
                            .interpolationMethod(.monotone)
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
