import SwiftUI

/// Tổng quan POS: chạm một thẻ số → bảng giải thích cách tính (kèm đối chiếu) → danh sách đơn cấu thành → hồ sơ đơn.
/// Bộ lọc kỳ và POS được mang theo khi đi sâu.
struct DashboardView: View {
    enum Preset: String, CaseIterable, Identifiable { case today = "Hôm nay", yesterday = "Hôm qua", week = "7 ngày", month = "Tháng này"; var id: String { rawValue } }
    @State private var preset: Preset = .today
    @State private var pos: String? = nil
    @State private var data: API.Overview?
    @State private var loading = false
    @State private var error: String?
    @State private var explain: MetricExplain?
    @State private var path: [Route] = []
    @State private var sync: [API.SyncPos] = []
    @State private var badge: API.CskhBadge?
    @Environment(AuthModel.self) private var auth

    private var range: (String, String) {
        let today = VNDate.string(.now)
        switch preset {
        case .today: return (today, today)
        case .yesterday: let y = VNDate.string(VNDate.add(-1)); return (y, y)
        case .week: return (VNDate.string(VNDate.add(-6)), today)
        case .month: return (VNDate.monthStart(), today)
        }
    }
    private var posIds: [String] { pos.map { [$0] } ?? [] }
    private var periodLabel: String {
        let r = range
        return (r.0 == r.1 ? Fmt.day(r.0) : "\(Fmt.day(r.0)) – \(Fmt.day(r.1))") + " · " + (pos.map { PosBreakdown.names[$0] ?? $0 } ?? "Tất cả POS")
    }
    private func query(group: String, basis: String, title: String) -> OrderQuery {
        OrderQuery(start: range.0, end: range.1, posIds: posIds, group: group, basis: basis, title: title)
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if !sync.isEmpty { SystemStatus(sync: sync) { path.append(.web(WebPage(id: "config", title: "Cấu hình & kết nối", icon: "gearshape.2.fill", path: "/?view=config"))) } }
                    if let t = data?.current.total {
                        let unconfirmed = t.groups["new"]?.orders ?? 0
                        if unconfirmed > 0 || (badge?.over20 ?? 0) > 0 || (auth.me?.canView("care") == true && (badge?.callsToday ?? 0) >= 0) {
                            Card(title: "Cần xử lý") {
                                if unconfirmed > 0 {
                                    NavigationLink(value: Route.orders(query(group: "unconfirmed", basis: "created", title: "Chờ xác nhận"))) {
                                        ActionRow(icon: "clock.badge.exclamationmark", tint: .orange, title: "\(Fmt.int(unconfirmed)) đơn chờ xác nhận", sub: "Đơn tạo trong kỳ còn Mới / Chờ xác nhận")
                                    }.buttonStyle(.plain)
                                }
                                if let b = badge, auth.me?.canView("care") == true {
                                    NavigationLink(value: Route.web(CSKH_PAGES[1])) {
                                        ActionRow(icon: "person.crop.circle.badge.exclamationmark", tint: b.over20 > 0 ? .bad : .good, title: "\(Fmt.int(b.over20)) khách quá 20 ngày chưa ghi chú", sub: "CSKH hôm nay đã ghi \(Fmt.int(b.callsToday)) cuộc gọi")
                                    }.buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    Text("Tổng quan POS").font(.headline)
                    Picker("Kỳ", selection: $preset) { ForEach(Preset.allCases) { Text($0.rawValue).tag($0) } }
                        .pickerStyle(.segmented)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            Chip(label: "Tất cả POS", on: pos == nil) { pos = nil }
                            ForEach(PosBreakdown.order, id: \.self) { id in Chip(label: PosBreakdown.names[id] ?? id, on: pos == id) { pos = pos == id ? nil : id } }
                        }
                    }
                    if let error, data == nil {
                        Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline)
                    }
                    if let t = data?.current.total {
                        let p = data?.compare?.total
                        let rec = reconcile(t, data?.current.reconcile)
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                            Button { explain = MetricExplain(title: "Doanh thu đơn chốt", value: Fmt.money(t.closedNet), definition: "Tổng doanh thu (sau giảm giá và quà) của các đơn đã xác nhận trở đi, xếp theo ngày xác nhận lần đầu. Trùng ô \"Tổng cộng · Doanh thu\" trên Pancake.", period: periodLabel, previous: prev("Kỳ trước", p?.closedNet, Fmt.money), reconcile: rec, count: Int(t.closedOrders), query: query(group: "closed", basis: "confirmed", title: "Đơn chốt")) } label: {
                                KpiTile(title: "Doanh thu đơn chốt", value: Fmt.short(t.closedNet), unit: "₫", now: t.closedNet, prev: p?.closedNet, icon: "banknote", tint: .teal) }
                            Button { explain = MetricExplain(title: "Đơn chốt", value: Fmt.int(t.closedOrders), definition: "Số đơn đã xác nhận trở đi (đã XN, đóng gói, chờ chuyển, đang giao, đã nhận, đã thu tiền, kể cả hoàn), xếp theo ngày xác nhận lần đầu. Mới, chờ xác nhận, hủy, xóa không tính.", period: periodLabel, previous: prev("Kỳ trước", p?.closedOrders, Fmt.int), reconcile: rec, count: Int(t.closedOrders), query: query(group: "closed", basis: "confirmed", title: "Đơn chốt")) } label: {
                                KpiTile(title: "Đơn chốt", value: Fmt.int(t.closedOrders), unit: nil, now: t.closedOrders, prev: p?.closedOrders, icon: "checkmark.seal", tint: .green) }
                            Button { explain = MetricExplain(title: "Đơn tạo mới", value: Fmt.int(t.orders), definition: "Số đơn được tạo trong kỳ (theo ngày tạo), không tính đơn đã xóa.", period: periodLabel, previous: prev("Kỳ trước", p?.orders, Fmt.int), count: Int(t.orders), query: query(group: "", basis: "created", title: "Đơn tạo mới")) } label: {
                                KpiTile(title: "Đơn tạo mới", value: Fmt.int(t.orders), unit: nil, now: t.orders, prev: p?.orders, icon: "cart", tint: .blue) }
                            Button { explain = MetricExplain(title: "Giá trị TB đơn", value: Fmt.money(t.averageOrder ?? 0), definition: "Doanh thu đơn chốt ÷ số đơn chốt.\n\(Fmt.money(t.closedNet)) ÷ \(Fmt.int(t.closedOrders)) đơn.", period: periodLabel, previous: prev("Kỳ trước", p?.averageOrder, Fmt.money), count: Int(t.closedOrders), query: query(group: "closed", basis: "confirmed", title: "Đơn chốt")) } label: {
                                KpiTile(title: "Giá trị TB đơn", value: Fmt.short(t.averageOrder ?? 0), unit: "₫", now: t.averageOrder ?? 0, prev: p?.averageOrder, icon: "equal.circle", tint: .gray) }
                            let dl = t.groups["delivered"]?.orders ?? 0
                            Button { explain = MetricExplain(title: "Giao thành công", value: Fmt.int(dl), definition: "Đơn tạo trong kỳ hiện đang ở trạng thái Đã nhận hoặc Đã thu tiền. Doanh thu nhóm này: \(Fmt.money(t.groups["delivered"]?.net ?? 0)).", period: periodLabel, previous: prev("Kỳ trước", p?.groups["delivered"]?.orders, Fmt.int), count: Int(dl), query: query(group: "delivered", basis: "created", title: "Giao thành công")) } label: {
                                KpiTile(title: "Giao thành công", value: Fmt.int(dl), unit: nil, now: dl, prev: p?.groups["delivered"]?.orders, icon: "shippingbox", tint: .mint) }
                            Button { explain = MetricExplain(title: "Giảm giá / quà", value: Fmt.money(t.closedDiscount), definition: "Doanh số − doanh thu của các đơn chốt: gồm giảm giá, voucher và quà tặng.\n\(Fmt.money(t.closedGross ?? 0)) − \(Fmt.money(t.closedNet)).", period: periodLabel, previous: prev("Kỳ trước", p?.closedDiscount, Fmt.money), reconcile: rec, count: Int(t.closedOrders), query: query(group: "closed", basis: "confirmed", title: "Đơn chốt")) } label: {
                                KpiTile(title: "Giảm giá / quà", value: Fmt.short(t.closedDiscount), unit: "₫", now: t.closedDiscount, prev: p?.closedDiscount, icon: "gift", tint: .orange) }
                        }
                        .buttonStyle(.plain)
                        if let rec { ReconcileLine(state: rec).reveal() }
                        StatusStrip(groups: t.groups, total: t.orders) { key, title in path.append(.orders(query(group: key, basis: "created", title: title))) }
                        if pos == nil { PosBreakdown(rows: data?.current.byPos ?? [], total: t.closedNet) { pos = $0 } }
                    } else if loading {
                        SkeletonGrid(tiles: 6)
                    }
                    if let synced = data?.syncedAt { Text("Đồng bộ Pancake lúc \(Fmt.dateTime(synced))").font(.caption).foregroundStyle(.secondary) }
                }
                .padding(16)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Trang chủ")
            .appRoutes()
            .task { await loadCenter() }
            .refreshable { await load() }
            .task(id: "\(preset.rawValue)|\(pos ?? "")") { await load() }
            .sheet(item: $explain) { m in ExplainSheet(m: m) { path.append(.orders($0)) } }
        }
    }

    private func prev(_ label: String, _ v: Double?, _ f: (Double) -> String) -> (String, String)? { v.map { (label, f($0)) } }
    /// Hai đường tính độc lập: bảng số liệu theo ngày và đếm thẳng từ đơn gốc. Lệch thì báo vàng.
    private func reconcile(_ t: API.Metrics, _ r: API.Reconcile?) -> (ok: Bool, text: String)? {
        guard let r else { return nil }
        let orderDiff = Int(t.closedOrders - r.orders), netDiff = t.closedNet - r.net
        let gross = t.closedGross ?? r.gross
        let money = abs(gross - t.closedDiscount - t.closedNet) < 1000
        if orderDiff == 0 && abs(netDiff) < 1000 && money { return (true, "Khớp với đơn gốc: \(Fmt.int(r.orders)) đơn · \(Fmt.money(r.net)). Doanh số \(Fmt.short(gross)) − giảm giá \(Fmt.short(t.closedDiscount)) = doanh thu.") }
        return (false, "Lệch: bảng số liệu \(Fmt.int(t.closedOrders)) đơn / \(Fmt.money(t.closedNet)); đơn gốc \(Fmt.int(r.orders)) đơn / \(Fmt.money(r.net)). Kéo để làm mới; nếu vẫn lệch, báo để dựng lại số liệu.")
    }

    @MainActor private func loadCenter() async {
        async let s = API.syncStatus(); async let b = API.cskhBadge()
        sync = (try? await s) ?? []; badge = try? await b
    }
    @MainActor private func load() async {
        loading = true; defer { loading = false }
        do { data = try await API.overview(start: range.0, end: range.1, posIds: posIds); error = nil }
        catch {
            self.error = error.localizedDescription
            if (error as? API.APIError)?.message.contains("đăng nhập") == true { await auth.logout() }
        }
    }
}

