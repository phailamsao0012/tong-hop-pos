import SwiftUI

/// Tab Trang chủ (ngoài cùng bên trái, anh Vũ 10/10/2026): như trang chủ app ngân hàng / app bán hàng lớn, chỉ "hôm nay":
/// lời chào, số chính hôm nay của cả công ty (chạm mở chi tiết), việc cần xử lý (mở trang Thông báo), lối tắt chức năng,
/// ca đang chạy. Số theo kỳ của từng bộ phận nằm ở Tổng quan (giữa), không lặp ở đây.
struct HomeFeed: View {
    @Environment(AuthModel.self) private var auth
    @Environment(SyncStatus.self) private var sync
    @Environment(AlertCenter.self) private var alerts
    @Environment(AppNav.self) private var nav
    /// Doanh thu chốt hôm nay của từng bộ phận (/api/reports/overview lọc team, so cùng giờ hôm qua) và MKT hôm nay.
    @State private var sale: API.Overview?
    @State private var cskh: API.Overview?
    @State private var mkt: API.MktAnalytics?
    /// Vận đơn hôm nay (/api/reports/van-don, cùng số trang Vận đơn): đơn chuyển đi, doanh số chuyển đi.
    @State private var vd: API.VanDon?
    /// Ô Tổng cộng trong Thống kê Pancake của từng POS hôm nay (/api/reports/pancake-ref); refLoaded: đã hỏi xong (có hay không).
    @State private var ref: API.PancakeRef?
    @State private var refLoaded = false
    @State private var error: String?
    @State private var loading = false
    @State private var loadedAt: Date?
    /// Ngày (giờ VN) của số đang hiện; bảng giải thích ghi đúng ngày này.
    @State private var loadedDay: String?
    /// Lúc bắt đầu lần tải gần nhất và ngày của nó: mở lại app sang ngày khác hoặc sau 10 phút thì tải lại.
    @State private var startedAt: Date?
    @State private var startedDay: String?
    /// Ngày|POS của số đang hiện (R-POS).
    @State private var loadedKey = ""
    /// Lần tải mới nhất; lần cũ về sau không ghi đè.
    @State private var gen = 0
    /// Mở lại tab mà số hôm nay chưa quá 60 giây thì không tải lại (kéo để làm mới thì luôn tải).
    @State private var fresh = Freshness()
    @State private var explain: MetricExplain?
    @Environment(\.scenePhase) private var phase
    /// Ẩn số tiền như app ngân hàng (con mắt trên thẻ), nhớ trên máy.
    @AppStorage("thp_hide_money") private var hideMoney = false

    var body: some View {
        @Bindable var nav = nav
        NavigationStack(path: $nav.homePath) {
            TabPage(title: "Hôm nay", greeting: "\(Self.hello()) \(auth.me?.displayName ?? "MEGATECH") · \(Fmt.weekday().replacingOccurrences(of: ",", with: ""))",
                    actions: [.sync, .eye, .bell]) {
                // Khung Gemini 01: dải phạm vi, thẻ doanh thu hôm nay, theo bộ phận, MKT, Vận đơn, cần xử lý, lối tắt, ca đang chạy.
                scopePill
                hero
                // id "hom-nay-2", "hom-nay-3": chỗ lượt chụp giao diện cuộn tới.
                if canMkt { mktRow.id("hom-nay-2") }
                if canVd { vdRow.id(canMkt ? "hom-nay-vd" : "hom-nay-2") }
                todo.id("hom-nay-3")
                if let me = auth.me { HomeShortcuts(me: me, pos: nav.pos) }
                shiftCard
            }
            .hrNotice(dept: "Tất cả")
            .appRoutes()
            .refreshable { await reload(force: true) }
            // POS chung (pill lọc ở Tổng quan, Đơn hàng…): đổi POS thì Hôm nay tải lại chỉ số của POS đó (R-POS).
            .task(id: nav.pos) { await load() }
            // Quay lại app (mở khoá Face ID) sang ngày mới hoặc số đã cũ hơn 10 phút: tải lại, không để số hôm qua dưới chữ "hôm nay".
            .onChange(of: phase) { _, p in
                guard p == .active, let day = startedDay else { return }
                if day != VNDate.string(.now) || (startedAt.map { Date.now.timeIntervalSince($0) > 600 } ?? true) { Task { await load(force: true) } }
            }
            .sheet(item: $explain) { m in MTFilterSheet(title: m.title, existingNavigation: true) { ExplainSheet(m: m) { q in nav.homePath.append(.orders(q)) } } }
        }
    }

    // MARK: Lời chào

    static func hello(_ d: Date = .now) -> String {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = VNDate.tz
        let h = cal.component(.hour, from: d)
        return h < 11 ? "Chào buổi sáng," : h < 13 ? "Chào buổi trưa," : h < 18 ? "Chào buổi chiều," : "Chào buổi tối,"
    }

    // MARK: Thẻ số chính hôm nay

