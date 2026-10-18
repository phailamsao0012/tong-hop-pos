import SwiftUI
import Charts

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
            Image(systemName: "info.circle").font(.system(size: 18)).foregroundStyle(Palette.muted)
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
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Đóng") { dismiss() } } }
        }.tint(Palette.accent).presentationDetents([.medium, .large])
        .presentationCornerRadius(28).presentationBackground(Palette.card).presentationDragIndicator(.visible)
    }
}

struct GroupTitle: View {
    let title: String
    var subtitle: String? = nil
    var info: InfoText? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack { Text(title).font(.title2.weight(.bold)); if let info { InfoButton(info) } }
            if let subtitle { Text(subtitle).font(.footnote).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true) }
        }.foregroundStyle(Palette.ink)
    }
}

/// Nhãn dùng được cho cả Menu lẫn Button; bên gọi giữ hành vi và nhãn phạm vi VoiceOver.
struct Pill: View {
    let title: String
    var icon: String? = nil
    var on = false
    var chevron = true
    var body: some View {
        HStack(spacing: 8) {
            if let icon { Image(systemName: icon).font(.system(size: 15)).foregroundStyle(Palette.muted) }
            Text(title).font(.subheadline.weight(.semibold))
            if chevron { Image(systemName: "chevron.down").font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.muted) }
        }.foregroundStyle(on ? Palette.accent : Palette.ink)
        .padding(.horizontal, 14).padding(.vertical, 10).frame(minHeight: 40)
        .background(Palette.wash, in: .capsule)
        .overlay { Capsule().strokeBorder(on ? Palette.accent : .clear, lineWidth: 1.5) }
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

struct FilterBar<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 8) { content }.padding(.horizontal, 16) }.padding(.horizontal, -16)
    }
}

struct ProductPill: View {
    @Binding var selection: String
    private var title: String { selection == "gentadox" ? "Gentadox" : selection == "skgk" ? "SK + GK" : "Tất cả nhóm" }
    var body: some View {
        Menu {
            ForEach([("all", "Tất cả nhóm"), ("gentadox", "Gentadox"), ("skgk", "SK + GK")], id: \.0) { key, name in
                Button { selection = key } label: { if selection == key { Label(name, systemImage: "checkmark") } else { Text(name) } }
            }
        } label: { Pill(title: title, icon: "shippingbox", on: selection != "all") }
        .accessibilityLabel("Nhóm đơn: \(title)").sensoryFeedback(.selection, trigger: selection)
    }
}

struct ListRow<Trailing: View>: View {
    let icon: String?
    let tint: Color
    let title: String
    let subtitle: String?
    var filledIcon = false
    var chevron = true
    @ViewBuilder let trailing: Trailing
    var body: some View {
        HStack(spacing: 12) {
            if let icon { IconSquare(icon, tint: tint, size: 30, filled: filledIcon) }
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.body).foregroundStyle(Palette.ink)
                if let subtitle { Text(subtitle).font(.footnote).foregroundStyle(Palette.muted) }
            }
            Spacer(minLength: 8)
            trailing.font(.callout.weight(.semibold)).foregroundStyle(Palette.ink)
            if chevron { Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.muted).accessibilityHidden(true) }
        }.frame(minHeight: 52).padding(.trailing, 14)
        .overlay(alignment: .bottom) { Rectangle().fill(Palette.line.opacity(0.4)).frame(height: 1).padding(.leading, icon == nil ? 0 : 42) }
    }
}

struct ListGroup<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View { VStack(spacing: 0) { content }.padding(.leading, 14).cardSurface() }
}

