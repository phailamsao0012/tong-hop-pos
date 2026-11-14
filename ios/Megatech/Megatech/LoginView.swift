import SwiftUI

// Màn đăng nhập (mẫu duyệt 25/09/2026): "Chào mừng trở lại" khi đã từng đăng nhập, mở phiên đã lưu bằng Face ID;
// form email + mật khẩu; bước hai bằng mã ứng dụng / mã email / duyệt trên app khác.
// 09/10/2026: giao diện như trang đăng nhập web (LoginShell): sau màn mở đầu logo, linh vật logo đứng trên thẻ và phản ứng
// theo thao tác (nhìn theo email, nhắm mắt khi gõ mật khẩu, hé mắt khi hiện mật khẩu, vui khi vào được, buồn khi sai).
struct LoginView: View {
    @Environment(AuthModel.self) private var auth
    @Environment(IntroState.self) private var intro
    @Environment(AppLock.self) private var lock
    @Environment(\.scenePhase) private var phase
    @Environment(\.dynamicTypeSize) private var typeSize
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
    @State private var showPassword = false
    @State private var feel: MascotMood?
    @State private var unlockTyping = false
    @State private var shakes = 0
    /// Số lần app vào nền lúc bấm đăng nhập: đăng nhập xong sau khi đã rời app thì vào app ở trạng thái khoá.
    @State private var loginSince: Int?
    @FocusState private var focus: Field?
    enum Field { case email, password, code }

