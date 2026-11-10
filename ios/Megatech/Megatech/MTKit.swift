import SwiftUI
import Charts

enum MT {
    static let gutter: CGFloat = 16, cardGap: CGFloat = 12, cardPad: CGFloat = 16, cellGap: CGFloat = 8
    static let rCard: CGFloat = 16, rCell: CGFloat = 12, rSeg: CGFloat = 11, rSheet: CGFloat = 24
    static let screenTitle: Font = .title2.bold()
    enum TextStyle { case heroNumber, cardMetric, cardHeader, body, caption }
    static let heroNumber: TextStyle = .heroNumber
    static let cardMetric: TextStyle = .cardMetric
    static let cardHeader: TextStyle = .cardHeader
    static let body: TextStyle = .body
    static let caption: TextStyle = .caption
}

/// Each size follows its semantic Dynamic Type curve on iOS 17.
private struct MTFont: ViewModifier {
    let style: MT.TextStyle
    @ScaledMetric(relativeTo: .largeTitle) private var hero: CGFloat = 30
    @ScaledMetric(relativeTo: .headline) private var metric: CGFloat = 17
    @ScaledMetric(relativeTo: .subheadline) private var header: CGFloat = 15
    @ScaledMetric(relativeTo: .footnote) private var bodySize: CGFloat = 12
    @ScaledMetric(relativeTo: .caption) private var caption: CGFloat = 11
    private var font: Font {
        switch style {
        case .heroNumber: return .system(size: hero, weight: .heavy, design: .rounded).monospacedDigit()
        case .cardMetric: return .system(size: metric, weight: .bold, design: .rounded).monospacedDigit()
        case .cardHeader: return .system(size: header, weight: .bold)
        case .body: return .system(size: bodySize, weight: .medium).monospacedDigit()
        case .caption: return .system(size: caption, weight: .medium)
        }
    }
    func body(content: Content) -> some View { content.font(font) }
}
extension View {
    func mtFont(_ style: MT.TextStyle) -> some View { modifier(MTFont(style: style)) }
}

struct MTMetricHeroCard: View {
    let label: String
    let value: String
    let scope: String
    var comparison: String? = nil
    var comparisonGood: Bool? = nil
    var info: InfoText? = nil
    var isPrivacyMasked = false
    var action: (() -> Void)? = nil
    private var displayed: String { isPrivacyMasked ? "••• tr ₫" : value }
    private var details: some View {
        VStack(alignment: .leading, spacing: MT.cellGap) {
            Text(label).mtFont(.cardHeader)
            Text(displayed).mtFont(.heroNumber).lineLimit(1).minimumScaleFactor(0.6)
            Text(scope).mtFont(.caption).foregroundStyle(Palette.mtTextSecondary)
            if let comparison, !isPrivacyMasked { DeltaPill(comparison, good: comparisonGood) }
        }.frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel([label, displayed, scope, isPrivacyMasked ? nil : comparison].compactMap { $0 }.joined(separator: ", "))
    }
    var body: some View {
        HStack(alignment: .top, spacing: MT.cellGap) {
            if let action { Button(action: action) { details }.buttonStyle(MTPressStyle()) }
            else { details }
            if let info { InfoButton(info) }
        }.foregroundStyle(Palette.mtTextPrimary).heroSurface()
    }
}

struct MTStatCell: View {
    let label: String
    let value: String
    var note: String? = nil
    var tone: Color? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).mtFont(.caption).foregroundStyle(Palette.mtTextSecondary)
            Text(value).mtFont(.cardMetric).foregroundStyle(tone ?? Palette.mtTextPrimary).lineLimit(1).minimumScaleFactor(0.6).rolling(value)
            if let note { Text(note).mtFont(.caption).foregroundStyle(Palette.mtTextSecondary) }
        }.frame(maxWidth: .infinity, alignment: .leading).tileSurface()
            .accessibilityElement(children: .combine)
    }
}

