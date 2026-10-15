import SwiftUI
import Charts

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

// Cùng nguồn cho hai số tổng và biểu đồ: thiếu người/chart không thay bằng số cả đội.
struct CompareSummary {
    let current: API.CmpCell?
    let previous: API.CmpCell?
    let chart: API.CmpChart?
    init(_ data: API.StaffCompare, focus: String?) {
        if let focus {
            let staff = data.staff.first { $0.sellerId == focus }
            current = staff?.current; previous = staff?.previous; chart = staff?.chart
        } else {
            current = data.current.total; previous = data.previous.total; chart = data.chart
        }
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
    @Binding private var focus: String?
    // Truyền Binding từ màn chủ, không cài thêm một bản @State của ngày/chỉ số trong view con.
    init(state: CompareState, data: API.StaffCompare?, focusName: String?, clearFocus: @escaping () -> Void, error: String?, retry: @escaping () async -> Void) {
        _mode = Binding(get: { state.mode }, set: { state.mode = $0 })
        _step = Binding(get: { state.step }, set: { state.step = $0 })
        _kind = Binding(get: { state.kind }, set: { state.kind = $0 })
        _metric = Binding(get: { state.metric }, set: { state.metric = $0 })
        _start = Binding(get: { state.start }, set: { state.start = $0 })
        _end = Binding(get: { state.end }, set: { state.end = $0 })
        _focus = Binding(get: { state.focusId }, set: { state.focusId = $0 })
        self.data = data; self.focusName = focusName; self.clearFocus = clearFocus; self.error = error; self.retry = retry
    }
    let data: API.StaffCompare?
    let focusName: String?
    let clearFocus: () -> Void
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
            if focus != nil {
                VStack(alignment: .leading, spacing: 6) {
                    Button(action: clearFocus) {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.left")
                            Text(StaffTerms.allStaff)
                        }
                    }.font(.caption.weight(.semibold)).buttonStyle(.borderedProminent).tint(.brand)
                    (Text(StaffTerms.focus("")) + Text(focusName ?? "—").bold())
                        .font(.caption).fixedSize(horizontal: false, vertical: true)
                }.padding(8).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.brandSoft, in: RoundedRectangle(cornerRadius: 8))
            } else {
                Text(StaffTerms.allStaffHint).font(.caption2).foregroundStyle(Color.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let error { StateView(error: error) { await retry() } }
            else if let data { totals(data) }
            else { StateView(loading: "Đang tải so cùng kỳ…") }
        }
        .environment(\.timeZone, VNDate.tz)
        .environment(\.calendar, Calendar(identifier: .gregorian))
        #if DEBUG
        .onChange(of: DebugTap.shared.tick) { _, _ in
            guard ProcessInfo.processInfo.environment["MEGATECH_TOUR"] == "xnkho" else { return }
            switch DebugTap.shared.target {
            case "xnk-chart-closed": metric = .closed
            case "xnk-chart-net": metric = .closedNet
            case "xnk-chart-rate": metric = .closeRate
            case "xnk-chart-year": mode = .year; step = 1
            case "xnk-chart-unequal":
                // Một ngày lấy từ kỳ so máy chủ vừa trả; không tự tính ngày kỳ so.
                if let day = data.flatMap({ VNDate.date($0.compare.end) }) {
                    start = day; end = day; mode = .custom
                }
            default: break
            }
        }
        #endif
    }
    private func totals(_ data: API.StaffCompare) -> some View {
        let summary = CompareSummary(data, focus: focus)
        let a = CompareMini.value(summary.current, metric)
        let b = CompareMini.value(summary.previous, metric)
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
            if let chart = summary.chart {
                CompareChart(chart: chart, kind: kind, metric: metric, bucket: data.bucket, group: data.group, period: data.period, compare: data.compare)
                    .id(focus) // Đổi người bỏ điểm chạm cũ, nhưng vẫn giữ id cuộn của khung.
                    .id("bieu-do-so-cung-ky")
            }
            if let cutoff = data.compare.cutoff { Text(StaffTerms.cutoffNotice(cutoff)).font(.caption).foregroundStyle(Color.inkSoft) }
        }
    }
}