    private static let lime = Color.mtBrandPrimary, limeInk = Palette.onFill, mint = Color.mtTextSecondary
    private var responsiveLayout: AnyLayout {
        typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 8)) : AnyLayout(HStackLayout(spacing: 8))
    }

    var body: some View {
        LoginShell(mood: mood, gaze: gaze, shake: shakes, themed: mode != .welcome) {
            header.padding(.bottom, 4)
            switch mode {
            case .welcome: welcome
            case .form: form
            case .code: codeStep
            case .approve: approveStep
            }
            if let error, mode != .code {
                Label(error, systemImage: "exclamationmark.triangle.fill").mtFont(.cardHeader).foregroundStyle(Color.mtDangerInk)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if mode == .welcome || mode == .form {
                Link("Chính sách bảo mật", destination: API.privacyURL).mtFont(.caption).underline().foregroundStyle(Self.mint).frame(maxWidth: .infinity)
            }
        }
        .onAppear {
            lastEmail = SessionStore.lastEmail; saved = SessionStore.hasSession
            if email.isEmpty { email = lastEmail ?? "" }
            if let n = auth.notice { error = n }
            mode = saved ? .welcome : .form
        }
        // Linh vật buồn + thẻ rung chỉ khi người dùng vừa làm sai, không phải khi mở màn có sẵn lời nhắn (phiên hết hạn).
        .onChange(of: error) { _, e in if let e, e != auth.notice { upset() } }
    }

    // MARK: Linh vật
    private var mood: MascotMood {
        if auth.celebrating { return .happy }
        if let feel { return feel }
        switch focus {
        case .password: return showPassword ? .peek : .cover
        case .email, .code: return .watch
        case nil: return unlockTyping ? .cover : .idle
        }
    }
    /// Cả nhà nhìn xuống ô đang gõ, đầu quay theo độ dài chữ.
    private var gaze: CGPoint {
        switch focus {
        case .email: return CGPoint(x: -0.8 + 1.6 * min(1, Double(email.count) / 26), y: 0.8)
        case .code: return CGPoint(x: -0.7 + 1.4 * Double(min(code.count, 6)) / 6, y: 0.8)
        default: return .zero
        }
    }
    /// Sai: linh vật cúi đầu lắc, thẻ rung.
    private func upset() {
        feel = .sad; shakes += 1
        Task { try? await Task.sleep(for: .seconds(1.6)); if feel == .sad { feel = nil } }
    }

    // MARK: Phần đầu: tiêu đề + email đã che
    @ViewBuilder private var header: some View {
        VStack(spacing: 6) {
            Text(title).font(.title.bold()).foregroundStyle(Color.mtTextPrimary)
            if mode == .welcome || mode == .form {
                Text(lastEmail?.isEmpty == false ? "Chào mừng trở lại. Cả nông trại Megatech đang chờ bạn." : "Đăng nhập để vào nông trại Megatech.")
                    .mtFont(.body).foregroundStyle(Self.mint)
                if let e = lastEmail, !e.isEmpty {
                    responsiveLayout {
                        Text(SessionStore.mask(e)).foregroundStyle(Self.mint)
                        Text("·").foregroundStyle(Self.mint)
                        Button("đổi tài khoản") { Task { await auth.forgetAccount(); lastEmail = nil; saved = false; email = ""; password = ""; error = nil; mode = .form } }
                            .underline().foregroundStyle(Color.mtTextPrimary).frame(minHeight: 44)
                    }.mtFont(.body)
                }
            } else if mode == .code, let s = step {
                Text(s.step == "totp" ? "Nhập mã 6 số trong ứng dụng xác thực." : "Nhập mã 6 số đã gửi tới \(s.to ?? "email")\(s.minutes.map { " (hiệu lực \($0) phút)" } ?? "").").mtFont(.body).foregroundStyle(Self.mint)
            } else if mode == .approve {
                Text("Mở app MEGATECH trên điện thoại kia và chọn số bên dưới.").mtFont(.body).foregroundStyle(Self.mint)
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
    }
    private var title: String {
        switch mode {
        case .code: return "Xác minh 2 lớp"
        case .approve: return "Duyệt trên điện thoại"
        default: return "MEGATECH"
        }
    }

    // MARK: Face ID (phiên đã lưu)
    private var welcome: some View {
        VStack(spacing: 14) {
            // Hỏi Face ID ngay khi màn mở đầu xong (hoặc ngay khi mở app nếu lần này bỏ màn logo) và app đang mở trên màn hình
            // (không chồng hộp Face ID lên hiệu ứng). Trong lúc hộp Face ID đang hiện, tải trước phiên và số của tab đầu (warmUp).
            UnlockControls(reason: "Đăng nhập MEGATECH", autoStart: auth.notice == nil && intro.stage == .done && phase == .active, warmUp: true, unlocked: {
                await auth.restore(celebrate: true)
                if auth.state != .signedIn { sessionGone() }
            }, expired: { auth.expired(); sessionGone() }, onEvent: { e in
                switch e {
                case .typing(let on): unlockTyping = on
                case .failed: upset()
                }
            })
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
        // Khung 19A: nhãn Email / Mật khẩu trên ô, "Nhớ máy này" một dòng, nút Đăng nhập; linh vật và Face ID giữ như cũ.
        VStack(alignment: .leading, spacing: 12) {
            if let e = lastEmail, !e.isEmpty { Text("Tài khoản đã nhớ · \(SessionStore.mask(e))").mtFont(.caption).foregroundStyle(Self.mint) }
            label("Email")
            field {
                TextField("", text: $email, prompt: Text("Email công ty").foregroundStyle(Color.mtTextSecondary))
                    .textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .focused($focus, equals: .email).submitLabel(.next).onSubmit { focus = .password }
            }
            label("Mật khẩu")
            field {
                HStack(spacing: 8) {
                    Group {
                        if showPassword {
                            TextField("", text: $password, prompt: Text("Nhập mật khẩu").foregroundStyle(Color.mtTextSecondary))
                                .textInputAutocapitalization(.never).autocorrectionDisabled()
                        } else {
                            SecureField("", text: $password, prompt: Text("Nhập mật khẩu").foregroundStyle(Color.mtTextSecondary))
                        }
                    }
                    .textContentType(.password).focused($focus, equals: .password).submitLabel(.go).onSubmit { Task { await submit() } }
                    // Hiện / ẩn mật khẩu (linh vật hé một mắt khi đang hiện).
                    Button {
                        let typing = focus == .password
                        showPassword.toggle()
                        if typing { Task { @MainActor in focus = .password } }
                    } label: {
                        Image(systemName: showPassword ? "eye.slash" : "eye").mtFont(.cardHeader).foregroundStyle(Self.mint).frame(width: 44, height: 44)
                    }.buttonStyle(.plain).accessibilityLabel(showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu")
                }
            }
            Toggle(isOn: $remember) {
                Text("Nhớ máy này").mtFont(.cardHeader).foregroundStyle(Color.mtTextPrimary)
            }.tint(Self.lime).padding(.top, 2)
            .accessibilityHint("Lần sau mở bằng \(Biometric.name), không cần mật khẩu")
            primary("Đăng nhập", disabled: email.isEmpty || password.isEmpty) { await submit() }.padding(.top, 8)
            if saved { outline("Dùng \(Biometric.name)") { error = nil; mode = .welcome } }
        }
    }

    // MARK: Mã 6 số — 6 ô số to, đủ 6 số tự xác minh, dán mã một chạm (sửa 25/09/2026: trước đây trống và bị bàn phím che nút)
    private var codeStep: some View {
        let digits = Array(code.filter(\.isNumber).prefix(6))
        let isTotp = step?.step == "totp"
        return VStack(spacing: 16) {
            HStack(spacing: 12) {
                Image(systemName: isTotp ? "lock.shield.fill" : "envelope.badge.fill")
                    .font(.system(size: 20, weight: .semibold)).foregroundStyle(Self.limeInk)
                    .frame(width: 44, height: 44).background(Self.lime, in: .rect(cornerRadius: 13))
                VStack(alignment: .leading, spacing: 2) {
                    Text(isTotp ? "Ứng dụng xác thực" : "Mã gửi qua email").mtFont(.cardHeader).foregroundStyle(Color.mtTextPrimary)
                    Text(isTotp ? "Google Authenticator, 1Password… · mã đổi mỗi 30 giây" : "Kiểm tra hộp thư, cả mục Quảng cáo / Spam").mtFont(.caption).foregroundStyle(Self.mint)
                }
                Spacer(minLength: 0)
            }
            .padding(14).background(Color.mtSurfaceCell, in: .rect(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.mtCardBorder))

            ZStack {
                // Ô nhập thật (trong suốt) nằm dưới 6 ô hiển thị: giữ được tự điền mã từ tin nhắn / email và bàn phím số.
                TextField("", text: $code)
                    .keyboardType(.numberPad).textContentType(.oneTimeCode)
                    .accessibilityLabel(title)
                    .focused($focus, equals: .code).foregroundStyle(.clear).tint(.clear).opacity(0.02)
                    .onChange(of: code) { _, v in
                        let clean = String(v.filter(\.isNumber).prefix(6))
                        if clean != v { code = clean }
                        if clean.count == 6, !busy { Task { await verify() } }
                    }
                HStack(spacing: 8) {
                    ForEach(0..<6, id: \.self) { i in
                        let active = focus == .code && i == min(digits.count, 5)
                        Text(i < digits.count ? String(digits[i]) : "")
                            .font(.title.bold()).monospacedDigit().foregroundStyle(Color.mtTextPrimary).lineLimit(1).minimumScaleFactor(0.5)
                            .frame(maxWidth: .infinity).frame(minHeight: 60)
                            .background(Color.mtSurfaceCell, in: .rect(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(active ? Self.lime : Color.mtCardBorder, lineWidth: active ? 2 : 1))
                            .thinkingGlow(busy, radius: 14)
                            .animation(.snappy(duration: 0.18), value: digits.count)
                    }
                }
                .accessibilityHidden(true)
                .contentShape(Rectangle()).onTapGesture { focus = .code }
            }

            if let error {
                Label(error, systemImage: "exclamationmark.triangle.fill").mtFont(.cardHeader).foregroundStyle(Color.mtDangerInk)
                    .frame(maxWidth: .infinity, alignment: .leading).transition(.opacity)
            }
            responsiveLayout {
                Button {
                    if let p = UIPasteboard.general.string?.filter(\.isNumber), p.count >= 6 { code = String(p.prefix(6)) } else { error = "Bộ nhớ tạm không có mã 6 số." }
                } label: {
                    Label("Dán mã", systemImage: "doc.on.clipboard").mtFont(.cardHeader).foregroundStyle(Color.mtTextPrimary)
                        .frame(maxWidth: .infinity).padding(.vertical, 13)
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.mtCardBorder, lineWidth: 1.2))
                }.buttonStyle(.plain).disabled(busy)
                primary(busy ? "Đang kiểm tra…" : "Xác minh", disabled: digits.count < 6) { await verify() }
            }
            Button { back() } label: {
                Label("Đăng nhập lại", systemImage: "arrow.uturn.backward").mtFont(.cardHeader).foregroundStyle(Self.mint)
            }.buttonStyle(.plain).padding(.top, 2)
        }
        .onAppear { focus = .code }
    }

    // MARK: Duyệt trên app khác
    private var approveStep: some View {
        VStack(spacing: 16) {
            if let n = step?.number {
                VStack(spacing: 10) {
                    Text("\(n)").mtFont(.heroNumber).monospacedDigit().foregroundStyle(Self.limeInk).lineLimit(1).minimumScaleFactor(0.6)
                        .frame(width: 128, height: 128).background(Self.lime, in: .rect(cornerRadius: 30))
                        .thinkingGlow(pollStatus == "pending", radius: 30).padding(.vertical, 6)
                    HStack(spacing: 8) {
                        Text(pollStatus == "denied" ? "Yêu cầu bị từ chối" : remaining > 0 ? "Đang chờ duyệt · còn \(remaining / 60):\(String(format: "%02d", remaining % 60))" : "Đang chờ duyệt…").mtFont(.body).foregroundStyle(Self.mint).monospacedDigit()
                    }
                }.frame(maxWidth: .infinity).padding(.vertical, 8)
            }
            Text("Trên app đang đăng nhập (iPhone hoặc Android), một bảng \"Có người đang đăng nhập?\" sẽ hiện ra. Chọn đúng số này rồi xác nhận.").mtFont(.caption).foregroundStyle(Self.mint).multilineTextAlignment(.center)
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
    private func label(_ text: String) -> some View {
        Text(text).mtFont(.cardHeader).foregroundStyle(Color.mtTextPrimary).padding(.bottom, -6)
    }
    private func field<C: View>(@ViewBuilder _ c: () -> C) -> some View {
        c().font(.body).foregroundStyle(Color.mtTextPrimary).tint(Self.lime)
            .padding(.horizontal, 16).padding(.vertical, 13)
            .background(Color.mtSurfaceCell, in: .rect(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.mtCardBorder))
    }
    private func primary(_ title: String, disabled: Bool, _ action: @escaping () async -> Void) -> some View {
        Button { Task { await action() } } label: {
            Text(busy ? "Đang xử lý…" : title)
                .font(.headline).foregroundStyle(Self.limeInk).frame(maxWidth: .infinity).padding(.vertical, 15)
                .background(Self.lime.opacity(disabled ? 0.45 : 1), in: .rect(cornerRadius: 14)).thinkingGlow(busy, radius: 14)
        }.buttonStyle(.plain).disabled(busy || disabled)
    }
    private func outline(_ title: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).mtFont(.cardHeader).foregroundStyle(Color.mtTextPrimary).frame(maxWidth: .infinity).padding(.vertical, 14)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.mtCardBorder, lineWidth: 1.2))
        }.buttonStyle(.plain).disabled(busy)
    }

    // MARK: Hành động
    private func back() { step = nil; code = ""; error = nil; pollStatus = "pending"; mode = .form }

    @MainActor private func submit() async {
        // Như web: bấm đăng nhập thì bỏ chọn ô nhập, linh vật mở mắt chờ kết quả.
        focus = nil
        loginSince = lock.backgrounds
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
        focus = nil
        loginSince = lock.backgrounds
        busy = true; error = nil
        defer { busy = false }
        do { await handle(try await API.verify(challengeId: s.challengeId ?? "", code: code.filter(\.isNumber), kind: s.step == "totp" ? "totp" : "otp")) }
        catch { self.error = error.localizedDescription; code = ""; focus = .code }
    }
    @MainActor private func handle(_ s: API.LoginStep) async {
        switch s.step {
        case "done": password = ""; await auth.signedIn(since: loginSince); if auth.state != .signedIn { error = auth.notice ?? "Không mở được phiên, đăng nhập lại." }
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
                case "done": await auth.signedIn(since: loginSince); if auth.state != .signedIn { back(); error = auth.notice ?? "Không mở được phiên, đăng nhập lại." }; return
                case "denied": error = "Yêu cầu bị từ chối."; return
                case "expired", "invalid", "consumed": back(); error = "Yêu cầu đã hết hạn, đăng nhập lại."; return
                default: break
                }
            }
            for _ in 0..<2 where !Task.isCancelled { try? await Task.sleep(for: .seconds(1)); remaining = max(0, Int(deadline.timeIntervalSinceNow)) }
        }
    }
}