    /// Anh Vũ 10/10/2026: "doanh thu hôm nay là doanh thu của cái gì"; "phải tách doanh thu của 3 cái ra"; "chuẩn nhất là lấy số này
    /// [Tổng cộng · Doanh thu trong Thống kê Pancake] của các pos cộng lại". Thẻ: số Tổng cộng của Pancake cộng các POS
    /// (/api/reports/pancake-ref), rồi doanh thu riêng Sale, CSKH, MKT (không cộng lại), rồi MKT hôm nay: số về, chi phí QC,
    /// chi phí mỗi số, mỗi đơn, rồi Vận đơn hôm nay: doanh số chuyển đi (không phải doanh thu). Mọi số lấy từ API web, app không
    /// tự tính cách khác; chạm số nào mở trang tính ra số đó.
    private var scopeLine: String { "\(posScope.prefix(1).uppercased() + posScope.dropFirst()) · từ 0h đến \(loadedAt.map(Fmt.hm) ?? "giờ này")" }
    /// Máy chủ tự thu hẹp về POS được cấp (lib/access.ts); chủ hệ thống và tài khoản không giới hạn POS xem mọi POS.
    private var posScope: String {
        if !nav.pos.isEmpty { return "POS \(PosBreakdown.names[nav.pos] ?? nav.pos)" }
        let n = auth.me?.role == "owner" ? 0 : (auth.me?.posIds?.count ?? 0)
        return n == 0 ? "mọi POS" : "\(n) POS được cấp"
    }
    /// POS đang chọn (R-POS: chọn POS nào chỉ tính POS đó); rỗng = mọi POS được xem.
    private var posIds: [String] { nav.pos.isEmpty ? [] : [nav.pos] }
    /// Nguồn số được hỏi theo quyền (HomeSources, dùng chung với phần tải trước lúc hộp Face ID đang hiện).
    private var sources: HomeSources { HomeSources(auth.me) }
    private var canMkt: Bool { sources.mkt }
    /// Cùng cổng với /api/reports/van-don và trang Vận đơn.
    private var canVd: Bool { sources.vd }
    private var canRef: Bool { sources.ref }
    private var showSale: Bool { sources.sale }
    private var showCskh: Bool { sources.cskh }
    /// Tài khoản chỉ xem được Vận đơn (vd người phòng Vận đơn): thẻ không mang chữ "doanh thu", chỉ có khối Vận đơn.
    private var vdOnly: Bool { canVd && !canRef && !showSale && !showCskh && !canMkt }
    /// Cộng ô Tổng cộng của từng POS (số Pancake; POS chưa đọc được Pancake thì web tự tính, đếm ở fromWeb).
    private static func refSum(_ rows: [API.RefPos]) -> (revenue: Double, orders: Double, fromWeb: Int) {
        var r = (revenue: 0.0, orders: 0.0, fromWeb: 0)
        for p in rows { r.revenue += p.part.total.revenue; r.orders += p.part.total.orders; if p.source != "pancake" { r.fromWeb += 1 } }
        return r
    }

