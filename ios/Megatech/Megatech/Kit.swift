import SwiftUI

// Bộ thành phần giao diện theo bộ ảnh thiết kế MEGATECH. Mọi màn dùng chung để đồng bộ.

/// Thanh đầu xanh đậm: MEGATECH + khẩu hiệu, ô trạng thái đồng bộ, chuông.
struct AppHeader: View {
    var tagline = "Bán hàng tốt hơn mỗi ngày"
    @Environment(SyncStatus.self) private var sync
    /// Có khi nằm trong thanh dưới (RootTabs): số đỏ trên chuông = việc cần xử lý.
    @Environment(AlertCenter.self) private var alerts: AlertCenter?
    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text("MEGATECH").font(.system(size: 19, weight: .heavy, design: .rounded)).tracking(0.5).foregroundStyle(.white)
                Text(tagline).font(.system(size: 10)).foregroundStyle(.white.opacity(0.75))
            }
            Spacer()
            // Ô trạng thái đồng bộ chạm được (kế hoạch 1.6): mở Thông báo, cuộn tới khối "Đồng bộ Pancake" (giờ đồng bộ từng POS).
            NavigationLink(value: Route.alertsSync) {
                HStack(spacing: 6) {
                    Circle().fill(sync.tone).frame(width: 7, height: 7)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(sync.title).font(.system(size: 11, weight: .semibold)).foregroundStyle(.white)
                        Text(sync.subtitle).font(.system(size: 9)).foregroundStyle(.white.opacity(0.75))
                    }
                }
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(.white.opacity(0.12), in: .rect(cornerRadius: 10))
                .contentShape(.rect(cornerRadius: 10))
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityHint("Mở Thông báo, phần Đồng bộ Pancake từng POS")
            // Chuông mở trang Thông báo ngay trong tab đang xem.
            NavigationLink(value: Route.alerts) { bell }.accessibilityLabel("Thông báo")
        }
        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 14)
        .background(Color.brandDeep)
        // Mỗi lần mở tab đều hiện thanh đầu: chỉ hỏi lại trạng thái đồng bộ nếu lần hỏi được gần nhất đã quá 60 giây.
        .task { await sync.refresh(maxAge: Freshness.window) }
    }
    private var bell: some View {
        let n = alerts?.count(sync: sync) ?? sync.alertCount
        return MetricIcon("bell.fill", size: 17, weight: .regular).foregroundStyle(.white).frame(width: 34, height: 34)
            .overlay(alignment: .topTrailing) { if n > 0 { Text("\(n)").font(.system(size: 9, weight: .bold)).foregroundStyle(.white).padding(3).background(Color.bad, in: .circle).offset(x: 2, y: 2) } }
    }
}

/// Trạng thái đồng bộ dùng cho thanh đầu và trang chủ.
@Observable final class SyncStatus {
    var pos: [API.SyncPos] = []
    var alertCount = 0
    var tone: Color { pos.isEmpty ? .gray : pos.contains { $0.lastError != nil } ? .bad : maxAge > 15 ? .warn : .lime }
    var title: String { pos.isEmpty ? "Đang kiểm tra" : pos.contains { $0.lastError != nil } ? "Lỗi đồng bộ" : maxAge > 15 ? "Đồng bộ chậm" : "Đồng bộ OK" }
    var subtitle: String { pos.isEmpty ? "…" : maxAge <= 1 ? "Cập nhật vừa xong" : maxAge < 60 ? "\(maxAge) phút trước" : maxAge < 1440 ? "\(maxAge / 60) giờ trước" : "\(maxAge / 1440) ngày trước" }
    var maxAge: Int { pos.compactMap { p in p.lastSyncAt.flatMap(Fmt.parseISO).map { Int(Date.now.timeIntervalSince($0) / 60) } }.max() ?? 99999 }
    func age(_ p: API.SyncPos) -> Int { p.lastSyncAt.flatMap(Fmt.parseISO).map { Int(Date.now.timeIntervalSince($0) / 60) } ?? 99999 }
    /// Lần hỏi được gần nhất và lần hỏi đang chạy (nhiều chỗ cùng hỏi một lúc thì chờ chung một request).
    @ObservationIgnored private var lastAt: Date?
    @ObservationIgnored private var running: Task<Void, Never>?
    /// maxAge: bỏ qua nếu lần hỏi được gần nhất chưa quá chừng này giây (0 = hỏi ngay, như kéo để làm mới).
    @MainActor func refresh(maxAge: TimeInterval = 0) async {
        if let t = lastAt, Date.now.timeIntervalSince(t) < maxAge { return }
        if let running { await running.value; return }
        let task = Task { @MainActor in
            guard let s = try? await API.syncStatus() else { return }
            self.pos = s
            self.alertCount = s.filter { $0.lastError != nil || self.age($0) > 15 }.count
            self.lastAt = .now
        }
        running = task
        await task.value
        running = nil
    }
}

