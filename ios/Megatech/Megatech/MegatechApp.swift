import SwiftUI

@main
struct MegatechApp: App {
    @State private var auth = AuthModel()
    @State private var lock = AppLock()
    @State private var sync = SyncStatus()
    @State private var approvals = ApprovalCenter()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            let signedIn = auth.state == .signedIn
            // Che nội dung khi app không ở trạng thái active (màn đa nhiệm, chuyển app) và khi đang khoá.
            let hide = phase != .active && !BiometricPrompt.shared.active
            let cover = signedIn && (lock.locked || hide)
            ZStack {
                Group {
                    switch auth.state {
                    case .checking: BrandSplash()
                    case .signedOut: LoginView()
                    case .signedIn: RootTabs()
                    }
                }
                .blur(radius: cover ? 22 : 0)
                .allowsHitTesting(!cover)
                // Sheet duyệt luôn nằm trong cây giao diện (kể cả khi Face ID làm app tạm "inactive") để không mất số đã chọn.
                if signedIn, let item = approvals.current { ApprovalSheet(item: item).id(item.id).transition(.move(edge: .bottom).combined(with: .opacity)).zIndex(2).opacity(lock.locked ? 0 : 1) }
                if signedIn && lock.locked { LockScreen().transition(.opacity).zIndex(3) }
                else if signedIn && hide { PrivacyCover().transition(.opacity).zIndex(3) }
            }
            .animation(.easeInOut(duration: 0.25), value: cover)
            .animation(.spring(duration: 0.35), value: approvals.current?.id)
            // Màn đăng nhập / khoá nền xanh đậm: thanh trạng thái chữ sáng.
            .preferredColorScheme(!signedIn || lock.locked ? .dark : nil)
            .environment(auth)
            .environment(lock)
            .environment(sync)
            .environment(approvals)
            .task { await auth.start(lockEnabled: lock.enabled) }
            .onChange(of: phase) { _, p in lock.phaseChanged(p) }
            .onChange(of: auth.state) { _, s in if s != .signedIn { approvals.reset(); lock.locked = false } }
            // Chờ duyệt đăng nhập của chính mình (bước hai khi ai đó đăng nhập bằng mật khẩu): hỏi 5 giây một lần khi app đang mở.
            .task(id: signedIn && phase == .active && !lock.locked) {
                guard signedIn && phase == .active && !lock.locked else { return }
                #if DEBUG
                approvals.debugOpenFromEnvironment()
                #endif
                while !Task.isCancelled {
                    await approvals.check()
                    try? await Task.sleep(for: .seconds(5))
                }
            }
        }
    }
}

@Observable final class AuthModel {
    enum State { case checking, signedOut, signedIn }
    var state: State = .checking
    var me: API.Me?
    /// Dòng báo trên màn đăng nhập (ví dụ "Phiên đã hết hạn, nhập mật khẩu một lần").
    var notice: String?
    /// Có phiên lưu trong Keychain đang chờ mở bằng Face ID.
    var hasSaved: Bool { SessionStore.hasSession }
    private var observer: NSObjectProtocol?

    init() {
        observer = NotificationCenter.default.addObserver(forName: API.sessionExpired, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.expired() }
        }
    }

    /// Mở app: chuyển phiên cũ sang Keychain; có phiên + bật khoá → màn "Chào mừng trở lại" chờ Face ID; không khoá → vào luôn.
    @MainActor func start(lockEnabled: Bool) async {
        SessionStore.migrate()
        #if DEBUG
        if let t = ProcessInfo.processInfo.environment["MEGATECH_SESSION"], !t.isEmpty, SessionStore.token == nil { SessionStore.token = t }
        #endif
        guard SessionStore.hasSession else { state = .signedOut; return }
        if lockEnabled { state = .signedOut; return }
        await restore()
    }
    @MainActor func restore() async {
        do {
            let m = try await API.me()
            me = m; SessionStore.lastEmail = m.email; notice = nil; state = .signedIn
        } catch let e as API.APIError where e.status == 401 {
            expired()
        } catch {
            notice = error.localizedDescription; state = .signedOut
        }
    }
    @MainActor func expired() {
        let had = SessionStore.hasSession || state == .signedIn
        SessionStore.clear(); me = nil
        if had { notice = "Phiên đã hết hạn, nhập mật khẩu một lần." }
        state = .signedOut
    }
    @MainActor func signedIn() async { notice = nil; await restore() }
    @MainActor func logout() async { await API.logout(); me = nil; notice = nil; state = .signedOut }
    /// "Đổi tài khoản": bỏ phiên và email đã nhớ trên máy này.
    @MainActor func forgetAccount() async {
        if SessionStore.hasSession { await API.logout() }
        SessionStore.lastEmail = nil; notice = nil; state = .signedOut
    }
}
