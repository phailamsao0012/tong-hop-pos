import SwiftUI

// MARK: Đơn nguồn Pancake POS (ảnh 6.1)

struct RawOrdersView: View {
    @State private var pos = ""
    @State private var period: Period = .week
    @State private var group = ""
    @State private var q = ""
    @State private var rows: [API.OrderRow] = []
    @State private var page = 1
    @State private var hasMore = false
    @State private var loading = false
    @Environment(SyncStatus.self) private var sync
    static let groups = [("", "Tất cả"), ("closed", "Đơn chốt"), ("unconfirmed", "Chờ xác nhận"), ("confirmed", "Đang xử lý"), ("shipping", "Đang giao"), ("delivered", "Hoàn thành"), ("returned", "Hoàn"), ("cancelled", "Đã hủy")]
    private var query: OrderQuery { var x = OrderQuery(start: period.range.0, end: period.range.1, posIds: pos.isEmpty ? [] : [pos], group: group, title: "Đơn nguồn"); x.q = q; return x }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PageTitle(title: "Đơn nguồn Pancake POS", subtitle: "Minh bạch dữ liệu gốc. Vững vàng vận hành.", trailing: AnyView(Image(systemName: "info.circle").font(.system(size: 16)).foregroundStyle(Color.inkSoft)))
                HStack(spacing: 10) {
                    Image(systemName: "cylinder.split.1x2.fill").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.good).frame(width: 36, height: 36).background(Color.good.opacity(0.15), in: .rect(cornerRadius: 10))
                    Text("Đây là dữ liệu đơn hàng nguồn được đồng bộ trực tiếp từ Pancake POS. Phục vụ đối soát, CSKH và vận hành nội bộ.").font(.system(size: 11)).foregroundStyle(Color.ink)
                }.padding(12).background(Color.brandSoft, in: .rect(cornerRadius: 12))
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 4) { Text("POS").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                        Menu { Button("Tất cả POS") { pos = "" }; ForEach(PosBreakdown.order, id: \.self) { id in Button(PosBreakdown.names[id] ?? id) { pos = id } } } label: { SelectBox(text: pos.isEmpty ? "Tất cả POS" : (PosBreakdown.short[pos] ?? pos)) } }
                    VStack(alignment: .leading, spacing: 4) { Text("Khoảng thời gian").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                        PeriodMenu(period: $period, options: [.today, .yesterday, .week, .month, .last, .d90]) }
                }
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 4) { Text("Trạng thái đơn").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                        Menu { ForEach(Self.groups, id: \.0) { k, l in Button(l) { group = k } } } label: { SelectBox(text: Self.groups.first { $0.0 == group }?.1 ?? "Tất cả") } }
                    VStack(alignment: .leading, spacing: 4) { Text(" ").font(.system(size: 10))
                        HStack(spacing: 6) { Image(systemName: "magnifyingglass").font(.system(size: 11)).foregroundStyle(Color.inkSoft); TextField("Tìm theo mã đơn, SĐT…", text: $q).font(.system(size: 12)).onSubmit { Task { await load(next: false) } } }.padding(.horizontal, 10).padding(.vertical, 9).background(Color.card, in: .rect(cornerRadius: 9)).overlay(RoundedRectangle(cornerRadius: 9).stroke(Color.black.opacity(0.1))) }
                }
                HStack { Text("\(rows.count)\(hasMore ? "+" : "") đơn").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink); Hint(text: period.label); Spacer(); VStack(alignment: .trailing, spacing: 1) { Text("Cập nhật gần nhất").font(.system(size: 9)).foregroundStyle(Color.inkSoft); HStack(spacing: 4) { Circle().fill(sync.tone == .lime ? Color.good : sync.tone).frame(width: 6, height: 6); Text(sync.subtitle).font(.system(size: 10, weight: .semibold)).foregroundStyle(Color.ink) } } }
                if loading && rows.isEmpty { Skeleton(height: 90); Skeleton(height: 90) }
                VStack(spacing: 10) {
                    ForEach(rows) { o in
                        NavigationLink(value: Route.order(o.id)) {
                            Panel(padding: 12) {
                                HStack { Text("#\(o.orderId)").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink); Tag(text: o.statusName, tone: tone(o.statusCode)); Spacer(); Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft) }
                                Text(Fmt.dateTime(o.createdAt)).font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                                HStack(spacing: 14) {
                                    HStack(spacing: 4) { Image(systemName: "person").font(.system(size: 9)); Text(o.customer ?? o.phone ?? "Khách lẻ").lineLimit(1) }
                                    HStack(spacing: 4) { Image(systemName: "storefront").font(.system(size: 9)); Text(PosBreakdown.short[o.posId] ?? o.posName).lineLimit(1) }
                                    Spacer()
                                    HStack(spacing: 4) { Image(systemName: "banknote").font(.system(size: 9)); Text(Fmt.vnd(o.net ?? o.currentTotal ?? 0)).font(.system(size: 11, weight: .bold)).foregroundStyle(Color.ink) }
                                }.font(.system(size: 10)).foregroundStyle(Color.inkSoft).padding(.top, 4)
                            }
                        }.buttonStyle(.plain)
                    }
                    if hasMore { Button { Task { await load(next: true) } } label: { Text("Tải thêm").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand).frame(maxWidth: .infinity).padding(10) } }
                    if rows.isEmpty && !loading { Panel { Text("Không có đơn khớp bộ lọc.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) } }
                }
                HStack(spacing: 8) { Image(systemName: "cylinder.split.1x2").foregroundStyle(Color.good); Text("Trường dữ liệu hiển thị theo cấu trúc gốc Pancake POS (Mã đơn, thời gian, POS, khách hàng, sản phẩm, giá trị…).").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }.padding(12).background(Color.brandSoft.opacity(0.6), in: .rect(cornerRadius: 12))
            }.padding(16)
        }
        .navigationTitle("Đơn nguồn Pancake POS").navigationBarTitleDisplayMode(.inline).brandNav()
        .task(id: "\(pos)|\(period.key)|\(group)") { await load(next: false) }
    }
    private func tone(_ c: Int?) -> Tone { switch c ?? -1 { case 3, 16: return .green; case 2: return .blue; case 4, 5, 15: return .orange; case 6, 7: return .red; case 0, 17: return .gray; default: return .orange } }
    @MainActor private func load(next: Bool) async {
        loading = true; defer { loading = false }
        if let r = try? await API.orders(query, page: next ? page + 1 : 1) { rows = next ? rows + r.orders : r.orders; page = r.page; hasMore = r.hasMore }
    }
}

