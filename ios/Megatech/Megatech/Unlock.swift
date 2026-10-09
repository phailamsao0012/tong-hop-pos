import SwiftUI

// Mở khoá bằng Face ID trên nền thương hiệu (không để lộ màn nhập mật mã xám của iOS).
// Face ID không dùng được / bị huỷ → ở lại màn của app, đưa lựa chọn "Nhập mật khẩu MEGATECH" hoặc "Dùng mật mã iPhone".

enum Brand {
    static let lime = Color(hex: 0xd9f36d), limeInk = Color(hex: 0x14372d), mint = Color(hex: 0xa7c6b3)
    static let gradient = LinearGradient(colors: [Color(hex: 0x1b5a45), Color(hex: 0x113c30), Color(hex: 0x0c2e25)], startPoint: .top, endPoint: .bottom)
}

/// Logo + chữ MEGATECH dùng ở đầu các màn nền xanh.
struct BrandHeader: View {
    var body: some View {
        HStack(spacing: 10) {
            MegatechLogo(size: 42)
            VStack(alignment: .leading, spacing: 1) {
                Text("MEGATECH").font(.system(size: 18, weight: .heavy, design: .rounded)).foregroundStyle(.white)
                Text("Tổng hợp POS").font(.system(size: 12)).foregroundStyle(Brand.mint)
            }
        }
    }
}

/// Màn chờ lúc mở app (đang kiểm tra phiên).
struct BrandSplash: View {
    var body: some View {
        ZStack {
            Brand.gradient.ignoresSafeArea()
            VStack(spacing: 14) {
                MegatechLogo(size: 72)
                Text("MEGATECH").font(.system(size: 20, weight: .heavy, design: .rounded)).foregroundStyle(.white)
            }
        }
        .preferredColorScheme(.dark)
    }
}

/// Việc xảy ra trong ô mở khoá, để linh vật phản ứng (nhắm mắt khi gõ mật khẩu, buồn khi không khớp).
enum UnlockEvent { case typing(Bool), failed }

/// Ô Face ID lớn + nút vàng chanh + lựa chọn dự phòng. Dùng cho "Chào mừng trở lại" và "App đang khóa".
struct UnlockControls: View {
    let reason: String
    var buttonTitle = "Đăng nhập bằng \(Biometric.name)"
    /// Tự hỏi Face ID một lần khi giá trị này thành true (sau màn mở đầu, khi app đang mở trên màn hình).
    var autoStart = true
    /// Face ID / mật khẩu / mật mã máy đã qua.
    let unlocked: () async -> Void
    /// Phiên trên máy chủ đã hết hạn → phải đăng nhập lại bằng email + mật khẩu.
    let expired: () -> Void
    var onEvent: ((UnlockEvent) -> Void)? = nil
    @State private var busy = false
    @State private var autoTried = false
    @State private var error: String?
    @State private var fallback = false
    @State private var askPassword = false
    @State private var password = ""
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 14) {
            Button { Task { await faceID() } } label: {
                VStack(spacing: 12) {
                    Image(systemName: Biometric.icon).font(.system(size: 50, weight: .light)).foregroundStyle(Brand.lime)
                        .frame(width: 104, height: 104).background(.white.opacity(0.06), in: .rect(cornerRadius: 28))
                        .overlay(RoundedRectangle(cornerRadius: 28).stroke(.white.opacity(busy ? 0 : 0.14)))
                        .thinkingGlow(busy, radius: 28)
                    Text(busy ? "Đang xác thực…" : "Chạm để mở bằng \(Biometric.name)").font(.system(size: 12)).foregroundStyle(Brand.mint)
                }.frame(maxWidth: .infinity).padding(.vertical, 10)
            }.buttonStyle(.plain).disabled(busy)
            if let error { Label(error, systemImage: "exclamationmark.triangle.fill").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color(hex: 0xffb4a8)).multilineTextAlignment(.center) }
            Spacer(minLength: 24)
            if askPassword {
                SecureField("", text: $password, prompt: Text("Mật khẩu MEGATECH").foregroundStyle(.white.opacity(0.45)))
                    .textContentType(.password).focused($focused).submitLabel(.go).onSubmit { Task { await checkPassword() } }
                    .font(.system(size: 16)).foregroundStyle(.white).tint(Brand.lime)
                    .padding(.horizontal, 16).padding(.vertical, 15)
                    .background(.white.opacity(0.08), in: .rect(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(.white.opacity(0.14)))
                limeButton(busy ? "Đang kiểm tra…" : "Xác nhận mật khẩu", icon: "key.fill", disabled: password.isEmpty) { await checkPassword() }
            } else {
                limeButton(busy ? "Đang xác thực…" : buttonTitle, icon: Biometric.icon, disabled: false) { await faceID() }
            }
            if fallback {
                if !askPassword { outline("Nhập mật khẩu MEGATECH") { askPassword = true; error = nil; focused = true } }
                if Biometric.hasPasscode {
                    Button("Dùng mật mã iPhone") { Task { await passcode() } }.font(.system(size: 13, weight: .semibold)).foregroundStyle(Brand.mint).disabled(busy).padding(.top, 2)
                }
            }
        }
        .onAppear {
            if !Biometric.available { fallback = true; askPassword = false; error = "Máy không dùng được \(Biometric.name). Nhập mật khẩu MEGATECH để mở." }
        }
        // Chỉ tự hỏi một lần cho mỗi lần hiện màn: huỷ hộp Face ID thì không bật lại liên tục, chạm nút để thử lại.
        .task(id: autoStart) {
            guard autoStart, !autoTried, Biometric.available else { return }
            autoTried = true
            await faceID()
        }
        .onChange(of: focused) { _, f in onEvent?(.typing(f)) }
    }
    private func limeButton(_ title: String, icon: String, disabled: Bool, _ action: @escaping () async -> Void) -> some View {
        Button { Task { await action() } } label: {
            HStack(spacing: 8) { Image(systemName: icon); Text(title) }
                .font(.system(size: 16, weight: .bold)).foregroundStyle(Brand.limeInk).frame(maxWidth: .infinity).padding(.vertical, 15)
                .background(Brand.lime.opacity(disabled ? 0.45 : 1), in: .rect(cornerRadius: 14)).thinkingGlow(busy, radius: 14)
        }.buttonStyle(.plain).disabled(busy || disabled)
    }
    private func outline(_ title: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(.white).frame(maxWidth: .infinity).padding(.vertical, 14)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(.white.opacity(0.35), lineWidth: 1.2))
        }.buttonStyle(.plain).disabled(busy)
    }
    @MainActor private func faceID() async {
        guard !busy else { return }
        busy = true; error = nil
        let r = await Biometric.check(reason)
        switch r {
        case .ok: await unlocked()
        case .cancelled: fallback = true
        case .failed(let m): fallback = true; error = m; onEvent?(.failed)
        case .unavailable(let m): fallback = true; error = m + " Nhập mật khẩu MEGATECH để mở."
        }
        busy = false
    }
    @MainActor private func passcode() async {
        busy = true; error = nil
        let ok = await Biometric.passcode(reason)
        busy = false
        if ok { await unlocked() }
    }
    @MainActor private func checkPassword() async {
        guard !password.isEmpty else { return }
        busy = true; error = nil
        let r = await API.reauth(password: password)
        busy = false
        switch r {
        case .ok: password = ""; await unlocked()
        case .wrong(let m): error = m; onEvent?(.failed)
        case .expired: password = ""; expired()
        }
    }
}
