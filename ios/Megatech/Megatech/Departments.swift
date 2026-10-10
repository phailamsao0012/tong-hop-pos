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
        /// Nhóm đơn của số này (máy chủ trả lại): ghi chú theo số đang hiện, không theo nút vừa bấm khi đang tải.
        let productSegment: String?
        /// Kỳ của số này (máy chủ trả lại) và cách tính Vận đơn ("sent" / "closed", thiếu = cách cũ), xem VdBasis.
        let period: DayRange?
        let sentBasis: String?
    }
    struct DayRange: Decodable {
        let start: String; let end: String
        /// Số ngày trong kỳ (cả hai đầu); nil khi ngày sai dạng.
        var days: Int? {
            guard let a = VNDate.date(start), let b = VNDate.date(end) else { return nil }
            return Int((b.timeIntervalSince(a) / 86400).rounded()) + 1
        }
    }
    static func sections(start: String, end: String, posIds: [String] = [], product: String = "all") async throws -> Sections {
        try await request("/api/reports/sections?start=\(start)&end=\(end)&posIds=\(posIds.joined(separator: ","))&productSegment=\(product)")
    }

    /// Một dòng của trang Vận đơn (lib/van-don.ts): theo bộ phận người lên đơn (Sale / CSKH), theo người gọi xác nhận, hoặc tổng.
    struct VdLine: Decodable, Identifiable {
        let key: String; let label: String; let team: String?; let dept: String?
        let closed: Double; let closedNet: Double; let confirmed: Double; let waiting: Double; let failed: Double; let cancelledAfter: Double
        let sent: Double; let sentNet: Double; let delivered: Double; let returned: Double; let returnedNet: Double
        let confirmRate: Double?; let failRate: Double?; let returnRate: Double?; let returnRateNet: Double?
        var id: String { key }
    }
    struct VdReason: Decodable, Identifiable { let reason: String; let n: Double; var id: String { reason } }
    struct VanDon: Decodable {
        let total: VdLine; let sellerDepts: [VdLine]; let confirmers: [VdLine]; let reasons: [VdReason]; let syncedAt: String?
        let period: DayRange?
        let sentBasis: String?
    }
    static func vanDon(start: String, end: String, posIds: [String] = []) async throws -> VanDon {
        try await request("/api/reports/van-don?start=\(start)&end=\(end)&posIds=\(posIds.joined(separator: ","))")
    }
}

