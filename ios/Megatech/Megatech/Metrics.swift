import SwiftUI

// "Cách tính" dùng chung với web (lưu trên máy chủ theo tài khoản) + khối "Số tham chiếu Pancake".
// Tỷ lệ chốt / hoàn / hủy luôn đọc từ máy chủ (field rate, returnRatio, cancelRatio), app không tự tính.

struct MetricSettings: Codable, Equatable {
    var rateBase = "created"      // created | assigned
    var returnBase = "shipped"    // shipped | closed | created
    var success = "delivered"     // delivered | sent
}

extension API {
    struct MetricBase: Decodable { let label: String; let short: String?; let hint: String }
    struct MetricLabels: Decodable {
        let rateBases: [String: MetricBase]; let returnBases: [String: MetricBase]; let successBases: [String: MetricBase]
        /// Ngưỡng màu tỷ lệ chốt dùng chung với web (tốt ≥ good, khá ≥ warn).
        var rateThresholds: RateThresholds? = nil
        /// Nhãn giống máy chủ, dùng khi chưa tải được (lần đầu mở app, mất mạng).
        static let fallback = MetricLabels(
            rateBases: ["created": .init(label: "Đơn lên", short: "chốt ÷ đơn lên", hint: "Như Pancake: đơn chốt ÷ (tổng đơn − đơn xóa)"),
                        "assigned": .init(label: "Data được chia", short: "chốt ÷ đơn chia", hint: "Đơn chốt ÷ đơn được chia cho người bán trong kỳ")],
            returnBases: ["shipped": .init(label: "Đơn đã gửi ĐVVC", short: "hoàn ÷ đã gửi", hint: "Đơn hoàn ÷ đơn đã giao cho đơn vị vận chuyển (đã gửi, đã nhận, hoàn)"),
                          "closed": .init(label: "Đơn chốt", short: "hoàn ÷ đơn chốt", hint: "Đơn hoàn ÷ đơn đã xác nhận trở đi"),
                          "created": .init(label: "Đơn lên", short: "hoàn ÷ đơn lên", hint: "Đơn hoàn ÷ mọi đơn tạo trong kỳ")],
            successBases: ["delivered": .init(label: "Đã nhận + Đã thu tiền", short: nil, hint: "Khách đã nhận hàng"),
                           "sent": .init(label: "Thêm cả Đã gửi hàng", short: nil, hint: "Tính cả đơn đang trên đường giao")])
    }
    struct RateThresholds: Decodable { let good: Double; let warn: Double }
    struct MetricPrefsResponse: Decodable { let settings: MetricSettings; let own: Bool; let labels: MetricLabels? }
    static func metricPrefs() async throws -> MetricPrefsResponse { try await request("/api/prefs/metrics") }
    static func saveMetricPrefs(_ s: MetricSettings) async throws -> MetricPrefsResponse {
        try await request("/api/prefs/metrics", method: "PUT", body: ["rateBase": s.rateBase, "returnBase": s.returnBase, "success": s.success])
    }
    static func resetMetricPrefs() async throws -> MetricPrefsResponse { try await request("/api/prefs/metrics", method: "PUT", body: ["scope": "reset"]) }

    // MARK: Số tham chiếu Pancake
    struct RefBlock: Decodable { let orders: Double; let sales: Double; let revenue: Double; let profit: Double?; let quantity: Double }
    struct RefReturned: Decodable { let orders: Double; let revenue: Double; let quantity: Double }
    struct RefPart: Decodable { let total: RefBlock; let online: RefBlock; let counter: RefBlock; let returned: RefReturned }
    struct RefPos: Decodable { let posId: String; let source: String; let error: String?; let web: RefPart; let pancake: RefPart?; var part: RefPart { pancake ?? web } }
    struct PancakeRef: Decodable { let start: String; let end: String; let prevStart: String; let prevEnd: String; let current: [RefPos]; let previous: [RefPos] }
    static func pancakeRef(start: String, end: String, posIds: [String] = []) async throws -> PancakeRef {
        try await request("/api/reports/pancake-ref?start=\(start)&end=\(end)&posIds=\(posIds.joined(separator: ","))")
    }
}

