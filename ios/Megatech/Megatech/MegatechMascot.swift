import SwiftUI

// Linh vật MEGATECH trên màn đăng nhập / chào mừng trở lại / app đang khoá (như app/megatech-mascot.tsx của web, 09/10/2026):
// chính logo công ty (bò, lợn, gà, cây thông trên cánh đồng) nhưng từng con cử động. Bò thở, gật/quay đầu, chớp mắt; gà mổ thóc;
// lợn ngoáy đuôi; cây đung đưa; gió sáng lướt trên đồng. Gõ email thì cả nhà nhìn theo, gõ mật khẩu thì nhắm mắt (gà rúc đầu,
// bò cúi đầu), hiện mật khẩu thì bò hé một mắt, vào được thì vui (gà nhảy, lợn nảy, má hồng, lấp lánh), sai thì cúi đầu lắc.
// Vẽ bằng Canvas theo đúng thông số khối .mgm trong app/logo-intro.css (gốc xoay theo khung logo 670×640).

enum MascotMood: Equatable { case idle, watch, cover, peek, happy, sad }

struct MegatechMascot: View {
    var mood: MascotMood
    /// Hướng nhìn, mỗi trục -1…1.
    var gaze: CGPoint
    @Environment(\.accessibilityReduceMotion) private var still
    @State private var motion = MascotMotion()

    init(mood: MascotMood, gaze: CGPoint = .zero) { self.mood = mood; self.gaze = gaze }

    var body: some View {
        TimelineView(.animation(minimumInterval: nil, paused: still)) { tl in
            Canvas { ctx, size in motion.draw(&ctx, size: size, now: tl.date, mood: mood, gaze: gaze, still: still) }
        }
        .aspectRatio(MascotMotion.box.width / MascotMotion.box.height, contentMode: .fit)
        .accessibilityHidden(true)
    }
}

/// Trạng thái chuyển động của linh vật giữa các khung hình (đổi tâm trạng, ánh mắt đuổi theo).
final class MascotMotion {
    /// viewBox của linh vật trên web: -20 -30 710 690.
    static let box = CGRect(x: -20, y: -30, width: 710, height: 690)
    private static let ink = Color(hex: 0x10261a)
    private static let wind = Gradient(stops: [
        .init(color: Color(hex: 0xefffc4).opacity(0), location: 0), .init(color: Color(hex: 0xefffc4).opacity(0.42), location: 0.5),
        .init(color: Color(hex: 0xefffc4).opacity(0), location: 1),
    ])
    private static let sparks: [CGPoint] = [CGPoint(x: 120, y: 40), CGPoint(x: 330, y: 150), CGPoint(x: 560, y: 10), CGPoint(x: 640, y: 230)]

    private let born = Date.now
    private var mood: MascotMood = .idle, prev: MascotMood = .idle
    private var moodAt = Date.now
    private var fromNod = 0.0, fromPeck = 0.0
    private var lookX = 0.0, lookY = 0.0
    private var lastFrame: Date?
    private var still = false

    private enum Who { case cow, pig, chick }

