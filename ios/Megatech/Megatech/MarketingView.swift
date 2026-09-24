import SwiftUI

/// Marketing: số về, đơn xác nhận, tỷ lệ, doanh thu (kể cả sau hoàn hủy), doanh thu / SĐT theo từng marketer.
struct MarketingView: View {
    enum Preset: String, CaseIterable, Identifiable { case today = "Hôm nay", week = "7 ngày", month = "Tháng này", last = "Tháng trước"; var id: String { rawValue } }
    enum Sort: String, CaseIterable, Identifiable { case net = "Doanh thu", orders = "Số về", rate = "Tỷ lệ XN", perPhone = "DT / SĐT"; var id: String { rawValue } }
    @State private var preset: Preset = .month
    @State private var sort: Sort = .net
    @State private var data: API.Marketing?
    @State private var error: String?
    @State private var loading = false

    private var range: (String, String) {
        let today = VNDate.string(.now)
        switch preset {
        case .today: return (today, today)
        case .week: return (VNDate.string(VNDate.add(-6)), today)
        case .month: return (VNDate.monthStart(), today)
        case .last:
            var c = Calendar(identifier: .gregorian); c.timeZone = VNDate.tz
            let first = c.date(from: c.dateComponents([.year, .month], from: .now))!
            let prev = c.date(byAdding: .month, value: -1, to: first)!
            return (VNDate.string(prev), VNDate.string(c.date(byAdding: .day, value: -1, to: first)!))
        }
    }
    private var rows: [API.Marketer] {
        (data?.byMarketer ?? []).sorted {
            switch sort {
            case .net: return $0.net > $1.net
            case .orders: return $0.createdOrders > $1.createdOrders
            case .rate: return ($0.confirmationRate ?? -1) > ($1.confirmationRate ?? -1)
            case .perPhone: return ($0.revenuePerPhone ?? -1) > ($1.revenuePerPhone ?? -1)
            }
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Picker("Kỳ", selection: $preset) { ForEach(Preset.allCases) { Text($0.rawValue).tag($0) } }.pickerStyle(.segmented)
                    if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
                    if let s = data?.summary {
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                            KpiTile(title: "Số về (đơn tạo)", value: Fmt.int(s.createdOrders), unit: nil, now: 0, prev: nil, icon: "phone.badge.plus", tint: .blue)
                            KpiTile(title: "SĐT khác nhau", value: Fmt.int(s.createdPhones), unit: nil, now: 0, prev: nil, icon: "person.2", tint: .indigo)
                            RateTile(title: "Tỷ lệ xác nhận", rate: s.confirmationRate, prevRate: nil, sub: "\(Fmt.int(s.confirmedOrders)) / \(Fmt.int(s.createdOrders)) đơn")
                            KpiTile(title: "Doanh thu", value: Fmt.short(s.net), unit: "₫", now: 0, prev: nil, icon: "banknote", tint: .teal)
                            KpiTile(title: "Sau hoàn hủy", value: Fmt.short(s.netAfterRefund ?? s.net), unit: "₫", now: 0, prev: nil, icon: "arrow.uturn.backward", tint: .orange)
                            KpiTile(title: "Doanh thu / SĐT", value: Fmt.short(s.revenuePerPhone ?? 0), unit: "₫", now: 0, prev: nil, icon: "target", tint: .green)
                        }
                        Card(title: "Theo marketer · \(rows.count)") {
                            Picker("Xếp", selection: $sort) { ForEach(Sort.allCases) { Text($0.rawValue).tag($0) } }.pickerStyle(.segmented).padding(.bottom, 4)
                            ForEach(Array(rows.enumerated()), id: \.element.id) { i, m in
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                                        Text("\(i + 1)").font(.caption).monospacedDigit().foregroundStyle(.tertiary).frame(width: 18, alignment: .trailing)
                                        VStack(alignment: .leading, spacing: 1) {
                                            Text(m.marketerName).font(.subheadline.weight(.semibold)).lineLimit(1)
                                            Text(m.marketingTeamName).font(.caption2).foregroundStyle(.tertiary)
                                        }
                                        Spacer()
                                        VStack(alignment: .trailing, spacing: 1) {
                                            Text(Fmt.short(m.net) + " ₫").font(.subheadline.weight(.bold)).monospacedDigit()
                                            if let a = m.netAfterRefund, let r = m.refundNet, r > 0 { Text("sau hoàn hủy \(Fmt.short(a))").font(.caption2).foregroundStyle(.secondary).monospacedDigit() }
                                        }
                                    }
                                    HStack(spacing: 10) {
                                        Text("số \(Fmt.int(m.createdOrders))")
                                        Text("XN \(Fmt.int(m.confirmedOrders)) · \(Fmt.pct(m.confirmationRate))")
                                        Text("DT/SĐT \(Fmt.short(m.revenuePerPhone ?? 0))")
                                        Spacer()
                                        if m.returnedOrders + m.cancelledOrders > 0 { Text("hoàn/hủy \(Fmt.int(m.returnedOrders))/\(Fmt.int(m.cancelledOrders))").foregroundStyle(Color.bad) }
                                    }.font(.caption).foregroundStyle(.secondary).monospacedDigit().padding(.leading, 26)
                                }
                                .padding(.vertical, 6)
                                Divider()
                            }
                        }
                    } else if loading { ProgressView().frame(maxWidth: .infinity).padding(.top, 60) }
                }
                .padding(16)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Marketing")
            .refreshable { await load() }
            .task(id: preset) { await load() }
        }
    }
    @MainActor private func load() async {
        loading = true; defer { loading = false }
        do { data = try await API.marketing(start: range.0, end: range.1); error = nil } catch { self.error = error.localizedDescription }
    }
}