private struct Surface: ViewModifier {
    var radius: CGFloat = 24
    var hero = false
    var tint: Color = Palette.accent
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        let dark = scheme == .dark
        content.background {
            GeometryReader { g in
                ZStack {
                    LinearGradient(colors: hero ? (dark ? [Palette.hero, Palette.bg] : [Palette.heroStart, Palette.heroEnd]) : [Palette.card, Palette.cardEnd], startPoint: hero ? (dark ? UnitPoint(x: 0.289, y: 0.047) : UnitPoint(x: 0.213, y: 0.090)) : UnitPoint(x: 0.25, y: 0.067), endPoint: hero ? (dark ? UnitPoint(x: 0.711, y: 0.953) : UnitPoint(x: 0.787, y: 0.910)) : UnitPoint(x: 0.75, y: 0.933))
                    if hero {
                        RadialGradient(colors: [dark ? tint.opacity(0.23) : Palette.heroGlow, .clear], center: .topTrailing, startRadius: 0, endRadius: g.size.width * (dark ? 0.68 : 0.72))
                    } else if dark {
                        LinearGradient(colors: [.white.opacity(0.035), .clear], startPoint: UnitPoint(x: 0.371, y: 0.017), endPoint: UnitPoint(x: 0.629, y: 0.983))
                    }
                }
            }
            .clipShape(.rect(cornerRadius: radius))
        }
        .overlay {
            RoundedRectangle(cornerRadius: radius).strokeBorder(LinearGradient(stops: [.init(color: .white.opacity(dark ? (hero ? 0.25 : 0.15) : 1), location: 0), .init(color: .clear, location: 0.5)], startPoint: .top, endPoint: .bottom), lineWidth: 1)
                .allowsHitTesting(false)
        }
        .shadow(color: dark ? .black.opacity(hero ? 0.20 : 0.13) : Color(hex: hero ? 0x153E23 : 0x143823).opacity(hero ? 0.11 : 0.07), radius: hero ? 18 : 12, y: hero ? 18 : 10)
    }
}

private struct CardShadow: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        content.shadow(color: scheme == .dark ? .black.opacity(0.13) : Color(hex: 0x143823).opacity(0.07), radius: 12, y: 10)
    }
}

extension View {
    func cardSurface(radius: CGFloat = 24) -> some View { modifier(Surface(radius: radius)) }
    func heroSurface(tint: Color = Palette.accent) -> some View {
        padding(20).foregroundStyle(Palette.heroInk).modifier(Surface(hero: true, tint: tint))
    }
    func tileSurface() -> some View { padding(12).background(Palette.wash, in: .rect(cornerRadius: 18)) }
}

struct DeltaPill: View {
    let text: String
    var good: Bool? = nil
    var onHero = false
    init(_ text: String, good: Bool? = nil, onHero: Bool = false) { self.text = text; self.good = good; self.onHero = onHero }
    private var down: Bool { text.hasPrefix("-") || text.hasPrefix("−") }
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: down ? "arrow.down.right" : "arrow.up.right").font(.footnote.weight(.bold))
            Text(text).font(.footnote.weight(.bold))
        }
        .foregroundStyle((good ?? !down) ? Palette.good : Palette.bad)
        .padding(.vertical, 5).padding(.horizontal, 9)
        .background(onHero ? Palette.heroInk.opacity(0.08) : Palette.wash, in: .capsule)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(down ? "giảm" : "tăng") \(text.trimmingCharacters(in: CharacterSet(charactersIn: "+-−")))")
    }
}

struct IconSquare: View {
    let icon: String
    var tint: Color
    var size: CGFloat = 32
    var filled = false
    init(_ icon: String, tint: Color, size: CGFloat = 32, filled: Bool = false) { self.icon = icon; self.tint = tint; self.size = size; self.filled = filled }
    var body: some View {
        MetricIcon(icon, size: size * 0.48).foregroundStyle(filled ? .white : tint)
            .frame(width: size, height: size).background(filled ? tint : Palette.wash, in: .rect(cornerRadius: size * 0.28))
            .accessibilityHidden(true)
    }
}

struct StatTile: View {
    let label: String
    let value: String
    var unit: String? = nil
    var money: Double? = nil
    var progress: Double? = nil
    var tint: Color = Palette.accent
    var delta: String? = nil
    var deltaGood: Bool? = nil
    var note: String? = nil
    @Environment(\.thinking) private var thinking
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.footnote).foregroundStyle(Palette.muted).lineLimit(2)
            MoneyNumber(value: value, unit: unit, money: money).loadingPlaceholder(thinking)
            if let delta { DeltaPill(delta, good: deltaGood).loadingPlaceholder(thinking) }
            if let note { Text(note).font(.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).loadingPlaceholder(thinking) }
            if let progress { Bar(value: progress, tint: tint, height: 4) }
        }.frame(maxWidth: .infinity, alignment: .leading).tileSurface()
    }
}

private struct MoneyNumber: View {
    let value: String
    var unit: String? = nil
    var money: Double? = nil
    var size: CGFloat = 26
    var body: some View {
        let pair = money.map(Fmt.compactMoney)
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(pair?.value ?? value).font(.system(size: size, weight: .heavy, design: .rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.5).rolling(pair?.value ?? value)
            if let u = pair?.unit ?? unit { Text(u).font(.system(size: 13, weight: .bold, design: .rounded)).foregroundStyle(Palette.muted) }
        }.foregroundStyle(Palette.ink)
        .accessibilityElement(children: .ignore).accessibilityLabel(money.map(Fmt.money) ?? [value, unit].compactMap { $0 }.joined(separator: " "))
    }
}