    func draw(_ ctx: inout GraphicsContext, size: CGSize, now: Date, mood new: MascotMood, gaze: CGPoint, still: Bool) {
        self.still = still
        if new != mood { fromNod = nod(now); fromPeck = peck(now); prev = mood; mood = new; moodAt = now }
        let t = still ? 0 : now.timeIntervalSince(born)
        let m = still ? 100 : now.timeIntervalSince(moodAt)
        // Ánh mắt đuổi theo điểm nhìn (như transition .18s trên web).
        let gx = max(-1, min(1, Double(gaze.x))), gy = max(-1, min(1, Double(gaze.y)))
        let dt = lastFrame.map { max(0, min(0.1, now.timeIntervalSince($0))) } ?? 1
        lastFrame = now
        let k = still ? 1 : 1 - exp(-dt / 0.09)
        lookX += (gx - lookX) * k
        lookY += (gy - lookY) * k

        let s = min(size.width / Self.box.width, size.height / Self.box.height)
        ctx.translateBy(x: (size.width - Self.box.width * s) / 2, y: (size.height - Self.box.height * s) / 2)
        ctx.scaleBy(x: s, y: s)
        ctx.translateBy(x: -Self.box.minX, y: -Self.box.minY)
        let eo = FillStyle(eoFill: true)

        // Đồng ruộng + gió sáng lướt qua.
        ctx.fill(LogoArt.field, with: LogoArt.shading, style: eo)
        if !still, let u = Motion.loop(t, period: 4.5) {
            var w = ctx
            w.clip(to: LogoArt.field, style: eo)
            w.translateBy(x: -80 + 1380 * u, y: 0)
            w.concatenate(CGAffineTransform(a: 1, b: 0, c: tan(-28 * Double.pi / 180), d: 1, tx: 0, ty: 0))
            w.fill(Path(CGRect(x: -260, y: 280, width: 200, height: 380)),
                   with: .linearGradient(Self.wind, startPoint: CGPoint(x: -260, y: 0), endPoint: CGPoint(x: -60, y: 0)))
        }

        // Cây thông đung đưa quanh gốc.
        let swayFrames: [(Double, Double)] = [(0, -2.5), (0.5, 2.5), (1, -2.5)]
        let sway1 = still ? 0 : Motion.keyframes(Motion.loop(t, period: 5) ?? 0, swayFrames, ease: Motion.cssEaseInOut)
        var sway2 = 0.0
        if !still, let u = Motion.loop(t, period: 6.2, delay: 0.7) { sway2 = Motion.keyframes(1 - u, swayFrames, ease: Motion.cssEaseInOut) }
        Motion.around(ctx, 568, 326, rotate: sway1).fill(LogoArt.tree1, with: LogoArt.shading)
        Motion.around(ctx, 617, 326, rotate: sway2).fill(LogoArt.tree2, with: LogoArt.shading)

        // Buồn: bò và gà lắc sang hai bên một lần.
        var shake = 0.0
        if mood == .sad, let u = Motion.pass(m, dur: 0.5) {
            shake = Motion.keyframes(u, [(0, 0), (0.2, -8), (0.4, 8), (0.6, -8), (0.8, 8), (1, 0)], ease: Motion.cssEaseInOut)
        }

        // Bò: thân thở, đầu gật / quay theo.
        let cow = Motion.around(ctx, 0, 0, dx: shake)
        let breathe = still ? 1 : Motion.keyframes(Motion.loop(t, period: 4.2) ?? 0, [(0, 1), (0.5, 1.012), (1, 1)], ease: Motion.cssEaseInOut)
        Motion.around(cow, 300, 335, scaleY: breathe).fill(LogoArt.cowBody, with: LogoArt.shading, style: eo)
        var head = 5 * lookX + nod(now)
        if mood == .idle, !still, let u = Motion.loop(m, period: 7) {
            head += Motion.keyframes(u, [(0, 0), (0.4, 0), (0.48, 5), (0.56, -1), (0.62, 0), (1, 0)], ease: Motion.cssEaseInOut)
        }
        if mood == .happy, let u = Motion.pass(m, dur: 0.6, count: 2) { head += Motion.keyframes(u, [(0, 0), (0.5, 9), (1, 0)], ease: Motion.cssEaseInOut) }
        let cowHead = Motion.around(cow, 548, 128, rotate: head)
        cowHead.fill(LogoArt.cowHead, with: LogoArt.shading, style: eo)
        eye(cowHead, CGPoint(x: 602, y: 92), r: 9, white: true, who: .cow, t: t, m: m)

        // Lợn: phần trắng của logo; thở (vui thì nảy), đuôi ngoáy, má hồng khi vui.
        var pig = ctx
        if mood == .happy {
            if let u = Motion.pass(m, dur: 0.5, delay: 0.12, count: 3) {
                pig = Motion.around(ctx, 320, 345, dy: -14 * Motion.keyframes(u, [(0, 0), (0.5, 1), (1, 0)], ease: Motion.cssEaseInOut))
            }
        } else if !still, let u = Motion.loop(t, period: 3.6, delay: 0.8) {
            pig = Motion.around(ctx, 320, 345, scaleY: Motion.keyframes(u, [(0, 1), (0.5, 1.012), (1, 1)], ease: Motion.cssEaseInOut))
        }
        pig.fill(LogoArt.pig, with: .color(LogoArt.pigWhite), style: eo)
        pig.stroke(LogoArt.pig, with: .color(LogoArt.pigWhite), style: StrokeStyle(lineWidth: 5, lineJoin: .round))
        let tailFrames: [(Double, Double)] = [(0, 0), (0.7, 0), (0.76, -18), (0.82, 14), (0.88, -10), (0.94, 6), (1, 0)]
        let tail = still ? 0 : Motion.keyframes(Motion.loop(t, period: mood == .happy ? 0.5 : 3.2) ?? 0, tailFrames, ease: Motion.cssEaseInOut)
        Motion.around(pig, 152, 202, rotate: tail).fill(LogoArt.pigTail, with: .color(LogoArt.pigWhite))
        eye(pig, CGPoint(x: 474, y: 236), r: 6, white: false, who: .pig, t: t, m: m)
        let blush = fade(prev == .happy ? 1 : 0, mood == .happy ? 1 : 0, m, 0.3)
        if blush > 0.01 {
            var b = pig
            b.opacity *= blush
            b.fill(Path(ellipseIn: CGRect(x: 458, y: 255, width: 24, height: 14)), with: .color(Color(hex: 0xf6a5a0)))
        }

        // Gà: thân (vui thì nhảy, buồn thì lắc); đầu mổ thóc, quay theo, rúc đầu khi nhắm.
        var chick = Motion.around(ctx, 0, 0, dx: shake)
        if mood == .happy, let u = Motion.pass(m, dur: 0.5, count: 3) {
            let v = Motion.keyframes(u, [(0, 0), (0.5, 1), (1, 0)], ease: Motion.cssEaseInOut)
            chick = Motion.around(ctx, 305, 372, rotate: -4 * v, dy: -34 * v)
        }
        chick.fill(LogoArt.chickBody, with: LogoArt.shading, style: eo)
        var beak = 7 * lookX + peck(now)
        if mood == .idle, !still, let u = Motion.loop(m, period: 5.5, delay: 1.4) {
            beak += Motion.keyframes(u, [(0, 0), (0.62, 0), (0.68, 38), (0.71, 26), (0.74, 40), (0.8, 0), (1, 0)], ease: Motion.cssEaseInOut)
        }
        let chickHead = Motion.around(chick, 336, 252, rotate: beak)
        chickHead.fill(LogoArt.chickHead, with: LogoArt.shading, style: eo)
        eye(chickHead, CGPoint(x: 352, y: 222), r: 5.2, white: true, who: .chick, t: t, m: m)

        // Lấp lánh khi vào được.
        if mood == .happy {
            for (i, p) in Self.sparks.enumerated() {
                guard let u = Motion.pass(m, dur: 0.9, delay: Double(i) * 0.12, count: 2) else { continue }
                let op = Motion.keyframes(u, [(0, 0), (0.4, 1), (1, 0)], ease: Motion.cssEaseOut)
                let sc = Motion.keyframes(u, [(0, 0.2), (0.4, 1.1), (1, 0.4)], ease: Motion.cssEaseOut)
                let rot = Motion.keyframes(u, [(0, 0), (0.4, 45), (1, 90)], ease: Motion.cssEaseOut)
                var c = Motion.around(ctx, p.x, p.y, rotate: rot, scaleX: sc, scaleY: sc)
                c.opacity *= op
                c.fill(Self.star(p), with: .color(Color(hex: 0xefffc4)))
            }
        }
    }

