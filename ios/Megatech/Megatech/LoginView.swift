import SwiftUI

// Màn đăng nhập (mẫu duyệt 25/09/2026): nền xanh đậm, "Chào mừng trở lại" khi đã từng đăng nhập,
// mở phiên đã lưu bằng Face ID; form email + mật khẩu; bước hai bằng mã ứng dụng / mã email / duyệt trên app khác.
struct LoginView: View {
    @Environment(AuthModel.self) private var auth
    enum Mode: Equatable { case welcome, form, code, approve }
    @State private var mode: Mode = .form
    @State private var email = ""
    @State private var password = ""
    @State private var remember = true
    @State private var code = ""
    @State private var step: API.LoginStep?
    @State private var busy = false
    @State private var error: String?
    @State private var lastEmail: String?
    @State private var saved = false
    @State private var pollStatus = "pending"
    @State private var remaining = 0
    @FocusState private var focus: Field?
    enum Field { case email, password, code }

    private static let lime = Color(hex: 0xd9f36d), limeInk = Color(hex: 0x14372d), mint = Color(hex: 0xa7c6b3)

    var body: some View {
        ZStack {
            Brand.gradient.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    BrandHeader().padding(.top, 24)
                    Spacer(minLength: 40)
                    header.padding(.bottom, 22)
                    switch mode {
                    case .welcome: welcome
                    case .form: form
                    case .code: codeStep
                    case .approve: approveStep
                    }
                    if let error { Label(error, systemImage: "exclamationmark.triangle.fill").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color(hex: 0xffb4a8)).padding(.top, 14) }
                }
                .padding(.horizontal, 24).padding(.bottom, 28)
                .frame(maxWidth: 520, minHeight: UIScreen.main.bounds.height - 90, alignment: .top)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .preferredColorScheme(.dark)
        .onAppear {
            lastEmail = SessionStore.lastEmail; saved = SessionStore.hasSession
            if email.isEmpty { email = lastEmail ?? "" }
            if let n = auth.notice { error = n }
            mode = saved ? .welcome : .form
        }
    }

    // MARK: Phần đầu: tiêu đề + email đã che
    @ViewBuilder private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 30, weight: .heavy, design: .rounded)).foregroundStyle(.white).fixedSize(horizontal: false, vertical: true)
            if mode == .welcome || mode == .form, let e = lastEmail, !e.isEmpty {
                HStack(spacing: 4) {
                    Text(SessionStore.mask(e)).foregroundStyle(Self.mint)
                    Text("·").foregroundStyle(Self.mint)
                    Button("đổi tài khoản") { Task { await auth.forgetAccount(); lastEmail = nil; saved = false; email = ""; password = ""; error = nil; mode = .form } }
                        .underline().foregroundStyle(.white)
                }.font(.system(size: 13))
            } else if mode == .code, let s = step {
                Text(s.step == "totp" ? "Nhập mã 6 số trong ứng dụng xác thực." : "Nhập mã 6 số đã gửi tới \(s.to ?? "email")\(s.minutes.map { " (hiệu lực \($0) phút)" } ?? "").").font(.system(size: 13)).foregroundStyle(Self.mint)
            } else if mode == .approve {
                Text("Mở app MEGATECH trên điện thoại kia và chọn số bên dưới.").font(.system(size: 13)).foregroundStyle(Self.mint)
            } else {
                Text("Tổng hợp POS · CSKH & Sale").font(.system(size: 13)).foregroundStyle(Self.mint)
            }
        }
    }
    private var title: String {
        switch mode {
        case .code: return "Xác minh 2 lớp"
        case .approve: return "Duyệt trên điện thoại"
        default: return mode == .welcome || lastEmail?.isEmpty == false ? "Chào mừng\ntrở lại" : "Đăng nhập"
        }
    }

    // MARK: Face ID (phiên đã lưu)
    private var welcome: some View {
        VStack(spacing: 14) {
            UnlockControls(reason: "Đăng nhập MEGATECH", autoStart: auth.notice == nil, unlocked: {
                await auth.restore()
                if auth.state != .signedIn { sessionGone() }
            }, expired: { auth.expired(); sessionGone() })
            outline("Dùng email và mật khẩu") { error = nil; mode = .form }
        }
    }
    /// Phiên lưu không còn dùng được → form mật khẩu kèm lời nhắn.
    private func sessionGone() {
        saved = SessionStore.hasSession
        if !saved { error = auth.notice ?? "Phiên đã hết hạn, nhập mật khẩu một lần."; mode = .form }
        else if let n = auth.notice { error = n }
    }

    // MARK: Email + mật khẩu
    private var form: some View {
        VStack(spacing: 12) {
            field {
                TextField("", text: $email, prompt: Text("Email").foregroundStyle(.white.opacity(0.45)))
                    .textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .focused($focus, equals: .email).submitLabel(.next).onSubmit { focus = .password }
            }
            field {
                SecureField("", text: $password, prompt: Text("Mật khẩu").foregroundStyle(.white.opacity(0.45)))
                    .textContentType(.password).focused($focus, equals: .password).submitLabel(.go).onSubmit { Task { await submit() } }
            }
            Toggle(isOn: $remember) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Nhớ máy này").font(.system(size: 14, weight: .semibold)).foregroundStyle(.white)
                    Text("Lần sau mở bằng \(Biometric.name), không cần mật khẩu").font(.system(size: 11)).foregroundStyle(Self.mint)
                }
            }.tint(Self.lime).padding(.horizontal, 4).padding(.top, 2)
            primary("Đăng nhập", disabled: email.isEmpty || password.isEmpty) { await submit() }.padding(.top, 8)
            if saved { outline("Dùng \(Biometric.name)") { error = nil; mode = .welcome } }
        }
    }

    // MARK: Mã 6 số
    private var codeStep: some View {
        VStack(spacing: 12) {
            field {
                TextField("", text: $code, prompt: Text("Mã 6 số").foregroundStyle(.white.opacity(0.45)))
                    .keyboardType(.numberPad).textContentType(.oneTimeCode).font(.system(size: 22, weight: .bold, design: .rounded).monospacedDigit())
                    .focused($focus, equals: .code)
            }
            primary("Xác minh", disabled: code.filter(\.isNumber).count < 6) { await verify() }
            outline("Đăng nhập lại") { back() }
        }
        .onAppear { focus = .code }
    }

    // MARK: Duyệt trên app khác
    private var approveStep: some View {
        VStack(spacing: 16) {
            if let n = step?.number {
                VStack(spacing: 10) {
                    Text("\(n)").font(.system(size: 64, weight: .heavy, design: .rounded)).monospacedDigit().foregroundStyle(Self.limeInk)
                        .frame(width: 128, height: 128).background(Self.lime, in: .rect(cornerRadius: 30))
                        .thinkingGlow(pollStatus == "pending", radius: 30).padding(.vertical, 6)
                    HStack(spacing: 8) {
                        Text(pollStatus == "denied" ? "Yêu cầu bị từ chối" : remaining > 0 ? "Đang chờ duyệt · còn \(remaining / 60):\(String(format: "%02d", remaining % 60))" : "Đang chờ duyệt…").font(.system(size: 13)).foregroundStyle(Self.mint).monospacedDigit()
                    }
                }.frame(maxWidth: .infinity).padding(.vertical, 8)
            }
            Text("Trên app đang đăng nhập (iPhone hoặc Android), một bảng \"Có người đang đăng nhập?\" sẽ hiện ra. Chọn đúng số này rồi xác nhận.").font(.system(size: 12)).foregroundStyle(Self.mint).multilineTextAlignment(.center)
            Spacer(minLength: 16)
            if step?.fallback == "totp", step?.challengeId != nil {
                outline("Nhập mã ứng dụng xác thực") { step = API.LoginStep(step: "totp", challengeId: step?.challengeId, to: nil, minutes: nil, requestId: nil, pollToken: nil, number: nil, seconds: nil, fallback: nil); code = ""; mode = .code }
            } else if step?.fallback == "otp" {
                outline("Nhận mã qua email") { Task { await emailFallback() } }
            }
            outline("Đăng nhập lại") { back() }
        }
        .task(id: step?.requestId) { await poll() }
    }

    // MARK: Thành phần
    private func field<C: View>(@ViewBuilder _ c: () -> C) -> some View {
        c().font(.system(size: 16)).foregroundStyle(.white).tint(Self.lime)
            .padding(.horizontal, 16).padding(.vertical, 15)
            .background(.white.opacity(0.08), in: .rect(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(.white.opacity(0.14)))
    }
    private func primary(_ title: String, disabled: Bool, _ action: @escaping () async -> Void) -> some View {
        Button { Task { await action() } } label: {
            Text(busy ? "Đang xử lý…" : title)
                .font(.system(size: 16, weight: .bold)).foregroundStyle(Self.limeInk).frame(maxWidth: .infinity).padding(.vertical, 15)
                .background(Self.lime.opacity(disabled ? 0.45 : 1), in: .rect(cornerRadius: 14)).thinkingGlow(busy, radius: 14)
        }.buttonStyle(.plain).disabled(busy || disabled)
    }
    private func outline(_ title: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(.white).frame(maxWidth: .infinity).padding(.vertical, 14)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(.white.opacity(0.35), lineWidth: 1.2))
        }.buttonStyle(.plain).disabled(busy)
    }

    // MARK: Hành động
    private func back() { step = nil; code = ""; error = nil; pollStatus = "pending"; mode = .form }

    @MainActor private func submit() async {
        busy = true; error = nil
        defer { busy = false }
        do {
            let e = email.trimmingCharacters(in: .whitespaces)
            let s = try await API.login(email: e, password: password, remember: remember)
            SessionStore.lastEmail = e
            await handle(s)
        } catch { self.error = error.localizedDescription }
    }
    @MainActor private func verify() async {
        guard let s = step else { return }
        busy = true; error = nil
        defer { busy = false }
        do { await handle(try await API.verify(challengeId: s.challengeId ?? "", code: code.filter(\.isNumber), kind: s.step == "totp" ? "totp" : "otp")) }
        catch { self.error = error.localizedDescription }
    }
    @MainActor private func handle(_ s: API.LoginStep) async {
        switch s.step {
        case "done": password = ""; await auth.signedIn(); if auth.state != .signedIn { error = auth.notice ?? "Không mở được phiên, đăng nhập lại." }
        case "approve": step = s; pollStatus = "pending"; remaining = s.seconds ?? 0; mode = .approve
        default: step = s; code = ""; mode = .code
        }
    }
    @MainActor private func emailFallback() async {
        guard let id = step?.requestId, let t = step?.pollToken else { return }
        busy = true; error = nil
        defer { busy = false }
        do { let s = try await API.loginByEmail(id: id, pollToken: t); step = s; code = ""; mode = .code }
        catch { self.error = error.localizedDescription }
    }
    /// Hỏi máy chủ mỗi 2 giây xem app kia đã duyệt chưa.
    @MainActor private func poll() async {
        guard mode == .approve, let id = step?.requestId, let t = step?.pollToken else { return }
        let deadline = Date.now.addingTimeInterval(Double(step?.seconds ?? 180))
        while !Task.isCancelled && mode == .approve {
            remaining = max(0, Int(deadline.timeIntervalSinceNow))
            if let r = try? await API.pollLogin(id: id, pollToken: t) {
                pollStatus = r.status
                switch r.status {
                case "done": await auth.signedIn(); if auth.state != .signedIn { back(); error = auth.notice ?? "Không mở được phiên, đăng nhập lại." }; return
                case "denied": error = "Yêu cầu bị từ chối."; return
                case "expired", "invalid", "consumed": back(); error = "Yêu cầu đã hết hạn, đăng nhập lại."; return
                default: break
                }
            }
            for _ in 0..<2 where !Task.isCancelled { try? await Task.sleep(for: .seconds(1)); remaining = max(0, Int(deadline.timeIntervalSinceNow)) }
        }
    }
}
