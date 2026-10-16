import Foundation

/// Mốc tải số của từng màn (kế hoạch 1.3, chỉ bản Debug): in "[MOC] tai <màn> ..." ra log của app khi một lượt tải bắt đầu và xong,
/// kèm số request, số request chạy cùng lúc nhiều nhất và tổng thời gian từng request cộng lại (lớn hơn hẳn thời gian cả lượt
/// nghĩa là các request chạy song song). Lần mở lại tab bỏ qua vì số còn mới thì in "bo-qua".
/// Chỉ ghi tên màn, số request và mili giây: không ghi số liệu, tên, email, đường dẫn hay token. Bản Release không làm gì.
/// Gọi được từ mọi luồng.
final class LoadTrace: @unchecked Sendable {
    #if DEBUG
    private let name: String
    private let planned: Int
    private let started = Date()
    private let lock = NSLock()
    private var running = 0, peak = 0, done = 0, failed = 0
    private var busy: TimeInterval = 0
    private var ended = false
    #endif

    /// requests: số request lượt này định gọi.
    init(_ name: String, requests: Int) {
        #if DEBUG
        self.name = name
        self.planned = requests
        print("[MOC] tai \(name) bat-dau \(LaunchClock.elapsedMs()) | \(requests) req")
        fflush(stdout)
        #endif
    }

    /// Chạy một request của lượt tải (đếm số request đang chạy cùng lúc và thời gian của nó).
    func run<T>(_ work: () async throws -> T) async throws -> T {
        #if DEBUG
        let t0 = begin()
        do {
            let v = try await work()
            finish(t0, ok: true)
            return v
        } catch {
            finish(t0, ok: false)
            throw error
        }
        #else
        return try await work()
        #endif
    }

    /// Lượt tải xong; cancelled: bị hủy (rời trang, đổi bộ lọc, có lượt mới hơn). Chỉ in lần đầu.
    func end(cancelled: Bool = false) {
        #if DEBUG
        guard let s = finishOnce() else { return }
        let total = Int((Date().timeIntervalSince(started) * 1000).rounded())
        let sum = Int((s.busy * 1000).rounded())
        print("[MOC] tai \(name) \(cancelled ? "huy" : "xong") \(LaunchClock.elapsedMs()) | \(s.done)/\(planned) req, ca luot \(total) ms, cong tung req \(sum) ms, cung luc toi da \(s.peak), loi \(s.failed)")
        fflush(stdout)
        #endif
    }

    /// Mở lại màn mà số còn mới (chưa quá Freshness.window giây): không tải lại.
    static func skip(_ name: String, age: TimeInterval) {
        #if DEBUG
        print("[MOC] tai \(name) bo-qua \(LaunchClock.elapsedMs()) | so con moi \(Int(age)) s")
        fflush(stdout)
        #endif
    }

    #if DEBUG
    private func begin() -> Date {
        lock.lock(); defer { lock.unlock() }
        running += 1
        peak = max(peak, running)
        return Date()
    }
    private func finish(_ t0: Date, ok: Bool) {
        let d = Date().timeIntervalSince(t0)
        lock.lock(); defer { lock.unlock() }
        running -= 1; done += 1; busy += d
        if !ok { failed += 1 }
    }
    private func finishOnce() -> (done: Int, peak: Int, failed: Int, busy: TimeInterval)? {
        lock.lock(); defer { lock.unlock() }
        guard !ended else { return nil }
        ended = true
        return (done, peak, failed, busy)
    }
    #endif
}

/// Như attempt(_:_:), có đếm request vào lượt tải của màn (LoadTrace).
func attempt<T>(_ on: Bool, _ trace: LoadTrace, _ f: () async throws -> T) async -> Result<T, Error>? {
    guard on else { return nil }
    do { return .success(try await trace.run(f)) } catch { return .failure(error) }
}
