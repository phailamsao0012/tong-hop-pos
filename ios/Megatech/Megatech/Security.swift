import SwiftUI
import LocalAuthentication

// Bảo mật riêng của app: khoá bằng Face ID / Touch ID, đổi mật khẩu, mã ứng dụng (TOTP), passkey, thiết bị tin cậy.
// Không mở web; mọi thao tác gọi thẳng API và xác nhận ngay trong app.

/// Khoá app: bật thì mỗi lần mở lại app (sau khi ra nền quá số giây đã chọn) phải Face ID mới xem được số liệu.
@Observable final class AppLock {
    var enabled: Bool { didSet { UserDefaults.standard.set(enabled, forKey: "thp_lock") } }
    var graceSeconds: Int { didSet { UserDefaults.standard.set(graceSeconds, forKey: "thp_lock_grace") } }
    var locked = false
    private var backgroundedAt: Date?

    init() {
        enabled = UserDefaults.standard.bool(forKey: "thp_lock")
        let g = UserDefaults.standard.integer(forKey: "thp_lock_grace"); graceSeconds = g == 0 ? 30 : g
        locked = enabled
    }
    static var biometryName: String {
        let c = LAContext(); _ = c.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch c.biometryType { case .faceID: return "Face ID"; case .touchID: return "Touch ID"; case .opticID: return "Optic ID"; default: return "mật khẩu máy" }
    }
    func phaseChanged(_ p: ScenePhase) {
        guard enabled else { return }
        if p == .background { backgroundedAt = .now }
        if p == .active, let t = backgroundedAt, Date.now.timeIntervalSince(t) >= Double(graceSeconds) { locked = true }
    }
    @MainActor func unlock() async -> Bool {
        let ctx = LAContext(); ctx.localizedCancelTitle = "Để sau"
        do {
            let ok = try await ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Mở khoá MEGATECH")
            if ok { locked = false }
            return ok
        } catch { return false }
    }
}

struct LockScreen: View {
    @Environment(AppLock.self) private var lock
    @Environment(AuthModel.self) private var auth
    @State private var failed = false
    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()
            VStack(spacing: 18) {
                Image(systemName: "lock.shield.fill").font(.system(size: 56)).foregroundStyle(Color.brand).symbolEffect(.pulse)
                Text("MEGATECH đang khoá").font(.title3.weight(.bold))
                Text("Xác thực bằng \(AppLock.biometryName) để xem số liệu.").font(.subheadline).foregroundStyle(.secondary)
                Button { Task { failed = !(await lock.unlock()) } } label: { Label("Mở khoá", systemImage: "faceid").frame(maxWidth: 220) }.buttonStyle(.borderedProminent).tint(.brand)
                if failed { Text("Chưa xác thực được, thử lại.").font(.caption).foregroundStyle(Color.bad) }
                Button("Đăng xuất", role: .destructive) { Task { await auth.logout(); lock.locked = false } }.font(.caption)
            }.padding(32)
        }
        .task { failed = !(await lock.unlock()) }
    }
}

// MARK: Màn Bảo mật

struct SecurityView: View {
    @Environment(AuthModel.self) private var auth
    @Environment(AppLock.self) private var lock
    @State private var d: API.Security?
    @State private var error: String?
    @State private var sheet: Sheet?
    @State private var notice: String?
    enum Sheet: String, Identifiable { case password, totpSetup, totpDisable; var id: String { rawValue } }

