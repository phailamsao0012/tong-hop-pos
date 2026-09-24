import SwiftUI

// Hiệu ứng động dùng chung: số chạy khi đổi kỳ, thanh mọc từ 0 khi xuất hiện, nội dung mờ dần khi tải,
// khung xương nhấp nháy khi chờ. Tôn trọng "Giảm chuyển động" trong Cài đặt trợ năng.

/// Thanh tỷ lệ mọc từ 0 khi hiện ra và trượt mượt khi giá trị đổi.
struct Bar: View {
    let value: Double            // 0…1
    var tint: Color = .brand
    var height: CGFloat = 6
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Color(.systemFill))
                Capsule().fill(tint).frame(width: max(height, g.size.width * (shown ? min(1, max(0, value)) : 0)))
            }
        }
        .frame(height: height)
        .onAppear { if reduce { shown = true } else { withAnimation(.spring(duration: 0.7, bounce: 0.15).delay(0.05)) { shown = true } } }
        .animation(reduce ? nil : .spring(duration: 0.6, bounce: 0.1), value: value)
    }
}

/// Số hiển thị đổi bằng hiệu ứng cuộn chữ số.
struct Rolling: ViewModifier {
    let key: String
    @Environment(\.accessibilityReduceMotion) private var reduce
    func body(content: Content) -> some View {
        content.contentTransition(reduce ? .identity : .numericText()).animation(reduce ? nil : .snappy(duration: 0.45), value: key)
    }
}
extension View { func rolling(_ key: String) -> some View { modifier(Rolling(key: key)) } }

/// Nội dung trồi lên và rõ dần khi dữ liệu về.
struct Reveal: ViewModifier {
    @State private var on = false
    @Environment(\.accessibilityReduceMotion) private var reduce
    func body(content: Content) -> some View {
        content.opacity(on || reduce ? 1 : 0).offset(y: on || reduce ? 0 : 10)
            .onAppear { withAnimation(.easeOut(duration: 0.35)) { on = true } }
    }
}
extension View { func reveal() -> some View { modifier(Reveal()) } }

/// Khung xương nhấp nháy khi đang chờ dữ liệu.
struct Skeleton: View {
    var height: CGFloat = 96
    @State private var phase: CGFloat = -1
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemGroupedBackground))
            .overlay {
                if !reduce {
                    GeometryReader { g in
                        LinearGradient(colors: [.clear, Color.primary.opacity(0.06), .clear], startPoint: .leading, endPoint: .trailing)
                            .frame(width: g.size.width * 0.6).offset(x: phase * g.size.width)
                    }
                }
            }
            .clipShape(.rect(cornerRadius: 16))
            .frame(height: height)
            .onAppear { withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) { phase = 1.2 } }
    }
}

struct SkeletonGrid: View {
    var tiles = 4
    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            ForEach(0..<tiles, id: \.self) { _ in Skeleton(height: 118) }
        }
    }
}
