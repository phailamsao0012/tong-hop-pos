import Foundation

// Mọi chỗ đổi số, tiền, %, ngày giờ thành chữ (và đọc ngày từ chữ) đi qua file này. Ngoài đây không tạo NumberFormatter,
// DateFormatter, không gọi .formatted(, không nối tay " ₫", không String(format:) số lẻ (CI ios.yml chặn).
// Formatter tạo một lần (static); ngày: lịch Gregorian, giờ Việt Nam, locale cố định (vi_VN khi có chữ, en_US_POSIX khi chỉ có số).
// Bước 1a: chỉ chuyển chỗ, chữ hiện ra giữ nguyên từng ký tự; so với code cũ ở FormatSelfTest.swift (bản Debug).
// Giữ nguyên trên máy tiếng Việt, lịch Gregorian, giờ VN, 24 giờ. Máy cài khác thì có chỗ đổi, đã chấp nhận (kế hoạch 1.1 "Cách làm"):
// lịch Phật giáo / Nhật: năm 2026 thay vì 2569 (tiêu đề tháng, ngày đọc từ "yyyy-MM-dd"); tắt 24 giờ: "17:49" thay vì "5:49 CH";
// locale có chữ số riêng: chữ số Latin; giờ trang Thông báo theo giờ VN, 24 giờ; nhãn trục X biểu đồ MKT theo vi_VN ("5/9").
// Còn theo máy, để bước 1b: múi giờ trục X biểu đồ MKT (Charts đặt vạch và gom cột theo múi giờ máy; 1b ghim giờ VN bằng
// .environment trên Chart) và số trục Y (AxisValueLabel() mặc định theo locale máy; 1b dùng Fmt.int).
// Nằm trong WidgetShared/: biên dịch vào cả app và widget (MegatechWidget).

enum Fmt {
    static let vi: NumberFormatter = { let f = NumberFormatter(); f.numberStyle = .decimal; f.locale = Locale(identifier: "vi_VN"); f.maximumFractionDigits = 0; return f }()
    static func int(_ n: Double) -> String { vi.string(from: NSNumber(value: n.rounded())) ?? "\(Int(n))" }
    static func money(_ n: Double) -> String { "\(int(n)) ₫" }
    /// Tiền dạng đầy đủ có chữ đ như ảnh: 128.450.000đ
    static func vnd(_ n: Double) -> String { "\(int(n))đ" }
    /// 1,23 tỷ · 456,7 tr · 12.000
    static func short(_ n: Double) -> String {
        let a = abs(n)
        if a >= 1e9 { return String(format: "%.2f tỷ", n / 1e9).replacingOccurrences(of: ".", with: ",") }
        if a >= 1e6 { return String(format: "%.1f tr", n / 1e6).replacingOccurrences(of: ".", with: ",") }
        return int(n)
    }
    /// Tiền gọn có đơn vị: "12,5 tr ₫".
    static func shortMoney(_ n: Double) -> String { short(n) + " ₫" }
    /// Tiền gọn có đơn vị: "12,5 tr ₫", "—" khi chưa có.
    static func shortVnd(_ n: Double?) -> String { n.map { shortMoney($0) } ?? "—" }
    static func pct(_ n: Double?) -> String { guard let n else { return "—" }; return String(format: "%.1f%%", n).replacingOccurrences(of: ".", with: ",") }
    static func pct0(_ n: Double?) -> String { guard let n else { return "—" }; return String(format: "%.0f%%", n) }
    /// Chênh lệch % so kỳ trước: "+12%" / "-8%"
    static func delta(_ now: Double, _ prev: Double?) -> String? {
        guard let prev, prev > 0 else { return nil }
        let d = (now - prev) / prev * 100
        return (d >= 0 ? "+" : "") + String(format: "%.0f%%", d)
    }
    /// Chênh tỷ lệ theo điểm %: "+1,2 điểm" / "-0,4 điểm" (d = kỳ này − kỳ trước).
    static func points(_ d: Double) -> String { String(format: "%+.1f điểm", d).replacingOccurrences(of: ".", with: ",") }
    /// % một số lẻ, dấu + theo chiều tăng (up) chứ không theo dấu của pct: "+12,3%" / "-4,0%".
    static func signedPct(_ pct: Double, up: Bool) -> String { (up ? "+" : "") + String(format: "%.1f%%", pct).replacingOccurrences(of: ".", with: ",") }
    /// Hai số lẻ: "1,25".
    static func dec2(_ n: Double) -> String { String(format: "%.2f", n).replacingOccurrences(of: ".", with: ",") }
    /// ROAS kiểu web: "3,95×", "—" khi chưa có chi phí.
    static func roas(_ n: Double?) -> String { n.map { String(format: "%.2f×", $0).replacingOccurrences(of: ".", with: ",") } ?? "—" }

