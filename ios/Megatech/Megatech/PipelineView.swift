import SwiftUI

/// Vận hành đơn (ảnh 4.3): 5 bậc có mũi tên, tỷ lệ giao thành công, đơn cần lưu ý, tìm và lọc đơn.
struct PipelineView: View {
    var embedded = false
    @State private var period: Period = .month
    @State private var basis = "confirmed"
    @State private var data: API.Pipeline?
    @State private var error: String?
    @State private var pos = ""
    @State private var status = ""
    @State private var q = ""
    @State private var recent: [API.OrderRow] = []
    static let stages: [(key: String, group: String, label: String, icon: String, color: Color)] = [
        ("unconfirmed", "unconfirmed", "Mới", "ic_m_orders", .good), ("processing", "processing", "Xác nhận", "ic_m_closed", .warn), ("shipping", "shipping", "Giao vận", "ic_m_shipping", .blue), ("delivered", "delivered", "Đã giao", "checkmark.circle.fill", .good), ("returned", "returned", "Trả hàng", "ic_m_returned", .bad),
    ]
    private func q(_ group: String, _ title: String, posIds: [String] = []) -> OrderQuery { OrderQuery(start: period.range.0, end: period.range.1, posIds: posIds, group: group, basis: basis == "confirmed" ? "confirmed" : "created", title: title) }
    private func n(_ b: [String: API.Bucket], _ k: String) -> Double { b[k]?.orders ?? 0 }

