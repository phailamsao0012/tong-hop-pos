import SwiftUI

// Màn mở đầu logo MEGATECH khi mở app (anh Vũ 09/10/2026: "lúc đăng nhập phải có hiệu ứng như tôi đã làm"), làm lại native
// theo đúng màn mở đầu trên trang đăng nhập web (app/logo-intro.tsx, cùng dòng thời gian ~6,35 giây):
// nền bản vẽ kỹ thuật, ngòi bút sáng lần lượt vẽ viền cánh đồng, bò, lợn, gà, hai cây thông kèm điểm neo; màu xanh dâng lên
// như nước, lợn trắng hiện, vệt sáng lướt qua, logo nảy nhẹ; logo thu nhỏ đi lên, chữ MEGATECH hiện từ mờ sang rõ cùng dòng mô tả;
// cuối cùng logo phóng to xuyên màn hình để lộ màn đăng nhập (linh vật cùng thẻ trồi lên).
// Chỉ chạy khi mở app từ đầu (không chạy lại khi quay lại từ nền hay khi đăng xuất). Chạm để bỏ qua; bật Giảm chuyển động thì bỏ qua.

/// Trạng thái màn mở đầu của lần mở app này: đang chạy → lộ màn đăng nhập → xong.
@MainActor @Observable final class IntroState {
    enum Stage { case play, reveal, done }
    var stage: Stage
    init() {
        #if DEBUG
        if ProcessInfo.processInfo.environment["MEGATECH_NO_INTRO"] == "1" { stage = .done; return }
        #endif
        stage = UIAccessibility.isReduceMotionEnabled ? .done : .play
    }
}

struct LogoIntroView: View {
    @Environment(IntroState.self) private var intro
    @State private var start = Date.now
    @State private var skipAt: Date?

    /// Dòng thời gian (giây), giống hệt T trong app/logo-intro.tsx.
    private enum T {
        static let grid = (0.0, 0.35), liquid = (1.95, 2.7), pig = (2.25, 2.75), guidesOut = (2.6, 3.0), shine = (2.95, 3.5), pop = (2.7, 3.15)
        static let lift = (3.45, 4.05), word = (3.7, 4.35), tag = (4.15, 4.6), wordOut = (5.35, 5.65), zoom = (5.5, 6.15), fade = (5.85, 6.3)
        static let reveal = 5.9, end = 6.35
    }
    private static let word = Array("MEGATECH")

    var body: some View {
        TimelineView(.animation) { tl in
            let t = time(tl.date)
            GeometryReader { g in
                let L = Layout(size: g.size)
                ZStack(alignment: .topLeading) {
                    Canvas { ctx, size in Self.drawScene(&ctx, size: size, t: t, layout: L) }
                    lockup(t, L).frame(width: g.size.width).offset(y: L.lockupTop)
                    Text("Chạm để bỏ qua").font(.system(size: 11.5)).foregroundStyle(Brand.mint.opacity(0.45))
                        .opacity(1 - Motion.easeInOut(Motion.span(t, T.fade)))
                        .frame(width: g.size.width).offset(y: g.size.height - max(22, g.safeAreaInsets.bottom) - 16)
                }
            }
        }
        .ignoresSafeArea()
        .contentShape(Rectangle())
        .onTapGesture { if skipAt == nil { skipAt = .now } }
        .allowsHitTesting(intro.stage == .play)
        .task { await run() }
        .accessibilityElement()
        .accessibilityLabel("MEGATECH")
        .accessibilityHint("Chạm để bỏ qua")
        .accessibilityAddTraits(.isButton)
    }

    /// Thời gian trên dòng thời gian; bỏ qua thì nhảy tới đoạn phóng to cuối.
    private func time(_ now: Date) -> Double {
        var t = now.timeIntervalSince(start)
        if let s = skipAt { t = max(t, T.wordOut.0 + now.timeIntervalSince(s)) }
        return t
    }