struct SelectBox: View {
    let text: String; var icon: String? = nil
    var body: some View {
        HStack(spacing: 6) { if let icon { Image(systemName: icon).font(.system(size: 11)).foregroundStyle(Color.inkSoft) }; Text(text).font(.system(size: 12, weight: .medium)).foregroundStyle(Color.ink).lineLimit(1); Spacer(); Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold)).foregroundStyle(Color.inkSoft) }
            .padding(.horizontal, 10).padding(.vertical, 9).background(Color.card, in: .rect(cornerRadius: 9)).overlay(RoundedRectangle(cornerRadius: 9).stroke(Color.black.opacity(0.1)))
    }
}

// MARK: Báo cáo cuối tháng (ảnh 5.2)

struct MonthlyView: View {
    @State private var offset = 0
    @State private var data: API.Overview?
    @State private var error: String?
    @State private var share = false
    private var month: (String, String, String, String) {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = VNDate.tz
        let start = cal.date(byAdding: .month, value: -offset, to: cal.date(from: cal.dateComponents([.year, .month], from: .now))!)!
        let next = cal.date(byAdding: .month, value: 1, to: start)!
        let end = offset == 0 ? Date.now : next.addingTimeInterval(-1)
        let prev = cal.date(byAdding: .month, value: -1, to: start)!
        let f = DateFormatter(); f.timeZone = VNDate.tz; f.dateFormat = "'Tháng' MM/yyyy"
        return (VNDate.string(start), VNDate.string(end), f.string(from: start), f.string(from: prev))
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Button { offset += 1 } label: { Image(systemName: "chevron.left").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink).frame(width: 40, height: 40).background(Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.1))) }
                    HStack { Image(systemName: "calendar").foregroundStyle(Color.inkSoft); Text(month.2).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).rolling(month.2); Spacer(); Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold)).foregroundStyle(Color.inkSoft) }.padding(.horizontal, 12).frame(height: 40).background(Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.1)))
                    Button { offset = max(0, offset - 1) } label: { Image(systemName: "chevron.right").font(.system(size: 13, weight: .bold)).foregroundStyle(offset == 0 ? Color.inkSoft : Color.ink).frame(width: 40, height: 40).background(Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.1))) }.disabled(offset == 0)
                }
                if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
                if let t = data?.current.total {
                    let p = data?.compare?.total
                    let q = { (g: String, b: String, ti: String) in Route.orders(OrderQuery(start: month.0, end: month.1, group: g, basis: b, title: ti)) }
                    HStack(spacing: 10) {
                        NavigationLink(value: q("closed", "confirmed", "Đơn chốt")) { KpiCard(icon: "banknote.fill", tint: .good, label: "Tổng doanh thu", value: Fmt.vnd(t.closedNet), delta: Fmt.delta(t.closedNet, p?.closedNet).map { "\($0) so với tháng trước" }) }
                        NavigationLink(value: q("", "created", "Đơn tạo")) { KpiCard(icon: "cart.fill", tint: .good, label: "Tổng đơn hàng", value: Fmt.int(t.orders), delta: Fmt.delta(t.orders, p?.orders).map { "\($0) so với tháng trước" }) }
                    }.buttonStyle(.plain)
                    let dl = t.groups["delivered"]?.orders ?? 0, pr = (t.groups["confirmed"]?.orders ?? 0) + (t.groups["shipping"]?.orders ?? 0) + (t.groups["new"]?.orders ?? 0), cn = (t.groups["cancelled"]?.orders ?? 0)
                    HStack(spacing: 8) {
                        NavigationLink(value: q("delivered", "created", "Đơn đã giao")) { SmallStat(icon: "truck.box.fill", tint: .good, label: "Đơn đã giao", value: Fmt.int(dl), pct: t.orders > 0 ? dl / t.orders * 100 : nil) }
                        NavigationLink(value: q("confirmed", "created", "Đơn đang xử lý")) { SmallStat(icon: "clock.fill", tint: .warn, label: "Đơn đang xử lý", value: Fmt.int(pr), pct: t.orders > 0 ? pr / t.orders * 100 : nil) }
                        NavigationLink(value: q("cancelled", "created", "Đơn hủy")) { SmallStat(icon: "xmark", tint: .bad, label: "Đơn hủy", value: Fmt.int(cn), pct: t.orders > 0 ? cn / t.orders * 100 : nil) }
                    }.buttonStyle(.plain)
                    Panel {
                        HStack { Text("Xu hướng doanh thu").font(.system(size: 15, weight: .bold)); Spacer(); HStack(spacing: 10) { HStack(spacing: 3) { Circle().fill(Color.good.opacity(0.35)).frame(width: 7, height: 7); Text(month.3) }; HStack(spacing: 3) { Circle().fill(Color.good).frame(width: 7, height: 7); Text(month.2) } }.font(.system(size: 9)).foregroundStyle(Color.inkSoft) }
                        DualLine(a: cumulative(data?.compare?.series ?? []), b: cumulative(data?.current.series ?? []))
                    }
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) { Text(Fmt.vnd(p?.closedNet ?? 0)).font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink).minimumScaleFactor(0.7).lineLimit(1); Text(month.3).font(.system(size: 9)).foregroundStyle(Color.inkSoft); Text("Doanh thu chốt").font(.system(size: 8)).foregroundStyle(Color.inkSoft) }.frame(maxWidth: .infinity, alignment: .leading).padding(10).background(Color.card, in: .rect(cornerRadius: 10)).cardShadow()
                        VStack(alignment: .leading, spacing: 2) { Text(Fmt.vnd(t.closedNet)).font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink).minimumScaleFactor(0.7).lineLimit(1); Text(month.2).font(.system(size: 9)).foregroundStyle(Color.inkSoft); Text("Doanh thu chốt").font(.system(size: 8)).foregroundStyle(Color.inkSoft) }.frame(maxWidth: .infinity, alignment: .leading).padding(10).background(Color.card, in: .rect(cornerRadius: 10)).cardShadow()
                        VStack(alignment: .leading, spacing: 2) { Text(Fmt.delta(t.closedNet, p?.closedNet) ?? "—").font(.system(size: 13, weight: .bold)).foregroundStyle((Fmt.delta(t.closedNet, p?.closedNet) ?? "").hasPrefix("-") ? Color.bad : Color.good); Text("Tăng trưởng").font(.system(size: 9)).foregroundStyle(Color.inkSoft); Text("Doanh thu chốt").font(.system(size: 8)).foregroundStyle(Color.inkSoft) }.frame(maxWidth: .infinity, alignment: .leading).padding(10).background(Color.brandSoft, in: .rect(cornerRadius: 10))
                    }
                    PosBreakdown(rows: data?.current.byPos ?? [], total: t.closedNet)
                    PrimaryButton(title: "Xuất báo cáo", icon: "square.and.arrow.down") { share = true }
                    HStack(alignment: .top, spacing: 8) { Image(systemName: "info.circle.fill").foregroundStyle(Color.blue); VStack(alignment: .leading, spacing: 3) { Text("Ghi chú & Định nghĩa số liệu").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink); Text("Doanh thu: tổng tiền hàng sau chiết khấu, chưa gồm phí vận chuyển. Đơn chốt tính theo giờ xác nhận lần đầu (như Pancake); đơn đã giao, đang xử lý, hủy tính theo ngày tạo đơn trong tháng.").font(.system(size: 10)).foregroundStyle(Color.inkSoft) } }.padding(12).background(Color.blue.opacity(0.08), in: .rect(cornerRadius: 12))
                    if let synced = data?.syncedAt { Text("Đồng bộ Pancake lúc \(Fmt.dateTime(synced))").font(.caption).foregroundStyle(Color.inkSoft) }
                } else { SkeletonGrid(tiles: 2); Skeleton(height: 200) }
            }.padding(16)
        }
        .navigationTitle("Báo cáo cuối tháng").navigationBarTitleDisplayMode(.inline).brandNav()
        .sheet(isPresented: $share) { ShareSheet(text: summary()) }
        .refreshable { await load() }
        .task(id: offset) { await load() }
    }
    private func cumulative(_ s: [API.SeriesRow]) -> [(String, Double)] {
        var m: [String: Double] = [:]; for r in s { m[r.bucket, default: 0] += r.closedNet }
        var acc = 0.0; return m.keys.sorted().map { acc += m[$0]!; return (String($0.suffix(2)), acc) }
    }
    private func summary() -> String {
        guard let t = data?.current.total else { return "" }
        let p = data?.compare?.total
        return """
        BÁO CÁO \(month.2.uppercased()) · MEGATECH
        Doanh thu đơn chốt: \(Fmt.money(t.closedNet)) (\(Fmt.delta(t.closedNet, p?.closedNet) ?? "—") so tháng trước)
        Đơn chốt: \(Fmt.int(t.closedOrders)) · Đơn tạo: \(Fmt.int(t.orders))
        Đã giao: \(Fmt.int(t.groups["delivered"]?.orders ?? 0)) · Hoàn: \(Fmt.int(t.groups["returned"]?.orders ?? 0)) · Hủy: \(Fmt.int(t.groups["cancelled"]?.orders ?? 0))
        Giá trị TB đơn: \(Fmt.money(t.averageOrder ?? 0))
        \((data?.current.byPos ?? []).sorted { $0.closedNet > $1.closedNet }.map { "- \(PosBreakdown.names[$0.posId] ?? $0.posId): \(Fmt.money($0.closedNet)) · \(Fmt.int($0.closedOrders)) đơn" }.joined(separator: "\n"))
        """
    }
    @MainActor private func load() async { do { data = try await API.overview(start: month.0, end: month.1, groupBy: "day"); error = nil } catch { self.error = error.localizedDescription } }
}