struct Chip: View {
    let label: String; let on: Bool; let tap: () -> Void
    var body: some View {
        Button(action: tap) {
            Text(label).font(.caption.weight(.semibold)).padding(.horizontal, 12).padding(.vertical, 7)
                .background(on ? Color.brand : Color(.secondarySystemGroupedBackground), in: .capsule)
                .foregroundStyle(on ? .white : .primary)
                .animation(.snappy(duration: 0.25), value: on)
        }.buttonStyle(.plain)
    }
}

struct ReconcileLine: View {
    let state: (ok: Bool, text: String)
    var body: some View {
        Label(state.text, systemImage: state.ok ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
            .font(.caption).foregroundStyle(state.ok ? Color.good : .orange)
            .padding(10).frame(maxWidth: .infinity, alignment: .leading)
            .background((state.ok ? Color.good : Color.orange).opacity(0.08), in: .rect(cornerRadius: 10))
    }
}

/// Trạng thái hiện tại của đơn tạo trong kỳ; chạm một đoạn → danh sách đơn đúng trạng thái.
struct StatusStrip: View {
    let groups: [String: API.Group]; let total: Double; let open: (String, String) -> Void
    static let items: [(String, String, Color)] = [("new", "Mới / chờ XN", .gray), ("confirmed", "Đã xác nhận", .brand), ("shipping", "Đang giao", .blue), ("delivered", "Đã nhận", .good), ("returned", "Hoàn", .orange), ("cancelled", "Hủy", .bad)]
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Trạng thái đơn tạo trong kỳ").font(.headline)
            GeometryReader { g in
                HStack(spacing: 2) {
                    ForEach(Self.items, id: \.0) { k, _, c in
                        let n = groups[k]?.orders ?? 0
                        if n > 0 { RoundedRectangle(cornerRadius: 3).fill(c).frame(width: max(4, g.size.width * n / max(1, total))) }
                    }
                }
            }.frame(height: 10)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(Self.items, id: \.0) { k, title, c in
                    Button { open(k, title) } label: {
                        HStack(spacing: 6) {
                            Circle().fill(c).frame(width: 8, height: 8)
                            Text(title).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            Spacer(minLength: 0)
                            Text(Fmt.int(groups[k]?.orders ?? 0)).font(.caption.weight(.semibold)).monospacedDigit()
                        }
                    }.buttonStyle(.plain)
                }
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16))
    }
}

