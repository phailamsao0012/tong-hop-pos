import SwiftUI

// Biểu tượng & thẻ POS (duyệt 25/09/2026): mỗi POS một biểu tượng riêng (ảnh SVG template pos_* trong Assets),
// màu giữ đúng 6 màu POS của web. Dùng chung cho chip lọc, ô POS trên Trang chủ / Tổng quan POS và mọi dòng có tên POS.

enum PosInfo {
    static let hex: [String: UInt32] = ["sieu-vo-gao": 0x2a78d6, "mgt-apex": 0xeb6834, "thuy-san": 0x1baf7a, "bio-nano": 0xeda100, "megaroot": 0xe87ba4, "oxytetra": 0x4a3aa7]
    /// Tên ngắn trên chip khi hẹp.
    static let tiny = ["sieu-vo-gao": "Vô Gạo", "mgt-apex": "APEX", "thuy-san": "Thủy sản", "bio-nano": "BIO", "megaroot": "ROOT", "oxytetra": "Oxytetra"]
    static func color(_ id: String) -> Color { Color(hex: hex[id] ?? 0x6b7771) }
    static func asset(_ id: String) -> String { "pos_" + id.replacingOccurrences(of: "-", with: "_") }
    static func has(_ id: String) -> Bool { hex[id] != nil }
    /// Tìm posId theo tên POS (các API chỉ trả posName).
    static func id(forName name: String) -> String? {
        let n = name.lowercased()
        return PosBreakdown.names.first { $0.value.lowercased() == n }?.key ?? PosBreakdown.short.first { $0.value.lowercased() == n }?.key
    }
}

extension Color {
    init(hex: UInt32) { self.init(red: Double((hex >> 16) & 0xff) / 255, green: Double((hex >> 8) & 0xff) / 255, blue: Double(hex & 0xff) / 255) }
    /// Trộn với màu khác theo tỷ lệ t (0 = giữ nguyên, 1 = màu kia).
    func mixed(with other: Color, _ t: Double) -> Color {
        let a = UIColor(self), b = UIColor(other)
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0, r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
        a.getRed(&r1, green: &g1, blue: &b1, alpha: &a1); b.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        let k = CGFloat(t)
        return Color(red: Double(r1 + (r2 - r1) * k), green: Double(g1 + (g2 - g1) * k), blue: Double(b1 + (b2 - b1) * k))
    }
}

/// Ô vuông bo góc chứa biểu tượng POS: nền màu POS nhạt, nét màu POS, viền trong mảnh.
struct PosBadge: View {
    let id: String; var size: CGFloat = 20; var muted = false
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let c = PosInfo.color(id), dark = scheme == .dark
        let r = size * 0.28
        ZStack {
            RoundedRectangle(cornerRadius: r, style: .continuous).fill(c.opacity(dark ? 0.22 : 0.14))
            RoundedRectangle(cornerRadius: r, style: .continuous).strokeBorder(c.opacity(0.28), lineWidth: 1)
            if PosInfo.has(id) {
                Image(PosInfo.asset(id)).renderingMode(.template).resizable().scaledToFit()
                    .foregroundStyle(dark ? c.mixed(with: .white, 0.3) : c).frame(width: size * 0.62, height: size * 0.62)
            } else {
                Image(systemName: "storefront").font(.system(size: size * 0.45, weight: .semibold)).foregroundStyle(c)
            }
        }
        .frame(width: size, height: size)
        .grayscale(muted ? 1 : 0).opacity(muted ? 0.55 : 1)
        .accessibilityHidden(true)
    }
}

/// Badge nhỏ + tên POS dùng trong các dòng danh sách, bảng, hồ sơ đơn/khách.
struct PosLabel: View {
    let id: String?; var name: String? = nil; var size: CGFloat = 16; var short = true
    var body: some View {
        let pid = id ?? name.flatMap(PosInfo.id(forName:)) ?? ""
        HStack(spacing: 5) {
            PosBadge(id: pid, size: size)
            Text(short ? (PosBreakdown.short[pid] ?? name ?? pid) : (PosBreakdown.names[pid] ?? name ?? pid)).lineLimit(1)
        }
    }
}

/// Chip chọn POS: đang chọn = nền màu POS nhạt, viền màu POS, chấm tích; không chọn = nền xám, badge xám.
struct PosChip: View {
    let id: String; let on: Bool; var compact = false
    /// "history" (vàng: đang tải lịch sử) / "error" (đỏ: lỗi đồng bộ) nếu có.
    var state: String? = nil
    let tap: () -> Void
    var body: some View {
        let c = PosInfo.color(id)
        Button(action: tap) {
            HStack(spacing: 6) {
                PosBadge(id: id, size: 24, muted: !on)
                Text(compact ? (PosInfo.tiny[id] ?? id) : (PosBreakdown.short[id] ?? id)).font(.system(size: 12, weight: .semibold)).lineLimit(1)
                    .foregroundStyle(on ? Color.ink : Color.inkSoft)
                if let state { Circle().fill(state == "error" ? Color.bad : Color.warn).frame(width: 6, height: 6) }
                if on { Image(systemName: "checkmark").font(.system(size: 8, weight: .heavy)).foregroundStyle(.white).frame(width: 16, height: 16).background(c, in: .circle) }
            }
            .padding(.leading, 5).padding(.trailing, on ? 6 : 11).padding(.vertical, 4)
            .background(on ? c.opacity(0.08) : Color.black.opacity(0.04), in: .capsule)
            .overlay(Capsule().strokeBorder(on ? c.opacity(0.55) : Color.black.opacity(0.1), lineWidth: on ? 1.5 : 1))
            .animation(.snappy(duration: 0.25), value: on)
        }.buttonStyle(.plain)
    }
}