/// Cách tính số Vận đơn máy chủ trả về (trường sentBasis của /api/reports/van-don và /api/reports/sections).
/// Anh Vũ 10/10/2026 chọn tính doanh số chuyển đi theo ngày gửi hàng: "sent" = đơn chuyển đi, doanh số chuyển đi, đã nhận, hoàn,
/// tỷ lệ hoàn theo ngày gửi hàng; đơn vào Chờ xác nhận, đã xác nhận, còn chờ, không xác nhận được vẫn theo ngày vào Chờ xác nhận.
/// "closed" hoặc thiếu trường (web chưa có bản mới) = mọi số theo ngày vào Chờ xác nhận, xét trạng thái hiện tại.
enum VdBasis {
    case sent, closed
    init(_ raw: String?) { self = raw == "sent" ? .sent : .closed }
    /// Kỳ từ 14 ngày trở xuống: đơn mới gửi chưa kịp hoàn nên tỷ lệ hoàn còn thấp (QA web tổng 10/10/2026: không so tăng / giảm
    /// tỷ lệ hoàn cho kỳ ngắn; app không hiện tăng / giảm tỷ lệ hoàn ở đâu cả).
    static func short(_ p: API.DayRange?) -> Bool { (p?.days ?? 99) <= 14 }
    static let shortNote = "Kỳ ngắn: đơn mới gửi chưa kịp hoàn nên tỷ lệ hoàn còn thấp."
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
        case .vandon: return "Đơn vào Chờ xác nhận trong kỳ · trạng thái hiện tại"
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
    /// Cách tính Vận đơn do app ghi (web thật còn chữ "đơn chốt" đến khi bản sửa của web lên). Anh Vũ 10/10/2026: Vận đơn không bán
    /// hàng, không chốt đơn; số đơn là "đơn chuyển đi", tiền là "doanh số chuyển đi", không phải doanh thu. Cùng chữ với web:
    /// "đơn vào Chờ xác nhận" (Sale, CSKH đưa sang), "người lên đơn", "giá trị hoàn".
    static func vanDonDefinition(_ basis: VdBasis) -> String {
        switch basis {
        case .sent:
            return "Vận đơn không bán hàng nên không có doanh thu. Đơn chuyển đi = đơn giao cho đơn vị vận chuyển trong kỳ, theo ngày gửi hàng (đã gửi, đã nhận, đã thu tiền, hoàn): đơn vào Chờ xác nhận từ kỳ trước mà trong kỳ mới gửi thì tính vào kỳ này. Doanh số chuyển đi = tiền các đơn đó, sau giảm giá, không cộng phí ship, không cộng vào doanh thu. Đã nhận, hoàn (đang hoàn, hoàn một phần, đã hoàn), giá trị hoàn, tỷ lệ hoàn theo số đơn và theo giá trị tính trên các đơn chuyển đi đó; kỳ ngắn thì tỷ lệ hoàn còn thấp vì đơn mới gửi chưa kịp hoàn. Đơn vào Chờ xác nhận, đã xác nhận, không xác nhận được vẫn theo ngày vào Chờ xác nhận lần đầu."
        case .closed:
            return "Vận đơn không bán hàng nên không có doanh thu. Đơn vào Chờ xác nhận trong kỳ (Sale, CSKH đưa sang, theo ngày vào Chờ xác nhận lần đầu), xét trạng thái hiện tại. Đơn chuyển đi = đã giao cho đơn vị vận chuyển (đã gửi, đã nhận, đã thu tiền, hoàn); doanh số chuyển đi = tiền các đơn đó, sau giảm giá, không cộng phí ship, không cộng vào doanh thu. Hoàn = đang hoàn, hoàn một phần, đã hoàn; giá trị hoàn = tiền các đơn hoàn. Tỷ lệ hoàn theo số đơn và theo giá trị."
        }
    }
    /// Xem được trang chi tiết của bộ phận (cùng điều kiện với thẻ ở tab Phòng ban).
    func canOpen(_ me: API.Me?) -> Bool {
        guard let me else { return false }
        switch self {
        // Chạm số mở trang đầu của bộ phận (trang tính ra số đó): Sale = So sánh nhân viên, CSKH = Tổng quan CSKH,
        // MKT = trang Marketing (đọc /api/marketing/analytics, cổng mkt-roas như số MKT ở Trang chủ).
        case .sale: return me.canView("compare")
        case .cskh: return me.canView("cskh-overview")
        case .mkt: return me.canView("mkt-roas")
        case .vandon: return me.canView("van-don")
        }
    }
}

/// Bảng đang nằm trong một liên kết (hiện "Xem chi tiết …"); false khi người dùng không mở được trang chi tiết.
private struct BoardLinkedKey: EnvironmentKey { static let defaultValue = true }
extension EnvironmentValues { var boardLinked: Bool { get { self[BoardLinkedKey.self] } set { self[BoardLinkedKey.self] = newValue } } }

/// Màu theo tỷ lệ hoàn như web: dưới 10% tốt, 10–20% cần để ý, từ 20% xấu.
func returnTone(_ rate: Double?) -> Color {
    guard let rate else { return .inkSoft }
    return rate >= 20 ? .bad : rate >= 10 ? .warn : .good
}