    @MainActor private func run() async {
        while !Task.isCancelled && intro.stage != .done {
            let t = time(.now)
            if t >= T.reveal, intro.stage == .play { intro.stage = .reveal }
            if t >= T.end { intro.stage = .done; return }
            try? await Task.sleep(for: .milliseconds(30))
        }
    }

    /// Kích thước như CSS của web: logo clamp(170px, min(56vw, 38vh), 340px), chữ clamp(30px, min(8.5vw, 5.6vh), 54px),
    /// cả cụm (logo + chữ kéo lên 38px) nằm giữa màn hình.
    private struct Layout {
        let side: CGFloat, wordSize: CGFloat, tagSize: CGFloat, markCenter: CGPoint, lockupTop: CGFloat
        init(size: CGSize) {
            side = min(340, max(170, min(size.width * 0.56, size.height * 0.38)))
            wordSize = min(54, max(30, min(size.width * 0.085, size.height * 0.056)))
            tagSize = min(15, max(13, size.height * 0.017))
            let stack = side - 38 + wordSize + 14 + 12 + tagSize * 1.5
            let top = (size.height - stack) / 2
            markCenter = CGPoint(x: size.width / 2, y: top + side / 2)
            lockupTop = top + side - 38
        }
    }

    // MARK: Chữ MEGATECH, vạch nhỏ, dòng mô tả

    private func lockup(_ t: Double, _ L: Layout) -> some View {
        let lift = Motion.easeInOut(Motion.span(t, T.lift))
        let wo = Motion.easeOut(Motion.span(t, T.wordOut))
        let tg = Motion.easeOut(Motion.span(t, T.tag))
        let rule = Motion.easeOut(Motion.span(t, T.word.1 - 0.25, T.word.1 + 0.2))
        return VStack(spacing: 0) {
            HStack(spacing: L.wordSize * 0.04) {
                ForEach(0..<Self.word.count, id: \.self) { i in
                    let a = T.word.0 + Double(i) * 0.05
                    let k = Motion.easeOut(Motion.span(t, a, a + 0.4))
                    Text(String(Self.word[i]))
                        .font(.system(size: L.wordSize, weight: .heavy, design: .rounded))
                        .foregroundStyle(LinearGradient(colors: i < 4 ? [Color(hex: 0xd4f58f), Color(hex: 0x8cc957)] : [Color(hex: 0xb3e06e), Color(hex: 0x6fae47)],
                                                        startPoint: .top, endPoint: .bottom))
                        .opacity(k * (1 - wo))
                        .blur(radius: (1 - k) * 10 + wo * 8)
                        .offset(y: (1 - k) * 10)
                }
            }
            .frame(height: L.wordSize)
            Capsule()
                .fill(LinearGradient(colors: [.clear, Color(hex: 0xb3e06e), Color(hex: 0x5f9642), .clear], startPoint: .leading, endPoint: .trailing))
                .frame(width: 44, height: 2)
                .scaleEffect(x: rule, y: 1)
                .opacity(1 - wo)
                .padding(.top, 12)
            Text("Nông nghiệp Megatech Việt Nam")
                .font(.system(size: L.tagSize)).kerning(L.tagSize * 0.02).foregroundStyle(Brand.mint)
                .opacity(tg * (1 - wo))
                .offset(y: (1 - tg) * 6)
                .padding(.top, 12)
        }
        .offset(y: (1 - lift) * 40)
    }

    // MARK: Nền bản vẽ + logo

