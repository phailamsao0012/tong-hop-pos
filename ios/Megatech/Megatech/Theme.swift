import SwiftUI

// Bảng màu theo bộ ảnh thiết kế: thanh đầu xanh đậm, nền kem sáng, thẻ trắng, nhấn xanh MEGATECH.
extension Color {
    static let brand = Color("AccentColor")
    static let brandDeep = Color(red: 0x0F/255, green: 0x3D/255, blue: 0x2E/255)
    static let brandDark = Color(red: 0x14/255, green: 0x4B/255, blue: 0x38/255)
    static let brandSoft = Color(red: 0xE3/255, green: 0xF1/255, blue: 0xE8/255)
    static let cream = Color(red: 0xF4/255, green: 0xF6/255, blue: 0xF3/255)
    static let lime = Color(red: 0xd9/255, green: 0xf3/255, blue: 0x6d/255)
    static let good = Color(red: 0x15/255, green: 0x80/255, blue: 0x4a/255)
    static let bad = Color(red: 0xc8/255, green: 0x40/255, blue: 0x3f/255)
    static let warn = Color(red: 0xE0/255, green: 0x8A/255, blue: 0x1E/255)
    static let ink = Color(red: 0x14/255, green: 0x1F/255, blue: 0x1A/255)
    static let inkSoft = Color(red: 0x6B/255, green: 0x77/255, blue: 0x71/255)
    static let card = Color.white
}

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
    static func pct(_ n: Double?) -> String { guard let n else { return "—" }; return String(format: "%.1f%%", n).replacingOccurrences(of: ".", with: ",") }
    static func pct0(_ n: Double?) -> String { guard let n else { return "—" }; return String(format: "%.0f%%", n) }
    /// Chênh lệch % so kỳ trước: "+12%" / "-8%"
    static func delta(_ now: Double, _ prev: Double?) -> String? {
        guard let prev, prev > 0 else { return nil }
        let d = (now - prev) / prev * 100
        return (d >= 0 ? "+" : "") + String(format: "%.0f%%", d)
    }
}

/// Ngày theo giờ Việt Nam dạng yyyy-MM-dd.
enum VNDate {
    static let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    static func string(_ d: Date) -> String { let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.timeZone = tz; f.dateFormat = "yyyy-MM-dd"; return f.string(from: d) }
    static func add(_ days: Int, to d: Date = .now) -> Date { d.addingTimeInterval(Double(days) * 86400) }
    static func monthStart(_ d: Date = .now) -> String { String(string(d).prefix(7)) + "-01" }
    /// "Hôm nay, 24 Thg 9, 2026"
    static func pretty(_ d: Date = .now) -> String {
        let f = DateFormatter(); f.timeZone = tz; f.locale = Locale(identifier: "vi_VN"); f.dateFormat = "d 'Thg' M, yyyy"
        return f.string(from: d)
    }
}