struct MTComparisonBarRow: View {
    let previous: Double?
    let previousText: String
    let previousLabel: String
    let current: Double
    let currentText: String
    let currentLabel: String
    var tint: Color = Palette.accent
    var difference: String? = nil
    var differenceGood: Bool? = nil
    var scope: String = ""
    var body: some View {
        if let previous {
            VStack(alignment: .leading, spacing: MT.cellGap) {
                PairBars(prev: previous, prevText: previousText, prevLabel: previousLabel,
                         cur: current, curText: currentText, curLabel: currentLabel, tint: tint)
                if let difference { DeltaPill(difference, good: differenceGood) }
                if !scope.isEmpty { Text(scope).mtFont(.caption).foregroundStyle(Palette.muted) }
            }.accessibilityElement(children: .combine)
        }
    }
}

struct MTTrendChart: View {
    let points: [(String, Double)]
    var previous: [(String, Double)]? = nil
    var tint: Color = Palette.accent
    var height: CGFloat = 180
    var value: (Double) -> String = Fmt.money
    var scope: String = ""
    var body: some View {
        LineChart(points: points, tint: tint, height: height, value: value, previous: previous)
            .accessibilityLabel(scope + ", " + points.map { "\($0.0): \(value($0.1))" }.joined(separator: ", "))
    }
}

struct MTDonutChart: View {
    let parts: [(label: String, value: Double, valueText: String, color: Color)]
    let total: Double
    let totalText: String
    var scope: String = ""
    private var valid: Bool {
        total.isFinite && total > 0 && !parts.isEmpty && parts.allSatisfy { $0.value.isFinite && $0.value >= 0 }
            && parts.reduce(0) { $0 + $1.value } == total
    }
    var body: some View {
        if valid {
            SegRing(parts: parts, center: totalText, caption: scope.isEmpty ? nil : scope)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(([scope, totalText] + parts.map { "\($0.label): \($0.valueText)" }).joined(separator: ", "))
        }
    }
}

/// Callers supply their existing sorted rows, total, column IDs and sorting action.
/// No table values or totals are calculated here.
struct MTStickyColumnTable<Row: Identifiable, Column: Identifiable, Name: View, Cell: View>: View where Column.ID: Hashable {
    let rows: [Row]
    let total: Row?
    let columns: [Column]
    let title: (Column) -> String
    let sort: (Column) -> Void
    var sortFirst: (() -> Void)? = nil
    var firstTitle = "Tên"
    var scope = ""
    var nameWidth: CGFloat = 120
    var columnWidth: CGFloat = 112
    var rowHeight: CGFloat = 64
    var selectedColumn: Column.ID? = nil
    var descending = true
    @ViewBuilder let name: (Row) -> Name
    @ViewBuilder let cell: (Row, Column) -> Cell
    @State private var offset: CGFloat = 0
    @ScaledMetric(relativeTo: .footnote) private var scale: CGFloat = 1
    private var height: CGFloat { rowHeight * scale }
    private func rowName(_ row: Row) -> some View {
        name(row).fixedSize(horizontal: false, vertical: true).frame(width: nameWidth, height: height, alignment: .leading)
    }
    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                if let sortFirst {
                    Button(action: sortFirst) { Text(firstTitle).mtFont(.cardHeader).frame(width: nameWidth, height: height, alignment: .leading) }.buttonStyle(MTPressStyle())
                } else {
                    Text(firstTitle).mtFont(.cardHeader).frame(width: nameWidth, height: height, alignment: .leading)
                }
                ForEach(rows) { row in rowName(row) }
                if let total { rowName(total).background(Palette.mtSurfaceCell) }
            }
            GeometryReader { viewport in
                ScrollViewReader { reader in
                    ScrollView(.horizontal) {
                        HStack(spacing: 0) {
                            ForEach(columns) { column in
                                VStack(spacing: 0) {
                                    Button { sort(column) } label: {
                                        Text(title(column) + (selectedColumn == column.id ? (descending ? " ▼" : " ▲") : ""))
                                            .mtFont(.cardHeader).frame(width: columnWidth, height: height)
                                    }.buttonStyle(MTPressStyle())
                                    ForEach(rows) { row in
                                        cell(row, column).mtFont(.body).frame(width: columnWidth, height: height, alignment: .trailing)
                                            .accessibilityElement(children: .combine).accessibilityHint(title(column) + (scope.isEmpty ? "" : ", " + scope))
                                    }
                                    if let total {
                                        cell(total, column).mtFont(.body).frame(width: columnWidth, height: height, alignment: .trailing).background(Palette.mtSurfaceCell)
                                            .accessibilityElement(children: .combine).accessibilityHint("Tổng, " + title(column) + (scope.isEmpty ? "" : ", " + scope))
                                    }
                                }.id(column.id)
                            }
                        }.background {
                            GeometryReader { geometry in
                                Color.clear.preference(key: MTTableOffset.self, value: geometry.frame(in: .named("mt-table")).minX)
                            }
                        }
                    }.coordinateSpace(name: "mt-table")
                        .onPreferenceChange(MTTableOffset.self) { offset = $0 }
                        .overlay(alignment: .trailing) {
                            if CGFloat(columns.count) * columnWidth + offset > viewport.size.width + 1 {
                                LinearGradient(colors: [.clear, Palette.mtSurfaceCard], startPoint: .leading, endPoint: .trailing)
                                    .frame(width: 24).allowsHitTesting(false).accessibilityHidden(true)
                            }
                        }
                        .overlay(alignment: .topTrailing) {
                            if CGFloat(columns.count) * columnWidth + offset > viewport.size.width + 1 {
                                Text("⇄").foregroundStyle(Palette.muted).accessibilityLabel("Cuộn ngang để xem thêm cột").allowsHitTesting(false)
                            }
                        }
                        .onChange(of: selectedColumn) { _, id in if let id { reader.scrollTo(id, anchor: .trailing) } }
                }
            }.frame(height: height * CGFloat(rows.count + (total == nil ? 1 : 2)))
        }.foregroundStyle(Palette.ink)
    }
}
private struct MTTableOffset: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