    /// Các nét vẽ lần lượt: nét, đoạn thời gian vẽ, màu nét, 22 điểm neo rải đều trên nét.
    private struct Stroke { let trace: TracePath; let win: (Double, Double); let color: Color; let anchors: [(CGFloat, CGPoint)] }
    private static let strokes: [Stroke] = {
        let defs: [(String, Double, Double, UInt32)] = [
            (LogoArt.fieldD, 0.25, 1.25, 0xd9f0b0),
            (LogoArt.cowBodyD + LogoArt.cowHeadD, 0.55, 1.65, 0xe8f5ec),
            (LogoArt.pigD, 0.95, 1.85, 0xffffff),
            (LogoArt.chickBodyD + LogoArt.chickHeadD, 1.25, 2.0, 0xc9ec7a),
            (LogoArt.tree1D + LogoArt.tree2D, 1.55, 2.05, 0xc9ec7a),
        ]
        return defs.map { def -> Stroke in
            let trace = TracePath(def.0)
            let anchors: [(CGFloat, CGPoint)] = (0..<22).map { i -> (CGFloat, CGPoint) in
                let at = (CGFloat(i) + 0.5) / 22
                return (at, trace.point(at: at))
            }
            return Stroke(trace: trace, win: (def.1, def.2), color: Color(hex: def.3), anchors: anchors)
        }
    }()
    /// Mặt nước xanh dâng lên (sóng chạy ngang), như path .li-wave của web.
    private static let wave: Path = {
        var p = Path()
        p.move(to: CGPoint(x: 0, y: 60))
        for i in 0..<8 {
            let x = CGFloat(i) * 175
            p.addQuadCurve(to: CGPoint(x: x + 175, y: 60), control: CGPoint(x: x + 87.5, y: i % 2 == 0 ? 0 : 120))
        }
        p.addLine(to: CGPoint(x: 1400, y: 1000)); p.addLine(to: CGPoint(x: 0, y: 1000)); p.closeSubpath()
        return p
    }()
    private static let guideLines: Path = {
        var p = Path()
        for x in [16.0, 120, 335, 548, 650] { p.move(to: CGPoint(x: x, y: -70)); p.addLine(to: CGPoint(x: x, y: 710)) }
        for y in [20.0, 160, 330, 630] { p.move(to: CGPoint(x: -60, y: y)); p.addLine(to: CGPoint(x: 730, y: y)) }
        return p
    }()
    private static let guideDashed: Path = {
        var p = Path()
        p.addEllipse(in: CGRect(x: 35, y: 30, width: 600, height: 600))
        p.addEllipse(in: CGRect(x: 135, y: 130, width: 400, height: 400))
        p.addEllipse(in: CGRect(x: 562, y: 52, width: 80, height: 80))
        p.move(to: CGPoint(x: 0, y: 300)); p.addQuadCurve(to: CGPoint(x: 670, y: 320), control: CGPoint(x: 300, y: 360))
        return p
    }()

