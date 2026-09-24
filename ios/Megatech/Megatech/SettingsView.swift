import SwiftUI

struct SettingsView: View {
    @Environment(AuthModel.self) private var auth
    var body: some View {
        NavigationStack {
            List {
                if let me = auth.me {
                    Section("Tài khoản") {
                        LabeledContent("Tên", value: me.displayName)
                        LabeledContent("Email", value: me.email)
                        LabeledContent("Vai trò", value: me.title?.isEmpty == false ? me.title! : me.role)
                    }
                }
                Section { Button("Đăng xuất", role: .destructive) { Task { await auth.logout() } } }
                Section { LabeledContent("Phiên bản", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—") }
            }
            .navigationTitle("Tài khoản")
        }
    }
}