struct SmallStat: View {
    let icon: String; let tint: Color; let label: String; let value: String; let pct: Double?
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: icon).font(.system(size: 12, weight: .semibold)).foregroundStyle(tint).frame(width: 26, height: 26).background(tint.opacity(0.13), in: .rect(cornerRadius: 7))
            Text(label).font(.system(size: 9)).foregroundStyle(Color.inkSoft).lineLimit(1)
            HStack(alignment: .firstTextBaseline, spacing: 3) { Text(value).font(.system(size: 15, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).rolling(value); if let pct { Text("(\(Fmt.pct0(pct)))").font(.system(size: 9)).foregroundStyle(Color.inkSoft) } }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(10).background(Color.card, in: .rect(cornerRadius: 12)).cardShadow()
    }
}

/// Hai đường lũy kế: tháng trước (nhạt) và tháng này (đậm).
struct DualLine: View {
    let a: [(String, Double)]; let b: [(String, Double)]
    @State private var shown = false
    var body: some View {
        let maxV = max(1, (a.map(\.1) + b.map(\.1)).max() ?? 1)
        VStack(spacing: 4) {
            GeometryReader { g in
                let w = g.size.width - 30, h = g.size.height - 8
                let n = max(1, max(a.count, b.count) - 1)
                let pts: ([(String, Double)]) -> [CGPoint] = { s in
                    s.enumerated().map { (i: Int, p: (String, Double)) -> CGPoint in
                        let x: CGFloat = 30 + w * CGFloat(i) / CGFloat(n)
                        let y: CGFloat = 4 + h * CGFloat(1 - p.1 / maxV)
                        return CGPoint(x: x, y: y)
                    }
                }
                ZStack(alignment: .topLeading) {
                    ForEach(0..<5, id: \.self) { i in
                        let y = 4 + h * CGFloat(i) / 4
                        Path { p in p.move(to: CGPoint(x: 30, y: y)); p.addLine(to: CGPoint(x: 30 + w, y: y)) }.stroke(Color.black.opacity(0.05), lineWidth: 1)
                        Text(Fmt.short(maxV * Double(4 - i) / 4)).font(.system(size: 7)).foregroundStyle(Color.inkSoft).position(x: 14, y: y)
                    }
                    let pa = pts(a), pb = pts(b)
                    if pa.count > 1 { Path { p in p.move(to: pa[0]); for q in pa.dropFirst() { p.addLine(to: q) } }.trim(from: 0, to: shown ? 1 : 0).stroke(Color.good.opacity(0.35), style: StrokeStyle(lineWidth: 2, lineCap: .round)) }
                    if pb.count > 1 {
                        Path { p in p.move(to: CGPoint(x: pb[0].x, y: h + 4)); for q in pb { p.addLine(to: q) }; p.addLine(to: CGPoint(x: pb.last!.x, y: h + 4)); p.closeSubpath() }.fill(LinearGradient(colors: [Color.good.opacity(0.2), .clear], startPoint: .top, endPoint: .bottom)).opacity(shown ? 1 : 0)
                        Path { p in p.move(to: pb[0]); for q in pb.dropFirst() { p.addLine(to: q) } }.trim(from: 0, to: shown ? 1 : 0).stroke(Color.good, style: StrokeStyle(lineWidth: 2.4, lineCap: .round))
                        if let last = pb.last, let v = b.last?.1 {
                            Circle().fill(Color.good).frame(width: 7, height: 7).position(last).opacity(shown ? 1 : 0)
                            Text(Fmt.vnd(v)).font(.system(size: 9, weight: .bold)).foregroundStyle(.white).padding(.horizontal, 6).padding(.vertical, 3).background(Color.brandDeep, in: .rect(cornerRadius: 5)).position(x: min(last.x, 30 + w - 40), y: max(10, last.y - 16)).opacity(shown ? 1 : 0)
                        }
                    }
                }
            }.frame(height: 150)
            HStack { ForEach(Array(b.enumerated()), id: \.offset) { i, p in if b.count <= 8 || i % max(1, b.count / 6) == 0 { Text(p.0).font(.system(size: 8)).foregroundStyle(Color.inkSoft).frame(maxWidth: .infinity) } } }.padding(.leading, 30)
        }
        .onAppear { withAnimation(.easeOut(duration: 0.9)) { shown = true } }
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let text: String
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: [text], applicationActivities: nil) }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

