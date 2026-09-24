import SwiftUI

/// Tổng quan MKT (ảnh 3.3): chọn đội nhóm, 4 chỉ số, top nhân viên MKT, doanh thu và trạng thái vận chuyển.
struct MarketingView: View {
    @State private var period: Period = .month
    @State private var team = ""
    @State private var sort = "orders"
    @State private var data: API.Marketing?
    @State private var prev: API.Marketing?
    @State private var error: String?
    private var teams: [String] { Array(Set((data?.byMarketer ?? []).map(\.marketingTeamName))).filter { !$0.isEmpty }.sorted() }
    private var rows: [API.Marketer] {
        let r = (data?.byMarketer ?? []).filter { team.isEmpty || $0.marketingTeamName == team }
        return sort == "net" ? r.sorted { $0.net > $1.net } : sort == "rate" ? r.sorted { ($0.confirmationRate ?? -1) > ($1.confirmationRate ?? -1) } : r.sorted { $0.createdOrders > $1.createdOrders }
    }
    private func sum(_ f: (API.Marketer) -> Double) -> Double { rows.reduce(0) { $0 + f($1) } }
    var body: some View {
        PageTitle(title: "Tổng quan MKT", subtitle: "Số về, xác nhận, doanh thu theo marketer", trailing: AnyView(Menu { ForEach([Period.today, .week, .month, .last]) { p in Button(p.rawValue) { period = p } } } label: { DatePill(text: period.rawValue) }))
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Chọn đội nhóm").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                Menu { Button("Tất cả đội nhóm") { team = "" }; ForEach(teams, id: \.self) { t in Button(t) { team = t } } } label: {
                    HStack { Image(systemName: "person.2.fill").font(.system(size: 11)).foregroundStyle(Color.inkSoft); Text(team.isEmpty ? "Tất cả đội nhóm" : team).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1); Spacer(); Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold)).foregroundStyle(Color.inkSoft) }
                        .padding(10).background(Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.08)))
                }.buttonStyle(.plain)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("Xếp theo").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                Menu { Button("Số đơn hàng") { sort = "orders" }; Button("Doanh thu") { sort = "net" }; Button("Tỷ lệ xác nhận") { sort = "rate" } } label: {
                    HStack { Image(systemName: "arrow.up.arrow.down").font(.system(size: 11)).foregroundStyle(Color.inkSoft); Text(sort == "orders" ? "Số đơn hàng" : sort == "net" ? "Doanh thu" : "Tỷ lệ xác nhận").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1); Spacer(); Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold)).foregroundStyle(Color.inkSoft) }
                        .padding(10).background(Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.08)))
                }.buttonStyle(.plain)
            }
        }
        if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
        if data != nil {
            let pr = prev?.byMarketer.filter { team.isEmpty || $0.marketingTeamName == team }
            let ps = { (f: (API.Marketer) -> Double) -> Double? in pr.map { $0.reduce(0) { $0 + f($1) } } }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                KpiCard(icon: "cart.fill", tint: .good, label: "Đơn hàng (số về)", value: Fmt.int(sum(\.createdOrders)), delta: Fmt.delta(sum(\.createdOrders), ps(\.createdOrders)), note: "so với kỳ trước")
                KpiCard(icon: "phone.fill", tint: .good, label: "Số điện thoại", value: Fmt.int(sum(\.createdPhones)), delta: Fmt.delta(sum(\.createdPhones), ps(\.createdPhones)))
                KpiCard(icon: "person.badge.plus", tint: .good, label: "Đơn xác nhận", value: Fmt.int(sum(\.confirmedOrders)), delta: Fmt.delta(sum(\.confirmedOrders), ps(\.confirmedOrders)))
                KpiCard(icon: "cart.badge.plus", tint: .good, label: "Khách có mua (giao TC)", value: Fmt.int(sum(\.deliveredOrders)), delta: Fmt.delta(sum(\.deliveredOrders), ps(\.deliveredOrders)))
            }
            SectionHead(title: "Top nhân viên MKT", action: "\(rows.count) người")
            Text("(theo \(sort == "orders" ? "số đơn hàng" : sort == "net" ? "doanh thu" : "tỷ lệ xác nhận"))").font(.system(size: 10)).foregroundStyle(Color.inkSoft).padding(.top, -10)
            VStack(spacing: 0) {
                let maxV = max(1, rows.map { sort == "net" ? $0.net : sort == "rate" ? ($0.confirmationRate ?? 0) : $0.createdOrders }.max() ?? 1)
                ForEach(Array(rows.prefix(20).enumerated()), id: \.element.id) { i, m in
                    NavigationLink(value: Route.orders(OrderQuery(start: period.range.0, end: period.range.1, basis: "created", q: "", title: m.marketerName))) {
                        HStack(spacing: 10) {
                            Medal(rank: i + 1); Avatar(name: m.marketerName, size: 34)
                            VStack(alignment: .leading, spacing: 3) {
                                HStack { Text(m.marketerName).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1); Spacer(); Text(sort == "net" ? Fmt.short(m.net) + " ₫" : sort == "rate" ? Fmt.pct(m.confirmationRate) : "\(Fmt.int(m.createdOrders)) đơn").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink) }
                                Bar(value: (sort == "net" ? m.net : sort == "rate" ? (m.confirmationRate ?? 0) : m.createdOrders) / maxV, tint: .good, height: 5)
                                Text("\(m.marketingTeamName) · \(Fmt.int(m.createdPhones)) SĐT · XN \(Fmt.pct(m.confirmationRate)) · \(Fmt.short(m.netAfterRefund ?? m.net)) ₫ sau hoàn hủy").font(.system(size: 9)).foregroundStyle(Color.inkSoft).lineLimit(1)
                            }
                        }.padding(10).contentShape(.rect)
                    }.buttonStyle(.plain)
                    if i < min(20, rows.count) - 1 { Divider().padding(.leading, 40) }
                }
            }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
            HStack(alignment: .top, spacing: 10) {
                Panel(padding: 12) {
                    Text("Doanh thu theo nhân viên MKT").font(.system(size: 11)).foregroundStyle(Color.inkSoft)
                    HStack(alignment: .firstTextBaseline) { Text(Fmt.short(sum(\.net))).font(.system(size: 22, weight: .bold, design: .rounded)).foregroundStyle(Color.good).rolling(Fmt.short(sum(\.net))); Image(systemName: "chart.bar.fill").foregroundStyle(Color.good) }
                    Text("Sau hoàn hủy \(Fmt.short(sum { $0.netAfterRefund ?? $0.net })) ₫").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                }
                Panel(padding: 12) {
                    Text("Trạng thái vận chuyển").font(.system(size: 11)).foregroundStyle(Color.inkSoft)
                    HStack(spacing: 6) { Image(systemName: "truck.box").foregroundStyle(Color.inkSoft); Text("\(Fmt.int(sum(\.deliveredOrders))) giao TC").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink) }
                    Text("\(Fmt.int(sum(\.returnedOrders))) hoàn · \(Fmt.int(sum(\.cancelledOrders))) hủy").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                    Text("Tỷ lệ giao \(Fmt.pct(sum(\.confirmedOrders) > 0 ? sum(\.deliveredOrders) / sum(\.confirmedOrders) * 100 : nil))").font(.system(size: 10)).foregroundStyle(Color.good)
                }
            }
        } else if error == nil { SkeletonGrid(tiles: 4); Skeleton(height: 200) }
        Color.clear.frame(height: 0).task(id: period) { await load() }
    }
    @MainActor private func load() async {
        do {
            data = try await API.marketing(start: period.range.0, end: period.range.1)
            prev = try? await API.marketing(start: period.previous.0, end: period.previous.1); error = nil
        } catch { self.error = error.localizedDescription }
    }
}
