import SwiftUI
import UIKit

// Khung chung giống thiết kế Gemini (plan 2026-11-12, R1): đầu trang có dòng nhỏ + tiêu đề lớn + nút vuông bo 12pt,
// màn con có breadcrumb xanh thay nav bar, một pill lọc rộng hết màn mở bottom sheet, dải nền che vùng giờ/pin khi cuộn.
// Chỉ đổi khung hiển thị; cách lấy số, quyền xem và bộ lọc chung (AppNav) giữ nguyên.

extension AppTab {
    /// Chữ breadcrumb của màn con mở trong tab này.
    var crumb: String {
        switch self {
        case .home: return "Trang chủ"
        case .orders: return "Đơn hàng"
        case .overview: return "Tổng quan"
        case .depts: return "Phòng ban"
        case .more: return "Thêm"
        }
    }
}

extension Period {
    /// Dòng nhỏ trên tiêu đề tab: "Tháng 11/2026" cho Tháng này / Tháng trước, còn lại là tên kỳ.
    var kicker: String {
        switch self {
        case .month, .last:
            let parts = range.0.split(separator: "-")
            guard parts.count == 3 else { return title }
            return "Tháng \(parts[1])/\(parts[0])"
        default: return title
        }
    }
}

/// Nút ở đầu trang: vuông bo 12pt, có nền, vùng chạm 44pt.
struct HeaderSquare: ViewModifier {
    func body(content: Content) -> some View {
        content.font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
            .frame(width: 44, height: 44)
            .background(Palette.wash, in: .rect(cornerRadius: 12))
            .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.line, lineWidth: 1) }
            .contentShape(.rect)
    }
}

/// Nút mắt: ẩn / hiện số tiền (nhớ trên máy, cùng khoá thp_hide_money với các thẻ số).
struct EyeButton: View {
    @AppStorage("thp_hide_money") private var hideMoney = false
    var body: some View {
        Button { hideMoney.toggle() } label: {
            Image(systemName: hideMoney ? "eye.slash" : "eye").modifier(HeaderSquare())
        }
        .buttonStyle(MTPressStyle())
        .accessibilityLabel(hideMoney ? "Hiện số tiền" : "Ẩn số tiền")
    }
}

/// Các nút bên phải tiêu đề tab.
struct HeaderActions: OptionSet {
    let rawValue: Int
    static let sync = HeaderActions(rawValue: 1)
    static let eye = HeaderActions(rawValue: 2)
    static let bell = HeaderActions(rawValue: 4)
}

/// Dải nền phủ vùng giờ, pin, Dynamic Island: nội dung cuộn lên không đè lên thanh trạng thái.
struct StatusBarBackdrop: ViewModifier {
    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            Palette.bg.frame(height: 0).ignoresSafeArea(edges: .top).allowsHitTesting(false).accessibilityHidden(true)
        }
    }
}

/// Đầu màn con: breadcrumb xanh "‹ Phòng ban" (bấm để quay lại), tiêu đề lớn, nút mắt (và nút i nếu có).
struct ChildHeader: View {
    let title: String
    /// nil: theo tab đang mở (Trang chủ, Tổng quan, Phòng ban…).
    var parent: String? = nil
    var info: InfoText? = nil
    var eye = true
    @Environment(\.dismiss) private var dismiss
    @Environment(AppNav.self) private var nav: AppNav?
    private var crumb: String { parent ?? nav?.tab.crumb ?? "Quay lại" }
    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Button { dismiss() } label: {
                    HStack(spacing: 3) {
                        Image(systemName: "chevron.left").font(.system(size: 11, weight: .bold))
                        Text(crumb).mtFont(.caption).fontWeight(.semibold)
                    }
                    .foregroundStyle(Palette.accent).frame(minHeight: 28).contentShape(.rect)
                }
                .buttonStyle(.plain).accessibilityLabel("Quay lại \(crumb)")
                Text(title).font(MT.screenTitle).foregroundStyle(Palette.ink).lineLimit(2).minimumScaleFactor(0.8)
                    .accessibilityAddTraits(.isHeader)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let info { InfoButton(info).modifier(HeaderSquare()) }
            if eye { EyeButton() }
        }
    }
}

extension View {
    /// Màn con: ẩn nav bar (đầu trang là ChildHeader), giữ vuốt từ mép trái để quay lại, che vùng thanh trạng thái.
    func childChrome() -> some View {
        self.toolbar(.hidden, for: .navigationBar).modifier(StatusBarBackdrop())
    }
}

/// Nav bar ẩn thì UIKit tắt vuốt quay lại; bật lại khi còn trang để lùi.
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }
    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        viewControllers.count > 1
    }
}

// MARK: Lọc: một pill rộng hết màn, bấm mở bottom sheet

