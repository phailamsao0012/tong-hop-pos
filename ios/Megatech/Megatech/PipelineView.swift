import SwiftUI

/// Vận hành đơn: các bậc chốt → chưa xuất kho → đã xuất đi → đã nhận / hoàn / hủy. Chạm một bậc → danh sách đơn đúng trạng thái;
/// chạm nhân viên hoặc POS → danh sách đơn của họ.
struct PipelineView: View {
    enum Preset: String, CaseIterable, Identifiable { case today = "Hôm nay", week = "7 ngày", month = "Tháng này", last = "Tháng trước"; var id: String { rawValue } }
    @State private var preset: Preset = .month
    @State private var basis = "confirmed"
    @State private var data: API.Pipeline?
    @State private var error: String?
    @State private var loading = false

    static let stages: [(key: String, group: String, label: String, color: Color)] = [
        ("closed", "closed", "Đơn chốt", .brand), ("processing", "processing", "Chưa xuất kho", .orange), ("shipped", "shipped", "Đã xuất đi", .blue),
        ("shipping", "shipping", "Đang giao", .teal), ("delivered", "delivered", "Đã nhận", .good), ("returned", "returned", "Hoàn", .orange), ("cancelled", "cancelled", "Hủy sau chốt", .bad),
    ]
    static let processing: [(String, String, String)] = [("confirmed", "justconfirmed", "Đã xác nhận"), ("packing", "packing", "Đang đóng hàng"), ("waiting", "waiting", "Chờ chuyển hàng"), ("other", "other", "Chờ hàng / in")]

    private var range: (String, String) {
        let today = VNDate.string(.now)
        switch preset {
        case .today: return (today, today)
        case .week: return (VNDate.string(VNDate.add(-6)), today)
        case .month: return (VNDate.monthStart(), today)
        case .last: return VNDate.lastMonth()
        }
    }
    private func q(group: String, sellerId: String = "", posIds: [String] = [], title: String) -> OrderQuery {
        OrderQuery(start: range.0, end: range.1, posIds: posIds, group: group, sellerId: sellerId, basis: basis == "confirmed" ? "confirmed" : "created", title: title)
    }
    private func n(_ b: [String: API.Bucket], _ k: String) -> Double { b[k]?.orders ?? 0 }