    // MARK: So cùng kỳ (app/staff-compare.tsx: Change, app/ui-kit.tsx: delta)

    static func changePct(_ now: Double?, _ prev: Double?) -> String {
        guard let now, let prev else { return "—" }
        if prev == 0 { return now > 0 ? "mới" : now == 0 ? "0,0%" : "—" }
        let d = (now - prev) / prev * 100
        return (d > 0 ? "+" : d < 0 ? "−" : "") + pct(abs(d))
    }

    static func changeTone(_ now: Double?, _ prev: Double?, points: Bool) -> Int {
        guard let now, let prev else { return 0 }
        let d: Double
        if points { d = now - prev }
        else if prev == 0 { return now > 0 ? 1 : 0 }
        else { d = (now - prev) / prev * 100 }
        return d > 0 ? 1 : d < 0 ? -1 : 0
    }

    static func changePoints(_ a: Double?, _ b: Double?) -> String {
        guard let a, let b else { return "—" }
        let d = a - b
        return (d >= 0 ? "+" : "−") + String(format: "%.1f điểm", abs(d)).replacingOccurrences(of: ".", with: ",")
    }

    // Hiệu của hai số cùng điểm do máy chủ trả, như hộp chạm CompareStrip của web.
    static func chartDiff(_ cur: Double?, _ prev: Double?, metric: String) -> (text: String, up: Bool)? {
        guard let cur, let prev else { return nil }
        let d = cur - prev
        let value: String
        switch metric {
        case "closed": value = int(abs(d))
        case "closedNet": value = shortMoney(abs(d))
        case "closeRate": value = String(format: "%.1f điểm", abs(d)).replacingOccurrences(of: ".", with: ",")
        default: return nil
        }
        return ((d >= 0 ? "+" : "−") + value, d >= 0)
    }

    static func chartAxis(_ value: Double, metric: String) -> String {
        metric == "closeRate" ? int(value) + "%" : cmpShort(value, metric: metric)
    }

    static func chartPointValue(_ value: Double?, metric: String) -> String {
        metric == "closedNet" ? shortVnd(value) : cmpShort(value, metric: metric)
    }

    // Chỉ tạo nhãn; không gộp số hoặc suy ra ngày kỳ so.
    static func chartX(_ i: Int, bucket: String, cumulative: Bool, start: String, group: Int) -> String {
        if bucket == "hour" { return int(Double(i + (cumulative ? 1 : 0))) + "h" }
        guard let date = VNDate.date(start) else { return "—" }
        return dm(VNDate.string(VNDate.add(i * max(1, group), to: date)))
    }

    static func chartTime(_ i: Int, bucket: String, cumulative: Bool, start: String, end: String, group: Int) -> String {
        let prefix = cumulative ? "tới " : ""
        if bucket == "hour" {
            let to = int(Double(i + 1)) + ":00"
            return cumulative ? prefix + to : int(Double(i)) + ":00–" + to
        }
        guard let date = VNDate.date(start) else { return "—" }
        let g = max(1, group)
        let from = VNDate.string(VNDate.add(i * g, to: date))
        if g == 1 { return prefix + weekdayShort(from) + " " + dm(from) }
        let to = min(VNDate.string(VNDate.add(i * g + g - 1, to: date)), end)
        return prefix + dm(from) + "–" + dm(to)
    }