struct StatCell: View {
    let label: String
    let value: String
    var unit: String? = nil
    var note: String? = nil
    var tone: Color? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.footnote).foregroundStyle(Palette.muted)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value).font(.system(.title3, design: .rounded, weight: .heavy)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.5).rolling(value)
                if let unit { Text(unit).font(.caption) }
            }.foregroundStyle(tone ?? Palette.ink)
            if let note { Text(note).font(.caption).foregroundStyle(Palette.muted) }
        }.frame(maxWidth: .infinity, alignment: .leading).tileSurface()
    }
}

struct PairBars: View {
    let prev: Double; let prevText: String; let prevLabel: String
    let cur: Double; let curText: String; let curLabel: String; let tint: Color
    var body: some View {
        VStack(spacing: 12) {
            row(prevLabel, prevText, prev, Palette.muted.opacity(0.6))
            row(curLabel, curText, cur, tint)
        }
    }
    private func row(_ label: String, _ text: String, _ value: Double, _ color: Color) -> some View {
        VStack(spacing: 6) {
            HStack { Text(label).font(.footnote.weight(.semibold)); Spacer(); Text(text).font(.footnote.weight(.bold)) }
            GeometryReader { g in
                Capsule().fill(tint.opacity(0.15)).overlay(alignment: .leading) {
                    Capsule().fill(color).frame(width: g.size.width * min(1, max(0, value / (max(prev, cur) > 0 ? max(prev, cur) : 1))))
                }
            }.frame(height: 7)
        }.foregroundStyle(Palette.ink).accessibilityElement(children: .combine)
    }
}

struct OrbitArc<Center: View>: View {
    let today: Double
    let yesterday: Double?
    var tint: Color = Palette.accent
    @ViewBuilder let center: Center
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        GeometryReader { g in
            let side = min(260, g.size.width)
            let radius = (side - 24) / 2
            let scale = max(today, yesterday ?? 0) > 0 ? max(today, yesterday ?? 0) : 1
            let fraction = min(1, max(0, today / scale)) * (shown || reduce ? 1 : 0)
            ZStack {
                arc(1).stroke(tint.opacity(0.12), style: StrokeStyle(lineWidth: 10, lineCap: .round))
                if let yesterday {
                    arc(min(1, max(0, yesterday / scale))).stroke(Palette.muted.opacity(0.7), style: StrokeStyle(lineWidth: 3, lineCap: .round)).padding(16)
                }
                arc(fraction).stroke(tint, style: StrokeStyle(lineWidth: 10, lineCap: .round)).shadow(color: tint.opacity(0.6), radius: 8)
                OrbitDot(fraction: fraction, radius: radius, tint: tint)
                center.font(.system(size: 56, weight: .heavy, design: .rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.5).frame(maxWidth: (side - 56) * 0.72)
            }.padding(12).frame(width: side, height: side).frame(maxWidth: .infinity)
        }.frame(minWidth: 220, maxWidth: 260).aspectRatio(1, contentMode: .fit)
        .onAppear { withAnimation(reduce ? nil : .easeOut(duration: 0.9)) { shown = true } }
    }
    private func arc(_ fraction: Double) -> some Shape {
        Circle().trim(from: 0, to: 0.75 * fraction).rotation(.degrees(135))
    }
}

private struct OrbitDot: View, Animatable {
    var fraction: Double
    let radius: CGFloat
    let tint: Color
    var animatableData: Double { get { fraction } set { fraction = newValue } }
    var body: some View {
        let angle = (135 + 270 * fraction) * Double.pi / 180
        Circle().fill(tint).frame(width: 12, height: 12).shadow(color: tint, radius: 10)
            .offset(x: radius * cos(angle), y: radius * sin(angle))
            .accessibilityHidden(true)
    }
}

struct ColumnBar: View {
    let height: CGFloat
    let tint: Color
    var width: CGFloat = 14
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        UnevenRoundedRectangle(topLeadingRadius: 7, topTrailingRadius: 7)
            .fill(LinearGradient(colors: [tint, tint.opacity(0.35)], startPoint: .top, endPoint: .bottom))
            .frame(width: width, height: max(0, height)).scaleEffect(y: shown || reduce ? 1 : 0, anchor: .bottom)
            .onAppear { withAnimation(reduce ? nil : .easeOut(duration: 0.7)) { shown = true } }
    }
}

