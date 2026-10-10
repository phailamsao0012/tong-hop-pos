import SwiftUI

// Tổng quan 4 bộ phận (anh Vũ 10/10/2026: "trang chủ mở ra sẽ là tổng quan pos, 4 bộ phận của công ty sẽ hiện ra như trên web").
// Giống 4 bảng đầu trang Tổng quan POS trên web (app/overview-sections.tsx, /api/reports/sections): Sale, CSKH, MKT, Vận đơn,
// không chia theo từng POS. Chạm bảng nào mở chi tiết bộ phận đó (bộ phận không còn tab riêng ở thanh dưới).

extension API {
    struct DeptMoney: Decodable { let orders: Double; let net: Double }
    struct DeptShip: Decodable { let orders: Double; let net: Double; let returned: Double; let returnedNet: Double; let rateOrders: Double?; let rateNet: Double? }
    struct Sections: Decodable {
        struct Sale: Decodable { let orders: Double; let net: Double; let created: Double; let closedNow: Double; let rate: Double? }
        struct Cskh: Decodable {
            let orders: Double; let net: Double; let aov: Double?
            /// Tự upsell (đơn không có Marketer); trên máy chủ tên là "self".
            let own: DeptMoney
            let fromMkt: DeptMoney
            enum CodingKeys: String, CodingKey { case orders, net, aov, own = "self", fromMkt }
        }
        struct Mkt: Decodable { let orders: Double; let net: Double; let aov: Double?; let cost: Double?; let created: Double; let closedNow: Double; let rate: Double? }
        /// other: người bán ngoài Sale / CSKH (số lưu trước 09/10 chưa có).
        struct Shipping: Decodable { let total: DeptShip; let sale: DeptShip; let cskh: DeptShip; let other: DeptShip? }
        let sale: Sale; let cskh: Cskh; let mkt: Mkt; let shipping: Shipping
        let definitions: [String: String]?
        let syncedAt: String?
    }
    static func sections(start: String, end: String, posIds: [String] = [], product: String = "all") async throws -> Sections {
        try await request("/api/reports/sections?start=\(start)&end=\(end)&posIds=\(posIds.joined(separator: ","))&productSegment=\(product)")
    }

    /// Một dòng của trang Vận đơn (lib/van-don.ts): theo bộ phận chốt, theo người gọi xác nhận, hoặc tổng.
    struct VdLine: Decodable, Identifiable {
        let key: String; let label: String; let team: String?; let dept: String?
        let closed: Double; let closedNet: Double; let confirmed: Double; let waiting: Double; let failed: Double; let cancelledAfter: Double
        let sent: Double; let sentNet: Double; let delivered: Double; let returned: Double; let returnedNet: Double
        let confirmRate: Double?; let failRate: Double?; let returnRate: Double?; let returnRateNet: Double?
        var id: String { key }
    }
    struct VdReason: Decodable, Identifiable { let reason: String; let n: Double; var id: String { reason } }
    struct VanDon: Decodable { let total: VdLine; let sellerDepts: [VdLine]; let confirmers: [VdLine]; let reasons: [VdReason]; let syncedAt: String? }
    static func vanDon(start: String, end: String, posIds: [String] = []) async throws -> VanDon {
        try await request("/api/reports/van-don?start=\(start)&end=\(end)&posIds=\(posIds.joined(separator: ","))")
    }
}

