import SwiftUI

// Công cụ chung cho hiệu ứng logo (màn mở đầu, linh vật, tia chớp): đọc path SVG của web, đo độ dài nét để "vẽ dần",
// các hàm easing và keyframe giống CSS để chuyển động khớp với trang đăng nhập web (app/logo-intro.tsx, app/logo-intro.css).

/// Đọc chuỗi path SVG thành Path. Hỗ trợ M, L, H, V, C, Q, T, Z (viết thường là toạ độ tương đối).
enum SVGPath {
    enum Op { case move(CGPoint), line(CGPoint), cubic(CGPoint, CGPoint, CGPoint), quad(CGPoint, CGPoint), close }

    static func path(_ d: String) -> Path {
        var p = Path()
        for op in ops(d) {
            switch op {
            case .move(let a): p.move(to: a)
            case .line(let a): p.addLine(to: a)
            case .cubic(let c1, let c2, let a): p.addCurve(to: a, control1: c1, control2: c2)
            case .quad(let c, let a): p.addQuadCurve(to: a, control: c)
            case .close: p.closeSubpath()
            }
        }
        return p
    }

    static func ops(_ d: String) -> [Op] {
        var out: [Op] = []
        var cur = CGPoint.zero, start = CGPoint.zero
        var lastQuad: CGPoint?
        for (cmd, n) in tokens(d) {
            let rel = cmd.isLowercase
            var i = 0
            switch cmd.uppercased() {
            case "M":
                while i + 1 < n.count {
                    let a = rel ? CGPoint(x: cur.x + n[i], y: cur.y + n[i + 1]) : CGPoint(x: n[i], y: n[i + 1])
                    if i == 0 { out.append(.move(a)); start = a } else { out.append(.line(a)) }
                    cur = a; i += 2
                }
                lastQuad = nil
            case "L":
                while i + 1 < n.count {
                    let a = rel ? CGPoint(x: cur.x + n[i], y: cur.y + n[i + 1]) : CGPoint(x: n[i], y: n[i + 1])
                    out.append(.line(a)); cur = a; i += 2
                }
                lastQuad = nil
            case "H":
                while i < n.count { let a = CGPoint(x: rel ? cur.x + n[i] : n[i], y: cur.y); out.append(.line(a)); cur = a; i += 1 }
                lastQuad = nil
            case "V":
                while i < n.count { let a = CGPoint(x: cur.x, y: rel ? cur.y + n[i] : n[i]); out.append(.line(a)); cur = a; i += 1 }
                lastQuad = nil
            case "C":
                // Lệnh C lặp: mỗi bộ 6 số tính tương đối theo điểm cuối của đoạn trước.
                while i + 5 < n.count {
                    let o = cur
                    let c1 = rel ? CGPoint(x: o.x + n[i], y: o.y + n[i + 1]) : CGPoint(x: n[i], y: n[i + 1])
                    let c2 = rel ? CGPoint(x: o.x + n[i + 2], y: o.y + n[i + 3]) : CGPoint(x: n[i + 2], y: n[i + 3])
                    let a = rel ? CGPoint(x: o.x + n[i + 4], y: o.y + n[i + 5]) : CGPoint(x: n[i + 4], y: n[i + 5])
                    out.append(.cubic(c1, c2, a)); cur = a; i += 6
                }
                lastQuad = nil
            case "Q":
                while i + 3 < n.count {
                    let o = cur
                    let q = rel ? CGPoint(x: o.x + n[i], y: o.y + n[i + 1]) : CGPoint(x: n[i], y: n[i + 1])
                    let a = rel ? CGPoint(x: o.x + n[i + 2], y: o.y + n[i + 3]) : CGPoint(x: n[i + 2], y: n[i + 3])
                    out.append(.quad(q, a)); cur = a; lastQuad = q; i += 4
                }
            case "T":
                while i + 1 < n.count {
                    let q = lastQuad.map { CGPoint(x: 2 * cur.x - $0.x, y: 2 * cur.y - $0.y) } ?? cur
                    let a = rel ? CGPoint(x: cur.x + n[i], y: cur.y + n[i + 1]) : CGPoint(x: n[i], y: n[i + 1])
                    out.append(.quad(q, a)); cur = a; lastQuad = q; i += 2
                }
            case "Z":
                out.append(.close); cur = start; lastQuad = nil
            default:
                break
            }
        }
        return out
    }

