import SwiftUI

private struct CardShadow: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        content.shadow(color: .black.opacity(scheme == .light ? 0.05 : 0), radius: 2, y: 1)
    }
}

struct InfoText: Identifiable {
    let id = UUID()
    let title: String
    let body: String
}

struct InfoButton: View {
    let info: InfoText
    @State private var open = false
    init(_ info: InfoText) { self.info = info }
    var body: some View {
        Button { open = true } label: {
            Image(systemName: "info.circle").font(.body).foregroundStyle(Palette.ink3)
                .frame(width: 44, height: 44).contentShape(.rect)
        }.buttonStyle(.plain).accessibilityLabel("Giải thích: \(info.title)")
            .sheet(isPresented: $open) { InfoSheet(info: info) }
    }
}

struct InfoSheet: View {
    let info: InfoText
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView { Text(info.body).font(.body).foregroundStyle(Palette.ink).frame(maxWidth: .infinity, alignment: .leading).padding(20) }
                .navigationTitle(info.title).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Đóng") { dismiss() } } }
        }.presentationDetents([.medium, .large])
    }
}

struct GroupTitle: View {
    let title: String
    var subtitle: String? = nil
    var info: InfoText? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack { Text(title).font(.title2.bold()).foregroundStyle(Palette.ink); if let info { InfoButton(info) } }
            if let subtitle { Text(subtitle).font(.footnote).foregroundStyle(Palette.ink3) }
        }
    }
}

struct IconSquare: View {
    let icon: String; let tint: Color; var size: CGFloat = 32; var filled = false
    init(_ icon: String, tint: Color, size: CGFloat = 32, filled: Bool = false) {
        self.icon = icon; self.tint = tint; self.size = size; self.filled = filled
    }
    var body: some View {
        MetricIcon(icon, size: size * 0.48).foregroundStyle(filled ? Palette.onFill : tint)
            .frame(width: size, height: size).background(filled ? tint : tint.opacity(0.14), in: .rect(cornerRadius: size * 0.28))
    }
}

struct DeltaPill: View {
    let text: String; var good: Bool? = nil; var onFill = false
    init(_ text: String, good: Bool? = nil, onFill: Bool = false) { self.text = text; self.good = good; self.onFill = onFill }
    private var down: Bool { text.hasPrefix("-") || text.hasPrefix("−") }
    private var number: String { text.hasPrefix("+") || down ? String(text.dropFirst()) : text }
    var body: some View {
        let positive = good ?? !down
        HStack(spacing: 3) { Image(systemName: down ? "arrow.down" : "arrow.up").font(.caption); Text(number) }
            .font(.footnote.bold())
            .foregroundStyle(onFill ? (positive ? Color(hex: 0xC9F2DA) : Color(hex: 0xFFC2B8)) : (positive ? Palette.good : Palette.bad))
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(onFill ? Color.white.opacity(0.14) : (positive ? Palette.goodSoft : Palette.badSoft), in: .capsule)
            .accessibilityElement(children: .ignore).accessibilityLabel("\(down ? "giảm" : "tăng") \(number)")
    }
}

struct StatCell: View {
    let label: String; let value: String
    var unit: String? = nil; var note: String? = nil; var tone: Color? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(Palette.ink3)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value).font(.title3.weight(.semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6).rolling(value).foregroundStyle(tone ?? Palette.ink)
                if let unit { Text(unit).font(.caption).foregroundStyle(Palette.ink3) }
            }
            if let note { Text(note).font(.caption).foregroundStyle(Palette.ink3) }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 10).padding(.horizontal, 12).background(Palette.cell, in: .rect(cornerRadius: 12))
    }
}

struct StatusPill: View {
    let name: String; let code: Int?
    var body: some View {
        Text(name).font(.caption.bold()).foregroundStyle(StatusChip.tint(code: code))
            .padding(.horizontal, 7).padding(.vertical, 3).background(StatusChip.bg(code: code), in: .capsule)
    }
}

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
                Text("MEGATECH").font(.title3.weight(.heavy)).tracking(0.5).foregroundStyle(.white)
                Text(tagline).font(.caption2).foregroundStyle(.white.opacity(0.75))
            }
            Spacer()
            // Ô trạng thái đồng bộ chạm được (kế hoạch 1.6): mở Thông báo, cuộn tới khối "Đồng bộ Pancake" (giờ đồng bộ từng POS).
            NavigationLink(value: Route.alertsSync) {
                HStack(spacing: 6) {
                    Circle().fill(sync.tone).frame(width: 7, height: 7)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(sync.title).font(.caption.weight(.semibold)).foregroundStyle(.white)
                        Text(sync.subtitle).font(.caption2).foregroundStyle(.white.opacity(0.75))
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
            .overlay(alignment: .topTrailing) { if n > 0 { Text("\(n)").font(.caption2.weight(.bold)).foregroundStyle(.white).padding(3).background(Color.bad, in: .circle).offset(x: 2, y: 2) } }
    }
}