/// 4 bộ phận của công ty, theo thứ tự trên web.
enum CompanyDept: String, CaseIterable, Identifiable, Hashable {
    case sale, cskh, mkt, vandon
    var id: String { rawValue }
    var title: String {
        switch self { case .sale: return "Sale"; case .cskh: return "CSKH"; case .mkt: return "MKT"; case .vandon: return "Vận đơn" }
    }
    /// Tên trang chi tiết khi mở từ bảng.
    var pageTitle: String {
        switch self { case .sale: return "Sale"; case .cskh: return "CSKH"; case .mkt: return "Marketing"; case .vandon: return "Vận đơn" }
    }
    var caption: String {
        switch self {
        case .sale: return "Bộ phận Sale · chốt từ Chờ xác nhận"
        case .cskh: return "Khách cũ và khách MKT đưa về"
        case .mkt: return "Đơn có Marketer · chốt = đã xác nhận"
        case .vandon: return "Đơn chốt trong kỳ · trạng thái hiện tại"
        }
    }
    var icon: String {
        switch self { case .sale: return "cart.fill"; case .cskh: return "person.2.wave.2.fill"; case .mkt: return "megaphone.fill"; case .vandon: return "truck.box.fill" }
    }
    var tint: Color {
        switch self { case .sale: return .good; case .cskh: return .teal; case .mkt: return .blue; case .vandon: return .warn }
    }
    /// Khoá trong "definitions" của /api/reports/sections.
    var definitionKey: String { self == .mkt ? "MKT" : title }
}

/// Màu theo tỷ lệ hoàn như web: dưới 10% tốt, 10–20% cần để ý, từ 20% xấu.
func returnTone(_ rate: Double?) -> Color {
    guard let rate else { return .inkSoft }
    return rate >= 20 ? .bad : rate >= 10 ? .warn : .good
}

extension Fmt {
    /// Tiền gọn có đơn vị: "12,5 tr ₫", "—" khi chưa có.
    static func shortVnd(_ n: Double?) -> String { n.map { short($0) + " ₫" } ?? "—" }
    /// ROAS = doanh thu ÷ chi phí: "2,45".
    static func ratio(_ n: Double?) -> String { n.map { String(format: "%.2f", $0).replacingOccurrences(of: ".", with: ",") } ?? "—" }
}

/// Bảng hiện dần từ dưới lên, lần lượt từng bảng.
struct StaggerIn: ViewModifier {
    let index: Int
    @State private var on = false
    @Environment(\.accessibilityReduceMotion) private var reduce
    func body(content: Content) -> some View {
        content
            .opacity(on || reduce ? 1 : 0)
            .offset(y: on || reduce ? 0 : 18)
            .scaleEffect(on || reduce ? 1 : 0.98, anchor: .top)
            .onAppear {
                guard !on else { return }
                withAnimation(.spring(duration: 0.55, bounce: 0.18).delay(Double(index) * 0.08)) { on = true }
            }
    }
}

// MARK: 4 bảng

/// 4 bảng bộ phận; chưa có số thì hiện khung chờ.
struct DeptBoards: View {
    let data: API.Sections?
    /// Kỳ và POS đang xem: trang chi tiết Vận đơn mở đúng kỳ, đúng POS.
    var period: Period = .today
    var pos = ""
    var body: some View {
        if let d = data {
            VStack(spacing: 12) {
                ForEach(Array(CompanyDept.allCases.enumerated()), id: \.element) { i, dept in
                    NavigationLink(value: Route.dept(dept, period: period, pos: pos)) { board(dept, d) }
                        .buttonStyle(.plain)
                        .modifier(StaggerIn(index: i))
                        .id(dept.rawValue)
                }
            }
        } else {
            VStack(spacing: 12) { ForEach(0..<4, id: \.self) { _ in Skeleton(height: 168) } }
        }
    }
    @ViewBuilder private func board(_ dept: CompanyDept, _ d: API.Sections) -> some View {
        switch dept {
        case .sale: SaleBoard(s: d.sale)
        case .cskh: CskhBoard(c: d.cskh)
        case .mkt: MktBoard(m: d.mkt)
        case .vandon: VanDonBoard(s: d.shipping)
        }
    }
}