/// Cách tính đang dùng của tài khoản. Giữ bản sao trong UserDefaults để request báo cáo đầu tiên (trước khi tải xong) đã đúng cách tính.
@Observable final class MetricPrefs {
    static let shared = MetricPrefs()
    private static let storeKey = "thp_metrics"
    private(set) var settings: MetricSettings
    private(set) var own = false
    private(set) var labels: API.MetricLabels = .fallback
    /// Tăng mỗi khi cách tính đổi: các tab báo cáo gắn .id(revision) để dựng lại và tải số mới.
    private(set) var revision = 0
    var saving = false
    var error: String?

    init() { settings = Self.stored() }
    static func stored() -> MetricSettings {
        guard let d = UserDefaults.standard.data(forKey: storeKey), let s = try? JSONDecoder().decode(MetricSettings.self, from: d) else { return MetricSettings() }
        return s
    }
    /// Gắn vào mọi URL /api/reports/* (API.makeRequest).
    static var queryString: String { let s = stored(); return "rateBase=\(s.rateBase)&returnBase=\(s.returnBase)&success=\(s.success)" }

    var assigned: Bool { settings.rateBase == "assigned" }
    var goodRate: Double { labels.rateThresholds?.good ?? 40 }
    var warnRate: Double { labels.rateThresholds?.warn ?? 25 }
    var rateHint: String { labels.rateBases[settings.rateBase]?.hint ?? "" }
    var rateShort: String { labels.rateBases[settings.rateBase]?.short ?? (assigned ? "chốt ÷ đơn chia" : "chốt ÷ đơn lên") }
    /// "X chốt / Y tạo" (theo đơn lên) hoặc "X chốt / Y chia" (theo data được chia).
    func fraction(closed: Double, orders: Double, assignedOrders: Double?) -> String {
        assigned ? "\(Fmt.int(closed)) chốt / \(Fmt.int(assignedOrders ?? 0)) chia" : "\(Fmt.int(closed)) chốt / \(Fmt.int(orders)) tạo"
    }

    @MainActor func load() async {
        do { apply(try await API.metricPrefs()) } catch { }
    }
    @MainActor func save(_ s: MetricSettings) async {
        saving = true; defer { saving = false }
        do { apply(try await API.saveMetricPrefs(s)); error = nil } catch { self.error = error.localizedDescription }
    }
    @MainActor func reset() async {
        saving = true; defer { saving = false }
        do { apply(try await API.resetMetricPrefs()); error = nil } catch { self.error = error.localizedDescription }
    }
    @MainActor private func apply(_ r: API.MetricPrefsResponse) {
        if let l = r.labels { labels = l }
        own = r.own
        if r.settings != settings {
            settings = r.settings
            if let d = try? JSONEncoder().encode(r.settings) { UserDefaults.standard.set(d, forKey: Self.storeKey) }
            revision += 1
        } else if UserDefaults.standard.data(forKey: Self.storeKey) == nil, let d = try? JSONEncoder().encode(r.settings) {
            UserDefaults.standard.set(d, forKey: Self.storeKey)
        }
    }
}

extension Fmt {
    /// Màu tỷ lệ chốt theo ngưỡng chung với web: xanh ≥ tốt, cam ≥ khá, còn lại đỏ.
    static func rateTone(_ r: Double?) -> Color {
        guard let r else { return .inkSoft }
        let p = MetricPrefs.shared
        return r >= p.goodRate ? .good : r >= p.warnRate ? .warn : .bad
    }
    static func rateWord(_ r: Double?) -> String {
        guard let r else { return "—" }
        let p = MetricPrefs.shared
        return r >= p.goodRate ? "Tốt · \(pct(r))" : r >= p.warnRate ? "Khá · \(pct(r))" : "Cần cải thiện"
    }
}

/// Biểu tượng chỉ số: "ic_m_*" là bộ biểu tượng trong Assets, khác là SF Symbol; khi bật Reicon (Reicon.enabled) tên có trong bảng Reicon vẽ bằng Reicon.
/// Tất cả là ảnh template, nhuộm theo foregroundStyle. fill = kiểu đặc của Reicon (mặc định), false = kiểu nét.
struct MetricIcon: View {
    let name: String; var size: CGFloat = 15; var weight: Font.Weight = .semibold; var fill = true
    init(_ name: String, size: CGFloat = 15, weight: Font.Weight = .semibold, fill: Bool = true) { self.name = name; self.size = size; self.weight = weight; self.fill = fill }
    var body: some View {
        if let asset = Reicon.asset(name, fill: fill) { Image(asset).renderingMode(.template).resizable().scaledToFit().frame(width: size * 1.3, height: size * 1.3) }
        else if name.hasPrefix("ic_m_") { Image(name).renderingMode(.template).resizable().scaledToFit().frame(width: size * 1.15, height: size * 1.15) }
        else { Image(systemName: name).font(.system(size: size, weight: weight)) }
    }
}

