import SwiftUI

// Khung chung của màn đăng nhập, "Chào mừng trở lại" và "App đang khoá" (09/10/2026), giống trang đăng nhập web trên điện thoại:
// nền đêm xanh lá có sao và hai tia chớp xanh chanh thay phiên giáng xuống phía sau, linh vật logo đứng trên mép thẻ,
// thẻ tối gần như đặc (để tia chớp không cắt ngang ô nhập). Sau màn mở đầu, linh vật cùng thẻ trồi lên từ dưới.

struct LoginShell<Content: View>: View {
    var mood: MascotMood
    var gaze: CGPoint
    /// Tăng 1 để thẻ rung (sai mật khẩu / Face ID không khớp).
    var shake: Int
    let content: Content
    @Environment(IntroState.self) private var intro

    init(mood: MascotMood, gaze: CGPoint = .zero, shake: Int = 0, @ViewBuilder content: () -> Content) {
        self.mood = mood; self.gaze = gaze; self.shake = shake; self.content = content()
    }

    var body: some View {
        let shown = intro.stage != .play
        ZStack {
            // Lúc màn mở đầu đang phủ kín thì chỉ để nền phẳng: không vẽ tia chớp, linh vật, thẻ phía sau cho đỡ tốn máy.
            if shown { LoginBackdrop() } else { Color(hex: 0x071a14).ignoresSafeArea() }
            if shown {
                GeometryReader { g in
                    ScrollView {
                        // Linh vật đứng trên mép thẻ và rung cùng thẻ khi sai (như .den-card.is-shake của web).
                        ZStack(alignment: .top) {
                            VStack(spacing: 14) { content }
                                .frame(maxWidth: .infinity)
                                .padding(.top, 62).padding(.horizontal, 18).padding(.bottom, 20)
                                .background(card)
                                .frame(maxWidth: 420)
                                .padding(.top, 176)
                            PoppingMascot(mood: mood, gaze: gaze)
                        }
                        .modifier(CardShake(phase: CGFloat(shake)))
                        .animation(.linear(duration: 0.45), value: shake)
                        .padding(.horizontal, 16).padding(.vertical, 12)
                        .frame(maxWidth: .infinity, minHeight: g.size.height)
                    }
                    .scrollDismissesKeyboard(.interactively)
                }
                // Linh vật cùng thẻ trồi lên từ dưới, rõ dần (như .den-stage của web khi màn mở đầu phóng to xong).
                .transition(.modifier(active: RiseIn(on: false), identity: RiseIn(on: true)))
            }
        }
        .animation(.timingCurve(0.16, 1, 0.3, 1, duration: 1), value: shown)
        .preferredColorScheme(.dark)
    }

    private var card: some View {
        RoundedRectangle(cornerRadius: 22)
            .fill(LinearGradient(colors: [Color(red: 22 / 255, green: 62 / 255, blue: 48 / 255).opacity(0.97), Color(red: 11 / 255, green: 37 / 255, blue: 29 / 255).opacity(0.98)],
                                 startPoint: .top, endPoint: .bottom))
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(Brand.mint.opacity(0.2)))
            .shadow(color: Color(hex: 0x020e09).opacity(0.9), radius: 30, y: 30)
    }
}

/// Linh vật nảy lên khi hiện (như .den-husky của web: den-pop 0,8 giây, từ thấp 46 điểm và nhỏ 90% bật lên quá đà rồi về chỗ).
private struct PoppingMascot: View {
    let mood: MascotMood
    let gaze: CGPoint
    @Environment(\.accessibilityReduceMotion) private var still
    @State private var popped = false
    var body: some View {
        MegatechMascot(mood: mood, gaze: gaze)
            .frame(width: 230)
            .shadow(color: Color(hex: 0x020e09).opacity(0.55), radius: 13, y: 18)
            .scaleEffect(popped || still ? 1 : 0.9, anchor: .bottom)
            .offset(y: popped || still ? 0 : 46)
            .opacity(popped || still ? 1 : 0)
            .allowsHitTesting(false)
            .onAppear { withAnimation(.timingCurve(0.2, 0.9, 0.25, 1.25, duration: 0.8)) { popped = true } }
    }
}

private struct RiseIn: ViewModifier {
    let on: Bool
    func body(content: Content) -> some View {
        content.opacity(on ? 1 : 0).offset(y: on ? 0 : 90).scaleEffect(on ? 1 : 0.96).blur(radius: on ? 0 : 6)
    }
}

