import SwiftUI
import UIKit

/// Màu hướng A, tự đổi theo giao diện máy.
enum Palette {
    static func dynamic(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light) })
    }
    static let bg = dynamic(0xEDF4ED, 0x091F19)
    static let card = dynamic(0xFFFEF9, 0x18392E)
    static let cardEnd = dynamic(0xF7FBF5, 0x18392E)
    static let wash = dynamic(0xDCE9DD, 0x244B3B)
    static let line = dynamic(0x9CAD9D, 0x416153)
    static let nav = dynamic(0xFFFEF9, 0x102D24)
    static let ink = dynamic(0x142D22, 0xF5FFF8)
    static let muted = dynamic(0x435E4E, 0xBFD1C7)
    static let hero = dynamic(0xD9EBD5, 0x102F24)
    static let heroStart = dynamic(0xE6F5EA, 0x102F24)
    static let heroEnd = dynamic(0xCFE9DC, 0x091F19)
    static let heroGlow = dynamic(0xB9E3CE, 0xB9E3CE)
    static let heroInk = dynamic(0x143222, 0xF5FFF8)
    static let heroMuted = dynamic(0x375640, 0xBFD1C7)
    static let accent = dynamic(0x17684B, 0xB8ED8F)
    static let brand = dynamic(0x17684B, 0x17684B)
    static let brandTop = dynamic(0x1B7554, 0x1B7554)
    static let good = dynamic(0x17643E, 0x8CE8B7)
    static let bad = dynamic(0xA82C23, 0xFFB7AC)
    static let sale = dynamic(0x944700, 0xFFC889)
    static let cskh = dynamic(0x00637A, 0x7CDDF2)
    static let mkt = dynamic(0xA12B59, 0xFFB2D0)
    static let vandon = dynamic(0x726000, 0xE3D887)
    static let hr = dynamic(0x7044A0, 0xD1B5FF)
    static let badge = dynamic(0xD8424F, 0xF06B75)
    static let goodSoft = dynamic(0xE2F4E9, 0x133222)
    static let badSoft = dynamic(0xFCEBEA, 0x3B1C1A)
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
    static let stNew = gray, stNewBg = graySoft
    static let stConf = info, stConfBg = infoSoft
    static let stShip = dynamic(0x9C600A, 0xE9B25A), stShipBg = warnSoft
    static let stDel = dynamic(0x18763F, 0x6FD59A), stDelBg = goodSoft
    static let stRet = orange, stRetBg = orangeSoft
    static let stCan = dynamic(0xB83227, 0xF39389), stCanBg = badSoft
    static let gold = Color(hex: 0xF2C14E), goldInk = Color(hex: 0x5A3E00)
    static let silver = Color(hex: 0xC9CED4), silverInk = Color(hex: 0x3B4148)
    static let bronze = Color(hex: 0xD9935F), bronzeInk = Color(hex: 0x4A2408)
    static let cell = wash, fill = wash, ink2 = muted, ink3 = muted, ink4 = line
    static let accentSoft = wash, accentFill = brand, onFill = Color.white
    static let segSel = card, grid = wash, bar2 = line
}

private extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(red: CGFloat((rgb >> 16) & 0xFF) / 255, green: CGFloat((rgb >> 8) & 0xFF) / 255, blue: CGFloat(rgb & 0xFF) / 255, alpha: 1)
    }
}
