import SwiftUI

@main
struct MegatechApp: App {
    @State private var auth = AuthModel()
    @State private var lock = AppLock()
    @State private var sync = SyncStatus()
    @State private var approvals = ApprovalCenter()
    @State private var satellites = SatelliteCenter()
    @State private var intro = IntroState()
    @State private var coverWindow = CoverWindow()
    @Environment(\.scenePhase) private var phase
    init() {
        #if DEBUG
        // Kiểm thử chuỗi Format.swift (CI ios-preview.yml): chạy trước giao diện và trước mạng, in kết quả rồi thoát app.
        if ProcessInfo.processInfo.environment["MEGATECH_FORMAT_TEST"] == "1" { FormatSelfTest.runAndExit() }
        // MEGATECH_NAV_RESET=1: bỏ tab, kỳ, POS, nhóm đơn và đường đi đã nhớ (như sau khi đăng xuất), để máy ảo quay video
        // đổi kỳ, POS từ trạng thái mặc định (đoạn 9-ky-pos của "iOS preview").
        if ProcessInfo.processInfo.environment["MEGATECH_NAV_RESET"] == "1" { NavMemory.reset() }
        #endif
        // Mốc thời gian lúc mở app (chỉ bản Debug ghi log "[MOC] …", kế hoạch 1.2): code của app bắt đầu chạy.
        LaunchClock.mark("bat-dau")
    }
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
                .accessibilityHidden(cover)
                // Sheet duyệt luôn nằm trong cây giao diện (kể cả khi Face ID làm app tạm "inactive") để không mất số đã chọn.
                if signedIn, let item = approvals.current {
                    ApprovalSheet(item: item).id(item.id).transition(.move(edge: .bottom).combined(with: .opacity)).zIndex(2)
                        .opacity(lock.locked ? 0 : 1).accessibilityHidden(lock.locked)
                }
                // Màn mở đầu logo khi mở app từ đầu, phủ lên màn đăng nhập rồi phóng to để lộ nó ra.
                if intro.stage != .done { LogoIntroView().zIndex(10) }
                #if DEBUG
                // MEGATECH_WIDGETS=1: khung xem widget phủ toàn màn (không đăng nhập, không mạng), để máy ảo quay video.
                if WidgetGalleryView.enabled { WidgetGalleryView().zIndex(20) }
                // MEGATECH_CLOCK=1: đồng hồ mili giây ở góc trên (từ lúc mở app) kèm các mốc, để video cho thấy thời gian mở app.
                if LaunchClockOverlay.enabled { LaunchClockOverlay().zIndex(30) }
                #endif
            }
            .onAppear { LaunchClock.mark("khung-hinh-dau") }
            .animation(.easeInOut(duration: 0.25), value: cover)
            .animation(.spring(duration: 0.35), value: approvals.current?.id)
            // Màn đăng nhập / khoá nền xanh đậm: thanh trạng thái chữ sáng.
            .preferredColorScheme(!signedIn || lock.locked ? .dark : nil)
            .environment(auth)
            .environment(lock)
            .environment(sync)
            .environment(approvals)
            .environment(satellites)
            .environment(intro)
            .task { auth.lock = lock; await auth.start() }
            .onChange(of: phase, initial: true) { _, p in
                lock.phaseChanged(p, signedIn: auth.state == .signedIn)
                // Rời app: bỏ số tải trước lúc hộp Face ID đang hiện (nếu còn), quay lại phải Face ID và tải lại.
                if p == .background { UnlockPrefetch.shared.discard() }
            }
            // Màn khoá / màn che ở cửa sổ riêng trên cùng (CoverWindow), phủ cả sheet và màn toàn phần đang mở.
            .onChange(of: CoverState(visible: cover, locked: lock.locked), initial: true) { _, c in
                coverWindow.update(visible: c.visible, key: c.locked) {
                    AnyView(CoverRoot().environment(auth).environment(lock).environment(intro))
                }
            }
            .onChange(of: auth.state) { _, s in if s != .signedIn { approvals.reset(); satellites.reset(); lock.locked = false } }
            // Chờ duyệt đăng nhập của chính mình (bước hai khi ai đó đăng nhập bằng mật khẩu): hỏi 5 giây một lần khi app đang mở.
            // Cùng vòng này cập nhật số việc chờ của web vệ tinh (tự bỏ qua nếu chưa quá 1 phút; chạy riêng để không chặn việc duyệt).
            .task(id: signedIn && phase == .active && !lock.locked) {
                guard signedIn && phase == .active && !lock.locked else { return }
                // Bản thăm dò widget: đã vào app (đã mở khoá) thì gửi probe.json sang widget. Chạy nền, lỗi bỏ qua.
                WidgetProbeBridge.appUnlocked()
                #if DEBUG
                approvals.debugOpenFromEnvironment()
                #endif
                while !Task.isCancelled {
                    Task { await satellites.refresh() }
                    await approvals.check()
                    try? await Task.sleep(for: .seconds(5))
                }
            }
        }
    }
}

/// Những gì quyết định cửa sổ che: có che không, đang khoá hay chỉ che tạm.
private struct CoverState: Equatable { let visible: Bool; let locked: Bool }