/// Khung một bảng như web: vạch màu mép trên, icon trong ô màu, tên + chú thích, số chính bên phải, các ô chi tiết bên dưới.
struct DeptBoard<Tiles: View>: View {
    let dept: CompanyDept
    let heroLabel: String; let hero: String; let heroNote: String
    @ViewBuilder let tiles: Tiles
    @Environment(\.thinking) private var thinking
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: dept.icon).font(.system(size: 16, weight: .semibold)).foregroundStyle(dept.tint)
                    .frame(width: 38, height: 38).background(dept.tint.opacity(0.13), in: .rect(cornerRadius: 11))
                VStack(alignment: .leading, spacing: 2) {
                    Text(dept.title).font(.system(size: 17, weight: .bold)).foregroundStyle(Color.ink)
                    Text(dept.caption).font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 6)
                VStack(alignment: .trailing, spacing: 1) {
                    Text(heroLabel.uppercased()).font(.system(size: 9, weight: .semibold)).tracking(0.6).foregroundStyle(Color.inkSoft)
                    Text(hero).font(.system(size: 21, weight: .bold, design: .rounded)).monospacedDigit().foregroundStyle(Color.ink)
                        .lineLimit(1).minimumScaleFactor(0.6).rolling(hero)
                    Text(heroNote).font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1).minimumScaleFactor(0.8)
                }
                .layoutPriority(1)
            }
            tiles
            HStack(spacing: 3) {
                Spacer()
                Text("Xem chi tiết \(dept.pageTitle)")
                Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold))
            }
            .font(.system(size: 11, weight: .semibold)).foregroundStyle(dept.tint)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.card)
        .overlay(alignment: .top) { dept.tint.frame(height: 3) }
        .clipShape(.rect(cornerRadius: 16))
        .cardShadow()
        .thinkingGlow(thinking, radius: 16)
        .contentShape(.rect(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityHint("Chạm để xem chi tiết \(dept.pageTitle)")
    }
}

/// Ô chi tiết trong bảng: icon + nhãn, số, ghi chú, thanh tỷ lệ (0–100).
struct DeptTile: View {
    let icon: String; let label: String; let value: String
    var note: String? = nil
    var bar: Double? = nil
    var tint: Color = .brand
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 3) {
                Image(systemName: icon).font(.system(size: 9, weight: .semibold))
                Text(label).lineLimit(1).minimumScaleFactor(0.75)
            }
            .font(.system(size: 10, weight: .medium)).foregroundStyle(Color.inkSoft)
            Text(value).font(.system(size: 15, weight: .bold, design: .rounded)).monospacedDigit().foregroundStyle(Color.ink)
                .lineLimit(1).minimumScaleFactor(0.55).rolling(value)
            if let note { Text(note).font(.system(size: 9)).foregroundStyle(Color.inkSoft).lineLimit(1).minimumScaleFactor(0.75) }
            if let bar { Bar(value: bar / 100, tint: tint, height: 4).padding(.top, 3) }
        }
        .padding(.horizontal, 9).padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(Color.cream, in: .rect(cornerRadius: 10))
    }
}

struct SaleBoard: View {
    let s: API.Sections.Sale
    var body: some View {
        let t = CompanyDept.sale.tint
        DeptBoard(dept: .sale, heroLabel: "Doanh thu", hero: Fmt.vnd(s.net), heroNote: "\(Fmt.int(s.orders)) đơn chốt") {
            HStack(alignment: .top, spacing: 8) {
                DeptTile(icon: "checkmark.circle.fill", label: "Đơn chốt", value: Fmt.int(s.orders), note: "chờ XN + đã XN", tint: t)
                DeptTile(icon: "target", label: "Tỷ lệ chốt", value: Fmt.pct(s.rate), note: "\(Fmt.int(s.closedNow)) ÷ \(Fmt.int(s.created)) đơn lên", bar: s.rate, tint: t)
                DeptTile(icon: "creditcard.fill", label: "AOV", value: Fmt.shortVnd(s.orders > 0 ? s.net / s.orders : nil), note: "doanh thu ÷ đơn", tint: t)
            }
        }
    }
}