/// Tiêu đề trang + phụ đề + nhãn bên phải (ví dụ ngày, "Dữ liệu minh họa").
struct PageTitle: View {
    let title: String; var subtitle: String? = nil; var icon: String? = nil
    var trailing: AnyView? = nil
    var body: some View {
        HStack(alignment: .top) {
            HStack(alignment: .center, spacing: 10) {
                if let icon { Image(systemName: icon).font(.system(size: 20, weight: .semibold)).foregroundStyle(Color.brand) }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: 22, weight: .bold)).foregroundStyle(Color.ink)
                    if let subtitle { Text(subtitle).font(.system(size: 12)).foregroundStyle(Color.inkSoft) }
                }
            }
            Spacer()
            if let trailing { trailing }
        }
    }
}

/// Ô ngày kiểu "📅 Hôm nay, 24 Thg 9, 2026 ⌄".
struct DatePill: View {
    let text: String; var chevron = true
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "calendar").font(.system(size: 12, weight: .semibold))
            Text(text).font(.system(size: 12, weight: .semibold))
            if chevron { Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold)) }
        }
        .foregroundStyle(Color.ink).padding(.horizontal, 10).padding(.vertical, 7)
        .background(Color.card, in: .rect(cornerRadius: 9)).overlay(RoundedRectangle(cornerRadius: 9).stroke(Color.black.opacity(0.08)))
    }
}

/// Thẻ trắng bo góc có bóng nhẹ.
struct Panel<Content: View>: View {
    var padding: CGFloat = 14
    @ViewBuilder let content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 10) { content }.padding(padding).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.card, in: .rect(cornerRadius: 14))
            .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }
}

/// Tiêu đề mục + "Xem tất cả ›".
struct SectionHead: View {
    let title: String; var action: String? = nil; var route: Route? = nil; var count: Int? = nil
    var body: some View {
        HStack {
            Text(title).font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink)
            if let count { Text("\(count)").font(.system(size: 10, weight: .bold)).foregroundStyle(.white).padding(.horizontal, 6).padding(.vertical, 2).background(Color.bad, in: .capsule) }
            Spacer()
            if let action {
                if let route { NavigationLink(value: route) { HStack(spacing: 2) { Text(action); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }.font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand) } }
                else { Text(action).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand) }
            }
        }
    }
}

/// Ô chỉ số: icon trong ô màu, nhãn, giá trị, mũi tên tăng giảm (như ảnh).
struct KpiCard: View {
    @Environment(\.thinking) private var thinking
    let icon: String; var tint: Color = .brand
    let label: String; let value: String
    var delta: String? = nil; var deltaGood: Bool? = nil
    var note: String? = nil
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            MetricIcon(icon, size: 15).foregroundStyle(tint)
                .frame(width: 34, height: 34).background(tint.opacity(0.13), in: .rect(cornerRadius: 9))
            VStack(alignment: .leading, spacing: 3) {
                Text(label).font(.system(size: 11)).foregroundStyle(Color.inkSoft).lineLimit(1).minimumScaleFactor(0.85)
                // Đang tải lại: số cũ thành khung xám (redacted) tới khi số mới về, nhãn vẫn đọc được.
                Text(value).font(.system(size: 19, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).monospacedDigit().minimumScaleFactor(0.6).lineLimit(1).rolling(value)
                    .loadingPlaceholder(thinking)
                Group {
                    if let delta {
                        // Mũi tên theo dấu; màu theo deltaGood (chi phí tăng là xấu dù mũi tên đi lên).
                        let up = !delta.hasPrefix("-"), good = deltaGood ?? up
                        HStack(spacing: 3) { Image(systemName: up ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill").font(.system(size: 8)); Text(delta).font(.system(size: 11, weight: .semibold)) }
                            .foregroundStyle(good ? Color.good : Color.bad)
                    } else if let note { Text(note).font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1).minimumScaleFactor(0.75) }
                }
                .loadingPlaceholder(thinking)
            }
            Spacer(minLength: 0)
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.card, in: .rect(cornerRadius: 14)).shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }
}

