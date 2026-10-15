import SwiftUI

// Chỉ ba lựa chọn này được nhớ; ngày, chỉ số và focus sống trong màn hiện tại.
struct CompareState: DynamicProperty {
    @AppStorage("thp_cmp_mode") var modeRaw = "previous"
    @AppStorage("thp_cmp_step") var stepRaw = "1"
    @AppStorage("thp_cmp_kind") var kindRaw = "wave"
    @State var metric: StaffMetric = .closed
    @State var start: Date?
    @State var end: Date?
    @State var focusId: String? = nil
    var mode: CmpMode {
        get { CmpMode(rawValue: modeRaw) ?? .previous }
        nonmutating set { modeRaw = newValue.rawValue }
    }
    var step: Int {
        get { mode.steps.contains(Int(stepRaw) ?? 1) ? Int(stepRaw)! : 1 }
        nonmutating set { stepRaw = Fmt.int(Double(newValue)) }
    }
    var kind: CmpKind {
        get { CmpKind(rawValue: kindRaw) ?? .wave }
        nonmutating set { kindRaw = newValue.rawValue }
    }
    var cstart: String? { start.map(VNDate.string) }
    var cend: String? { end.map(VNDate.string) }
    var needsDates: Bool { mode == .custom && (start == nil || end == nil) }
    var request: CompareRequest? { CompareRequest(mode: mode, step: step, start: cstart, end: cend, today: VNDate.string(.now)) }
    var validDates: Bool { !needsDates && request != nil }
    var requestKey: String {
        modeRaw + "|" + Fmt.int(Double(step)) + (mode == .custom ? "|\(cstart ?? "")|\(cend ?? "")" : "")
    }
}

// custom thiếu ngày luôn đi qua previous/1; ngày kỳ so do API trả, không tính trên máy.
struct CompareRequest {
    let mode: CmpMode
    let step: Int
    let start: String?
    let end: String?
    let bootstrap: Bool
    init?(mode: CmpMode, step: Int, start: String?, end: String?, today: String) {
        bootstrap = mode == .custom && (start == nil || end == nil)
        if mode == .custom && !bootstrap {
            guard let start, let end, VNDate.date(start) != nil, VNDate.date(end) != nil,
                  start <= end, end <= today else { return nil }
        }
        self.mode = bootstrap ? .previous : mode
        self.step = bootstrap || !mode.steps.contains(step) ? 1 : step
        self.start = mode == .custom && !bootstrap ? start : nil
        self.end = mode == .custom && !bootstrap ? end : nil
    }
}

// Các phép dưới chỉ chọn số máy chủ và tính hình học; không gộp điểm hay tính tỷ lệ chốt.
struct CompareMini {
    let current: API.CmpCell?
    let previous: API.CmpCell?
    let series: API.CmpSeries?
    let rates: API.CmpSeriesRate?
    static func value(_ cell: API.CmpCell?, _ metric: StaffMetric) -> Double? {
        switch metric {
        case .closed: return cell?.closed
        case .closedNet: return cell?.closedNet
        case .closeRate: return cell?.closeRate
        }
    }
    func change(_ metric: StaffMetric) -> String {
        let a = Self.value(current, metric), b = Self.value(previous, metric)
        return metric == .closeRate ? Fmt.changePoints(a, b) : Fmt.changePct(a, b)
    }
    // Giữ len của hai kỳ để cùng một giờ có cùng vị trí; phần sau cutoff là nil ở cả hai đường.
    func points(_ metric: StaffMetric, bucket: String, cutoff: String?) -> [(Double?, Double?)] {
        let a = series?.current ?? [], b = series?.previous ?? []
        let len = max(a.count, b.count)
        let limit = bucket == "hour" ? cutoff.flatMap { Int($0.prefix(2)) }.map { $0 + 1 } : nil
        func point(_ tuples: [[Double]], _ rates: [Double?]?, _ i: Int) -> Double? {
            guard i < tuples.count, limit.map({ i < $0 }) ?? true else { return nil }
            if metric == .closeRate { return rates.flatMap { i < $0.count ? $0[i] : nil } }
            let slot = metric == .closed ? 0 : 1
            return slot < tuples[i].count ? tuples[i][slot] : nil
        }
        return (0..<len).map { (point(a, rates?.current, $0), point(b, rates?.previous, $0)) }
    }
    static func scale(_ data: API.StaffCompare?, metric: StaffMetric) -> Double {
        if metric == .closeRate { return 100 }
        return max(0, data?.staff.flatMap { [value($0.current, metric) ?? 0, value($0.previous, metric) ?? 0] }.max() ?? 0)
    }
    static func bar(_ value: Double?, max: Double) -> Double {
        guard let value, value > 0, max > 0 else { return 0 }
        return Swift.max(0.03, value / max)
    }
}