struct CskhBoard: View {
    let c: API.Sections.Cskh
    var body: some View {
        let t = CompanyDept.cskh.tint
        let selfShare: Double? = c.orders > 0 ? c.own.orders / c.orders * 100 : nil
        DeptBoard(dept: .cskh, heroLabel: "Doanh thu", hero: Fmt.vnd(c.net), heroNote: "\(Fmt.int(c.orders)) đơn chốt") {
            HStack(alignment: .top, spacing: 8) {
                DeptTile(icon: "creditcard.fill", label: "AOV", value: Fmt.shortVnd(c.aov), note: "doanh thu ÷ đơn", tint: t)
                DeptTile(icon: "arrow.triangle.2.circlepath", label: "Tự upsell · \(Fmt.pct0(selfShare))", value: Fmt.int(c.own.orders), note: Fmt.shortVnd(c.own.net), bar: selfShare, tint: t)
                DeptTile(icon: "megaphone.fill", label: "Từ MKT · \(Fmt.pct0(selfShare.map { 100 - $0 }))", value: Fmt.int(c.fromMkt.orders), note: Fmt.shortVnd(c.fromMkt.net), bar: selfShare.map { 100 - $0 }, tint: .blue)
            }
        }
    }
}

struct MktBoard: View {
    let m: API.Sections.Mkt
    var body: some View {
        let t = CompanyDept.mkt.tint
        let roas: Double? = (m.cost ?? 0) > 0 ? m.net / m.cost! : nil
        DeptBoard(dept: .mkt, heroLabel: "Doanh thu", hero: Fmt.vnd(m.net), heroNote: "\(Fmt.int(m.orders)) đơn đã xác nhận") {
            Grid(horizontalSpacing: 8, verticalSpacing: 8) {
                GridRow {
                    DeptTile(icon: "wallet.pass.fill", label: "Chi phí", value: Fmt.shortVnd(m.cost), note: m.cost == nil ? "chưa có số liệu" : "ROAS \(Fmt.ratio(roas))", tint: t)
                    DeptTile(icon: "target", label: "Tỷ lệ chốt", value: Fmt.pct(m.rate), note: "\(Fmt.int(m.closedNow)) ÷ \(Fmt.int(m.created)) đơn lên", bar: m.rate, tint: t)
                }
                GridRow {
                    DeptTile(icon: "creditcard.fill", label: "AOV", value: Fmt.shortVnd(m.aov), note: "doanh thu ÷ đơn XN", tint: t)
                    DeptTile(icon: "checkmark.seal.fill", label: "Đơn đã XN", value: Fmt.int(m.orders), note: "theo ngày XN đầu", tint: t)
                }
            }
        }
    }
}

struct VanDonBoard: View {
    let s: API.Sections.Shipping
    var body: some View {
        let total = s.total
        // Vận đơn không trực tiếp bán nên không gọi là doanh thu (anh Vũ 09/10/2026): tiền là giá trị đơn chuyển / giá trị hoàn.
        DeptBoard(dept: .vandon, heroLabel: "Số đơn chuyển", hero: "\(Fmt.int(total.orders)) đơn",
                  heroNote: "giá trị \(Fmt.shortVnd(total.net)) · hoàn \(Fmt.pct(total.rateOrders))") {
            ShipTable(rows: shipRows)
        }
    }
    private var shipRows: [(String, API.DeptShip)] {
        var r: [(String, API.DeptShip)] = [("Sale", s.sale), ("CSKH", s.cskh)]
        if let o = s.other, o.orders > 0 { r.append(("Khác", o)) }
        r.append(("Tổng", s.total))
        return r
    }
}