    /// Dải mảnh "Mọi POS · từ 0h đến HH:MM · ● Đồng bộ OK" (khung 01).
    private var scopePill: some View {
        HStack(spacing: 6) {
            Text(scopeLine).mtFont(.caption).fontWeight(.semibold).foregroundStyle(Palette.ink)
                .lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 8)
            Circle().fill(sync.tone).frame(width: 7, height: 7)
            Text(sync.title).mtFont(.caption).fontWeight(.semibold).foregroundStyle(sync.tone).lineLimit(1)
        }
        .padding(.horizontal, 12).padding(.vertical, 7)
        .background(Palette.card, in: .rect(cornerRadius: 10))
        .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(Palette.line, lineWidth: 1) }
        .accessibilityElement(children: .combine)
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: MT.cardGap) {
            if canRef { revenueHero }
            if !vdOnly { deptCard }
            else if let error { StateView(error: error, compact: true) { await reload(force: true) } }
        }.environment(\.thinking, loading && (sale != nil || cskh != nil))
    }

    /// Giải thích chung của thẻ Theo bộ phận: cách tính từng bộ phận đang có số.
    private var deptInfo: InfoText {
        var parts: [String] = ["Xem riêng, không cộng lại · so cùng giờ hôm qua."]
        if let t = sale?.current.total { parts.append("Sale\n" + revenueExplain(.sale, t, sale?.compare?.total, nil).definition) }
        if let t = cskh?.current.total { parts.append("CSKH\n" + revenueExplain(.cskh, t, cskh?.compare?.total, nil).definition) }
        if let a = mkt { parts.append("Marketing\n" + mktExplain(a).definition) }
        return InfoText(title: "Theo bộ phận", body: parts.joined(separator: "\n\n"))
    }

    /// Thẻ "Theo bộ phận": Sale, CSKH, Marketing; mỗi bộ phận badge so cùng giờ hôm qua và 2 thanh.
    private var deptCard: some View {
        VStack(alignment: .leading, spacing: MT.cellGap) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Theo bộ phận").mtFont(.cardHeader).foregroundStyle(Palette.ink)
                    Text("Xem riêng, không cộng lại · So cùng giờ hôm qua").mtFont(.caption).foregroundStyle(Palette.muted)
                }
                Spacer(minLength: 8)
                InfoButton(deptInfo).modifier(HeaderSquare())
            }
            if let error { StateView(error: error, compact: true) { await reload(force: true) } }
            if showSale { teamRow(.sale, sale) }
            if showCskh { teamRow(.cskh, cskh) }
            if canMkt {
                deptRow(.mkt, net: mkt?.current.net, prev: mkt?.prev.net,
                        note: mkt.map { "\(Fmt.int($0.current.closed)) đơn đã XN" },
                        previousLabel: mkt?.previous.cutoff != nil ? "Hôm qua cùng giờ" : "Hôm qua")
            }
            if !showSale && !showCskh && !canMkt {
                Text("Tài khoản chưa được cấp xem doanh thu bộ phận.").font(.footnote).foregroundStyle(Palette.muted)
            }
        }
        .padding(MT.cardPad).frame(maxWidth: .infinity, alignment: .leading).cardSurface()
    }

    private typealias RefTotals = (revenue: Double, orders: Double, fromWeb: Int)

    private func heroSource(_ n: Int, _ w: Int) -> String {
        w == 0 ? "Tổng thống kê Pancake · \(n) POS" : w == n ? "Web tự tính · \(n) POS" : "Pancake \(n - w) POS + web tự tính \(w) POS"
    }

    /// Thẻ hero "DOANH THU HÔM NAY": vòng tỷ trọng theo POS, số lớn, đơn chốt, hôm qua cả ngày, ô từng POS, nút (i).
    private var revenueHero: some View {
        let cur = ref.map { Self.refSum($0.current) }, prev = ref.map { Self.refSum($0.previous) }
        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("DOANH THU HÔM NAY").mtFont(.caption).fontWeight(.bold).foregroundStyle(Palette.muted)
                    if let cur, let ref { Text(heroSource(ref.current.count, cur.fromWeb)).mtFont(.caption).foregroundStyle(Palette.muted) }
                }
                Spacer(minLength: 8)
                if let cur, let ref {
                    metricInfo("Cách tính doanh thu hôm nay") { totalExplain(cur, prev, posCount: ref.current.count, day: ref.start) }
                }
            }
            if let cur, let ref {
                heroMain(cur, prev, ref)
                posTiles(ref.current)
                if cur.fromWeb > 0 {
                    let n = ref.current.count, w = cur.fromWeb
                    Label(w == n ? "Chưa đọc được thống kê Pancake; số web tính có thể cao hơn Pancake" : "\(w) POS chưa đọc được Pancake; phần web tính có thể cao hơn", systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote).foregroundStyle(Palette.warn)
                }
            } else if refLoaded {
                Label("Chưa đọc được số Tổng cộng của Pancake. Doanh thu từng bộ phận ở dưới.", systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote).foregroundStyle(Palette.warn)
                    .fixedSize(horizontal: false, vertical: true)
            } else { Skeleton(height: 180) }
        }.foregroundStyle(Palette.heroInk).heroSurface()
    }

    @ViewBuilder private func heroMain(_ cur: RefTotals, _ prev: RefTotals?, _ ref: API.PancakeRef) -> some View {
        let n = ref.current.count
        let ring = ShareRing(parts: ref.current.map { (value: $0.part.total.revenue, color: PosInfo.color($0.posId)) },
                             center: "\(n) POS", caption: "\(Fmt.int(cur.orders)) đơn")
        let main = HStack(alignment: .center, spacing: 14) {
            ring
            VStack(alignment: .leading, spacing: 4) {
                compactAmount(cur.revenue, onHero: true)
                Text("\(Fmt.int(cur.orders)) đơn chốt · \(n) POS").mtFont(.caption).fontWeight(.semibold)
                if let prev {
                    HStack {
                        Text("Hôm qua cả ngày:")
                        Spacer(minLength: 4)
                        Text(hideMoney ? "••• tr ₫" : Fmt.shortMoney(prev.revenue)).fontWeight(.semibold)
                    }.mtFont(.caption).foregroundStyle(Palette.heroMuted)
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }.contentShape(.rect)
        if auth.me?.canView("overview") ?? false {
            Button { nav.homePath.append(.overviewRef) } label: { main }.buttonStyle(.plain)
        } else { main }
    }

    /// Ô từng POS: chấm màu + tên, doanh thu, số đơn chốt (số Tổng cộng của từng POS).
    private func posTiles(_ rows: [API.RefPos]) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: MT.cellGap), count: 3), spacing: MT.cellGap) {
            ForEach(rows, id: \.posId) { p in posTile(p) }
        }
    }
    private func posTile(_ p: API.RefPos) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 4) {
                Circle().fill(PosInfo.color(p.posId)).frame(width: 7, height: 7)
                Text(PosBreakdown.short[p.posId] ?? p.posId).mtFont(.caption).fontWeight(.bold).lineLimit(1)
            }
            Text(money(p.part.total.revenue)).mtFont(.body).fontWeight(.bold).lineLimit(1).minimumScaleFactor(0.6)
            Text("\(Fmt.int(p.part.total.orders)) chốt").mtFont(.caption).foregroundStyle(Palette.muted)
        }
        .padding(10).frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.wash, in: .rect(cornerRadius: MT.rCell))
        .accessibilityElement(children: .combine)
    }

    private func metricInfo(_ title: String, make: @escaping () -> MetricExplain) -> some View {
        Button { explain = make() } label: {
            Image(systemName: "info.circle").modifier(HeaderSquare())
        }.buttonStyle(.plain).accessibilityLabel(title)
    }

    private func compactAmount(_ value: Double, size: CGFloat = 40, onHero: Bool = false) -> some View {
        return Text(hideMoney ? "••• tr ₫" : Fmt.shortMoney(value)).mtFont(.heroNumber)
            .lineLimit(1).minimumScaleFactor(0.6).contentTransition(.numericText())
            .foregroundStyle(onHero ? Palette.heroInk : Palette.ink)
        .accessibilityElement(children: .ignore).accessibilityLabel(hideMoney ? "Đã ẩn số tiền" : Fmt.money(value))
    }

    private func teamRow(_ dept: CompanyDept, _ o: API.Overview?) -> some View {
        let t = o?.current.total
        return deptRow(dept, net: t?.closedNet, prev: o?.compare?.total.closedNet, note: t.map { "\(Fmt.int($0.closedOrders)) đơn chốt" })
    }
    /// Một bộ phận trong thẻ Theo bộ phận: chấm màu, tên, số đơn, badge so cùng giờ hôm qua, số tiền; 2 thanh Hôm qua cùng giờ / Giờ này.
    private func deptRow(_ dept: CompanyDept, net: Double?, prev: Double?, note: String?, previousLabel: String = "Hôm qua cùng giờ") -> some View {
        opener(dept) {
            VStack(alignment: .leading, spacing: MT.cellGap) {
                deptRowHead(dept, net: net, prev: prev, note: note)
                if let net, let prev, !hideMoney {
                    MTComparisonBarRow(previous: prev, previousText: Fmt.shortMoney(prev), previousLabel: previousLabel,
                                       current: net, currentText: Fmt.shortMoney(net), currentLabel: "Giờ này", tint: dept.tint)
                }
            }
            .padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.wash, in: .rect(cornerRadius: MT.rCell))
        }
    }
    private func deptRowHead(_ dept: CompanyDept, net: Double?, prev: Double?, note: String?) -> some View {
        HStack(spacing: 6) {
            Circle().fill(dept.tint).frame(width: 8, height: 8)
            Text(dept.title).mtFont(.cardHeader).foregroundStyle(Palette.ink)
            if let note { Text("· \(note)").mtFont(.caption).foregroundStyle(Palette.muted).lineLimit(1).minimumScaleFactor(0.8) }
            Spacer(minLength: 4)
            if let net, let delta = Fmt.delta(net, prev), !hideMoney { DeltaPill(delta) }
            if let net {
                Text(money(net)).mtFont(.cardMetric).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.6)
            } else if error == nil {
                Skeleton(height: 20).frame(width: 72)
            } else {
                Text("—").mtFont(.cardMetric).foregroundStyle(Palette.muted)
            }
        }
    }

    /// Đầu thẻ có nút "›" vuông mở trang bộ phận (khung 01: MKT hôm nay, Vận đơn hôm nay).
    private func cardHead(_ title: String, subtitle: String? = nil, open dept: CompanyDept) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).mtFont(.cardHeader).foregroundStyle(Palette.ink)
                if let subtitle { Text(subtitle).mtFont(.caption).foregroundStyle(Palette.muted) }
            }
            Spacer(minLength: 8)
            if dept.canOpen(auth.me) { opener(dept) { ChevronSquare() }.accessibilityLabel("Mở \(dept.title)") }
        }
    }

    /// MKT hôm nay (cùng nguồn trang Marketing, /api/marketing/analytics): số về, chi phí quảng cáo, chi phí mỗi số, mỗi đơn chốt.
    private var mktRow: some View {
        let c = mkt?.current
        return VStack(alignment: .leading, spacing: MT.cellGap) {
            cardHead("MKT hôm nay", open: .mkt)
            opener(.mkt) {
                Grid(horizontalSpacing: MT.cellGap, verticalSpacing: MT.cellGap) {
                    GridRow {
                        mktStat("Số về", c.map { Fmt.int($0.phones) }, c.map { "\(Fmt.int($0.orders)) đơn lên" })
                        mktStat("Chi phí QC", c.map { $0.cost > 0 ? money($0.cost) : "Chưa có" }, c.map { $0.cost > 0 ? "Sheet · mọi POS" : "sheet chưa gửi" })
                    }
                    GridRow {
                        mktStat("CP / số", c.map { m in posLimited ? "—" : m.costPerLead.map { money($0) } ?? "—" }, c == nil ? nil : posLimited ? "chi phí không chia POS" : nil)
                        mktStat("CP / đơn", c.map { m in posLimited ? "—" : m.costPerClosed.map { money($0) } ?? "—" }, c == nil ? nil : posLimited ? "chi phí không chia POS" : nil)
                    }
                }
            }
        }
        .padding(MT.cardPad).frame(maxWidth: .infinity, alignment: .leading).cardSurface()
    }
    /// Vận đơn hôm nay (anh Vũ 10/10/2026): Vận đơn không bán hàng, không chốt đơn. Số đơn là "đơn chuyển đi", tiền là "doanh số chuyển đi",
    /// không phải doanh thu, không cộng vào doanh thu nào ở trên. Cùng số trang Vận đơn (/api/reports/van-don) khi chọn Hôm nay.
    private var vdRow: some View {
        let t = vd?.total, basis = VdBasis(vd?.sentBasis)
        return VStack(alignment: .leading, spacing: MT.cellGap) {
            cardHead("Vận đơn hôm nay", subtitle: "Tính riêng, không cộng vào tổng công ty", open: .vandon)
            if let t {
                opener(.vandon) { vdSentCell(t, basis) }
                vdWaitingCell(t)
            } else if error == nil { Skeleton(height: 90) }
            else { Text("—").mtFont(.cardMetric).foregroundStyle(Palette.muted) }
        }
        .padding(MT.cardPad).frame(maxWidth: .infinity, alignment: .leading).cardSurface()
    }
    private func vdSentCell(_ t: API.VdLine, _ basis: VdBasis) -> some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Doanh số chuyển đi").mtFont(.caption).foregroundStyle(Palette.muted)
                Text("\(Fmt.int(t.sent)) đơn chuyển đi" + (basis == .sent ? " · theo ngày gửi" : "")).mtFont(.caption).fontWeight(.semibold).foregroundStyle(Palette.ink)
            }
            Spacer(minLength: 8)
            Text(money(t.sentNet)).mtFont(.cardMetric).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.6)
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.wash, in: .rect(cornerRadius: MT.rCell))
        .accessibilityElement(children: .combine)
    }
    private func vdWaitingCell(_ t: API.VdLine) -> some View {
        let confirmed = max(0, t.closed - t.waiting - t.failed)
        return HStack(alignment: .top, spacing: 8) {
            Text("Đơn vào Chờ xác nhận: \(Fmt.int(t.closed))").fontWeight(.semibold)
            Spacer(minLength: 4)
            Text("Đã XN \(Fmt.int(confirmed)) · Chờ \(Fmt.int(t.waiting)) · Không XN \(Fmt.int(t.failed))")
                .multilineTextAlignment(.trailing)
        }
        .mtFont(.caption).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.wash, in: .rect(cornerRadius: MT.rCell))
        .accessibilityElement(children: .combine)
    }
    private func mktStat(_ label: String, _ value: String?, _ note: String?) -> some View {
        let c = mkt?.current
        let amount: Double?
        switch label {
        case "Chi phí QC": amount = c.flatMap { $0.cost > 0 ? $0.cost : nil }
        case "CP / số": amount = posLimited ? nil : c?.costPerLead
        case "CP / đơn": amount = posLimited ? nil : c?.costPerClosed
        default: amount = nil
        }
        return MTStatCell(label: label, value: amount.map { money($0) } ?? value ?? "—", note: note)
    }
    /// Tiền gọn trong ô nhỏ, theo nút con mắt.
    private func money(_ n: Double) -> String { hideMoney ? "••• tr ₫" : Fmt.shortVnd(n) }
    /// Tiền đủ số trong bảng giải thích, cũng che khi bật con mắt.
    private func full(_ n: Double) -> String { hideMoney ? "••••••" : Fmt.money(n) }
    /// Tài khoản chỉ được xem một số POS: số đơn, số về chỉ của các POS đó nhưng chi phí quảng cáo là của mọi POS
    /// (sheet không chia theo POS) nên không chia chi phí cho số về / đơn được.
    private var posLimited: Bool { !nav.pos.isEmpty || (auth.me?.role != "owner" && !(auth.me?.posIds ?? []).isEmpty) }
    /// Chạm mở trang bộ phận với kỳ Hôm nay (cùng số); không xem được trang đó thì chỉ để đọc.
    @ViewBuilder private func opener<Content: View>(_ dept: CompanyDept, @ViewBuilder _ content: () -> Content) -> some View {
        if dept.canOpen(auth.me) {
            Button { nav.homePath.append(.dept(dept, period: .today)) } label: { content().contentShape(.rect) }.buttonStyle(.plain)
        } else {
            content()
        }
    }

    // MARK: Giải thích cách tính

    private func totalExplain(_ cur: (revenue: Double, orders: Double, fromWeb: Int), _ prev: (revenue: Double, orders: Double, fromWeb: Int)?, posCount: Int, day: String) -> MetricExplain {
        let w = cur.fromWeb
        let source = w == 0 ? ". Cùng số anh thấy khi mở Thống kê Pancake từng POS."
            : "; \(w == posCount ? "cả \(w)" : "\(w)") POS chưa đọc được Pancake nên web tự tính từ đơn đã đồng bộ (tính cả đơn Chờ xác nhận nên phần đó có thể cao hơn Pancake)."
        return MetricExplain(
            title: "Doanh thu hôm nay", value: full(cur.revenue),
            definition: "Ô \"Tổng cộng · Doanh thu\" trong Thống kê của Pancake, lấy ngày hôm nay ở từng POS rồi cộng lại (\(posCount) POS)\(source) Đơn chốt: \(Fmt.int(cur.orders)).\nDoanh thu Sale, CSKH, MKT bên dưới là số riêng từng bộ phận, xem riêng, không cộng lại thành số này.",
            period: "Hôm nay \(Fmt.day(day)) · \(scopeLine)",
            previous: prev.map { ("Hôm qua cả ngày", full($0.revenue)) })
    }
    private func revenueExplain(_ dept: CompanyDept, _ t: API.Metrics, _ prev: API.Metrics?, _ r: API.Reconcile?) -> MetricExplain {
        let d = loadedDay ?? VNDate.string(.now)
        var rec: (ok: Bool, text: String)? = nil
        if let r {
            let ok = Int(t.closedOrders - r.orders) == 0 && abs(t.closedNet - r.net) < 1000
            rec = ok ? (true, "Khớp với đơn gốc: \(Fmt.int(r.orders)) đơn · \(full(r.net)).")
                : (false, "Lệch: bảng số liệu \(Fmt.int(t.closedOrders)) / \(full(t.closedNet)); đơn gốc \(Fmt.int(r.orders)) / \(full(r.net)). Kéo để làm mới.")
        }
        // Không kèm danh sách đơn: trang đơn nguồn chưa lọc được theo giờ vào Chờ xác nhận (first_closed_at), danh sách sẽ lệch số này.
        return MetricExplain(
            title: "Doanh thu \(dept.title) hôm nay", value: full(t.closedNet),
            definition: "Tiền các đơn có người bán thuộc bộ phận \(dept.title) (theo web nhân sự, người có hậu tố \(dept == .sale ? "SALE" : "CSKH")) chốt hôm nay: đơn vào Chờ xác nhận lần đầu trong khoảng từ 0h đến lúc tải số, trên \(posScope). Đơn đang huỷ không tính; đơn hoàn vẫn tính.\nTiền sau giảm giá và quà tặng, không cộng phí ship.\nCùng số với bảng \(dept.title) ở Tổng quan và trang \(dept.title) khi chọn Hôm nay. Hôm nay \(Fmt.int(t.closedOrders)) đơn chốt.",
            period: "Hôm nay \(Fmt.day(d)) · \(scopeLine)",
            previous: prev.map { ("Cùng giờ hôm qua", full($0.closedNet)) },
            reconcile: rec)
    }
    private func mktExplain(_ a: API.MktAnalytics) -> MetricExplain {
        let c = a.current
        return MetricExplain(
            title: "Doanh thu MKT hôm nay", value: full(c.net),
            definition: "Tiền các đơn có Marketer được xác nhận lần đầu hôm nay (từ 0h đến lúc tải số), trên \(posScope). MKT tính chốt là đã xác nhận trên Pancake: không tính đơn mới, chờ xác nhận, huỷ, xoá. Tiền sau giảm giá và quà tặng, không cộng phí ship.\nĐơn MKT do Sale hoặc CSKH gọi chốt nên cũng có trong doanh thu của bộ phận đó; ba số xem riêng.\nHôm nay: \(Fmt.int(c.closed)) đơn chốt, \(Fmt.int(c.phones)) số về, chi phí quảng cáo \(c.cost > 0 ? full(c.cost) : "chưa có")\(posLimited && c.cost > 0 ? " (của mọi POS: sheet chi phí không chia theo POS)" : ""). Cùng số với trang Marketing khi chọn Hôm nay.",
            period: "Hôm nay \(Fmt.day(a.period.start)) · \(scopeLine)",
            previous: (a.previous.cutoff != nil ? "Cùng giờ hôm qua" : "Hôm qua", full(a.prev.net)))
    }

    private func vdExplain(_ t: API.VdLine, _ basis: VdBasis) -> MetricExplain {
        let d = loadedDay ?? VNDate.string(.now)
        if basis == .sent {
            return MetricExplain(
                title: "Doanh số chuyển đi hôm nay", value: full(t.sentNet),
                definition: "Tiền các đơn giao cho đơn vị vận chuyển hôm nay (theo ngày gửi hàng lần đầu, từ 0h đến lúc tải số; đã gửi, đã nhận, đã thu tiền, hoàn), trên \(posScope). Tiền sau giảm giá và quà tặng, không cộng phí ship.\nĐây là doanh số chuyển đi, tính riêng, không cộng vào tổng công ty hay số của Sale, CSKH, MKT.\nĐơn tính theo ngày gửi hàng: đơn vào Chờ xác nhận từ hôm trước mà hôm nay mới gửi thì tính vào hôm nay.\nHôm nay: \(Fmt.int(t.sent)) đơn chuyển đi, trong đó \(Fmt.int(t.returned)) đơn hoàn (đơn mới gửi ít khi hoàn ngay). Đơn vào Chờ xác nhận hôm nay (theo ngày vào Chờ xác nhận): \(Fmt.int(t.closed)) đơn, \(Fmt.int(t.waiting)) còn chờ, \(Fmt.int(t.failed)) không xác nhận được. Cùng số với trang Vận đơn khi chọn Hôm nay.",
                period: "Hôm nay \(Fmt.day(d)) · \(scopeLine)")
        }
        return MetricExplain(
            title: "Doanh số chuyển đi hôm nay", value: full(t.sentNet),
            definition: "Tiền các đơn đã giao cho đơn vị vận chuyển (đã gửi, đã nhận, đã thu tiền, hoàn), trong số đơn vào Chờ xác nhận lần đầu hôm nay (Sale, CSKH đưa sang; từ 0h đến lúc tải số), trên \(posScope). Tiền sau giảm giá và quà tặng, không cộng phí ship.\nĐây là doanh số chuyển đi, tính riêng, không cộng vào tổng công ty hay số của Sale, CSKH, MKT.\nĐơn tính theo ngày vào Chờ xác nhận, không theo ngày gửi: đơn vào Chờ xác nhận hôm qua, hôm nay mới chuyển đi thì nằm ở số của hôm qua.\nHôm nay: \(Fmt.int(t.sent)) đơn chuyển đi; \(Fmt.int(t.waiting)) đơn còn chờ xác nhận, \(Fmt.int(t.failed)) đơn không xác nhận được, \(Fmt.int(t.returned)) đơn hoàn. Cùng số với trang Vận đơn khi chọn Hôm nay.",
            period: "Hôm nay \(Fmt.day(d)) · \(scopeLine)")
    }

    // MARK: Việc cần xử lý

    /// Link xanh nhỏ ở góc thẻ ("Xem tất cả ›", "Xem ca ›").
    private func cornerLink(_ title: String, _ route: Route) -> some View {
        NavigationLink(value: route) {
            HStack(spacing: 2) { Text(title); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }
                .mtFont(.caption).fontWeight(.semibold).foregroundStyle(Palette.accent).frame(minHeight: 32)
        }.buttonStyle(.plain)
    }

    private var todo: some View {
        let items = alerts.items(sync: sync)
        return VStack(alignment: .leading, spacing: MT.cellGap) {
            HStack {
                Text("Cần xử lý · \(items.count)").mtFont(.cardHeader).foregroundStyle(Palette.ink)
                Spacer()
                cornerLink("Xem tất cả", .alerts)
            }
            if !alerts.loaded && items.isEmpty { Skeleton(height: 44) }
            else if items.isEmpty { AlertsEmpty(failed: alerts.failed, text: alerts.failText) { await alerts.refresh(maxAge: 0, me: auth.me) } }
            ForEach(items.prefix(3)) { AlertCompactLink(item: $0) }
        }
        .padding(MT.cardPad).frame(maxWidth: .infinity, alignment: .leading).cardSurface()
    }

    // MARK: Ca đang chạy

    @ViewBuilder private var shiftCard: some View {
        if auth.me?.canView("shift") ?? false {
            VStack(alignment: .leading, spacing: MT.cellGap) {
                HStack {
                    Text("Ca đang chạy").mtFont(.cardHeader).foregroundStyle(Palette.ink)
                    Spacer()
                    cornerLink("Xem ca", .page("shift"))
                }
                if let s = alerts.shift { shiftBody(s) }
                else if alerts.loaded { Text("Chưa đọc được số trong ca.").font(.footnote).foregroundStyle(Color.inkSoft) }
                else { Skeleton(height: 90) }
            }
            .padding(MT.cardPad).frame(maxWidth: .infinity, alignment: .leading).cardSurface()
        }
    }
    private func shiftBody(_ s: API.Shift) -> some View {
        let top = Array(s.staff.sorted { $0.closed > $1.closed }.prefix(3))
        return NavigationLink(value: Route.page("shift")) {
            VStack(alignment: .leading, spacing: MT.cellGap) {
                HStack(spacing: MT.cellGap) {
                    shiftStat("Số đã nhận", Fmt.int(s.total.received), Fmt.delta(s.total.received, s.yesterday.received))
                    shiftStat("Số đã chốt", Fmt.int(s.total.closed), Fmt.delta(s.total.closed, s.yesterday.closed))
                    shiftStat("Chốt nóng", Fmt.pct(s.total.rate), nil)
                }
                ForEach(Array(top.enumerated()), id: \.element.id) { i, p in
                    HStack {
                        Text("\(i + 1) · \(p.name)").lineLimit(1)
                        Spacer(minLength: 8)
                        Text("\(Fmt.int(p.closed)) chốt").fontWeight(.bold)
                    }.mtFont(.body).foregroundStyle(Palette.ink)
                }
            }.contentShape(.rect)
        }.buttonStyle(.plain)
    }
    private func shiftStat(_ label: String, _ value: String, _ delta: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).mtFont(.caption).foregroundStyle(Palette.muted).lineLimit(1).minimumScaleFactor(0.8)
            Text(value).mtFont(.cardMetric).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.5)
            if let delta { DeltaPill(delta).scaleEffect(0.85, anchor: .leading) }
        }
        .padding(10).frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.wash, in: .rect(cornerRadius: MT.rCell))
    }
    // MARK: Tải số

    /// Năm nguồn tải cùng lúc, nguồn nào về trước hiện trước (thống kê Pancake chậm nhất, không giữ chân các dòng bộ phận).
    /// Nguồn nào lỗi thì bỏ số cũ của nguồn đó (không để số hôm qua nằm dưới chữ "hôm nay") và báo lỗi.
    /// force: kéo để làm mới / Thử lại / quay lại app sang ngày mới hoặc sau 10 phút. Không force (mở lại tab) mà số hôm nay
    /// chưa quá 60 giây thì không tải.
    @MainActor private func load(force: Bool = false) async {
        let d = VNDate.string(.now), ids = posIds, k = d + "|" + ids.joined(separator: ",")
        if !force, loadedAt != nil, loadedKey == k, let age = fresh.age(k) { LoadTrace.skip("trang-chu", age: age); return }
        // Đổi POS: bỏ số của POS cũ ngay, không để số mọi POS nằm dưới tên POS vừa chọn.
        if loadedKey != k { ref = nil; refLoaded = false; sale = nil; cskh = nil; mkt = nil; vd = nil; loadedAt = nil }
        loadedKey = k
        gen += 1; let g = gen
        loading = true; defer { if g == gen { loading = false } }
        let started = Date.now
        startedAt = started; startedDay = d
        let wantRef = canRef, wantSale = showSale, wantCskh = showCskh, wantMkt = canMkt, wantVd = canVd
        let trace = LoadTrace("trang-chu", requests: [wantRef, wantSale, wantCskh, wantMkt, wantVd].filter { $0 }.count)
        var failed: Error?, ok = false
        /// Nhận một nguồn: false = bỏ (lần tải bị huỷ hoặc đã có lần mới hơn).
        func take<T>(_ r: Result<T, Error>?, _ set: (T?) -> Void, report: Bool = true) -> Bool {
            guard !Task.isCancelled, g == gen else { return false }
            switch r {
            case .success(let v)?: set(v); ok = true; LaunchClock.mark("so-dau-tien")
            case .failure(let e)?: set(nil); if report { failed = failed ?? e }
            case nil: set(nil)
            }
            return true
        }
        enum Part: @unchecked Sendable {
            case ref(Result<API.PancakeRef, Error>?), sale(Result<API.Overview, Error>?), cskh(Result<API.Overview, Error>?), mkt(Result<API.MktAnalytics, Error>?)
            case vd(Result<API.VanDon, Error>?)
        }
        let done = await withTaskGroup(of: Part.self, returning: Bool.self) { group in
            group.addTask { .ref(await attempt(wantRef, trace) { try await API.pancakeRef(start: d, end: d, posIds: ids) }) }
            group.addTask { .sale(await attempt(wantSale, trace) { try await API.overview(start: d, end: d, posIds: ids, team: "sale") }) }
            group.addTask { .cskh(await attempt(wantCskh, trace) { try await API.overview(start: d, end: d, posIds: ids, team: "cskh") }) }
            group.addTask { .mkt(await attempt(wantMkt, trace) { try await API.mktAnalytics(start: d, end: d, posIds: ids, marketerId: nil, teamId: nil, product: nil) }) }
            group.addTask { .vd(await attempt(wantVd, trace) { try await API.vanDon(start: d, end: d, posIds: ids) }) }
            for await part in group {
                let kept: Bool
                switch part {
                case .ref(let r): kept = take(r, { ref = $0 }, report: false); if kept { refLoaded = true }
                case .sale(let r): kept = take(r, { sale = $0 })
                case .cskh(let r): kept = take(r, { cskh = $0 })
                case .mkt(let r): kept = take(r, { mkt = $0 })
                case .vd(let r): kept = take(r, { vd = $0 })
                }
                if !kept { group.cancelAll(); return false }
                if let failed, let text = LoadError.text(failed) { self.error = text }
            }
            return true
        }
        trace.end(cancelled: !done)
        guard done else { return }
        if ok { loadedAt = started }
        loadedDay = d
        self.error = failed.flatMap { LoadError.text($0) }
        if failed == nil { fresh.stamp(k) } else { fresh.clear() }
    }
    /// Kéo để làm mới / Thử lại: số hôm nay, trạng thái đồng bộ và việc cần xử lý tải lại cùng lúc.
    @MainActor private func reload(force: Bool) async {
        let me = auth.me
        await runTogether([
            { await load(force: true) },
            { await sync.refresh() },
            { await alerts.refresh(maxAge: force ? 0 : 60, me: me) },
        ])
    }
}