extension CompareMini {
    init(_ staff: API.CmpStaff?) {
        current = staff?.current; previous = staff?.previous; series = staff?.series; rates = staff?.seriesRate
    }
    init(_ total: API.CmpTotals) {
        current = total.current; previous = total.previous; series = total.series; rates = total.seriesRate
    }
}

private func compareColor(_ a: Double?, _ b: Double?, metric: StaffMetric) -> Color {
    let tone = Fmt.changeTone(a, b, points: metric == .closeRate)
    return tone > 0 ? .good : tone < 0 ? .bad : .inkSoft
}

struct CompareCell: View {
    let mini: CompareMini
    let metric: StaffMetric
    let kind: CmpKind
    let max: Double
    let bucket: String
    let cutoff: String?
    private var a: Double? { CompareMini.value(mini.current, metric) }
    private var b: Double? { CompareMini.value(mini.previous, metric) }
    var body: some View {
        if a == nil && b == nil { Text("—").foregroundStyle(Color.inkSoft) }
        else {
            VStack(spacing: 2) {
                if metric != .closeRate || mini.rates != nil {
                    Canvas { context, _ in draw(&context) }.frame(width: 84, height: 20).accessibilityHidden(true)
                }
                HStack(spacing: 4) {
                    Text("trước " + Fmt.cmpShort(b, metric: metric.rawValue)).foregroundStyle(Color.inkSoft)
                    Text(mini.change(metric)).foregroundStyle(compareColor(a, b, metric: metric))
                }.font(.system(size: 11)).lineLimit(1)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(StaffTerms.current + ": " + Fmt.cmpShort(a, metric: metric.rawValue) + ", " + StaffTerms.previous + ": " + Fmt.cmpShort(b, metric: metric.rawValue) + ", " + mini.change(metric))
        }
    }
    private func draw(_ context: inout GraphicsContext) {
        if kind == .cum {
            for (i, value) in [a, b].enumerated() {
                let rect = CGRect(x: 0, y: i == 0 ? 4 : 12, width: 84 * CompareMini.bar(value, max: max), height: 4)
                context.fill(Path(roundedRect: rect, cornerRadius: 2), with: .color(i == 0 ? .brand : .inkSoft))
            }
            return
        }
        let points = mini.points(metric, bucket: bucket, cutoff: cutoff)
        func x(_ i: Int) -> Double { points.count <= 1 ? 42 : 2 + Double(i) / Double(points.count - 1) * 80 }
        if kind == .wave {
            let hi = Swift.max(1e-9, points.flatMap { [$0.0 ?? 0, $0.1 ?? 0] }.max() ?? 0)
            func y(_ v: Double) -> Double { 17 - v / hi * 14 }
            func path(_ previous: Bool) -> Path {
                var p = Path(); var first = true
                for (i, point) in points.enumerated() {
                    guard let v = previous ? point.1 : point.0 else { continue }
                    let position = CGPoint(x: x(i), y: y(v))
                    if first { p.move(to: position); first = false } else { p.addLine(to: position) }
                }
                return p
            }
            context.stroke(path(true), with: .color(.inkSoft), style: StrokeStyle(lineWidth: 1.3, dash: [3, 2]))
            let color = compareColor(a, b, metric: metric)
            context.stroke(path(false), with: .color(color), style: StrokeStyle(lineWidth: 1.7, lineCap: .round, lineJoin: .round))
            if let last = points.indices.last(where: { points[$0].0 != nil }), let v = points[last].0 {
                context.fill(Path(ellipseIn: CGRect(x: x(last) - 1.8, y: y(v) - 1.8, width: 3.6, height: 3.6)), with: .color(color))
            }
        } else {
            var line = Path(); line.move(to: CGPoint(x: 0, y: 10)); line.addLine(to: CGPoint(x: 84, y: 10))
            context.stroke(line, with: .color(.inkSoft.opacity(0.3)), lineWidth: 1)
            let differences = points.map { p -> Double? in guard let a = p.0, let b = p.1 else { return nil }; return a - b }
            let hi = Swift.max(1e-9, differences.compactMap { $0.map(abs) }.max() ?? 0)
            let width = Swift.max(1.5, Swift.min(6, 80 / Double(Swift.max(1, points.count)) - 1.5))
            for (i, delta) in differences.enumerated() {
                guard let delta, delta != 0 else { continue }
                let height = Swift.max(1, abs(delta) / hi * 9)
                let rect = CGRect(x: x(i) - width / 2, y: delta > 0 ? 10 - height : 10, width: width, height: height)
                context.fill(Path(roundedRect: rect, cornerRadius: 1), with: .color(delta > 0 ? .good : .bad))
            }
        }
    }
}

struct CompareControls: View {
    @Binding private var mode: CmpMode
    @Binding private var step: Int
    @Binding private var kind: CmpKind
    @Binding private var metric: StaffMetric
    @Binding private var start: Date?
    @Binding private var end: Date?
    // Truyền Binding từ màn chủ, không cài thêm một bản @State của ngày/chỉ số trong view con.
    init(state: CompareState, data: API.StaffCompare?, focus: String?, error: String?, retry: @escaping () async -> Void) {
        _mode = Binding(get: { state.mode }, set: { state.mode = $0 })
        _step = Binding(get: { state.step }, set: { state.step = $0 })
        _kind = Binding(get: { state.kind }, set: { state.kind = $0 })
        _metric = Binding(get: { state.metric }, set: { state.metric = $0 })
        _start = Binding(get: { state.start }, set: { state.start = $0 })
        _end = Binding(get: { state.end }, set: { state.end = $0 })
        self.data = data; self.focus = focus; self.error = error; self.retry = retry
    }
    let data: API.StaffCompare?
    let focus: String?
    let error: String?
    let retry: () async -> Void
    private var days: Int { data.map { API.DayRange(start: $0.period.start, end: $0.period.end).days ?? 1 } ?? 1 }
    private var today: Date { VNDate.date(VNDate.string(.now))! }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(StaffTerms.compare).font(.subheadline.weight(.semibold))
                Menu {
                    ForEach(CmpMode.allCases, id: \.self) { choice in Button(choice.label) { mode = choice } }
                } label: { Label(mode.label, systemImage: "chevron.down") }
                if mode.steps.count > 1 {
                    Menu {
                        ForEach(mode.steps, id: \.self) { n in
                            Button(stepLabel(mode: mode, n: n, days: days)) { step = n }
                        }
                    } label: { Text(stepLabel(mode: mode, n: step, days: days)) }
                    .accessibilityLabel(StaffTerms.step)
                }
            }.font(.caption)
            if mode == .custom, let from = start, let to = end {
                DatePicker(StaffTerms.startDate, selection: Binding(get: { start ?? from }, set: { start = $0 }), in: ...Swift.min(to, today), displayedComponents: .date)
                DatePicker(StaffTerms.endDate, selection: Binding(get: { end ?? to }, set: { end = $0 }), in: Swift.min(from, today)...today, displayedComponents: .date)
                if CompareRequest(mode: mode, step: step, start: start.map(VNDate.string), end: end.map(VNDate.string), today: VNDate.string(.now)) == nil { Text("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc và không sau hôm nay.").font(.caption).foregroundStyle(Color.warn) }
            }
            Segmented(selection: Binding(get: { kind }, set: { kind = $0 }), options: CmpKind.allCases.map { ($0, $0.label) })
            Text(StaffTerms.perEmployee).font(.caption).foregroundStyle(Color.inkSoft)
            Segmented(selection: Binding(get: { metric }, set: { metric = $0 }), options: StaffMetric.allCases.map { ($0, $0.label) })
            if let error { StateView(error: error) { await retry() } }
            else if let data { totals(data) }
            else { StateView(loading: "Đang tải so cùng kỳ…") }
        }
        .environment(\.timeZone, VNDate.tz)
        .environment(\.calendar, Calendar(identifier: .gregorian))
    }
    private func totals(_ data: API.StaffCompare) -> some View {
        let staff = focus.flatMap { id in data.staff.first { $0.sellerId == id } }
        let a = CompareMini.value(focus == nil ? data.current.total : staff?.current, metric)
        let b = CompareMini.value(focus == nil ? data.previous.total : staff?.previous, metric)
        let suffix = data.compare.cutoff.map(StaffTerms.until) ?? ""
        let now = VNDate.string(.now)
        let curText = data.period.start == now && data.period.end == now ? StaffTerms.today : Fmt.cmpSpan(data.period.start, data.period.end)
        return VStack(alignment: .leading, spacing: 4) {
            Text(StaffTerms.current + " · " + curText + suffix).font(.caption).foregroundStyle(Color.inkSoft)
            Text(metric == .closedNet ? Fmt.shortVnd(a) : Fmt.cmpShort(a, metric: metric.rawValue)).font(.title3.bold()).monospacedDigit()
            Text(cmpLabel(mode: CmpMode(rawValue: data.mode) ?? .previous, n: data.step, days: days) + " · " + Fmt.cmpSpan(data.compare.start, data.compare.end) + suffix).font(.caption).foregroundStyle(Color.inkSoft)
            Text(metric == .closedNet ? Fmt.shortVnd(b) : Fmt.cmpShort(b, metric: metric.rawValue)).font(.title3.bold()).monospacedDigit()
            Text((metric == .closeRate ? Fmt.changePoints(a, b) : Fmt.changePct(a, b)) + " " + StaffTerms.versus)
                .font(.caption.weight(.semibold)).foregroundStyle(compareColor(a, b, metric: metric))
            if let cutoff = data.compare.cutoff { Text(StaffTerms.cutoffNotice(cutoff)).font(.caption).foregroundStyle(Color.inkSoft) }
        }
    }
}

#if DEBUG
// Chỉ dùng để lượt quay chờ đúng dữ liệu trước khi đặt mốc chụp, không lưu số hay tên.
@MainActor enum CompareTourStatus { static var ready = false }
#endif
