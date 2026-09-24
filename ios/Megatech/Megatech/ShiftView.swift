import SwiftUI

/// Điều hành trong ca (ảnh 3): tiến độ ca, hiệu suất nhân viên, cảnh báo, diễn biến theo giờ.
struct ShiftView: View {
    static let shifts: [(String, String)] = [("auto", "Ca hiện tại"), ("morning", "Ca sáng"), ("afternoon", "Ca chiều"), ("evening", "Ca tối"), ("day", "Cả ngày"), ("personal", "Ca cá nhân")]
    @State private var shift = "auto"
    @State private var date = Date.now
    @State private var data: API.Shift?
    @State private var error: String?
    @State private var showAll = false
    private var day: String { VNDate.string(date) }
    private func staffQuery(_ s: API.ShiftStaff, closed: Bool) -> OrderQuery {
        OrderQuery(start: day, end: day, posIds: [], group: closed ? "closed" : "", sellerId: s.employeeId, basis: closed ? "confirmed" : "assigned", title: s.name)
    }
    private var progress: (Double, String) {
        guard let d = data, d.isToday else { return (1, "Đã kết thúc") }
        var cal = Calendar(identifier: .gregorian); cal.timeZone = VNDate.tz
        let h = Double(cal.component(.hour, from: .now)) + Double(cal.component(.minute, from: .now)) / 60
        let s = Double(d.hours.start), e = Double(d.hours.end)
        if h < s { return (0, "Bắt đầu lúc \(d.hours.start):00") }
        if h >= e { return (1, "Đã kết thúc") }
        let left = e - h
        return ((h - s) / (e - s), "Còn khoảng \(Int(left)) giờ \(Int((left - Double(Int(left))) * 60)) phút")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            PageTitle(title: "Điều hành trong ca", subtitle: "Bám sát hoạt động, tối ưu hiệu suất", trailing: AnyView(
                Menu { ForEach(Self.shifts, id: \.0) { k, l in Button(l) { shift = k } }; Divider(); Button("Hôm nay") { date = .now }; Button("Hôm qua") { date = VNDate.add(-1) } } label: { DatePill(text: (Self.shifts.first { $0.0 == shift }?.1 ?? shift) + " · " + Fmt.day(day)) }))
            if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
            if let d = data {
                // Tiến độ ca
                Panel {
                    HStack(spacing: 14) {
                        Ring(value: progress.0, size: 70, line: 8, tint: .good)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack { Text("Tiến độ ca làm").font(.system(size: 14, weight: .bold)).foregroundStyle(Color.ink); Spacer(); Tag(text: d.isToday && progress.0 < 1 && progress.0 > 0 ? "Đang diễn ra" : progress.0 >= 1 ? "Đã xong" : "Chưa bắt đầu", tone: .green, dot: true) }
                            Text("\(Self.shifts.first { $0.0 == d.shift }?.1 ?? d.shift) (\(String(format: "%02d", d.hours.start)):00 - \(String(format: "%02d", d.hours.end)):00)").font(.system(size: 12)).foregroundStyle(Color.inkSoft)
                            Text(progress.1).font(.system(size: 12)).foregroundStyle(Color.inkSoft)
                        }
                    }
                }
                // 4 số của ca
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    NavigationLink(value: Route.orders(OrderQuery(start: day, end: day, group: "", basis: "assigned", title: "Số đã nhận"))) { KpiCard(icon: "phone.arrow.down.left.fill", tint: .blue, label: "Số đã nhận", value: Fmt.int(d.total.received), delta: Fmt.delta(d.total.received, d.yesterday.received)) }
                    NavigationLink(value: Route.orders(OrderQuery(start: day, end: day, group: "closed", basis: "confirmed", title: "Số đã chốt"))) { KpiCard(icon: "bolt.fill", tint: .good, label: "Số đã chốt", value: Fmt.int(d.total.closed), delta: Fmt.delta(d.total.closed, d.yesterday.closed)) }
                    KpiCard(icon: "percent", tint: .purple, label: "Tỷ lệ chốt nóng", value: Fmt.pct(d.total.rate), note: "hôm qua \(Fmt.pct(d.yesterday.rate))")
                    NavigationLink(value: Route.orders(OrderQuery(start: day, end: day, group: "closed", basis: "confirmed", title: "Đơn chốt"))) { KpiCard(icon: "banknote.fill", tint: .teal, label: "Giá trị đơn chốt", value: Fmt.short(d.staff.reduce(0) { $0 + $1.hotValue }) + " ₫", note: "so cùng ca hôm qua") }
                }.buttonStyle(.plain)
                // Hiệu suất nhân viên
                SectionHead(title: "Hiệu suất nhân viên", action: showAll ? "Thu gọn" : "Xem tất cả")
                    .onTapGesture { withAnimation { showAll.toggle() } }
                if d.staff.isEmpty { Panel { Text("Chưa có nhân viên nhận số trong ca.").font(.system(size: 13)).foregroundStyle(Color.inkSoft) } }
                VStack(spacing: 0) {
                    let maxR = max(1, d.staff.map(\.received).max() ?? 1)
                    ForEach(Array((showAll ? d.staff : Array(d.staff.prefix(5))).enumerated()), id: \.element.id) { i, s in
                        NavigationLink(value: Route.orders(staffQuery(s, closed: true))) {
                            HStack(spacing: 10) {
                                Avatar(name: s.name, size: 38)
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack(alignment: .firstTextBaseline) {
                                        Text(s.name).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                                        Spacer()
                                        Text("\(Fmt.int(s.closed)) đơn").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink).monospacedDigit()
                                    }
                                    Text("\(s.department ?? "Tư vấn bán hàng") · \(s.posIds.compactMap { PosBreakdown.short[$0] }.prefix(2).joined(separator: ", "))").font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1)
                                    HStack(spacing: 8) {
                                        Bar(value: s.received / maxR, tint: rateColor(s.rate), height: 5)
                                        Text(s.assignedHidden == true ? "—" : rateLabel(s.rate)).font(.system(size: 10, weight: .semibold)).foregroundStyle(rateColor(s.rate)).frame(width: 74, alignment: .trailing)
                                    }
                                }
                                Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft)
                            }.padding(12).contentShape(.rect)
                        }.buttonStyle(.plain)
                        if i < min(d.staff.count, showAll ? d.staff.count : 5) - 1 { Divider().padding(.leading, 60) }
                    }
                }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                // Cảnh báo
                ForEach(Array(d.alerts.enumerated()), id: \.offset) { _, a in
                    NavigationLink(value: alertRoute(a, in: d)) {
                        HStack(spacing: 12) {
                            Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 15, weight: .bold)).foregroundStyle(.white).frame(width: 34, height: 34).background(a.level == "high" ? Color.bad : Color.warn, in: .circle)
                            VStack(alignment: .leading, spacing: 2) { Text(a.title).font(.system(size: 13, weight: .bold)).foregroundStyle(a.level == "high" ? Color.bad : Color.warn); Text(a.detail).font(.system(size: 11)).foregroundStyle(Color.inkSoft) }
                            Spacer(); Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(a.level == "high" ? Color.bad : Color.warn)
                        }.padding(12).background((a.level == "high" ? Color.bad : Color.warn).opacity(0.08), in: .rect(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke((a.level == "high" ? Color.bad : Color.warn).opacity(0.25)))
                    }.buttonStyle(.plain)
                }
                // Theo giờ
                Panel {
                    HStack { Text("Diễn biến trong ca (theo giờ)").font(.system(size: 15, weight: .bold)); Spacer(); Hint(text: "Số chốt / số nhận") }
                    let maxV = max(1, d.hourly.map(\.received).max() ?? 1)
                    HStack(alignment: .bottom, spacing: 6) {
                        ForEach(d.hourly, id: \.hour) { h in
                            NavigationLink(value: Route.orders(OrderQuery(start: day, end: day, group: "", basis: "assigned", hour: Int(h.hour.prefix(2)), title: "Số nhận \(h.hour)"))) {
                                VStack(spacing: 3) {
                                    ZStack(alignment: .bottom) {
                                        GrowBar(height: max(3, 80 * h.received / maxV), color: Color.good.opacity(0.3))
                                        GrowBar(height: max(0, 80 * h.closed / maxV), color: Color.good)
                                    }.frame(height: 80, alignment: .bottom)
                                    Text(String(Int(h.hour.prefix(2)) ?? 0) + "h").font(.system(size: 9)).monospacedDigit().foregroundStyle(Color.inkSoft)
                                }.frame(maxWidth: .infinity).contentShape(.rect)
                            }.buttonStyle(.plain)
                        }
                    }
                }
                Panel {
                    HStack { Text("Xác nhận mới nhất").font(.system(size: 15, weight: .bold)); Spacer() }
                    if d.feed.isEmpty { Text("Chưa có đơn nào được xác nhận trong ca.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) }
                    ForEach(d.feed.prefix(8)) { f in
                        NavigationLink(value: Route.order(f.id)) {
                            HStack(spacing: 10) {
                                Circle().fill(Color.good).frame(width: 7, height: 7)
                                VStack(alignment: .leading, spacing: 1) { Text("Đơn #\(f.orderId) · \(Fmt.money(f.net))").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink).monospacedDigit(); Text("\(f.closer) · \(f.posName)\(f.customer.map { " · \($0)" } ?? "")").font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1) }
                                Spacer(); Text(String(f.at.dropFirst(11).prefix(5))).font(.system(size: 11)).monospacedDigit().foregroundStyle(Color.inkSoft)
                            }.padding(.vertical, 4).contentShape(.rect)
                        }.buttonStyle(.plain)
                    }
                }
                if let s = d.syncedAt { Text("Đồng bộ Pancake lúc \(Fmt.dateTime(s))").font(.caption).foregroundStyle(Color.inkSoft) }
            } else { Skeleton(height: 100); SkeletonGrid(tiles: 4) }
        }
        .task(id: "\(day)|\(shift)") { await load() }
    }
    private func rateColor(_ r: Double?) -> Color { guard let r else { return .inkSoft }; return r >= 50 ? .good : r >= 35 ? .warn : .bad }
    private func rateLabel(_ r: Double?) -> String { guard let r else { return "—" }; return r >= 50 ? "Tốt · \(Fmt.pct(r))" : r >= 35 ? "Khá · \(Fmt.pct(r))" : "Cần cải thiện" }
    private func alertRoute(_ a: API.ShiftAlert, in d: API.Shift) -> Route {
        if let s = d.staff.first(where: { a.detail.hasPrefix($0.name) }) { return .orders(OrderQuery(start: day, end: day, group: a.title.contains("quá tải") ? "unconfirmed" : "", sellerId: s.employeeId, basis: "assigned", title: s.name)) }
        return .page("config")
    }
    @MainActor func load() async { do { data = try await API.shift(date: day, shift: shift); error = nil } catch { self.error = error.localizedDescription } }
}

/// Cột biểu đồ mọc từ đáy khi hiện ra.
struct GrowBar: View {
    let height: CGFloat; let color: Color
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        RoundedRectangle(cornerRadius: 3).fill(color).frame(height: shown || reduce ? height : 0)
            .onAppear { withAnimation(.spring(duration: 0.7, bounce: 0.2)) { shown = true } }
            .animation(reduce ? nil : .spring(duration: 0.5), value: height)
    }
}
