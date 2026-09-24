import SwiftUI

/// Điều hành trong ca: số nhận, chốt nóng theo SĐT, so cùng ca hôm qua, bảng nhân viên, xác nhận mới nhất, cảnh báo.
struct ShiftView: View {
    var extra: AnyView? = nil
    static let shifts: [(String, String)] = [("auto", "Ca hiện tại"), ("morning", "Sáng"), ("afternoon", "Chiều"), ("evening", "Tối"), ("personal", "Ca cá nhân")]
    @State private var shift = "auto"
    @State private var date = Date.now
    @State private var data: API.Shift?
    @State private var error: String?
    @State private var loading = false
    @State private var path: [Route] = []

    private func staffQuery(_ s: API.ShiftStaff, closed: Bool) -> OrderQuery {
        OrderQuery(start: VNDate.string(date), end: VNDate.string(date), posIds: [], group: closed ? "closed" : "", sellerId: s.employeeId, basis: closed ? "confirmed" : "assigned", title: s.name)
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        DatePicker("Ngày", selection: $date, in: ...Date.now, displayedComponents: .date).labelsHidden()
                        Spacer()
                        Picker("Ca", selection: $shift) { ForEach(Self.shifts, id: \.0) { Text($0.1).tag($0.0) } }.pickerStyle(.menu)
                    }
                    if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
                    if let d = data {
                        Text("Khung giờ \(d.hours.start):00 – \(d.hours.end):00 · so với cùng ca hôm qua").font(.caption).foregroundStyle(.secondary)
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                            let day = VNDate.string(date)
                            Button { path.append(.orders(OrderQuery(start: day, end: day, group: "", basis: "assigned", title: "Số đã nhận"))) } label: {
                                KpiTile(title: "Số đã nhận", value: Fmt.int(d.total.received), unit: "số", now: d.total.received, prev: d.yesterday.received, icon: "phone.arrow.down.left", tint: .blue) }
                            Button { path.append(.orders(OrderQuery(start: day, end: day, group: "closed", basis: "confirmed", title: "Số đã chốt"))) } label: {
                                KpiTile(title: "Số đã chốt", value: Fmt.int(d.total.closed), unit: "số", now: d.total.closed, prev: d.yesterday.closed, icon: "bolt.fill", tint: .green) }
                            RateTile(title: "Tỷ lệ chốt nóng", rate: d.total.rate, prevRate: d.yesterday.rate, sub: "\(Fmt.int(d.total.closed)) / \(Fmt.int(d.total.received)) số")
                            Button { path.append(.orders(OrderQuery(start: day, end: day, group: "closed", basis: "confirmed", title: "Đơn chốt trong ngày"))) } label: {
                                KpiTile(title: "Giá trị đơn chốt", value: Fmt.short(d.staff.reduce(0) { $0 + $1.hotValue }), unit: "₫", now: 0, prev: nil, icon: "banknote", tint: .teal) }
                        }
                        .buttonStyle(.plain)
                        Card(title: "Theo giờ") {
                            let maxV = max(1, d.hourly.map(\.received).max() ?? 1)
                            HStack(alignment: .bottom, spacing: 6) {
                                ForEach(d.hourly, id: \.hour) { h in
                                    Button { let day = VNDate.string(date); path.append(.orders(OrderQuery(start: day, end: day, group: "", basis: "assigned", hour: Int(h.hour.prefix(2)), title: "Số nhận \(h.hour)"))) } label: {
                                    VStack(spacing: 3) {
                                        Text(h.received > 0 ? Fmt.int(h.received) : "").font(.system(size: 9)).monospacedDigit().foregroundStyle(.secondary)
                                        ZStack(alignment: .bottom) {
                                            RoundedRectangle(cornerRadius: 3).fill(Color.brand.opacity(0.25)).frame(height: max(3, 90 * h.received / maxV))
                                            RoundedRectangle(cornerRadius: 3).fill(Color.brand).frame(height: max(0, 90 * h.closed / maxV))
                                        }
                                        Text(String(h.hour.prefix(2))).font(.system(size: 10)).monospacedDigit().foregroundStyle(.secondary)
                                    }.frame(maxWidth: .infinity).contentShape(.rect)
                                    }.buttonStyle(.plain)
                                }
                            }.frame(height: 125)
                            HStack(spacing: 12) { Label("Số nhận", systemImage: "square.fill").foregroundStyle(Color.brand.opacity(0.35)); Label("Số chốt", systemImage: "square.fill").foregroundStyle(Color.brand) }.font(.caption2).foregroundStyle(.secondary)
                        }
                        if !d.alerts.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                ForEach(Array(d.alerts.enumerated()), id: \.offset) { _, a in
                                    Button { openAlert(a, in: d) } label: {
                                    HStack(alignment: .top, spacing: 8) {
                                        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(a.level == "high" ? Color.bad : .orange)
                                        VStack(alignment: .leading, spacing: 2) { Text(a.title).font(.subheadline.weight(.semibold)); Text(a.detail).font(.caption).foregroundStyle(.secondary) }
                                    }
                                    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                                    .background((a.level == "high" ? Color.bad : Color.orange).opacity(0.1), in: .rect(cornerRadius: 12))
                                    }.buttonStyle(.plain)
                                }
                            }
                        }
                        Card(title: "Nhân viên trong ca · \(d.staff.count)") {
                            let maxR = max(1, d.staff.map(\.received).max() ?? 1)
                            ForEach(d.staff) { s in
                                Button { path.append(.orders(staffQuery(s, closed: true))) } label: {
                                VStack(alignment: .leading, spacing: 5) {
                                    HStack(alignment: .firstTextBaseline) {
                                        Text(s.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                                        Spacer()
                                        Text(s.assignedHidden == true ? "—" : Fmt.pct(s.rate)).font(.subheadline.weight(.bold)).monospacedDigit().foregroundStyle(rateColor(s.rate))
                                    }
                                    ProgressView(value: s.received / maxR).tint(.brand.opacity(0.7))
                                    HStack(spacing: 10) {
                                        Text("nhận \(s.assignedHidden == true ? "—" : Fmt.int(s.received))")
                                        Text("chốt \(Fmt.int(s.closed))")
                                        Text(Fmt.short(s.hotValue) + " ₫")
                                        if s.pending > 0 { Text("chờ XN \(Fmt.int(s.pending))").foregroundStyle(.orange) }
                                        Spacer()
                                        if let y = s.yesterday { Text("hôm qua \(Fmt.pct(y.rate))").foregroundStyle(.tertiary) }
                                    }.font(.caption).foregroundStyle(.secondary).monospacedDigit()
                                }
                                .padding(.vertical, 6).contentShape(.rect)
                                }.buttonStyle(.plain)
                                Divider()
                            }
                            HStack {
                                Text("Tổng").font(.subheadline.weight(.bold))
                                Spacer()
                                Text("\(Fmt.int(d.total.closed)) / \(Fmt.int(d.total.received)) · \(Fmt.pct(d.total.rate))").font(.subheadline.weight(.bold)).monospacedDigit()
                            }.padding(.top, 4)
                        }
                        Card(title: "Xác nhận mới nhất") {
                            if d.feed.isEmpty { Text("Chưa có đơn nào được xác nhận trong ca.").font(.subheadline).foregroundStyle(.secondary) }
                            ForEach(d.feed) { f in
                                NavigationLink(value: Route.order(f.id)) {
                                HStack(alignment: .top, spacing: 8) {
                                    Circle().fill(Color.good).frame(width: 7, height: 7).padding(.top, 6)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("Đơn #\(f.orderId) · \(Fmt.money(f.net))").font(.subheadline).monospacedDigit()
                                        Text("\(f.closer) · \(f.posName)\(f.customer.map { " · \($0)" } ?? "")").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                    }
                                    Spacer()
                                    Text(String(f.at.dropFirst(11).prefix(5))).font(.caption).monospacedDigit().foregroundStyle(.secondary)
                                    Image(systemName: "chevron.right").font(.caption2.weight(.bold)).foregroundStyle(.quaternary)
                                }
                                .padding(.vertical, 4).contentShape(.rect)
                                }.buttonStyle(.plain)
                            }
                        }
                        if let extra { extra }
                        if let s = d.syncedAt { Text("Đồng bộ Pancake lúc \(s.prefix(16).replacingOccurrences(of: "T", with: " "))").font(.caption).foregroundStyle(.secondary) }
                    } else if loading { ProgressView().frame(maxWidth: .infinity).padding(.top, 60) }
                }
                .padding(16)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Điều hành trong ca")
            .appRoutes()
            .refreshable { await load() }
            .task(id: "\(VNDate.string(date))|\(shift)") { await load() }
        }
    }
    /// Cảnh báo tỷ lệ / quá tải → đơn của nhân viên đó trong ngày; cảnh báo đồng bộ → trang Cấu hình & kết nối.
    private func openAlert(_ a: API.ShiftAlert, in d: API.Shift) {
        let day = VNDate.string(date)
        if let s = d.staff.first(where: { a.detail.hasPrefix($0.name) }) {
            path.append(.orders(OrderQuery(start: day, end: day, group: a.title.contains("quá tải") ? "unconfirmed" : "", sellerId: s.employeeId, basis: "assigned", title: s.name)))
        } else { path.append(.web(WebPage(id: "config", title: "Cấu hình & kết nối", icon: "gearshape.2.fill", path: "/?view=config"))) }
    }
    private func rateColor(_ r: Double?) -> Color { guard let r else { return .secondary }; return r >= 50 ? .good : r >= 35 ? .orange : .bad }
    @MainActor private func load() async {
        loading = true; defer { loading = false }
        do { data = try await API.shift(date: VNDate.string(date), shift: shift); error = nil } catch { self.error = error.localizedDescription }
    }
}

struct RateTile: View {
    let title: String; let rate: Double?; let prevRate: Double?; let sub: String
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "percent").font(.subheadline.weight(.semibold)).foregroundStyle(.purple).frame(width: 30, height: 30).background(Color.purple.opacity(0.14), in: .rect(cornerRadius: 8))
            Text(title.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(.secondary).lineLimit(1)
            Text(Fmt.pct(rate)).font(.system(.title2, design: .rounded).weight(.bold)).monospacedDigit()
            if let rate, let prevRate {
                let d = rate - prevRate
                Label(String(format: "%.1f điểm", abs(d)).replacingOccurrences(of: ".", with: ","), systemImage: d >= 0 ? "arrow.up.right" : "arrow.down.right").font(.caption.weight(.semibold)).foregroundStyle(d >= 0 ? Color.good : Color.bad)
            } else { Text(sub).font(.caption).foregroundStyle(.tertiary) }
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16))
    }
}

struct Card<Content: View>: View {
    let title: String; @ViewBuilder let content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 8) { Text(title).font(.headline); content }
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16))
    }
}