    var body: some View {
        @Bindable var lock = lock
        List {
            if let error { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
            if let notice { Label(notice, systemImage: "checkmark.circle.fill").foregroundStyle(Color.good).font(.subheadline) }
            Section {
                Toggle(isOn: $lock.enabled) { Label("Khoá app bằng \(AppLock.biometryName)", systemImage: "faceid") }.tint(.brand)
                if lock.enabled {
                    Picker("Khoá lại sau khi rời app", selection: $lock.graceSeconds) { Text("Ngay lập tức").tag(1); Text("30 giây").tag(30); Text("5 phút").tag(300); Text("30 phút").tag(1800) }
                }
            } header: { Text("Bảo vệ trên máy này") } footer: { Text("Chỉ áp dụng cho app trên iPhone này. Người khác cầm máy phải xác thực mới xem được số liệu.") }

            if let d {
                Section {
                    Label(d.mfaEnabled ? "Tài khoản đã bật xác thực 2 lớp" : d.mfaRequired ? "Vai trò của bạn bắt buộc 2 lớp, hãy bật mã ứng dụng" : "Chưa bật xác thực 2 lớp", systemImage: d.mfaEnabled ? "checkmark.shield.fill" : "exclamationmark.shield.fill")
                        .foregroundStyle(d.mfaEnabled ? Color.good : .orange).font(.subheadline.weight(.semibold))
                } header: { Text("Tài khoản") }
                Section("Mật khẩu") {
                    Button { sheet = .password } label: { Label("Đổi mật khẩu", systemImage: "key.fill") }
                }
                Section {
                    if d.totpEnabled {
                        LabeledContent("Mã ứng dụng (Google Authenticator…)", value: "Đã bật")
                        Button(role: .destructive) { sheet = .totpDisable } label: { Label("Tắt mã ứng dụng", systemImage: "xmark.circle") }
                    } else {
                        Button { sheet = .totpSetup } label: { Label("Bật mã ứng dụng", systemImage: "qrcode") }
                    }
                } header: { Text("Xác thực 2 lớp") } footer: { Text("Khi bật, mỗi lần đăng nhập trên máy mới cần mã 6 số từ ứng dụng xác thực. Sau khi bật hoặc tắt, mọi phiên phải đăng nhập lại.") }
                Section {
                    if d.passkeys.isEmpty { Text("Chưa có passkey.").font(.subheadline).foregroundStyle(.secondary) }
                    ForEach(d.passkeys) { k in
                        VStack(alignment: .leading, spacing: 2) { Text(k.name ?? "Passkey").font(.subheadline); Text("Tạo \(Fmt.dateTime(k.created_at))").font(.caption).foregroundStyle(.secondary) }
                            .swipeActions { Button(role: .destructive) { Task { try? await API.removePasskey(id: k.id); await load() } } label: { Label("Gỡ", systemImage: "trash") } }
                    }
                } header: { Text("Passkey · \(d.passkeys.count)") } footer: { Text("Tạo passkey mới trong app cần tài khoản Apple Developer (liên kết tên miền). Hiện có thể gỡ passkey đã tạo; passkey đã có vẫn dùng được khi đăng nhập trên trình duyệt.") }
                Section("Thiết bị đã tin cậy · \(d.devices.count)") {
                    ForEach(d.devices) { dev in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack { Text(short(dev.user_agent)).font(.subheadline.weight(dev.current ? .bold : .regular)).lineLimit(1); if dev.current { Text("thiết bị này").font(.caption2.weight(.semibold)).foregroundStyle(Color.brand) } }
                            Text("Dùng gần nhất \(Fmt.dateTime(dev.last_used_at)) · hết hạn \(Fmt.day(dev.expires_at))").font(.caption).foregroundStyle(.secondary)
                        }
                        .swipeActions { if !dev.current { Button(role: .destructive) { Task { try? await API.removeDevice(id: dev.id); await load() } } label: { Label("Gỡ", systemImage: "trash") } } }
                    }
                    if d.devices.count > 1 {
                        Button(role: .destructive) { Task { for dev in d.devices where !dev.current { try? await API.removeDevice(id: dev.id) }; await load(); notice = "Đã gỡ các thiết bị khác." } } label: { Label("Gỡ mọi thiết bị khác", systemImage: "iphone.slash") }
                    }
                    Text("Vuốt sang trái để gỡ một thiết bị; lần sau đăng nhập trên máy đó phải xác thực lại.").font(.caption2).foregroundStyle(.tertiary)
                }
            } else if error == nil { ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear) }
        }
        .navigationTitle("Bảo mật").navigationBarTitleDisplayMode(.inline)
        .sheet(item: $sheet) { s in
            switch s {
            case .password: PasswordSheet { msg in notice = msg; Task { await relogin() } }
            case .totpSetup: TotpSetupSheet { notice = "Đã bật mã ứng dụng. Đăng nhập lại để tiếp tục."; Task { await relogin() } }
            case .totpDisable: TotpDisableSheet { notice = "Đã tắt mã ứng dụng. Đăng nhập lại để tiếp tục."; Task { await relogin() } }
            }
        }
        .refreshable { await load() }
        .task { await load() }
    }
    /// Máy chủ huỷ phiên sau khi đổi mật khẩu / bật tắt 2 lớp: về màn đăng nhập.
    @MainActor private func relogin() async { try? await Task.sleep(for: .seconds(1.2)); await auth.logout() }
    private func short(_ ua: String?) -> String {
        guard let ua else { return "Thiết bị" }
        if ua.contains("MEGATECH-iOS") { return "App MEGATECH trên iPhone" }
        if ua.contains("iPhone") { return "iPhone · Safari" }
        if ua.contains("Macintosh") { return "Mac · " + (ua.contains("Chrome") ? "Chrome" : "Safari") }
        if ua.contains("Windows") { return "Windows · " + (ua.contains("Edg") ? "Edge" : ua.contains("Chrome") ? "Chrome" : "trình duyệt") }
        if ua.contains("Android") { return "Android" }
        return String(ua.prefix(40))
    }
    @MainActor private func load() async { do { d = try await API.security(); error = nil } catch { self.error = error.localizedDescription } }
}

