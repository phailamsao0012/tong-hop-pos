import SwiftUI

/// Mốc thời gian lúc mở app (kế hoạch 1.2, chỉ bản Debug): in "[MOC] <tên> <mili giây từ lúc tiến trình chạy>" ra log của app,
/// để đo "từ chạm icon tới hộp Face ID" và "từ Face ID tới con số đầu tiên" bằng log, không bằng đồng hồ của video máy ảo.
/// Các mốc: bat-dau (code của app bắt đầu chạy), khung-hinh-dau, hoi-face-id, face-id-dung, vao-app, so-dau-tien.
/// Mỗi tên chỉ ghi lần đầu trong một lần mở app. Chỉ ghi tên mốc và số mili giây: không ghi số liệu, tên, email hay token.
/// Bản Release: mark() không làm gì.
enum LaunchClock {
    static func mark(_ name: String) {
        #if DEBUG
        let ms = elapsedMs()
        guard Book.shared.first(name) else { return }
        print("[MOC] \(name) \(ms)")
        fflush(stdout)
        DispatchQueue.main.async { LaunchMarks.shared.list.append(LaunchMarks.Mark(name: name, ms: ms)) }
        #endif
    }

    #if DEBUG
    /// Mili giây từ lúc tiến trình bắt đầu (giờ khởi động tiến trình do hệ thống ghi, gồm cả phần trước khi code của app chạy).
    static func elapsedMs(_ now: Date = Date()) -> Int {
        Int(((now.timeIntervalSince1970 - processStart) * 1000).rounded())
    }
    private static let processStart: TimeInterval = {
        var info = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
        guard sysctl(&mib, UInt32(mib.count), &info, &size, nil, 0) == 0 else { return Date().timeIntervalSince1970 }
        let t = info.kp_proc.p_un.__p_starttime
        guard t.tv_sec > 0 else { return Date().timeIntervalSince1970 }
        return TimeInterval(t.tv_sec) + TimeInterval(t.tv_usec) / 1_000_000
    }()
    /// Tên mốc đã ghi (gọi được từ mọi luồng).
    private final class Book: @unchecked Sendable {
        static let shared = Book()
        private let lock = NSLock()
        private var seen = Set<String>()
        func first(_ name: String) -> Bool {
            lock.lock(); defer { lock.unlock() }
            return seen.insert(name).inserted
        }
    }
    #endif
}

#if DEBUG
/// Các mốc đã ghi, để đồng hồ góc màn (MEGATECH_CLOCK=1) hiện kèm.
@Observable final class LaunchMarks {
    struct Mark: Identifiable { let name: String; let ms: Int; var id: String { name } }
    static let shared = LaunchMarks()
    var list: [Mark] = []
}

/// MEGATECH_CLOCK=1 (chỉ bản Debug): đồng hồ mili giây nhỏ ở góc trên bên phải, tính từ lúc tiến trình chạy, kèm các mốc
/// [MOC] đã qua, để video máy ảo cho thấy lúc nào hỏi Face ID, lúc nào vào app, lúc nào có số. Không chạm được, VoiceOver bỏ qua.
struct LaunchClockOverlay: View {
    static let enabled = ProcessInfo.processInfo.environment["MEGATECH_CLOCK"] == "1"
    private static let labels: [String: String] = [
        "bat-dau": "Bắt đầu chạy", "khung-hinh-dau": "Khung hình đầu", "hoi-face-id": "Hỏi Face ID",
        "face-id-dung": "Face ID đúng", "vao-app": "Vào app", "so-dau-tien": "Số đầu tiên",
    ]
    var body: some View {
        TimelineView(.animation(minimumInterval: FrameCap.interval)) { tl in
            VStack(alignment: .trailing, spacing: 2) {
                Text("\(LaunchClock.elapsedMs(tl.date)) ms").font(.system(size: 16, weight: .bold, design: .monospaced))
                Text("từ lúc mở app").font(.system(size: 11, weight: .medium))
                // Chỉ các mốc có tên tiếng Việt ở trên; mốc kỹ thuật khác (vd. cờ Face ID) chỉ ghi log.
                ForEach(LaunchMarks.shared.list.filter { Self.labels[$0.name] != nil }) { m in
                    Text("\(Self.labels[m.name] ?? m.name) \(m.ms) ms").font(.system(size: 12, weight: .semibold, design: .monospaced))
                }
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 9).padding(.vertical, 6)
            .background(.black.opacity(0.62), in: .rect(cornerRadius: 9))
        }
        .padding(.top, 4).padding(.trailing, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
#endif
