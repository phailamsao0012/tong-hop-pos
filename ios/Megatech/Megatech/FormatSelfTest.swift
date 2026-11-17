#if DEBUG
import Foundation

// Kiểm thử chuỗi bước 1.1a (chỉ bản Debug): bộ số mẫu cố định chạy qua code cũ (enum Legacy, chép nguyên văn từ origin/main
// 3e4e35a) và hàm mới ở Format.swift, chữ phải trùng từng ký tự. Mở app với MEGATECH_FORMAT_TEST=1 (CI ios-preview.yml):
// in "FORMAT_TEST …" ra log rồi thoát, trước giao diện và trước mạng (MegatechApp.init).
// Code cũ không đặt locale thì theo locale của máy đang chạy (máy ảo CI: en_US), nên so cũ / mới ngay trên máy đó.
// Riêng chỗ code cũ theo locale và kiểu 12 / 24 giờ của máy (giờ ở trang Thông báo, nhãn trục biểu đồ MKT) thì so hàm mới
// với chữ mong đợi viết sẵn, là chữ máy tiếng Việt 24 giờ hiện ra.

enum FormatSelfTest {
    static func runAndExit() -> Never {
        var r = Run()
        numbers(&r)
        percents(&r)
        deltas(&r)
        lines(&r)
        dates(&r)
        isoStrings(&r)
        dayStrings(&r)
        monthStrings(&r)
        relative(&r)
        literals(&r)
        compare(&r)
        compact(&r)
        emit(r.failed == 0 ? "FORMAT_TEST OK \(r.total) cases" : "FORMAT_TEST FAILED \(r.failed)/\(r.total)")
        exit(r.failed == 0 ? 0 : 1)
    }

    private static func compact(_ r: inout Run) {
        let cases: [(Double, String, String)] = [
            (0, "0", "₫"), (850_000, "850.000", "₫"), (999_999, "999.999", "₫"),
            (999_999.6, "1,0", "tr\u{00A0}₫"), (1_000_000, "1,0", "tr\u{00A0}₫"),
            (8_700_000, "8,7", "tr\u{00A0}₫"), (133_420_000, "133,4", "tr\u{00A0}₫"),
            (999_940_000, "999,9", "tr\u{00A0}₫"), (999_950_000, "1,00", "tỷ\u{00A0}₫"),
            (999_960_000, "1,00", "tỷ\u{00A0}₫"), (1_264_000_000, "1,26", "tỷ\u{00A0}₫"),
            (1_266_000_000, "1,27", "tỷ\u{00A0}₫"), (999_996_000_000, "1.000", "tỷ\u{00A0}₫"),
            (12_345_000_000_000, "12.345", "tỷ\u{00A0}₫"), (-8_700_000, "-8,7", "tr\u{00A0}₫"),
            (-999_999.6, "-1,0", "tr\u{00A0}₫"), (-999_950_000, "-1,00", "tỷ\u{00A0}₫")
        ]
        for (n, value, unit) in cases {
            let actual = Fmt.compactMoney(n)
            r.eq("compact-\(n)-value", value, actual.value)
            r.eq("compact-\(n)-unit", unit, actual.unit)
        }
    }
    private struct Run {
        var total = 0
        var failed = 0
        mutating func eq(_ name: String, _ old: String, _ new: String) {
            total += 1
            guard old != new else { return }
            failed += 1
            emit("FORMAT_TEST FAIL \(name): old=\(old) new=\(new)")
        }
    }

