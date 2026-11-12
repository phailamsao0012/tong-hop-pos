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
        LoadBoard.shared.start(name)
        print("[MOC] tai \(name) bat-dau \(LaunchClock.elapsedMs()) | \(requests) req")
        fflush(stdout)
        #endif
    }

    #if DEBUG
    /// Lượt bị bỏ mà không gọi end() (task bị huỷ giữa chừng): ghi là huỷ để bảng lượt tải không treo.
    deinit {
        if finishOnce() != nil { LoadBoard.shared.end(name, .cancelled) }
    }
    #endif

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
        LoadBoard.shared.end(name, cancelled ? .cancelled : s.failed > 0 ? .failed : .done)
        let total = Int((Date().timeIntervalSince(started) * 1000).rounded())
        let sum = Int((s.busy * 1000).rounded())
        print("[MOC] tai \(name) \(cancelled ? "huy" : "xong") \(LaunchClock.elapsedMs()) | \(s.done)/\(planned) req, ca luot \(total) ms, cong tung req \(sum) ms, cung luc toi da \(s.peak), loi \(s.failed)")
        fflush(stdout)
        #endif
    }

    /// Mở lại màn mà số còn mới (chưa quá Freshness.window giây): không tải lại.
    static func skip(_ name: String, age: TimeInterval) {
        #if DEBUG
        LoadBoard.shared.end(name, .done, counted: false)
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

#if DEBUG
/// Bảng lượt tải theo tên màn (chỉ bản Debug). Lượt chụp giao diện (MEGATECH_TOUR=giaodien) chờ số của màn về xong rồi mới
/// in mốc [UI] và đi tiếp, để không chụp lúc còn khung xương và không để request của màn trước còn chạy chiếm web ảo.
final class LoadBoard: @unchecked Sendable {
    enum Outcome { case done, failed, cancelled }
    enum State { case idle, busy, done, failed }
    static let shared = LoadBoard()
    private let lock = NSLock()
    private var running: [String: Int] = [:]
    private var last: [String: (at: Date, result: Outcome)] = [:]

    func start(_ name: String) {
        lock.lock(); defer { lock.unlock() }
        running[name, default: 0] += 1
    }
    /// counted false: không có lượt đang chạy để trừ (bỏ qua vì số còn mới).
    func end(_ name: String, _ result: Outcome, counted: Bool = true) {
        lock.lock(); defer { lock.unlock() }
        if counted { running[name] = max(0, (running[name] ?? 1) - 1) }
        last[name] = (Date(), result)
    }
    /// idle: chưa tải kể từ t và không có lượt đang chạy (không được xem, hoặc số còn mới); busy: đang tải, hoặc lượt gần nhất bị
    /// huỷ (chờ lượt mới); done: xong không lỗi; failed: xong có request lỗi.
    func state(_ name: String, since t: Date) -> State {
        lock.lock(); defer { lock.unlock() }
        if (running[name] ?? 0) > 0 { return .busy }
        guard let l = last[name], l.at >= t else { return .idle }
        switch l.result {
        case .done: return .done
        case .failed: return .failed
        case .cancelled: return .busy
        }
    }

    /// Chờ các màn names tải xong kể từ t (tối đa limit giây). false: có lượt lỗi, hoặc hết giờ.
    @MainActor static func settle(_ names: [String], since t: Date, limit: Double = 80) async -> Bool {
        // Cho màn vừa mở kịp bắt đầu lượt tải.
        try? await Task.sleep(for: .milliseconds(1200))
        let deadline = Date().addingTimeInterval(limit)
        var failedAt: Date?
        while Date() < deadline {
            if Task.isCancelled { return false }
            let states = names.map { shared.state($0, since: t) }
            if states.contains(.failed) {
                // Lỗi giữ hơn 1 giây (không phải lượt cũ vừa xong trước lượt mới) thì báo lỗi.
                if let f = failedAt, Date().timeIntervalSince(f) > 1 { return false }
                if failedAt == nil { failedAt = Date() }
            } else {
                failedAt = nil
                if states.allSatisfy({ $0 == .done || $0 == .idle }) { return true }
            }
            try? await Task.sleep(for: .milliseconds(250))
        }
        return false
    }
}
#endif

/// Như attempt(_:_:), có đếm request vào lượt tải của màn (LoadTrace).
func attempt<T>(_ on: Bool, _ trace: LoadTrace, _ f: () async throws -> T) async -> Result<T, Error>? {
    guard on else { return nil }
    do { return .success(try await trace.run(f)) } catch { return .failure(error) }
}