struct SegRing: View {
    let parts: [(label: String, value: Double, valueText: String, color: Color)]
    let center: String
    var caption: String? = nil
    var size: CGFloat = 88
    var body: some View {
        HStack(spacing: 14) {
            VStack(spacing: 4) {
                Chart(Array(parts.enumerated()), id: \.offset) { _, p in
                    SectorMark(angle: .value("Phần", max(0, p.value)), innerRadius: .ratio(0.74), angularInset: 1.5).cornerRadius(3).foregroundStyle(p.color)
                }.frame(width: size, height: size)
                .overlay { Text(center).font(.system(.title3, design: .rounded, weight: .heavy)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.5) }
                .accessibilityHidden(true)
                if let caption { Text(caption).font(.caption).foregroundStyle(Palette.muted) }
            }
            VStack(spacing: 7) {
                ForEach(Array(parts.enumerated()), id: \.offset) { _, p in
                    HStack { Circle().fill(p.color).frame(width: 7, height: 7); Text(p.label).font(.footnote); Spacer(); Text(p.valueText).font(.footnote.weight(.bold)) }.accessibilityElement(children: .combine)
                }
            }
        }.foregroundStyle(Palette.ink).accessibilityLabel(center)
    }
}

struct SplitBar: View {
    let parts: [(label: String, value: Double, valueText: String, color: Color)]
    private var total: Double { max(1, parts.reduce(0) { $0 + max(0, $1.value) }) }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            WeightedRow(weights: parts.filter { $0.value > 0 }.map { $0.value / total }) {
                    ForEach(Array(parts.enumerated()).filter { $0.element.value > 0 }, id: \.offset) { _, p in
                            VStack(alignment: .leading, spacing: 6) {
                                Capsule().fill(p.color).frame(height: 8)
                                if p.value / total >= 0.12 { Text(p.valueText.isEmpty ? p.label : "\(p.label) · \(p.valueText)").font(.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true) }
                            }
                    }
            }
            ForEach(Array(parts.enumerated()), id: \.offset) { _, p in
                if p.value / total < 0.12 { Label { Text(p.valueText.isEmpty ? p.label : "\(p.label) · \(p.valueText)") } icon: { Circle().fill(p.color).frame(width: 7, height: 7) }.font(.caption).foregroundStyle(Palette.muted) }
            }
        }
    }
}

/// Cột tỷ trọng đo chiều cao nhãn theo cỡ chữ máy, không cắt nhãn dài.
private struct WeightedRow: Layout {
    let weights: [Double]
    private func widths(_ width: CGFloat) -> [CGFloat] {
        let available = max(0, width - CGFloat(max(0, weights.count - 1)) * 3)
        let sum = max(1e-9, weights.reduce(0, +))
        return weights.map { available * $0 / sum }
    }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 260
        let sizes = widths(width)
        let height = subviews.enumerated().map { i, view in view.sizeThatFits(ProposedViewSize(width: sizes[i], height: nil)).height }.max() ?? 0
        return CGSize(width: width, height: height)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let sizes = widths(bounds.width)
        var x = bounds.minX
        for (i, view) in subviews.enumerated() {
            view.place(at: CGPoint(x: x, y: bounds.minY), anchor: .topLeading, proposal: ProposedViewSize(width: sizes[i], height: nil))
            x += sizes[i] + 3
        }
    }
}

struct RankRow<Trailing: View>: View {
    let rank: Int?
    let name: String
    let valueText: String
    let fraction: Double
    let tint: Color
    var highlight = false
    var sub: String? = nil
    var markers: [(Double, Color)] = []
    @ViewBuilder var trailing: Trailing
    var body: some View {
        HStack(spacing: 10) {
            Avatar(name: name, size: 36, tint: tint)
                .overlay { Circle().stroke(highlight ? tint : .clear, lineWidth: 2).shadow(color: highlight ? tint.opacity(0.5) : .clear, radius: 6) }
            VStack(alignment: .leading, spacing: 6) {
                HStack { Text(rank.map { "\($0) · \(name)" } ?? name).font(.subheadline.weight(.semibold)); Spacer(); Text(valueText).font(.subheadline.weight(.bold)); trailing }
                if let sub { Text(sub).font(.caption).foregroundStyle(Palette.muted) }
                Bar(value: fraction, tint: tint).overlay {
                    GeometryReader { g in
                        ForEach(Array(markers.enumerated()), id: \.offset) { _, marker in Rectangle().fill(marker.1).frame(width: 2, height: 10).position(x: g.size.width * min(1, max(0, marker.0)), y: 3) }
                    }
                }
            }
        }.foregroundStyle(Palette.ink)
    }
}