/// Trạng thái đồng bộ dùng cho thanh đầu và trang chủ.
@Observable final class SyncStatus {
    var pos: [API.SyncPos] = []
    var alertCount = 0
    var tone: Color { pos.isEmpty ? Palette.gray : pos.contains { $0.lastError != nil } ? Palette.bad : maxAge > 15 ? Palette.warn : Palette.good }
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
                if let icon { Image(systemName: icon).font(.title3.weight(.semibold)).foregroundStyle(Color.brand) }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.title2.weight(.bold)).foregroundStyle(Color.ink)
                    if let subtitle { Text(subtitle).font(.footnote).foregroundStyle(Color.inkSoft) }
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
            Image(systemName: "calendar").font(.footnote.weight(.semibold))
            Text(text).font(.footnote.weight(.semibold))
            if chevron { Image(systemName: "chevron.down").font(.caption2.weight(.bold)) }
        }
        .foregroundStyle(Color.ink).padding(.horizontal, 10).padding(.vertical, 7)
        .background(Color.card, in: .rect(cornerRadius: 9)).overlay(RoundedRectangle(cornerRadius: 9).stroke(Palette.line))
    }
}

/// Thẻ trắng bo góc có bóng nhẹ.
struct Panel<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder let content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }.padding(padding).frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface()
    }
}

/// Tiêu đề mục + "Xem tất cả ›".
struct SectionHead: View {
    let title: String; var action: String? = nil; var route: Route? = nil; var count: Int? = nil
    var subtitle: String? = nil; var info: InfoText? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title).font(.headline).foregroundStyle(Palette.ink)
                if let info { InfoButton(info) }
                if let count { Text("\(count)").font(.caption2.bold()).foregroundStyle(Palette.onFill).padding(.horizontal, 6).padding(.vertical, 2).background(Palette.badge, in: .capsule) }
                Spacer()
                if let action {
                    if let route { NavigationLink(value: route) { HStack(spacing: 3) { Text(action); Image(systemName: "chevron.right") } }.font(.subheadline).foregroundStyle(Palette.accent) }
                    else { Text(action).font(.subheadline).foregroundStyle(Palette.accent) }
                }
            }
            if let subtitle { Text(subtitle).font(.footnote).foregroundStyle(Palette.ink3).fixedSize(horizontal: false, vertical: true) }
        }
    }
}

/// Ô chỉ số: icon trong ô màu, nhãn, giá trị, mũi tên tăng giảm (như ảnh).
struct KpiCard: View {
    @Environment(\.thinking) private var thinking
    let icon: String; var tint: Color = .brand
    let label: String; let value: String
    var delta: String? = nil; var deltaGood: Bool? = nil; var note: String? = nil
    var unit: String? = nil; var money: Double? = nil
    var body: some View {
        let amount = money.map { Fmt.compactMoney($0) }
        let number = amount?.value ?? value
        VStack(alignment: .leading, spacing: 6) {
            HStack { IconSquare(icon, tint: tint, size: 28); Text(label).font(.subheadline).foregroundStyle(Palette.ink2).lineLimit(2) }
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(number).font(.system(size: 26, weight: .semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6).rolling(number)
                if let suffix = amount?.unit ?? unit { Text(suffix).font(.footnote).foregroundStyle(Palette.ink3) }
            }
            .foregroundStyle(Palette.ink).accessibilityElement(children: .ignore)
            .accessibilityLabel(money.map { Fmt.money($0) } ?? [value, unit].compactMap { $0 }.joined(separator: " "))
            .loadingPlaceholder(thinking)
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top) { details }
                VStack(alignment: .leading, spacing: 4) { details }
            }.loadingPlaceholder(thinking)
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading).cardSurface()
    }
    @ViewBuilder private var details: some View {
        if let delta { DeltaPill(delta, good: deltaGood) }
        if let note { Text(note).font(.caption).foregroundStyle(Palette.ink3).fixedSize(horizontal: false, vertical: true) }
    }
}