    /// Chuỗi viết sẵn theo plan I1 và web staff-compare.tsx; không lấy hàm đang kiểm làm đáp án.
    private static func compare(_ r: inout Run) {
        let diffs: [(Double?, Double?, String, String?, Bool?)] = [
            (30, 12, "closed", "+18", true), (12, 30, "closed", "−18", false),
            (12, 12, "closed", "+0", true), (30_000_000, 12_000_000, "closedNet", "+18,0 tr ₫", true),
            (12_000_000, 30_000_000, "closedNet", "−18,0 tr ₫", false),
            (37.5, 40, "closeRate", "−2,5 điểm", false), (40, 37.5, "closeRate", "+2,5 điểm", true),
            (0, 0, "closeRate", "+0,0 điểm", true), (0, 0, "closedNet", "+0 ₫", true),
            (12, nil, "closed", nil, nil), (nil, 12, "closed", nil, nil), (nil, nil, "closed", nil, nil)
        ]
        for (i, c) in diffs.enumerated() {
            let result = Fmt.chartDiff(c.0, c.1, metric: c.2)
            r.eq("chartDiff-text-\(i)", c.3 ?? "nil", result?.text ?? "nil")
            r.eq("chartDiff-up-\(i)", c.4.map { $0 ? "true" : "false" } ?? "nil", result.map { $0.up ? "true" : "false" } ?? "nil")
        }
        r.eq("chart-axis-rate", "38%", Fmt.chartAxis(37.5, metric: "closeRate"))
        r.eq("chart-axis-net", "18,0 tr", Fmt.chartAxis(18_000_000, metric: "closedNet"))
        r.eq("chart-axis-count", "1.234", Fmt.chartAxis(1234, metric: "closed"))
        r.eq("chart-point-net", "18,0 tr ₫", Fmt.chartPointValue(18_000_000, metric: "closedNet"))
        r.eq("chart-point-null", "—", Fmt.chartPointValue(nil, metric: "closedNet"))
        r.eq("chart-x-hour", "3h", Fmt.chartX(3, bucket: "hour", cumulative: false, start: "", group: 12))
        r.eq("chart-x-cum-hour", "24h", Fmt.chartX(23, bucket: "hour", cumulative: true, start: "", group: 12))
        r.eq("chart-x-day-group", "07/10", Fmt.chartX(2, bucket: "day", cumulative: false, start: "2026-10-01", group: 3))
        r.eq("chart-time-hour", "3:00–4:00", Fmt.chartTime(3, bucket: "hour", cumulative: false, start: "", end: "", group: 12))
        r.eq("chart-time-cum-hour", "tới 24:00", Fmt.chartTime(23, bucket: "hour", cumulative: true, start: "", end: "", group: 12))
        r.eq("chart-time-day", "T5 01/10", Fmt.chartTime(0, bucket: "day", cumulative: false, start: "2026-10-01", end: "2026-10-31", group: 1))
        r.eq("chart-time-cum-day", "tới T5 01/10", Fmt.chartTime(0, bucket: "day", cumulative: true, start: "2026-10-01", end: "2026-10-31", group: 1))
        r.eq("chart-time-short-end", "28/10–30/10", Fmt.chartTime(9, bucket: "day", cumulative: false, start: "2026-10-01", end: "2026-10-30", group: 3))
        r.eq("chart-time-cum-group", "tới 28/10–30/10", Fmt.chartTime(9, bucket: "day", cumulative: true, start: "2026-10-01", end: "2026-10-30", group: 3))
        r.eq("chart-time-invalid", "—", Fmt.chartTime(0, bucket: "day", cumulative: false, start: "bad", end: "", group: 1))

        let changes: [(Double?, Double?, String)] = [
            (12, 0, "mới"), (0, 0, "0,0%"), (10, 10, "0,0%"),
            (nil, 5, "—"), (5, nil, "—"), (nil, nil, "—"),
            (9, 8, "+12,5%"), (97, 100, "−3,0%"), (0, 12, "−100,0%"),
            (1_350_000_000, 1_200_000_000, "+12,5%"),
            (2_910_000, 3_000_000, "−3,0%"), (10.004, 10, "+0,0%"),
            (9.996, 10, "−0,0%"), (-8, -10, "−20,0%")
        ]
        for (i, c) in changes.enumerated() { r.eq("changePct-\(i)", c.2, Fmt.changePct(c.0, c.1)) }
        let points: [(Double?, Double?, String)] = [
            (2.2, 1, "+1,2 điểm"), (1, 1.4, "−0,4 điểm"), (12, 12, "+0,0 điểm"),
            (0, 0, "+0,0 điểm"), (nil, 5, "—"), (5, nil, "—"), (nil, nil, "—"),
            (1.004, 1, "+0,0 điểm"), (1, 1.004, "−0,0 điểm")
        ]
        for (i, c) in points.enumerated() { r.eq("changePoints-\(i)", c.2, Fmt.changePoints(c.0, c.1)) }
        let tones: [(Double?, Double?, Bool, Int)] = [
            (12, 0, false, 1), (0, 0, false, 0), (12, 12, false, 0),
            (9, 8, false, 1), (8, 9, false, -1), (nil, 5, false, 0), (5, nil, false, 0),
            (2.2, 1, true, 1), (1, 1.4, true, -1), (12, 12, true, 0),
            (nil, 5, true, 0), (5, nil, true, 0), (12, 0, true, 1), (0, 12, true, -1),
            (-8, -10, false, -1), (-8, -10, true, 1), (10.004, 10, false, 1)
        ]
        for (i, c) in tones.enumerated() { r.eq("changeTone-\(i)", "\(c.3)", "\(Fmt.changeTone(c.0, c.1, points: c.2))") }
        r.eq("cmpShort-closed", "1.234", Fmt.cmpShort(1234, metric: "closed"))
        r.eq("cmpShort-closedNet-tr", "12,5 tr", Fmt.cmpShort(12_500_000, metric: "closedNet"))
        r.eq("cmpShort-closedNet-ty", "1,30 tỷ", Fmt.cmpShort(1_300_000_000, metric: "closedNet"))
        r.eq("cmpShort-closeRate", "40,0%", Fmt.cmpShort(40, metric: "closeRate"))
        for metric in StaffMetric.allCases {
            r.eq("cmpShort-nil-\(metric.rawValue)", "—", Fmt.cmpShort(nil, metric: metric.rawValue))
            r.eq("cmpShort-zero-\(metric.rawValue)", metric == .closeRate ? "0,0%" : "0", Fmt.cmpShort(0, metric: metric.rawValue))
        }
        let weekdays = [("2026-10-11", "CN"), ("2026-10-12", "T2"), ("2026-10-13", "T3"),
                        ("2026-10-14", "T4"), ("2026-10-15", "T5"), ("2026-10-16", "T6"), ("2026-10-17", "T7")]
        for (date, expected) in weekdays { r.eq("weekdayShort-\(date)", expected, Fmt.weekdayShort(date)) }
        r.eq("weekdayShort-invalid", "—", Fmt.weekdayShort("garbage"))
        r.eq("weekdayShort-leap", "T5", Fmt.weekdayShort("2024-02-29"))
        r.eq("cmpSpan-day", "T2 12/10", Fmt.cmpSpan("2026-10-12", "2026-10-12"))
        r.eq("cmpSpan-range", "01/10–12/10", Fmt.cmpSpan("2026-10-01", "2026-10-12"))
        r.eq("cmpSpan-year", "31/12–01/01", Fmt.cmpSpan("2025-12-31", "2026-01-01"))

        let modes: [(CmpMode, String, String, String, [Int])] = [
            (.previous, "Kỳ liền trước", "Kỳ trước", "Hôm nay so hôm qua, tuần này so tuần trước, tháng này so tháng trước", [1, 2, 3, 4]),
            (.weekday, "Cùng thứ tuần trước", "Cùng thứ", "Thứ Hai so thứ Hai tuần trước (cả kỳ lùi đủ số tuần để từng ngày trùng thứ)", [1, 2, 3, 4, 8]),
            (.monthday, "Cùng ngày tháng trước", "Cùng ngày", "Ngày 2 so ngày 2 tháng trước (tháng thiếu ngày thì lấy ngày cuối tháng)", [1, 2, 3, 6, 12]),
            (.year, "Cùng kỳ năm trước", "Năm trước", "Cùng ngày năm trước", [1, 2]),
            (.custom, "Tự chọn ngày", "Tự chọn", "Tự chọn hai ngày của kỳ so", [])
        ]
        r.eq("mode-order", "previous,weekday,monthday,year,custom", CmpMode.allCases.map(\.rawValue).joined(separator: ","))
        for (mode, label, short, title, steps) in modes {
            r.eq("mode-label-\(mode.rawValue)", label, mode.label)
            r.eq("mode-short-\(mode.rawValue)", short, mode.short)
            r.eq("mode-title-\(mode.rawValue)", title, mode.title)
            r.eq("mode-steps-\(mode.rawValue)", "\(steps)", "\(mode.steps)")
            r.eq("cmpLabel-default-\(mode.rawValue)", label, cmpLabel(mode: mode, n: 1, days: 7))
        }
        let labels: [(CmpMode, Int, Int, String, String)] = [
            (.previous, 2, 30, "2 kỳ trước", "Lùi 2 kỳ"),
            (.weekday, 2, 7, "2 tuần trước", "Cùng thứ, 2 tuần trước"),
            (.weekday, 1, 8, "lùi 2 tuần", "Cùng thứ, lùi 2 tuần"),
            (.weekday, 2, 14, "lùi 4 tuần", "Cùng thứ, lùi 4 tuần"),
            (.weekday, 3, 15, "lùi 9 tuần", "Cùng thứ, lùi 9 tuần"),
            (.monthday, 3, 30, "3 tháng trước", "Cùng ngày 3 tháng trước"),
            (.year, 2, 365, "2 năm trước", "Cùng kỳ 2 năm trước"),
            (.custom, 1, 30, "", "Tự chọn ngày")
        ]
        for (i, c) in labels.enumerated() {
            r.eq("stepLabel-\(i)", c.3, stepLabel(mode: c.0, n: c.1, days: c.2))
            r.eq("cmpLabel-\(i)", c.4, cmpLabel(mode: c.0, n: c.1, days: c.2))
        }
        r.eq("kind-order", "wave,diff,cum", CmpKind.allCases.map(\.rawValue).joined(separator: ","))
        for (kind, label, title) in [
            (CmpKind.wave, "Lên xuống", "Từng ngày (xem một ngày thì từng giờ) của kỳ này và kỳ so"),
            (.diff, "Chênh lệch", "Mỗi cột là kỳ này trừ kỳ so: xanh lên là hơn, đỏ xuống là kém"),
            (.cum, "Cộng dồn", "Cộng dồn từ đầu kỳ")
        ] {
            r.eq("kind-label-\(kind.rawValue)", label, kind.label)
            r.eq("kind-title-\(kind.rawValue)", title, kind.title)
        }
        r.eq("metric-order", "closed,closedNet,closeRate", StaffMetric.allCases.map(\.rawValue).joined(separator: ","))
        r.eq("metric-labels", "Đơn chốt|Doanh thu|Tỷ lệ chốt", StaffMetric.allCases.map(\.label).joined(separator: "|"))
        r.eq("metric-nouns", "đơn chốt|doanh thu|tỷ lệ chốt", StaffMetric.allCases.map(\.noun).joined(separator: "|"))
        r.eq("terms-closed", "12/30 đã chốt", StaffTerms.alreadyClosed(12, 30))
        r.eq("terms-packed", "12/30 đơn chốt", StaffTerms.packedOrders(12, 30))
        r.eq("terms-firstOrders", "Đang hiện 12 đơn đầu trong 30 đơn", StaffTerms.firstOrders(12, total: 30))
        r.eq("terms-people", "12 người", StaffTerms.people(12))
        r.eq("terms-showAll", "Xem cả 12 người", StaffTerms.showAll(12))
        r.eq("terms-mentor", "Mentor NV A", StaffTerms.mentor("NV A"))
        r.eq("terms-focus", "Đang xem riêng NV A", StaffTerms.focus("NV A"))
        r.eq("terms-card", "Chốt nóng chưa lọc theo team.", StaffTerms.cardUnfiltered("Chốt nóng"))
        r.eq("terms-team", "Đang xem riêng team Team A — số trên trang chỉ tính người đang thuộc team này bên web nhân sự (theo team hiện tại: người chuyển team thì số các kỳ trước đi theo team mới; người đã nghỉ không tính).", StaffTerms.teamNotice("Team A"))
        r.eq("terms-unfiltered", "Trang này chưa lọc được theo team — đang hiện số cả nhóm Sale, không riêng team Team A. Xem theo team ở Tổng quan, Sale › Nhân viên, CSKH › Tổng quan và Vận đơn.", StaffTerms.teamUnfiltered(dept: "Sale", name: "Team A"))
    }