    /// Tách lệnh và số: "M1 2C3-4.5.5 6Z" → [(M,[1,2]), (C,[3,-4.5,0.5,6]), (Z,[])].
    private static func tokens(_ d: String) -> [(Character, [CGFloat])] {
        var out: [(Character, [CGFloat])] = []
        var num = ""
        func flush() {
            if !num.isEmpty, let v = Double(num), !out.isEmpty { out[out.count - 1].1.append(CGFloat(v)) }
            num = ""
        }
        for ch in d {
            if ch.isLetter && ch != "e" && ch != "E" {
                flush(); out.append((ch, []))
            } else if ch == "-" || ch == "+" {
                if num.last == "e" || num.last == "E" { num.append(ch) } else { flush(); num.append(ch) }
            } else if ch == "." {
                if num.contains(".") && !num.contains("e") && !num.contains("E") { flush() }
                num.append(ch)
            } else if ch.isNumber || ch == "e" || ch == "E" {
                num.append(ch)
            } else {
                flush()
            }
        }
        flush()
        return out
    }
}

/// Nét vẽ dần như ngòi bút: đường chia thành các đoạn thẳng nhỏ kèm độ dài cộng dồn, lấy được phần đã vẽ
/// tới một tỉ lệ độ dài và vị trí ngòi bút (như getTotalLength / getPointAtLength trên web).
struct TracePath {
    private(set) var points: [CGPoint] = []
    /// Độ dài cộng dồn tới mỗi điểm.
    private(set) var lengths: [CGFloat] = []
    /// Điểm mở đầu một nét con (không nối với điểm trước).
    private(set) var starts: [Bool] = []
    var length: CGFloat { lengths.last ?? 0 }

    init(_ d: String, steps: Int = 10) {
        var pts: [CGPoint] = [], lens: [CGFloat] = [], sub: [Bool] = []
        var cur = CGPoint.zero, start = CGPoint.zero
        func add(_ p: CGPoint, newSub: Bool = false) {
            let first = pts.isEmpty
            let last = lens.last ?? 0
            lens.append(newSub || first ? last : last + hypot(p.x - cur.x, p.y - cur.y))
            pts.append(p); sub.append(newSub || first); cur = p
        }
        for op in SVGPath.ops(d) {
            switch op {
            case .move(let a): add(a, newSub: true); start = a
            case .line(let a): add(a)
            case .cubic(let c1, let c2, let a):
                let p0 = cur
                for i in 1...steps {
                    let t = CGFloat(i) / CGFloat(steps), u = 1 - t
                    let b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t
                    let x = b0 * p0.x + b1 * c1.x + b2 * c2.x + b3 * a.x
                    let y = b0 * p0.y + b1 * c1.y + b2 * c2.y + b3 * a.y
                    add(CGPoint(x: x, y: y))
                }
            case .quad(let c, let a):
                let p0 = cur
                for i in 1...steps {
                    let t = CGFloat(i) / CGFloat(steps), u = 1 - t
                    let b0 = u * u, b1 = 2 * u * t, b2 = t * t
                    add(CGPoint(x: b0 * p0.x + b1 * c.x + b2 * a.x, y: b0 * p0.y + b1 * c.y + b2 * a.y))
                }
            case .close:
                if cur != start { add(start) }
            }
        }
        points = pts; lengths = lens; starts = sub
    }

    /// Phần đường từ đầu tới tỉ lệ p (0…1) của tổng độ dài.
    func partial(_ p: CGFloat) -> Path {
        var path = Path()
        guard !points.isEmpty, p > 0 else { return path }
        let target = length * min(1, p)
        for i in points.indices {
            if starts[i] {
                if lengths[i] > target { break }
                path.move(to: points[i]); continue
            }
            if lengths[i] <= target { path.addLine(to: points[i]); continue }
            let a = lengths[i - 1], b = lengths[i]
            let k = b > a ? (target - a) / (b - a) : 0
            path.addLine(to: Self.lerp(points[i - 1], points[i], k))
            break
        }
        return path
    }

    /// Vị trí trên đường ở tỉ lệ p (0…1) của tổng độ dài.
    func point(at p: CGFloat) -> CGPoint {
        guard !points.isEmpty else { return .zero }
        let target = length * max(0, min(1, p))
        var lo = 0, hi = lengths.count - 1
        while lo < hi {
            let mid = (lo + hi) / 2
            if lengths[mid] < target { lo = mid + 1 } else { hi = mid }
        }
        if lo == 0 || starts[lo] { return points[lo] }
        let a = lengths[lo - 1], b = lengths[lo]
        let k = b > a ? (target - a) / (b - a) : 0
        return Self.lerp(points[lo - 1], points[lo], k)
    }