/// Ô chỉ số lớn không icon (Tổng ứng viên 128 · Dữ liệu…).
struct StatCard: View {
    let icon: String; var tint: Color = .brand; let label: String; let value: String; var sub: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                MetricIcon(icon, size: 13).foregroundStyle(tint).frame(width: 28, height: 28).background(tint.opacity(0.13), in: .rect(cornerRadius: 8))
                Text(label).font(.system(size: 11)).foregroundStyle(Color.inkSoft).lineLimit(1)
            }
            Text(value).font(.system(size: 22, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).monospacedDigit().minimumScaleFactor(0.6).lineLimit(1).rolling(value)
            if let sub { Text(sub).font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1) }
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.card, in: .rect(cornerRadius: 14)).shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }
}

/// Avatar tròn chữ cái đầu (NA, TL…).
struct Avatar: View {
    let name: String; var size: CGFloat = 36; var tint: Color = .brand
    var initials: String {
        let parts = name.split(separator: " ").filter { !$0.isEmpty }
        let picked = parts.count >= 2 ? [parts[parts.count - 2], parts[parts.count - 1]] : Array(parts.prefix(1))
        return picked.compactMap { $0.first }.map { String($0).uppercased() }.joined()
    }
    var body: some View {
        Text(initials.isEmpty ? "?" : initials).font(.system(size: size * 0.36, weight: .bold)).foregroundStyle(tint)
            .frame(width: size, height: size).background(tint.opacity(0.14), in: .circle)
    }
}

enum Tone { case green, red, orange, blue, gray, purple
    var color: Color { switch self { case .green: return .good; case .red: return .bad; case .orange: return .warn; case .blue: return .blue; case .gray: return .inkSoft; case .purple: return .purple } }
}
/// Chip trạng thái nhỏ: "Đã liên hệ", "Chưa liên hệ", "Ưu tiên cao"…
struct Tag: View {
    let text: String; var tone: Tone = .green; var dot = false
    var body: some View {
        HStack(spacing: 4) { if dot { Circle().fill(tone.color).frame(width: 6, height: 6) }; Text(text) }
            .font(.system(size: 10, weight: .semibold)).foregroundStyle(tone.color)
            .padding(.horizontal, 7).padding(.vertical, 3).background(tone.color.opacity(0.12), in: .rect(cornerRadius: 6))
    }
}

/// Chip lọc: chọn = xanh đậm nền trắng chữ; không chọn = trắng viền.
struct FilterChip: View {
    let label: String; let on: Bool; var badge: Int? = nil; var chevron = false; let tap: () -> Void
    var body: some View {
        Button(action: tap) {
            HStack(spacing: 5) {
                Text(label).font(.system(size: 12, weight: .semibold))
                if let badge, badge > 0 { Text("\(badge)").font(.system(size: 9, weight: .bold)).foregroundStyle(.white).padding(4).background(Color.bad, in: .circle) }
                if chevron { Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold)) }
            }
            .foregroundStyle(on ? .white : Color.ink).padding(.horizontal, 12).padding(.vertical, 7)
            .background(on ? Color.brandDeep : Color.card, in: .capsule)
            .overlay(Capsule().stroke(on ? .clear : Color.black.opacity(0.1)))
            .animation(.snappy(duration: 0.25), value: on)
        }.buttonStyle(.plain)
    }
}