    // MARK: Bộ mẫu

    /// Có bộ số mẫu của kế hoạch 1.1: 0; 850.000; 950.000; 999.950.000 (mốc "999,9 tr" / "1000,0 tr"); 999.960.000; 1,3 tỷ; số âm; −0,04.
    private static let nums: [Double] = [0, 0.4, 0.5, 1, 999, 1000, 12_345.5, 850_000, 950_000, 999_949, 999_950, 1_000_000, 12_500_000,
                                         999_950_000, 999_960_000, 999_999_999.9, 1_000_000_000, 1_300_000_000, -2_500_000, -0.4, -0.04,
                                         -0.5, 1.5, 2.5, 0.125, 1.005, 3.95, 999_994_999, -999_960_000]
    private static let pcts: [Double?] = [nil, 0, 0.04, 22.06, 99.95, 100, -3.75, 0.05, 0.15, 0.25, 33.35, -0.04]
    private static let deltaPairs: [(Double, Double?)] = [(100, nil), (100, 0), (100, -50), (0, 100), (150, 100), (99.5, 100), (100.5, 100),
                                                          (1_000_000, 999_960_000), (-2_500_000, 1_000_000), (12_500_000, 12_500_000), (0.4, 0.5)]
    private static let pointPairs: [(Double?, Double?)] = [(22.06, 20), (20, 22.06), (0, 0), (99.95, 0.04), (-3.75, 100), (0.04, 0), (0, 0.04),
                                                           (33.35, 33.3), (12.25, 12.2), (50, 49.95), (0.05, 0.1), (nil, 20), (22.06, nil), (nil, nil)]
    /// Quanh 0h giờ VN và 0h UTC: 1970-01-01, 29/02/2024, giao thừa 2026, 05/09/2026, 09-11/10/2026.
    private static let times: [TimeInterval] = [0, 1_709_168_700, 1_767_200_399, 1_767_200_400, 1_788_584_400, 1_791_565_199, 1_791_565_200,
                                                1_791_590_400, 1_791_608_400, 1_791_615_599, 1_791_629_345, 1_791_651_540, 1_791_651_599, 1_791_651_600]
    private static let isos: [String?] = ["2026-10-10T17:49:05.123Z", "2026-10-10T17:49:05Z", "2026-10-10T17:49:05", "2026-10-10T17:49:05.123",
                                         "2026-10-10 17:49:05", "2026-10-10T17:49:05+07:00", "2026-10-09T17:00:00Z", "garbage", "", nil]
    private static let days: [String?] = ["2026-09-24", "2026-09-24T10:00:00Z", "2026-9", "2026-02-30", "2024-02-29", "2026-12-31", "", "garbage", nil]
    private static let months = ["2026-09", "2026-12", "2026-01", "2024-02", "2026-9", "2026-09-24", "garbage", ""]
    private static let httpDates = ["Sat, 10 Oct 2026 17:49:05 GMT", "Thu, 01 Jan 1970 00:00:00 GMT", "Sat, 10-Oct-2026 17:49:05 GMT", "garbage", ""]

