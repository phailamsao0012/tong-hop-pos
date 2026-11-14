import SwiftUI
import UIKit

/// Màu Gemini, tự đổi theo giao diện máy.
enum Palette {
    static func dynamic(_ light: UInt32, _ dark: UInt32, lightAlpha: CGFloat = 1, darkAlpha: CGFloat = 1) -> Color {
        Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(rgb: dark, alpha: darkAlpha) : UIColor(rgb: light, alpha: lightAlpha) })
    }
    static let mtBrandPrimary = dynamic(0x17684B, 0x17684B)
    static let mtBackground = dynamic(0xF4F7F5, 0x071711)
    static let mtSurfaceCard = dynamic(0xFFFFFF, 0x0E291F)
    static let mtCardBorder = dynamic(0xDCE6E0, 0x34D399, darkAlpha: 0.18)
    static let mtSurfaceCell = dynamic(0xF4F8F6, 0x071912)
    static let mtTextPrimary = dynamic(0x0F291E, 0xF0FDF4)
    static let mtTextSecondary = dynamic(0x335C4A, 0xA7F3D0)
    static let mtSuccessInk = dynamic(0x0F5E3F, 0x6EE7B7)
    static let mtSuccessBg = dynamic(0xD1FAE5, 0x10B981, darkAlpha: 0.20)
    static let mtWarningInk = dynamic(0x78350F, 0xFDE68A)
    static let mtWarningBg = dynamic(0xFEF3C7, 0xF59E0B, darkAlpha: 0.16)
    static let mtDangerInk = dynamic(0xBE123C, 0xFDA4AF)
    static let mtDangerBg = dynamic(0xFFE4E6, 0xF43F5E, darkAlpha: 0.20)
    static let mtRolePurpleInk = dynamic(0x4C1D95, 0xDDD6FE)
    static let mtRolePurpleBg = dynamic(0xF3E8FF, 0x8B5CF6, darkAlpha: 0.25)
    static let bg = mtBackground
    static let card = mtSurfaceCard
    static let cardEnd = mtSurfaceCard
    static let wash = mtSurfaceCell
    static let line = mtCardBorder
    static let nav = mtSurfaceCard
    static let ink = mtTextPrimary
    static let muted = mtTextSecondary
    static let hero = mtSurfaceCard
    static let heroStart = mtSurfaceCard
    static let heroEnd = mtSurfaceCard
    static let heroGlow = dynamic(0x17684B, 0x17684B, lightAlpha: 0.12, darkAlpha: 0.12)
    static let heroInk = mtTextPrimary
    static let heroMuted = mtTextSecondary
    static let accent = dynamic(0x17684B, 0x6EE7B7)
    static let brand = mtBrandPrimary
    static let brandTop = dynamic(0x1B7554, 0x1B7554)
    static let good = mtSuccessInk
    static let bad = mtDangerInk
    static let sale = mtSuccessInk
    static let cskh = dynamic(0x00637A, 0x7CDDF2)
    static let mkt = mtWarningInk
    static let vandon = mtRolePurpleInk
    static let hr = dynamic(0x7044A0, 0xD1B5FF)
    static let badge = dynamic(0xD8424F, 0xF06B75)
    static let goodSoft = mtSuccessBg
    static let badSoft = mtDangerBg
    static let warn = mtWarningInk
    static let warnSoft = mtWarningBg
    static let info = dynamic(0x2A5FC4, 0x8FB4F2)
    static let infoSoft = dynamic(0xEBF1FD, 0x182842)
    static let purple = mtRolePurpleInk
    static let purpleSoft = mtRolePurpleBg
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
    convenience init(rgb: UInt32, alpha: CGFloat = 1) {
        self.init(red: CGFloat((rgb >> 16) & 0xFF) / 255, green: CGFloat((rgb >> 8) & 0xFF) / 255, blue: CGFloat(rgb & 0xFF) / 255, alpha: alpha)
    }
}

extension Color {
    static let mtBrandPrimary = Palette.mtBrandPrimary
    static let mtBackground = Palette.mtBackground
    static let mtSurfaceCard = Palette.mtSurfaceCard
    static let mtCardBorder = Palette.mtCardBorder
    static let mtSurfaceCell = Palette.mtSurfaceCell
    static let mtTextPrimary = Palette.mtTextPrimary
    static let mtTextSecondary = Palette.mtTextSecondary
    static let mtSuccessInk = Palette.mtSuccessInk
    static let mtSuccessBg = Palette.mtSuccessBg
    static let mtWarningInk = Palette.mtWarningInk
    static let mtWarningBg = Palette.mtWarningBg
    static let mtDangerInk = Palette.mtDangerInk
    static let mtDangerBg = Palette.mtDangerBg
    static let mtRolePurpleInk = Palette.mtRolePurpleInk
    static let mtRolePurpleBg = Palette.mtRolePurpleBg
}
