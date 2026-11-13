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

/// KPI tháng của một bộ phận = cộng KPI các team thuộc bộ phận đó (anh Vũ chọn 13/11/2026), từ /api/targets (scope "team") và
/// danh sách team (/api/teams?list=1, trường dept: sale / cskh / mkt). Mốc tới hôm nay như web (lib/kpi/kpi-pace.ts): mỗi team
/// KPI ngày = KPI ÷ số ngày làm (trống = số ngày của tháng), nhân số ngày đã qua (không quá số ngày làm), rồi cộng các team.
struct DeptKpi: Equatable {
    let goal: Double
    let pace: Double
    let teams: Int
    static func build(targets: [API.Target], teams: [API.HrTeamItem], dept: String, day: Int, daysInMonth: Int) -> DeptKpi? {
        let ids = Set(teams.filter { $0.dept == dept }.map(\.id))
        let mine = targets.filter { $0.scope == "team" && ids.contains($0.refId) && $0.revenue > 0 }
        guard !mine.isEmpty else { return nil }
        var goal = 0.0, pace = 0.0
        for t in mine {
            let days = Double((t.workingDays ?? 0) > 0 ? Int(t.workingDays!) : daysInMonth)
            goal += t.revenue
            pace += t.revenue / days * min(Double(day), days)
        }
        return DeptKpi(goal: goal, pace: pace, teams: mine.count)
    }
}

/// "Tiến độ tháng · Ba bộ phận theo tháng" (khung 02): mỗi bộ phận số đã đạt trong tháng / KPI cộng từ các team, thanh tiến độ,
/// mốc tới hôm nay, ✓ Đúng tiến độ / ▼ Chậm tiến độ. Bộ phận chưa có KPI team nào: "—" và "Chưa giao KPI".
struct DeptProgressCard: View {
    let data: API.Sections?
    var mkt: API.RoasMetrics? = nil
    let period: Period
    /// POS đang chọn: KPI team chưa gắn POS nên vẫn là KPI cả bộ phận (ghi rõ dưới khối).
    var pos = ""
    @AppStorage("thp_hide_money") private var hideMoney = false
    @Environment(\.thinking) private var thinking
    @State private var targets: [API.Target]?
    @State private var teams: [API.HrTeamItem]?
    @State private var failText: String?
    private var today: String { VNDate.string(.now) }
    private var ym: String { String(today.prefix(7)) }
    private var day: Int { Int(today.suffix(2)) ?? 1 }
    private var daysInMonth: Int { Int(VNDate.monthEnd(ym).suffix(2)) ?? 30 }
    /// Số đã đạt chỉ là số tháng này khi đang xem kỳ Tháng này.
    private var monthView: Bool { period == .month }
    private func money(_ v: Double) -> String { hideMoney ? "••• tr ₫" : Fmt.shortVnd(v) }
    private func kpi(_ dept: String) -> DeptKpi? {
        guard let targets, let teams else { return nil }
        return DeptKpi.build(targets: targets, teams: teams, dept: dept, day: day, daysInMonth: daysInMonth)
    }
    private func amounts(_ net: Double, _ k: DeptKpi?) -> String {
        let done = monthView ? money(net) : "—"
        guard let k else { return "\(done) / —" }
        guard monthView else { return "— / \(money(k.goal))" }
        return "\(done) / \(money(k.goal)) (\(Fmt.pct0(net / k.goal * 100)))"
    }
    @ViewBuilder private func status(_ net: Double, _ k: DeptKpi?) -> some View {
        if let k, monthView {
            if net >= k.pace {
                Label("Đúng tiến độ", systemImage: "checkmark").labelStyle(.titleAndIcon).foregroundStyle(Palette.good)
            } else {
                Label("Chậm tiến độ", systemImage: "arrowtriangle.down.fill").labelStyle(.titleAndIcon).foregroundStyle(Palette.bad)
            }
        } else if k == nil, targets != nil, teams != nil {
            Text("Chưa giao KPI").foregroundStyle(Palette.muted)
        }
    }
    private func row(_ dept: CompanyDept, _ key: String, _ count: String, _ net: Double) -> some View {
        let k = kpi(key)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Circle().fill(dept.tint).frame(width: 8, height: 8)
                Text("\(dept.pageTitle) · \(count)").mtFont(.body).fontWeight(.bold).foregroundStyle(Palette.ink)
                    .lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 6)
                Text(amounts(net, k)).mtFont(.body).fontWeight(.bold).foregroundStyle(Palette.ink)
                    .lineLimit(1).minimumScaleFactor(0.6).loadingPlaceholder(thinking)
            }
            if let k, monthView { Bar(value: min(1, net / k.goal), tint: dept.tint, height: 6) }
            HStack {
                Text("Mốc tới hôm nay: \(k.map { money($0.pace) } ?? "—")")
                Spacer(minLength: 6)
                status(net, k)
            }
            .mtFont(.caption).foregroundStyle(Palette.muted)
        }
        .padding(10).frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.wash, in: .rect(cornerRadius: MT.rCell))
        .accessibilityElement(children: .combine)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: MT.cellGap) {
            Text("Tiến độ tháng · Ba bộ phận theo tháng").mtFont(.cardHeader).foregroundStyle(Palette.ink)
            if !monthView {
                Text("Chọn kỳ Tháng này để so số đã đạt với KPI tháng.").mtFont(.caption).foregroundStyle(Palette.muted)
            }
            if let d = data {
                row(.sale, "sale", "\(Fmt.int(d.sale.orders)) đơn chốt", d.sale.net)
                row(.cskh, "cskh", "\(Fmt.int(d.cskh.orders)) đơn chốt", d.cskh.net)
                row(.mkt, "mkt", "\(Fmt.int(mkt?.closed ?? d.mkt.orders)) đơn XN", mkt?.net ?? d.mkt.net)
                if !pos.isEmpty {
                    Text("KPI team chưa gắn POS: đang so số của POS đang chọn với KPI cả bộ phận.")
                        .mtFont(.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                }
                if let failText {
                    Text("Chưa tải được KPI team: \(failText)").mtFont(.caption).foregroundStyle(Palette.warn)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                Skeleton(height: 44); Skeleton(height: 44); Skeleton(height: 44)
            }
        }
        .padding(MT.cardPad).frame(maxWidth: .infinity, alignment: .leading).cardSurface()
        .task(id: ym) { await load() }
        .pullToReload { await load(force: true) }
    }
    /// KPI tháng này (mọi scope, lọc team ở trên) và danh sách team (dùng chung HrTeamCache, không hỏi lại trong 5 phút).
    @MainActor private func load(force: Bool = false) async {
        let m = ym
        let trace = LoadTrace("tien-do-thang", requests: 2)
        async let tReq = attempt(true, trace) { try await API.targets(month: m) }
        async let lReq = attempt(true, trace) { try await HrTeamCache.list(force: force) }
        let (tRes, lRes) = await (tReq, lReq)
        trace.end(cancelled: Task.isCancelled)
        guard !Task.isCancelled else { return }
        var errors: [Error] = []
        switch tRes { case .success(let v)?: targets = v.items; case .failure(let e)?: errors.append(e); case nil: break }
        switch lRes { case .success(let v)?: teams = v; case .failure(let e)?: errors.append(e); case nil: break }
        failText = errors.compactMap { LoadError.text($0) }.first
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