// MARK: Báo cáo tùy chỉnh (ảnh 5.3)

enum SeriesMetric: String, CaseIterable, Identifiable { case closedNet = "Doanh thu", closedOrders = "Số đơn hàng", orders = "Đơn tạo", delivered = "Giao thành công"; var id: String { rawValue }
    func value(_ r: API.SeriesRow) -> Double { switch self { case .closedNet: return r.closedNet; case .closedOrders: return r.closedOrders; case .orders: return r.orders; case .delivered: return r.groups["delivered"]?.orders ?? 0 } }
    func total(_ t: API.Metrics) -> Double { switch self { case .closedNet: return t.closedNet; case .closedOrders: return t.closedOrders; case .orders: return t.orders; case .delivered: return t.groups["delivered"]?.orders ?? 0 } }
}

struct CustomReportView: View {
    @State private var metrics: [SeriesMetric] = [.closedNet, .closedOrders]
    @State private var groupBy = "day"
    @State private var dim = "time"
    @State private var chart = "bar"
    @State private var period: Period = .month
    @State private var pos: String? = nil
    @State private var data: API.Overview?
    @State private var names: [String: String] = [:]
    @State private var saved = false
    private var main: SeriesMetric { metrics.first ?? .closedNet }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PageTitle(title: "Báo cáo tùy chỉnh", subtitle: "Tự chọn chỉ số, cách nhóm và kiểu hiển thị", trailing: AnyView(Button { metrics = [.closedNet, .closedOrders]; groupBy = "day"; dim = "time"; chart = "bar"; period = .month; pos = nil } label: { HStack(spacing: 4) { Image(systemName: "arrow.counterclockwise"); Text("Đặt lại") }.font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink) }))
                Panel {
                    StepTitle(n: 1, text: "Chọn chỉ số (Tối đa 3 chỉ số)")
                    FlowChips {
                        ForEach(metrics) { m in Button { metrics.removeAll { $0 == m } } label: { HStack(spacing: 4) { Text(m.rawValue); Image(systemName: "xmark").font(.system(size: 8, weight: .bold)) }.font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.good).padding(.horizontal, 10).padding(.vertical, 6).background(Color.brandSoft, in: .capsule) }.buttonStyle(.plain) }
                        if metrics.count < 3 { Menu { ForEach(SeriesMetric.allCases.filter { !metrics.contains($0) }) { m in Button(m.rawValue) { metrics.append(m) } } } label: { HStack(spacing: 4) { Image(systemName: "plus"); Text("Thêm chỉ số") }.font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink).padding(.horizontal, 10).padding(.vertical, 6).overlay(Capsule().stroke(Color.black.opacity(0.15))) } }
                    }
                }
                Panel {
                    StepTitle(n: 2, text: "Chọn nhóm phân tích")
                    FlowChips {
                        FilterChip(label: "Thời gian", on: dim == "time") { dim = "time" }
                        FilterChip(label: "Điểm bán (POS)", on: dim == "pos") { dim = "pos" }
                        FilterChip(label: "Nhân viên", on: dim == "staff") { dim = "staff" }
                        FilterChip(label: "Trạng thái đơn", on: dim == "status") { dim = "status" }
                    }
                    if dim == "time" { Segmented(selection: $groupBy, options: [("day", "Ngày"), ("week", "Tuần"), ("month", "Tháng")]) }
                    HStack(spacing: 8) {
                        PeriodMenu(period: $period, options: [.week, .month, .last, .d90])
                        Menu { Button("Tất cả POS") { pos = nil }; ForEach(PosBreakdown.order, id: \.self) { id in Button(PosBreakdown.names[id] ?? id) { pos = id } } } label: { SelectBox(text: pos.map { PosBreakdown.short[$0] ?? $0 } ?? "Tất cả POS", icon: "storefront") }
                    }
                }
                Panel {
                    StepTitle(n: 3, text: "Chọn kiểu hiển thị")
                    HStack(spacing: 8) {
                        ChartTypeTile(icon: "chart.bar.fill", label: "Biểu đồ cột", on: chart == "bar") { chart = "bar" }
                        ChartTypeTile(icon: "chart.xyaxis.line", label: "Biểu đồ đường", on: chart == "line") { chart = "line" }
                        ChartTypeTile(icon: "chart.pie.fill", label: "Biểu đồ tròn", on: chart == "pie") { chart = "pie" }
                        ChartTypeTile(icon: "tablecells.fill", label: "Bảng tổng hợp", on: chart == "table") { chart = "table" }
                    }
                }
                HStack { Text("Xem trước báo cáo").font(.system(size: 14, weight: .bold)); Spacer(); Menu { ForEach(metrics) { m in Button(m.rawValue) { metrics.removeAll { $0 == m }; metrics.insert(m, at: 0) } } } label: { SelectBox(text: "\(main.rawValue) theo \(dimLabel)").frame(width: 190) } }
                if let d = data {
                    let pts = points(d)
                    Panel {
                        if chart == "table" || pts.isEmpty {
                            ForEach(Array(pts.enumerated()), id: \.offset) { _, p in HStack { Text(p.0).font(.system(size: 12)).foregroundStyle(Color.ink).lineLimit(1); Spacer(); Text(fmt(p.1)).font(.system(size: 12, weight: .bold)).monospacedDigit() }.padding(.vertical, 5); Divider() }
                            if pts.isEmpty { Text("Chưa có dữ liệu trong kỳ.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) }
                        } else if chart == "line" { LineChart(points: pts.map { (String($0.0.prefix(6)), $0.1) }, tint: .good) }
                        else if chart == "pie" { PieChart(points: pts) }
                        else { BarChart(points: pts, money: main == .closedNet) { label in route(for: label) } }
                        HStack { HStack(spacing: 4) { RoundedRectangle(cornerRadius: 2).fill(Color.good).frame(width: 10, height: 10); Text(main.rawValue).font(.system(size: 9)).foregroundStyle(Color.inkSoft) }; Spacer(); Hint(text: "Tổng \(fmt(main.total(d.current.total)))") }
                    }
                } else { Skeleton(height: 220) }
                PrimaryButton(title: saved ? "Đã lưu báo cáo tùy chỉnh" : "Lưu báo cáo tùy chỉnh", icon: saved ? "checkmark" : "bookmark.fill") {
                    UserDefaults.standard.set(["metrics": metrics.map(\.rawValue), "groupBy": groupBy, "dim": dim, "chart": chart, "period": period.key, "pos": pos ?? ""], forKey: "thp_custom_report"); withAnimation { saved = true }
                }
                HStack(alignment: .top, spacing: 8) { Image(systemName: "lightbulb.fill").foregroundStyle(Color.warn); Text("Báo cáo tùy chỉnh sẽ được lưu trên máy này và mở lại đúng bộ lọc lần sau. Chạm một cột để xem đơn cấu thành.").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }.padding(12).background(Color.warn.opacity(0.1), in: .rect(cornerRadius: 12))
            }.padding(16)
        }
        .navigationTitle("Báo cáo tùy chỉnh").navigationBarTitleDisplayMode(.inline).brandNav()
        .onAppear { restore() }
        .task(id: "\(period.key)|\(groupBy)|\(pos ?? "")|\(dim)") { await load() }
    }
    private var dimLabel: String { dim == "time" ? (groupBy == "day" ? "ngày" : groupBy == "week" ? "tuần" : "tháng") : dim == "pos" ? "POS" : dim == "staff" ? "nhân viên" : "trạng thái" }
    private func fmt(_ v: Double) -> String { main == .closedNet ? Fmt.short(v) : Fmt.int(v) }
    private func points(_ d: API.Overview) -> [(String, Double)] {
        switch dim {
        case "pos": return d.current.byPos.map { (PosBreakdown.short[$0.posId] ?? $0.posId, main == .closedNet ? $0.closedNet : main == .closedOrders ? $0.closedOrders : $0.orders) }.sorted { $0.1 > $1.1 }
        case "staff": return (d.current.byEmployee ?? []).filter { !$0.sellerId.isEmpty }.map { ($0.name ?? "NV", main == .closedNet ? $0.closedNet : main == .closedOrders ? $0.closedOrders : $0.orders) }.sorted { $0.1 > $1.1 }.prefix(10).map { $0 }
        case "status": return StatusStrip.items.map { ($0.1, main == .closedNet ? (d.current.total.groups[$0.0]?.net ?? 0) : (d.current.total.groups[$0.0]?.orders ?? 0)) }
        default:
            var m: [String: Double] = [:]; for r in d.current.series ?? [] { m[r.bucket, default: 0] += main.value(r) }
            return m.keys.sorted().map { (groupBy == "month" ? "T" + String($0.suffix(2)) : String($0.suffix(5)), m[$0]!) }
        }
    }
    private func route(for label: String) -> Route? {
        guard dim == "time", let d = data else { return nil }
        var m: [String: Double] = [:]; for r in d.current.series ?? [] { m[r.bucket, default: 0] += 1 }
        guard let b = m.keys.sorted().first(where: { (groupBy == "month" ? "T" + String($0.suffix(2)) : String($0.suffix(5))) == label }) else { return nil }
        let start = groupBy == "month" ? b + "-01" : b
        let end = groupBy == "day" ? b : groupBy == "week" ? VNDate.string(VNDate.add(6, to: VNDate.date(b) ?? .now)) : VNDate.monthEnd(b)
        return .orders(OrderQuery(start: start, end: end, posIds: pos.map { [$0] } ?? [], group: main == .delivered ? "delivered" : main == .orders ? "" : "closed", basis: main == .orders || main == .delivered ? "created" : "confirmed", title: main.rawValue))
    }
    private func restore() {
        guard let s = UserDefaults.standard.dictionary(forKey: "thp_custom_report") else { return }
        if let ms = s["metrics"] as? [String] { metrics = ms.compactMap(SeriesMetric.init(rawValue:)) }
        groupBy = s["groupBy"] as? String ?? groupBy; dim = s["dim"] as? String ?? dim; chart = s["chart"] as? String ?? chart
        if let p = s["period"] as? String, let pp = Period(key: p) { period = pp }
        if let p = s["pos"] as? String, !p.isEmpty { pos = p }
        saved = true
    }
    @MainActor private func load() async { data = try? await API.overview(start: period.range.0, end: period.range.1, posIds: pos.map { [$0] } ?? [], groupBy: groupBy, compare: "none") }
}

