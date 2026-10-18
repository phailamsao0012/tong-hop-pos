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
            TabPage(title: "Hôm nay", greeting: "\(Self.hello()) \(auth.me?.displayName ?? "MEGATECH")", subtitle: Fmt.weekday()) {
                hero
                todo
                if canMkt { mktRow }
                if canVd { vdRow }
                shiftCard
                if let me = auth.me { HomeShortcuts(me: me) }
            }
            .hrNotice(dept: "Tất cả")
            .appRoutes()
            .refreshable { await reload(force: true) }
            .task { await load() }
            // Quay lại app (mở khoá Face ID) sang ngày mới hoặc số đã cũ hơn 10 phút: tải lại, không để số hôm qua dưới chữ "hôm nay".
            .onChange(of: phase) { _, p in
                guard p == .active, let day = startedDay else { return }
                if day != VNDate.string(.now) || (startedAt.map { Date.now.timeIntervalSince($0) > 600 } ?? true) { Task { await load(force: true) } }
            }
            .sheet(item: $explain) { m in ExplainSheet(m: m) { q in nav.homePath.append(.orders(q)) } }
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
        let n = auth.me?.role == "owner" ? 0 : (auth.me?.posIds?.count ?? 0)
        return n == 0 ? "mọi POS" : "\(n) POS được cấp"
    }
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

    private var hero: some View {
        VStack(alignment: .leading, spacing: 16) {
            ScopeStrip(text: scopeLine, trailing: sync.short, tone: sync.tone)
            if canRef { revenueHero }
            if !vdOnly {
                HStack {
                    Text("Theo bộ phận").font(.title3.weight(.bold))
                    InfoButton(InfoText(title: "Theo bộ phận", body: "Xem riêng, không cộng lại · so cùng giờ hôm qua"))
                }
                Text("Xem riêng, không cộng lại · so cùng giờ hôm qua").font(.footnote).foregroundStyle(Palette.muted)
                if let error { StateView(error: error, compact: true) { await reload(force: true) } }
                if showSale { teamRow(.sale, sale) }
                if showCskh { teamRow(.cskh, cskh) }
                if canMkt {
                    deptRow(.mkt, net: mkt?.current.net, prev: mkt?.prev.net,
                            note: mkt.map { "\(Fmt.int($0.current.closed)) đơn đã xác nhận" },
                            previousLabel: mkt?.previous.cutoff != nil ? "Cùng giờ hôm qua" : "Hôm qua",
                            explain: mkt.map { a in { mktExplain(a) } })
                }
                if !showSale && !showCskh && !canMkt {
                    Text("Tài khoản chưa được cấp xem doanh thu bộ phận.").font(.footnote).foregroundStyle(Palette.muted)
                }
            } else if let error { StateView(error: error, compact: true) { await reload(force: true) } }
        }.environment(\.thinking, loading && (sale != nil || cskh != nil))
    }

    private var revenueHero: some View {
        let cur = ref.map { Self.refSum($0.current) }, prev = ref.map { Self.refSum($0.previous) }
        return VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Doanh thu hôm nay").font(.headline)
                Spacer()
                if let cur, let ref {
                    metricInfo("Cách tính doanh thu hôm nay", onHero: true) { totalExplain(cur, prev, posCount: ref.current.count, day: ref.start) }
                }
                Button { hideMoney.toggle() } label: {
                    Image(systemName: hideMoney ? "eye.slash.fill" : "eye.fill")
                        .frame(width: 40, height: 40).background(Palette.heroInk.opacity(0.08), in: .circle)
                }.buttonStyle(.plain).accessibilityLabel(hideMoney ? "Hiện số tiền" : "Ẩn số tiền")
            }
            if let cur, let ref {
                let n = ref.current.count, w = cur.fromWeb
                let total = VStack(spacing: 14) {
                    OrbitArc(today: hideMoney ? 0 : cur.revenue, yesterday: hideMoney ? nil : prev?.revenue) {
                        compactAmount(cur.revenue, size: 56, onHero: true)
                    }.frame(maxWidth: .infinity)
                    Text("\(Fmt.int(cur.orders)) đơn chốt · \(n) POS").font(.subheadline).foregroundStyle(Palette.heroMuted)
                    if let prev {
                        HStack { Text("Hôm qua cả ngày"); Spacer(); Text(hideMoney ? "••••" : Fmt.shortMoney(prev.revenue)).font(.headline) }
                    }
                    Text(w == 0 ? "Tổng cộng thống kê Pancake, cộng \(n) POS" : w == n ? "Web tự tính, cộng \(n) POS" : "Pancake \(n - w) POS + web tự tính \(w) POS")
                        .font(.footnote).foregroundStyle(Palette.heroMuted).frame(maxWidth: .infinity, alignment: .leading)
                    if w > 0 {
                        Label(w == n ? "Chưa đọc được thống kê Pancake; số web tính có thể cao hơn Pancake" : "\(w) POS chưa đọc được Pancake; phần web tính có thể cao hơn", systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote).foregroundStyle(Palette.warn)
                    }
                }.contentShape(.rect)
                if auth.me?.canView("overview") ?? false {
                    Button { nav.homePath.append(.overviewRef) } label: { total }.buttonStyle(.plain)
                } else { total }
            } else if refLoaded {
                Text("Chưa đọc được số Tổng cộng của Pancake. Doanh thu từng bộ phận ở dưới.").font(.footnote)
            } else { Skeleton(height: 260) }
            if let error { StateView(error: error, compact: true, onDark: true) { await reload(force: true) } }
        }.foregroundStyle(Palette.heroInk).heroSurface()
    }

    private func metricInfo(_ title: String, onHero: Bool = false, make: @escaping () -> MetricExplain) -> some View {
        Button { explain = make() } label: {
            Image(systemName: "info.circle").font(.system(size: 18))
                .frame(width: 40, height: 40)
                .background(onHero ? Palette.heroInk.opacity(0.08) : Palette.wash, in: .circle)
        }.buttonStyle(.plain).accessibilityLabel(title)
    }

    private func compactAmount(_ value: Double, size: CGFloat = 40, onHero: Bool = false) -> some View {
        let pair = Fmt.compactMoney(value)
        return HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(hideMoney ? "••••" : pair.value).font(.system(size: size, weight: .heavy, design: .rounded))
                .monospacedDigit().lineLimit(1).minimumScaleFactor(0.5).contentTransition(.numericText())
            if !hideMoney { Text(pair.unit).font(.system(size: size == 56 ? 22 : 17, weight: .bold, design: .rounded)).foregroundStyle(onHero ? Palette.heroMuted : Palette.muted) }
        }.foregroundStyle(onHero ? Palette.heroInk : Palette.ink)
        .accessibilityElement(children: .ignore).accessibilityLabel(hideMoney ? "Đã ẩn số tiền" : Fmt.money(value))
    }

    private func teamRow(_ dept: CompanyDept, _ o: API.Overview?) -> some View {
        let t = o?.current.total
        return deptRow(dept, net: t?.closedNet, prev: o?.compare?.total.closedNet, note: t.map { "\(Fmt.int($0.closedOrders)) đơn chốt" },
                       explain: t.map { t in { revenueExplain(dept, t, o?.compare?.total, o?.current.reconcile) } })
    }
    private func deptRow(_ dept: CompanyDept, net: Double?, prev: Double?, note: String?, previousLabel: String = "Cùng giờ hôm qua", explain make: (() -> MetricExplain)?) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(dept.title).font(.headline).foregroundStyle(dept.tint)
                if let make { metricInfo("Cách tính doanh thu \(dept.title)", make: make) }
                Spacer()
            }
            opener(dept) {
                VStack(alignment: .leading, spacing: 10) {
                    if let net { compactAmount(net) }
                    else if error == nil { Skeleton(height: 40) }
                    else { Text("—").font(.title) }
                    HStack {
                        if let note { Text(note).font(.footnote).foregroundStyle(Palette.muted) }
                        if let net, let delta = Fmt.delta(net, prev), !hideMoney { DeltaPill(delta) }
                    }
                    if let net, let prev, !hideMoney {
                        PairBars(prev: prev, prevText: Fmt.money(prev), prevLabel: previousLabel,
                                 cur: net, curText: Fmt.money(net), curLabel: "Giờ này", tint: dept.tint)
                    }
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
        }.padding(16).cardSurface()
        .overlay(alignment: .leading) { Capsule().fill(dept.tint).frame(width: 3).padding(.vertical, 20) }
    }

    /// MKT hôm nay (cùng nguồn trang Marketing, /api/marketing/analytics): số về, chi phí quảng cáo, chi phí mỗi số, mỗi đơn chốt.
    private var mktRow: some View {
        let c = mkt?.current
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                opener(.mkt) { Text("Marketing hôm nay").font(.title3.weight(.bold)).foregroundStyle(Palette.mkt) }
                if CompanyDept.mkt.canOpen(auth.me) { Image(systemName: "chevron.right").foregroundStyle(Palette.mkt) }
                Spacer(minLength: 0)
            }
            opener(.mkt) {
                Grid(horizontalSpacing: 10, verticalSpacing: 10) {
                    GridRow {
                    mktStat("Số về", c.map { Fmt.int($0.phones) }, c.map { "\(Fmt.int($0.orders)) đơn lên" })
                    mktStat("Chi phí QC", c.map { $0.cost > 0 ? money($0.cost) : "Chưa có" }, c.map { $0.cost > 0 ? (posLimited ? "của mọi POS" : "Google Sheet") : "sheet chưa gửi" })
                    }
                    GridRow {
                    mktStat("CP / số", c.map { m in posLimited ? "—" : m.costPerLead.map { money($0) } ?? "—" }, c == nil ? nil : posLimited ? "chi phí không chia POS" : "chi phí ÷ số")
                    mktStat("CP / đơn", c.map { m in posLimited ? "—" : m.costPerClosed.map { money($0) } ?? "—" }, c == nil ? nil : posLimited ? "chi phí không chia POS" : "chi phí ÷ đơn")
                    }
                }
            }
            InfoButton(InfoText(title: "Chi phí và phạm vi", body: mkt.map { mktExplain($0).definition } ?? "số đưa về và chi phí quảng cáo"))
        }.padding(16).cardSurface()
    }
    /// Vận đơn hôm nay (anh Vũ 10/10/2026): Vận đơn không bán hàng, không chốt đơn. Số đơn là "đơn chuyển đi", tiền là "doanh số chuyển đi",
    /// không phải doanh thu, không cộng vào doanh thu nào ở trên. Cùng số trang Vận đơn (/api/reports/van-don) khi chọn Hôm nay.
    private var vdRow: some View {
        let t = vd?.total, basis = VdBasis(vd?.sentBasis)
        return VStack(alignment: .leading, spacing: 12) {
            Text("Vận đơn hôm nay").font(.title3.weight(.bold)).foregroundStyle(Palette.vandon)
            HStack {
                Text("Tính riêng, không cộng vào tổng công ty").font(.footnote).foregroundStyle(Palette.muted)
                if let t { metricInfo("Cách tính doanh số chuyển đi") { vdExplain(t, basis) } }
            }
            opener(.vandon) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Doanh số chuyển đi").font(.footnote).foregroundStyle(Palette.muted)
                    if let t {
                        compactAmount(t.sentNet)
                        Text("\(Fmt.int(t.sent)) đơn chuyển đi" + (basis == .sent ? " · theo ngày gửi hàng" : "")).font(.footnote).foregroundStyle(Palette.muted)
                        SegRing(parts: [
                            ("Còn chờ", t.waiting, Fmt.int(t.waiting), Palette.stNew),
                            ("Đã xác nhận", max(0, t.closed - t.waiting - t.failed), Fmt.int(max(0, t.closed - t.waiting - t.failed)), Palette.stDel),
                            ("Không xác nhận được", t.failed, Fmt.int(t.failed), Palette.stCan),
                        ], center: Fmt.int(t.closed))
                        let tail = basis == .sent ? "" : "; \(Fmt.int(t.sent)) đơn đã chuyển đi"
                        Text("Trong \(Fmt.int(t.closed)) đơn vào Chờ xác nhận hôm nay: \(Fmt.int(t.waiting)) còn chờ, \(Fmt.int(max(0, t.closed - t.waiting - t.failed))) đã xác nhận, \(Fmt.int(t.failed)) không xác nhận được\(tail)")
                            .font(.footnote).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                    } else if error == nil { Skeleton(height: 120) }
                    else { Text("—").font(.title) }
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
        }.padding(16).cardSurface()
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
        return StatTile(label: label, value: value ?? "—", money: hideMoney ? nil : amount, tint: Palette.mkt, note: note)
    }
    /// Tiền gọn trong ô nhỏ, theo nút con mắt.
    private func money(_ n: Double) -> String { hideMoney ? "••••" : Fmt.shortVnd(n) }
    /// Tiền đủ số trong bảng giải thích, cũng che khi bật con mắt.
    private func full(_ n: Double) -> String { hideMoney ? "••••••" : Fmt.money(n) }
    /// Tài khoản chỉ được xem một số POS: số đơn, số về chỉ của các POS đó nhưng chi phí quảng cáo là của mọi POS
    /// (sheet không chia theo POS) nên không chia chi phí cho số về / đơn được.
    private var posLimited: Bool { auth.me?.role != "owner" && !(auth.me?.posIds ?? []).isEmpty }
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

    @ViewBuilder private var todo: some View {
        let items = alerts.items(sync: sync)
        HStack {
            Text("Cần xử lý · \(items.count)").font(.title3.weight(.bold)).foregroundStyle(Color.ink)
            Spacer()
            NavigationLink(value: Route.alerts) {
                HStack(spacing: 2) { Text("Xem tất cả"); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }.font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand)
            }.buttonStyle(.plain)
        }
        if !alerts.loaded && items.isEmpty { Skeleton(height: 56) }
        else if items.isEmpty { AlertsEmpty(failed: alerts.failed, text: alerts.failText) { await alerts.refresh(maxAge: 0, me: auth.me) } }
        ForEach(items.prefix(3)) { AlertLink(item: $0) }
    }

    // MARK: Ca đang chạy

    @ViewBuilder private var shiftCard: some View {
        if auth.me?.canView("shift") ?? false {
            SectionHead(title: "Ca đang chạy", action: "Xem ca", route: .page("shift")).padding(.top, 4)
            if let s = alerts.shift {
                NavigationLink(value: Route.page("shift")) {
                    Panel {
                        HStack(spacing: 10) {
                            shiftStat("Số đã nhận", Fmt.int(s.total.received), Fmt.delta(s.total.received, s.yesterday.received))
                            shiftStat("Số đã chốt", Fmt.int(s.total.closed), Fmt.delta(s.total.closed, s.yesterday.closed))
                            shiftStat("Chốt nóng", Fmt.pct(s.total.rate), nil)
                        }
                        let top = Array(s.staff.sorted { $0.closed > $1.closed }.prefix(3))
                        if !top.isEmpty {
                            Divider().padding(.vertical, 2)
                            let maxC = max(1, top.map(\.closed).max() ?? 1)
                            ForEach(Array(top.enumerated()), id: \.element.id) { i, p in
                                RankRow(rank: i + 1, name: p.name, valueText: "\(Fmt.int(p.closed)) chốt", fraction: p.closed / maxC, tint: Palette.good)
                            }
                        }
                    }
                }.buttonStyle(.plain)
            } else if alerts.loaded {
                Panel { Text("Chưa đọc được số trong ca.").font(.footnote).foregroundStyle(Color.inkSoft) }
            } else { Skeleton(height: 90) }
        }
    }
    private func shiftStat(_ label: String, _ value: String, _ delta: String?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.footnote).foregroundStyle(Palette.muted)
            Text(value).font(.system(size: 26, weight: .heavy, design: .rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.5)
            if let delta { DeltaPill(delta); Text("hôm qua").font(.caption).foregroundStyle(Palette.muted) }
        }.frame(maxWidth: .infinity, alignment: .leading).tileSurface()
    }
    // MARK: Tải số

    /// Năm nguồn tải cùng lúc, nguồn nào về trước hiện trước (thống kê Pancake chậm nhất, không giữ chân các dòng bộ phận).
    /// Nguồn nào lỗi thì bỏ số cũ của nguồn đó (không để số hôm qua nằm dưới chữ "hôm nay") và báo lỗi.
    /// force: kéo để làm mới / Thử lại / quay lại app sang ngày mới hoặc sau 10 phút. Không force (mở lại tab) mà số hôm nay
    /// chưa quá 60 giây thì không tải.
    @MainActor private func load(force: Bool = false) async {
        let d = VNDate.string(.now)
        if !force, loadedAt != nil, let age = fresh.age(d) { LoadTrace.skip("trang-chu", age: age); return }
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
            group.addTask { .ref(await attempt(wantRef, trace) { try await API.pancakeRef(start: d, end: d) }) }
            group.addTask { .sale(await attempt(wantSale, trace) { try await API.overview(start: d, end: d, team: "sale") }) }
            group.addTask { .cskh(await attempt(wantCskh, trace) { try await API.overview(start: d, end: d, team: "cskh") }) }
            group.addTask { .mkt(await attempt(wantMkt, trace) { try await API.mktAnalytics(start: d, end: d, marketerId: nil, teamId: nil, product: nil) }) }
            group.addTask { .vd(await attempt(wantVd, trace) { try await API.vanDon(start: d, end: d) }) }
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
        if failed == nil { fresh.stamp(d) } else { fresh.clear() }
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
            Panel { Label("Không có việc khẩn cấp lúc này.", systemImage: "checkmark.circle.fill").font(.subheadline).foregroundStyle(Color.good) }
        }
    }
}