struct MTRateBadge: View {
    enum Kind { case saleClose, refund }
    let rate: Double?
    let kind: Kind
    private var level: Int {
        guard let rate, rate.isFinite else { return -1 }
        return kind == .saleClose ? (rate < 42 ? 2 : 0) : (rate >= 7 ? 2 : rate >= 5 ? 1 : 0)
    }
    private var ink: Color { level == 2 ? Palette.bad : level == 1 ? Palette.warn : level == 0 ? Palette.good : Palette.muted }
    private var fill: Color { level == 2 ? Palette.badSoft : level == 1 ? Palette.warnSoft : level == 0 ? Palette.goodSoft : Palette.wash }
    private var text: String {
        guard level >= 0 else { return "—" }
        return (level == 0 ? "✓ " : level == 1 ? "! " : kind == .saleClose ? "▼ " : "▲ ") + Fmt.pct(rate)
    }
    var body: some View {
        Text(text).mtFont(.caption).foregroundStyle(ink).padding(.horizontal, 8).padding(.vertical, 5)
            .background(fill, in: .capsule)
            .accessibilityLabel((kind == .saleClose ? "Tỷ lệ chốt Sale: " : "Tỷ lệ hoàn/hủy: ") + text)
    }
}

struct MTFilterBarPill: View {
    let title: String
    var icon: String? = nil
    var selected = false
    let action: () -> Void
    var body: some View {
        Button(action: action) { Pill(title: title, icon: icon, on: selected) }.buttonStyle(MTPressStyle())
    }
}

struct MTFilterSheet<Content: View>: View {
    let title: String
    // Existing sheets keep their navigation, toolbar and apply/dismiss actions.
    var existingNavigation = false
    @ViewBuilder let content: Content
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        Group {
            if existingNavigation {
                content.scrollContentBackground(.hidden).background(Palette.bg)
            } else {
                NavigationStack {
                    ScrollView { content.padding(MT.cardPad) }.background(Palette.bg)
                        .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
                        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Đóng") { dismiss() }.frame(minWidth: 44, minHeight: 44) } }
                }
            }
        }.tint(Palette.accent).presentationDetents([.medium, .large])
            .presentationCornerRadius(MT.rSheet).presentationBackground(Palette.card).presentationDragIndicator(.visible)
            .presentationContentInteraction(.scrolls)
    }
}