extension Fmt {
    /// Tiền gọn có đơn vị: "12,5 tr ₫", "—" khi chưa có.
    static func shortVnd(_ n: Double?) -> String { n.map { short($0) + " ₫" } ?? "—" }
    /// Tên nhóm đơn (bộ lọc Nhóm đơn ở Tổng quan); "all" = rỗng.
    static func productGroup(_ p: String) -> String { p == "gentadox" ? "Gentadox" : p == "skgk" ? "SK + GK" : p == "all" ? "" : p }
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

/// 4 bảng bộ phận; chưa có số thì hiện khung chờ (tải lỗi thì thôi chờ, lỗi đã báo ở trên).
struct DeptBoards: View {
    let data: API.Sections?
    /// Số Marketing (doanh thu, số về, chi phí mỗi số / đơn) cùng nguồn trang Marketing; nil thì bảng MKT dùng số của data.
    var mkt: API.RoasMetrics? = nil
    var mktRatios = true
    var mktNote: String? = nil
    /// Kỳ, POS, nhóm đơn đang xem: trang chi tiết mở đúng kỳ, đúng POS, đúng nhóm đơn.
    var period: Period = .today
    var pos = ""
    var product = "all"
    /// Người dùng: bảng chỉ chạm được khi xem được trang chi tiết của bộ phận đó (như mục Phòng ban).
    var me: API.Me? = nil
    var failed = false
    var body: some View {
        if let d = data {
            VStack(spacing: 12) {
                ForEach(Array(CompanyDept.allCases.enumerated()), id: \.element) { i, dept in
                    Group {
                        if dept.canOpen(me) {
                            NavigationLink(value: Route.dept(dept, period: period, pos: pos, product: product)) { board(dept, d) }.buttonStyle(.plain)
                        } else {
                            board(dept, d).environment(\.boardLinked, false)
                        }
                    }
                    .modifier(StaggerIn(index: i))
                    .id(dept.rawValue)
                }
            }
        } else if !failed {
            VStack(spacing: 12) { ForEach(0..<4, id: \.self) { _ in Skeleton(height: 168) } }
        }
    }
    @ViewBuilder private func board(_ dept: CompanyDept, _ d: API.Sections) -> some View {
        switch dept {
        case .sale: SaleBoard(s: d.sale)
        case .cskh: CskhBoard(c: d.cskh)
        case .mkt: MktBoard(m: d.mkt, a: mkt, ratios: mktRatios, caveat: mktNote)
        // Trang Vận đơn (/api/reports/van-don) chưa lọc theo nhóm đơn: bảng ghi rõ để không đọc nhầm số khi mở trang.
        case .vandon: VanDonBoard(s: d.shipping, basis: VdBasis(d.sentBasis), short: VdBasis.short(d.period), caveat: Self.vanDonCaveat(d.productSegment ?? product))
        }
    }
    static func vanDonCaveat(_ shown: String) -> String? {
        shown == "all" ? nil : "Số của nhóm \(Fmt.productGroup(shown)). Trang Vận đơn chưa lọc được theo nhóm đơn: mở ra là số của mọi sản phẩm."
    }
}

/// Khung một bảng như web: vạch màu mép trên, icon trong ô màu, tên + chú thích, số chính bên phải, các ô chi tiết bên dưới.
struct DeptBoard<Tiles: View>: View {
    let dept: CompanyDept
    let heroLabel: String; let hero: String; let heroNote: String
    /// Chú thích thay cho dept.caption (vd Vận đơn tính theo ngày gửi hàng).
    var caption: String? = nil
    @ViewBuilder let tiles: Tiles
    @Environment(\.thinking) private var thinking
    @Environment(\.boardLinked) private var linked
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                MetricIcon(dept.icon, size: 16).foregroundStyle(dept.tint)
                    .frame(width: 38, height: 38).background(dept.tint.opacity(0.13), in: .rect(cornerRadius: 11))
                VStack(alignment: .leading, spacing: 2) {
                    Text(dept.title).font(.system(size: 17, weight: .bold)).foregroundStyle(Color.ink)
                    Text(caption ?? dept.caption).font(.system(size: 10)).foregroundStyle(Color.inkSoft).fixedSize(horizontal: false, vertical: true)
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
            if linked {
                HStack(spacing: 3) {
                    Spacer()
                    Text("Xem chi tiết \(dept.pageTitle)")
                    Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold))
                }
                .font(.system(size: 11, weight: .semibold)).foregroundStyle(dept.tint)
            }
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
        .accessibilityHint(linked ? "Chạm để xem chi tiết \(dept.pageTitle)" : "")
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
                MetricIcon(icon, size: 9)
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

/// Doanh thu MKT riêng (anh Vũ 10/10/2026: "phải tách doanh thu của 3 cái ra") cùng số về, chi phí quảng cáo, chi phí mỗi số / đơn.
/// a: số cùng nguồn trang Marketing (/api/marketing/analytics); nil khi lọc nhóm đơn (nguồn đó không lọc được) hoặc không tải được,
/// lúc đó bảng dùng số của /api/reports/sections.
struct MktBoard: View {
    let m: API.Sections.Mkt
    var a: API.RoasMetrics? = nil
    /// false khi đang xem một số POS: chi phí quảng cáo là của mọi POS nên không chia cho số về / đơn, không tính ROAS.
    var ratios = true
    /// Ghi chú phạm vi (ví dụ MKT chưa lọc theo nhóm đơn).
    var caveat: String? = nil
    var body: some View {
        let t = CompanyDept.mkt.tint
        if let a {
            DeptBoard(dept: .mkt, heroLabel: "Doanh thu", hero: Fmt.vnd(a.net), heroNote: "\(Fmt.int(a.closed)) đơn đã xác nhận" + (ratios ? " · ROAS \(Fmt.roas(a.roas))" : "")) {
                Grid(horizontalSpacing: 8, verticalSpacing: 8) {
                    GridRow {
                        DeptTile(icon: "phone.fill", label: "Số về", value: Fmt.int(a.phones), note: "\(Fmt.int(a.orders)) đơn lên", tint: t)
                        DeptTile(icon: "wallet.pass.fill", label: "Chi phí QC", value: a.cost > 0 ? Fmt.shortVnd(a.cost) : "—", note: a.cost > 0 ? (ratios ? "Google Sheet CPQC" : "của mọi POS") : "chưa có số liệu", tint: t)
                    }
                    GridRow {
                        DeptTile(icon: "megaphone.fill", label: "Chi phí / số", value: ratios ? Fmt.shortVnd(a.costPerLead) : "—", note: !ratios ? "chi phí không chia POS" : a.costPerLead == nil ? "chưa có chi phí" : "người có chi phí", tint: t)
                        DeptTile(icon: "creditcard.fill", label: "Chi phí / đơn chốt", value: ratios ? Fmt.shortVnd(a.costPerClosed) : "—", note: !ratios ? "chi phí không chia POS" : a.costPerClosed == nil ? "chưa có chi phí" : "người có chi phí", tint: t)
                    }
                }
                if let caveat { Text(caveat).font(.system(size: 9)).foregroundStyle(Color.inkSoft).fixedSize(horizontal: false, vertical: true) }
            }
        } else {
            DeptBoard(dept: .mkt, heroLabel: "Doanh thu", hero: Fmt.vnd(m.net), heroNote: "\(Fmt.int(m.orders)) đơn đã xác nhận") {
                Grid(horizontalSpacing: 8, verticalSpacing: 8) {
                    GridRow {
                        DeptTile(icon: "ic_m_orders", label: "Đơn lên", value: Fmt.int(m.created), note: "đơn MKT tạo trong kỳ", tint: t)
                        DeptTile(icon: "target", label: "Tỷ lệ chốt", value: Fmt.pct(m.rate), note: "\(Fmt.int(m.closedNow)) ÷ \(Fmt.int(m.created)) đơn lên", bar: m.rate, tint: t)
                    }
                    GridRow {
                        DeptTile(icon: "wallet.pass.fill", label: "Chi phí QC", value: Fmt.shortVnd(m.cost), note: m.cost == nil ? "chưa có số liệu" : ratios ? "mọi nhóm đơn" : "mọi POS, mọi nhóm đơn", tint: t)
                        // Không tự chia chi phí cho đơn trong app (chi phí mọi sản phẩm, đơn đã lọc nhóm): giữ AOV của máy chủ.
                        DeptTile(icon: "creditcard.fill", label: "AOV", value: Fmt.shortVnd(m.aov), note: "doanh thu ÷ đơn XN", tint: t)
                    }
                }
            }
        }
    }
}

struct VanDonBoard: View {
    let s: API.Sections.Shipping
    var basis: VdBasis = .closed
    /// Kỳ ≤ 14 ngày: ghi tỷ lệ hoàn còn thấp.
    var short = false
    var caveat: String? = nil
    var body: some View {
        let total = s.total
        // Vận đơn không bán hàng, không chốt đơn (anh Vũ 10/10/2026): "đơn chuyển đi", "doanh số chuyển đi", không phải doanh thu.
        // Mọi số trên bảng (chuyển đi, hoàn) theo ngày gửi hàng khi máy chủ báo sentBasis "sent".
        DeptBoard(dept: .vandon, heroLabel: "Doanh số chuyển đi", hero: Fmt.vnd(total.net),
                  heroNote: "\(Fmt.int(total.orders)) đơn chuyển đi · hoàn \(Fmt.pct(total.rateOrders))",
                  caption: basis == .sent ? "Đơn chuyển đi trong kỳ · theo ngày gửi hàng" : nil) {
            ShipTable(rows: shipRows)
            if short { Text(VdBasis.shortNote).font(.system(size: 9)).foregroundStyle(Color.inkSoft).fixedSize(horizontal: false, vertical: true) }
            if let caveat { Text(caveat).font(.system(size: 9)).foregroundStyle(Color.warn).fixedSize(horizontal: false, vertical: true) }
        }
    }
    private var shipRows: [(String, API.DeptShip)] {
        var r: [(String, API.DeptShip)] = [("Sale", s.sale), ("CSKH", s.cskh)]
        if let o = s.other, o.orders > 0 { r.append(("Khác", o)) }
        r.append(("Tổng", s.total))
        return r
    }
}

/// Bảng đơn chuyển đi / hoàn theo bộ phận người lên đơn: số đơn kèm tiền bên dưới, % hoàn theo đơn và theo giá trị.
struct ShipTable: View {
    let rows: [(String, API.DeptShip)]
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            grid
            Text("Số lớn: số đơn · số nhỏ: doanh số chuyển đi, giá trị hoàn").font(.system(size: 9)).foregroundStyle(Color.inkSoft).lineLimit(1).minimumScaleFactor(0.8)
        }
    }
    private var grid: some View {
        Grid(alignment: .trailing, horizontalSpacing: 10, verticalSpacing: 7) {
            GridRow {
                Text("Bộ phận lên đơn").gridColumnAlignment(.leading)
                Text("Chuyển đi")
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
    var period: Period? = nil
    var pos = ""
    var product = "all"
    var page = ""
    var body: some View {
        switch dept {
        case .sale: DeptPage(title: dept.pageTitle) { SaleContent(initial: page, period: period, pos: pos, product: product) }
        case .cskh: DeptPage(title: dept.pageTitle) { CskhContent(initial: page, period: period, pos: pos, product: product) }
        case .mkt: DeptPage(title: dept.pageTitle) { MarketingView(period: period, pos: pos) }
        case .vandon: VanDonView(period: period ?? .today, pos: pos)
        }
    }
}

/// Sale: Nhân viên, Data, Đơn hàng, Trong ca (trước là tab Sale).
struct SaleContent: View {
    @Environment(AuthModel.self) private var auth
    @State private var page: String
    /// Kỳ, POS, nhóm đơn của bảng Sale vừa bấm (trang Nhân viên mở đúng kỳ, đúng POS, đúng nhóm đơn).
    private let period: Period?
    private let pos: String
    private let product: String
    init(initial: String = "", period: Period? = nil, pos: String = "", product: String = "all") {
        _page = State(initialValue: initial.isEmpty ? "compare" : initial)
        self.period = period; self.pos = pos; self.product = product
    }
    private var pages: [WebPage] { SALE_PAGES.filter { auth.me?.canView($0.id) ?? false } }
    var body: some View {
        Group {
            SubNav(selection: $page, pages: pages)
            switch page {
            case "shift": ShiftView()
            case "batches": BatchesView(embedded: true)
            case "pipeline": PipelineView(embedded: true)
            default: CompareView(team: "sale", embedded: true, period: period, pos: pos, product: product)
            }
        }
        .onAppear { if !pages.contains(where: { $0.id == page }), let f = pages.first { page = f.id } }
    }
}

/// CSKH: vào là thấy doanh thu và tiến độ KPI trước (03/10/2026); cuộc gọi, khách… là trang con kế bên (trước là tab CSKH).
struct CskhContent: View {
    @Environment(AuthModel.self) private var auth
    @State private var page: String
    /// Kỳ, POS, nhóm đơn của bảng CSKH vừa bấm (Tổng quan CSKH mở đúng kỳ, đúng POS, đúng nhóm đơn).
    private let period: Period?
    private let pos: String
    private let product: String
    init(initial: String = "", period: Period? = nil, pos: String = "", product: String = "all") {
        _page = State(initialValue: initial.isEmpty ? "cskh-overview" : initial)
        self.period = period; self.pos = pos; self.product = product
    }
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
            default: CskhOverviewView(embedded: true, period: period, pos: pos, product: product)
            }
        }
        .onAppear { if !pages.contains(where: { $0.id == page }), let f = pages.first { page = f.id } }
    }
}