    private static func lerp(_ a: CGPoint, _ b: CGPoint, _ k: CGFloat) -> CGPoint {
        CGPoint(x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k)
    }
}

/// Easing và keyframe kiểu CSS / dòng thời gian của màn mở đầu web.
enum Motion {
    static func clamp(_ v: Double) -> Double { v < 0 ? 0 : v > 1 ? 1 : v }
    /// Tiến độ 0…1 của t trong đoạn [a, b].
    static func span(_ t: Double, _ a: Double, _ b: Double) -> Double { clamp((t - a) / (b - a)) }
    static func span(_ t: Double, _ w: (Double, Double)) -> Double { span(t, w.0, w.1) }
    static func easeOut(_ x: Double) -> Double { 1 - pow(1 - x, 3) }
    static func easeInOut(_ x: Double) -> Double { x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2 }
    static func easeIn(_ x: Double) -> Double { x * x * x }
    static func backOut(_ x: Double) -> Double {
        let c = 1.7, y = x - 1
        return 1 + (c + 1) * y * y * y + c * y * y
    }

    /// Đường cong cubic-bezier(x1, y1, x2, y2) của CSS.
    static func bezier(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double, _ x: Double) -> Double {
        if x <= 0 { return 0 }
        if x >= 1 { return 1 }
        func curve(_ t: Double, _ p1: Double, _ p2: Double) -> Double {
            let u = 1 - t
            let a = 3 * u * u * t * p1
            let b = 3 * u * t * t * p2
            return a + b + t * t * t
        }
        // Tìm t để trục x của đường cong bằng x (chia đôi; đường cong CSS luôn đơn điệu theo x).
        var lo = 0.0, hi = 1.0, t = x
        for _ in 0..<24 {
            let v = curve(t, x1, x2)
            if abs(v - x) < 1e-6 { break }
            if v < x { lo = t } else { hi = t }
            t = (lo + hi) / 2
        }
        return curve(t, y1, y2)
    }
    static func cssEase(_ x: Double) -> Double { bezier(0.25, 0.1, 0.25, 1, x) }
    static func cssEaseInOut(_ x: Double) -> Double { bezier(0.42, 0, 0.58, 1, x) }
    static func cssEaseOut(_ x: Double) -> Double { bezier(0, 0, 0.58, 1, x) }

    /// Giá trị theo các mốc keyframe [(vị trí 0…1, giá trị)]; mỗi đoạn giữa hai mốc dùng `ease` như CSS.
    static func keyframes(_ u: Double, _ frames: [(Double, Double)], ease: (Double) -> Double) -> Double {
        guard let first = frames.first else { return 0 }
        if u <= first.0 { return first.1 }
        for i in 1..<frames.count where u <= frames[i].0 {
            let a = frames[i - 1], b = frames[i]
            let k = b.0 > a.0 ? ease((u - a.0) / (b.0 - a.0)) : 1
            return a.1 + (b.1 - a.1) * k
        }
        return frames[frames.count - 1].1
    }

    /// Tiến độ 0…1 trong vòng hiện tại của một animation lặp mãi; nil khi chưa hết thời gian trễ.
    static func loop(_ t: Double, period: Double, delay: Double = 0) -> Double? {
        let x = t - delay
        guard x >= 0 else { return nil }
        return x.truncatingRemainder(dividingBy: period) / period
    }

    /// Tiến độ 0…1 của một animation chạy `count` lần sau `delay`; nil khi chưa chạy hoặc đã xong.
    static func pass(_ t: Double, dur: Double, delay: Double = 0, count: Double = 1) -> Double? {
        let x = t - delay
        guard x >= 0, x < dur * count else { return nil }
        return x.truncatingRemainder(dividingBy: dur) / dur
    }

    /// Bản sao context đã xoay / co giãn / dời quanh điểm (x, y), như transform + transform-origin của CSS.
    static func around(_ c: GraphicsContext, _ x: CGFloat, _ y: CGFloat, rotate deg: Double = 0,
                       scaleX: CGFloat = 1, scaleY: CGFloat = 1, dx: CGFloat = 0, dy: CGFloat = 0) -> GraphicsContext {
        var c = c
        c.translateBy(x: x + dx, y: y + dy)
        if deg != 0 { c.rotate(by: .degrees(deg)) }
        if scaleX != 1 || scaleY != 1 { c.scaleBy(x: scaleX, y: scaleY) }
        c.translateBy(x: -x, y: -y)
        return c
    }
}