    // MARK: Ca kiểm

    private static func numbers(_ r: inout Run) {
        for x in nums {
            r.eq("int(\(x))", Legacy.Fmt.int(x), Fmt.int(x))
            r.eq("money(\(x))", Legacy.Fmt.money(x), Fmt.money(x))
            r.eq("vnd(\(x))", Legacy.Fmt.vnd(x), Fmt.vnd(x))
            r.eq("short(\(x))", Legacy.Fmt.short(x), Fmt.short(x))
            r.eq("shortVnd(\(x))", Legacy.Fmt.shortVnd(x), Fmt.shortVnd(x))
            r.eq("short-cong-don-vi(\(x))", Legacy.shortPlusUnit(x), Fmt.shortMoney(x))
            r.eq("short-chen-don-vi(\(x))", Legacy.shortInterpUnit(x), Fmt.shortMoney(x))
            r.eq("roas(\(x))", Legacy.Fmt.roas(x), Fmt.roas(x))
            r.eq("roasPlain(\(x))", Legacy.Fmt.roasPlain(x), Fmt.dec2(x))
            r.eq("sp-trung-binh(\(x))", Legacy.dec2(x), Fmt.dec2(x))
            r.eq("pct(\(x))", Legacy.Fmt.pct(x), Fmt.pct(x))
            r.eq("pct0(\(x))", Legacy.Fmt.pct0(x), Fmt.pct0(x))
        }
        r.eq("shortVnd(nil)", Legacy.Fmt.shortVnd(nil), Fmt.shortVnd(nil))
        r.eq("roas(nil)", Legacy.Fmt.roas(nil), Fmt.roas(nil))
    }

    private static func percents(_ r: inout Run) {
        for p in pcts {
            let name = p.map { "\($0)" } ?? "nil"
            r.eq("pct(\(name))", Legacy.Fmt.pct(p), Fmt.pct(p))
            r.eq("pct0(\(name))", Legacy.Fmt.pct0(p), Fmt.pct0(p))
            guard let v = p else { continue }
            for up in [true, false, v >= 0] {
                r.eq("signedPct(\(name),\(up))", Legacy.signedPct(v, up: up), Fmt.signedPct(v, up: up))
            }
        }
    }

    private static func deltas(_ r: inout Run) {
        for (now, prev) in deltaPairs {
            let name = "\(now),\(prev.map { "\($0)" } ?? "nil")"
            r.eq("delta(\(name))", show(Legacy.Fmt.delta(now, prev)), show(Fmt.delta(now, prev)))
        }
        for (a, b) in pointPairs {
            let name = "\(a.map { "\($0)" } ?? "nil"),\(b.map { "\($0)" } ?? "nil")"
            r.eq("points(\(name))", show(Legacy.pointsDelta(a, b)), show(NewLines.pointsDelta(a, b)))
        }
    }