/// Một dòng việc cần xử lý, chạm được khi người dùng mở được trang đích.
struct AlertLink: View {
    let item: AlertCenter.Item
    var body: some View {
        if let r = item.route { NavigationLink(value: r) { AlertRow(item: item) }.buttonStyle(.plain) }
        else { AlertRow(item: item) }
    }
}

/// Hàng gọn một dòng trong thẻ Cần xử lý ở Trang chủ (khung 01): chữ và "›".
struct AlertCompactLink: View {
    let item: AlertCenter.Item
    private var row: some View {
        HStack(spacing: 8) {
            Text(item.title).mtFont(.body).fontWeight(.semibold).foregroundStyle(Palette.ink).lineLimit(2)
            Spacer(minLength: 4)
            if item.route != nil { Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.muted) }
        }
        .padding(.horizontal, 12).frame(minHeight: 44).frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.wash, in: .rect(cornerRadius: MT.rCell))
        .contentShape(.rect)
        .accessibilityElement(children: .combine).accessibilityHint(item.sub)
    }
    var body: some View {
        if let r = item.route { NavigationLink(value: r) { row }.buttonStyle(.plain) }
        else { row }
    }
}

/// Không có dòng nào: báo không có việc khẩn cấp, hoặc báo chưa tải được kèm nút Thử lại (không báo yên khi mất mạng).
struct AlertsEmpty: View {
    let failed: Bool
    /// Câu lỗi dễ hiểu (LoadError) của lần hỏi gần nhất.
    var text: String? = nil
    var retry: (() async -> Void)? = nil
    var body: some View {
        if failed {
            StateView(error: "Chưa tải được việc cần xử lý · \(text ?? "Không tải được")", retry: retry)
        } else {
            StateView(empty: "Không có việc khẩn cấp lúc này.", compact: true)
        }
    }
}