@Observable final class AuthModel {
    enum State { case checking, signedOut, signedIn }
    var state: State = .checking
    var me: API.Me?
    /// Dòng báo trên màn đăng nhập (ví dụ "Phiên đã hết hạn, nhập mật khẩu một lần").
    var notice: String?
    /// Vừa xác thực xong: linh vật vui trong lúc chờ phiên; phiên về là vào app ngay, không chờ linh vật (kế hoạch 1.2c).
    var celebrating = false
    /// Có phiên lưu trong Keychain đang chờ mở bằng Face ID.
    var hasSaved: Bool { SessionStore.hasSession }
    /// Khoá app (để đăng nhập xong khi app đã vào nền thì vào app ở trạng thái khoá).
    @ObservationIgnored weak var lock: AppLock?
    /// Tăng mỗi lần đăng xuất / đổi tài khoản / phiên hết hạn: lần mở phiên đang chờ dở thì bỏ, không vào app.
    @ObservationIgnored private var epoch = 0
    private var observer: NSObjectProtocol?

    init() {
        observer = NotificationCenter.default.addObserver(forName: API.sessionExpired, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.expired() }
        }
    }

    /// Mở app: chuyển phiên cũ sang Keychain. Có phiên lưu → màn "Chào mừng trở lại": LUÔN phải Face ID / mật mã iPhone /
    /// mật khẩu MEGATECH mới vào (anh Vũ 09/10/2026: "kể cả đăng nhập rồi thì vào vẫn phải có face id hoặc pass", không có công tắc tắt).
    /// Không có phiên → đăng nhập bằng email + mật khẩu.
    @MainActor func start() async {
        #if DEBUG
        // Khung xem widget (MEGATECH_WIDGETS=1): không vào luồng đăng nhập.
        if WidgetGalleryView.enabled { return }
        #endif
        SessionStore.migrate()
        #if DEBUG
        if let t = ProcessInfo.processInfo.environment["MEGATECH_SESSION"], !t.isEmpty, SessionStore.token == nil { SessionStore.token = t }
        #endif
        state = .signedOut
    }
    /// celebrate: linh vật vui ngay khi xác thực xong, trong lúc chờ phiên (thường đã tải sẵn lúc hộp Face ID đang hiện);
    /// không chờ thêm nhịp nào: phiên về là vào app ngay (kế hoạch 1.2c, linh vật không chặn việc vào app).
    /// since: số lần app vào nền lúc bắt đầu xác thực (mặc định: lúc gọi hàm này).
    @MainActor func restore(celebrate: Bool = false, since: Int? = nil) async {
        let since = since ?? lock?.backgrounds
        let started = epoch
        // Bấm "đổi tài khoản" / đăng xuất / phiên hết hạn trong lúc chờ: bỏ kết quả, không vào app, không nhớ lại email.
        var current: Bool { started == epoch && SessionStore.hasSession }
        if celebrate && !UIAccessibility.isReduceMotionEnabled { celebrating = true }
        defer { celebrating = false }
        do {
            let m = try await API.me()
            guard current else { return }
            me = m; SessionStore.lastEmail = m.email; notice = nil
            // Xong khi app đang ở nền, hoặc app đã vào nền trong lúc chờ: vào app ở trạng thái khoá, quay lại phải xác thực.
            if let lock, UIApplication.shared.applicationState == .background || since != lock.backgrounds { lock.locked = true }
            // Đã vào app trên máy này: các lần mở sau bỏ màn logo đầy đủ (nếu Cài đặt trên máy này chọn "Chỉ lần đầu").
            IntroPrefs.seen = true
            state = .signedIn
            LaunchClock.mark("vao-app")
        } catch let e as API.APIError where e.status == 401 {
            if started == epoch { expired() }
        } catch {
            guard started == epoch else { return }
            notice = error.localizedDescription; state = .signedOut
        }
    }
    @MainActor func expired() {
        epoch += 1
        let had = SessionStore.hasSession || state == .signedIn
        SessionStore.clear(); API.purgeLocal(); me = nil
        if had { notice = "Phiên đã hết hạn, nhập mật khẩu một lần." }
        state = .signedOut
    }
    @MainActor func signedIn(since: Int? = nil) async { notice = nil; await restore(celebrate: true, since: since) }
    /// Đăng xuất / đổi tài khoản: lần mở app sau chạy lại màn logo đầy đủ (như lần đăng nhập đầu trên máy này); bỏ tab, kỳ, POS,
    /// nhóm đơn và đường đi đã nhớ (kế hoạch 1.4), người đăng nhập sau mở app từ mặc định.
    @MainActor func logout() async { epoch += 1; IntroPrefs.seen = false; NavMemory.reset(); await API.logout(); me = nil; notice = nil; state = .signedOut }
    /// "Đổi tài khoản": bỏ phiên và email đã nhớ trên máy này.
    @MainActor func forgetAccount() async {
        epoch += 1
        IntroPrefs.seen = false
        NavMemory.reset()
        if SessionStore.hasSession { await API.logout() } else { API.purgeLocal() }
        SessionStore.lastEmail = nil; notice = nil; state = .signedOut
    }
}