    /// Góc cúi đầu của bò theo tâm trạng (chuyển .45s, hơi nảy như CSS cubic-bezier(.3,1.4,.5,1)).
    private func nod(_ now: Date) -> Double {
        let target: Double = mood == .cover || mood == .peek ? 7 : mood == .sad ? 10 : 0
        return ease(from: fromNod, to: target, now, 0.45)
    }
    /// Góc rúc đầu của gà theo tâm trạng (chuyển .35s).
    private func peck(_ now: Date) -> Double {
        let target: Double = mood == .cover || mood == .peek ? 22 : mood == .sad ? 20 : 0
        return ease(from: fromPeck, to: target, now, 0.35)
    }
    private func ease(from a: Double, to b: Double, _ now: Date, _ dur: Double) -> Double {
        if still { return b }
        let x = Motion.clamp(now.timeIntervalSince(moodAt) / dur)
        return a + (b - a) * Motion.bezier(0.3, 1.4, 0.5, 1, x)
    }
    private func fade(_ a: Double, _ b: Double, _ m: Double, _ dur: Double) -> Double {
        still ? b : a + (b - a) * Motion.clamp(m / dur)
    }

    /// Mắt: lòng trắng + con ngươi nhìn theo, chớp mắt; nhắm thành vệt cong, vui thành mắt cười.
    private func eye(_ c: GraphicsContext, _ p: CGPoint, r: CGFloat, white: Bool, who: Who, t: Double, m: Double) {
        func state(_ md: MascotMood) -> (open: Double, shut: Double, joy: Double) {
            switch md {
            case .cover: return (0, 1, 0)
            case .peek: return who == .cow ? (1, 0, 0) : (0, 1, 0)
            case .happy: return (0, 0, 1)
            default: return (1, 0, 0)
            }
        }
        let a = state(prev), b = state(mood)
        let open = fade(a.open, b.open, m, 0.15), shut = fade(a.shut, b.shut, m, 0.15), joy = fade(a.joy, b.joy, m, 0.15)
        // Hé mắt khi hiện mật khẩu: mắt bò dẹt lại, không chớp.
        let peeking = who == .cow && mood == .peek
        let e = peeking ? Motion.around(c, p.x, p.y, scaleY: 0.55) : c
        var blink = 1.0
        if !peeking, !still {
            let period = who == .cow ? 5.5 : who == .chick ? 4.3 : 6.1
            let delay = who == .cow ? 0 : who == .chick ? 1.1 : 2.3
            if let u = Motion.loop(t, period: period, delay: delay) {
                blink = Motion.keyframes(u, [(0, 1), (0.94, 1), (0.97, 0.1), (1, 1)], ease: Motion.cssEase)
            }
        }
        if open > 0.01 {
            var o = Motion.around(e, p.x, p.y, scaleY: blink)
            o.opacity *= open
            if white { o.fill(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r)), with: .color(LogoArt.pigWhite)) }
            let q = CGPoint(x: p.x + CGFloat(4.5 * lookX), y: p.y + CGFloat(3.5 * lookY))
            let pr = r * (white ? 0.58 : 0.8)
            o.fill(Path(ellipseIn: CGRect(x: q.x - pr, y: q.y - pr, width: 2 * pr, height: 2 * pr)), with: .color(Self.ink))
            let hx = q.x - r * 0.22, hy = q.y - r * 0.26, hr = r * 0.2
            o.fill(Path(ellipseIn: CGRect(x: hx - hr, y: hy - hr, width: 2 * hr, height: 2 * hr)), with: .color(.white))
        }
        let line = StrokeStyle(lineWidth: 3.2, lineCap: .round)
        if shut > 0.01 {
            var s = e
            s.opacity *= shut
            var path = Path()
            path.move(to: CGPoint(x: p.x - r, y: p.y))
            path.addQuadCurve(to: CGPoint(x: p.x + r, y: p.y), control: CGPoint(x: p.x, y: p.y + r * 0.9))
            s.stroke(path, with: .color(Self.ink), style: line)
        }
        if joy > 0.01 {
            var j = e
            j.opacity *= joy
            var path = Path()
            path.move(to: CGPoint(x: p.x - r, y: p.y + r * 0.3))
            path.addQuadCurve(to: CGPoint(x: p.x + r, y: p.y + r * 0.3), control: CGPoint(x: p.x, y: p.y - r))
            j.stroke(path, with: .color(Self.ink), style: line)
        }
    }

    /// Ngôi sao bốn cánh quanh điểm p.
    private static func star(_ p: CGPoint) -> Path {
        var s = Path()
        let pts: [(CGFloat, CGFloat)] = [(0, -16), (4, -4), (16, 0), (4, 4), (0, 16), (-4, 4), (-16, 0), (-4, -4)]
        for (i, d) in pts.enumerated() {
            let q = CGPoint(x: p.x + d.0, y: p.y + d.1)
            if i == 0 { s.move(to: q) } else { s.addLine(to: q) }
        }
        s.closeSubpath()
        return s
    }
}
