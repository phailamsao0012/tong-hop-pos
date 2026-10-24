import SwiftUI
import Charts

/// Số tiền trong các khối Tổng quan; VoiceOver đọc giá trị đầy đủ.
struct OverviewMoney: View {
    let money: Double
    var size: CGFloat = 56
    var onHero = false
    var body: some View {
        let pair = Fmt.compactMoney(money)
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(pair.value).font(.system(size: size, weight: .heavy, design: .rounded))
                .monospacedDigit().lineLimit(1).minimumScaleFactor(0.5).rolling(pair.value)
            Text(pair.unit).font(.system(size: size == 56 ? 22 : 17, weight: .bold, design: .rounded))
                .foregroundStyle(onHero ? Palette.heroMuted : Palette.muted)
        }.foregroundStyle(onHero ? Palette.heroInk : Palette.ink)
            .accessibilityElement(children: .ignore).accessibilityLabel(Fmt.money(money))
    }
}

/// Chú giải chạm được do trang chứa vẽ bên cạnh vòng.
struct OverviewStatusRing: View {
    let parts: [(String, Double, Color)]
    let center: String
    var body: some View {
        Chart(Array(parts.enumerated()), id: \.offset) { _, part in
            SectorMark(angle: .value("Số đơn", max(0, part.1)), innerRadius: .ratio(0.74), angularInset: 1.5)
                .cornerRadius(3).foregroundStyle(part.2)
        }.frame(width: 110, height: 110)
            .overlay {
                VStack {
                    Text(center).font(.system(.title3, design: .rounded, weight: .heavy)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.5)
                    Text("đơn tạo").font(.caption).foregroundStyle(Palette.muted)
                }
            }.accessibilityElement(children: .ignore).accessibilityLabel("\(center) đơn tạo")
    }
}
