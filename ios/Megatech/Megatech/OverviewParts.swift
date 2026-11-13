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
/// Đang chọn 1 POS (anh Vũ chọn 13/11/2026): KPI bộ phận = cộng KPI từng NGƯỜI (scope "employee") thuộc bộ phận đó và làm ở POS
/// đó (posIds của nhân viên). KPI người trên máy chủ không chia theo POS: người làm nhiều POS được tính đủ KPI (đếm ở multiPos).
struct DeptKpi: Equatable {
    let goal: Double
    let pace: Double
    /// Số team (Mọi POS) hoặc số người (một POS) có KPI.
    let count: Int
    /// Một POS: số người có KPI mà làm nhiều POS.
    var multiPos = 0
    /// Cộng KPI các dòng, mốc tới hôm nay như lib/kpi/kpi-pace.ts (từng dòng rồi cộng).
    private static func sum(_ rows: [API.Target], day: Int, daysInMonth: Int) -> (goal: Double, pace: Double) {
        var goal = 0.0, pace = 0.0
        for t in rows {
            let days = Double((t.workingDays ?? 0) > 0 ? Int(t.workingDays!) : daysInMonth)
            goal += t.revenue
            pace += t.revenue / days * min(Double(day), days)
        }
        return (goal, pace)
    }
    static func build(targets: [API.Target], teams: [API.HrTeamItem], dept: String, day: Int, daysInMonth: Int) -> DeptKpi? {
        let ids = Set(teams.filter { $0.dept == dept }.map(\.id))
        let mine = targets.filter { $0.scope == "team" && ids.contains($0.refId) && $0.revenue > 0 }
        guard !mine.isEmpty else { return nil }
        let s = sum(mine, day: day, daysInMonth: daysInMonth)
        return DeptKpi(goal: s.goal, pace: s.pace, count: mine.count)
    }
    /// staff: người thuộc bộ phận (có posIds). Chỉ người có posIds chứa POS đang chọn.
    static func people(targets: [API.Target], staff: [API.Employee], pos: String, day: Int, daysInMonth: Int) -> DeptKpi? {
        let inPos = staff.filter { ($0.posIds ?? []).contains(pos) }
        let ids = Set(inPos.map(\.id))
        let mine = targets.filter { $0.scope == "employee" && ids.contains($0.refId) && $0.revenue > 0 }
        guard !mine.isEmpty else { return nil }
        let withGoal = Set(mine.map(\.refId))
        let multi = inPos.filter { withGoal.contains($0.id) && ($0.posIds?.count ?? 0) > 1 }.count
        let s = sum(mine, day: day, daysInMonth: daysInMonth)
        return DeptKpi(goal: s.goal, pace: s.pace, count: mine.count, multiPos: multi)
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
    /// Một POS: nhân viên Sale, CSKH (/api/employees?team=) và mọi nhân viên (posIds của người team MKT); tải một lần.
    @State private var saleStaff: [API.Employee]?
    @State private var cskhStaff: [API.Employee]?
    @State private var allStaff: [API.Employee]?
    @State private var failText: String?
    /// Người của bộ phận: Sale, CSKH theo /api/employees?team=; Marketing theo thành viên các team MKT (memberRefs).
    private func staff(_ dept: String) -> [API.Employee]? {
        switch dept {
        case "sale": return saleStaff
        case "cskh": return cskhStaff
        default:
            guard let allStaff, let teams else { return nil }
            // Team MKT theo web nhân sự chỉ trả tên thành viên (mã rỗng), nên nhận người Marketing như máy chủ (lib/teams/team.ts
            // nameSuffixDept): tên tài khoản POS có hậu tố cuối "MKT" (kể cả "MKT _n"); cộng người có mã trong team MKT nếu có.
            let ids = Set(teams.filter { $0.dept == "mkt" }.flatMap { $0.memberRefs ?? [] }.map(\.id).filter { !$0.isEmpty })
            return allStaff.filter { ids.contains($0.id) || Self.mktSuffix($0.name) }
        }
    }
    /// Hậu tố bộ phận Marketing ở cuối tên như máy chủ: "… MKT" hoặc "… MKT _n".
    static func mktSuffix(_ name: String) -> Bool {
        let words = name.lowercased().split(whereSeparator: \.isWhitespace).map(String.init)
        guard let last = words.last else { return false }
        if last == "mkt" { return true }
        return last == "_n" && words.count >= 2 && words[words.count - 2] == "mkt"
    }
    private var today: String { VNDate.string(.now) }
    private var ym: String { String(today.prefix(7)) }
    private var day: Int { Int(today.suffix(2)) ?? 1 }
    private var daysInMonth: Int { Int(VNDate.monthEnd(ym).suffix(2)) ?? 30 }
    /// Số đã đạt chỉ là số tháng này khi đang xem kỳ Tháng này.
    private var monthView: Bool { period == .month }
    private func money(_ v: Double) -> String { hideMoney ? "••• tr ₫" : Fmt.shortVnd(v) }
    private func kpi(_ dept: String) -> DeptKpi? {
        guard let targets else { return nil }
        if pos.isEmpty {
            guard let teams else { return nil }
            return DeptKpi.build(targets: targets, teams: teams, dept: dept, day: day, daysInMonth: daysInMonth)
        }
        guard let people = staff(dept) else { return nil }
        return DeptKpi.people(targets: targets, staff: people, pos: pos, day: day, daysInMonth: daysInMonth)
    }
    /// Đã đủ nguồn để biết bộ phận "Chưa giao KPI" (không nhầm với đang tải).
    private var sourcesReady: Bool {
        guard targets != nil else { return false }
        return pos.isEmpty ? teams != nil : (saleStaff != nil && cskhStaff != nil && allStaff != nil && teams != nil)
    }
    /// Một POS: số người có KPI mà làm nhiều POS (KPI người chưa chia theo POS).
    private var multiPos: Int { pos.isEmpty ? 0 : ["sale", "cskh", "mkt"].compactMap { kpi($0)?.multiPos }.reduce(0, +) }
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
        } else if k == nil, sourcesReady {
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
                    Text("KPI của \(PosBreakdown.short[pos] ?? pos) = cộng KPI từng người của POS này."
                         + (multiPos > 0 ? " \(multiPos) người làm nhiều POS: KPI người chưa chia theo POS nên đang tính đủ." : ""))
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
        .task(id: "\(ym)|\(pos.isEmpty)") { await load() }
        .pullToReload { await load(force: true) }
    }
    /// KPI tháng này (mọi scope) và danh sách team (dùng chung HrTeamCache). Đang chọn POS: thêm danh sách nhân viên (một lần).
    @MainActor private func load(force: Bool = false) async {
        #if DEBUG
        // Lượt chụp giao diện: tải sau khi số Tổng quan (tong-quan, trung-tam) xong, không bắn cùng lúc lên web ảo một luồng.
        if ProcessInfo.processInfo.environment["MEGATECH_TOUR"] == "giaodien" {
            try? await Task.sleep(for: .milliseconds(1500))
            var waited = 0
            while waited < 600, LoadBoard.shared.isRunning(["tong-quan", "trung-tam"]) {
                if Task.isCancelled { return }
                try? await Task.sleep(for: .milliseconds(250))
                waited += 1
            }
        }
        #endif
        let m = ym, needStaff = !pos.isEmpty && (force || saleStaff == nil || cskhStaff == nil || allStaff == nil)
        let trace = LoadTrace("tien-do-thang", requests: needStaff ? 5 : 2)
        async let tReq = attempt(true, trace) { try await API.targets(month: m) }
        async let lReq = attempt(true, trace) { try await HrTeamCache.list(force: force) }
        async let sReq = attempt(needStaff, trace) { try await API.employees(team: "sale") }
        async let cReq = attempt(needStaff, trace) { try await API.employees(team: "cskh") }
        async let aReq = attempt(needStaff, trace) { try await API.employees() }
        let (tRes, lRes, sRes, cRes, aRes) = await (tReq, lReq, sReq, cReq, aReq)
        trace.end(cancelled: Task.isCancelled)
        guard !Task.isCancelled else { return }
        var errors: [Error] = []
        func take<T>(_ r: Result<T, Error>?, _ set: (T) -> Void) {
            switch r {
            case .success(let v)?: set(v)
            case .failure(let e)?: errors.append(e)
            case nil: break
            }
        }
        take(tRes) { targets = $0.items }
        take(lRes) { teams = $0 }
        take(sRes) { saleStaff = $0 }
        take(cRes) { cskhStaff = $0 }
        take(aRes) { allStaff = $0 }
        failText = errors.compactMap { LoadError.text($0) }.first
    }
}

/// Badge "▲ 12 (10,0%)" ở Đơn cần lưu ý (khung 05): số đơn và tỷ lệ hoàn / huỷ; ≥7% đỏ ▲, 5–7% vàng !, <5% xanh ✓.
struct RefundCountBadge: View {
    let count: Double
    let rate: Double
    private var level: Int { rate >= 7 ? 2 : rate >= 5 ? 1 : 0 }
    var body: some View {
        let ink: Color = level == 2 ? Palette.bad : level == 1 ? Palette.warn : Palette.good
        let fill: Color = level == 2 ? Palette.badSoft : level == 1 ? Palette.warnSoft : Palette.goodSoft
        let mark = level == 2 ? "▲" : level == 1 ? "!" : "✓"
        Text("\(mark) \(Fmt.int(count)) (\(Fmt.pct(rate)))")
            .mtFont(.caption).fontWeight(.bold).foregroundStyle(ink)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(fill, in: .capsule)
            .accessibilityLabel("\(Fmt.int(count)) đơn, \(Fmt.pct(rate)) trên đơn chốt")
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
