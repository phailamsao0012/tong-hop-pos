import SwiftUI

// Các khối mới của tab Tổng quan theo khung Gemini 02–04 (R3). Chỉ dùng số API có sẵn; số chưa có trên máy chủ hiện "—".

/// Banner vàng (khung 02): đang chọn team nhưng khối này chưa lọc theo team.
struct TeamNotFilteredBanner: View {
    let text: String
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Palette.warn)
            Text(text).mtFont(.caption).fontWeight(.semibold).foregroundStyle(Palette.mtWarningInk)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(Palette.warnSoft, in: .rect(cornerRadius: MT.rCell))
        .overlay { RoundedRectangle(cornerRadius: MT.rCell).strokeBorder(Palette.warn.opacity(0.5), lineWidth: 1) }
        .accessibilityElement(children: .combine)
    }
}

/// "Tiến độ tháng · Ba bộ phận theo tháng" (khung 02): mỗi bộ phận số đã đạt trong kỳ.
/// Máy chủ chưa có KPI tháng theo bộ phận (mới có KPI theo POS, nhân viên, team) nên KPI, thanh tiến độ, mốc tới hôm nay ghi "—",
/// app không tự cộng KPI từ nơi khác.
struct DeptProgressCard: View {
    let data: API.Sections?
    var mkt: API.RoasMetrics? = nil
    let period: Period
    @AppStorage("thp_hide_money") private var hideMoney = false
    @Environment(\.thinking) private var thinking
    private func money(_ v: Double) -> String { hideMoney ? "••• tr ₫" : Fmt.shortVnd(v) }
    private func row(_ dept: CompanyDept, _ count: String, _ net: Double) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Circle().fill(dept.tint).frame(width: 8, height: 8)
                Text("\(dept.pageTitle) · \(count)").mtFont(.body).fontWeight(.bold).foregroundStyle(Palette.ink)
                    .lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 6)
                Text("\(money(net)) / — KPI").mtFont(.body).fontWeight(.bold).foregroundStyle(Palette.ink)
                    .lineLimit(1).minimumScaleFactor(0.7).loadingPlaceholder(thinking)
            }
            Text("Mốc tới hôm nay: —").mtFont(.caption).foregroundStyle(Palette.muted)
        }
        .padding(10).frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.wash, in: .rect(cornerRadius: MT.rCell))
        .accessibilityElement(children: .combine)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: MT.cellGap) {
            Text("Tiến độ tháng · Ba bộ phận theo tháng").mtFont(.cardHeader).foregroundStyle(Palette.ink)
            if period != .month {
                Text("Đang xem \(period.title): số đã đạt là số của kỳ này.").mtFont(.caption).foregroundStyle(Palette.muted)
            }
            if let d = data {
                row(.sale, "\(Fmt.int(d.sale.orders)) đơn chốt", d.sale.net)
                row(.cskh, "\(Fmt.int(d.cskh.orders)) đơn chốt", d.cskh.net)
                row(.mkt, "\(Fmt.int(mkt?.closed ?? d.mkt.orders)) đơn XN", mkt?.net ?? d.mkt.net)
                Text("KPI tháng theo bộ phận chưa có trên máy chủ nên chưa có thanh tiến độ và mốc tới hôm nay.")
                    .mtFont(.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            } else {
                Skeleton(height: 44); Skeleton(height: 44); Skeleton(height: 44)
            }
        }
        .padding(MT.cardPad).frame(maxWidth: .infinity, alignment: .leading).cardSurface()
    }
}

/// Một hàng POS (khung 04): "POS A · 60 chốt / 90 đơn" và tiền bên phải. Chạm lọc riêng POS đó.
struct PosSumRow: View {
    let row: API.PosRow
    var hidden = false
    let pick: () -> Void
    var body: some View {
        Button(action: pick) {
            HStack(spacing: 8) {
                Circle().fill(PosInfo.color(row.posId)).frame(width: 8, height: 8)
                Text("\(PosBreakdown.short[row.posId] ?? row.posId) · \(Fmt.int(row.closedOrders)) chốt / \(Fmt.int(row.orders)) đơn")
                    .mtFont(.body).fontWeight(.semibold).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 6)
                Text(hidden ? "••• tr ₫" : Fmt.shortVnd(row.closedNet)).mtFont(.body).fontWeight(.bold).foregroundStyle(Palette.ink)
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
            .padding(12).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(Palette.wash, in: .rect(cornerRadius: MT.rCell))
            .contentShape(.rect)
        }
        .buttonStyle(MTPressStyle())
        .accessibilityHint("Chạm để xem riêng POS này")
    }
}