/// Dải chip POS: "Tất cả" + 6 POS. Trạng thái đồng bộ lấy từ SyncStatus.
struct PosChipRow: View {
    @Binding var selection: String
    var label: String? = "POS"; var allLabel = "Tất cả"
    @Environment(SyncStatus.self) private var sync
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if let label { Text(label).font(.system(size: 10, weight: .bold)).foregroundStyle(Color.inkSoft) }
                FilterChip(label: allLabel, on: selection.isEmpty) { selection = "" }
                ForEach(PosBreakdown.order, id: \.self) { id in
                    PosChip(id: id, on: selection == id, state: sync.pos.first { $0.posId == id }?.lastError != nil ? "error" : nil) { selection = selection == id ? "" : id }
                }
            }.padding(.vertical, 1)
        }
    }
}

/// Thẻ một POS: dải màu nhạt mép trên, badge + tên + % so kỳ trước, doanh thu to, 3 ô nhỏ, thanh tỷ trọng, sparkline 7 ngày.
struct PosTile: View {
    @Environment(\.thinking) private var thinking
    let id: String
    let row: API.PosRow?
    var prev: API.PosRow? = nil
    /// Tổng doanh thu các POS (để vẽ thanh tỷ trọng).
    var total: Double = 0
    /// Doanh thu theo ngày (7 ngày gần nhất) nếu có.
    var spark: [Double] = []
    var status: (Color, String)? = nil
    var body: some View {
        let c = PosInfo.color(id)
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 7) {
                PosBadge(id: id, size: 32)
                VStack(alignment: .leading, spacing: 1) {
                    Text(PosBreakdown.short[id] ?? id).font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink).lineLimit(1).minimumScaleFactor(0.8)
                    if let status { Text(status.1).font(.system(size: 8, weight: .semibold)).foregroundStyle(status.0).lineLimit(1) }
                }
                Spacer(minLength: 0)
                if let row, let d = Fmt.delta(row.closedNet, prev?.closedNet) {
                    let down = d.hasPrefix("-")
                    HStack(spacing: 1) { Image(systemName: down ? "arrow.down.right" : "arrow.up.right").font(.system(size: 7, weight: .heavy)); Text(d.replacingOccurrences(of: "+", with: "")) }
                        .font(.system(size: 9, weight: .bold)).foregroundStyle(down ? Color.bad : Color.good)
                        .padding(.horizontal, 5).padding(.vertical, 2).background((down ? Color.bad : Color.good).opacity(0.12), in: .capsule)
                }
            }
            if let row {
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(Fmt.short(row.closedNet)).font(.system(size: 19, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7).rolling(Fmt.short(row.closedNet))
                    Text("₫").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                    Spacer(minLength: 0)
                    if spark.count > 1 { PosSpark(points: spark, tint: c).frame(width: 46, height: 18) }
                }
                HStack(spacing: 4) {
                    mini("Đơn chốt", Fmt.int(row.closedOrders))
                    mini("GTTB", row.closedOrders > 0 ? Fmt.short(row.closedNet / row.closedOrders) : "—")
                    mini("Tỷ lệ chốt", Fmt.pct0(row.shownRate))
                }
                if total > 0 {
                    VStack(alignment: .leading, spacing: 2) {
                        Bar(value: row.closedNet / total, tint: c, height: 4)
                        Text("Tỷ trọng \(Fmt.pct0(row.closedNet / total * 100))").font(.system(size: 8)).foregroundStyle(Color.inkSoft)
                    }
                }
            } else { Skeleton(height: 58) }
        }
        .padding(10)
        .background(alignment: .top) { LinearGradient(colors: [c.opacity(0.11), c.opacity(0)], startPoint: .top, endPoint: .bottom).frame(height: 44) }
        .background(Color.card)
        .clipShape(.rect(cornerRadius: 12))
        .thinkingGlow(thinking && row != nil)
        .cardShadow()
    }
    private func mini(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(value).font(.system(size: 11, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
            Text(label).font(.system(size: 7.5)).foregroundStyle(Color.inkSoft).lineLimit(1).minimumScaleFactor(0.8)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 5).padding(.vertical, 4).background(Color.black.opacity(0.035), in: .rect(cornerRadius: 6))
    }
}

/// Sparkline nhỏ màu POS.
struct PosSpark: View {
    let points: [Double]; let tint: Color
    var body: some View {
        GeometryReader { g in
            let maxV = max(1, points.max() ?? 1), n = max(1, points.count - 1)
            let pts = points.enumerated().map { i, v in CGPoint(x: g.size.width * CGFloat(i) / CGFloat(n), y: 2 + (g.size.height - 4) * (1 - v / maxV)) }
            Path { p in p.move(to: CGPoint(x: 0, y: g.size.height)); for q in pts { p.addLine(to: q) }; p.addLine(to: CGPoint(x: g.size.width, y: g.size.height)); p.closeSubpath() }
                .fill(LinearGradient(colors: [tint.opacity(0.25), tint.opacity(0)], startPoint: .top, endPoint: .bottom))
            Path { p in p.move(to: pts[0]); for q in pts.dropFirst() { p.addLine(to: q) } }.stroke(tint, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
        }
    }
}