/// Bộ chọn phân đoạn kiểu ảnh: nền xám nhạt, mục chọn xanh đậm.
struct Segmented<T: Hashable>: View {
    @Binding var selection: T; let options: [(T, String)]
    var body: some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.0) { v, label in
                Button { withAnimation(.snappy(duration: 0.25)) { selection = v } } label: {
                    Text(label).font(.system(size: 12, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity).padding(.vertical, 8)
                        .background(selection == v ? Color.brandDeep : .clear, in: .rect(cornerRadius: 9))
                        .foregroundStyle(selection == v ? .white : Color.ink)
                }.buttonStyle(.plain)
            }
        }
        .padding(4).background(Color.black.opacity(0.05), in: .rect(cornerRadius: 12))
    }
}

/// Vòng tròn tiến độ (72%, 78%).
struct Ring: View {
    let value: Double; var size: CGFloat = 64; var line: CGFloat = 7; var tint: Color = .good; var label: String? = nil
    @State private var shown = false
    var body: some View {
        ZStack {
            Circle().stroke(tint.opacity(0.15), lineWidth: line)
            Circle().trim(from: 0, to: shown ? min(1, max(0, value)) : 0).stroke(tint, style: StrokeStyle(lineWidth: line, lineCap: .round)).rotationEffect(.degrees(-90))
            Text(label ?? Fmt.pct0(value * 100)).font(.system(size: size * 0.26, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).monospacedDigit()
        }
        .frame(width: size, height: size)
        .onAppear { withAnimation(.spring(duration: 0.8, bounce: 0.1)) { shown = true } }
        .animation(.spring(duration: 0.6), value: value)
    }
}

/// Dòng phễu: nhãn · thanh · số (Tổng khách đủ điều kiện 320…).
struct FunnelLine: View {
    let label: String; let n: Double; let of: Double; var tint: Color = .good
    var body: some View {
        HStack(spacing: 10) {
            Text(label).font(.system(size: 12)).foregroundStyle(Color.ink).frame(width: 130, alignment: .leading).lineLimit(1)
            Bar(value: of > 0 ? n / of : 0, tint: tint, height: 9)
            Text(Fmt.int(n)).font(.system(size: 12, weight: .bold)).monospacedDigit().frame(width: 44, alignment: .trailing)
        }
    }
}

/// Thanh trạng thái nhiều màu + chú giải.
struct StackedBar: View {
    let parts: [(String, Double, Color)]
    var body: some View {
        let total = max(1, parts.reduce(0) { $0 + $1.1 })
        VStack(alignment: .leading, spacing: 8) {
            GeometryReader { g in
                HStack(spacing: 2) { ForEach(Array(parts.enumerated()), id: \.offset) { _, p in if p.1 > 0 { RoundedRectangle(cornerRadius: 3).fill(p.2).frame(width: max(4, g.size.width * p.1 / total)) } } }
            }.frame(height: 10)
            HStack(spacing: 12) { ForEach(Array(parts.enumerated()), id: \.offset) { _, p in HStack(spacing: 4) { Circle().fill(p.2).frame(width: 7, height: 7); Text(p.0).font(.system(size: 10)).foregroundStyle(Color.inkSoft) } } }
        }
    }
}

/// Huy chương hạng 1-2-3.
struct Medal: View {
    let rank: Int
    var body: some View {
        let c: Color = rank == 1 ? Color(red: 0.95, green: 0.72, blue: 0.2) : rank == 2 ? Color(red: 0.7, green: 0.72, blue: 0.75) : rank == 3 ? Color(red: 0.8, green: 0.5, blue: 0.3) : Color.black.opacity(0.06)
        Text("\(rank)").font(.system(size: 11, weight: .bold)).foregroundStyle(rank <= 3 ? .white : Color.inkSoft).frame(width: 22, height: 22).background(c, in: .circle)
    }
}

/// Đường gấp khúc đơn giản có tô nền (xu hướng doanh thu).
struct LineChart: View {
    let points: [(String, Double)]; var tint: Color = .brand; var height: CGFloat = 130; var highlightMax = true
    @State private var shown = false
    var body: some View {
        let maxV = max(1, points.map(\.1).max() ?? 1)
        VStack(spacing: 4) {
            GeometryReader { g in
                let w = g.size.width, h = g.size.height - 8
                let n = max(1, points.count - 1)
                let pts = points.enumerated().map { i, p in CGPoint(x: w * CGFloat(i) / CGFloat(n), y: 4 + h * (1 - p.1 / maxV)) }
                ZStack(alignment: .topLeading) {
                    ForEach(0..<4, id: \.self) { i in Path { p in p.move(to: CGPoint(x: 0, y: 4 + h * CGFloat(i) / 3)); p.addLine(to: CGPoint(x: w, y: 4 + h * CGFloat(i) / 3)) }.stroke(Color.black.opacity(0.05), lineWidth: 1) }
                    if pts.count > 1 {
                        Path { p in p.move(to: CGPoint(x: pts[0].x, y: h + 4)); for q in pts { p.addLine(to: q) }; p.addLine(to: CGPoint(x: pts.last!.x, y: h + 4)); p.closeSubpath() }
                            .fill(LinearGradient(colors: [tint.opacity(0.28), tint.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                        Path { p in p.move(to: pts[0]); for q in pts.dropFirst() { p.addLine(to: q) } }
                            .trim(from: 0, to: shown ? 1 : 0).stroke(tint, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
                        ForEach(Array(pts.enumerated()), id: \.offset) { _, q in Circle().fill(tint).frame(width: 5, height: 5).position(q).opacity(shown ? 1 : 0) }
                        if highlightMax, let mi = points.indices.max(by: { points[$0].1 < points[$1].1 }) {
                            Text(Fmt.short(points[mi].1)).font(.system(size: 9, weight: .bold)).foregroundStyle(.white).padding(.horizontal, 6).padding(.vertical, 3).background(Color.brandDeep, in: .rect(cornerRadius: 5))
                                .position(x: min(max(28, pts[mi].x), w - 28), y: max(8, pts[mi].y - 16)).opacity(shown ? 1 : 0)
                        }
                    }
                }
            }.frame(height: height)
            HStack { ForEach(Array(points.enumerated()), id: \.offset) { i, p in if points.count <= 8 || i % max(1, points.count / 7) == 0 { Text(p.0).font(.system(size: 9)).foregroundStyle(Color.inkSoft).frame(maxWidth: .infinity) } } }
        }
        .onAppear { withAnimation(.easeOut(duration: 0.9)) { shown = true } }
    }
}

/// Nút hành động tròn nhỏ (gọi, nhắn).
struct IconButton: View {
    let icon: String; var tint: Color = .brand; var url: URL? = nil
    var body: some View {
        Group {
            if let url { Link(destination: url) { body0 } } else { body0 }
        }
    }
    private var body0: some View { Image(systemName: icon).font(.system(size: 14, weight: .semibold)).foregroundStyle(tint).frame(width: 36, height: 36).background(tint.opacity(0.12), in: .circle) }
}

/// Nút chính xanh đậm full chiều ngang.
struct PrimaryButton: View {
    let title: String; var icon: String? = nil; var tint: Color = .brandDeep; let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) { if let icon { Image(systemName: icon) }; Text(title) }.font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
                .frame(maxWidth: .infinity).padding(.vertical, 13).background(tint, in: .rect(cornerRadius: 12))
        }.buttonStyle(.plain)
    }
}

/// Khung một trang gốc của tab: thanh đầu xanh + nội dung cuộn trên nền kem.
/// Kéo để làm mới: việc .refreshable đặt ngoài TabPage chạy cùng lúc với việc tải lại của các khối bên trong (pullToReload).
struct TabPage<Content: View>: View {
    var tagline = "Bán hàng tốt hơn mỗi ngày"
    @ViewBuilder let content: Content
    @Environment(\.refresh) private var outer
    var body: some View {
        VStack(spacing: 0) {
            AppHeader(tagline: tagline)
            ScrollView { VStack(alignment: .leading, spacing: 14) { content }.padding(16).padding(.bottom, 24) }
                .refreshHost(outer: outer)
        }
        .background(Color.cream)
        .toolbar(.hidden, for: .navigationBar)
    }
}

/// Trang con: thanh điều hướng xanh đậm chữ trắng.
extension View {
    func brandNav() -> some View {
        self.toolbarBackground(Color.brandDeep, for: .navigationBar).toolbarBackground(.visible, for: .navigationBar).toolbarColorScheme(.dark, for: .navigationBar)
            .background(Color.cream)
    }
    func cardShadow() -> some View { shadow(color: .black.opacity(0.04), radius: 6, y: 2) }
}

/// Nhãn nhỏ "Dữ liệu minh họa" kiểu ảnh — dùng cho chỗ chưa có dữ liệu thật.
struct Hint: View { let text: String; var body: some View { Text(text).font(.system(size: 9, weight: .medium)).foregroundStyle(Color.inkSoft).padding(.horizontal, 6).padding(.vertical, 3).background(Color.black.opacity(0.05), in: .capsule) } }

/// Thẻ có tiêu đề (tương thích màn cũ).
struct Card<Content: View>: View {
    let title: String; @ViewBuilder let content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 8) { Text(title).font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink); content }
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
    }
}
struct MiniStat: View {
    let title: String; let value: String; var tint: Color = .ink
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value).font(.system(size: 18, weight: .bold, design: .rounded)).monospacedDigit().foregroundStyle(tint).minimumScaleFactor(0.7).lineLimit(1).rolling(value)
            Text(title).font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(12).background(Color.card, in: .rect(cornerRadius: 12)).cardShadow()
    }
}
struct PeriodPicker: View {
    @Binding var period: Period; var options: [Period] = [.today, .week, .month, .last]
    var body: some View { Segmented(selection: $period, options: options.map { ($0, $0.title) }) }
}