// Tỷ lệ chốt theo cách tính đang chọn (máy chủ trả `rate`); máy chủ cũ chưa có field thì dùng closeRate.
extension API.Metrics { var shownRate: Double? { rate ?? closeRate }; var rateFrac: String { MetricPrefs.shared.fraction(closed: closedOrders, orders: orders, assignedOrders: assignedOrders) } }
extension API.PosRow { var shownRate: Double? { rate ?? (orders > 0 ? closedOrders / orders * 100 : nil) } }
extension API.EmployeeRow {
    var shownRate: Double? { rate ?? closeRate }
    /// Mẫu số của tỷ lệ chốt theo cách tính đang chọn.
    var rateDen: Double { MetricPrefs.shared.assigned ? assignedOrders : orders }
    var rateFrac: String { MetricPrefs.shared.fraction(closed: closedOrders, orders: orders, assignedOrders: assignedOrders) }
}

// MARK: Màn "Cách tính" (tab Thêm)

struct MetricSettingsView: View {
    private var prefs: MetricPrefs { MetricPrefs.shared }
    private static let rateKeys = ["created", "assigned"], returnKeys = ["shipped", "closed", "created"], successKeys = ["delivered", "sent"]

    var body: some View {
        let s = prefs.settings, l = prefs.labels
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PageTitle(title: "Cách tính", subtitle: "Một cách tính cho mọi trang báo cáo")
                if let e = prefs.error { Label(e, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.system(size: 12)) }
                group("Tỷ lệ chốt so với", icon: "ic_m_rate", keys: Self.rateKeys, bases: l.rateBases, selected: s.rateBase) { var n = s; n.rateBase = $0; return n }
                group("Tỷ lệ hoàn chia cho", icon: "ic_m_returned", keys: Self.returnKeys, bases: l.returnBases, selected: s.returnBase) { var n = s; n.returnBase = $0; return n }
                group("Mua thành công gồm", icon: "checkmark.seal", keys: Self.successKeys, bases: l.successBases, selected: s.success) { var n = s; n.success = $0; return n }
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "info.circle.fill").font(.system(size: 15)).foregroundStyle(Color.good)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Lưu theo tài khoản: web và app dùng chung. Khối Số tham chiếu Pancake luôn giữ cách Pancake tính.").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink)
                        Text(prefs.own ? "Bạn đang dùng cách tính riêng." : "Bạn đang dùng mặc định công ty.").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                    }
                }.padding(12).frame(maxWidth: .infinity, alignment: .leading).background(Color.brandSoft, in: .rect(cornerRadius: 12))
                if prefs.own {
                    Button { Task { await prefs.reset() } } label: {
                        HStack(spacing: 8) { Image(systemName: "arrow.counterclockwise"); Text("Về mặc định công ty") }.font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.ink)
                            .frame(maxWidth: .infinity).padding(.vertical, 12).background(Color.card, in: .rect(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.black.opacity(0.1)))
                    }.buttonStyle(.plain).disabled(prefs.saving)
                }
            }.padding(16).padding(.bottom, 90)
        }
        .overlay(alignment: .top) { if prefs.saving { ProgressView().padding(8).background(.regularMaterial, in: .capsule).padding(.top, 8) } }
        .navigationTitle("Cách tính").navigationBarTitleDisplayMode(.inline).brandNav()
        .refreshable { await prefs.load() }
        .task { await prefs.load() }
    }

    @ViewBuilder private func group(_ title: String, icon: String, keys: [String], bases: [String: API.MetricBase], selected: String, make: @escaping (String) -> MetricSettings) -> some View {
        HStack(spacing: 6) { MetricIcon(icon, size: 12, weight: .bold).foregroundStyle(Color.brand); Text(title).font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink) }.padding(.top, 4)
        VStack(spacing: 0) {
            let shown = keys.filter { bases[$0] != nil }
            ForEach(Array(shown.enumerated()), id: \.element) { i, k in
                let b = bases[k]!, on = k == selected
                Button { guard !on else { return }; Task { await prefs.save(make(k)) } } label: {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(b.label).font(.system(size: 14, weight: on ? .semibold : .medium)).foregroundStyle(Color.ink)
                            Text(b.hint).font(.system(size: 10)).foregroundStyle(Color.inkSoft).fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer()
                        Image(systemName: on ? "checkmark.circle.fill" : "circle").font(.system(size: 18)).foregroundStyle(on ? Color.good : Color.inkSoft.opacity(0.5))
                    }.padding(12).contentShape(.rect)
                }.buttonStyle(.plain).disabled(prefs.saving)
                if i < shown.count - 1 { Divider().padding(.leading, 12) }
            }
        }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
    }
}