/// Tiêu đề chữ chuyển xanh chanh → xanh bạc hà như .den-title của web.
struct LoginTitle: View {
    let text: String
    var size: CGFloat = 34
    var body: some View {
        Text(text).font(.system(size: size, weight: .bold)).tracking(-0.5)
            .foregroundStyle(LinearGradient(colors: [Color(hex: 0xe4f99a), Color(hex: 0x8bd5ab)], startPoint: .top, endPoint: .bottom))
            .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
    }
}

/// Thẻ rung sang hai bên rồi đứng lại (như .den-card.is-shake).
struct CardShake: GeometryEffect {
    var phase: CGFloat
    var animatableData: CGFloat {
        get { phase }
        set { phase = newValue }
    }
    func effectValue(size: CGSize) -> ProjectionTransform {
        let f = phase - phase.rounded(.down)
        return ProjectionTransform(CGAffineTransform(translationX: 7 * sin(f * .pi * 4) * (1 - f), y: 0))
    }
}

/// Nền trang đăng nhập như web (.den-page): đêm xanh lá, sao lấp lánh, vạch dọc mờ nhấp nháy, và hai tia chớp xanh chanh
/// thay phiên giáng trọn từ trên xuống, chập chờn rồi tắt dần, chạy liên tục (LoginBolts). Giảm chuyển động: nền tĩnh, không chớp.
struct LoginBackdrop: View {
    @Environment(\.accessibilityReduceMotion) private var still
    @State private var born = Date.now

    private static let boltMain = SVGPath.path("M38 0L30 46L41 58L22 112L34 122L14 186L27 196L8 300")
    private static let boltBranch = SVGPath.path("M30 46L12 70M22 112L44 150M14 186L2 214")
    fileprivate static let stars: [(CGFloat, CGFloat, CGFloat, UInt32)] = [
        (0.12, 0.18, 0.6, 0xcde3d4), (0.68, 0.09, 0.6, 0xcde3d4), (0.82, 0.46, 0.6, 0xa7c6b3),
        (0.27, 0.74, 0.6, 0xa7c6b3), (0.46, 0.32, 0.8, 0xe8f5ec), (0.91, 0.83, 0.6, 0xcde3d4),
    ]

    var body: some View {
        // Chỉ tia chớp vẽ lại mỗi khung hình; nền, sao, vạch dọc vẽ một lần rồi đổi độ mờ.
        TimelineView(.animation(minimumInterval: FrameCap.interval, paused: still)) { tl in
            let t = still ? -1 : tl.date.timeIntervalSince(born)
            ZStack {
                BackdropSky()
                BackdropStars().opacity(Self.twinkle(t))
                BackdropLines().opacity(Self.pulse(t))
                Canvas { ctx, size in
                    guard t >= 0 else { return }
                    // Hai tia chớp: trái (14%, cao 88%) và phải (lật ngang, cách mép 10%, cao 80%); mỗi tia 4 giây, lệch nhau 2 giây.
                    Self.bolt(ctx, t: t, left: size.width * 0.14, height: size.height * 0.88, mirror: false, delay: 0.6)
                    let hb = size.height * 0.8
                    Self.bolt(ctx, t: t, left: size.width * 0.9 - hb * 0.2, height: hb, mirror: true, delay: 2.6)
                }
            }
        }
        .background(Color(hex: 0x071a14))
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// Sao sáng tối chậm (6 giây, qua lại). t < 0: tĩnh (giảm chuyển động).
    private static func twinkle(_ t: Double) -> Double {
        guard t >= 0 else { return 0.5 }
        let x = (t / 6).truncatingRemainder(dividingBy: 2)
        return 0.35 + 0.3 * Motion.cssEaseInOut(x <= 1 ? x : 2 - x)
    }
    /// Vạch dọc nhấp nháy theo nhịp tia chớp.
    private static func pulse(_ t: Double) -> Double {
        guard t >= 0, let u = Motion.loop(t, period: 2, delay: 0.6) else { return 0.5 }
        return Motion.keyframes(u, [(0, 0.5), (0.12, 0.85), (0.4, 0.55), (1, 0.5)], ease: Motion.cssEaseOut)
    }

    /// Nền đêm xanh lá + hai quầng sáng.
    private struct BackdropSky: View {
        var body: some View {
            Canvas { ctx, size in
                ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .linearGradient(Gradient(stops: [
                    .init(color: Color(hex: 0x123f31), location: 0), .init(color: Color(hex: 0x0b2a20), location: 0.55), .init(color: Color(hex: 0x071a14), location: 1),
                ]), startPoint: .zero, endPoint: CGPoint(x: 0, y: size.height)))
                LoginBackdrop.glow(ctx, at: CGPoint(x: size.width * 0.9, y: size.height * 1.1), rx: 900, ry: 600, color: Color(hex: 0x134535), stop: 0.6)
                LoginBackdrop.glow(ctx, at: CGPoint(x: size.width * 0.18, y: -size.height * 0.08), rx: 1100, ry: 620, color: Color(hex: 0x1f6148), stop: 0.62)
            }
        }
    }
    /// Sao nhỏ lặp theo ô 420×380.
    private struct BackdropStars: View {
        var body: some View {
            Canvas { ctx, size in
                var ty: CGFloat = 0
                while ty < size.height {
                    var tx: CGFloat = 0
                    while tx < size.width {
                        for st in LoginBackdrop.stars {
                            let p = CGPoint(x: tx + 420 * st.0, y: ty + 380 * st.1)
                            ctx.fill(Path(ellipseIn: CGRect(x: p.x - st.2, y: p.y - st.2, width: 2 * st.2, height: 2 * st.2)), with: .color(Color(hex: st.3)))
                        }
                        tx += 420
                    }
                    ty += 380
                }
            }
        }
    }
    /// Vạch dọc rất mờ mỗi 260 điểm.
    private struct BackdropLines: View {
        var body: some View {
            Canvas { ctx, size in
                let mint = Color(red: 167 / 255, green: 198 / 255, blue: 179 / 255).opacity(0.035)
                let fadeY = GraphicsContext.Shading.linearGradient(Gradient(stops: [
                    .init(color: mint.opacity(0), location: 0), .init(color: mint, location: 0.3), .init(color: mint, location: 0.7), .init(color: mint.opacity(0), location: 1),
                ]), startPoint: .zero, endPoint: CGPoint(x: 0, y: size.height))
                var vx: CGFloat = 140
                var bars = Path()
                while vx < size.width { bars.addRect(CGRect(x: vx, y: 0, width: 1, height: size.height)); vx += 260 }
                ctx.fill(bars, with: fadeY)
            }
        }
    }