/// Xuất bảng ra file Excel (CSV có BOM, Excel mở đúng tiếng Việt) rồi mở bảng chia sẻ / lưu vào Tệp.
/// Mỗi lần xuất báo máy chủ (nhật ký truy cập) theo mã trang `view` trên web (calls, compare…).
struct ExportButton: View {
    let view: String
    let filename: String
    let headers: [String]
    let rows: () -> [[String]]
    @State private var url: URL?
    var body: some View {
        Button {
            let data = rows()
            let csv = "\u{FEFF}" + ([headers] + data).map { $0.map { "\"" + $0.replacingOccurrences(of: "\"", with: "\"\"") + "\"" }.joined(separator: ",") }.joined(separator: "\r\n")
            let f = FileManager.default.temporaryDirectory.appendingPathComponent(filename + ".csv")
            try? csv.data(using: .utf8)?.write(to: f); url = f
            API.logExport(view: view, file: f.lastPathComponent, rows: data.count)
        } label: { HStack(spacing: 5) { Image(systemName: "square.and.arrow.down"); Text("Xuất Excel") }.font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink).padding(.horizontal, 10).padding(.vertical, 7).background(Color.card, in: .rect(cornerRadius: 8)).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.black.opacity(0.12))) }
        .buttonStyle(.plain)
        .sheet(item: $url) { u in ShareFile(url: u) }
    }
}
extension URL: @retroactive Identifiable { public var id: String { absoluteString } }
struct ShareFile: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: [url], applicationActivities: nil) }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