extension RankRow where Trailing == EmptyView {
    init(rank: Int?, name: String, valueText: String, fraction: Double, tint: Color, highlight: Bool = false, sub: String? = nil, markers: [(Double, Color)] = []) {
        self.rank = rank; self.name = name; self.valueText = valueText; self.fraction = fraction; self.tint = tint; self.highlight = highlight; self.sub = sub; self.markers = markers; self.trailing = EmptyView()
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
                Text("MEGATECH").font(.system(size: 19, weight: .heavy, design: .rounded)).tracking(0.5).foregroundStyle(.white)
                Text(tagline).font(.caption).foregroundStyle(.white.opacity(0.75))
            }
            Spacer()
            // Ô trạng thái đồng bộ chạm được (kế hoạch 1.6): mở Thông báo, cuộn tới khối "Đồng bộ Pancake" (giờ đồng bộ từng POS).
            NavigationLink(value: Route.alertsSync) {
                HStack(spacing: 6) {
                    Circle().fill(sync.tone).frame(width: 7, height: 7)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(sync.title).font(.footnote.weight(.semibold)).foregroundStyle(.white)
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
    var subtitle: String? = nil
    var info: InfoText? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
        HStack {
            Text(title).font(.title3.weight(.bold)).foregroundStyle(Color.ink)
            if let info { InfoButton(info) }
            if let count { Text("\(count)").font(.caption2.weight(.bold)).foregroundStyle(.white).padding(.horizontal, 6).padding(.vertical, 2).background(Palette.badge, in: .capsule) }
            Spacer()
            if let action {
                if let route { NavigationLink(value: route) { HStack(spacing: 2) { Text(action); Image(systemName: "chevron.right").font(.caption2.weight(.bold)) }.font(.subheadline.weight(.semibold)).foregroundStyle(Palette.accent) } }
                else { Text(action).font(.subheadline.weight(.semibold)).foregroundStyle(Palette.accent) }
            }
        }
        if let subtitle { Text(subtitle).font(.footnote).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true) }
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
    var unit: String? = nil
    var money: Double? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                IconSquare(icon, tint: tint, size: 28)
                Text(label).font(.footnote).foregroundStyle(Palette.muted).lineLimit(2)
            }
            MoneyNumber(value: value, unit: unit, money: money).loadingPlaceholder(thinking)
            if let delta { DeltaPill(delta, good: deltaGood).loadingPlaceholder(thinking) }
            if let note { Text(note).font(.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).loadingPlaceholder(thinking) }
        }
        .frame(maxWidth: .infinity, alignment: .leading).tileSurface()
    }
}

/// Ô chỉ số lớn không icon (Tổng ứng viên 128 · Dữ liệu…).
struct StatCard: View {
    let icon: String; var tint: Color = .brand; let label: String; let value: String; var sub: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                MetricIcon(icon, size: 13).foregroundStyle(tint).frame(width: 28, height: 28).background(tint.opacity(0.13), in: .rect(cornerRadius: 8))
                Text(label).font(.footnote).foregroundStyle(Color.inkSoft).lineLimit(1)
            }
            Text(value).font(.system(size: 40, weight: .heavy, design: .rounded)).foregroundStyle(Color.ink).monospacedDigit().minimumScaleFactor(0.5).lineLimit(1).rolling(value)
            if let sub { Text(sub).font(.caption).foregroundStyle(Color.inkSoft).lineLimit(1) }
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
        Text(initials.isEmpty ? "?" : initials).font(.system(size: size * 0.36, weight: .bold, design: .rounded)).foregroundStyle(tint)
            .frame(width: size, height: size).background(Palette.wash, in: .circle)
    }
}