/// Một dòng việc cần xử lý (Trang chủ và trang Thông báo).
struct AlertRow: View {
    let item: AlertCenter.Item
    var body: some View {
        HStack(spacing: 12) {
            MetricIcon(item.icon, size: 18).foregroundStyle(item.tone.color).frame(width: 44, height: 44).background(item.tone.color.opacity(0.12), in: .circle)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title).mtFont(.cardHeader).foregroundStyle(Color.ink)
                Text(item.sub).mtFont(.caption).foregroundStyle(Color.inkSoft).fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            if item.route != nil { Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft) }
        }
        .padding(MT.cardPad).cardSurface(radius: MT.rCard).accessibilityElement(children: .combine)
    }
}

/// Lối tắt chức năng kiểu app ngân hàng: lưới 4 cột, icon trong ô màu, theo quyền của người dùng.
struct HomeShortcuts: View {
    let me: API.Me
    /// POS chung đang chọn: lối tắt Đơn mới mở danh sách của POS đó.
    var pos = ""
    struct Item: Identifiable { let id: String; let title: String; let icon: String; let tint: Color; let route: Route }
    /// Đơn tạo trong ngày đang ở trạng thái Mới (nhóm "new"), cùng nhóm với số đơn mới ở mục Cần xử lý.
    static func newOrders(_ day: String, pos: String = "") -> OrderQuery { OrderQuery(start: day, end: day, posIds: pos.isEmpty ? [] : [pos], group: "new", basis: "created", title: "Đơn mới chưa chốt") }
    private var items: [Item] {
        let d = VNDate.string(.now)
        var r: [Item] = []
        if me.canView("shift") { r.append(Item(id: "shift", title: "Trong ca", icon: "clock.fill", tint: Palette.good, route: .page("shift"))) }
        if me.canView("raw-orders") { r.append(Item(id: "new", title: "Đơn mới chưa chốt", icon: "hourglass", tint: Palette.orange, route: .orders(Self.newOrders(d, pos: pos)))) }
        if me.canView("customers") { r.append(Item(id: "customers", title: "Tra khách", icon: "person.text.rectangle.fill", tint: Palette.info, route: .page("customers"))) }
        if me.canView("overview") { r.append(Item(id: "pos", title: "Theo từng POS", icon: "building.2.fill", tint: Palette.accent, route: .overview)) }
        if me.canView("calls") { r.append(Item(id: "calls", title: "Cuộc gọi CSKH", icon: "phone.fill", tint: Palette.teal, route: .dept(.cskh, page: "calls"))) }
        if me.canView("batches") { r.append(Item(id: "batches", title: "Data Sale", icon: "tray.full.fill", tint: Palette.good, route: .dept(.sale, page: "batches"))) }
        if me.canView("monthly") { r.append(Item(id: "monthly", title: "Báo cáo tháng", icon: "calendar", tint: Palette.purple, route: .page("monthly"))) }
        if me.canView("people") { r.append(Item(id: "approvals", title: "Duyệt nhân sự", icon: "checkmark.seal.fill", tint: Palette.orange, route: .hr("approvals"))) }
        return Array(r.prefix(8))
    }
    private func tile(_ x: Item) -> some View {
        NavigationLink(value: x.route) {
            VStack(spacing: 5) {
                MetricIcon(x.icon, size: 18).foregroundStyle(x.tint)
                Text(x.title).mtFont(.caption).fontWeight(.semibold).foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.8)
            }
            .padding(.vertical, 10).padding(.horizontal, 4)
            .frame(maxWidth: .infinity, minHeight: 64)
            .background(Palette.wash, in: .rect(cornerRadius: MT.rCell))
            .overlay { RoundedRectangle(cornerRadius: MT.rCell).strokeBorder(Palette.line, lineWidth: 1) }
            .contentShape(.rect)
        }.buttonStyle(.plain)
    }
    var body: some View {
        let list = items
        if !list.isEmpty {
            // Khung 01: thẻ "Lối tắt", lưới 4×2 nút icon có nền.
            VStack(alignment: .leading, spacing: MT.cellGap) {
                Text("Lối tắt").mtFont(.cardHeader).foregroundStyle(Palette.ink)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: MT.cellGap), count: 4), spacing: MT.cellGap) {
                    ForEach(list) { x in tile(x) }
                }
            }
            .padding(MT.cardPad).frame(maxWidth: .infinity, alignment: .leading).cardSurface()
        }
    }
}