    /// Dòng ghép tiền ở màn hình: biểu thức cũ và biểu thức mới ở chỗ gọi.
    private static func lines(_ r: inout Run) {
        let goals: [(Double, Double)] = [(0, 0), (12_500_000, 0), (950_000, 1_300_000_000), (1_300_000_000, 999_960_000), (-2_500_000, 1_000_000)]
        for (a, g) in goals {
            r.eq("muc-tieu(\(a),\(g))", Legacy.goalLine(a, g), NewLines.goalLine(a, g))
            r.eq("kpi-nv(\(a),\(g))", Legacy.kpiLine(a, g, 12), NewLines.kpiLine(a, g, 12))
            r.eq("aov(\(a),\(g))", Legacy.aovLine(a, g), NewLines.aovLine(a, g))
            r.eq("ngay-kpi(\(a),\(g))", Legacy.dailyLine(a, g), NewLines.dailyLine(a, g))
        }
        let nets: [Double?] = [nil, 0, 950_000, 12_500_000, 1_300_000_000]
        for net in nets {
            for n in [0.0, 3] {
                let name = "\(net.map { "\($0)" } ?? "nil"),\(n)"
                r.eq("da-mua(\(name))", Legacy.boughtLine(net, n), NewLines.boughtLine(net, n))
            }
        }
        for x in nums {
            r.eq("tien-do(\(x))", Legacy.gapLine(x), NewLines.gapLine(x))
            for who in [nil, "Lan"] as [String?] {
                r.eq("don-tc(\(x),\(who ?? "nil"))", Legacy.boughtTC(7, x, who), NewLines.boughtTC(7, x, who))
            }
        }
    }

    private static func dates(_ r: inout Run) {
        for t in times {
            let d = Date(timeIntervalSince1970: t)
            r.eq("VNDate.string(\(t))", Legacy.VNDate.string(d), VNDate.string(d))
            r.eq("monthStart(\(t))", Legacy.VNDate.monthStart(d), VNDate.monthStart(d))
            r.eq("pretty(\(t))", Legacy.VNDate.pretty(d), VNDate.pretty(d))
            r.eq("add(\(t))", show(Legacy.VNDate.add(-1, to: d)), show(VNDate.add(-1, to: d)))
            r.eq("weekday(\(t))", Legacy.weekday(d), Fmt.weekday(d))
            r.eq("hm(\(t))", Legacy.hm(d), Fmt.hm(d))
            r.eq("monthTitle(\(t))", Legacy.monthTitle(d), Fmt.monthTitle(d))
        }
    }

    private static func isoStrings(_ r: inout Run) {
        for s in isos {
            let name = s.map { "\"\($0)\"" } ?? "nil"
            r.eq("time(\(name))", Legacy.Fmt.time(s), Fmt.time(s))
            r.eq("dateTime(\(name))", Legacy.Fmt.dateTime(s), Fmt.dateTime(s))
            guard let v = s else { continue }
            r.eq("parseISO(\(name))", show(Legacy.Fmt.parseISO(v)), show(Fmt.parseISO(v)))
        }
        for s in httpDates {
            r.eq("httpDate(\"\(s)\")", show(Legacy.httpDate(s)), show(Fmt.httpDate(s)))
        }
    }

    private static func dayStrings(_ r: inout Run) {
        for s in days {
            let name = s.map { "\"\($0)\"" } ?? "nil"
            r.eq("day(\(name))", Legacy.Fmt.day(s), Fmt.day(s))
            guard let v = s else { continue }
            r.eq("VNDate.date(\(name))", show(Legacy.VNDate.date(v)), show(VNDate.date(v)))
            r.eq("loc-don-ngay(\(name))", show(Legacy.filterDate(v)), show(VNDate.date(v)))
        }
        for m in months {
            r.eq("monthEnd(\"\(m)\")", Legacy.VNDate.monthEnd(m), VNDate.monthEnd(m))
            for k in [-1, 1, 12] {
                r.eq("shiftMonth(\"\(m)\",\(k))", Legacy.VNDate.shiftMonth(m, k), VNDate.shiftMonth(m, k))
            }
        }
    }

    /// Chuỗi "yyyy-MM(-dd)" cắt thành nhãn tháng, ngày (HRViews, Metrics, MarketingView).
    private static func monthStrings(_ r: inout Run) {
        let yms: [String?] = ["2026-09", "2026-12", "2026-1", "2026-09-24", "2026-x", "garbage", "", nil]
        for s in yms {
            let name = s.map { "\"\($0)\"" } ?? "nil"
            r.eq("monthShort(\(name))", Legacy.HRText.monthShort(s), Fmt.monthShort(s))
            r.eq("monthLabel(\(name))", Legacy.HRText.monthLabel(s), Fmt.monthLabel(s))
        }
        let ends: [String?] = ["2026-09-24", "2026-10-01T10:00:00Z", "2026-9", nil]
        for a in ends {
            for b in ends {
                let name = "\(a ?? "nil"),\(b ?? "nil")"
                r.eq("span(\(name))", Legacy.HRText.span(a, b), Fmt.span(a, b))
            }
        }
        let keys = ["2026-09-24", "2026-09-01", "2026-09", "2026-9-4", "2026", "", "2026-09-24-x"]
        for k in keys {
            r.eq("dm(\"\(k)\")", Legacy.dm(k), Fmt.dm(k))
            for b in ["day", "week", "month", ""] {
                r.eq("bucketLabel(\"\(k)\",\(b))", Legacy.bucketLabel(k, b), Fmt.bucketLabel(k, b))
            }
            for k2 in keys {
                r.eq("dayRange(\"\(k)\",\"\(k2)\")", Legacy.range(k, k2), Fmt.dayRange(k, k2))
            }
        }
        // Config.swift: ngưỡng tỷ lệ chốt (Int), cũ "\(a.threshold)%".
        for n in [0, 1, 30, 40, 99, 100, -5, 1000] {
            r.eq("nguong-chot(\(n))", Legacy.thresholdPct(n), Fmt.pct0(Double(n)))
        }
    }