enum Tone { case green, red, orange, blue, gray, purple
    var color: Color { switch self { case .green: return Palette.good; case .red: return Palette.bad; case .orange: return Palette.orange; case .blue: return Palette.info; case .gray: return Palette.ink3; case .purple: return Palette.purple } }
}
/// Chip trạng thái nhỏ: "Đã liên hệ", "Chưa liên hệ", "Ưu tiên cao"…
struct Tag: View {
    let text: String; var tone: Tone = .green; var dot = false
    var tint: Color? = nil
    private var color: Color { tint ?? tone.color }
    var body: some View {
        HStack(spacing: 4) { if dot { Circle().fill(color).frame(width: 6, height: 6) }; Text(text) }
            .font(.caption.weight(.bold)).foregroundStyle(color)
            .padding(.horizontal, 7).padding(.vertical, 3).background(color.opacity(0.16), in: .capsule)
    }
}

/// Chip lọc: chọn = xanh đậm nền trắng chữ; không chọn = trắng viền.
struct FilterChip: View {
    let label: String; let on: Bool; var badge: Int? = nil; var chevron = false; let tap: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        Button(action: tap) {
            HStack(spacing: 5) {
                Text(label).font(.subheadline.weight(.semibold))
                if let badge, badge > 0 { Text("\(badge)").font(.caption2.weight(.bold)).foregroundStyle(.white).padding(4).background(Palette.badge, in: .circle) }
                if chevron { Image(systemName: "chevron.down").font(.caption2.weight(.bold)) }
            }
            .foregroundStyle(on ? Palette.card : Palette.muted).padding(.horizontal, 12).padding(.vertical, 7)
            .background(on ? Palette.ink : Palette.wash, in: .capsule)
            .animation(reduce ? nil : .snappy(duration: 0.25), value: on)
        }.buttonStyle(.plain).accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// Bộ chọn phân đoạn kiểu ảnh: nền xám nhạt, mục chọn xanh đậm.
struct Segmented<T: Hashable>: View {
    @Binding var selection: T; let options: [(T, String)]
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        HStack(spacing: 3) {
            ForEach(options, id: \.0) { v, label in
                Button { withAnimation(reduce ? nil : .snappy(duration: 0.25)) { selection = v } } label: {
                    Text(label).font(.footnote.weight(.bold)).lineLimit(1).minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, minHeight: 36)
                        .background {
                            if selection == v { RoundedRectangle(cornerRadius: 10).fill(Palette.card).shadow(color: .black.opacity(0.13), radius: 4, y: 2) }
                        }
                        .foregroundStyle(selection == v ? Palette.ink : Palette.muted)
                }.buttonStyle(.plain).accessibilityAddTraits(selection == v ? .isSelected : [])
            }
        }
        .padding(3).background(Palette.wash, in: .rect(cornerRadius: 12))
        .sensoryFeedback(.selection, trigger: selection)
    }
}

/// Vòng tròn tiến độ (72%, 78%).
struct Ring: View {
    let value: Double; var size: CGFloat = 64; var line: CGFloat = 7; var tint: Color = .good; var label: String? = nil
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        ZStack {
            Circle().stroke(tint.opacity(0.15), lineWidth: line)
            Circle().trim(from: 0, to: shown || reduce ? min(1, max(0, value)) : 0).stroke(tint, style: StrokeStyle(lineWidth: line, lineCap: .round)).rotationEffect(.degrees(-90))
            Text(label ?? Fmt.pct0(value * 100)).font(.system(size: size * 0.24, weight: .heavy, design: .rounded)).foregroundStyle(Color.ink).monospacedDigit().lineLimit(1).minimumScaleFactor(0.5)
        }
        .frame(width: size, height: size)
        .onAppear { withAnimation(reduce ? nil : .spring(duration: 0.8, bounce: 0.1)) { shown = true } }
        .animation(reduce ? nil : .spring(duration: 0.6), value: value)
        .accessibilityElement(children: .ignore).accessibilityLabel(label ?? Fmt.pct0(value * 100))
    }
}

/// Dòng phễu: nhãn · thanh · số (Tổng khách đủ điều kiện 320…).
struct FunnelLine: View {
    let label: String; let n: Double; let of: Double; var tint: Color = .good
    var body: some View {
        VStack(spacing: 6) {
            HStack { Text(label).font(.footnote.weight(.semibold)); Spacer(); Text(Fmt.int(n)).font(.footnote.weight(.bold)).monospacedDigit() }
            Bar(value: of > 0 ? n / of : 0, tint: tint, height: 7)
        }.foregroundStyle(Palette.ink).accessibilityElement(children: .combine)
    }
}

