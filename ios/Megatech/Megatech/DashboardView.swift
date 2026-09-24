import SwiftUI

struct DashboardView: View {
    enum Preset: String, CaseIterable, Identifiable { case today = "Hôm nay", yesterday = "Hôm qua", week = "7 ngày", month = "Tháng này"; var id: String { rawValue } }
    @State private var preset: Preset = .today
    @State private var data: API.Overview?
    @State private var loading = false
    @State private var error: String?
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

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Picker("Kỳ", selection: $preset) { ForEach(Preset.allCases) { Text($0.rawValue).tag($0) } }
                        .pickerStyle(.segmented)

                    if let error, data == nil {
                        Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline)
                    }
                    if let t = data?.current.total {
                        let p = data?.compare?.total
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                            KpiTile(title: "Doanh thu đơn chốt", value: Fmt.short(t.closedNet), unit: "₫", now: t.closedNet, prev: p?.closedNet, icon: "banknote", tint: .teal)
                            KpiTile(title: "Đơn chốt", value: Fmt.int(t.closedOrders), unit: nil, now: t.closedOrders, prev: p?.closedOrders, icon: "checkmark.seal", tint: .green)
                            KpiTile(title: "Đơn tạo mới", value: Fmt.int(t.orders), unit: nil, now: t.orders, prev: p?.orders, icon: "cart", tint: .blue)
                            KpiTile(title: "Giá trị TB đơn", value: Fmt.short(t.averageOrder ?? 0), unit: "₫", now: t.averageOrder ?? 0, prev: p?.averageOrder, icon: "equal.circle", tint: .gray)
                            KpiTile(title: "Giao thành công", value: Fmt.int(t.groups["delivered"]?.orders ?? 0), unit: nil, now: t.groups["delivered"]?.orders ?? 0, prev: p?.groups["delivered"]?.orders, icon: "shippingbox", tint: .mint)
                            KpiTile(title: "Giảm giá / quà", value: Fmt.short(t.closedDiscount), unit: "₫", now: t.closedDiscount, prev: p?.closedDiscount, icon: "gift", tint: .orange)
                        }
                        PosBreakdown(rows: data?.current.byPos ?? [], total: t.closedNet)
                    } else if loading {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                    }
                    if let synced = data?.syncedAt { Text("Đồng bộ Pancake lúc \(synced.prefix(16).replacingOccurrences(of: "T", with: " "))").font(.caption).foregroundStyle(.secondary) }
                }
                .padding(16)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Tổng quan")
            .refreshable { await load() }
            .task(id: preset) { await load() }
        }
    }

    @MainActor private func load() async {
        loading = true; defer { loading = false }
        do { data = try await API.overview(start: range.0, end: range.1); error = nil }
        catch {
            self.error = error.localizedDescription
            if (error as? API.APIError)?.message.contains("đăng nhập") == true { await auth.logout() }
        }
    }
}

struct KpiTile: View {
    let title: String; let value: String; let unit: String?; let now: Double; let prev: Double?; let icon: String; let tint: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon).font(.subheadline.weight(.semibold)).foregroundStyle(tint)
                .frame(width: 30, height: 30).background(tint.opacity(0.14), in: .rect(cornerRadius: 8))
            Text(title.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(.secondary).lineLimit(1)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value).font(.system(.title2, design: .rounded).weight(.bold)).monospacedDigit().minimumScaleFactor(0.6).lineLimit(1)
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
    }
}

struct PosBreakdown: View {
    let rows: [API.PosRow]; let total: Double
    static let names = ["sieu-vo-gao": "Siêu Vô Gạo", "mgt-apex": "MGT - APEX", "thuy-san": "Thủy sản Megatech", "bio-nano": "BIO NANO", "megaroot": "MEGAROOT", "oxytetra": "Oxytetra - Megatech"]
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Theo POS").font(.headline)
            ForEach(rows.sorted { $0.closedNet > $1.closedNet }, id: \.posId) { r in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(Self.names[r.posId] ?? r.posId).font(.subheadline.weight(.medium))
                        Spacer()
                        Text(Fmt.short(r.closedNet) + " ₫").font(.subheadline.weight(.semibold)).monospacedDigit()
                    }
                    ProgressView(value: total > 0 ? r.closedNet / total : 0).tint(.brand)
                    Text("\(Fmt.int(r.closedOrders)) đơn chốt · \(Fmt.int(r.orders)) đơn tạo").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16))
    }
}