// MARK: Khối "Số tham chiếu Pancake"

struct PancakeRefCard: View {
    let start: String; let end: String; var posIds: [String] = []
    @State private var data: API.PancakeRef?
    @State private var channel = "total"
    @State private var loading = false

    private struct Sum { var orders = 0.0, sales = 0.0, revenue = 0.0, profit: Double? = 0, quantity = 0.0 }
    private struct Agg { var total = Sum(), online = Sum(), counter = Sum(), returnedQty = 0.0 }
    private static func add(_ s: inout Sum, _ b: API.RefBlock) {
        s.orders += b.orders; s.sales += b.sales; s.revenue += b.revenue; s.quantity += b.quantity
        if let p = b.profit, let q = s.profit { s.profit = q + p } else { s.profit = nil }
    }
    private static func agg(_ rows: [API.RefPos]) -> Agg {
        var a = Agg()
        for r in rows { let p = r.part; add(&a.total, p.total); add(&a.online, p.online); add(&a.counter, p.counter); a.returnedQty += p.returned.quantity }
        return a
    }
    private func pick(_ a: Agg) -> Sum { channel == "online" ? a.online : channel == "counter" ? a.counter : a.total }
    private func dm(_ s: String) -> String { let p = s.split(separator: "-"); return p.count == 3 ? "\(p[2])/\(p[1])" : s }