struct StepTitle: View { let n: Int; let text: String; var body: some View { HStack(spacing: 8) { Text("\(n)").font(.system(size: 10, weight: .bold)).foregroundStyle(.white).frame(width: 18, height: 18).background(Color.brandDeep, in: .circle); Text(text).font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink) } } }
struct ChartTypeTile: View {
    let icon: String; let label: String; let on: Bool; let tap: () -> Void
    var body: some View { Button(action: tap) { VStack(spacing: 4) { Image(systemName: icon).font(.system(size: 16, weight: .semibold)); Text(label).font(.system(size: 8, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.7) }.foregroundStyle(on ? .white : Color.ink).frame(maxWidth: .infinity).padding(.vertical, 10).background(on ? Color.brandDeep : Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(on ? .clear : Color.black.opacity(0.12))) }.buttonStyle(.plain) }
}
/// Xếp chip xuống dòng.
struct FlowChips<Content: View>: View { @ViewBuilder let content: Content; var body: some View { ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 8) { content } } } }

struct BarChart: View {
    let points: [(String, Double)]; var money = false; var route: (String) -> Route? = { _ in nil }
    var body: some View {
        let maxV = max(1, points.map(\.1).max() ?? 1)
        VStack(spacing: 4) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .bottom, spacing: 6) {
                    ForEach(Array(points.enumerated()), id: \.offset) { _, p in
                        let bar = VStack(spacing: 3) {
                            Text(money ? Fmt.short(p.1) : Fmt.int(p.1)).font(.system(size: 8, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                            GrowBar(height: max(3, 120 * p.1 / maxV), color: .good).frame(width: max(18, 300 / CGFloat(max(1, min(points.count, 14)))))
                            Text(p.0).font(.system(size: 8)).foregroundStyle(Color.inkSoft).lineLimit(1).frame(width: 40)
                        }.frame(height: 160, alignment: .bottom)
                        if let r = route(p.0) { NavigationLink(value: r) { bar }.buttonStyle(.plain) } else { bar }
                    }
                }
            }
        }
    }
}
struct PieChart: View {
    let points: [(String, Double)]
    static let colors: [Color] = [.good, .blue, .warn, .purple, .teal, .bad, .gray]
    var body: some View {
        let total = max(1, points.reduce(0) { $0 + $1.1 })
        HStack(spacing: 16) {
            ZStack {
                ForEach(Array(points.prefix(7).enumerated()), id: \.offset) { i, p in
                    let start = points.prefix(i).reduce(0) { $0 + $1.1 } / total
                    Circle().trim(from: start, to: start + p.1 / total).stroke(Self.colors[i % Self.colors.count], lineWidth: 22).rotationEffect(.degrees(-90))
                }
            }.frame(width: 120, height: 120)
            VStack(alignment: .leading, spacing: 5) { ForEach(Array(points.prefix(7).enumerated()), id: \.offset) { i, p in HStack(spacing: 6) { Circle().fill(Self.colors[i % Self.colors.count]).frame(width: 8, height: 8); Text(p.0).font(.system(size: 10)).lineLimit(1); Spacer(); Text(Fmt.pct0(p.1 / total * 100)).font(.system(size: 10, weight: .bold)) } } }
        }.padding(.vertical, 8)
    }
}

