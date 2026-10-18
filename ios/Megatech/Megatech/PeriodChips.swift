import SwiftUI

// Bộ chọn kỳ 1 chạm và dòng phạm vi (kế hoạch 1.4). Kỳ, POS, nhóm đơn chung nằm ở AppNav (Tabs.swift), nhớ giữa các lần mở app
// (NavMemory.swift). Trang con mở theo kỳ chung, đổi riêng được, và luôn ghi rõ đang xem kỳ nào, POS nào (ScopeLine).

extension Period {
    /// Các mốc trên dải chip chọn kỳ (thêm ô "Khác…" ở cuối).
    static let quick: [Period] = [.today, .yesterday, .week, .month, .last]
}

/// Chip một chạm như FilterChip; compact: chữ nhỏ hơn, lề hẹp hơn để cả dải vừa một hàng trên iPhone.
struct QuickChip: View {
    let label: String; let on: Bool; var compact = false; let tap: () -> Void
    var body: some View {
        Button(action: tap) {
            Text(label).font(.subheadline.weight(.semibold)).lineLimit(1)
                .foregroundStyle(on ? Palette.card : Palette.muted)
                .padding(.horizontal, compact ? 6 : 12).padding(.vertical, 7)
                .background(on ? Palette.ink : Palette.wash, in: .capsule)
        }.buttonStyle(.plain).accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// Chọn kỳ bằng 1 chạm: Hôm nay | Hôm qua | 7 ngày | Tháng này | Tháng trước | Khác…; "Khác…" mở bảng chọn khoảng ngày.
/// Kỳ đang xem không có trên dải (khoảng tự chọn, 30 ngày…) thì hiện ở ô cuối thay chữ "Khác…".
/// Đủ chỗ thì một hàng; chật thì chữ nhỏ hơn; vẫn không vừa (chữ hệ thống rất to) thì vuốt ngang.
struct PeriodChips: View {
    @Binding var period: Period
    var options: [Period] = Period.quick
    @State private var custom = false
    private var other: Bool { !options.contains(period) }
    var body: some View {
        ViewThatFits(in: .horizontal) {
            row(compact: false)
            row(compact: true)
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) { row(compact: true) }
                    .onAppear { proxy.scrollTo(other ? "other" : period.key, anchor: .center) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .sheet(isPresented: $custom) { CustomRangeSheet(initial: period.range) { period = .custom($0, $1) } }
    }
    private func row(compact: Bool) -> some View {
        HStack(spacing: compact ? 4 : 6) {
            ForEach(options) { p in
                QuickChip(label: p.title, on: period == p, compact: compact) { period = p }.id(p.key)
            }
            QuickChip(label: other ? period.title : "Khác…", on: other, compact: compact) { custom = true }
                .id("other")
                .accessibilityHint("Chọn khoảng ngày")
        }
        .padding(.vertical, 1)
    }
}

/// Chữ phạm vi: "Tháng này · 01/10–11/10/2026 · POS Thủy sản Megatech · nhóm Gentadox".
/// pos nil: số của trang không chia theo POS (bỏ phần POS); granted > 0: tài khoản chỉ được xem chừng đó POS.
enum ScopeText {
    static func text(period: Period, pos: String?, product: String = "all", granted: Int = 0) -> String {
        let r = period.range
        var parts: [String] = []
        if case .custom = period { parts.append(Fmt.dayRange(r.0, r.1)) } else { parts.append(period.title); parts.append(Fmt.dayRange(r.0, r.1)) }
        if let pos {
            if !pos.isEmpty { parts.append("POS \(PosBreakdown.names[pos] ?? pos)") }
            else if granted > 0 { parts.append("\(granted) POS được cấp") }
            else { parts.append("Tất cả POS") }
        }
        if product != "all" { parts.append("nhóm \(Fmt.productGroup(product))") }
        return parts.joined(separator: " · ")
    }
}

/// Dòng "Đang xem: <kỳ> · <ngày> · <POS>" dưới bộ chọn của trang: trang con mở theo kỳ chung nhưng đổi riêng được, nên luôn
/// ghi rõ số trên trang là của kỳ nào, POS nào.
struct ScopeLine: View {
    let period: Period
    /// nil: số của trang không chia theo POS.
    var pos: String? = ""
    var product = "all"
    @Environment(AuthModel.self) private var auth: AuthModel?
    private var granted: Int {
        guard let me = auth?.me, me.role != "owner" else { return 0 }
        return me.posIds?.count ?? 0
    }
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Image(systemName: "scope").font(.system(size: 10, weight: .semibold))
            Text("Đang xem: " + ScopeText.text(period: period, pos: pos, product: product, granted: granted))
                .font(.system(size: 11, weight: .medium)).fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(Color.inkSoft)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