/// Ô chỉ số lớn không icon (Tổng ứng viên 128 · Dữ liệu…).
struct StatCard: View {
    let icon: String; var tint: Color = .brand; let label: String; let value: String; var sub: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                MetricIcon(icon, size: 13).foregroundStyle(tint).frame(width: 28, height: 28).background(tint.opacity(0.13), in: .rect(cornerRadius: 8))
                Text(label).font(.caption).foregroundStyle(Color.inkSoft).lineLimit(1)
            }
            Text(value).font(.title2.weight(.semibold)).foregroundStyle(Color.ink).monospacedDigit().minimumScaleFactor(0.6).lineLimit(1).rolling(value)
            if let sub { Text(sub).font(.caption2).foregroundStyle(Color.inkSoft).lineLimit(1) }
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
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
        Text(initials.isEmpty ? "?" : initials).font(.system(size: size * 0.36, weight: .semibold)).foregroundStyle(tint)
            .frame(width: size, height: size).background(tint.opacity(0.14), in: .circle)
    }
}

enum Tone { case green, red, orange, blue, gray, purple
    var color: Color { switch self { case .green: return Palette.good; case .red: return Palette.bad; case .orange: return Palette.orange; case .blue: return Palette.info; case .gray: return Palette.ink3; case .purple: return Palette.purple } }
}
/// Chip trạng thái nhỏ: "Đã liên hệ", "Chưa liên hệ", "Ưu tiên cao"…
struct Tag: View {
    let text: String; var tone: Tone = .green; var dot = false
    var body: some View {
        HStack(spacing: 4) { if dot { Circle().fill(tone.color).frame(width: 6, height: 6) }; Text(text) }
            .font(.caption.weight(.semibold)).foregroundStyle(tone.color)
            .padding(.horizontal, 7).padding(.vertical, 3).background(tone.color.opacity(0.14), in: .capsule)
    }
}

/// Chip lọc: chọn = xanh đậm nền trắng chữ; không chọn = trắng viền.
struct FilterChip: View {
    let label: String; let on: Bool; var badge: Int? = nil; var chevron = false; let tap: () -> Void
    var body: some View {
        Button(action: tap) {
            HStack(spacing: 5) {
                Text(label).font(.subheadline.weight(.medium))
                if let badge, badge > 0 { Text("\(badge)").font(.caption2.weight(.bold)).foregroundStyle(.white).padding(4).background(Palette.badge, in: .circle) }
                if chevron { Image(systemName: "chevron.down").font(.caption2.weight(.bold)) }
            }
            .foregroundStyle(on ? Palette.card : Palette.ink2).padding(.horizontal, 12).padding(.vertical, 7)
            .background(on ? Palette.ink : Palette.cell, in: .capsule)

            .animation(.snappy(duration: 0.25), value: on)
        }.buttonStyle(.plain).accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// Bộ chọn phân đoạn kiểu ảnh: nền xám nhạt, mục chọn xanh đậm.
struct Segmented<T: Hashable>: View {
    @Binding var selection: T; let options: [(T, String)]
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.0) { v, label in
                Button { withAnimation(.snappy(duration: 0.25)) { selection = v } } label: {
                    Text(label).font(.footnote.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity).padding(.vertical, 8)
                        .background(selection == v ? Palette.segSel : .clear, in: .rect(cornerRadius: 7))
                        .shadow(color: .black.opacity(selection == v && scheme == .light ? 0.1 : 0), radius: 1.5, y: 1)
                        .foregroundStyle(selection == v ? Palette.ink : Palette.ink2).fontWeight(selection == v ? .semibold : .regular).accessibilityAddTraits(selection == v ? .isSelected : [])
                }.buttonStyle(.plain)
            }
        }
        .padding(2).background(Palette.fill, in: .rect(cornerRadius: 9)).sensoryFeedback(.selection, trigger: selection)
    }
}

