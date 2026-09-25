import SwiftUI

/// Tổng quan POS: chạm một thẻ số → bảng giải thích cách tính (kèm đối chiếu) → danh sách đơn cấu thành → hồ sơ đơn.
/// Bộ lọc kỳ và POS được mang theo khi đi sâu.
struct Chip: View {
    let label: String; let on: Bool; let tap: () -> Void
    var body: some View {
        Button(action: tap) {
            Text(label).font(.caption.weight(.semibold)).padding(.horizontal, 12).padding(.vertical, 7)
                .background(on ? Color.brand : Color(.secondarySystemGroupedBackground), in: .capsule)
                .foregroundStyle(on ? .white : .primary)
                .animation(.snappy(duration: 0.25), value: on)
        }.buttonStyle(.plain)
    }
}

struct ReconcileLine: View {
    let state: (ok: Bool, text: String)
    var body: some View {
        Label(state.text, systemImage: state.ok ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
            .font(.caption).foregroundStyle(state.ok ? Color.good : .orange)
            .padding(10).frame(maxWidth: .infinity, alignment: .leading)
            .background((state.ok ? Color.good : Color.warn).opacity(0.1), in: .rect(cornerRadius: 10))
    }
}

/// Trạng thái hiện tại của đơn tạo trong kỳ; chạm một đoạn → danh sách đơn đúng trạng thái.
struct StatusStrip: View {
    let groups: [String: API.Group]; let total: Double; let open: (String, String) -> Void
    static let items: [(String, String, Color)] = [("new", "Mới / chờ XN", .gray), ("confirmed", "Đã xác nhận", .brand), ("shipping", "Đang giao", .blue), ("delivered", "Đã nhận", .good), ("returned", "Hoàn", .orange), ("cancelled", "Hủy", .bad)]
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Trạng thái đơn tạo trong kỳ").font(.headline)
            GeometryReader { g in
                HStack(spacing: 2) {
                    ForEach(Self.items, id: \.0) { k, _, c in
                        let n = groups[k]?.orders ?? 0
                        if n > 0 { RoundedRectangle(cornerRadius: 3).fill(c).frame(width: max(4, g.size.width * n / max(1, total))) }
                    }
                }
            }.frame(height: 10)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(Self.items, id: \.0) { k, title, c in
                    Button { open(k, title) } label: {
                        HStack(spacing: 6) {
                            Circle().fill(c).frame(width: 8, height: 8)
                            Text(title).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            Spacer(minLength: 0)
                            Text(Fmt.int(groups[k]?.orders ?? 0)).font(.caption.weight(.semibold)).monospacedDigit()
                        }
                    }.buttonStyle(.plain)
                }
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16))
    }
}

struct KpiTile: View {
    let title: String; let value: String; let unit: String?; let now: Double; let prev: Double?; let icon: String; let tint: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon).font(.subheadline.weight(.semibold)).foregroundStyle(tint).symbolEffect(.bounce, value: value)
                    .frame(width: 30, height: 30).background(tint.opacity(0.14), in: .rect(cornerRadius: 8))
                Spacer()
                Image(systemName: "chevron.right").font(.caption2.weight(.bold)).foregroundStyle(.quaternary)
            }
            Text(title.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(.secondary).lineLimit(1)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value).font(.system(.title2, design: .rounded).weight(.bold)).monospacedDigit().minimumScaleFactor(0.6).lineLimit(1).rolling(value)
                if let unit { Text(unit).font(.caption).foregroundStyle(.secondary) }
            }
            if let prev, prev > 0 {
                let d = (now - prev) / prev * 100
                Label(Fmt.pct(abs(d)), systemImage: d >= 0 ? "arrow.up.right" : "arrow.down.right")
                    .font(.caption.weight(.semibold)).foregroundStyle(d >= 0 ? Color.good : Color.bad)
            } else { Text("—").font(.caption).foregroundStyle(.tertiary) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16))
        .contentShape(.rect)
    }
}

struct PosBreakdown: View {
    let rows: [API.PosRow]; let total: Double; var pick: (String) -> Void = { _ in }
    static let names = ["sieu-vo-gao": "Siêu Vô Gạo", "mgt-apex": "MGT - APEX", "thuy-san": "Thủy sản Megatech", "bio-nano": "BIO NANO", "megaroot": "MEGAROOT", "oxytetra": "Oxytetra - Megatech"]
    static let order = ["sieu-vo-gao", "mgt-apex", "thuy-san", "bio-nano", "megaroot", "oxytetra"]
    static let short = ["sieu-vo-gao": "Siêu Vô Gạo", "mgt-apex": "MGT APEX", "thuy-san": "Thủy sản", "bio-nano": "BIO NANO", "megaroot": "MEGAROOT", "oxytetra": "Oxytetra"]
    var prev: [API.PosRow] = []
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack { Text("Theo POS").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink); Spacer(); Text("chạm để chỉ xem POS đó").font(.caption2).foregroundStyle(Color.inkSoft) }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(rows.sorted { $0.closedNet > $1.closedNet }, id: \.posId) { r in
                    Button { pick(r.posId) } label: { PosTile(id: r.posId, row: r, prev: prev.first { $0.posId == r.posId }, total: total) }.buttonStyle(.plain)
                }
            }
        }
    }
}


