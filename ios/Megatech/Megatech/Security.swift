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

// MARK: Màn Bảo mật (ảnh 7.3)

struct SecurityView: View {
    @Environment(AuthModel.self) private var auth
    @Environment(AppLock.self) private var lock
    @State private var d: API.Security?
    @State private var error: String?
    @State private var sheet: Sheet?
    @State private var notice: String?
    @State private var confirmLogoutOthers = false
    enum Sheet: String, Identifiable { case password, totpSetup, totpDisable; var id: String { rawValue } }

    var body: some View {
        @Bindable var lock = lock
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PageTitle(title: "Bảo mật tài khoản", subtitle: "Tài khoản an toàn – Công việc luôn thông suốt")
                if let error { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
                if let notice { Label(notice, systemImage: "checkmark.circle.fill").foregroundStyle(Color.good).font(.system(size: 12, weight: .semibold)).padding(10).background(Color.brandSoft, in: .rect(cornerRadius: 10)) }
                if let d {
                    let ok = d.mfaEnabled
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: ok ? "checkmark.shield.fill" : "exclamationmark.shield.fill").font(.system(size: 18, weight: .bold)).foregroundStyle(.white).frame(width: 40, height: 40).background(ok ? Color.good : Color.warn, in: .circle)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(ok ? "Tài khoản của bạn đang được bảo vệ tốt" : d.mfaRequired ? "Vai trò của bạn bắt buộc bật xác thực 2 bước" : "Tài khoản chưa bật xác thực 2 bước").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink)
                            Text(ok ? "Tiếp tục duy trì các cài đặt bảo mật để giữ an toàn dữ liệu của doanh nghiệp." : "Bật mã ứng dụng bên dưới; mỗi lần đăng nhập máy mới cần thêm mã 6 số.").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                        }
                    }.padding(12).background((ok ? Color.good : Color.warn).opacity(0.1), in: .rect(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke((ok ? Color.good : Color.warn).opacity(0.25)))

                    Text("Bảo vệ trên máy này").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink)
                    Panel(padding: 12) {
                        HStack(spacing: 10) {
                            Image(systemName: "faceid").font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.blue).frame(width: 34, height: 34).background(Color.blue.opacity(0.12), in: .rect(cornerRadius: 9))
                            VStack(alignment: .leading, spacing: 2) { Text("Khoá app bằng \(AppLock.biometryName)").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink); Text("Người khác cầm máy phải xác thực mới xem được số liệu").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                            Spacer(); Toggle("", isOn: $lock.enabled).labelsHidden().tint(.good)
                        }
                        if lock.enabled { Divider().padding(.vertical, 6); HStack { Text("Khoá lại sau khi rời app").font(.system(size: 12)).foregroundStyle(Color.ink); Spacer(); Menu { Button("Ngay lập tức") { lock.graceSeconds = 1 }; Button("30 giây") { lock.graceSeconds = 30 }; Button("5 phút") { lock.graceSeconds = 300 }; Button("30 phút") { lock.graceSeconds = 1800 } } label: { SelectBox(text: lock.graceSeconds <= 1 ? "Ngay lập tức" : lock.graceSeconds < 60 ? "\(lock.graceSeconds) giây" : "\(lock.graceSeconds / 60) phút").frame(width: 130) } } }
                    }

                    Text("Phương thức đăng nhập").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink)
                    VStack(spacing: 0) {
                        MethodRow(icon: "faceid", tint: .blue, title: "Passkey (Face ID)", sub: d.passkeys.isEmpty ? "Chưa có passkey nào" : "\(d.passkeys.count) passkey · gỡ ở mục dưới", on: !d.passkeys.isEmpty)
                        Divider().padding(.leading, 56)
                        Button { sheet = d.totpEnabled ? .totpDisable : .totpSetup } label: { MethodRow(icon: "lock.fill", tint: .good, title: "Xác thực 2 bước (2FA)", sub: d.totpEnabled ? "Mã ứng dụng đang bật · chạm để tắt" : "Bảo vệ tài khoản bằng mã xác thực · chạm để bật", on: d.totpEnabled) }.buttonStyle(.plain)
                    }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                    if !d.passkeys.isEmpty {
                        Panel(padding: 12) {
                            Text("Passkey đã đăng ký").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink)
                            ForEach(d.passkeys) { k in HStack { VStack(alignment: .leading, spacing: 1) { Text(k.name ?? "Passkey").font(.system(size: 12)); Text("Tạo \(Fmt.dateTime(k.created_at))").font(.system(size: 9)).foregroundStyle(Color.inkSoft) }; Spacer(); Button(role: .destructive) { Task { try? await API.removePasskey(id: k.id); await load() } } label: { Image(systemName: "trash").font(.system(size: 12)).foregroundStyle(Color.bad) } }.padding(.vertical, 4) }
                            Text("Tạo passkey mới trong app cần tài khoản Apple Developer (liên kết tên miền).").font(.system(size: 9)).foregroundStyle(Color.inkSoft)
                        }
                    }

                    SectionHead(title: "Phiên đăng nhập đang hoạt động", action: "\(d.devices.count) thiết bị")
                    VStack(spacing: 0) {
                        ForEach(Array(d.devices.prefix(8).enumerated()), id: \.element.id) { i, dev in
                            HStack(spacing: 10) {
                                Image(systemName: devIcon(dev.user_agent)).font(.system(size: 15)).foregroundStyle(Color.ink).frame(width: 34, height: 34).background(Color.black.opacity(0.05), in: .rect(cornerRadius: 9))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(short(dev.user_agent) + (dev.current ? " (thiết bị hiện tại)" : "")).font(.system(size: 12, weight: dev.current ? .bold : .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                                    HStack(spacing: 4) { Circle().fill(dev.current ? Color.good : Color.warn).frame(width: 6, height: 6); Text(dev.current ? "Đang hoạt động" : "Dùng gần nhất \(ago(dev.last_used_at))").font(.system(size: 10, weight: .semibold)).foregroundStyle(dev.current ? Color.good : Color.warn) }
                                    Text("Hết hạn \(Fmt.day(dev.expires_at)) · \(Fmt.dateTime(dev.last_used_at))").font(.system(size: 9)).foregroundStyle(Color.inkSoft)
                                }
                                Spacer()
                                if !dev.current { Button { Task { try? await API.removeDevice(id: dev.id); await load() } } label: { Image(systemName: "xmark.circle.fill").font(.system(size: 16)).foregroundStyle(Color.inkSoft) }.buttonStyle(.plain) }
                            }.padding(12)
                            if i < min(8, d.devices.count) - 1 { Divider().padding(.leading, 56) }
                        }
                    }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                    VStack(spacing: 0) {
                        Button { sheet = .password } label: { HStack(spacing: 10) { Image(systemName: "key.fill").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).frame(width: 26); Text("Đổi mật khẩu").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink); Spacer(); Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.inkSoft) }.padding(12).contentShape(.rect) }.buttonStyle(.plain)
                        Divider().padding(.leading, 48)
                        Button { confirmLogoutOthers = true } label: { HStack(spacing: 10) { Image(systemName: "rectangle.portrait.and.arrow.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.bad).frame(width: 26); Text("Đăng xuất khỏi các thiết bị khác").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink); Spacer(); Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.inkSoft) }.padding(12).contentShape(.rect) }.buttonStyle(.plain).disabled(d.devices.count <= 1)
                    }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                    HStack(alignment: .top, spacing: 10) { Image(systemName: "checkmark.shield.fill").font(.system(size: 16)).foregroundStyle(Color.good); VStack(alignment: .leading, spacing: 2) { Text("Dữ liệu của bạn được mã hóa và bảo vệ theo tiêu chuẩn quốc tế.").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink); Text("MEGATECH – An tâm để phát triển bền vững.").font(.system(size: 10)).foregroundStyle(Color.inkSoft) } }.padding(12).background(Color.brandSoft, in: .rect(cornerRadius: 12))
                } else if error == nil { Skeleton(height: 70); Skeleton(height: 120); Skeleton(height: 200) }
            }.padding(16)
        }
        .navigationTitle("Bảo mật").navigationBarTitleDisplayMode(.inline).brandNav()
        .confirmationDialog("Đăng xuất khỏi mọi thiết bị khác? Lần sau đăng nhập trên các máy đó phải xác thực lại.", isPresented: $confirmLogoutOthers, titleVisibility: .visible) {
            Button("Đăng xuất thiết bị khác", role: .destructive) { Task { for dev in d?.devices ?? [] where !dev.current { try? await API.removeDevice(id: dev.id) }; await load(); notice = "Đã gỡ các thiết bị khác." } }
        }
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
    @MainActor private func relogin() async { try? await Task.sleep(for: .seconds(1.2)); await auth.logout() }
    private func ago(_ iso: String?) -> String { guard let iso, let d = Fmt.parseISO(iso) else { return "—" }; let m = Int(Date.now.timeIntervalSince(d) / 60); return m < 60 ? "\(max(1, m)) phút trước" : m < 1440 ? "\(m / 60) giờ trước" : "\(m / 1440) ngày trước" }
    private func devIcon(_ ua: String?) -> String { guard let ua else { return "desktopcomputer" }; return ua.contains("iPhone") || ua.contains("MEGATECH-iOS") ? "iphone" : ua.contains("Macintosh") ? "laptopcomputer" : ua.contains("Android") ? "smartphone" : "desktopcomputer" }
    private func short(_ ua: String?) -> String {
        guard let ua else { return "Thiết bị" }
        if ua.contains("MEGATECH-iOS") { return "iPhone · App MEGATECH" }
        if ua.contains("iPhone") { return "iPhone · Safari" }
        if ua.contains("Macintosh") { return "MacBook · " + (ua.contains("Chrome") ? "Chrome" : "Safari") }
        if ua.contains("Windows") { return (ua.contains("Edg") ? "Edge" : ua.contains("Chrome") ? "Chrome" : "Trình duyệt") + " – Windows" }
        if ua.contains("Android") { return "Android" }
        return String(ua.prefix(40))
    }
    @MainActor private func load() async { do { d = try await API.security(); error = nil } catch { self.error = error.localizedDescription } }
}

struct MethodRow: View {
    let icon: String; let tint: Color; let title: String; let sub: String; let on: Bool
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon).font(.system(size: 15, weight: .semibold)).foregroundStyle(tint).frame(width: 34, height: 34).background(tint.opacity(0.12), in: .rect(cornerRadius: 9))
            VStack(alignment: .leading, spacing: 2) { Text(title).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink); Text(sub).font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1) }
            Spacer(); Tag(text: on ? "Đã bật" : "Chưa bật", tone: on ? .green : .gray); Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.inkSoft)
        }.padding(12).contentShape(.rect)
    }
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