// MARK: Tải số (kế hoạch 1.3): câu lỗi dễ hiểu, khung đang tải / trống / lỗi có nút "Thử lại", kéo để làm mới cả trang,
// không tải lại số còn mới.

/// Câu báo lỗi tải số cho người dùng, thay cho nguyên văn lỗi hệ thống. nil = lần tải bị hủy (rời trang, đổi bộ lọc): không báo gì.
enum LoadError {
    static func text(_ error: Error) -> String? {
        if error is CancellationError { return nil }
        if let u = error as? URLError {
            switch u.code {
            case .cancelled: return nil
            case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed, .internationalRoamingOff, .callIsActive,
                 .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed:
                return "Mất mạng, kiểm tra kết nối"
            case .timedOut: return "Máy chủ chậm, thử lại sau ít giây"
            default: return "Không tải được"
            }
        }
        if let a = error as? API.APIError {
            switch a.status {
            case 401: return "Phiên đã hết, đăng nhập lại"
            case 403: return "Tài khoản chưa được xem phần này"
            case 429: return "Thao tác quá nhanh, thử lại sau ít giây"
            case 500...599: return "Máy chủ chậm, thử lại sau ít giây"
            default: return "Không tải được"
            }
        }
        return "Không tải được"
    }
}

/// Khung trạng thái tải dùng chung: đang tải, không có dữ liệu, hoặc lỗi kèm nút "Thử lại" (thay cho dòng lỗi nguyên văn
/// và vòng chờ không bao giờ dừng). compact: gọn trong một thẻ; onDark: trên nền xanh đậm (thẻ số chính ở Trang chủ).
struct StateView: View {
    enum Kind { case loading, empty, failed }
    let kind: Kind
    let text: String
    var compact = false
    var onDark = false
    var retry: (() async -> Void)? = nil
    @State private var retrying = false