// Chọn trường W5 và chia đường tại null. Không cắt theo đồng hồ, gộp hay cộng dồn số.
struct CompareChartData {
    struct Point: Identifiable {
        let id: Int
        let current: Double?
        let previous: Double?
        let currentSegment: Int
        let previousSegment: Int
        var difference: Double? {
            guard let current, let previous else { return nil }
            return current - previous
        }
    }
    let metric: StaffMetric
    let points: [Point]
    init(chart: API.CmpChart, kind: CmpKind, metric: StaffMetric) {
        self.metric = kind == .cum && metric != .closed ? .closedNet : metric
        func value(_ point: API.ChartPoint?) -> Double? {
            guard let point else { return nil }
            if kind == .cum { return metric == .closed ? point.cumClosed : point.cumClosedNet }
            switch metric {
            case .closed: return point.closed
            case .closedNet: return point.closedNet
            case .closeRate: return point.closeRate
            }
        }
        var aSegment = 0, bSegment = 0
        points = (0..<max(0, chart.len)).map { i in
            let a = value(i < chart.current.count ? chart.current[i] : nil)
            let b = value(i < chart.previous.count ? chart.previous[i] : nil)
            if a == nil { aSegment += 1 }
            if b == nil { bSegment += 1 }
            return Point(id: i, current: a, previous: b, currentSegment: aSegment, previousSegment: bSegment)
        }
    }
    func selected(_ x: Double?) -> Point? {
        guard let x, x.isFinite, !points.isEmpty else { return nil }
        let i = min(Double(points.count - 1), max(0, x.rounded()))
        return points[Int(i)]
    }
    var tourIndices: [Int] {
        let valid = points.filter { $0.current != nil }.map(\.id)
        guard let first = valid.first, let last = valid.last else { return [] }
        return [first, valid[valid.count / 2], last]
    }
}

