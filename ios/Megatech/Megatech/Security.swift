import SwiftUI
import LocalAuthentication

// Bảo mật riêng của app: khoá bằng Face ID / Touch ID, đổi mật khẩu, mã ứng dụng (TOTP), passkey, thiết bị tin cậy.
// Không mở web; mọi thao tác gọi thẳng API và xác nhận ngay trong app.

/// Khoá app: bật (mặc định) thì mở app phải Face ID mới vào (màn "Chào mừng trở lại"), và ra nền quá thời gian đã chọn
/// (mặc định 2 phút) thì khoá lại: nội dung bị làm mờ cho tới khi mở bằng Face ID.
@Observable final class AppLock {
    var enabled: Bool { didSet { UserDefaults.standard.set(enabled, forKey: "thp_lock") } }
    var graceSeconds: Int { didSet { UserDefaults.standard.set(graceSeconds, forKey: "thp_lock_grace") } }
    var locked = false
    private var backgroundedAt: Date?

    init() {
        // Chưa từng chỉnh → bật sẵn; người đã tắt thì giữ tắt.
        enabled = UserDefaults.standard.object(forKey: "thp_lock") == nil ? true : UserDefaults.standard.bool(forKey: "thp_lock")
        let g = UserDefaults.standard.integer(forKey: "thp_lock_grace"); graceSeconds = g == 0 ? 120 : g
    }
    static var biometryName: String { Biometric.name }
    static let graceOptions: [(Int, String)] = [(1, "Ngay lập tức"), (30, "30 giây"), (120, "2 phút"), (300, "5 phút"), (1800, "30 phút")]
    static func graceLabel(_ s: Int) -> String { graceOptions.first { $0.0 == s }?.1 ?? (s < 60 ? "\(s) giây" : "\(s / 60) phút") }
    func phaseChanged(_ p: ScenePhase) {
        guard enabled else { backgroundedAt = nil; return }
        if p == .background, backgroundedAt == nil { backgroundedAt = .now }
        if p == .active {
            if let t = backgroundedAt, Date.now.timeIntervalSince(t) >= Double(graceSeconds) { locked = true }
            backgroundedAt = nil
        }
    }
    @MainActor func unlock() async -> Bool {
        let ok = await Biometric.verify("Mở khoá MEGATECH")
        if ok { locked = false }
        return ok
    }
}

/// Màn khoá: nền xanh thương hiệu phủ lên nội dung đã làm mờ, "App đang khóa", mở bằng Face ID
/// (dự phòng: mật khẩu MEGATECH hoặc mật mã iPhone). Không bao giờ để lộ màn xám của hệ thống phía sau.
struct LockScreen: View {
    @Environment(AppLock.self) private var lock
    @Environment(AuthModel.self) private var auth
    var body: some View {
        ZStack {
            Brand.gradient.opacity(0.94).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 0) {
                BrandHeader().padding(.top, 24)
                Spacer(minLength: 40)
                VStack(alignment: .leading, spacing: 6) {
                    Text("App đang khóa").font(.system(size: 30, weight: .heavy, design: .rounded)).foregroundStyle(.white)
                    Text(lock.graceSeconds <= 1 ? "Bạn vừa rời app. Số liệu được che cho tới khi mở khóa." : "Rời app quá \(AppLock.graceLabel(lock.graceSeconds)). Số liệu được che cho tới khi mở khóa.").font(.system(size: 13)).foregroundStyle(Brand.mint)
                }.padding(.bottom, 22)
                UnlockControls(reason: "Mở khoá MEGATECH", buttonTitle: "Mở bằng \(Biometric.name)", unlocked: { lock.locked = false }, expired: { lock.locked = false; auth.expired() })
                Button("Đăng xuất") { Task { await auth.logout(); lock.locked = false } }
                    .font(.system(size: 13, weight: .semibold)).foregroundStyle(Color(hex: 0xffb4a8)).frame(maxWidth: .infinity).padding(.top, 14)
            }
            .padding(.horizontal, 24).padding(.bottom, 28)
            .frame(maxWidth: 520)
        }
        .preferredColorScheme(.dark)
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
    enum Sheet: String, Identifiable { case password, totpSetup, totpDisable; var id: String { rawValue } }

