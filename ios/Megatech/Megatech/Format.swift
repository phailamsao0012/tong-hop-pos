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
// Đặt tạm trong Megatech/, chuyển sang WidgetShared/ khi thêm target widget.

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
private enum DateFmt {
    static func make(_ format: String, locale: String = "en_US_POSIX", timeZone: TimeZone = VNDate.tz) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: locale)
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = timeZone
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
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        return f
    }()
    /// Hai bản riêng (có / không phần lẻ giây) thay cho một bản đổi formatOptions giữa chừng.
    static let isoFrac: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f }()
    static let iso: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f }()
}