struct KpiTile: View {
    let title: String; let value: String; let unit: String?; let now: Double; let prev: Double?; let icon: String; let tint: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon).font(.subheadline.weight(.semibold)).foregroundStyle(tint).symbolEffect(.bounce, value: value)
                    .frame(width: 30, height: 30).background(tint.opacity(0.14), in: .rect(cornerRadius: 8))
                Spacer()
                Image(systemName: "chevron.right").font(.caption2.weight(.bold)).foregroundStyle(.quaternary)
            }
            Text(title.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(.secondary).lineLimit(1)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value).font(.system(.title2, design: .rounded).weight(.bold)).monospacedDigit().minimumScaleFactor(0.6).lineLimit(1).rolling(value)
                if let unit { Text(unit).font(.caption).foregroundStyle(.secondary) }
            }
            if let prev, prev > 0 {
                let d = (now - prev) / prev * 100
                Label(Fmt.pct(abs(d)), systemImage: d >= 0 ? "arrow.up.right" : "arrow.down.right")
                    .font(.caption.weight(.semibold)).foregroundStyle(d >= 0 ? Color.good : Color.bad)
            } else { Text("—").font(.caption).foregroundStyle(.tertiary) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16))
        .contentShape(.rect)
    }
}

struct PosBreakdown: View {
    let rows: [API.PosRow]; let total: Double; var pick: (String) -> Void = { _ in }
    static let names = ["sieu-vo-gao": "Siêu Vô Gạo", "mgt-apex": "MGT - APEX", "thuy-san": "Thủy sản Megatech", "bio-nano": "BIO NANO", "megaroot": "MEGAROOT", "oxytetra": "Oxytetra - Megatech"]
    static let order = ["sieu-vo-gao", "mgt-apex", "thuy-san", "bio-nano", "megaroot", "oxytetra"]
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack { Text("Theo POS").font(.headline); Spacer(); Text("chạm để chỉ xem POS đó").font(.caption2).foregroundStyle(.tertiary) }
            ForEach(rows.sorted { $0.closedNet > $1.closedNet }, id: \.posId) { r in
                Button { pick(r.posId) } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(Self.names[r.posId] ?? r.posId).font(.subheadline.weight(.medium))
                            Spacer()
                            Text(Fmt.short(r.closedNet) + " ₫").font(.subheadline.weight(.semibold)).monospacedDigit()
                            Image(systemName: "chevron.right").font(.caption2.weight(.bold)).foregroundStyle(.quaternary)
                        }
                        Bar(value: total > 0 ? r.closedNet / total : 0)
                        Text("\(Fmt.int(r.closedOrders)) đơn chốt · \(Fmt.int(r.orders)) đơn tạo").font(.caption).foregroundStyle(.secondary)
                    }.contentShape(.rect)
                }.buttonStyle(.plain)
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16))
    }
}


