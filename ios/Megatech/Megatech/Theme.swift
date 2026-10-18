import SwiftUI

// Bảng màu theo bộ ảnh thiết kế: thanh đầu xanh đậm, nền kem sáng, thẻ trắng, nhấn xanh MEGATECH.
extension Color {
    static let brand = Color("AccentColor")
    static let brandDeep = Palette.accentFill
    static let brandDark = Palette.accentFill
    static let brandSoft = Palette.accentSoft
    static let cream = Palette.bg
    static let lime = Color(red: 0xd9/255, green: 0xf3/255, blue: 0x6d/255)
    static let good = Palette.good
    static let bad = Palette.bad
    static let warn = Palette.warn
    static let ink = Palette.ink
    static let inkSoft = Palette.ink3
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

/// Bảng màu 1.0 tự đổi theo giao diện máy.
enum Palette {
    static func dynamic(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light) })
    }
    static let bg = dynamic(0xF2F4F0, 0x0B100D)
    static let card = dynamic(0xFFFFFF, 0x171F1A)
    static let cell = dynamic(0xF5F7F4, 0x1E2822)
    static let fill = dynamic(0xE9EDE8, 0x26312B)
    static let line = dynamic(0xE3E8E2, 0x233029)
    static let segSel = dynamic(0xFFFFFF, 0x3A4A41)
    static let ink = dynamic(0x142019, 0xE8EEEA)
    static let ink2 = dynamic(0x46544C, 0xAAB6AF)
    static let ink3 = dynamic(0x626E67, 0x8A968F)
    static let ink4 = dynamic(0xA5AEA8, 0x56625B)
    static let accent = dynamic(0x17684B, 0x4FC48F)
    static let accentSoft = dynamic(0xE5F1EB, 0x173426)
    static let accentFill = dynamic(0x17684B, 0x1F7A57)
    static let onFill = dynamic(0xFFFFFF, 0xFFFFFF)
    static let good = dynamic(0x15804A, 0x5FCF8F)
    static let goodSoft = dynamic(0xE2F4E9, 0x133222)
    static let bad = dynamic(0xC2412D, 0xF0806F)
    static let badSoft = dynamic(0xFCEBEA, 0x3B1C1A)
    static let badge = dynamic(0xD8424F, 0xF06B75)
    static let warn = dynamic(0x9A6500, 0xE3A63A)
    static let warnSoft = dynamic(0xFCF3E3, 0x33270F)
    static let info = dynamic(0x2A5FC4, 0x8FB4F2)
    static let infoSoft = dynamic(0xEBF1FD, 0x182842)
    static let purple = dynamic(0x6B4FC8, 0xB19CF0)
    static let purpleSoft = dynamic(0xEFEBFB, 0x261F3D)
    static let orange = dynamic(0xBB4F16, 0xF2A07A)
    static let orangeSoft = dynamic(0xFDEDE4, 0x3A2216)
    static let teal = dynamic(0x0F7A68, 0x5CC9B3)
    static let tealSoft = dynamic(0xE1F3EF, 0x12302A)
    static let gray = dynamic(0x5D6A62, 0xA9B5AE)
    static let graySoft = dynamic(0xEEF1EE, 0x1F2823)
    static let bar2 = dynamic(0xC9D1CB, 0x34423A)
    static let grid = dynamic(0xEDF0EC, 0x1D2620)
    static let stNew = dynamic(0x5D6A62, 0xA9B5AE)
    static let stNewBg = dynamic(0xEEF1EE, 0x1F2823)
    static let stConf = dynamic(0x2A5FC4, 0x8FB4F2)
    static let stConfBg = dynamic(0xEBF1FD, 0x182842)
    static let stShip = dynamic(0x9C600A, 0xE9B25A)
    static let stShipBg = dynamic(0xFCF3E3, 0x33270F)
    static let stDel = dynamic(0x18763F, 0x6FD59A)
    static let stDelBg = dynamic(0xE2F4E9, 0x133222)
    static let stRet = dynamic(0xBB4F16, 0xF2A07A)
    static let stRetBg = dynamic(0xFDEDE4, 0x3A2216)
    static let stCan = dynamic(0xB83227, 0xF39389)
    static let stCanBg = dynamic(0xFCEBEA, 0x3B1C1A)
}

private extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(red: CGFloat((rgb >> 16) & 0xFF) / 255, green: CGFloat((rgb >> 8) & 0xFF) / 255, blue: CGFloat(rgb & 0xFF) / 255, alpha: 1)
    }
}
