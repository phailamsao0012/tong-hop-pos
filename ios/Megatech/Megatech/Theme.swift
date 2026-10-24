import SwiftUI

// Bảng màu theo bộ ảnh thiết kế: thanh đầu xanh đậm, nền kem sáng, thẻ trắng, nhấn xanh MEGATECH.
extension Color {
    static let brand = Color("AccentColor")
    static let brandDeep = Palette.brand
    static let brandDark = Palette.brand
    static let brandSoft = Palette.accentSoft
    static let cream = Palette.bg
    static let lime = Color(red: 0xd9/255, green: 0xf3/255, blue: 0x6d/255)
    static let good = Palette.good
    static let bad = Palette.bad
    static let warn = Palette.warn
    static let ink = Palette.ink
    static let inkSoft = Palette.muted
    static let card = Palette.card
    static let bg = Palette.bg
    static let line = Palette.line
    static let ink2 = Palette.ink2
    static let ink3 = Palette.ink3
    static let ink4 = Palette.ink4
    static let accentSoft = Palette.accentSoft
    static let accentFill = Palette.accentFill
    static let cellBg = Palette.cell
    static let fillBg = Palette.fill
}