/// Vòng tròn tiến độ (72%, 78%).
struct Ring: View {
    let value: Double; var size: CGFloat = 64; var line: CGFloat = 7; var tint: Color = .good; var label: String? = nil
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        ZStack {
            Circle().stroke(Palette.fill, lineWidth: line)
            Circle().trim(from: 0, to: shown ? min(1, max(0, value)) : 0).stroke(tint, style: StrokeStyle(lineWidth: line, lineCap: .round)).rotationEffect(.degrees(-90))
            Text(label ?? Fmt.pct0(value * 100)).font(.system(size: size * 0.24, weight: .semibold)).foregroundStyle(Color.ink).monospacedDigit()
        }
        .frame(width: size, height: size)
        .onAppear { withAnimation(reduce ? nil : .spring(duration: 0.8, bounce: 0.1)) { shown = true } }
        .animation(reduce ? nil : .spring(duration: 0.6), value: value)
    }
}

/// Dòng phễu: nhãn · thanh · số (Tổng khách đủ điều kiện 320…).
struct FunnelLine: View {
    let label: String; let n: Double; let of: Double; var tint: Color = .good
    var body: some View {
        HStack(spacing: 10) {
            Text(label).font(.footnote).foregroundStyle(Color.ink).frame(width: 130, alignment: .leading).lineLimit(1)
            Bar(value: of > 0 ? n / of : 0, tint: tint, height: 9)
            Text(Fmt.int(n)).font(.footnote.weight(.bold)).monospacedDigit().frame(width: 44, alignment: .trailing)
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
                HStack(spacing: 2) { ForEach(Array(parts.enumerated()), id: \.offset) { _, p in if p.1 > 0 { RoundedRectangle(cornerRadius: 5).fill(p.2).frame(width: max(4, max(0, g.size.width - CGFloat(max(0, parts.filter { $0.1 > 0 }.count - 1)) * 2) * p.1 / total)) } } }
            }.frame(height: 10)
            HStack(spacing: 12) { ForEach(Array(parts.enumerated()), id: \.offset) { _, p in HStack(spacing: 4) { RoundedRectangle(cornerRadius: 3).fill(p.2).frame(width: 8, height: 8); Text(p.0).font(.caption).foregroundStyle(Palette.ink2) } } }
        }
    }
}

/// Huy chương hạng 1-2-3.
struct Medal: View {
    let rank: Int
    var body: some View {
        let bg = rank == 1 ? Color(hex: 0xF2C14E) : rank == 2 ? Color(hex: 0xC9CED4) : rank == 3 ? Color(hex: 0xD9935F) : Palette.fill
        let fg = rank == 1 ? Color(hex: 0x5A3E00) : rank == 2 ? Color(hex: 0x3B4148) : rank == 3 ? Color(hex: 0x4A2408) : Palette.ink2
        Text("\(rank)").font(.caption.bold()).foregroundStyle(fg).frame(width: 22, height: 22).background(bg, in: .circle)
    }
}