    var body: some View {
        @Bindable var lock = lock
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PageTitle(title: "Bảo mật tài khoản", subtitle: "Tài khoản an toàn – Công việc luôn thông suốt")
                if let error { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
                if let notice { Label(notice, systemImage: "checkmark.circle.fill").foregroundStyle(Color.good).font(.system(size: 12, weight: .semibold)).padding(10).background(Color.brandSoft, in: .rect(cornerRadius: 10)) }
                ScanLoginRow()
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
                            VStack(alignment: .leading, spacing: 2) { Text("Khoá app bằng \(AppLock.biometryName)").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink); Text("Mở app và quay lại sau khi rời app phải xác thực; màn đa nhiệm luôn che số liệu").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                            Spacer(); Toggle("", isOn: $lock.enabled).labelsHidden().tint(.good)
                        }
                        if lock.enabled { Divider().padding(.vertical, 6); HStack { Text("Khoá lại sau khi rời app").font(.system(size: 12)).foregroundStyle(Color.ink); Spacer(); Menu { ForEach(AppLock.graceOptions, id: \.0) { v, l in Button(l) { lock.graceSeconds = v } } } label: { SelectBox(text: AppLock.graceLabel(lock.graceSeconds)).frame(width: 130) } } }
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

                    SessionsSection(isOwner: auth.me?.role == "owner", notice: $notice)
                    if !d.devices.isEmpty {
                        SectionHead(title: "Máy tin cậy", action: "\(d.devices.count) máy")
                        Text("Máy đã qua bước hai: đăng nhập lại trên các máy này không hỏi mã email. Gỡ để bắt xác minh lại.").font(.system(size: 10)).foregroundStyle(Color.inkSoft).padding(.top, -6)
                        VStack(spacing: 0) {
                            ForEach(Array(d.devices.prefix(8).enumerated()), id: \.element.id) { i, dev in
                                HStack(spacing: 10) {
                                    Image(systemName: devIcon(dev.user_agent)).font(.system(size: 14)).foregroundStyle(Color.ink).frame(width: 32, height: 32).background(Color.black.opacity(0.05), in: .rect(cornerRadius: 9))
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(short(dev.user_agent) + (dev.current ? " (máy này)" : "")).font(.system(size: 12, weight: dev.current ? .bold : .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                                        Text("Dùng gần nhất \(ago(dev.last_used_at)) · hết hạn \(Fmt.day(dev.expires_at))").font(.system(size: 9)).foregroundStyle(Color.inkSoft)
                                    }
                                    Spacer()
                                    Button { Task { try? await API.removeDevice(id: dev.id); await load() } } label: { Image(systemName: "xmark.circle.fill").font(.system(size: 16)).foregroundStyle(Color.inkSoft) }.buttonStyle(.plain)
                                }.padding(10)
                                if i < min(8, d.devices.count) - 1 { Divider().padding(.leading, 52) }
                            }
                        }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                    }
                    VStack(spacing: 0) {
                        Button { sheet = .password } label: { HStack(spacing: 10) { Image(systemName: "key.fill").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).frame(width: 26); Text("Đổi mật khẩu").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink); Spacer(); Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.inkSoft) }.padding(12).contentShape(.rect) }.buttonStyle(.plain)
                    }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                    HStack(alignment: .top, spacing: 10) { Image(systemName: "checkmark.shield.fill").font(.system(size: 16)).foregroundStyle(Color.good); VStack(alignment: .leading, spacing: 2) { Text("Dữ liệu của bạn được mã hóa và bảo vệ theo tiêu chuẩn quốc tế.").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink); Text("MEGATECH – An tâm để phát triển bền vững.").font(.system(size: 10)).foregroundStyle(Color.inkSoft) } }.padding(12).background(Color.brandSoft, in: .rect(cornerRadius: 12))
                } else if error == nil { Skeleton(height: 70); Skeleton(height: 120); Skeleton(height: 200) }
            }.padding(16)
        }
        .navigationTitle("Bảo mật").navigationBarTitleDisplayMode(.inline).brandNav()
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
                Section { SecureField("Mật khẩu mới (từ 10 ký tự)", text: $next).textContentType(.newPassword); SecureField("Nhập lại mật khẩu mới", text: $again).textContentType(.newPassword) }
                if !next.isEmpty && next.count < 10 { Text("Mật khẩu mới cần ít nhất 10 ký tự.").font(.caption).foregroundStyle(Color.warn) }
                if let error { Text(error).font(.caption).foregroundStyle(Color.bad) }
                Section { Text("Không dùng mật khẩu đã từng bị lộ trên mạng; máy chủ sẽ từ chối nếu phát hiện. Sau khi đổi, mọi thiết bị kể cả máy này phải đăng nhập lại.").font(.caption).foregroundStyle(.secondary) }
            }
            .navigationTitle("Đổi mật khẩu").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(busy ? "Đang lưu…" : "Đổi") { Task { await save() } }.disabled(busy || next.count < 10 || next != again || current.isEmpty) }
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
                } else if let error { Text(error).foregroundStyle(Color.bad) } else { ThinkingLoader(captions: ["Đang tạo khoá bí mật…"]) }
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

// MARK: Thiết bị đang đăng nhập (phiên web / app iPhone / app Android)