// MARK: Vận đơn

/// Trang Vận đơn (như web /?view=van-don, /api/reports/van-don): đơn vào Chờ xác nhận trong kỳ (Sale, CSKH đưa sang) đi tới đâu,
/// hoàn bao nhiêu, theo bộ phận người lên đơn và theo người gọi xác nhận; lý do không xác nhận được. Vận đơn không bán hàng, không chốt đơn
/// (anh Vũ 10/10/2026): số đơn là "đơn chuyển đi", tiền là "doanh số chuyển đi", không phải doanh thu.
/// Máy chủ báo sentBasis "sent" (anh chọn ngày gửi hàng): chuyển đi, đã nhận, hoàn theo ngày gửi hàng, tách khỏi phần đơn vào Chờ xác nhận.
struct VanDonView: View {
    @State private var period: Period
    @State private var pos: String
    @State private var data: API.VanDon?
    @State private var error: String?
    @State private var loading = false
    /// Kỳ|POS của số đang hiện: tải kỳ mới lỗi thì bỏ số cũ, không để số kỳ trước nằm dưới tên kỳ mới.
    @State private var dataKey = ""
    init(period: Period = .today, pos: String = "") {
        _period = State(initialValue: period)
        _pos = State(initialValue: pos)
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center) {
                    // Cách tính theo số đang hiện (chưa có số thì để trống, không đoán).
                    Text(data.map { VdBasis($0.sentBasis) == .sent ? "Chuyển đi, đã nhận, hoàn theo ngày gửi hàng" : "Đơn vào Chờ xác nhận trong kỳ, xét trạng thái hiện tại" } ?? " ")
                        .font(.system(size: 11)).foregroundStyle(Color.inkSoft)
                    Spacer(minLength: 8)
                    PeriodMenu(period: $period)
                }
                PosChipRow(selection: $pos)
                if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").font(.subheadline).foregroundStyle(Color.bad) }
                if let d = data {
                    let basis = VdBasis(d.sentBasis)
                    summary(d.total, basis, short: VdBasis.short(d.period))
                    funnel(d.total, basis)
                    byDept(d, basis)
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

    private func summary(_ t: API.VdLine, _ basis: VdBasis, short: Bool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            KpiCard(icon: "banknote.fill", tint: .warn, label: "Doanh số chuyển đi", value: Fmt.vnd(t.sentNet),
                    note: basis == .sent ? "theo ngày gửi hàng · không phải doanh thu" : "tiền các đơn chuyển đi · không phải doanh thu")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                KpiCard(icon: "paperplane.fill", tint: .warn, label: "Đơn chuyển đi", value: Fmt.int(t.sent), note: basis == .sent ? "gửi đi trong kỳ" : "đã giao vận chuyển")
                KpiCard(icon: "arrow.uturn.backward.circle.fill", tint: returnTone(t.returnRate), label: "Hoàn · \(Fmt.pct(t.returnRate))", value: Fmt.int(t.returned), note: "giá trị \(Fmt.shortVnd(t.returnedNet)) · \(Fmt.pct(t.returnRateNet))")
                KpiCard(icon: "shippingbox.fill", tint: .good, label: "Đã nhận", value: Fmt.int(t.delivered), note: "khách đã nhận hàng")
                KpiCard(icon: "phone.down.fill", tint: .bad, label: "Không xác nhận được", value: Fmt.int(t.failed), note: "tỷ lệ \(Fmt.pct(t.failRate))")
            }
            if short { Label(VdBasis.shortNote, systemImage: "info.circle").font(.system(size: 10)).foregroundStyle(Color.inkSoft).fixedSize(horizontal: false, vertical: true) }
        }
    }

    @ViewBuilder private func funnel(_ t: API.VdLine, _ basis: VdBasis) -> some View {
        switch basis {
        case .closed:
            Panel {
                HStack { Text("Từ Chờ xác nhận đến giao").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink); Spacer(); Hint(text: "Số đơn") }
                FunnelLine(label: "Vào Chờ xác nhận", n: t.closed, of: t.closed, tint: .good)
                FunnelLine(label: "Đã xác nhận", n: t.confirmed, of: t.closed, tint: .blue)
                FunnelLine(label: "Đã chuyển đi", n: t.sent, of: t.closed, tint: .warn)
                FunnelLine(label: "Đã nhận", n: t.delivered, of: t.closed, tint: .good)
                FunnelLine(label: "Hoàn", n: t.returned, of: t.closed, tint: .bad)
                funnelTags(t)
            }
        case .sent:
            // Hai nhóm đơn khác nhau (vào Chờ xác nhận trong kỳ / gửi đi trong kỳ): tách hai khung, không chia số này cho số kia.
            Panel {
                HStack { Text("Đơn vào Chờ xác nhận").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink); Spacer(); Hint(text: "Theo ngày vào Chờ XN") }
                FunnelLine(label: "Vào Chờ xác nhận", n: t.closed, of: t.closed, tint: .good)
                FunnelLine(label: "Đã xác nhận", n: t.confirmed, of: t.closed, tint: .blue)
                funnelTags(t)
            }
            Panel {
                HStack { Text("Đơn chuyển đi").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink); Spacer(); Hint(text: "Theo ngày gửi hàng") }
                FunnelLine(label: "Đã chuyển đi", n: t.sent, of: t.sent, tint: .warn)
                FunnelLine(label: "Đã nhận", n: t.delivered, of: t.sent, tint: .good)
                FunnelLine(label: "Hoàn", n: t.returned, of: t.sent, tint: .bad)
            }
        }
    }
    private func funnelTags(_ t: API.VdLine) -> some View {
        HStack(spacing: 6) {
            Tag(text: "Chờ xác nhận \(Fmt.int(t.waiting))", tone: .gray)
            Tag(text: "Không XN được \(Fmt.int(t.failed))", tone: .red)
            Tag(text: "Hủy sau XN \(Fmt.int(t.cancelledAfter))", tone: .orange)
        }
    }

    private func byDept(_ d: API.VanDon, _ basis: VdBasis) -> some View {
        Panel {
            HStack { Text("Theo người lên đơn").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink); Spacer(); Hint(text: "Hoàn tính cho người lên đơn") }
            Grid(alignment: .trailing, horizontalSpacing: 10, verticalSpacing: 7) {
                GridRow {
                    Text("Bộ phận").gridColumnAlignment(.leading)
                    Text("Vào chờ XN")
                    Text("Chuyển đi")
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
            if basis == .sent {
                Text("Vào chờ XN theo ngày vào Chờ xác nhận; chuyển đi, hoàn theo ngày gửi hàng.").font(.system(size: 9)).foregroundStyle(Color.inkSoft).fixedSize(horizontal: false, vertical: true)
            }
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
                            Text("đã XN \(Fmt.int(r.confirmed)) · không XN \(Fmt.int(r.failed)) · chuyển đi \(Fmt.int(r.sent))").font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1).minimumScaleFactor(0.75)
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
        let r = period.range, key = "\(period.key)|\(pos)"
        do { data = try await API.vanDon(start: r.0, end: r.1, posIds: pos.isEmpty ? [] : [pos]); dataKey = key; error = nil }
        catch {
            guard !Task.isCancelled else { return }
            self.error = error.localizedDescription
            if dataKey != key { data = nil }
        }
    }
}