/// "⫶ Tháng này · Mọi POS · Tất cả · Team A ⌄". Bấm mở bảng chọn kỳ, POS, nhóm đơn, team.
/// pos / product nil: trang không lọc theo phần đó. team: hiện mục Team (khi tài khoản xem được team).
struct ScopeFilterPill: View {
    @Binding var period: Period
    var periodOptions: [Period] = Period.quick
    var pos: Binding<String>? = nil
    var product: Binding<String>? = nil
    var team = false
    /// POS, nhóm đơn cố định của trang (theo bảng vừa bấm): chỉ ghi trong pill, không đổi ở đây.
    var fixedPos: String? = nil
    var fixedProduct: String? = nil
    @Environment(AppNav.self) private var nav: AppNav?
    @Environment(AuthModel.self) private var auth: AuthModel?
    @State private var open = false
    @State private var teamOpen = false
    private var teamAllowed: Bool {
        team && ["sale-teams", "cskh-teams", "van-don"].contains { auth?.me?.canView($0) == true }
    }
    private var summary: String {
        var parts: [String] = [period.title]
        if let id = pos?.wrappedValue ?? fixedPos {
            parts.append(id.isEmpty ? "Mọi POS" : (PosBreakdown.short[id] ?? id))
        }
        if let p = product?.wrappedValue ?? fixedProduct {
            parts.append(p == "all" ? "Tất cả" : Fmt.productGroup(p))
        }
        if teamAllowed, let unit = nav?.hrUnit { parts.append(unit.shortName) }
        return parts.joined(separator: " · ")
    }
    private var pillLabel: some View {
        HStack(spacing: 8) {
            Image(systemName: "line.3.horizontal.decrease").font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.muted)
            Text(summary).mtFont(.body).fontWeight(.semibold).foregroundStyle(Palette.ink)
                .lineLimit(1).minimumScaleFactor(0.75)
                .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.down").font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.muted)
        }
        .padding(.horizontal, 14).frame(minHeight: 44)
        .background(Palette.card, in: .rect(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.line, lineWidth: 1) }
        .contentShape(.rect)
    }
    var body: some View {
        Button { open = true } label: { pillLabel }
            .buttonStyle(MTPressStyle())
            .accessibilityLabel("Bộ lọc: \(summary)")
            .accessibilityHint("Mở bảng chọn kỳ, POS, nhóm đơn, team")
            .sheet(isPresented: $open) {
                ScopeFilterSheet(period: $period, periodOptions: periodOptions, pos: pos, product: product, team: teamAllowed,
                                 fixedPos: fixedPos, fixedProduct: fixedProduct)
            }
            .background { Color.clear.sheet(isPresented: $teamOpen) { HrTeamSheet() } }
            #if DEBUG
            // Lượt tự xem MEGATECH_TOUR=team "chạm" nút Team (trước là chip Team, nay nằm trong bảng lọc).
            .onChange(of: DebugTap.shared.tick) { _, _ in
                if DebugTap.shared.target == "team-mo" && teamAllowed { teamOpen = true }
            }
            #endif
    }
}

/// Bảng lọc: dòng phạm vi đầy đủ (kỳ, ngày, POS) rồi từng mục chọn bằng 1 chạm.
struct ScopeFilterSheet: View {
    @Binding var period: Period
    let periodOptions: [Period]
    var pos: Binding<String>?
    var product: Binding<String>?
    var team: Bool
    var fixedPos: String? = nil
    var fixedProduct: String? = nil
    @Environment(AuthModel.self) private var auth: AuthModel?
    @State private var custom = false
    private var granted: Int {
        guard let me = auth?.me, me.role != "owner" else { return 0 }
        return me.posIds?.count ?? 0
    }
    private var scope: String {
        ScopeText.text(period: period, pos: pos?.wrappedValue ?? fixedPos, product: product?.wrappedValue ?? fixedProduct ?? "all", granted: granted)
    }
    private func section<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: MT.cellGap) {
            Text(title).mtFont(.cardHeader).foregroundStyle(Palette.ink)
            content()
        }
    }
    private var periodChips: some View {
        let other = !periodOptions.contains(period)
        return MTFlowLayout(spacing: MT.cellGap) {
            ForEach(periodOptions) { p in QuickChip(label: p.title, on: period == p) { period = p } }
            QuickChip(label: other ? period.title : "Khác…", on: other) { custom = true }
        }
    }
    private func posChips(_ binding: Binding<String>) -> some View {
        MTFlowLayout(spacing: MT.cellGap) {
            QuickChip(label: "Mọi POS", on: binding.wrappedValue.isEmpty) { binding.wrappedValue = "" }
            ForEach(PosBreakdown.order, id: \.self) { id in
                QuickChip(label: PosBreakdown.short[id] ?? id, on: binding.wrappedValue == id) { binding.wrappedValue = id }
                    .accessibilityLabel(PosBreakdown.names[id] ?? id)
            }
        }
    }
    private func productChips(_ binding: Binding<String>) -> some View {
        MTFlowLayout(spacing: MT.cellGap) {
            ForEach([("all", "Tất cả nhóm"), ("gentadox", "Gentadox"), ("skgk", "SK + GK")], id: \.0) { key, name in
                QuickChip(label: name, on: binding.wrappedValue == key) { binding.wrappedValue = key }
            }
        }
    }
    var body: some View {
        MTFilterSheet(title: "Bộ lọc") {
            VStack(alignment: .leading, spacing: MT.cardGap + 4) {
                ScopeStrip(text: "Đang xem: " + scope)
                section("Kỳ") { periodChips }
                if let pos { section("POS") { posChips(pos) } }
                if let product { section("Nhóm đơn") { productChips(product) } }
                if team { section("Team") { HStack { HrTeamChip(); Spacer() } } }
            }
            .sensoryFeedback(.selection, trigger: scope)
        }
        .sheet(isPresented: $custom) {
            MTFilterSheet(title: "Khoảng tuỳ chọn", existingNavigation: true) {
                CustomRangeSheet(initial: period.range) { period = .custom($0, $1) }
            }
        }
    }
}