struct MTSegmentedControl<Value: Hashable>: View {
    @Binding var selection: Value
    let options: [(Value, String)]
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        HStack(spacing: MT.cellGap) {
            ForEach(options, id: \.0) { value, title in
                Button { withAnimation(reduce ? nil : .easeOut(duration: 0.2)) { selection = value } } label: {
                    Text(title).mtFont(.body).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, minHeight: 44).padding(.horizontal, 4)
                        .foregroundStyle(selection == value ? Palette.ink : Palette.muted)
                        .background(selection == value ? Palette.segSel : .clear, in: .rect(cornerRadius: MT.rSeg))
                }.buttonStyle(MTPressStyle()).accessibilityAddTraits(selection == value ? .isSelected : [])
            }
        }.padding(4).background(Palette.wash, in: .rect(cornerRadius: MT.rSeg))
            .sensoryFeedback(.selection, trigger: selection)
    }
}

struct MTStateContainerView<Content: View>: View {
    enum State { case loading, failed, empty, offline, content }
    let state: State
    let text: String
    var compact = false
    @ViewBuilder let content: Content
    var body: some View {
        VStack(spacing: MT.cardGap) {
            switch state {
            case .content: content
            case .loading:
                VStack(alignment: .leading, spacing: MT.cellGap) {
                    Skeleton(height: 12).frame(maxWidth: 120)
                    Skeleton(height: compact ? 44 : 72)
                    if !compact {
                        HStack(spacing: MT.cellGap) { Skeleton(height: 44); Skeleton(height: 44) }
                    }
                }.redacted(reason: .placeholder)
                    .accessibilityElement(children: .ignore).accessibilityLabel(text)
            case .failed, .empty, .offline:
                Image(systemName: state == .empty ? "tray" : state == .offline ? "wifi.slash" : "exclamationmark.triangle")
                    .font(.title2).foregroundStyle(state == .empty ? Palette.muted : Palette.warn)
                    .frame(width: 44, height: 44)
                    .background(state == .empty ? Palette.mtSurfaceCell : Palette.warnSoft, in: .circle)
                    .accessibilityHidden(true)
                Text(text).mtFont(.body).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                content
            }
        }.foregroundStyle(Palette.ink).frame(maxWidth: .infinity).padding(MT.cardPad).cardSurface()
    }
}

/// Native TabView remains in RootTabs, including tags and navigation state.
struct MTRootTabView: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        content.tint(scheme == .dark ? Palette.mtSuccessInk : Palette.mtBrandPrimary)
            .toolbarBackground(Palette.mtSurfaceCard, for: .tabBar).toolbarBackground(.visible, for: .tabBar)
    }
}

private struct MTPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduce
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.scaleEffect(configuration.isPressed && !reduce ? 0.97 : 1)
            .animation(reduce ? nil : .easeOut(duration: 0.15), value: configuration.isPressed)
            .sensoryFeedback(.selection, trigger: configuration.isPressed)
    }
}

/// Wrap filter controls at their intrinsic size without duplicating their CI hooks.
struct MTFlowLayout: Layout {
    var spacing: CGFloat = MT.cellGap
    private func positions(_ subviews: Subviews, width: CGFloat) -> (points: [CGPoint], size: CGSize) {
        var points: [CGPoint] = []
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(ProposedViewSize(width: width, height: nil))
            if x > 0 && x + size.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            points.append(CGPoint(x: x, y: y))
            x += size.width + spacing; rowHeight = max(rowHeight, size.height)
        }
        return (points, CGSize(width: width, height: y + rowHeight))
    }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        positions(subviews, width: proposal.width ?? 320).size
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let layout = positions(subviews, width: bounds.width)
        for (index, view) in subviews.enumerated() {
            view.place(at: CGPoint(x: bounds.minX + layout.points[index].x, y: bounds.minY + layout.points[index].y), anchor: .topLeading,
                       proposal: ProposedViewSize(width: min(bounds.width, view.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil)).width), height: nil))
        }
    }
}