    static func cmpShort(_ v: Double?, metric: String) -> String {
        guard let v else { return "—" }
        switch metric {
        case "closed": return int(v)
        case "closedNet": return short(v)
        case "closeRate": return pct(v)
        default: return "—"
        }
    }

    static func weekdayShort(_ ymd: String) -> String {
        guard let d = VNDate.date(ymd) else { return "—" }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = VNDate.tz
        return ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][cal.component(.weekday, from: d) - 1]
    }

    static func cmpSpan(_ start: String, _ end: String) -> String {
        start == end ? "\(weekdayShort(start)) \(dm(start))" : "\(dm(start))–\(dm(end))"
    }

    // MARK: Ngày giờ

    /// "2026-09-24" → "24/09/2026"; giữ nguyên nếu không đúng dạng.
    static func day(_ s: String?) -> String {
        guard let s, s.count >= 10 else { return "—" }
        let p = s.prefix(10).split(separator: "-")
        return p.count == 3 ? "\(p[2])/\(p[1])/\(p[0])" : String(s.prefix(10))
    }
    static func time(_ iso: String?) -> String {
        guard let iso, let d = parse(iso) else { return "" }
        return DateFmt.hmDM.string(from: d)
    }
    static func dateTime(_ iso: String?) -> String {
        guard let iso, let d = parse(iso) else { return "—" }
        return DateFmt.hmDMY.string(from: d)
    }
    static func parseISO(_ iso: String) -> Date? { parse(iso) }
    /// ISO có / không phần lẻ giây (thiếu Z thì coi là giờ UTC), rồi "yyyy-MM-dd HH:mm:ss" giờ UTC.
    private static func parse(_ iso: String) -> Date? {
        let z = iso.hasSuffix("Z") ? iso : iso + "Z"
        return DateFmt.isoFrac.date(from: z) ?? DateFmt.iso.date(from: z) ?? DateFmt.utcSpace.date(from: iso)
    }
    /// Giờ phút theo giờ VN, 24 giờ: "17:49".
    static func hm(_ d: Date) -> String { DateFmt.hm.string(from: d) }
    /// "Thứ Sáu, 10/10"
    static func weekday(_ d: Date = .now) -> String {
        let s = DateFmt.weekday.string(from: d)
        return s.prefix(1).uppercased() + s.dropFirst()
    }
    /// "Tháng 10/2026"
    static func monthTitle(_ d: Date) -> String { DateFmt.monthTitle.string(from: d) }
    /// Expires của cookie: "Sat, 10 Oct 2026 17:49:05 GMT"; nil khi sai dạng.
    static func httpDate(_ s: String) -> Date? { DateFmt.http.date(from: s) }
    /// Nhãn trục biểu đồ theo ngày ("5/9") và theo tháng ("9/26"). Múi giờ máy như cũ, khớp vạch trục Charts đặt theo múi giờ máy.
    static let axisDay: Date.FormatStyle = axisBase.day().month(.defaultDigits)
    static let axisMonth: Date.FormatStyle = axisBase.month(.defaultDigits).year(.twoDigits)
    private static let axisBase = Date.FormatStyle(locale: Locale(identifier: "vi_VN"), calendar: Calendar(identifier: .gregorian), timeZone: .autoupdatingCurrent)
    /// "5 phút trước" / "2 giờ trước" / "3 ngày trước" (dưới 1 phút vẫn "1 phút trước"); "—" khi không đọc được.
    static func ago(_ iso: String?) -> String { guard let iso, let d = parseISO(iso) else { return "—" }; let m = Int(Date.now.timeIntervalSince(d) / 60); return m < 60 ? "\(max(1, m)) phút trước" : m < 1440 ? "\(m / 60) giờ trước" : "\(m / 1440) ngày trước" }

    // MARK: Ngày, tháng từ chuỗi "yyyy-MM(-dd)" (chỉ cắt chuỗi, không qua lịch)

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
    /// "24/09/2026 – 01/10/2026", "Từ …", "Đến …", "Chưa ghi ngày".
    static func span(_ start: String?, _ end: String?) -> String {
        if let s = start, let e = end { return "\(day(s)) – \(day(e))" }
        if let s = start { return "Từ \(day(s))" }
        if let e = end { return "Đến \(day(e))" }
        return "Chưa ghi ngày"
    }
    /// "2026-09-24" → "24/09".
    static func dm(_ s: String) -> String { let p = s.split(separator: "-"); return p.count == 3 ? "\(p[2])/\(p[1])" : s }
    /// Nhãn mốc MKT: "Tháng 09/2026", "Tuần 21/09", "24/09".
    static func bucketLabel(_ key: String, _ bucket: String) -> String {
        let p = key.split(separator: "-")
        if bucket == "month", p.count >= 2 { return "Tháng \(p[1])/\(p[0])" }
        if p.count == 3 { return (bucket == "week" ? "Tuần " : "") + "\(p[2])/\(p[1])" }
        return key
    }
    /// "01/09–30/09/2026"; một ngày thì "24/09/2026".
    static func dayRange(_ a: String, _ b: String) -> String { a == b ? day(a) : "\(day(a).prefix(5))–\(day(b))" }
}

