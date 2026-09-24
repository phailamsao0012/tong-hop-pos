import SwiftUI

@main
struct MegatechApp: App {
    @State private var auth = AuthModel()
    @State private var lock = AppLock()
    @State private var sync = SyncStatus()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            ZStack {
                Group {
                    switch auth.state {
                    case .checking: ProgressView("Đang mở…").tint(.brand)
                    case .signedOut: LoginView()
                    case .signedIn: RootTabs()
                    }
                }
                if lock.locked && auth.state == .signedIn { LockScreen().transition(.opacity) }
            }
            .animation(.easeInOut(duration: 0.25), value: lock.locked)
            .environment(auth)
            .environment(lock)
            .environment(sync)
            .task { await auth.restore() }
            .onChange(of: phase) { _, p in lock.phaseChanged(p) }
        }
    }
}

@Observable final class AuthModel {
    enum State { case checking, signedOut, signedIn }
    var state: State = .checking
    var me: API.Me?

    @MainActor func restore() async {
        do { me = try await API.me(); state = .signedIn } catch { state = .signedOut }
    }
    @MainActor func signedIn() async { await restore() }
    @MainActor func logout() async { await API.logout(); me = nil; state = .signedOut }
}