/// Nguồn số của Trang chủ được hỏi, cùng cổng quyền với máy chủ (VIEW_GATES trong lib/access.ts): không được xem thì không hỏi,
/// không hiện dòng. Dùng chung cho HomeFeed và UnlockPrefetch (tải trước đúng các request của HomeFeed.load lúc hộp Face ID đang hiện).
struct HomeSources {
    var ref = false, sale = false, cskh = false, mkt = false, vd = false
    init(_ me: API.Me?) {
        guard let me else { return }
        func canAny(_ v: [String]) -> Bool { v.contains { me.canView($0) } }
        // Tài khoản chỉ xem một bộ phận (team sale / cskh): máy chủ ép số đơn về bộ phận đó nên chỉ hiện dòng của bộ phận đó.
        let team = me.team ?? "all"
        let overviewApi = canAny(["overview", "center", "monthly", "compare", "custom", "batches", "cskh-overview", "sale-overview"])
        ref = canAny(["overview", "center", "cskh-overview", "sale-overview"])
        sale = team != "cskh" && overviewApi
        cskh = team != "sale" && overviewApi
        mkt = me.canView("mkt-roas")
        vd = me.canView("van-don")
    }
    /// Đường dẫn các request HomeFeed.load gọi cho ngày d (giờ VN), cùng tham số.
    /// pos: POS chung đang chọn ("" = mọi POS), như HomeFeed.load.
    func paths(day d: String, pos: String = "") -> [String] {
        let ids = pos.isEmpty ? [] : [pos]
        var out: [String] = []
        if ref { out.append(API.pancakeRefPath(start: d, end: d, posIds: ids)) }
        if sale { out.append(API.overviewPath(start: d, end: d, posIds: ids, team: "sale")) }
        if cskh { out.append(API.overviewPath(start: d, end: d, posIds: ids, team: "cskh")) }
        if mkt { out.append(API.mktAnalyticsPath(start: d, end: d, posIds: ids, marketerId: nil, teamId: nil, product: nil)) }
        if vd { out.append(API.vanDonPath(start: d, end: d, posIds: ids)) }
        return out
    }
}

/// Chạy một lần gọi API nếu được phép; trả kết quả hoặc lỗi (nil = không hỏi). Dùng để tải nhiều nguồn cùng lúc.
func attempt<T>(_ on: Bool, _ f: () async throws -> T) async -> Result<T, Error>? {
    guard on else { return nil }
    do { return .success(try await f()) } catch { return .failure(error) }
}
