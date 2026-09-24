import SwiftUI

struct LoginView: View {
    @Environment(AuthModel.self) private var auth
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @State private var challenge: API.LoginStep?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 14) {
                    RoundedRectangle(cornerRadius: 16).fill(Color.brandDeep).frame(width: 60, height: 60)
                        .overlay(Text("M").font(.system(size: 34, weight: .black)).foregroundStyle(Color.lime))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("MEGATECH").font(.title2.bold())
                        Text("Tổng hợp POS · CSKH & Sale").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                .padding(.top, 40)

                if let challenge {
                    Text(challenge.step == "totp" ? "Nhập mã 6 số trong ứng dụng xác thực." : "Nhập mã 6 số đã gửi tới \(challenge.to ?? "email").")
                        .font(.subheadline).foregroundStyle(.secondary)
                    TextField("Mã xác minh", text: $code)
                        .keyboardType(.numberPad).textContentType(.oneTimeCode)
                        .font(.title2.monospacedDigit()).padding(14)
                        .background(.quaternary.opacity(0.5), in: .rect(cornerRadius: 12))
                } else {
                    VStack(spacing: 12) {
                        TextField("Email", text: $email).textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                            .padding(14).background(.quaternary.opacity(0.5), in: .rect(cornerRadius: 12))
                        SecureField("Mật khẩu", text: $password).textContentType(.password)
                            .padding(14).background(.quaternary.opacity(0.5), in: .rect(cornerRadius: 12))
                    }
                }

                if let error { Label(error, systemImage: "exclamationmark.triangle.fill").font(.subheadline).foregroundStyle(Color.bad) }

                Button { Task { await submit() } } label: {
                    HStack { if busy { ProgressView().tint(.white) }; Text(challenge == nil ? "Đăng nhập" : "Xác minh").bold() }
                        .frame(maxWidth: .infinity).padding(.vertical, 14)
                }
                .buttonStyle(.borderedProminent).tint(.brand).clipShape(.rect(cornerRadius: 12))
                .disabled(busy || (challenge == nil ? (email.isEmpty || password.isEmpty) : code.count < 6))

                if challenge != nil { Button("Đăng nhập lại") { challenge = nil; code = "" }.font(.subheadline) }
            }
            .padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    @MainActor private func submit() async {
        busy = true; error = nil
        defer { busy = false }
        do {
            let step = if let challenge {
                try await API.verify(challengeId: challenge.challengeId ?? "", code: code, kind: challenge.step == "totp" ? "totp" : "otp")
            } else {
                try await API.login(email: email.trimmingCharacters(in: .whitespaces), password: password)
            }
            if step.step == "done" { await auth.signedIn() } else { challenge = step; code = "" }
        } catch { self.error = error.localizedDescription }
    }
}