/// Đường gấp khúc đơn giản có tô nền (xu hướng doanh thu).
struct LineChart: View {
    let points: [(String, Double)]; var tint: Color = .brand; var height: CGFloat = 130; var highlightMax = true
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        let maxV = max(1, points.map(\.1).max() ?? 1)
        VStack(spacing: 4) {
            GeometryReader { g in
                let w = g.size.width, h = g.size.height - 8
                let n = max(1, points.count - 1)
                let pts = points.enumerated().map { i, p in CGPoint(x: w * CGFloat(i) / CGFloat(n), y: 4 + h * (1 - p.1 / maxV)) }
                ZStack(alignment: .topLeading) {
                    ForEach(0..<4, id: \.self) { i in Path { p in p.move(to: CGPoint(x: 0, y: 4 + h * CGFloat(i) / 3)); p.addLine(to: CGPoint(x: w, y: 4 + h * CGFloat(i) / 3)) }.stroke(Palette.grid, lineWidth: 1) }
                    if pts.count > 1 {
                        Path { p in p.move(to: CGPoint(x: pts[0].x, y: h + 4)); for q in pts { p.addLine(to: q) }; p.addLine(to: CGPoint(x: pts.last!.x, y: h + 4)); p.closeSubpath() }
                            .fill(LinearGradient(colors: [tint.opacity(0.24), tint.opacity(0)], startPoint: .top, endPoint: .bottom))
                        Path { p in p.move(to: pts[0]); for q in pts.dropFirst() { p.addLine(to: q) } }
                            .trim(from: 0, to: shown ? 1 : 0).stroke(tint, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
                        if let q = pts.last { Circle().fill(tint).frame(width: 5, height: 5).position(q).opacity(shown ? 1 : 0) }
                        if highlightMax, let mi = points.indices.max(by: { points[$0].1 < points[$1].1 }) {
                            Text(Fmt.short(points[mi].1)).font(.caption2.weight(.bold)).foregroundStyle(Palette.card).padding(.horizontal, 6).padding(.vertical, 3).background(Palette.ink, in: .capsule)
                                .position(x: min(max(28, pts[mi].x), w - 28), y: max(8, pts[mi].y - 16)).opacity(shown ? 1 : 0)
                        }
                    }
                }
            }.frame(height: height)
            HStack { ForEach(Array(points.enumerated()), id: \.offset) { i, p in if points.count <= 8 || i % max(1, points.count / 7) == 0 { Text(p.0).font(.caption2).foregroundStyle(Palette.ink3).frame(maxWidth: .infinity) } } }
        }
        .onAppear { withAnimation(reduce ? nil : .easeOut(duration: 0.9)) { shown = true } }
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
    private var body0: some View { Image(systemName: icon).font(.subheadline.weight(.semibold)).foregroundStyle(tint).frame(width: 36, height: 36).background(tint.opacity(0.12), in: .circle) }
}

/// Nút chính xanh đậm full chiều ngang.
struct PrimaryButton: View {
    let title: String; var icon: String? = nil; var tint: Color = .brandDeep; let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) { if let icon { Image(systemName: icon) }; Text(title) }.font(.body.bold()).foregroundStyle(.white)
                .frame(maxWidth: .infinity).padding(.vertical, 14).background(tint, in: .rect(cornerRadius: 12))
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
    func cardShadow() -> some View { modifier(CardShadow()) }
    func cardSurface(radius: CGFloat = 16) -> some View { background(Palette.card, in: .rect(cornerRadius: radius)).overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(Palette.line, lineWidth: 1)) }
}

/// Nhãn nhỏ "Dữ liệu minh họa" kiểu ảnh — dùng cho chỗ chưa có dữ liệu thật.
struct Hint: View { let text: String; var body: some View { Text(text).font(.caption2.weight(.medium)).foregroundStyle(Color.inkSoft).padding(.horizontal, 6).padding(.vertical, 3).background(Palette.fill, in: .capsule) } }

/// Thẻ có tiêu đề (tương thích màn cũ).
struct Card<Content: View>: View {
    let title: String; @ViewBuilder let content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 8) { Text(title).font(.callout.weight(.bold)).foregroundStyle(Color.ink); content }
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface()
    }
}
struct MiniStat: View {
    let title: String; let value: String; var tint: Color = .ink
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value).font(.headline).monospacedDigit().foregroundStyle(tint).minimumScaleFactor(0.7).lineLimit(1).rolling(value)
            Text(title).font(.caption2).foregroundStyle(Color.inkSoft).lineLimit(1)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(12).cardSurface(radius: 12)
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
        } label: { HStack(spacing: 5) { Image(systemName: "square.and.arrow.down"); Text("Xuất Excel") }.font(.caption.weight(.semibold)).foregroundStyle(Color.ink).padding(.horizontal, 10).padding(.vertical, 7).background(Color.card, in: .rect(cornerRadius: 8)).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.black.opacity(0.12))) }
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
            Text(text).font(.subheadline.weight(.semibold)).foregroundStyle(textColor)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 4)
            if kind == .failed, let retry {
                Button { start(retry) } label: {
                    HStack(spacing: 4) {
                        if retrying { ProgressView().controlSize(.mini).tint(onDark ? Color.brandDeep : Color.white) }
                        else { Image(systemName: "arrow.clockwise").font(.caption.weight(.bold)) }
                        Text("Thử lại").font(.footnote.weight(.bold))
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
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(strokeColor))
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
            Image(systemName: "tray").font(.subheadline.weight(.semibold)).foregroundStyle(onDark ? Color.white.opacity(0.7) : Color.inkSoft)
        case .failed:
            Image(systemName: "wifi.exclamationmark").font(.subheadline.weight(.semibold)).foregroundStyle(onDark ? Color.lime : Color.warn)
        }
    }
    private var textColor: Color {
        if onDark { return Color.white.opacity(0.9) }
        return kind == .failed ? Color.ink : Color.inkSoft
    }
    private var strokeColor: Color {
        if onDark { return Color.white.opacity(0.15) }
        return kind == .failed ? Palette.warn : Palette.line
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
