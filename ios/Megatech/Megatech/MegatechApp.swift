import SwiftUI

@main
struct MegatechApp: App {
    @State private var auth = AuthModel()
    var body: some Scene {
        WindowGroup {
            Group {
                switch auth.state {
                case .checking: ProgressView("Đang mở…").tint(.brand)
                case .signedOut: LoginView()
                case .signedIn: RootTabs()
                }
            }
            .environment(auth)
            .task { await auth.restore() }
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

struct RootTabs: View {
    var body: some View {
        TabView {
            DashboardView().tabItem { Label("Tổng quan", systemImage: "chart.bar.xaxis") }
            WebTab(path: "/").tabItem { Label("Web", systemImage: "safari") }
            SettingsView().tabItem { Label("Tài khoản", systemImage: "person.crop.circle") }
        }
        .tint(.brand)
    }
}