    /// Giờ tương đối (Security, RecruitView, Ago): chuỗi ISO lùi từ bây giờ, lấy giữa phút (cách mốc phút 30 giây)
    /// nên code cũ và mới gọi Date.now lệch nhau một chút vẫn ra cùng số phút.
    private static func relative(_ r: inout Run) {
        let iso = ISO8601DateFormatter()
        let secs: [TimeInterval] = [-90, 0, 30, 90, 1_830, 3_570, 3_630, 9_030, 86_370, 86_430, 262_830]
        var list: [String?] = []
        for s in secs { list.append(iso.string(from: Date.now.addingTimeInterval(-s))) }
        list += ["2020-01-01 00:00:00", "garbage", "", nil]
        for (i, s) in list.enumerated() {
            let name = i < secs.count ? "truoc-\(Int(secs[i]))s" : s.map { "\"\($0)\"" } ?? "nil"
            r.eq("ago(\(name))", Legacy.securityAgo(s), Fmt.ago(s))
            r.eq("Ago.text(\(name))", show(Legacy.Ago.text(s)), show(Ago.text(s)))
            guard let v = s else { continue }
            r.eq("ago-tuyen-dung(\(name))", Legacy.recruitAgo(v), Fmt.ago(v))
        }
    }

    /// Code cũ theo locale / 12 giờ / múi giờ của máy: so với chữ máy tiếng Việt, 24 giờ, giờ VN hiện ra.
    private static func literals(_ r: inout Run) {
        // Trang Thông báo (Tabs.swift): cũ .formatted(date: .omitted, time: .shortened).
        r.eq("thong-bao-17h49", "17:49", Fmt.hm(Date(timeIntervalSince1970: 1_791_629_345)))
        r.eq("thong-bao-0h", "00:00", Fmt.hm(Date(timeIntervalSince1970: 1_791_651_600)))
        // Nhãn trục biểu đồ MKT (MarketingView.swift): cũ Date.FormatStyle() theo locale máy; mới ghim vi_VN, múi giờ vẫn theo máy.
        // 12h trưa UTC: cùng một ngày ở mọi múi từ UTC−11 tới UTC+11. Thêm 05/09 (ngày khác tháng) để bắt lỗi đảo ngày / tháng.
        let oct10 = Date(timeIntervalSince1970: 1_791_633_600), sep5 = Date(timeIntervalSince1970: 1_788_609_600)
        r.eq("truc-ngay-10-10", "10/10", Fmt.axisDay.format(oct10))
        r.eq("truc-thang-10-26", "10/26", Fmt.axisMonth.format(oct10))
        r.eq("truc-ngay-5-9", "5/9", Fmt.axisDay.format(sep5))
        r.eq("truc-thang-9-26", "9/26", Fmt.axisMonth.format(sep5))
    }
}

private func emit(_ s: String) {
    print(s)
    fflush(stdout)
}

private func show(_ s: String?) -> String { s ?? "nil" }
private func show(_ d: Date?) -> String { d.map { "\($0.timeIntervalSince1970)" } ?? "nil" }

/// Code mới ở chỗ gọi (chép từ các màn), để so dòng ghép với code cũ.
private enum NewLines {
    // CskhOverview.swift, CskhViews.swift, Home.swift: chênh tỷ lệ chốt theo điểm.
    static func pointsDelta(_ med: Double?, _ pMed: Double?) -> String? { (med != nil && pMed != nil) ? Fmt.points(med! - pMed!) : nil }
    // Home.swift: mục tiêu tháng.
    static func goalLine(_ closedNet: Double, _ goal: Double) -> String { goal > 0 ? "\(Fmt.short(closedNet)) / \(Fmt.shortMoney(goal)) · còn \(Fmt.shortMoney(max(0, goal - closedNet)))" : "Chưa đặt mục tiêu (Cấu hình → Mục tiêu tháng)" }
    // Home.swift: khách lâu chưa mua.
    static func boughtLine(_ net: Double?, _ n: Double) -> String { "Đã mua \(Fmt.shortVnd(net))\(net != nil && n > 0 ? " · TB \(Fmt.shortMoney(net! / n))/khách" : "")" }
    // CskhViews.swift: KPI từng nhân viên.
    static func kpiLine(_ a: Double, _ g: Double, _ orders: Double) -> String { "\(Fmt.short(a)) / \(g > 0 ? Fmt.shortMoney(g) : "chưa đặt ₫") · \(Fmt.int(orders)) đơn" }
    // CskhViews.swift: đơn chốt theo người bán.
    static func aovLine(_ net: Double, _ orders: Double) -> String { "\(Fmt.shortMoney(net)) · AOV \(Fmt.shortMoney(orders > 0 ? net / orders : 0))" }
    // CskhViews.swift: khách đã giao thành công.
    static func boughtTC(_ orders: Double, _ purchased: Double, _ assignedName: String?) -> String { "\(Fmt.int(orders)) đơn TC · \(Fmt.shortMoney(purchased))\(assignedName.map { " · \($0)" } ?? "")" }
    // CskhOverview.swift: so với tiến độ, KPI ngày.
    static func gapLine(_ gap: Double) -> String { "\(gap >= 0 ? "Vượt" : "Thiếu") \(Fmt.shortMoney(abs(gap)))" }
    static func dailyLine(_ todayNet: Double, _ daily: Double) -> String { daily > 0 ? "\(Fmt.pct0(todayNet / daily * 100)) KPI ngày (\(Fmt.shortMoney(daily)))" : "—" }
}