/// Tình trạng 6 POS: xanh = vừa đồng bộ, vàng = quá 15 phút, đỏ = lỗi. Chạm → Cấu hình & kết nối.
struct SystemStatus: View {
    let sync: [API.SyncPos]; let open: () -> Void
    private func state(_ p: API.SyncPos) -> (Color, String) {
        if p.lastError != nil || p.status == "error" { return (.bad, "Lỗi đồng bộ") }
        guard let t = p.lastSyncAt, let d = Fmt.parseISO(t) else { return (.gray, "Chưa đồng bộ") }
        let m = Int(Date.now.timeIntervalSince(d) / 60)
        let ago = m >= 1440 ? "\(m / 1440) ngày trước" : m >= 60 ? "\(m / 60) giờ trước" : m <= 1 ? "vừa xong" : "\(m) phút trước"
        return m > 15 ? (.orange, ago) : (.good, ago)
    }
    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 10) {
                HStack { Text("Hệ thống").font(.headline); Spacer(); Text("Cấu hình & kết nối").font(.caption).foregroundStyle(Color.brand); RowChevron() }
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    ForEach(sync) { p in
                        let st = state(p)
                        HStack(spacing: 6) {
                            Circle().fill(st.0).frame(width: 8, height: 8)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(PosBreakdown.names[p.posId] ?? p.posId).font(.caption.weight(.semibold)).lineLimit(1)
                                Text(st.1).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                            }
                            Spacer(minLength: 0)
                        }.padding(8).background(Color(.tertiarySystemGroupedBackground), in: .rect(cornerRadius: 8))
                    }
                }
            }.padding(14).frame(maxWidth: .infinity, alignment: .leading).background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16)).contentShape(.rect)
        }.buttonStyle(.plain)
    }
}

struct ActionRow: View {
    let icon: String; let tint: Color; let title: String; let sub: String
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundStyle(tint).frame(width: 28)
            VStack(alignment: .leading, spacing: 2) { Text(title).font(.subheadline.weight(.semibold)); Text(sub).font(.caption).foregroundStyle(.secondary) }
            Spacer(); RowChevron()
        }.padding(.vertical, 6).contentShape(.rect)
    }
}