enum Ago {
    /// "vừa xong" / "5 phút trước" / "2 giờ trước" / "3 ngày trước".
    static func text(_ iso: String?) -> String? {
        guard let iso, let d = Fmt.parseISO(iso) else { return nil }
        let m = Int(Date.now.timeIntervalSince(d) / 60)
        return m < 1 ? "vừa xong" : m < 60 ? "\(m) phút trước" : m < 1440 ? "\(m / 60) giờ trước" : "\(m / 1440) ngày trước"
    }
}

/// Ngày theo giờ Việt Nam dạng yyyy-MM-dd.
enum VNDate {
    static let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    static func string(_ d: Date) -> String { DateFmt.ymd.string(from: d) }
    static func add(_ days: Int, to d: Date = .now) -> Date { d.addingTimeInterval(Double(days) * 86400) }
    static func monthStart(_ d: Date = .now) -> String { String(string(d).prefix(7)) + "-01" }
    /// "Hôm nay, 24 Thg 9, 2026"
    static func pretty(_ d: Date = .now) -> String { DateFmt.pretty.string(from: d) }
    /// "2026-09-24" → 0h ngày đó giờ VN; nil khi sai dạng.
    static func date(_ s: String) -> Date? { DateFmt.ymd.date(from: s) }
    /// "2026-09" → 0h ngày 1 của tháng giờ VN; nil khi sai dạng.
    static func monthDate(_ ym: String) -> Date? { DateFmt.ym.date(from: ym) }
}

/// Formatter ngày dùng chung, mỗi cái tạo một lần, không sửa sau khi tạo.
/// Lịch Gregorian đi theo locale cố định (en_US_POSIX, vi_VN), không đặt `calendar` riêng: trên iOS, DateFormatter có
/// `calendar` gán tay thì đọc ngày dễ dãi ("2026-02-30" thành 02/03) trong khi code cũ trả nil (kiểm thử chuỗi bắt được).
private enum DateFmt {
    static func make(_ format: String, locale: String = "en_US_POSIX", timeZone: TimeZone = VNDate.tz) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: locale)
        f.timeZone = timeZone
        f.isLenient = false
        f.dateFormat = format
        return f
    }
    static let ymd = make("yyyy-MM-dd")
    static let ym = make("yyyy-MM")
    static let hm = make("HH:mm")
    static let hmDM = make("HH:mm dd/MM")
    static let hmDMY = make("HH:mm dd/MM/yyyy")
    static let monthTitle = make("'Tháng' MM/yyyy")
    static let weekday = make("EEEE, d/M", locale: "vi_VN")
    static let pretty = make("d 'Thg' M, yyyy", locale: "vi_VN")
    static let utcSpace = make("yyyy-MM-dd HH:mm:ss", timeZone: TimeZone(identifier: "UTC")!)
    /// Chuỗi có sẵn múi giờ (zzz) nên không đặt timeZone, như code cũ.
    static let http: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.isLenient = false
        f.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        return f
    }()
    /// Hai bản riêng (có / không phần lẻ giây) thay cho một bản đổi formatOptions giữa chừng.
    static let isoFrac: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f }()
    static let iso: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f }()
}