struct SessionsSection: View {
    let isOwner: Bool
    @Binding var notice: String?
    @Environment(AuthModel.self) private var auth
    @State private var all = false
    @State private var rows: [API.LoginSession]?
    @State private var error: String?
    @State private var confirmOthers = false
    @State private var revoking: API.LoginSession?
    var body: some View {
        HStack {
            Text("Thiết bị đang đăng nhập").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.ink)
            if let rows { Text("\(rows.count)").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.inkSoft).padding(.horizontal, 6).padding(.vertical, 2).background(Color.black.opacity(0.06), in: .capsule) }
            Spacer()
            if isOwner { Toggle(isOn: $all) { Text("Mọi tài khoản").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.inkSoft) }.toggleStyle(.switch).tint(.good).fixedSize() }
        }
        if let error { Label(error, systemImage: "wifi.exclamationmark").font(.system(size: 12)).foregroundStyle(Color.bad) }
        if let rows {
            if all {
                let groups = Dictionary(grouping: rows, by: \.userId).map { ($0.key, $0.value) }.sorted { ($0.1.first?.name ?? "") < ($1.1.first?.name ?? "") }
                ForEach(groups, id: \.0) { _, list in
                    HStack(spacing: 8) {
                        Avatar(name: list.first?.name ?? "?", size: 24)
                        Text(list.first?.name ?? list.first?.email ?? "Người dùng").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink)
                        Text(list.first?.email ?? "").font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1)
                        Spacer(); Text("\(list.count) máy").font(.system(size: 10, weight: .semibold)).foregroundStyle(Color.inkSoft)
                    }.padding(.top, 4)
                    card(list)
                }
            } else {
                card(rows)
                if rows.contains(where: { !$0.current }) {
                    Button { confirmOthers = true } label: {
                        HStack(spacing: 8) { Image(systemName: "rectangle.portrait.and.arrow.right"); Text("Đăng xuất mọi máy khác") }
                            .font(.system(size: 13, weight: .bold)).foregroundStyle(Color.bad).frame(maxWidth: .infinity).padding(.vertical, 11)
                            .background(Color.card, in: .rect(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.bad.opacity(0.35)))
                    }.buttonStyle(.plain)
                }
            }
        } else if error == nil { Skeleton(height: 150) }
        Color.clear.frame(height: 0)
            .task(id: all) { await load() }
            .confirmationDialog("Đăng xuất mọi máy khác? Các máy đó phải đăng nhập lại.", isPresented: $confirmOthers, titleVisibility: .visible) {
                Button("Đăng xuất mọi máy khác", role: .destructive) { Task { do { try await API.revokeOtherSessions(); notice = "Đã đăng xuất mọi máy khác." } catch { self.error = error.localizedDescription }; await load() } }
            }
            .confirmationDialog(revoking.map { "Đăng xuất \($0.device)?" } ?? "", isPresented: Binding(get: { revoking != nil }, set: { if !$0 { revoking = nil } }), titleVisibility: .visible) {
                Button("Đăng xuất máy đó", role: .destructive) { if let r = revoking { Task { await revoke(r) } } }
            }
    }
    private func card(_ list: [API.LoginSession]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(list.enumerated()), id: \.element.id) { i, s in
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: icon(s)).font(.system(size: 15, weight: .semibold)).foregroundStyle(s.current ? Color.good : Color.ink).frame(width: 36, height: 36)
                        .background((s.current ? Color.good : Color.black).opacity(s.current ? 0.12 : 0.05), in: .rect(cornerRadius: 10))
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            Text(s.device).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                            if s.current { Tag(text: "Máy này", tone: .green) }
                        }
                        if let m = s.methodLabel { Tag(text: m, tone: .gray) }
                        Text([s.place, s.ip, "lần cuối " + (Ago.text(s.lastSeenAt) ?? "—")].compactMap { $0 }.joined(separator: " · ")).font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(2)
                    }
                    Spacer(minLength: 4)
                    if !s.current {
                        Button { revoking = s } label: { Text("Đăng xuất").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.bad).padding(.horizontal, 9).padding(.vertical, 6).background(Color.bad.opacity(0.08), in: .capsule) }.buttonStyle(.plain)
                    }
                }.padding(12)
                if i < list.count - 1 { Divider().padding(.leading, 58) }
            }
            if list.isEmpty { Text("Không có phiên nào.").font(.system(size: 12)).foregroundStyle(Color.inkSoft).padding(12) }
        }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
    }
    private func icon(_ s: API.LoginSession) -> String {
        switch s.client {
        case "ios": return "iphone"
        case "android": return "smartphone"
        default: let d = s.device.lowercased(); return d.contains("iphone") || d.contains("android") ? "iphone" : d.contains("mac") ? "laptopcomputer" : "desktopcomputer"
        }
    }
    @MainActor private func revoke(_ s: API.LoginSession) async {
        revoking = nil
        do { try await API.revokeSession(id: s.id); notice = "Đã đăng xuất \(s.device)." } catch { self.error = error.localizedDescription }
        await load()
    }
    @MainActor private func load() async {
        do { rows = try await API.sessions(all: all && isOwner); error = nil } catch { self.error = error.localizedDescription }
    }
}