    init(loading text: String = "Đang tải số liệu…", compact: Bool = false, onDark: Bool = false) {
        kind = .loading; self.text = text; self.compact = compact; self.onDark = onDark
    }
    init(empty text: String, compact: Bool = false, onDark: Bool = false) {
        kind = .empty; self.text = text; self.compact = compact; self.onDark = onDark
    }
    init(error text: String, compact: Bool = false, onDark: Bool = false, retry: (() async -> Void)? = nil) {
        kind = .failed; self.text = text; self.compact = compact; self.onDark = onDark; self.retry = retry
    }

    var body: some View {
        HStack(spacing: 10) {
            icon
            Text(text).font(.system(size: compact ? 12 : 13, weight: .semibold)).foregroundStyle(textColor)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 4)
            if kind == .failed, let retry {
                Button { start(retry) } label: {
                    HStack(spacing: 4) {
                        if retrying { ProgressView().controlSize(.mini).tint(onDark ? Color.brandDeep : Color.white) }
                        else { Image(systemName: "arrow.clockwise").font(.system(size: 11, weight: .bold)) }
                        Text("Thử lại").font(.system(size: 12, weight: .bold))
                    }
                    .foregroundStyle(onDark ? Color.brandDeep : Color.white)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(onDark ? Color.lime : Color.brandDeep, in: .capsule)
                    .contentShape(.capsule)
                }
                .buttonStyle(.plain)
                .disabled(retrying)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, compact ? 8 : 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(onDark ? Color.white.opacity(0.10) : Color.card, in: .rect(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(strokeColor))
        #if DEBUG
        // Lượt tự xem MEGATECH_TOUR=reload "bấm" mọi nút Thử lại đang hiện (máy ảo không chạm được).
        .onChange(of: DebugRetry.shared.tick) { _, _ in
            if kind == .failed, let retry, !retrying { start(retry) }
        }
        #endif
    }

    @ViewBuilder private var icon: some View {
        switch kind {
        case .loading:
            ProgressView().controlSize(.small).tint(onDark ? Color.white : Color.brand)
        case .empty:
            Image(systemName: "tray").font(.system(size: 14, weight: .semibold)).foregroundStyle(onDark ? Color.white.opacity(0.7) : Color.inkSoft)
        case .failed:
            Image(systemName: "wifi.exclamationmark").font(.system(size: 14, weight: .semibold)).foregroundStyle(onDark ? Color.lime : Color.warn)
        }
    }
    private var textColor: Color {
        if onDark { return Color.white.opacity(0.9) }
        return kind == .failed ? Color.ink : Color.inkSoft
    }
    private var strokeColor: Color {
        if onDark { return Color.white.opacity(0.15) }
        return kind == .failed ? Color.warn.opacity(0.35) : Color.black.opacity(0.06)
    }
    private func start(_ retry: @escaping () async -> Void) {
        retrying = true
        Task { await retry(); retrying = false }
    }
}

#if DEBUG
/// Bản Debug: DebugTour (MEGATECH_TOUR=reload) tăng tick để mọi khung lỗi đang hiện tự bấm "Thử lại".
@Observable final class DebugRetry {
    static let shared = DebugRetry()
    var tick = 0
}
#endif

/// Tuổi số của một tab gốc: mở lại tab mà số vừa tải chưa quá 60 giây thì không tải lại (kéo để làm mới thì luôn tải lại).
/// Chỉ nhớ bộ lọc của số đang hiện (đổi kỳ / POS / nhóm đơn là tải).
struct Freshness {
    static let window: TimeInterval = 60
    private var key: String?
    private var at: Date?
    init() {}
    /// Số của bộ lọc k còn mới: trả tuổi (giây); nil nếu chưa có, khác bộ lọc hoặc đã quá 60 giây.
    func age(_ k: String) -> TimeInterval? {
        guard key == k, let at else { return nil }
        let a = Date.now.timeIntervalSince(at)
        return a >= 0 && a < Self.window ? a : nil
    }
    /// Vừa tải xong (thành công) số của bộ lọc k.
    mutating func stamp(_ k: String) { key = k; at = .now }
    mutating func clear() { key = nil; at = nil }
}

/// Việc tải lại của một khối, giữ bản mới nhất mỗi lần khối được dựng lại (đọc bộ lọc đang chọn).
final class ReloadBox {
    var action: (() async -> Void)?
}

/// Các khối bên trong một trang cuộn đăng ký việc tải lại của mình (pullToReload); kéo để làm mới trang thì chạy tất cả cùng lúc.
final class RefreshRelay {
    private var boxes: [UUID: ReloadBox] = [:]
    func set(_ id: UUID, _ box: ReloadBox?) { boxes[id] = box }
    var jobs: [() async -> Void] { boxes.values.compactMap { $0.action } }
}

/// Chạy các việc cùng lúc (mỗi việc chờ mạng riêng, cùng trên luồng chính), chờ việc lâu nhất xong.
@MainActor func runTogether(_ jobs: [() async -> Void]) async {
    let tasks = jobs.map { job in Task { await job() } }
    for t in tasks { await t.value }
}

private struct RefreshRelayKey: EnvironmentKey { static var defaultValue: RefreshRelay? { nil } }
extension EnvironmentValues {
    var refreshRelay: RefreshRelay? {
        get { self[RefreshRelayKey.self] }
        set { self[RefreshRelayKey.self] = newValue }
    }
}

/// Đặt trên ScrollView của một trang: kéo để làm mới chạy cùng lúc việc của trang (outer / action) và của mọi khối đã đăng ký.
struct RefreshHost: ViewModifier {
    var outer: RefreshAction?
    var action: (() async -> Void)?
    @State private var relay = RefreshRelay()
    func body(content: Content) -> some View {
        content
            .environment(\.refreshRelay, relay)
            .refreshable { await pull() }
    }
    @MainActor private func pull() async {
        var jobs = relay.jobs
        if let outer { jobs.append({ await outer() }) }
        if let action { jobs.append(action) }
        // Vòng kéo để làm mới tắt khi việc lâu nhất xong.
        await runTogether(jobs)
    }
}

/// Đặt trên một khối có việc tải riêng: nằm trong trang có RefreshHost thì đăng ký với trang (kéo trang là tải lại cùng lúc);
/// khối tự có ScrollView (mở thành trang riêng) thì kéo chính nó cũng tải lại.
struct PullToReload: ViewModifier {
    let action: () async -> Void
    @Environment(\.refreshRelay) private var relay
    @State private var box = ReloadBox()
    @State private var id = UUID()
    func body(content: Content) -> some View {
        box.action = action
        return content
            .refreshable { await reloadNow() }
            .onAppear { relay?.set(id, box) }
            .onDisappear { relay?.set(id, nil) }
    }
    @MainActor private func reloadNow() async {
        if let a = box.action { await a() }
    }
}

extension View {
    func refreshHost(outer: RefreshAction?) -> some View { modifier(RefreshHost(outer: outer)) }
    func refreshHost(_ action: @escaping () async -> Void) -> some View { modifier(RefreshHost(action: action)) }
    func pullToReload(_ action: @escaping () async -> Void) -> some View { modifier(PullToReload(action: action)) }
}