// MARK: - Widget (bản thăm dò và khung xem widget): giờ Việt Nam và tiền gọn theo chuẩn mục 6 của plan.

/// Mọi định dạng giờ và số phía widget (widget, màn Chẩn đoán widget, khung xem widget) nằm ở file này.
/// Giờ Việt Nam (Asia/Ho_Chi_Minh), lịch Gregorian, locale vi_VN, 24h.
enum ProbeTime {
    static let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    static let locale = Locale(identifier: "vi_VN")
    static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = tz
        c.locale = locale
        return c
    }()

    private static func formatter(_ pattern: String) -> DateFormatter {
        let f = DateFormatter()
        f.calendar = calendar
        f.timeZone = tz
        f.locale = locale
        f.dateFormat = pattern
        return f
    }
    private static let hm = formatter("HH:mm")
    private static let dayHm = formatter("dd/MM HH:mm")
    private static let fullDay = formatter("dd/MM/yyyy")
    private static let number: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = locale
        f.maximumFractionDigits = 0
        return f
    }()

    /// "14:05"
    static func time(_ d: Date) -> String { hm.string(from: d) }
    /// "11/10 14:05" (ngày trước giờ, plan mục 6)
    static func dayTime(_ d: Date) -> String { dayHm.string(from: d) }
    /// "11/10/2026"
    static func day(_ d: Date) -> String { fullDay.string(from: d) }

    /// Lần làm mới kế tiếp: từ 6h tới 22h thì sau 30 phút; từ 22h tới 6h thì hẹn thẳng 6h sáng.
    static func nextReload(after now: Date) -> Date {
        let h = calendar.component(.hour, from: now)
        if h >= 6 && h < 22 { return now.addingTimeInterval(30 * 60) }
        guard let six = calendar.date(bySettingHour: 6, minute: 0, second: 0, of: now) else { return now.addingTimeInterval(30 * 60) }
        if six > now { return six }
        return calendar.date(byAdding: .day, value: 1, to: six) ?? now.addingTimeInterval(8 * 3600)
    }

    /// Tiền gọn theo plan mục 6: 3 chữ số có nghĩa, làm tròn trước rồi mới chọn đơn vị, dưới 1 triệu viết đủ; giữa số
    /// và đơn vị là khoảng trắng không ngắt (U+00A0). "8,70 tr ₫", "91,7 tr ₫", "963 tr ₫", "1,00 tỷ ₫", "850.000 ₫".
    static func money(_ n: Double) -> String {
        let sp = "\u{00A0}"
        if abs(n) < 1e6 { return (number.string(from: NSNumber(value: n.rounded())) ?? "\(Int(n))") + sp + "₫" }
        var r = sig3(n / 1e6)
        var unit = "tr"
        if abs(r.value) >= 1000 { r = sig3(n / 1e9); unit = "tỷ" }
        let text = String(format: "%.\(r.decimals)f", r.value).replacingOccurrences(of: ".", with: ",")
        return text + sp + unit + sp + "₫"
    }
    /// Làm tròn giữ 3 chữ số có nghĩa: dưới 10 lấy 2 số lẻ, dưới 100 lấy 1, còn lại 0 (9,996 → 10,0; 999,95 → 1000).
    private static func sig3(_ v: Double) -> (value: Double, decimals: Int) {
        func places(_ x: Double) -> Int { abs(x) < 10 ? 2 : abs(x) < 100 ? 1 : 0 }
        func roundTo(_ x: Double, _ d: Int) -> Double { let p = pow(10, Double(d)); return (x * p).rounded() / p }
        var d = places(v)
        var r = roundTo(v, d)
        if places(r) != d { d = places(r); r = roundTo(v, d) }
        return (r, d)
    }
    /// Số đếm: "1.250"
    static func count(_ n: Int) -> String { number.string(from: NSNumber(value: n)) ?? "\(n)" }
}