    var body: some View {
        Panel {
            HStack(alignment: .center) {
                Text("Số tham chiếu Pancake").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink)
                Spacer()
                if let d = data {
                    let fromPancake = !d.current.isEmpty && d.current.allSatisfy { $0.source == "pancake" }
                    Tag(text: fromPancake ? "Lấy từ Pancake" : "Web tự tính", tone: fromPancake ? .green : .gray, dot: true)
                }
            }
            if let d = data {
                let cur = Self.agg(d.current), prev = Self.agg(d.previous)
                let c = pick(cur), p = pick(prev)
                Text("% so với \(dm(d.prevStart))–\(dm(d.prevEnd)) · cách tính của Pancake").font(.system(size: 10)).foregroundStyle(Color.inkSoft).padding(.top, -6)
                Segmented(selection: $channel, options: [("total", "Tổng cộng"), ("online", "Online"), ("counter", "Bán tại quầy")])
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                    RefCell(icon: "ic_m_revenue", label: "Doanh số", value: Fmt.short(c.sales), now: c.sales, prev: p.sales)
                    RefCell(icon: "ic_m_revenue", label: "Doanh thu", value: Fmt.short(c.revenue), now: c.revenue, prev: p.revenue)
                    RefCell(icon: "banknote", label: "Lợi nhuận", value: c.profit.map { Fmt.short($0) } ?? "—", now: c.profit, prev: p.profit)
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    RefCell(icon: "ic_m_closed", label: "Đơn chốt", value: Fmt.int(c.orders), now: c.orders, prev: p.orders)
                    RefCell(icon: "ic_m_aov", label: "GTTB", value: c.orders > 0 ? Fmt.short(c.revenue / c.orders) : "—", now: c.orders > 0 ? c.revenue / c.orders : 0, prev: p.orders > 0 ? p.revenue / p.orders : 0)
                    RefCell(icon: "ic_m_products", label: "SL sản phẩm", value: Fmt.int(c.quantity), now: c.quantity, prev: p.quantity)
                    RefCell(icon: "ic_m_products", label: "SP trung bình", value: c.orders > 0 ? String(format: "%.2f", c.quantity / c.orders).replacingOccurrences(of: ".", with: ",") : "—", now: c.orders > 0 ? c.quantity / c.orders : 0, prev: p.orders > 0 ? p.quantity / p.orders : 0)
                }
                HStack(spacing: 6) {
                    MetricIcon("ic_m_products", size: 10).foregroundStyle(Color.inkSoft)
                    Text("Hàng chốt \(Fmt.int(cur.total.quantity))").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink)
                    Text("·").foregroundStyle(Color.inkSoft)
                    Text("Hàng hoàn \(Fmt.int(cur.returnedQty))").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink)
                    if let dl = RefCell.change(cur.returnedQty, prev.returnedQty) { RefDelta(pct: dl, upIsGood: false) }
                    Spacer()
                }
                let on = cur.online.revenue, ct = cur.counter.revenue, sum = on + ct
                VStack(alignment: .leading, spacing: 4) {
                    GeometryReader { g in
                        HStack(spacing: 2) {
                            if sum > 0 {
                                if on > 0 { Capsule().fill(Color.brand).frame(width: max(4, (g.size.width - (ct > 0 ? 2 : 0)) * on / sum)) }
                                if ct > 0 { Capsule().fill(Color.warn) }
                            } else { Capsule().fill(Color.black.opacity(0.06)) }
                        }
                    }.frame(height: 7)
                    HStack {
                        HStack(spacing: 4) { Circle().fill(Color.brand).frame(width: 7, height: 7); Text("Online \(Fmt.pct0(sum > 0 ? on / sum * 100 : nil)) · \(Fmt.short(on))") }
                        Spacer()
                        HStack(spacing: 4) { Circle().fill(Color.warn).frame(width: 7, height: 7); Text("Tại quầy \(Fmt.pct0(sum > 0 ? ct / sum * 100 : nil)) · \(Fmt.short(ct))") }
                    }.font(.system(size: 9)).foregroundStyle(Color.inkSoft)
                }
                let errs = d.current.compactMap { $0.error }.filter { !$0.isEmpty }
                if !errs.isEmpty { Text("Một số POS chưa lấy được từ Pancake, đang dùng số web tự tính.").font(.system(size: 9)).foregroundStyle(Color.warn) }
            } else if loading { Skeleton(height: 150) }
            else { Text("Chưa tải được số tham chiếu. Kéo để làm mới.").font(.system(size: 11)).foregroundStyle(Color.inkSoft) }
        }
        .environment(\.thinking, loading && data != nil)
        .task(id: "\(start)|\(end)|\(posIds.joined(separator: ","))") { await load() }
    }
    @MainActor private func load() async {
        loading = true; defer { loading = false }
        if let d = try? await API.pancakeRef(start: start, end: end, posIds: posIds) { data = d }
    }
}

/// Ô số trong khối tham chiếu: nhãn, giá trị, % so kỳ trước (ẩn khi cả hai = 0).
private struct RefCell: View {
    var icon: String? = nil
    let label: String; let value: String; let now: Double?; let prev: Double?
    var upIsGood = true
    static func change(_ now: Double?, _ prev: Double?) -> Double? {
        guard let now, let prev else { return nil }
        if now == 0 && prev == 0 { return nil }
        guard prev != 0 else { return nil }
        return (now - prev) / abs(prev) * 100
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) { if let icon { MetricIcon(icon, size: 9).foregroundStyle(Color.brand) }; Text(label).font(.system(size: 9)).foregroundStyle(Color.inkSoft).lineLimit(1) }
            Text(value).font(.system(size: 15, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).monospacedDigit().minimumScaleFactor(0.6).lineLimit(1).rolling(value)
            if let d = Self.change(now, prev) { RefDelta(pct: d, upIsGood: upIsGood) } else { Text(" ").font(.system(size: 9)) }
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(10).background(Color.black.opacity(0.04), in: .rect(cornerRadius: 10))
    }
}

private struct RefDelta: View {
    let pct: Double; var upIsGood = true
    var body: some View {
        let up = pct >= 0, good = up == upIsGood
        HStack(spacing: 2) {
            Image(systemName: up ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill").font(.system(size: 7))
            Text((up ? "+" : "") + String(format: "%.1f%%", pct).replacingOccurrences(of: ".", with: ","))
        }.font(.system(size: 9, weight: .semibold)).foregroundStyle(good ? Color.good : Color.bad)
    }
}