/// Thanh trạng thái nhiều màu + chú giải.
struct StackedBar: View {
    let parts: [(String, Double, Color)]
    var body: some View {
        SplitBar(parts: parts.map { (label: $0.0, value: $0.1, valueText: "", color: $0.2) })
    }
}

/// Huy chương hạng 1-2-3.
struct Medal: View {
    let rank: Int
    var body: some View {
        let c = rank == 1 ? Palette.gold : rank == 2 ? Palette.silver : rank == 3 ? Palette.bronze : Palette.fill
        let ink = rank == 1 ? Palette.goldInk : rank == 2 ? Palette.silverInk : rank == 3 ? Palette.bronzeInk : Palette.muted
        Text("\(rank)").font(.caption.weight(.bold)).foregroundStyle(ink).frame(width: 22, height: 22).background(c, in: .circle)
    }
}

/// Đường gấp khúc đơn giản có tô nền (xu hướng doanh thu).
struct LineChart: View {
    let points: [(String, Double)]
    var tint: Color = .brand
    var height: CGFloat = 140
    var highlightMax = true
    var value: (Double) -> String = Fmt.short
    var previous: [(String, Double)]? = nil
    @State private var chon: Int?
    @Environment(\.colorScheme) private var scheme
    private var ticks: [Int] { Array(Set([0, points.count / 3, 2 * points.count / 3, max(0, points.count - 1)])).sorted() }
    var body: some View {
        Chart {
            ForEach(points.indices, id: \.self) { i in
                AreaMark(x: .value("Mốc", i), y: .value("Số", points[i].1))
                    .interpolationMethod(.monotone)
                    .foregroundStyle(LinearGradient(colors: [tint.opacity(scheme == .dark ? 0.35 : 0.25), .clear], startPoint: .top, endPoint: .bottom))
                LineMark(x: .value("Mốc", i), y: .value("Số", points[i].1), series: .value("Kỳ", "Hiện tại"))
                    .interpolationMethod(.monotone).lineStyle(StrokeStyle(lineWidth: 2.5))
                    .foregroundStyle(tint)
                if i == points.count - 1 {
                    PointMark(x: .value("Mốc", i), y: .value("Số", points[i].1)).symbolSize(50).foregroundStyle(tint)
                        .annotation(position: .top, overflowResolution: .init(x: .fit(to: .chart), y: .fit(to: .chart))) {
                            Text(value(points[i].1)).font(.caption.weight(.bold)).foregroundStyle(Palette.ink)
                        }
                }
            }
            if let previous {
                ForEach(previous.indices, id: \.self) { i in
                    LineMark(x: .value("Mốc", i), y: .value("Số", previous[i].1), series: .value("Kỳ", "Trước"))
                        .interpolationMethod(.monotone).lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4, 4])).foregroundStyle(Palette.muted.opacity(0.5))
                }
            }
            if let chon, points.indices.contains(chon) {
                RuleMark(x: .value("Mốc", chon)).foregroundStyle(Palette.muted).lineStyle(StrokeStyle(lineWidth: 1))
                PointMark(x: .value("Mốc", chon), y: .value("Số", points[chon].1)).foregroundStyle(tint).symbolSize(50)
                    .annotation(position: .top, overflowResolution: .init(x: .fit(to: .chart), y: .fit(to: .chart))) {
                        Text("\(points[chon].0) · \(value(points[chon].1))").font(.caption.weight(.bold)).foregroundStyle(Palette.ink).padding(8).background(Palette.card, in: .rect(cornerRadius: 10))
                    }
            }
        }
        .chartXAxis {
            AxisMarks(values: ticks) { axis in
                AxisValueLabel {
                    if let i = axis.as(Int.self), points.indices.contains(i) { Text(points[i].0).font(.caption2.weight(.semibold)).foregroundStyle(Palette.muted) }
                }
            }
        }
        .chartPlotStyle { $0.shadow(color: tint.opacity(0.5), radius: 6) }
        .chartYAxis(.hidden).chartXSelection(value: $chon)
        .sensoryFeedback(.selection, trigger: chon).frame(height: height)
        .accessibilityLabel(points.map { "\($0.0): \(value($0.1))" }.joined(separator: ", "))
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
    let title: String; var icon: String? = nil; var tint: Color = .brandDeep
    var role: ButtonRole? = nil
    let action: () -> Void
    var body: some View {
        Button(role: role, action: action) {
            HStack(spacing: 8) { if let icon { Image(systemName: icon) }; Text(title) }.font(.headline).foregroundStyle(role == .destructive ? Palette.bad : .white)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background {
                    if role != .destructive {
                        RoundedRectangle(cornerRadius: 16).fill(LinearGradient(colors: tint == Color.brandDeep ? [Palette.brandTop, Palette.brand] : [tint, tint], startPoint: .top, endPoint: .bottom))
                    }
                }
                .overlay { if role == .destructive { RoundedRectangle(cornerRadius: 16).strokeBorder(Palette.bad, lineWidth: 1) } }
                .shadow(color: role == .destructive ? .clear : Palette.brand.opacity(0.21), radius: 8, y: 6)
        }.buttonStyle(PressButtonStyle())
    }
}

