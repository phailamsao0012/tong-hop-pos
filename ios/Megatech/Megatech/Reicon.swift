import SwiftUI

/// Bộ icon Reicon (reicon.dev, gói npm reicon 1.2.5, giấy phép MIT: xem ios/Megatech/THIRD_PARTY_NOTICES.md), anh Vũ chọn ngày 10/10/2026.
/// SVG 24×24 nằm trong Assets.xcassets/Reicon: "ri_<tên>" là kiểu nét, "ri_<tên>_fill" là kiểu đặc, vẽ theo màu foregroundStyle.
/// Mã app vẫn gọi icon bằng tên SF Symbol (hoặc "ic_m_*") như trước; tên nào có trong bảng dưới thì MetricIcon vẽ bằng Reicon, còn lại giữ SF Symbol.
/// ĐÃ BẬT cho mọi bản (anh Vũ xem video so sánh và chốt ngày 10/10/2026). Bản Debug mở với MEGATECH_ICONS=classic thì vẽ lại
/// icon cũ (SF Symbol), chỉ để máy ảo quay video so sánh (.github/workflows/ios-preview.yml).
enum Reicon {
    #if DEBUG
    static let enabled = ProcessInfo.processInfo.environment["MEGATECH_ICONS"] != "classic"
    #else
    static let enabled = true
    #endif
    static let map: [String: String] = [
        "arrow.triangle.2.circlepath": "ri_repeat_circle",
        "banknote.fill": "ri_money",
        "bell.badge.fill": "ri_bell",
        "bell.fill": "ri_bell",
        "building.2.fill": "ri_buildings",
        "calendar": "ri_calendar",
        "cart.fill": "ri_cart_large2",
        "chart.bar.fill": "ri_chart",
        "chart.line.uptrend.xyaxis": "ri_trend_up",
        "checkmark.seal.fill": "ri_verify",
        "checkmark.circle.fill": "ri_tick_circle",
        "clock.badge.exclamationmark": "ri_timer",
        "clock.fill": "ri_clock",
        "creditcard.fill": "ri_card",
        "cylinder.split.1x2.fill": "ri_database",
        "doc.text.fill": "ri_document_text",
        "exclamationmark.triangle.fill": "ri_danger",
        "flame.fill": "ri_fire",
        "gearshape.2.fill": "ri_setting2",
        "hourglass": "ri_hourglass",
        "house.fill": "ri_home",
        "ic_m_aov": "ri_coins",
        "ic_m_calls": "ri_call",
        "ic_m_cancelled": "ri_close_circle",
        "ic_m_closed": "ri_tick_circle",
        "ic_m_customers": "ri_people",
        "ic_m_kpi": "ri_target",
        "ic_m_marketing": "ri_bullhorn",
        "ic_m_orders": "ri_bag",
        "ic_m_products": "ri_box",
        "ic_m_rate": "ri_percentage_circle",
        "ic_m_returned": "ri_undo_circle",
        "ic_m_revenue": "ri_money_bag",
        "ic_m_shipping": "ri_truck",
        "ic_m_staff": "ri_user_check",
        "ic_m_time": "ri_clock",
        "ic_m_upsell": "ri_trend_up",
        "line.3.horizontal": "ri_menu2",
        "list.bullet.clipboard.fill": "ri_clipboard_list",
        "lock.shield.fill": "ri_shield_lock",
        "megaphone.fill": "ri_bullhorn",
        "moon.zzz.fill": "ri_moon_sleep",
        "person.2.fill": "ri_profile2user",
        "person.2.wave.2.fill": "ri_headset",
        "person.3.fill": "ri_people",
        "person.badge.plus": "ri_user_add",
        "person.crop.circle.badge.exclamationmark": "ri_profile_circle",
        "person.crop.rectangle.stack.fill": "ri_personalcard",
        "person.text.rectangle.fill": "ri_user_square",
        "phone.fill": "ri_call",
        "point.3.connected.trianglepath.dotted": "ri_diagram_tree",
        "shippingbox.fill": "ri_box",
        "slider.horizontal.3": "ri_setting4",
        "square.grid.2x2.fill": "ri_category",
        "square.text.square.fill": "ri_document_text",
        "storefront": "ri_shop",
        "target": "ri_target",
        "tray.full.fill": "ri_inbox",
        "trophy.fill": "ri_trophy",
        "truck.box.fill": "ri_truck",
        "wallet.pass.fill": "ri_wallet"
    ]
    /// Tên asset cho một tên icon của app (nil khi chưa có trong bộ); fill = kiểu đặc, như SF Symbol ".fill".
    static func asset(_ name: String, fill: Bool = true) -> String? { enabled ? map[name].map { fill ? $0 + "_fill" : $0 } : nil }
    /// Icon thanh dưới: Reicon nét khi chưa chọn, đặc khi đang chọn; chưa bật thì SF Symbol như cũ.
    static func tab(_ symbol: String, _ asset: String, on: Bool) -> Image { enabled ? Image(on ? asset + "_fill" : asset) : Image(systemName: symbol) }
}