// MARK: Nhật ký hoạt động (ảnh 7.2)

struct AuditView: View {
    @State private var data: API.Audit?
    @State private var items: [API.AuditItem] = []
    @State private var q = ""
    @State private var group = ""
    @State private var day: Period = .today
    @State private var error: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PageTitle(title: "Nhật ký hoạt động", subtitle: "Minh bạch – An toàn – Trách nhiệm")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        FilterChip(label: "Tất cả", on: group.isEmpty) { group = "" }
                        ForEach(data?.groups ?? []) { g in FilterChip(label: g.label, on: group == g.id) { group = g.id } }
                    }
                }
                PeriodMenu(period: $day, options: [.today, .yesterday, .week, .month, .d90])
                HStack(spacing: 6) { Image(systemName: "magnifyingglass").font(.system(size: 11)).foregroundStyle(Color.inkSoft); TextField("Tìm theo nội dung, người dùng…", text: $q).font(.system(size: 12)).onSubmit { Task { await load(next: false) } } }.padding(.horizontal, 10).padding(.vertical, 9).background(Color.card, in: .rect(cornerRadius: 9)).overlay(RoundedRectangle(cornerRadius: 9).stroke(Color.black.opacity(0.1)))
                if let error, items.isEmpty { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
                Panel(padding: 12) {
                    if items.isEmpty { Text(data == nil ? "Đang tải…" : "Không có sự kiện.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) }
                    ForEach(Array(items.enumerated()), id: \.element.id) { i, a in
                        HStack(alignment: .top, spacing: 10) {
                            VStack(spacing: 0) {
                                Image(systemName: icon(a.action)).font(.system(size: 11, weight: .bold)).foregroundStyle(.white).frame(width: 26, height: 26).background(tint(a.action, a.status), in: .circle)
                                if i < items.count - 1 { Rectangle().fill(Color.black.opacity(0.08)).frame(width: 2).frame(maxHeight: .infinity) }
                            }
                            Text(String(Fmt.dateTime(a.at).prefix(5))).font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink).frame(width: 40, alignment: .leading).padding(.top, 5)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(a.name ?? a.email ?? "Hệ thống").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink)
                                Text(data?.labels?[a.action] ?? a.action).font(.system(size: 11)).foregroundStyle(Color.ink)
                                Text([a.detail, a.target].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")).font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(2)
                                Text("\(a.ip.map { "IP: \($0)" } ?? "")\(a.device.map { " · \($0)" } ?? "") · \(Fmt.day(a.at))").font(.system(size: 9)).foregroundStyle(Color.inkSoft).lineLimit(1)
                                if let s = a.status, s >= 400 { Tag(text: "Lỗi \(s)", tone: .red) }
                            }.padding(.top, 4)
                            Spacer(); Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.inkSoft).padding(.top, 8)
                        }.padding(.bottom, 10)
                    }
                    if let d = data, Double(items.count) < d.total { Button { Task { await load(next: true) } } label: { Text("Tải thêm").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand).frame(maxWidth: .infinity) } }
                }
                if let d = data { Text("\(Fmt.int(d.total)) sự kiện").font(.caption).foregroundStyle(Color.inkSoft) }
            }.padding(16)
        }
        .navigationTitle("Nhật ký hoạt động").navigationBarTitleDisplayMode(.inline).brandNav()
        .task(id: "\(group)|\(day.key)") { await load(next: false) }
    }
    private func icon(_ a: String) -> String { a.hasPrefix("login") ? "arrow.right.square.fill" : a == "logout" ? "arrow.left.square.fill" : a == "export" ? "doc.fill" : a.hasPrefix("password") || a.hasPrefix("totp") || a.hasPrefix("passkey") || a.hasPrefix("device") ? "lock.fill" : a == "view" ? "eye.fill" : "pencil" }
    private func tint(_ a: String, _ s: Int?) -> Color { if let s, s >= 400 { return .bad }; return a.hasPrefix("login") ? .good : a == "logout" ? .inkSoft : a == "export" ? .blue : a.hasPrefix("password") || a.hasPrefix("totp") || a.hasPrefix("passkey") || a.hasPrefix("device") ? .purple : a == "view" ? .gray : .warn }
    @MainActor private func load(next: Bool) async {
        do { let r = try await API.audit(q: q, page: next ? (data?.page ?? 0) + 1 : 1, group: group, from: day.range.0, to: day.range.1); items = next ? items + r.items : r.items; data = r; error = nil } catch { self.error = error.localizedDescription }
    }
}

