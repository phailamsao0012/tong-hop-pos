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
                Capsule().fill(Palette.fill)
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

// MARK: Hiệu ứng "AI đang nghĩ" khi tải dữ liệu (thống nhất web / iOS / Android)

enum Thinking {
    /// Bảng màu vòng: vàng chanh → xanh lá → xanh dương → tím → hồng → vàng chanh.
    static let palette: [Color] = [Color(hex: 0xd9f36d), Color(hex: 0x1baf7a), Color(hex: 0x2a78d6), Color(hex: 0x7f6fd2), Color(hex: 0xe87ba4), Color(hex: 0xd9f36d)]
    static func conic(_ angle: Angle = .zero) -> AngularGradient { AngularGradient(colors: palette, center: .center, angle: angle) }
    static let captions = ["Đang tổng hợp số liệu…", "Đang đối chiếu 6 POS…", "Đang tính doanh thu và tỷ lệ chốt…", "Sắp xong…"]
}

/// Bản DEBUG: biến môi trường MEGATECH_FPS (ví dụ 20) giới hạn số khung hình mỗi giây của các hiệu ứng chạy liên tục, để máy ảo
/// chậm trên GitHub còn sức chạy lệnh giả lập Face ID khi quay video xem trước. Bản phát hành luôn chạy theo màn hình (nil).
enum FrameCap {
    static let interval: Double? = {
        #if DEBUG
        if let s = ProcessInfo.processInfo.environment["MEGATECH_FPS"], let f = Double(s), f > 0 { return 1 / f }
        #endif
        return nil
    }()
}

/// Viền dải màu chạy quanh chính khung đang tải (ô số duyệt, thẻ KPI tải lại, khung xương, nút đang xác thực):
/// nét 2,25pt xoay 2,2 giây/vòng + quầng sáng mờ cùng dải màu bên ngoài. Giảm chuyển động → viền dải màu đứng yên.
struct ThinkingBorder: View {
    var radius: CGFloat = 12; var line: CGFloat = 2.25; var glow = true
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        TimelineView(.animation(minimumInterval: FrameCap.interval, paused: reduce)) { t in
            let turn = reduce ? 0 : t.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 2.2) / 2.2
            let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
            ZStack {
                if glow { shape.stroke(Thinking.conic(.degrees(turn * 360)), lineWidth: line * 2.5).blur(radius: 8).opacity(0.45) }
                shape.strokeBorder(Thinking.conic(.degrees(turn * 360)), lineWidth: line)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Khung chờ: chính khung bo góc có viền dải màu chạy, bên trong là dòng chữ đổi mỗi 1,8 giây (không có vòng xoay riêng).
/// ring false: không có viền chạy (đặt trên các thẻ số khung xám của SkeletonGrid).
struct ThinkingLoader: View {
    var captions: [String] = Thinking.captions
    var height: CGFloat = 64
    var ring = true
    @State private var i = 0
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        Text(captions[i % captions.count]).font(.footnote.weight(.semibold)).foregroundStyle(Color.inkSoft)
            .id(i).transition(.opacity)
            .frame(maxWidth: .infinity, minHeight: height)
            .cardSurface(radius: 12)
            .overlay { if ring { ThinkingBorder(radius: 12) } }
            .padding(.vertical, 4)
            .accessibilityLabel("Đang tải")
            .task {
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(1.8))
                    withAnimation(reduce ? nil : .easeInOut(duration: 0.35)) { i += 1 }
                }
            }
    }
}

/// Bật viền dải màu chạy quanh khung khi đang tải (thẻ vẫn hiện số cũ); tắt thì mờ dần.
struct ThinkingGlow: ViewModifier {
    let on: Bool; var radius: CGFloat = 12
    func body(content: Content) -> some View {
        content.overlay { if on { ThinkingBorder(radius: radius).transition(.opacity) } }
            .animation(.easeInOut(duration: 0.3), value: on)
    }
}
/// Khung xương khi chờ dữ liệu: nền trung tính, vệt sáng dải màu (18%) quét ngang 1,4 giây một lượt.
struct Skeleton: View {
    var height: CGFloat = 96
    @State private var phase: CGFloat = -1
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        RoundedRectangle(cornerRadius: 16).fill(Palette.fill)
            .overlay {
                if reduce {
                    LinearGradient(colors: Thinking.palette.map { $0.opacity(0.10) }, startPoint: .leading, endPoint: .trailing)
                } else {
                    GeometryReader { g in
                        LinearGradient(colors: [.clear] + Thinking.palette.dropLast().map { $0.opacity(0.18) } + [.clear], startPoint: .leading, endPoint: .trailing)
                            .frame(width: g.size.width * 0.8).offset(x: phase * g.size.width)
                    }
                }
            }
            .clipShape(.rect(cornerRadius: 16))
            .overlay(ThinkingBorder(radius: 16, glow: false))
            .frame(height: height)
            .onAppear { if !reduce { phase = -0.8; withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) { phase = 1.0 } } }
    }
}

/// Chờ số lần đầu: dòng chữ đang tải + các thẻ số khung xám (redacted, đúng dáng thẻ KPI sắp hiện), không có quầng sáng chạy.
struct SkeletonGrid: View {
    var tiles = 4
    var body: some View {
        VStack(spacing: 8) {
            ThinkingLoader(height: 44, ring: false)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(0..<tiles, id: \.self) { _ in
                    KpiCard(icon: "chart.bar.fill", tint: Palette.gray, label: "Đang tải số liệu", value: "0900000001", note: "so với kỳ trước")
                        .redacted(reason: .placeholder)
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }
}

/// Đang tải lại (vẫn giữ chỗ số cũ): số trong thẻ KPI, bảng bộ phận, ô POS thành khung xám (loadingPlaceholder).
private struct ThinkingKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues { var thinking: Bool { get { self[ThinkingKey.self] } set { self[ThinkingKey.self] = newValue } } }
extension View { func thinkingGlow(_ on: Bool, radius: CGFloat = 12) -> some View { modifier(ThinkingGlow(on: on, radius: radius)) } }

/// Đang tải lại (vẫn giữ chỗ của số cũ): chữ / số thành khung xám (redacted) thay cho viền dải màu chạy có quầng mờ quanh thẻ.
extension View {
    func loadingPlaceholder(_ on: Bool) -> some View {
        redacted(reason: on ? .placeholder : []).animation(.easeInOut(duration: 0.25), value: on)
    }
}