    var body: some View {
        ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Picker("Kỳ", selection: $preset) { ForEach(Preset.allCases) { Text($0.rawValue).tag($0) } }.pickerStyle(.segmented)
                    Picker("Cơ sở", selection: $basis) { Text("Giờ chốt đơn").tag("confirmed"); Text("Ngày tạo đơn").tag("created") }.pickerStyle(.segmented)
                    if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
                    if let d = data {
                        let T = d.total
                        Card(title: "Dòng chảy đơn") {
                            let maxV = max(1, n(T, "closed"))
                            ForEach(Self.stages, id: \.key) { st in
                                NavigationLink(value: Route.orders(q(group: st.group, title: st.label))) {
                                    VStack(alignment: .leading, spacing: 4) {
                                        HStack {
                                            Text(st.label).font(.subheadline.weight(.medium))
                                            Spacer()
                                            Text(Fmt.int(n(T, st.key))).font(.subheadline.weight(.bold)).monospacedDigit()
                                            Text(Fmt.short(T[st.key]?.net ?? 0) + " ₫").font(.caption).foregroundStyle(.secondary).monospacedDigit()
                                            Image(systemName: "chevron.right").font(.caption2.weight(.bold)).foregroundStyle(.quaternary)
                                        }
                                        ProgressView(value: n(T, st.key) / maxV).tint(st.color)
                                    }.padding(.vertical, 4).contentShape(.rect)
                                }.buttonStyle(.plain)
                            }
                        }
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                            let shipped = n(T, "shipped")
                            RateTile(title: "% thành công", rate: shipped > 0 ? n(T, "delivered") / shipped * 100 : nil, prevRate: nil, sub: "\(Fmt.int(n(T, "delivered"))) / \(Fmt.int(shipped)) đã xuất")
                            RateTile(title: "Tỷ lệ hoàn", rate: shipped > 0 ? n(T, "returned") / shipped * 100 : nil, prevRate: nil, sub: "\(Fmt.int(n(T, "returned"))) / \(Fmt.int(shipped)) đã xuất")
                            RateTile(title: "Chuyển hàng / chốt", rate: n(T, "closed") > 0 ? shipped / n(T, "closed") * 100 : nil, prevRate: nil, sub: "\(Fmt.int(shipped)) / \(Fmt.int(n(T, "closed"))) đơn chốt")
                            RateTile(title: "% đang giao", rate: shipped > 0 ? n(T, "shipping") / shipped * 100 : nil, prevRate: nil, sub: "\(Fmt.int(n(T, "shipping"))) đơn")
                        }
                        Card(title: "Chưa xuất kho · \(Fmt.int(n(T, "processing")))") {
                            ForEach(Self.processing, id: \.0) { key, group, label in
                                NavigationLink(value: Route.orders(q(group: group, title: label))) {
                                    HStack { Text(label).font(.subheadline); Spacer(); Text(Fmt.int(n(T, key))).font(.subheadline.weight(.semibold)).monospacedDigit(); Image(systemName: "chevron.right").font(.caption2.weight(.bold)).foregroundStyle(.quaternary) }.padding(.vertical, 6).contentShape(.rect)
                                }.buttonStyle(.plain)
                                Divider()
                            }
                        }
                        Card(title: "Theo POS") {
                            ForEach(d.byPos) { p in
                                NavigationLink(value: Route.orders(q(group: "closed", posIds: [p.posId], title: p.posName))) {
                                    HStack {
                                        Text(PosBreakdown.names[p.posId] ?? p.posName).font(.subheadline)
                                        Spacer()
                                        Text("\(Fmt.int(n(p.buckets, "closed"))) chốt · \(Fmt.int(n(p.buckets, "delivered"))) nhận · \(Fmt.int(n(p.buckets, "returned"))) hoàn").font(.caption).foregroundStyle(.secondary).monospacedDigit()
                                        Image(systemName: "chevron.right").font(.caption2.weight(.bold)).foregroundStyle(.quaternary)
                                    }.padding(.vertical, 6).contentShape(.rect)
                                }.buttonStyle(.plain)
                                Divider()
                            }
                        }
                        Card(title: "Theo nhân viên · \(d.byEmployee.count)") {
                            ForEach(d.byEmployee.prefix(40)) { e in
                                NavigationLink(value: Route.orders(q(group: "closed", sellerId: e.sellerId, title: e.name))) {
                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack { Text(e.name).font(.subheadline.weight(.medium)).lineLimit(1); Spacer(); Text(Fmt.int(n(e.buckets, "closed"))).font(.subheadline.weight(.bold)).monospacedDigit(); Image(systemName: "chevron.right").font(.caption2.weight(.bold)).foregroundStyle(.quaternary) }
                                        let sh = n(e.buckets, "shipped")
                                        Text("xuất \(Fmt.int(sh)) · nhận \(Fmt.int(n(e.buckets, "delivered"))) · hoàn \(Fmt.int(n(e.buckets, "returned"))) · thành công \(Fmt.pct(sh > 0 ? n(e.buckets, "delivered") / sh * 100 : nil))").font(.caption).foregroundStyle(.secondary).monospacedDigit()
                                    }.padding(.vertical, 5).contentShape(.rect)
                                }.buttonStyle(.plain)
                                Divider()
                            }
                        }
                    } else if loading { ProgressView().frame(maxWidth: .infinity).padding(.top, 60) }
                }.padding(16)
            }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Vận hành đơn")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task(id: "\(preset.rawValue)|\(basis)") { await load() }
    }
    @MainActor private func load() async {
        loading = true; defer { loading = false }
        do { data = try await API.pipeline(start: range.0, end: range.1, basis: basis); error = nil } catch { self.error = error.localizedDescription }
    }
}

extension VNDate {
    static func lastMonth(_ d: Date = .now) -> (String, String) {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = tz
        let start = cal.date(from: cal.dateComponents([.year, .month], from: d))!
        let prev = cal.date(byAdding: .month, value: -1, to: start)!
        return (string(prev), string(start.addingTimeInterval(-1)))
    }
}