// MARK: Cấu hình & kết nối (ảnh 6.3)

struct ConfigView: View {
    @Environment(AuthModel.self) private var auth
    @Environment(SyncStatus.self) private var sync
    @State private var config: API.Config?
    @State private var busy: Set<String> = []
    @State private var toast: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PageTitle(title: "Cấu hình & kết nối", subtitle: "Kết nối ổn định. Làm chủ hệ thống.", trailing: AnyView(Tag(text: auth.me?.role == "owner" ? "Chỉ dành cho Admin" : "Chỉ xem", tone: .green, dot: true)))
                if let toast { Text(toast).font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.good).padding(10).background(Color.brandSoft, in: .rect(cornerRadius: 10)) }
                SectionHead(title: "Kết nối hệ thống POS", action: "Quản lý kết nối", route: .site(WebPage(id: "config", title: "Cấu hình & kết nối", icon: "gearshape.2.fill", path: "/?view=config")))
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                    ForEach(PosBreakdown.order, id: \.self) { id in
                        let p = sync.pos.first { $0.posId == id }
                        let err = p?.lastError != nil, slow = p.map { sync.age($0) > 15 } ?? true
                        VStack(alignment: .leading, spacing: 5) {
                            Image(systemName: "storefront.fill").font(.system(size: 12, weight: .semibold)).foregroundStyle(err ? Color.bad : Color.good).frame(width: 26, height: 26).background((err ? Color.bad : Color.good).opacity(0.13), in: .rect(cornerRadius: 7))
                            Text(PosBreakdown.short[id] ?? id).font(.system(size: 11, weight: .bold)).foregroundStyle(Color.ink).lineLimit(1)
                            HStack(spacing: 4) { Circle().fill(err ? Color.bad : slow ? Color.warn : Color.good).frame(width: 6, height: 6); Text(err ? "Gián đoạn" : slow ? "Chậm" : "Hoạt động").font(.system(size: 9, weight: .semibold)).foregroundStyle(err ? Color.bad : slow ? Color.warn : Color.good) }
                            Text(p.map { "Đồng bộ: \(sync.age($0) < 60 ? "\(sync.age($0)) phút" : sync.age($0) < 1440 ? "\(sync.age($0) / 60) giờ" : "\(sync.age($0) / 1440) ngày") trước" } ?? "Chưa có").font(.system(size: 8)).foregroundStyle(Color.inkSoft).lineLimit(1)
                            if auth.me?.role == "owner" { Button { Task { await syncNow(id) } } label: { if busy.contains(id) { ProgressView().controlSize(.mini) } else { Text("Đồng bộ ngay").font(.system(size: 8, weight: .bold)).foregroundStyle(Color.brand) } }.buttonStyle(.plain).disabled(busy.contains(id)) }
                        }.frame(maxWidth: .infinity, alignment: .leading).padding(10).background(err ? Color.bad.opacity(0.06) : Color.card, in: .rect(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(err ? Color.bad.opacity(0.3) : Color.clear)).cardShadow()
                    }
                }
                Panel(padding: 12) {
                    HStack(spacing: 10) {
                        Image(systemName: "clock.fill").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.good).frame(width: 34, height: 34).background(Color.brandSoft, in: .rect(cornerRadius: 9))
                        VStack(alignment: .leading, spacing: 2) { Text("Lịch đồng bộ dữ liệu").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink); Text("Tự động mỗi 5 phút").font(.system(size: 11)).foregroundStyle(Color.inkSoft); Text("Lần đồng bộ gần nhất: \(sync.pos.compactMap(\.lastSyncAt).max().map { Fmt.dateTime($0) } ?? "—")").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                        Spacer()
                        NavigationLink(value: Route.site(WebPage(id: "config", title: "Cấu hình", icon: "gearshape", path: "/?view=config"))) { Text("Cấu hình").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink).padding(.horizontal, 12).padding(.vertical, 7).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.black.opacity(0.15))) }.buttonStyle(.plain)
                    }
                }
                HStack(alignment: .top, spacing: 10) {
                    NavigationLink(value: Route.site(WebPage(id: "config", title: "Phân công theo team", icon: "person.2", path: "/?view=config"))) {
                        Panel(padding: 12) { HStack(spacing: 6) { Image(systemName: "person.2.fill").foregroundStyle(Color.good); Text("Phân công theo team").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink) }; Text("Đội Sale, CSKH, Marketing và marketer phụ trách từng nhân viên.").font(.system(size: 10)).foregroundStyle(Color.inkSoft); Text("Mở thiết lập ›").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.brand).padding(.top, 4) }
                    }.buttonStyle(.plain)
                    NavigationLink(value: Route.site(WebPage(id: "config", title: "Thiết lập quyền truy cập", icon: "lock", path: "/?view=config"))) {
                        Panel(padding: 12) { HStack(spacing: 6) { Image(systemName: "checklist").foregroundStyle(Color.good); Text("Thiết lập quyền truy cập").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink) }; VStack(alignment: .leading, spacing: 3) { ForEach(["Xem dữ liệu POS", "Quản lý tuyển dụng", "Cấu hình hệ thống", "Xem báo cáo doanh thu"], id: \.self) { t in HStack(spacing: 5) { Image(systemName: "checkmark.square.fill").font(.system(size: 9)).foregroundStyle(Color.good); Text(t).font(.system(size: 9)).foregroundStyle(Color.inkSoft) } } } }
                    }.buttonStyle(.plain)
                }
                Panel(padding: 12) {
                    HStack(spacing: 10) {
                        Image(systemName: "paperplane.fill").font(.system(size: 14, weight: .semibold)).foregroundStyle(.white).frame(width: 34, height: 34).background(Color.blue, in: .circle)
                        VStack(alignment: .leading, spacing: 2) { Text("Kết nối Telegram").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink); HStack(spacing: 4) { Text("Trạng thái:").font(.system(size: 11)).foregroundStyle(Color.inkSoft); Text(config.map { $0.alert.enabled ? "Hoạt động" : "Tắt cảnh báo" } ?? "—").font(.system(size: 11, weight: .bold)).foregroundStyle(config?.alert.enabled == true ? Color.good : Color.warn) }; Text("Nhận cảnh báo tỷ lệ chốt, lỗi đồng bộ, tuyển dụng, báo cáo nhanh.").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                        Spacer()
                        NavigationLink(value: Route.site(WebPage(id: "config", title: "Telegram", icon: "paperplane", path: "/?view=config"))) { Text("Kiểm tra").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink).padding(.horizontal, 12).padding(.vertical, 7).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.black.opacity(0.15))) }.buttonStyle(.plain)
                    }
                }
            }.padding(16)
        }
        .navigationTitle("Cấu hình & kết nối").navigationBarTitleDisplayMode(.inline).brandNav()
        .refreshable { await sync.refresh() }
        .task { await sync.refresh(); config = try? await API.config() }
    }
    @MainActor private func syncNow(_ posId: String) async {
        busy.insert(posId); defer { busy.remove(posId) }
        do { let r = try await API.syncNow(posId: posId); toast = "\(PosBreakdown.names[posId] ?? posId): đã đồng bộ \(Fmt.int(r.records ?? 0)) đơn mới."; await sync.refresh() } catch { toast = error.localizedDescription }
    }
}

