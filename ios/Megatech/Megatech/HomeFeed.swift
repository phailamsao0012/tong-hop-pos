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
    /// Ô Tổng cộng trong Thống kê Pancake của từng POS hôm nay (/api/reports/pancake-ref); refLoaded: đã hỏi xong (có hay không).
    @State private var ref: API.PancakeRef?
    @State private var refLoaded = false
    @State private var error: String?
    @State private var loading = false
    @State private var loadedAt: Date?
    @State private var explain: MetricExplain?
    /// Ẩn số tiền như app ngân hàng (con mắt trên thẻ), nhớ trên máy.
    @AppStorage("thp_hide_money") private var hideMoney = false

    var body: some View {
        @Bindable var nav = nav
        NavigationStack(path: $nav.homePath) {
            TabPage(tagline: "Hôm nay của công ty") {
                greeting
                hero
                todo
                if let me = auth.me { HomeShortcuts(me: me) }
                shiftCard
            }
            .appRoutes()
            .refreshable { await reload(force: true) }
            .task { await load() }
            .sheet(item: $explain) { m in ExplainSheet(m: m) { q in nav.homePath.append(.orders(q)) } }
        }
    }

    // MARK: Lời chào

    private var greeting: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 2) {
                Text(Self.hello()).font(.system(size: 13)).foregroundStyle(Color.inkSoft)
                Text(auth.me?.displayName ?? "MEGATECH").font(.system(size: 22, weight: .bold)).foregroundStyle(Color.ink).lineLimit(1)
            }
            Spacer()
            Text(Self.weekday()).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand)
                .padding(.horizontal, 10).padding(.vertical, 6).background(Color.brandSoft, in: .capsule)
        }
    }
    static func hello(_ d: Date = .now) -> String {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = VNDate.tz
        let h = cal.component(.hour, from: d)
        return h < 11 ? "Chào buổi sáng," : h < 13 ? "Chào buổi trưa," : h < 18 ? "Chào buổi chiều," : "Chào buổi tối,"
    }
    /// "Thứ Sáu, 10/10"
    static func weekday(_ d: Date = .now) -> String {
        let f = DateFormatter(); f.timeZone = VNDate.tz; f.locale = Locale(identifier: "vi_VN"); f.dateFormat = "EEEE, d/M"
        let s = f.string(from: d)
        return s.prefix(1).uppercased() + s.dropFirst()
    }

    // MARK: Thẻ số chính hôm nay

    /// Anh Vũ 10/10/2026: "doanh thu hôm nay là doanh thu của cái gì"; "phải tách doanh thu của 3 cái ra"; "chuẩn nhất là lấy số này
    /// [Tổng cộng · Doanh thu trong Thống kê Pancake] của các pos cộng lại". Thẻ: số Tổng cộng của Pancake cộng các POS
    /// (/api/reports/pancake-ref), rồi doanh thu riêng Sale, CSKH, MKT (không cộng lại), rồi MKT hôm nay: số về, chi phí QC,
    /// chi phí mỗi số, mỗi đơn. Mọi số lấy từ API web, app không tự tính cách khác; chạm số nào mở trang tính ra số đó.
    private var scopeLine: String { "\(posScope.prefix(1).uppercased() + posScope.dropFirst()) · từ 0h đến \(loadedAt.map(Self.hm) ?? "giờ này")" }
    /// Máy chủ tự thu hẹp về POS được cấp (lib/access.ts); chủ hệ thống và tài khoản không giới hạn POS xem mọi POS.
    private var posScope: String {
        let n = auth.me?.role == "owner" ? 0 : (auth.me?.posIds?.count ?? 0)
        return n == 0 ? "mọi POS" : "\(n) POS được cấp"
    }
    /// Tài khoản chỉ xem một bộ phận (team sale / cskh): máy chủ ép số đơn về bộ phận đó nên chỉ hiện dòng của bộ phận đó.
    private var team: String { auth.me?.team ?? "all" }
    private var canMkt: Bool { auth.me?.canView("mkt-roas") ?? false }
    static func hm(_ d: Date) -> String {
        let f = DateFormatter(); f.timeZone = VNDate.tz; f.dateFormat = "HH:mm"
        return f.string(from: d)
    }
    /// Cộng ô Tổng cộng của từng POS (số Pancake; POS chưa đọc được Pancake thì web tự tính, đếm ở fromWeb).
    private static func refSum(_ rows: [API.RefPos]) -> (revenue: Double, orders: Double, fromWeb: Int) {
        var r = (revenue: 0.0, orders: 0.0, fromWeb: 0)
        for p in rows { r.revenue += p.part.total.revenue; r.orders += p.part.total.orders; if p.source != "pancake" { r.fromWeb += 1 } }
        return r
    }

    private var hero: some View {
        let cur = ref.map { Self.refSum($0.current) }, prev = ref.map { Self.refSum($0.previous) }
        return VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text("Doanh thu hôm nay").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white.opacity(0.9))
                    if let cur, let ref {
                        Button { explain = totalExplain(cur, prev, posCount: ref.current.count) } label: {
                            Image(systemName: "info.circle").font(.system(size: 12, weight: .semibold)).foregroundStyle(.white.opacity(0.75)).frame(width: 24, height: 22).contentShape(.rect)
                        }.buttonStyle(.plain).accessibilityLabel("Cách tính doanh thu hôm nay")
                    }
                    Button { withAnimation(.snappy(duration: 0.2)) { hideMoney.toggle() } } label: {
                        Image(systemName: hideMoney ? "eye.slash.fill" : "eye.fill").font(.system(size: 12)).foregroundStyle(.white.opacity(0.75)).frame(width: 24, height: 22).contentShape(.rect)
                    }.buttonStyle(.plain).accessibilityLabel(hideMoney ? "Hiện số tiền" : "Ẩn số tiền")
                    Spacer()
                }
                Text(scopeLine).font(.system(size: 10)).foregroundStyle(.white.opacity(0.65)).lineLimit(1).minimumScaleFactor(0.75)
            }
            if let cur, let ref {
                Button { nav.homePath.append(.overview) } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(hideMoney ? "••••••••" : Fmt.vnd(cur.revenue)).font(.system(size: 30, weight: .bold, design: .rounded)).foregroundStyle(.white)
                            .monospacedDigit().minimumScaleFactor(0.6).lineLimit(1).contentTransition(.numericText())
                        Text("Tổng cộng thống kê Pancake, cộng \(ref.current.count) POS · \(Fmt.int(cur.orders)) đơn chốt")
                            .font(.system(size: 11, weight: .medium)).foregroundStyle(.white.opacity(0.8)).lineLimit(1).minimumScaleFactor(0.75)
                        if cur.fromWeb > 0 {
                            Text("\(cur.fromWeb) POS chưa đọc được Pancake, phần đó web tự tính").font(.system(size: 10)).foregroundStyle(Color.lime.opacity(0.9)).lineLimit(1).minimumScaleFactor(0.8)
                        }
                        if let prev { Text("Hôm qua cả ngày \(money(prev.revenue))").font(.system(size: 10)).foregroundStyle(.white.opacity(0.6)) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading).contentShape(.rect)
                }.buttonStyle(.plain)
            } else if refLoaded {
                Text("Chưa đọc được số Tổng cộng của Pancake. Doanh thu từng bộ phận ở dưới.").font(.system(size: 11)).foregroundStyle(.white.opacity(0.75)).fixedSize(horizontal: false, vertical: true)
            } else {
                RoundedRectangle(cornerRadius: 8).fill(.white.opacity(0.14)).frame(width: 190, height: 34)
            }
            Rectangle().fill(.white.opacity(0.12)).frame(height: 1)
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Text("Theo bộ phận").font(.system(size: 11, weight: .semibold)).foregroundStyle(.white.opacity(0.85))
                    Text("xem riêng, không cộng lại · % so cùng giờ hôm qua").font(.system(size: 10)).foregroundStyle(.white.opacity(0.55)).lineLimit(1).minimumScaleFactor(0.8)
                }
                if let error, sale == nil, cskh == nil {
                    Label(error, systemImage: "wifi.exclamationmark").font(.system(size: 12)).foregroundStyle(.white.opacity(0.85)).lineLimit(2)
                }
                if team != "cskh" { teamRow(.sale, sale) }
                if team != "sale" { teamRow(.cskh, cskh) }
                if canMkt {
                    let m = mkt?.current
                    deptRow(.mkt, net: m?.net, prev: mkt?.prev.net, note: m.map { "\(Fmt.int($0.closed)) đơn đã xác nhận" },
                            explain: mkt.map { a in { mktExplain(a) } })
                }
            }
            if canMkt {
                Rectangle().fill(.white.opacity(0.12)).frame(height: 1)
                mktRow
            }
        }
        .padding(16)
        .background(LinearGradient(colors: [Color.brandDark, Color.brandDeep], startPoint: .topLeading, endPoint: .bottomTrailing))
        .overlay(alignment: .topTrailing) { Circle().fill(Color.lime.opacity(0.08)).frame(width: 180, height: 180).offset(x: 60, y: -70).allowsHitTesting(false) }
        .clipShape(.rect(cornerRadius: 20))
        .shadow(color: Color.brandDeep.opacity(0.25), radius: 12, y: 6)
        .environment(\.thinking, loading && (sale != nil || cskh != nil))
    }

    private func teamRow(_ dept: CompanyDept, _ o: API.Overview?) -> some View {
        let t = o?.current.total
        return deptRow(dept, net: t?.closedNet, prev: o?.compare?.total.closedNet, note: t.map { "\(Fmt.int($0.closedOrders)) đơn chốt" },
                       explain: t.map { t in { revenueExplain(dept, t, o?.compare?.total, o?.current.reconcile) } })
    }
    /// Một dòng doanh thu bộ phận: tên + nút (i) bên trái; số tiền, số đơn, so cùng giờ hôm qua bên phải (chạm mở trang bộ phận, kỳ Hôm nay).
    private func deptRow(_ dept: CompanyDept, net: Double?, prev: Double?, note: String?, explain make: (() -> MetricExplain)?) -> some View {
        HStack(alignment: .center, spacing: 8) {
            HStack(spacing: 0) {
                Text(dept.title).font(.system(size: 13, weight: .bold)).foregroundStyle(Color.lime)
                if let make {
                    Button { explain = make() } label: {
                        Image(systemName: "info.circle").font(.system(size: 11, weight: .semibold)).foregroundStyle(.white.opacity(0.7)).frame(width: 24, height: 22).contentShape(.rect)
                    }.buttonStyle(.plain).accessibilityLabel("Cách tính doanh thu \(dept.title)")
                }
            }
            .frame(width: 70, alignment: .leading)
            opener(dept) {
                HStack(spacing: 8) {
                    VStack(alignment: .trailing, spacing: 1) {
                        if let net {
                            Text(hideMoney ? "••••••" : Fmt.vnd(net)).font(.system(size: 17, weight: .bold, design: .rounded)).foregroundStyle(.white)
                                .monospacedDigit().lineLimit(1).minimumScaleFactor(0.6).contentTransition(.numericText())
                        } else if error == nil {
                            RoundedRectangle(cornerRadius: 6).fill(.white.opacity(0.14)).frame(width: 110, height: 18)
                        } else {
                            Text("—").font(.system(size: 17, weight: .bold, design: .rounded)).foregroundStyle(.white.opacity(0.6))
                        }
                        if let note { Text(note).font(.system(size: 10)).foregroundStyle(.white.opacity(0.6)).lineLimit(1) }
                    }
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    deltaPill(net, prev).frame(width: 56, alignment: .trailing)
                }
            }
        }
    }
    @ViewBuilder private func deltaPill(_ now: Double?, _ prev: Double?) -> some View {
        if let now, let d = Fmt.delta(now, prev) {
            let down = d.hasPrefix("-")
            HStack(spacing: 2) {
                Image(systemName: down ? "arrowtriangle.down.fill" : "arrowtriangle.up.fill").font(.system(size: 7))
                Text(d).font(.system(size: 10, weight: .semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
            }
            .foregroundStyle(down ? Color(red: 1, green: 0.62, blue: 0.6) : Color.lime)
            .padding(.horizontal, 5).padding(.vertical, 3).background(.white.opacity(0.1), in: .capsule)
        } else {
            Text(now == nil ? "" : "—").font(.system(size: 10)).foregroundStyle(.white.opacity(0.5))
        }
    }

    /// MKT hôm nay (cùng nguồn trang Marketing, /api/marketing/analytics): số về, chi phí quảng cáo, chi phí mỗi số, mỗi đơn chốt.
    private var mktRow: some View {
        let c = mkt?.current
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text("MKT hôm nay").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.lime)
                Text("số đưa về và chi phí quảng cáo").font(.system(size: 10)).foregroundStyle(.white.opacity(0.55)).lineLimit(1)
                Spacer(minLength: 0)
            }
            opener(.mkt) {
                HStack(alignment: .top, spacing: 0) {
                    mktStat("Số về", c.map { Fmt.int($0.phones) }, c.map { "\(Fmt.int($0.orders)) đơn lên" })
                    mktStat("Chi phí QC", c.map { $0.cost > 0 ? money($0.cost) : "Chưa có" }, c.map { $0.cost > 0 ? "Google Sheet" : "sheet chưa gửi" })
                    mktStat("CP / số", c.map { m in m.costPerLead.map { money($0) } ?? "—" }, c == nil ? nil : "chi phí ÷ số")
                    mktStat("CP / đơn", c.map { m in m.costPerClosed.map { money($0) } ?? "—" }, c == nil ? nil : "chi phí ÷ đơn")
                }
            }
        }
    }
    private func mktStat(_ label: String, _ value: String?, _ note: String?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.system(size: 10)).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
            Text(value ?? "—").font(.system(size: 14, weight: .bold, design: .rounded)).foregroundStyle(.white).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
            Text(note ?? " ").font(.system(size: 9)).foregroundStyle(.white.opacity(0.55)).lineLimit(1).minimumScaleFactor(0.7)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    /// Tiền gọn trong ô nhỏ, theo nút con mắt.
    private func money(_ n: Double) -> String { hideMoney ? "••••" : Fmt.shortVnd(n) }
    /// Chạm mở trang bộ phận với kỳ Hôm nay (cùng số); không xem được trang đó thì chỉ để đọc.
    @ViewBuilder private func opener<Content: View>(_ dept: CompanyDept, @ViewBuilder _ content: () -> Content) -> some View {
        if dept.canOpen(auth.me) {
            Button { nav.homePath.append(.dept(dept, period: .today)) } label: { content().contentShape(.rect) }.buttonStyle(.plain)
        } else {
            content()
        }
    }

    // MARK: Giải thích cách tính

    private func totalExplain(_ cur: (revenue: Double, orders: Double, fromWeb: Int), _ prev: (revenue: Double, orders: Double, fromWeb: Int)?, posCount: Int) -> MetricExplain {
        MetricExplain(
            title: "Doanh thu hôm nay", value: Fmt.money(cur.revenue),
            definition: "Ô \"Tổng cộng · Doanh thu\" trong Thống kê của Pancake, lấy ngày hôm nay ở từng POS rồi cộng lại (\(posCount) POS)\(cur.fromWeb > 0 ? "; \(cur.fromWeb) POS chưa đọc được Pancake nên web tự tính theo cách của Pancake" : ""). Cùng số anh thấy khi mở Thống kê Pancake từng POS. Đơn chốt: \(Fmt.int(cur.orders)).\nDoanh thu Sale, CSKH, MKT bên dưới là số riêng từng bộ phận, xem riêng, không cộng lại thành số này.",
            period: "Hôm nay \(Fmt.day(VNDate.string(.now))) · \(scopeLine)",
            previous: prev.map { ("Hôm qua cả ngày", Fmt.money($0.revenue)) })
    }
    private func revenueExplain(_ dept: CompanyDept, _ t: API.Metrics, _ prev: API.Metrics?, _ r: API.Reconcile?) -> MetricExplain {
        let d = VNDate.string(.now)
        var rec: (ok: Bool, text: String)? = nil
        if let r {
            let ok = Int(t.closedOrders - r.orders) == 0 && abs(t.closedNet - r.net) < 1000
            rec = ok ? (true, "Khớp với đơn gốc: \(Fmt.int(r.orders)) đơn · \(Fmt.money(r.net)).")
                : (false, "Lệch: bảng số liệu \(Fmt.int(t.closedOrders)) / \(Fmt.money(t.closedNet)); đơn gốc \(Fmt.int(r.orders)) / \(Fmt.money(r.net)). Kéo để làm mới.")
        }
        let canList = auth.me?.canView("raw-orders") ?? false
        return MetricExplain(
            title: "Doanh thu \(dept.title) hôm nay", value: Fmt.money(t.closedNet),
            definition: "Tiền các đơn có người bán thuộc bộ phận \(dept.title) (theo web nhân sự, người có hậu tố \(dept == .sale ? "SALE" : "CSKH")) chốt hôm nay: đơn vào Chờ xác nhận lần đầu trong khoảng từ 0h đến lúc tải số, trên \(posScope). Đơn đang huỷ không tính; đơn hoàn vẫn tính.\nTiền sau giảm giá và quà tặng, không cộng phí ship.\nCùng số với bảng \(dept.title) ở Tổng quan khi chọn Hôm nay.",
            period: "Hôm nay \(Fmt.day(d)) · \(scopeLine)",
            previous: prev.map { ("Cùng giờ hôm qua", Fmt.money($0.closedNet)) },
            reconcile: rec,
            count: canList ? Int(t.closedOrders) : nil,
            query: canList ? OrderQuery(start: d, end: d, group: "closed", basis: "confirmed", title: "Đơn \(dept.title) chốt hôm nay", team: dept.rawValue) : nil)
    }
    private func mktExplain(_ a: API.MktAnalytics) -> MetricExplain {
        let c = a.current
        return MetricExplain(
            title: "Doanh thu MKT hôm nay", value: Fmt.money(c.net),
            definition: "Tiền các đơn có Marketer được xác nhận lần đầu hôm nay (từ 0h đến lúc tải số), trên \(posScope). MKT tính chốt là đã xác nhận trên Pancake: không tính đơn mới, chờ xác nhận, huỷ, xoá. Tiền sau giảm giá và quà tặng, không cộng phí ship.\nĐơn MKT do Sale hoặc CSKH gọi chốt nên cũng có trong doanh thu của bộ phận đó; ba số xem riêng.\nHôm nay: \(Fmt.int(c.closed)) đơn chốt, \(Fmt.int(c.phones)) số về, chi phí quảng cáo \(c.cost > 0 ? Fmt.money(c.cost) : "chưa có"). Cùng số với trang Marketing khi chọn Hôm nay.",
            period: "Hôm nay \(Fmt.day(a.period.start)) · \(scopeLine)",
            previous: (a.previous.cutoff != nil ? "Cùng giờ hôm qua" : "Hôm qua", Fmt.money(a.prev.net)))
    }

    // MARK: Việc cần xử lý

    @ViewBuilder private var todo: some View {
        let items = alerts.items(sync: sync)
        HStack {
            Text("Cần xử lý").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink)
            if !items.isEmpty { Text("\(items.count)").font(.system(size: 10, weight: .bold)).foregroundStyle(.white).padding(.horizontal, 6).padding(.vertical, 2).background(Color.bad, in: .capsule) }
            Spacer()
            NavigationLink(value: Route.alerts) {
                HStack(spacing: 2) { Text("Xem tất cả"); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }.font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand)
            }.buttonStyle(.plain)
        }
        if !alerts.loaded && items.isEmpty { Skeleton(height: 56) }
        else if items.isEmpty { AlertsEmpty(failed: alerts.failed) }
        ForEach(items.prefix(3)) { AlertLink(item: $0) }
    }

    // MARK: Ca đang chạy

    @ViewBuilder private var shiftCard: some View {
        if auth.me?.canView("shift") ?? false {
            SectionHead(title: "Ca đang chạy", action: "Xem ca", route: .page("shift")).padding(.top, 4)
            if let s = alerts.shift {
                NavigationLink(value: Route.page("shift")) {
                    Panel {
                        HStack(spacing: 0) {
                            shiftStat("Số đã nhận", Fmt.int(s.total.received), Fmt.delta(s.total.received, s.yesterday.received))
                            shiftStat("Số đã chốt", Fmt.int(s.total.closed), Fmt.delta(s.total.closed, s.yesterday.closed))
                            shiftStat("Chốt nóng", Fmt.pct(s.total.rate), nil)
                        }
                        let top = Array(s.staff.sorted { $0.closed > $1.closed }.prefix(3))
                        if !top.isEmpty {
                            Divider().padding(.vertical, 2)
                            let maxC = max(1, top.map(\.closed).max() ?? 1)
                            ForEach(Array(top.enumerated()), id: \.element.id) { i, p in
                                HStack(spacing: 8) {
                                    Medal(rank: i + 1)
                                    Text(p.name).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1).frame(width: 120, alignment: .leading)
                                    GeometryReader { g in
                                        Capsule().fill(Color.good.opacity(0.15)).overlay(alignment: .leading) { Capsule().fill(Color.good).frame(width: max(4, g.size.width * p.closed / maxC)) }
                                    }.frame(height: 6)
                                    Text("\(Fmt.int(p.closed)) chốt").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.inkSoft).monospacedDigit()
                                }
                            }
                        }
                    }
                }.buttonStyle(.plain)
            } else if alerts.loaded {
                Panel { Text("Chưa đọc được số trong ca.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) }
            } else { Skeleton(height: 90) }
        }
    }
    private func shiftStat(_ label: String, _ value: String, _ delta: String?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.system(size: 10)).foregroundStyle(Color.inkSoft)
            Text(value).font(.system(size: 17, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).monospacedDigit()
            if let delta { Text("\(delta) hôm qua").font(.system(size: 9, weight: .semibold)).foregroundStyle(delta.hasPrefix("-") ? Color.bad : Color.good) }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Tải số

    @MainActor private func load() async {
        loading = true; defer { loading = false }
        let d = VNDate.string(.now)
        var failed: Error?
        if team != "cskh" { do { sale = try await API.overview(start: d, end: d, team: "sale") } catch { failed = error } }
        if team != "sale" { do { cskh = try await API.overview(start: d, end: d, team: "cskh") } catch { failed = error } }
        if let failed {
            if !Task.isCancelled { self.error = failed.localizedDescription }
        } else { loadedAt = .now; error = nil }
        if canMkt, let m = try? await API.mktAnalytics(start: d, end: d, marketerId: nil, teamId: nil, product: nil) { mkt = m }
        if let r = try? await API.pancakeRef(start: d, end: d) { ref = r }
        if !Task.isCancelled { refLoaded = true }
    }
    @MainActor private func reload(force: Bool) async {
        await load()
        await sync.refresh()
        await alerts.refresh(maxAge: force ? 0 : 60, me: auth.me)
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

/// Không có dòng nào: báo không có việc khẩn cấp, hoặc báo chưa tải được (không báo yên khi mất mạng).
struct AlertsEmpty: View {
    let failed: Bool
    var body: some View {
        Panel {
            if failed { Label("Chưa tải được việc cần xử lý. Kéo xuống để thử lại.", systemImage: "wifi.exclamationmark").font(.system(size: 13)).foregroundStyle(Color.warn) }
            else { Label("Không có việc khẩn cấp lúc này.", systemImage: "checkmark.circle.fill").font(.system(size: 13)).foregroundStyle(Color.good) }
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
                Text(item.title).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink)
                Text(item.sub).font(.system(size: 11)).foregroundStyle(Color.inkSoft).lineLimit(2)
            }
            Spacer()
            if item.route != nil { Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft) }
        }
        .padding(12).background(Color.card, in: .rect(cornerRadius: 12)).cardShadow()
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
        if me.canView("shift") { r.append(Item(id: "shift", title: "Trong ca", icon: "clock.fill", tint: .good, route: .page("shift"))) }
        if me.canView("raw-orders") { r.append(Item(id: "new", title: "Đơn mới chưa chốt", icon: "hourglass", tint: .orange, route: .orders(Self.newOrders(d)))) }
        if me.canView("customers") { r.append(Item(id: "customers", title: "Tra khách", icon: "person.text.rectangle.fill", tint: .blue, route: .page("customers"))) }
        if me.canView("overview") { r.append(Item(id: "pos", title: "Theo từng POS", icon: "building.2.fill", tint: .brand, route: .overview)) }
        if me.canView("calls") { r.append(Item(id: "calls", title: "Cuộc gọi CSKH", icon: "phone.fill", tint: .teal, route: .dept(.cskh, page: "calls"))) }
        if me.canView("batches") { r.append(Item(id: "batches", title: "Data Sale", icon: "tray.full.fill", tint: .good, route: .dept(.sale, page: "batches"))) }
        if me.canView("monthly") { r.append(Item(id: "monthly", title: "Báo cáo tháng", icon: "calendar", tint: .purple, route: .page("monthly"))) }
        if me.canView("people") { r.append(Item(id: "approvals", title: "Duyệt nhân sự", icon: "checkmark.seal.fill", tint: .warn, route: .hr("approvals"))) }
        return Array(r.prefix(8))
    }
    var body: some View {
        let list = items
        if !list.isEmpty {
            Text("Lối tắt").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink).padding(.top, 4)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 14) {
                ForEach(list) { x in
                    NavigationLink(value: x.route) {
                        VStack(spacing: 6) {
                            MetricIcon(x.icon, size: 19).foregroundStyle(x.tint)
                                .frame(width: 52, height: 52).background(x.tint.opacity(0.12), in: .rect(cornerRadius: 16))
                            Text(x.title).font(.system(size: 11, weight: .medium)).foregroundStyle(Color.ink).multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.85)
                                .frame(height: 28, alignment: .top)
                        }.frame(maxWidth: .infinity).contentShape(.rect)
                    }.buttonStyle(.plain)
                }
            }
            .padding(.vertical, 14).padding(.horizontal, 8)
            .background(Color.card, in: .rect(cornerRadius: 16)).cardShadow()
        }
    }
}
