import SwiftUI

extension Color {
    static let brand = Color("AccentColor")
    static let brandDeep = Color(red: 0x11/255, green: 0x3c/255, blue: 0x30/255)
    static let lime = Color(red: 0xd9/255, green: 0xf3/255, blue: 0x6d/255)
    static let good = Color(red: 0x15/255, green: 0x80/255, blue: 0x4a/255)
    static let bad = Color(red: 0xc8/255, green: 0x40/255, blue: 0x3f/255)
}

enum Fmt {
    static let vi: NumberFormatter = { let f = NumberFormatter(); f.numberStyle = .decimal; f.locale = Locale(identifier: "vi_VN"); f.maximumFractionDigits = 0; return f }()
    static func int(_ n: Double) -> String { vi.string(from: NSNumber(value: n.rounded())) ?? "\(Int(n))" }
    static func money(_ n: Double) -> String { "\(int(n)) ₫" }
    /// 1,23 tỷ · 456,7 tr · 12.000
    static func short(_ n: Double) -> String {
        let a = abs(n)
        if a >= 1e9 { return String(format: "%.2f tỷ", n / 1e9).replacingOccurrences(of: ".", with: ",") }
        if a >= 1e6 { return String(format: "%.1f tr", n / 1e6).replacingOccurrences(of: ".", with: ",") }
        return int(n)
    }
    static func pct(_ n: Double?) -> String { guard let n else { return "—" }; return String(format: "%.1f%%", n).replacingOccurrences(of: ".", with: ",") }
}

/// Ngày theo giờ Việt Nam dạng yyyy-MM-dd.
enum VNDate {
    static let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    static func string(_ d: Date) -> String { let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.timeZone = tz; f.dateFormat = "yyyy-MM-dd"; return f.string(from: d) }
    static func add(_ days: Int, to d: Date = .now) -> Date { d.addingTimeInterval(Double(days) * 86400) }
    static func monthStart(_ d: Date = .now) -> String { String(string(d).prefix(7)) + "-01" }
}