/// Một dòng việc cần xử lý (Trang chủ và trang Thông báo).
struct AlertRow: View {
    let item: AlertCenter.Item
    var body: some View {
        HStack(spacing: 12) {
            MetricIcon(item.icon, size: 14).foregroundStyle(item.tone.color).frame(width: 36, height: 36).background(item.tone.color.opacity(0.12), in: .rect(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink)
                Text(item.sub).font(.caption).foregroundStyle(Color.inkSoft).lineLimit(2)
            }
            Spacer()
            if item.route != nil { Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft) }
        }
        .padding(12).cardSurface(radius: 20)
    }
}

/// Lối tắt chức năng kiểu app ngân hàng: lưới 4 cột, icon trong ô màu, theo quyền của người dùng.
struct HomeShortcuts: View {
    let me: API.Me
    struct Item: Identifiable { let id: String; let title: String; let icon: String; let tint: Color; let route: Route }
    /// Đơn tạo trong ngày đang ở trạng thái Mới (nhóm "new"), cùng nhóm với số đơn mới ở mục Cần xử lý.
    static func newOrders(_ day: String) -> OrderQuery { OrderQuery(start: day, end: day, group: "new", basis: "created", title: "Đơn mới chưa chốt") }
    private var items: [Item] {
        let d = VNDate.string(.now)
        var r: [Item] = []
        if me.canView("shift") { r.append(Item(id: "shift", title: "Trong ca", icon: "clock.fill", tint: Palette.good, route: .page("shift"))) }
        if me.canView("raw-orders") { r.append(Item(id: "new", title: "Đơn mới chưa chốt", icon: "hourglass", tint: Palette.orange, route: .orders(Self.newOrders(d)))) }
        if me.canView("customers") { r.append(Item(id: "customers", title: "Tra khách", icon: "person.text.rectangle.fill", tint: Palette.info, route: .page("customers"))) }
        if me.canView("overview") { r.append(Item(id: "pos", title: "Theo từng POS", icon: "building.2.fill", tint: Palette.accent, route: .overview)) }
        if me.canView("calls") { r.append(Item(id: "calls", title: "Cuộc gọi CSKH", icon: "phone.fill", tint: Palette.teal, route: .dept(.cskh, page: "calls"))) }
        if me.canView("batches") { r.append(Item(id: "batches", title: "Data Sale", icon: "tray.full.fill", tint: Palette.good, route: .dept(.sale, page: "batches"))) }
        if me.canView("monthly") { r.append(Item(id: "monthly", title: "Báo cáo tháng", icon: "calendar", tint: Palette.purple, route: .page("monthly"))) }
        if me.canView("people") { r.append(Item(id: "approvals", title: "Duyệt nhân sự", icon: "checkmark.seal.fill", tint: Palette.orange, route: .hr("approvals"))) }
        return Array(r.prefix(8))
    }
    var body: some View {
        let list = items
        if !list.isEmpty {
            Text("Lối tắt").font(.title3.weight(.bold)).foregroundStyle(Color.ink).padding(.top, 4)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 14) {
                ForEach(list) { x in
                    NavigationLink(value: x.route) {
                        VStack(spacing: 6) {
                            MetricIcon(x.icon, size: 24).foregroundStyle(x.tint)
                                .frame(width: 56, height: 56).background(Palette.wash, in: .rect(cornerRadius: 18))
                            Text(x.title).font(.caption).foregroundStyle(Color.ink).multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.85)
                                .frame(height: 28, alignment: .top)
                        }.frame(maxWidth: .infinity).contentShape(.rect)
                    }.buttonStyle(.plain)
                }
            }
            .padding(.vertical, 14).padding(.horizontal, 8)
            .cardSurface()
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
    func paths(day d: String) -> [String] {
        var out: [String] = []
        if ref { out.append(API.pancakeRefPath(start: d, end: d)) }
        if sale { out.append(API.overviewPath(start: d, end: d, team: "sale")) }
        if cskh { out.append(API.overviewPath(start: d, end: d, team: "cskh")) }
        if mkt { out.append(API.mktAnalyticsPath(start: d, end: d, marketerId: nil, teamId: nil, product: nil)) }
        if vd { out.append(API.vanDonPath(start: d, end: d)) }
        return out
    }
}

/// Chạy một lần gọi API nếu được phép; trả kết quả hoặc lỗi (nil = không hỏi). Dùng để tải nhiều nguồn cùng lúc.
func attempt<T>(_ on: Bool, _ f: () async throws -> T) async -> Result<T, Error>? {
    guard on else { return nil }
    do { return .success(try await f()) } catch { return .failure(error) }
}