/// Bảng đơn chuyển / hoàn theo bộ phận: số đơn kèm giá trị bên dưới, % hoàn theo đơn và theo giá trị.
struct ShipTable: View {
    let rows: [(String, API.DeptShip)]
    var body: some View {
        Grid(alignment: .trailing, horizontalSpacing: 10, verticalSpacing: 7) {
            GridRow {
                Text("Bộ phận").gridColumnAlignment(.leading)
                Text("Đơn chuyển")
                Text("Hoàn")
                Text("% hoàn đơn · giá trị")
            }
            .font(.system(size: 9, weight: .semibold)).foregroundStyle(Color.inkSoft)
            Divider().gridCellUnsizedAxes(.horizontal)
            ForEach(rows, id: \.0) { label, r in
                let bold = label == "Tổng"
                GridRow {
                    Text(label).font(.system(size: 12, weight: bold ? .bold : .semibold)).foregroundStyle(Color.ink).gridColumnAlignment(.leading)
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(Fmt.int(r.orders)).font(.system(size: 12, weight: bold ? .bold : .semibold)).monospacedDigit().foregroundStyle(Color.ink)
                        Text(Fmt.shortVnd(r.net)).font(.system(size: 9)).foregroundStyle(Color.inkSoft)
                    }
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(Fmt.int(r.returned)).font(.system(size: 12, weight: bold ? .bold : .semibold)).monospacedDigit().foregroundStyle(Color.ink)
                        Text(Fmt.shortVnd(r.returnedNet)).font(.system(size: 9)).foregroundStyle(Color.inkSoft)
                    }
                    HStack(spacing: 4) {
                        Text(Fmt.pct(r.rateOrders)).foregroundStyle(returnTone(r.rateOrders))
                        Text("·").foregroundStyle(Color.inkSoft)
                        Text(Fmt.pct(r.rateNet)).foregroundStyle(returnTone(r.rateNet))
                    }
                    .font(.system(size: 11, weight: .semibold)).monospacedDigit()
                }
            }
        }
        .lineLimit(1).minimumScaleFactor(0.7)
    }
}

// MARK: Trang chi tiết bộ phận

/// Khung trang chi tiết mở từ bảng: thanh điều hướng xanh, nội dung cuộn trên nền kem (như trang gốc của tab cũ).
struct DeptPage<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 14) { content }.padding(16).padding(.bottom, 24) }
            .background(Color.cream)
            .navigationTitle(title).navigationBarTitleDisplayMode(.inline).brandNav()
    }
}

struct DeptDestination: View {
    let dept: CompanyDept
    var period: Period = .today
    var pos = ""
    var body: some View {
        switch dept {
        case .sale: DeptPage(title: dept.pageTitle) { SaleContent() }
        case .cskh: DeptPage(title: dept.pageTitle) { CskhContent() }
        case .mkt: DeptPage(title: dept.pageTitle) { MarketingView() }
        case .vandon: VanDonView(period: period, pos: pos)
        }
    }
}

/// Sale: Nhân viên, Data, Đơn hàng, Trong ca (trước là tab Sale).
struct SaleContent: View {
    @Environment(AuthModel.self) private var auth
    @State private var page = "compare"
    private var pages: [WebPage] { SALE_PAGES.filter { auth.me?.canView($0.id) ?? false } }
    var body: some View {
        Group {
            SubNav(selection: $page, pages: pages)
            switch page {
            case "shift": ShiftView()
            case "batches": BatchesView(embedded: true)
            case "pipeline": PipelineView(embedded: true)
            default: CompareView(team: "sale", embedded: true)
            }
        }
        .onAppear { if !pages.contains(where: { $0.id == page }), let f = pages.first { page = f.id } }
    }
}

/// CSKH: vào là thấy doanh thu và tiến độ KPI trước (03/10/2026); cuộc gọi, khách… là trang con kế bên (trước là tab CSKH).
struct CskhContent: View {
    @Environment(AuthModel.self) private var auth
    @State private var page = "cskh-overview"
    private var pages: [WebPage] { CSKH_PAGES.filter { auth.me?.canView($0.id) ?? false } }
    var body: some View {
        Group {
            SubNav(selection: $page, pages: pages)
            switch page {
            case "care": CareView(embedded: true)
            case "repurchase": RepurchaseView(embedded: true)
            case "dormant": DormantView(embedded: true)
            case "cskh-kpi": KpiView(embedded: true)
            case "calls": CallsView(embedded: true)
            default: CskhOverviewView(embedded: true)
            }
        }
        .onAppear { if !pages.contains(where: { $0.id == page }), let f = pages.first { page = f.id } }
    }
}

// MARK: Vận đơn