// MARK: Sửa mục tiêu KPI

struct TargetEditor: View {
    let employee: API.Employee; let current: API.Target?; let month: String; let done: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var revenue = ""
    @State private var orders = ""
    @State private var saving = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                Section(employee.name) {
                    LabeledContent("Doanh thu (₫)") { TextField("0", text: $revenue).keyboardType(.numberPad).multilineTextAlignment(.trailing) }
                    LabeledContent("Đơn chốt") { TextField("0", text: $orders).keyboardType(.numberPad).multilineTextAlignment(.trailing) }
                }
                if let error { Text(error).foregroundStyle(Color.bad).font(.caption) }
            }
            .navigationTitle("Mục tiêu tháng \(month.suffix(2))").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(saving ? "Đang lưu…" : "Lưu") { Task { await save() } }.disabled(saving) }
            }
            .onAppear { revenue = current.map { Fmt.int($0.revenue).filter(\.isNumber) } ?? ""; orders = current.map { Fmt.int($0.closedOrders) } ?? "" }
        }
        .presentationDetents([.medium])
    }
    @MainActor private func save() async {
        saving = true; defer { saving = false }
        do {
            try await API.saveTargets(month: month, only: ["employee:\(employee.id)"], items: [["scope": "employee", "refId": employee.id, "revenue": Double(revenue.filter(\.isNumber)) ?? 0, "closedOrders": Double(orders.filter(\.isNumber)) ?? 0]])
            done(); dismiss()
        } catch { self.error = error.localizedDescription }
    }
}