private struct PressButtonStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduce
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.scaleEffect(configuration.isPressed && !reduce ? 0.97 : 1)
            .animation(reduce ? nil : .easeOut(duration: 0.15), value: configuration.isPressed)
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
}

/// Nhãn nhỏ "Dữ liệu minh họa" kiểu ảnh — dùng cho chỗ chưa có dữ liệu thật.
struct Hint: View { let text: String; var body: some View { Text(text).font(.caption2.weight(.medium)).foregroundStyle(Palette.ink3).padding(.horizontal, 6).padding(.vertical, 3).background(Palette.fill, in: .capsule) } }

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
            Text(value).font(.system(size: 26, weight: .heavy, design: .rounded)).monospacedDigit().foregroundStyle(tint).minimumScaleFactor(0.5).lineLimit(1).rolling(value)
            Text(title).font(.caption).foregroundStyle(Color.inkSoft).lineLimit(1)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(12).cardSurface()
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
        } label: { HStack(spacing: 5) { Image(systemName: "square.and.arrow.down"); Text("Xuất Excel") }.font(.footnote.weight(.semibold)).foregroundStyle(Color.ink).padding(.horizontal, 10).padding(.vertical, 7).background(Color.card, in: .rect(cornerRadius: 8)).overlay(RoundedRectangle(cornerRadius: 8).stroke(Palette.line)) }
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
        Group {
            if compact || onDark {
                HStack(spacing: 10) {
                    icon
                    Text(text).font(.subheadline.weight(.semibold)).foregroundStyle(textColor).fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 4)
                    retryButton
                }.padding(12).background(onDark ? Palette.heroInk.opacity(0.08) : Palette.card, in: .rect(cornerRadius: 16))
            } else {
                VStack(spacing: 12) {
                    if kind == .loading {
                        Skeleton(height: 56)
                    } else {
                        icon.frame(width: 56, height: 56)
                            .overlay { Circle().strokeBorder(kind == .failed ? Palette.warn : Palette.line, lineWidth: 2) }
                    }
                    Text(text).font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink).multilineTextAlignment(.center)
                    retryButton
                }.frame(maxWidth: .infinity).padding(20).cardSurface()
            }
        }
        #if DEBUG
        // Lượt tự xem MEGATECH_TOUR=reload "bấm" mọi nút Thử lại đang hiện (máy ảo không chạm được).
        .onChange(of: DebugRetry.shared.tick) { _, _ in
            if kind == .failed, let retry, !retrying { start(retry) }
        }
        #endif
    }

    @ViewBuilder private var retryButton: some View {
        if kind == .failed, let retry {
            Button { start(retry) } label: {
                HStack(spacing: 6) {
                    if retrying { ProgressView().tint(onDark ? Palette.heroInk : .white) }
                    Text("Thử lại").font(.headline)
                }
                .foregroundStyle(onDark ? Palette.heroInk : .white)
                .padding(.horizontal, 14).frame(minHeight: compact || onDark ? 36 : 50)
                .frame(maxWidth: compact || onDark ? nil : .infinity)
                .background(onDark ? Palette.heroInk.opacity(0.12) : Palette.brand, in: .rect(cornerRadius: compact || onDark ? 18 : 16))
            }.buttonStyle(PressButtonStyle()).disabled(retrying)
        }
    }
    @ViewBuilder private var icon: some View {
        switch kind {
        case .loading: ProgressView().tint(onDark ? Palette.heroInk : Palette.accent)
        case .empty: Image(systemName: "tray").font(.system(size: 24)).foregroundStyle(onDark ? Palette.heroMuted : Palette.muted)
        case .failed: Image(systemName: "wifi.slash").font(.system(size: 24)).foregroundStyle(Palette.warn)
        }
    }
    private var textColor: Color { onDark ? Palette.heroInk : Palette.ink }
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