    fileprivate static func glow(_ ctx: GraphicsContext, at p: CGPoint, rx: CGFloat, ry: CGFloat, color: Color, stop: CGFloat) {
        var c = ctx
        c.translateBy(x: p.x, y: p.y)
        c.scaleBy(x: 1, y: ry / rx)
        let r = rx * stop
        c.fill(Path(ellipseIn: CGRect(x: -r, y: -r, width: 2 * r, height: 2 * r)),
               with: .radialGradient(Gradient(colors: [color, color.opacity(0)]), center: .zero, startRadius: 0, endRadius: r))
    }

    /// Một tia: nét chính và các nhánh giáng từ trên xuống (18% đầu chu kỳ), chập chờn, rồi tắt dần tới 75%.
    private static func bolt(_ ctx: GraphicsContext, t: Double, left: CGFloat, height: CGFloat, mirror: Bool, delay: Double) {
        let sc = height / 300
        let place = mirror ? CGAffineTransform(a: -sc, b: 0, c: 0, d: sc, tx: left + 60 * sc, ty: 0) : CGAffineTransform(a: sc, b: 0, c: 0, d: sc, tx: left, ty: 0)
        let ease: (Double) -> Double = { Motion.bezier(0.3, 0.6, 0.4, 1, $0) }
        let parts: [(Path, CGFloat, Double)] = [(boltMain, 1.6, 0), (boltBranch, 0.8, 0.15)]
        for (path, width, lag) in parts {
            guard let u = Motion.loop(t, period: 4, delay: delay + lag) else { continue }
            let drawn = Motion.keyframes(u, [(0, 0), (0.18, 1), (1, 1)], ease: ease)
            let alpha = Motion.keyframes(u, [(0, 1), (0.18, 1), (0.24, 0.35), (0.3, 1), (0.36, 0.55), (0.44, 1), (0.75, 0), (1, 0)], ease: ease)
            guard drawn > 0.001, alpha > 0.001 else { continue }
            var c = ctx
            c.opacity *= alpha
            c.addFilter(.shadow(color: Color(red: 147 / 255, green: 194 / 255, blue: 76 / 255).opacity(0.5), radius: 20))
            c.addFilter(.shadow(color: Color(red: 212 / 255, green: 245 / 255, blue: 143 / 255).opacity(0.85), radius: 6))
            c.stroke(path.trimmedPath(from: 0, to: drawn).applying(place), with: .color(Color(hex: 0xf2ffd6)),
                     style: StrokeStyle(lineWidth: width * sc, lineCap: .round, lineJoin: .round))
        }
    }
}