    var body: some View {
        Embed(embedded: embedded, title: "Vận hành đơn") {
            PageTitle(title: "Vận hành đơn", subtitle: "Theo dõi từng bước, giao đúng hẹn.", trailing: AnyView(PeriodMenu(period: $period)))
            Segmented(selection: $basis, options: [("confirmed", "Theo giờ chốt"), ("created", "Theo ngày tạo")])
            if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
            if let d = data {
                let T = d.total
                let unconfirmed = basis == "created" ? n(T, "unconfirmed") : 0
                HStack(spacing: 4) {
                    ForEach(Array(Self.stages.enumerated()), id: \.element.key) { i, st in
                        NavigationLink(value: Route.orders(q(st.group, st.label))) {
                            VStack(spacing: 4) {
                                MetricIcon(st.icon, size: 13).foregroundStyle(st.color).frame(width: 28, height: 28).background(st.color.opacity(0.14), in: .rect(cornerRadius: 8))
                                Text(st.label).font(.system(size: 9, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1).minimumScaleFactor(0.7)
                                Text(Fmt.int(st.key == "unconfirmed" ? unconfirmed : n(T, st.key))).font(.system(size: 15, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).rolling(Fmt.int(n(T, st.key)))
                            }.frame(maxWidth: .infinity).padding(.vertical, 10).background(st.color.opacity(0.08), in: .rect(cornerRadius: 10))
                        }.buttonStyle(.plain)
                        if i < Self.stages.count - 1 { Image(systemName: "arrow.right").font(.system(size: 8, weight: .bold)).foregroundStyle(Color.inkSoft) }
                    }
                }
                let shipped = n(T, "shipped")
                HStack(spacing: 10) {
                    NavigationLink(value: Route.orders(q("delivered", "Đã giao"))) { KpiCard(icon: "checkmark.seal.fill", tint: .good, label: "Tỷ lệ giao thành công", value: Fmt.pct(shipped > 0 ? n(T, "delivered") / shipped * 100 : nil), note: "\(Fmt.int(n(T, "delivered"))) / \(Fmt.int(shipped)) đã xuất") }
                    NavigationLink(value: Route.orders(q("closed", "Đơn chốt"))) { KpiCard(icon: "ic_m_closed", tint: .good, label: "Tổng đơn chốt", value: Fmt.int(n(T, "closed")), note: Fmt.short(T["closed"]?.net ?? 0) + " ₫") }
                }.buttonStyle(.plain)
                Panel(padding: 12) {
                    HStack { Image(systemName: "exclamationmark.circle.fill").foregroundStyle(Color.bad); Text("Đơn cần lưu ý").font(.system(size: 14, weight: .bold)).foregroundStyle(Color.bad); Spacer(); NavigationLink(value: Route.orders(q("processing", "Chưa xuất kho"))) { HStack(spacing: 2) { Text("Xem tất cả"); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }.font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.brand) }.buttonStyle(.plain) }
                    AttentionRow(icon: "clock.badge.exclamationmark.fill", tone: .red, title: "Chờ chuyển hàng (đã đóng, chưa giao)", n: n(T, "waiting"), route: .orders(q("waiting", "Chờ chuyển hàng")))
                    AttentionRow(icon: "hourglass", tone: .orange, title: "Đã xác nhận, chưa đóng hàng", n: n(T, "confirmed"), route: .orders(q("justconfirmed", "Đã xác nhận")))
                    AttentionRow(icon: "ic_m_returned", tone: .orange, title: "Hoàn / trả hàng", n: n(T, "returned"), route: .orders(q("returned", "Hoàn")))
                    AttentionRow(icon: "ic_m_cancelled", tone: .red, title: "Hủy sau khi chốt", n: n(T, "cancelled"), route: .orders(q("cancelled", "Hủy sau chốt")))
                }.overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.bad.opacity(0.2)))
                HStack(spacing: 8) {
                    HStack(spacing: 8) { Image(systemName: "magnifyingglass").foregroundStyle(Color.inkSoft); TextField("Tìm mã đơn, SĐT khách hàng…", text: $q).font(.system(size: 13)).onSubmit { Task { await loadRecent() } } }
                        .padding(.horizontal, 12).padding(.vertical, 10).background(Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.08)))
                    NavigationLink(value: Route.orders(q(status, "Đơn hàng", posIds: pos.isEmpty ? [] : [pos]))) { Image(systemName: "line.3.horizontal.decrease").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.ink).frame(width: 40, height: 40).background(Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.08))) }.buttonStyle(.plain)
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        Menu { Button("Tất cả POS") { pos = "" }; ForEach(PosBreakdown.order, id: \.self) { id in Button(PosBreakdown.names[id] ?? id) { pos = id } } } label: { FilterChip(label: pos.isEmpty ? "Tất cả POS" : (PosBreakdown.short[pos] ?? pos), on: true, chevron: true) {} }
                        FilterChip(label: "Mới", on: status == "unconfirmed") { status = status == "unconfirmed" ? "" : "unconfirmed" }
                        FilterChip(label: "Xác nhận", on: status == "processing") { status = status == "processing" ? "" : "processing" }
                        FilterChip(label: "Giao vận", on: status == "shipping") { status = status == "shipping" ? "" : "shipping" }
                        FilterChip(label: "Đã giao", on: status == "delivered") { status = status == "delivered" ? "" : "delivered" }
                    }
                }
                SectionHead(title: "Danh sách đơn hàng", action: "Mới nhất", route: .orders(q(status, "Đơn hàng", posIds: pos.isEmpty ? [] : [pos])))
                VStack(spacing: 10) {
                    ForEach(recent.prefix(8)) { o in
                        NavigationLink(value: Route.order(o.id)) {
                            Panel(padding: 12) {
                                HStack { Text("#\(o.orderId)").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink); Spacer(); Tag(text: o.statusName, tone: tone(o.statusCode)) }
                                HStack(spacing: 4) { PosLabel(id: o.posId, name: o.posName).font(.system(size: 10)).foregroundStyle(Color.inkSoft); Text("· \(o.customer ?? "") · \(o.phone ?? "")").font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1); Spacer(); Text(Fmt.time(o.firstConfirmedAt ?? o.createdAt)).font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                                HStack { Text(o.sellerName ?? "—").font(.system(size: 10)).foregroundStyle(Color.inkSoft); Spacer(); Text(Fmt.vnd(o.net ?? 0)).font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink) }
                            }
                        }.buttonStyle(.plain)
                    }
                    if recent.isEmpty { Panel { Text("Không có đơn khớp bộ lọc.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) } }
                }
            } else if error == nil { Skeleton(height: 90); SkeletonGrid(tiles: 2) }
        }
        .task(id: "\(period.key)|\(basis)") { await load() }
        .task(id: "\(period.key)|\(basis)|\(pos)|\(status)") { await loadRecent() }
    }
    private func tone(_ c: Int?) -> Tone { switch c ?? -1 { case 3, 16: return .green; case 2: return .blue; case 4, 5, 15: return .orange; case 6, 7: return .red; case 0, 17: return .gray; default: return .orange } }
    @MainActor private func load() async { do { data = try await API.pipeline(start: period.range.0, end: period.range.1, basis: basis); error = nil } catch { self.error = error.localizedDescription } }
    @MainActor private func loadRecent() async { var qq = q(status, "Đơn", posIds: pos.isEmpty ? [] : [pos]); qq.q = q; recent = (try? await API.orders(qq, page: 1))?.orders ?? [] }
}

struct AttentionRow: View {
    let icon: String; let tone: Tone; let title: String; let n: Double; let route: Route
    var body: some View {
        NavigationLink(value: route) {
            HStack(spacing: 8) { MetricIcon(icon, size: 12).foregroundStyle(tone.color).frame(width: 22); Text(title).font(.system(size: 12)).foregroundStyle(Color.ink).lineLimit(1); Spacer(); Text("\(Fmt.int(n)) đơn").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)).foregroundStyle(Color.inkSoft) }.padding(.vertical, 6).contentShape(.rect)
        }.buttonStyle(.plain)
    }
}