struct CompareChart: View {
    let chart: API.CmpChart
    let kind: CmpKind
    let metric: StaffMetric
    let bucket: String
    let group: Int
    let period: API.StaffPeriod
    let compare: API.CmpPeriod
    @State private var selection: Double?
    private var data: CompareChartData { CompareChartData(chart: chart, kind: kind, metric: metric) }
    private var ticks: [Int] {
        let n = max(0, chart.len)
        guard n > 0 else { return [] }
        return Array(Set(Array(stride(from: 0, to: n, by: max(1, (n + 4) / 5))) + [n - 1])).sorted()
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(kind.title).font(.caption).foregroundStyle(Color.inkSoft)
            plot
                .frame(height: 160)
                .chartXScale(domain: -0.5...Double(max(1, chart.len)) - 0.5)
                .chartXSelection(value: $selection)
                .chartLegend(.hidden)
                .chartXAxis {
                    AxisMarks(values: ticks) { value in
                        AxisGridLine()
                        AxisValueLabel {
                            if let i = value.as(Int.self) {
                                Text(Fmt.chartX(i, bucket: bucket, cumulative: kind == .cum, start: period.start, group: group))
                            }
                        }
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading) { value in
                        AxisGridLine()
                        AxisValueLabel {
                            if let y = value.as(Double.self) { Text(Fmt.chartAxis(y, metric: data.metric.rawValue)) }
                        }
                    }
                }
                .overlay(alignment: .topTrailing) {
                    if let point = data.selected(selection) { tooltip(point).allowsHitTesting(false) }
                }
            HStack(spacing: 14) {
                legend(StaffTerms.current, color: .brand, dashed: false)
                legend(StaffTerms.previous, color: .inkSoft, dashed: true)
            }.font(.caption2).foregroundStyle(Color.inkSoft)
        }
        .onChange(of: kind) { _, _ in selection = nil }
        .onChange(of: metric) { _, _ in selection = nil }
        #if DEBUG
        .onAppear { logChart() }
        .onChange(of: kind) { _, _ in logChart() }
        .onChange(of: metric) { _, _ in logChart() }
        .onChange(of: DebugTap.shared.tick) { _, _ in
            guard ProcessInfo.processInfo.environment["MEGATECH_TOUR"] == "xnkho" else { return }
            let targets = ["xnk-chart-first", "xnk-chart-middle", "xnk-chart-last"]
            if let slot = targets.firstIndex(of: DebugTap.shared.target), data.tourIndices.count == 3 {
                // Cùng lựa chọn với chartXSelection; lượt quay không tự tạo số.
                selection = Double(data.tourIndices[slot])
                if let point = data.selected(selection) { logPoint(point) }
            }
            if DebugTap.shared.target == "xnk-chart-clear" { selection = nil }
        }
        #endif
    }
    private var plot: some View {
        Chart {
            ForEach(data.points) { point in
                if kind == .diff {
                    if let difference = point.difference {
                        BarMark(x: .value("Điểm", point.id), y: .value(StaffTerms.difference, difference))
                            .foregroundStyle(difference >= 0 ? Color.good : Color.bad)
                    }
                } else {
                    if let a = point.current {
                        LineMark(x: .value("Điểm", point.id), y: .value(StaffTerms.current, a), series: .value("Đường", point.currentSegment * 2))
                            .foregroundStyle(Color.brand).lineStyle(StrokeStyle(lineWidth: 2))
                            .symbol(.circle).symbolSize(6)
                    }
                    if let b = point.previous {
                        LineMark(x: .value("Điểm", point.id), y: .value(StaffTerms.previous, b), series: .value("Đường", point.previousSegment * 2 + 1))
                            .foregroundStyle(Color.inkSoft).lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                            .symbol(.circle).symbolSize(6)
                    }
                }
            }
            if let point = data.selected(selection) {
                RuleMark(x: .value("Điểm", point.id)).foregroundStyle(Color.inkSoft.opacity(0.5))
            }
        }
    }
    private func time(_ point: CompareChartData.Point, previous: Bool) -> String {
        Fmt.chartTime(point.id, bucket: bucket, cumulative: kind == .cum,
                      start: previous ? compare.start : period.start, end: previous ? compare.end : period.end, group: group)
    }
    private func tooltip(_ point: CompareChartData.Point) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            tipLine(StaffTerms.currentPoint(time(point, previous: false)), value: Fmt.chartPointValue(point.current, metric: data.metric.rawValue), color: .brand)
            tipLine(StaffTerms.previousPoint(time(point, previous: true)), value: Fmt.chartPointValue(point.previous, metric: data.metric.rawValue), color: .inkSoft)
            if let diff = Fmt.chartDiff(point.current, point.previous, metric: data.metric.rawValue) {
                Divider()
                tipLine(StaffTerms.difference, value: diff.text, color: diff.up ? .good : .bad)
            }
        }
        .font(.caption2).monospacedDigit().padding(8)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.inkSoft.opacity(0.2)))
        .fixedSize(horizontal: false, vertical: true)
    }
    private func tipLine(_ label: String, value: String, color: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(label).foregroundStyle(Color.inkSoft)
            Spacer(minLength: 4)
            Text(value).fontWeight(.semibold).foregroundStyle(color)
        }
    }
    private func legend(_ label: String, color: Color, dashed: Bool) -> some View {
        HStack(spacing: 4) {
            Path { path in path.move(to: CGPoint(x: 0, y: 1)); path.addLine(to: CGPoint(x: 14, y: 1)) }
                .stroke(color, style: StrokeStyle(lineWidth: dashed ? 1.5 : 2, dash: dashed ? [4, 3] : []))
                .frame(width: 14, height: 2)
            Text(label)
        }
    }
    #if DEBUG
    private func logChart() {
        guard ProcessInfo.processInfo.environment["MEGATECH_TOUR"] == "xnkho" else { return }
        print("[XNK] bieu-do kind=\(kind.rawValue) diem=\(Fmt.int(Double(chart.len)))")
    }
    private func logPoint(_ point: CompareChartData.Point) {
        guard ProcessInfo.processInfo.environment["MEGATECH_TOUR"] == "xnkho" else { return }
        let diff = Fmt.chartDiff(point.current, point.previous, metric: data.metric.rawValue)?.text ?? "—"
        print("[XNK] cham kind=\(kind.rawValue) i=\(Fmt.int(Double(point.id))) nay=\(Fmt.chartPointValue(point.current, metric: data.metric.rawValue)) so=\(Fmt.chartPointValue(point.previous, metric: data.metric.rawValue)) chenh=\(diff)")
    }
    #endif
}

#if DEBUG
// Chỉ dùng để lượt quay chờ đúng dữ liệu trước khi đặt mốc chụp, không lưu số hay tên.
@MainActor enum CompareTourStatus { static var ready = false }
#endif