struct PasswordSheet: View {
    let done: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var current = ""; @State private var next = ""; @State private var again = ""
    @State private var error: String?; @State private var busy = false
    var body: some View {
        NavigationStack {
            Form {
                Section { SecureField("Mật khẩu hiện tại", text: $current).textContentType(.password) }
                Section { SecureField("Mật khẩu mới (từ 8 ký tự)", text: $next).textContentType(.newPassword); SecureField("Nhập lại mật khẩu mới", text: $again).textContentType(.newPassword) }
                if let error { Text(error).font(.caption).foregroundStyle(Color.bad) }
                Section { Text("Sau khi đổi, mọi thiết bị kể cả máy này phải đăng nhập lại.").font(.caption).foregroundStyle(.secondary) }
            }
            .navigationTitle("Đổi mật khẩu").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(busy ? "Đang lưu…" : "Đổi") { Task { await save() } }.disabled(busy || next.count < 8 || next != again || current.isEmpty) }
            }
        }.presentationDetents([.medium])
    }
    @MainActor private func save() async {
        busy = true; defer { busy = false }
        do { _ = try await API.changePassword(current: current, next: next); dismiss(); done("Đã đổi mật khẩu. Đăng nhập lại để tiếp tục.") } catch { self.error = error.localizedDescription }
    }
}

struct TotpSetupSheet: View {
    let done: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var setup: API.TotpSetup?
    @State private var code = ""; @State private var error: String?; @State private var busy = false
    var body: some View {
        NavigationStack {
            Form {
                if let s = setup {
                    Section {
                        Text("1. Mở ứng dụng xác thực (Google Authenticator, Microsoft Authenticator, 1Password…) và thêm tài khoản bằng nút bên dưới hoặc nhập khoá thủ công.").font(.subheadline)
                        if let u = URL(string: s.uri) { Link(destination: u) { Label("Thêm vào ứng dụng xác thực", systemImage: "plus.app.fill") } }
                        HStack { Text(s.secret).font(.system(.footnote, design: .monospaced)).textSelection(.enabled); Spacer(); Button { UIPasteboard.general.string = s.secret } label: { Image(systemName: "doc.on.doc") } }
                    } header: { Text("Khoá bí mật") }
                    Section {
                        TextField("Mã 6 số", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode).font(.title2.monospacedDigit())
                    } header: { Text("2. Nhập mã đang hiện trong ứng dụng") }
                    if let error { Text(error).font(.caption).foregroundStyle(Color.bad) }
                } else if let error { Text(error).foregroundStyle(Color.bad) } else { ProgressView() }
            }
            .navigationTitle("Bật mã ứng dụng").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(busy ? "Đang bật…" : "Bật") { Task { await enable() } }.disabled(busy || code.filter(\.isNumber).count != 6) }
            }
            .task { do { setup = try await API.totpSetup() } catch { self.error = error.localizedDescription } }
        }
    }
    @MainActor private func enable() async {
        busy = true; defer { busy = false }
        do { _ = try await API.totp(action: "enable", code: code.filter(\.isNumber)); dismiss(); done() } catch { self.error = error.localizedDescription }
    }
}

struct TotpDisableSheet: View {
    let done: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""; @State private var error: String?; @State private var busy = false
    var body: some View {
        NavigationStack {
            Form {
                Section { TextField("Mã 6 số từ ứng dụng xác thực", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode).font(.title2.monospacedDigit()) } footer: { Text("Tắt xong, đăng nhập trên máy mới sẽ chỉ cần mật khẩu và mã gửi email. Vai trò bắt buộc 2 lớp sẽ bị chặn cho đến khi bật lại.") }
                if let error { Text(error).font(.caption).foregroundStyle(Color.bad) }
            }
            .navigationTitle("Tắt mã ứng dụng").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(busy ? "Đang tắt…" : "Tắt", role: .destructive) { Task { await disable() } }.disabled(busy || code.filter(\.isNumber).count != 6) }
            }
        }.presentationDetents([.medium])
    }
    @MainActor private func disable() async {
        busy = true; defer { busy = false }
        do { _ = try await API.totp(action: "disable", code: code.filter(\.isNumber)); dismiss(); done() } catch { self.error = error.localizedDescription }
    }
}