    private static func drawScene(_ ctx: inout GraphicsContext, size: CGSize, t: Double, layout L: Layout) {
        let fade = 1 - Motion.easeInOut(Motion.span(t, T.fade))
        // Nền tối có quầng xanh ở giữa; mờ dần ở cuối để lộ màn đăng nhập phía sau.
        ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(hex: 0x06100c).opacity(fade)))
        do {
            var c = ctx
            c.translateBy(x: size.width / 2, y: size.height * 0.42)
            c.scaleBy(x: 1, y: 520.0 / 700.0)
            let green = Color(red: 25 / 255, green: 70 / 255, blue: 53 / 255)
            c.fill(Path(ellipseIn: CGRect(x: -700, y: -700, width: 1400, height: 1400)),
                   with: .radialGradient(Gradient(colors: [green.opacity(0.55 * fade), green.opacity(0)]), center: .zero, startRadius: 0, endRadius: 490))
        }
        drawGrid(ctx, size: size, alpha: Motion.easeOut(Motion.span(t, T.grid)) * (1 - Motion.span(t, T.guidesOut) * 0.75) * (1 - Motion.span(t, T.fade)))

        // Logo: thu nhỏ + đi lên khi chữ hiện, cuối cùng phóng to xuyên màn hình và mờ đi.
        let lift = Motion.easeInOut(Motion.span(t, T.lift)), zoom = Motion.easeIn(Motion.span(t, T.zoom))
        let markAlpha = 1 - Motion.span(t, T.zoom.0 + 0.3, T.zoom.1)
        guard markAlpha > 0.001 else { return }
        var m = ctx
        m.opacity *= markAlpha
        m.translateBy(x: L.markCenter.x, y: L.markCenter.y - 30 * lift * (1 - zoom))
        let ms = (1 - 0.36 * lift) * (1 + 11 * zoom)
        m.scaleBy(x: ms, y: ms)

        // Quầng sáng sau logo khi đã tô màu.
        let glow = 0.8 * Motion.easeOut(Motion.span(t, T.liquid.1 - 0.3, T.shine.1)) * (1 - Motion.span(t, T.zoom))
        if glow > 0.001 {
            var g = m
            g.opacity *= glow
            let inner = L.side * 0.72
            let c0 = CGPoint(x: -L.side / 2 + L.side * 0.14 + inner * 0.45, y: -L.side / 2 + L.side * 0.14 + inner * 0.45)
            let r = inner * 0.6 + 30
            g.fill(Path(ellipseIn: CGRect(x: c0.x - r, y: c0.y - r, width: 2 * r, height: 2 * r)), with: .radialGradient(Gradient(stops: [
                .init(color: Color(red: 147 / 255, green: 194 / 255, blue: 76 / 255).opacity(0.5), location: 0),
                .init(color: Color(red: 31 / 255, green: 106 / 255, blue: 81 / 255).opacity(0.4), location: 0.5),
                .init(color: Color(red: 31 / 255, green: 106 / 255, blue: 81 / 255).opacity(0), location: 1),
            ]), center: c0, startRadius: 0, endRadius: r))
        }

        // Toạ độ logo: viewBox -60 -70 790 780 vừa khung vuông của logo.
        let s = L.side / 790
        m.translateBy(x: -L.side / 2, y: -L.side / 2 + (L.side - 780 * s) / 2)
        m.scaleBy(x: s, y: s)
        m.translateBy(x: 60, y: 70)

        // Đường dựng hình mờ như bản vẽ: trục canh, vòng tròn, đường mặt đất.
        let guide = 0.9 * Motion.easeOut(Motion.span(t, T.grid)) * (1 - Motion.easeOut(Motion.span(t, T.guidesOut)))
        if guide > 0.001 {
            var g = m
            g.opacity *= guide
            let col = Color(red: 205 / 255, green: 227 / 255, blue: 212 / 255).opacity(0.14)
            g.stroke(guideLines, with: .color(col), lineWidth: 2)
            g.stroke(guideDashed, with: .color(col), style: StrokeStyle(lineWidth: 2, dash: [9, 12]))
        }

        // Cả logo nảy nhẹ khi vừa tô màu xong.
        let pop = 1 + 0.05 * sin(Double.pi * Motion.span(t, T.pop))
        let art = Motion.around(m, 335, 330, scaleX: pop, scaleY: pop)

        // Màu xanh dâng lên như nước trong các phần xanh của logo; vệt sáng lướt chéo qua.
        let lq = Motion.easeInOut(Motion.span(t, T.liquid))
        if lq > 0 {
            var liq = art
            liq.clipToLayer { mask in
                for p in LogoArt.greenParts { mask.fill(p, with: .color(.black), style: FillStyle(eoFill: true)) }
            }
            let tx = -700 + (t * 760).truncatingRemainder(dividingBy: 700)
            let ty = Double(LogoArt.height) + 60 - (Double(LogoArt.height) + 140) * lq
            liq.fill(wave.applying(CGAffineTransform(translationX: tx, y: ty)), with: LogoArt.shading)
            let sh = Motion.easeInOut(Motion.span(t, T.shine))
            if sh > 0 && sh < 1 {
                var shine = liq
                shine.blendMode = .softLight
                shine.concatenate(CGAffineTransform(a: 1, b: 0, c: tan(-22 * Double.pi / 180), d: 1, tx: 0, ty: 0))
                let x = -500 + 1400 * sh
                shine.fill(Path(CGRect(x: x, y: -80, width: 260, height: 820)), with: .linearGradient(Gradient(stops: [
                    .init(color: .white.opacity(0), location: 0), .init(color: .white.opacity(0.5), location: 0.5), .init(color: .white.opacity(0), location: 1),
                ]), startPoint: CGPoint(x: x, y: 0), endPoint: CGPoint(x: x + 260, y: 0)))
            }
        }
        // Lợn trắng hiện dần.
        let pigA = Motion.easeOut(Motion.span(t, T.pig))
        if pigA > 0 {
            var p = art
            p.opacity *= pigA
            p.fill(LogoArt.pig, with: .color(LogoArt.pigWhite), style: FillStyle(eoFill: true))
            p.fill(LogoArt.pigTail, with: .color(LogoArt.pigWhite))
        }

        // Nét viền đang vẽ + điểm neo + ngòi bút sáng (mờ đi khi đã tô màu).
        let outline = 1 - Motion.easeOut(Motion.span(t, T.guidesOut))
        guard outline > 0.001 else { return }
        var o = art
        o.opacity *= outline
        for st in strokes {
            let p = Motion.easeInOut(Motion.span(t, st.win))
            guard p > 0 else { continue }
            o.stroke(st.trace.partial(CGFloat(p)), with: .color(st.color), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
            for (at, pt) in st.anchors {
                let k = Motion.clamp((p - Double(at)) / 0.05)
                guard k > 0 else { continue }
                let sc = CGFloat(0.3 + 0.7 * Motion.backOut(k))
                let r = CGRect(x: pt.x - 4 * sc, y: pt.y - 4 * sc, width: 8 * sc, height: 8 * sc)
                var a = o
                a.opacity *= k
                a.fill(Path(r), with: .color(Color(hex: 0x06100c)))
                a.stroke(Path(r), with: .color(st.color), lineWidth: 2.5 * sc)
            }
            if p < 1 {
                let pt = st.trace.point(at: CGFloat(p))
                o.fill(Path(ellipseIn: CGRect(x: pt.x - 56, y: pt.y - 56, width: 112, height: 112)), with: .radialGradient(Gradient(stops: [
                    .init(color: st.color.opacity(0.8), location: 0), .init(color: st.color.opacity(0.45), location: 0.45), .init(color: st.color.opacity(0), location: 1),
                ]), center: pt, startRadius: 0, endRadius: 56))
                o.fill(Path(ellipseIn: CGRect(x: pt.x - 8, y: pt.y - 8, width: 16, height: 16)), with: .color(.white))
            }
        }
    }

    /// Lưới bản vẽ mờ (ô 96 và 24), đậm dần về giữa màn hình.
    private static func drawGrid(_ ctx: GraphicsContext, size: CGSize, alpha: Double) {
        guard alpha > 0.001 else { return }
        ctx.drawLayer { g in
            g.opacity = alpha
            for (step, a) in [(CGFloat(24), 0.025), (CGFloat(96), 0.055)] {
                var lines = Path()
                var x = (size.width / 2 - step / 2).truncatingRemainder(dividingBy: step)
                while x < size.width { lines.addRect(CGRect(x: x, y: 0, width: 1, height: size.height)); x += step }
                var y = (size.height / 2 - step / 2).truncatingRemainder(dividingBy: step)
                while y < size.height { lines.addRect(CGRect(x: 0, y: y, width: size.width, height: 1)); y += step }
                g.fill(lines, with: .color(Color(red: 217 / 255, green: 243 / 255, blue: 109 / 255).opacity(a)))
            }
            // Mặt nạ: rõ ở giữa (50% 45%), nhạt dần ra mép.
            var mask = g
            mask.blendMode = .destinationIn
            let rx = size.width / 2, ry = size.height * 0.45
            mask.translateBy(x: rx, y: ry)
            mask.scaleBy(x: 1, y: ry / rx)
            mask.fill(Path(CGRect(x: -size.width * 2, y: -size.height * 4, width: size.width * 4, height: size.height * 8)), with: .radialGradient(Gradient(stops: [
                .init(color: .black, location: 0), .init(color: .black.opacity(0.5), location: 0.55), .init(color: .black.opacity(0), location: 1),
            ]), center: .zero, startRadius: 0, endRadius: rx))
        }
    }
}