/// Code cũ chép nguyên văn từ origin/main 3e4e35a, không sửa (kể cả DateFormatter tạo mỗi lần gọi, không đặt locale).
private enum Legacy {
    // Theme.swift enum Fmt + Shared.swift extension Fmt + Departments.swift shortVnd + MarketingView.swift roas, roasPlain.
    enum Fmt {
        static let vi: NumberFormatter = { let f = NumberFormatter(); f.numberStyle = .decimal; f.locale = Locale(identifier: "vi_VN"); f.maximumFractionDigits = 0; return f }()
        static func int(_ n: Double) -> String { vi.string(from: NSNumber(value: n.rounded())) ?? "\(Int(n))" }
        static func money(_ n: Double) -> String { "\(int(n)) ₫" }
        static func vnd(_ n: Double) -> String { "\(int(n))đ" }
        static func short(_ n: Double) -> String {
            let a = abs(n)
            if a >= 1e9 { return String(format: "%.2f tỷ", n / 1e9).replacingOccurrences(of: ".", with: ",") }
            if a >= 1e6 { return String(format: "%.1f tr", n / 1e6).replacingOccurrences(of: ".", with: ",") }
            return int(n)
        }
        static func pct(_ n: Double?) -> String { guard let n else { return "—" }; return String(format: "%.1f%%", n).replacingOccurrences(of: ".", with: ",") }
        static func pct0(_ n: Double?) -> String { guard let n else { return "—" }; return String(format: "%.0f%%", n) }
        static func delta(_ now: Double, _ prev: Double?) -> String? {
            guard let prev, prev > 0 else { return nil }
            let d = (now - prev) / prev * 100
            return (d >= 0 ? "+" : "") + String(format: "%.0f%%", d)
        }
        static func shortVnd(_ n: Double?) -> String { n.map { short($0) + " ₫" } ?? "—" }
        static func roas(_ n: Double?) -> String { n.map { String(format: "%.2f×", $0).replacingOccurrences(of: ".", with: ",") } ?? "—" }
        static func roasPlain(_ n: Double) -> String { String(format: "%.2f", n).replacingOccurrences(of: ".", with: ",") }
        static func day(_ s: String?) -> String {
            guard let s, s.count >= 10 else { return "—" }
            let p = s.prefix(10).split(separator: "-")
            return p.count == 3 ? "\(p[2])/\(p[1])/\(p[0])" : String(s.prefix(10))
        }
        static func time(_ iso: String?) -> String {
            guard let iso, let d = parse(iso) else { return "" }
            let f = DateFormatter(); f.timeZone = VNDate.tz; f.dateFormat = "HH:mm dd/MM"; return f.string(from: d)
        }
        static func dateTime(_ iso: String?) -> String {
            guard let iso, let d = parse(iso) else { return "—" }
            let f = DateFormatter(); f.timeZone = VNDate.tz; f.dateFormat = "HH:mm dd/MM/yyyy"; return f.string(from: d)
        }
        static func parseISO(_ iso: String) -> Date? { parse(iso) }
        private static func parse(_ iso: String) -> Date? {
            let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let d = f.date(from: iso.hasSuffix("Z") ? iso : iso + "Z") { return d }
            f.formatOptions = [.withInternetDateTime]
            return f.date(from: iso.hasSuffix("Z") ? iso : iso + "Z") ?? {
                let g = DateFormatter(); g.timeZone = TimeZone(identifier: "UTC"); g.dateFormat = "yyyy-MM-dd HH:mm:ss"; return g.date(from: iso)
            }()
        }
    }
    // Theme.swift enum VNDate + CskhViews.swift extension VNDate (date, monthEnd, shiftMonth).
    enum VNDate {
        static let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
        static func string(_ d: Date) -> String { let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.timeZone = tz; f.dateFormat = "yyyy-MM-dd"; return f.string(from: d) }
        static func add(_ days: Int, to d: Date = .now) -> Date { d.addingTimeInterval(Double(days) * 86400) }
        static func monthStart(_ d: Date = .now) -> String { String(string(d).prefix(7)) + "-01" }
        static func pretty(_ d: Date = .now) -> String {
            let f = DateFormatter(); f.timeZone = tz; f.locale = Locale(identifier: "vi_VN"); f.dateFormat = "d 'Thg' M, yyyy"
            return f.string(from: d)
        }
        static func date(_ s: String) -> Date? { let f = DateFormatter(); f.timeZone = tz; f.dateFormat = "yyyy-MM-dd"; return f.date(from: s) }
        static func monthEnd(_ ym: String) -> String {
            var cal = Calendar(identifier: .gregorian); cal.timeZone = tz
            let f = DateFormatter(); f.timeZone = tz; f.dateFormat = "yyyy-MM"
            guard let d = f.date(from: String(ym.prefix(7))), let next = cal.date(byAdding: .month, value: 1, to: d) else { return ym + "-28" }
            return string(next.addingTimeInterval(-1))
        }
        static func shiftMonth(_ ym: String, _ n: Int) -> String {
            var cal = Calendar(identifier: .gregorian); cal.timeZone = tz
            guard let d = date(ym + "-01"), let s = cal.date(byAdding: .month, value: n, to: d) else { return ym }
            return String(string(s).prefix(7))
        }
    }
    // HomeFeed.swift
    static func weekday(_ d: Date = .now) -> String {
        let f = DateFormatter(); f.timeZone = VNDate.tz; f.locale = Locale(identifier: "vi_VN"); f.dateFormat = "EEEE, d/M"
        let s = f.string(from: d)
        return s.prefix(1).uppercased() + s.dropFirst()
    }
    static func hm(_ d: Date) -> String {
        let f = DateFormatter(); f.timeZone = VNDate.tz; f.dateFormat = "HH:mm"
        return f.string(from: d)
    }
    // MoreViews.swift MonthlyView.month
    static func monthTitle(_ d: Date) -> String { let f = DateFormatter(); f.timeZone = VNDate.tz; f.dateFormat = "'Tháng' MM/yyyy"; return f.string(from: d) }
    // Shared.swift OrderFilterSheet.onAppear
    static func filterDate(_ s: String) -> Date? { let f = DateFormatter(); f.timeZone = VNDate.tz; f.dateFormat = "yyyy-MM-dd"; return f.date(from: s) }
    // Session.swift absorb: Expires
    static func httpDate(_ s: String) -> Date? { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"; return f.date(from: s) }
    // CskhOverview.swift:39, CskhViews.swift:694, Home.swift:186, Home.swift:273
    static func pointsDelta(_ med: Double?, _ pMed: Double?) -> String? { (med != nil && pMed != nil) ? String(format: "%+.1f điểm", med! - pMed!).replacingOccurrences(of: ".", with: ",") : nil }
    // Metrics.swift:242
    static func dec2(_ n: Double) -> String { String(format: "%.2f", n).replacingOccurrences(of: ".", with: ",") }
    // Metrics.swift:309
    static func signedPct(_ pct: Double, up: Bool) -> String { (up ? "+" : "") + String(format: "%.1f%%", pct).replacingOccurrences(of: ".", with: ",") }
    // Fmt.short(x) + " ₫" và "\(Fmt.short(x)) ₫" ở các màn
    static func shortPlusUnit(_ n: Double) -> String { Fmt.short(n) + " ₫" }
    static func shortInterpUnit(_ n: Double) -> String { "\(Fmt.short(n)) ₫" }
    // Home.swift:288
    static func goalLine(_ closedNet: Double, _ goal: Double) -> String { goal > 0 ? "\(Fmt.short(closedNet)) / \(Fmt.short(goal)) ₫ · còn \(Fmt.short(max(0, goal - closedNet))) ₫" : "Chưa đặt mục tiêu (Cấu hình → Mục tiêu tháng)" }
    // Home.swift:397
    static func boughtLine(_ net: Double?, _ n: Double) -> String { "Đã mua \(net.map { Fmt.short($0) + " ₫" } ?? "—")\(net != nil && n > 0 ? " · TB \(Fmt.short(net! / n)) ₫/khách" : "")" }
    // CskhViews.swift:584
    static func kpiLine(_ a: Double, _ g: Double, _ orders: Double) -> String { "\(Fmt.short(a)) / \(g > 0 ? Fmt.short(g) : "chưa đặt") ₫ · \(Fmt.int(orders)) đơn" }
    // CskhViews.swift:179
    static func aovLine(_ net: Double, _ orders: Double) -> String { "\(Fmt.short(net)) ₫ · AOV \(Fmt.short(orders > 0 ? net / orders : 0)) ₫" }
    // CskhViews.swift:324
    static func boughtTC(_ orders: Double, _ purchased: Double, _ assignedName: String?) -> String { "\(Fmt.int(orders)) đơn TC · \(Fmt.short(purchased)) ₫\(assignedName.map { " · \($0)" } ?? "")" }
    // CskhOverview.swift:168, 170
    static func gapLine(_ gap: Double) -> String { "\(gap >= 0 ? "Vượt" : "Thiếu") \(Fmt.short(abs(gap))) ₫" }
    static func dailyLine(_ todayNet: Double, _ daily: Double) -> String { daily > 0 ? "\(Fmt.pct0(todayNet / daily * 100)) KPI ngày (\(Fmt.short(daily)) ₫)" : "—" }
    // Security.swift ago
    static func securityAgo(_ iso: String?) -> String { guard let iso, let d = Fmt.parseISO(iso) else { return "—" }; let m = Int(Date.now.timeIntervalSince(d) / 60); return m < 60 ? "\(max(1, m)) phút trước" : m < 1440 ? "\(m / 60) giờ trước" : "\(m / 1440) ngày trước" }
    // RecruitView.swift ago
    static func recruitAgo(_ iso: String) -> String { guard let d = Fmt.parseISO(iso) else { return "—" }; let m = Int(Date.now.timeIntervalSince(d) / 60); return m < 60 ? "\(max(1, m)) phút trước" : m < 1440 ? "\(m / 60) giờ trước" : "\(m / 1440) ngày trước" }
    // Approvals.swift
    enum Ago {
        /// "vừa xong" / "5 phút trước" / "2 giờ trước" / "3 ngày trước".
        static func text(_ iso: String?) -> String? {
            guard let iso, let d = Fmt.parseISO(iso) else { return nil }
            let m = Int(Date.now.timeIntervalSince(d) / 60)
            return m < 1 ? "vừa xong" : m < 60 ? "\(m) phút trước" : m < 1440 ? "\(m / 60) giờ trước" : "\(m / 1440) ngày trước"
        }
    }
    // Config.swift:56, :127
    static func thresholdPct(_ threshold: Int) -> String { "\(threshold)%" }
    // HRViews.swift HRText
    enum HRText {
        /// "2026-09" → "T9".
        static func monthShort(_ ym: String?) -> String {
            guard let ym, ym.count >= 7, let m = Int(ym.dropFirst(5).prefix(2)) else { return "—" }
            return "T\(m)"
        }
        /// "2026-09" → "9/2026".
        static func monthLabel(_ ym: String?) -> String {
            guard let ym, ym.count >= 7, let m = Int(ym.dropFirst(5).prefix(2)) else { return "này" }
            return "\(m)/\(ym.prefix(4))"
        }
        static func span(_ start: String?, _ end: String?) -> String {
            if let s = start, let e = end { return "\(Fmt.day(s)) – \(Fmt.day(e))" }
            if let s = start { return "Từ \(Fmt.day(s))" }
            if let e = end { return "Đến \(Fmt.day(e))" }
            return "Chưa ghi ngày"
        }
    }
    // Metrics.swift PancakeRefCard.dm
    static func dm(_ s: String) -> String { let p = s.split(separator: "-"); return p.count == 3 ? "\(p[2])/\(p[1])" : s }
    // MarketingView.swift bucketLabel, range
    static func bucketLabel(_ key: String, _ bucket: String) -> String {
        let p = key.split(separator: "-")
        if bucket == "month", p.count >= 2 { return "Tháng \(p[1])/\(p[0])" }
        if p.count == 3 { return (bucket == "week" ? "Tuần " : "") + "\(p[2])/\(p[1])" }
        return key
    }
    static func range(_ a: String, _ b: String) -> String { a == b ? Fmt.day(a) : "\(Fmt.day(a).prefix(5))–\(Fmt.day(b))" }
}
#endif
