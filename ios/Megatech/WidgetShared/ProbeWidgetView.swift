import SwiftUI

/// Màu của widget (không dùng màu trong Asset Catalog: widget không có ảnh hay tài nguyên).
enum ProbeColors {
    static let green = Color(red: 0x17 / 255, green: 0x68 / 255, blue: 0x4b / 255)
    static let greenSoft = Color(red: 0xE3 / 255, green: 0xF1 / 255, blue: 0xE8 / 255)
    static let paper = Color(red: 0xF7 / 255, green: 0xFA / 255, blue: 0xF8 / 255)
    static let ink = Color(red: 0x14 / 255, green: 0x1F / 255, blue: 0x1A / 255)
    static let inkSoft = Color(red: 0x6B / 255, green: 0x77 / 255, blue: 0x71 / 255)
    static let warn = Color(red: 0xB4 / 255, green: 0x6A / 255, blue: 0x0E / 255)
    static let bad = Color(red: 0xc8 / 255, green: 0x40 / 255, blue: 0x3f / 255)
}

/// Trạng thái widget thăm dò.
enum ProbeState: Equatable {
    /// (a) Có App Group và đã nhận probe.json; ngày giờ app ghi.
    case received(Date)
    /// (b) Có App Group, app chưa ghi gì.
    case waiting
    /// (c) Không dò được App Group.
    case noGroup
    /// (d) Có file mà không đọc được (máy đang khoá).
    case locked
}

enum ProbeFamily { case small, rectangular }

/// View của widget thăm dò, dùng chung cho widget và khung xem widget trong app (vẽ đúng như widget vẽ).
/// Không tự vẽ nền: widget dùng containerBackground, khung xem tự vẽ thẻ bo góc.
struct ProbeWidgetView: View {
    let state: ProbeState
    /// Giờ widget chạy (ghi ở dòng cuối "Widget chạy HH:mm").
    let ranAt: Date
    let family: ProbeFamily
    /// Nút "Làm mới" (chỉ cỡ nhỏ): widget truyền Button(intent:), khung xem truyền hình giống nút. nil = không có nút.
    var refresh: AnyView? = nil

    /// Hình nút Làm mới, dùng chung cho nút thật và hình giống nút.
    static var refreshLabel: some View {
        Image(systemName: "arrow.clockwise")
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(ProbeColors.green)
            .frame(width: 26, height: 26)
            .background(ProbeColors.greenSoft, in: Circle())
            .accessibilityLabel("Làm mới")
    }

    private var icon: String {
        switch state {
        case .received: return "checkmark.circle.fill"
        case .waiting: return "hand.tap.fill"
        case .noGroup: return "link"
        case .locked: return "lock.fill"
        }
    }
    private var tint: Color {
        switch state {
        case .received: return ProbeColors.green
        case .waiting: return ProbeColors.inkSoft
        case .noGroup: return ProbeColors.warn
        case .locked: return ProbeColors.ink
        }
    }
    private var headline: String {
        switch state {
        case .received: return "Đã nhận dữ liệu từ app"
        case .waiting: return "Mở app MEGATECH một lần để gửi dữ liệu"
        case .noGroup: return "Không có App Group"
        case .locked: return "Máy đang khóa"
        }
    }
    private var detail: String? {
        switch state {
        case .received(let d): return "lúc \(ProbeTime.dayTime(d))"
        case .waiting: return nil
        case .noGroup: return "Sẽ dùng ghép nối qua máy chủ"
        case .locked: return "Mở khóa để xem"
        }
    }
    private var footer: String { "Widget chạy \(ProbeTime.time(ranAt))" }

    var body: some View {
        switch family {
        case .small: small
        case .rectangular: rectangular
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 4) {
                Text("MEGATECH · bản thử")
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .foregroundStyle(ProbeColors.green)
                    .lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 0)
                if let refresh { refresh }
            }
            Spacer(minLength: 4)
            Image(systemName: icon)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(tint)
                .padding(.bottom, 5)
            Text(headline)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(ProbeColors.ink)
                .lineLimit(3).minimumScaleFactor(0.8)
            if let detail {
                Text(detail)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(ProbeColors.inkSoft)
                    .lineLimit(2).minimumScaleFactor(0.8)
                    .padding(.top, 2)
            }
            Spacer(minLength: 4)
            Text(footer)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(ProbeColors.inkSoft)
                .monospacedDigit()
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    /// Màn khoá: iOS tự đổi màu (đơn sắc), nên dùng primary / secondary.
    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 11, weight: .bold))
                Text("MEGATECH · bản thử").font(.system(size: 11, weight: .heavy, design: .rounded))
            }
            .lineLimit(1)
            Text(headline)
                .font(.system(size: 13, weight: .semibold))
                .lineLimit(detail == nil ? 2 : 1).minimumScaleFactor(0.75)
            if let detail {
                Text(detail).font(.system(size: 12)).lineLimit(1).minimumScaleFactor(0.75)
            }
            Text(footer).font(.system(size: 10)).foregroundStyle(.secondary).monospacedDigit()
        }
        .foregroundStyle(.primary)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}
