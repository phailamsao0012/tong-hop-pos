import Foundation

/// Tải trước lúc hộp Face ID đang hiện (kế hoạch 1.2b). Màn "Chào mừng trở lại" vừa hỏi Face ID thì gọi /api/auth/me, rồi
/// các request đầu tiên của tab mở app (firstTabPaths), để Face ID xong là có số ngay.
/// - Kết quả chỉ nằm trong bộ nhớ (không ghi file, không vào cache: gửi qua API.memoryOnlySession, không có URLCache) và chỉ lấy
///   được sau khi Face ID đúng (release).
/// - Face ID sai, hủy, không dùng được, rời app, đăng xuất, phiên hết hạn: bỏ ngay (discard), request đang chạy bị hủy.
/// - Sau Face ID đúng, phần chưa dùng tới trong `window` giây thì bỏ; mỗi kết quả chỉ dùng một lần (API.request lấy qua take).
/// Gọi được từ mọi luồng.
final class UnlockPrefetch: @unchecked Sendable {
    static let shared = UnlockPrefetch()
    typealias Reply = (data: Data, status: Int)
    private struct Entry { let task: Task<Reply, Error>; let at: Date }

    /// Sau Face ID đúng, kết quả chưa dùng tới trong chừng này giây thì bỏ (lần tải sau đi thẳng máy chủ).
    private static let window: TimeInterval = 15
    /// Request bắt đầu quá lâu trước lúc dùng (hộp Face ID để đó lâu) thì không dùng, tải lại số mới.
    private static let maxAge: TimeInterval = 60

    private let mutex = NSLock()
    private var entries: [String: Entry] = [:]
    private var planner: Task<Void, Never>?
    /// Tăng mỗi lần bắt đầu hoặc bỏ: việc của lượt cũ về sau không được ghi vào.
    private var generation = 0
    /// Face ID đã đúng ở lượt này: được lấy kết quả.
    private var released = false

    private func locked<T>(_ body: () -> T) -> T {
        mutex.lock(); defer { mutex.unlock() }
        return body()
    }

    /// Bắt đầu tải trước (ngay trước khi hỏi Face ID ở màn "Chào mừng trở lại"). Lượt cũ còn dở thì bỏ.
    func begin() {
        discard()
        guard SessionStore.hasSession else { return }
        let gen: Int = locked { generation }
        guard let me = fetch("/api/auth/me", generation: gen) else { return }
        let plan = Task.detached(priority: .userInitiated) {
            guard let reply = try? await me.value, !Task.isCancelled, (200..<300).contains(reply.status),
                  let m = try? JSONDecoder().decode(API.Me.self, from: reply.data) else { return }
            for p in UnlockPrefetch.firstTabPaths(m) { UnlockPrefetch.shared.fetch(p, generation: gen) }
        }
        let kept: Bool = locked {
            guard generation == gen else { return false }
            planner = plan
            return true
        }
        if !kept { plan.cancel() }
    }

    /// Face ID (hoặc cách mở khác của màn này) đã đúng: từ giờ API.request mới lấy được kết quả tải trước.
    func release() {
        let gen: Int = locked { released = true; return generation }
        Task.detached(priority: .utility) {
            try? await Task.sleep(for: .seconds(UnlockPrefetch.window))
            UnlockPrefetch.shared.clear(onlyGeneration: gen)
        }
    }

    /// Bỏ mọi kết quả tải trước và hủy request đang chạy.
    func discard() { clear(onlyGeneration: nil) }

    /// API.request: lấy (một lần) kết quả tải trước của đúng request GET này, nếu Face ID đã đúng và kết quả chưa quá cũ.
    func take(_ req: URLRequest) -> Task<Reply, Error>? {
        guard req.httpMethod == "GET", let key = req.url?.absoluteString else { return nil }
        let hit: Entry? = locked {
            guard released, !entries.isEmpty else { return nil }
            return entries.removeValue(forKey: key)
        }
        guard let hit else { return nil }
        guard Date.now.timeIntervalSince(hit.at) < Self.maxAge else { hit.task.cancel(); return nil }
        return hit.task
    }

    /// Request tab mở app sẽ gọi ngay khi vào app, đúng đường dẫn và tham số (khớp từng ký tự thì mới dùng được).
    /// Cùng quy tắc với RootTabs: tab mở app theo "Mở app vào" (mặc định tab cuối cùng, NavMemory.launchTab). Tổng quan (người
    /// được xem): HomeView.load với kỳ, POS, nhóm đơn nhớ từ lần trước. Trang chủ, hoặc Tổng quan mà chưa được xem: HomeFeed.load
    /// (theo HomeSources). Các tab khác: chưa tải trước. Đổi cách tải của các tab đó thì sửa cả ở đây; quên sửa thì số không sai,
    /// chỉ mất phần tải trước (request không khớp, bị bỏ sau `window` giây).
    static func firstTabPaths(_ me: API.Me) -> [String] {
        let canOverview = me.canView("overview")
        switch NavMemory.launchTab {
        case .overview where canOverview:
            let r = NavMemory.period.range, pos = NavMemory.pos, ids = pos.isEmpty ? [] : [pos]
            var out = [API.sectionsPath(start: r.0, end: r.1, posIds: ids, product: NavMemory.product)]
            if me.canView("mkt-roas") { out.append(API.mktAnalyticsPath(start: r.0, end: r.1, posIds: ids, marketerId: nil, teamId: nil, product: nil)) }
            return out
        case .overview, .home:
            return HomeSources(me).paths(day: VNDate.string(.now))
        case .orders, .depts, .more:
            return []
        }
    }

    @discardableResult private func fetch(_ path: String, generation gen: Int) -> Task<Reply, Error>? {
        guard let req = try? API.makeRequest(path), let key = req.url?.absoluteString else { return nil }
        let sent = SessionStore.token
        let task = Task.detached(priority: .userInitiated) { () async throws -> Reply in
            try await API.transfer(req, sent: sent, via: API.memoryOnlySession)
        }
        let kept: Bool = locked {
            guard generation == gen else { return false }
            entries[key] = Entry(task: task, at: Date.now)
            return true
        }
        if !kept { task.cancel(); return nil }
        return task
    }

    /// onlyGeneration: chỉ bỏ nếu vẫn là lượt đó (hết `window` giây sau Face ID đúng); nil = bỏ ngay.
    private func clear(onlyGeneration gen: Int?) {
        let (tasks, plan): ([Task<Reply, Error>], Task<Void, Never>?) = locked {
            if let gen, gen != generation { return ([], nil) }
            generation += 1; released = false
            let t = entries.values.map(\.task), p = planner
            entries = [:]; planner = nil
            return (t, p)
        }
        plan?.cancel()
        for t in tasks { t.cancel() }
    }
}