/// Trang Vận đơn (như web /?view=van-don, /api/reports/van-don): đơn chốt trong kỳ đi tới đâu, hoàn bao nhiêu,
/// theo bộ phận chốt đơn và theo người gọi xác nhận; lý do không xác nhận được.
struct VanDonView: View {
    @State private var period: Period
    @State private var pos: String
    @State private var data: API.VanDon?
    @State private var error: String?
    @State private var loading = false
    init(period: Period = .today, pos: String = "") {
        _period = State(initialValue: period)
        _pos = State(initialValue: pos)
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center) {
                    Text("Đơn chốt trong kỳ (theo ngày chốt), xét trạng thái hiện tại").font(.system(size: 11)).foregroundStyle(Color.inkSoft)
                    Spacer(minLength: 8)
                    PeriodMenu(period: $period)
                }
                PosChipRow(selection: $pos)
                if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").font(.subheadline).foregroundStyle(Color.bad) }
                if let d = data {
                    summary(d.total)
                    funnel(d.total)
                    byDept(d)
                    confirmers(d)
                    reasons(d)
                    if let at = d.syncedAt { Text("Số Pancake · đồng bộ \(Fmt.dateTime(at))").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                } else if error == nil {
                    SkeletonGrid(tiles: 4)
                }
            }
            .padding(16).padding(.bottom, 24)
        }
        .background(Color.cream)
        .environment(\.thinking, loading && data != nil)
        .navigationTitle("Vận đơn").navigationBarTitleDisplayMode(.inline).brandNav()
        .refreshable { await load() }
        .task(id: "\(period.key)|\(pos)") { await load() }
    }

    private func summary(_ t: API.VdLine) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            KpiCard(icon: "paperplane.fill", tint: .warn, label: "Đơn chuyển", value: Fmt.int(t.sent), note: "giá trị \(Fmt.shortVnd(t.sentNet))")
            KpiCard(icon: "arrow.uturn.backward.circle.fill", tint: returnTone(t.returnRate), label: "Hoàn · \(Fmt.pct(t.returnRate))", value: Fmt.int(t.returned), note: "giá trị \(Fmt.shortVnd(t.returnedNet)) · \(Fmt.pct(t.returnRateNet))")
            KpiCard(icon: "shippingbox.fill", tint: .good, label: "Đã nhận", value: Fmt.int(t.delivered), note: "khách đã nhận hàng")
            KpiCard(icon: "phone.down.fill", tint: .bad, label: "Không xác nhận được", value: Fmt.int(t.failed), note: "tỷ lệ \(Fmt.pct(t.failRate))")
        }
    }

    private func funnel(_ t: API.VdLine) -> some View {
        Panel {
            HStack { Text("Từ chốt đến giao").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink); Spacer(); Hint(text: "Số đơn") }
            FunnelLine(label: "Đơn chốt", n: t.closed, of: t.closed, tint: .good)
            FunnelLine(label: "Đã xác nhận", n: t.confirmed, of: t.closed, tint: .blue)
            FunnelLine(label: "Đã gửi đi", n: t.sent, of: t.closed, tint: .warn)
            FunnelLine(label: "Đã nhận", n: t.delivered, of: t.closed, tint: .good)
            FunnelLine(label: "Hoàn", n: t.returned, of: t.closed, tint: .bad)
            HStack(spacing: 6) {
                Tag(text: "Chờ xác nhận \(Fmt.int(t.waiting))", tone: .gray)
                Tag(text: "Không XN được \(Fmt.int(t.failed))", tone: .red)
                Tag(text: "Hủy sau XN \(Fmt.int(t.cancelledAfter))", tone: .orange)
            }
        }
    }

    private func byDept(_ d: API.VanDon) -> some View {
        Panel {
            HStack { Text("Theo bộ phận chốt đơn").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink); Spacer(); Hint(text: "Hoàn tính cho người chốt") }
            Grid(alignment: .trailing, horizontalSpacing: 10, verticalSpacing: 7) {
                GridRow {
                    Text("Bộ phận").gridColumnAlignment(.leading)
                    Text("Đơn chốt")
                    Text("Đơn chuyển")
                    Text("Hoàn")
                    Text("% hoàn")
                }
                .font(.system(size: 9, weight: .semibold)).foregroundStyle(Color.inkSoft)
                Divider().gridCellUnsizedAxes(.horizontal)
                ForEach(d.sellerDepts + [d.total]) { r in
                    let bold = r.key == "total"
                    GridRow {
                        Text(r.label).font(.system(size: 12, weight: bold ? .bold : .semibold)).foregroundStyle(Color.ink).gridColumnAlignment(.leading)
                        Text(Fmt.int(r.closed)).font(.system(size: 12, weight: bold ? .bold : .regular)).monospacedDigit()
                        VStack(alignment: .trailing, spacing: 0) {
                            Text(Fmt.int(r.sent)).font(.system(size: 12, weight: bold ? .bold : .semibold)).monospacedDigit()
                            Text(Fmt.shortVnd(r.sentNet)).font(.system(size: 9)).foregroundStyle(Color.inkSoft)
                        }
                        VStack(alignment: .trailing, spacing: 0) {
                            Text(Fmt.int(r.returned)).font(.system(size: 12, weight: bold ? .bold : .semibold)).monospacedDigit()
                            Text(Fmt.shortVnd(r.returnedNet)).font(.system(size: 9)).foregroundStyle(Color.inkSoft)
                        }
                        Text(Fmt.pct(r.returnRate)).font(.system(size: 11, weight: .semibold)).monospacedDigit().foregroundStyle(returnTone(r.returnRate))
                    }
                    .foregroundStyle(Color.ink)
                }
            }
            .lineLimit(1).minimumScaleFactor(0.7)
        }
    }

    @ViewBuilder private func confirmers(_ d: API.VanDon) -> some View {
        // Người gọi khách xác nhận: ưu tiên người phòng Vận đơn; chưa gắn phòng thì hiện những người xác nhận nhiều đơn nhất.
        let team = d.confirmers.filter { $0.dept == "Vận đơn" }
        let rows = Array((team.isEmpty ? d.confirmers : team).prefix(10))
        if !rows.isEmpty {
            Panel {
                HStack { Text("Người gọi xác nhận").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink); Spacer(); Hint(text: "Tỷ lệ XN · tỷ lệ hoàn") }
                ForEach(rows) { r in
                    HStack(spacing: 10) {
                        Avatar(name: r.label, size: 30)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(r.label).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                            Text("đã XN \(Fmt.int(r.confirmed)) · không XN \(Fmt.int(r.failed)) · gửi \(Fmt.int(r.sent))").font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1)
                        }
                        Spacer(minLength: 6)
                        VStack(alignment: .trailing, spacing: 1) {
                            Text("XN \(Fmt.pct(r.confirmRate))").font(.system(size: 11, weight: .bold)).monospacedDigit().foregroundStyle(Color.ink)
                            Text("hoàn \(Fmt.pct(r.returnRate))").font(.system(size: 10, weight: .semibold)).monospacedDigit().foregroundStyle(returnTone(r.returnRate))
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    @ViewBuilder private func reasons(_ d: API.VanDon) -> some View {
        let top = Array(d.reasons.prefix(8))
        if !top.isEmpty {
            let maxN = max(1, top.map(\.n).max() ?? 1)
            Panel {
                HStack { Text("Lý do không xác nhận được").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink); Spacer(); Hint(text: "Thẻ \"VĐ: lý do\"") }
                ForEach(top) { r in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(r.reason).font(.system(size: 12)).foregroundStyle(Color.ink).lineLimit(1)
                            Spacer()
                            Text(Fmt.int(r.n)).font(.system(size: 12, weight: .bold)).monospacedDigit().foregroundStyle(Color.ink)
                        }
                        Bar(value: r.n / maxN, tint: .bad, height: 5)
                    }
                }
            }
        }
    }

    @MainActor private func load() async {
        loading = true; defer { loading = false }
        let r = period.range
        do { data = try await API.vanDon(start: r.0, end: r.1, posIds: pos.isEmpty ? [] : [pos]); error = nil }
        catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}
