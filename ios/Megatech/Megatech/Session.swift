import Foundation
import LocalAuthentication
import Security
import UIKit
import Observation

/// Lưu phiên đăng nhập (token cookie thp_session) trong Keychain, chỉ đọc được trên máy này sau lần mở khoá đầu tiên.
/// Không lưu mật khẩu. Bản cũ để cookie trong HTTPCookieStorage → tự chuyển sang Keychain lần đầu mở app.
enum SessionStore {
    private static let service = "vn.megatech.pos.session"
    private static let tokenKey = "thp_session"
    private static let emailKey = "thp_last_email"

    static var token: String? {
        get { Keychain.read(service: service, account: tokenKey) }
        set { if let newValue, !newValue.isEmpty { Keychain.write(newValue, service: service, account: tokenKey) } else { Keychain.delete(service: service, account: tokenKey) } }
    }
    static var hasSession: Bool { token != nil }
    /// Email lần đăng nhập gần nhất (để chào "Chào mừng trở lại"). Không phải bí mật, để trong UserDefaults.
    static var lastEmail: String? {
        get { UserDefaults.standard.string(forKey: emailKey) }
        set { UserDefaults.standard.set(newValue, forKey: emailKey) }
    }

    /// Chuyển phiên cũ từ HTTPCookieStorage sang Keychain rồi xoá cookie đó khỏi kho cookie.
    static func migrate() {
        let jar = HTTPCookieStorage.shared
        for c in jar.cookies ?? [] where c.name == tokenKey {
            if token == nil, !c.value.isEmpty, (c.expiresDate ?? .distantFuture) > .now { token = c.value }
            jar.deleteCookie(c)
        }
    }
    /// Đọc Set-Cookie của phản hồi: thp_session → Keychain; cookie khác (thp_device…) → HTTPCookieStorage.
    /// Tự tách header (HTTPCookie bỏ cookie Secure khi thử trên http://localhost).
    static func absorb(_ resp: URLResponse?) {
        guard let http = resp as? HTTPURLResponse, let url = http.url, let raw = http.value(forHTTPHeaderField: "Set-Cookie"), !raw.isEmpty else { return }
        let parts = raw.replacingOccurrences(of: #",(?=\s*[A-Za-z0-9_\-]+=)"#, with: "\u{1}", options: .regularExpression).split(separator: "\u{1}")
        for part in parts {
            let attrs = part.split(separator: ";").map { $0.trimmingCharacters(in: .whitespaces) }
            guard let first = attrs.first, let eq = first.firstIndex(of: "=") else { continue }
            let name = String(first[..<eq]), value = String(first[first.index(after: eq)...])
            var expires: Date? = nil
            for a in attrs.dropFirst() {
                let kv = a.split(separator: "=", maxSplits: 1).map(String.init)
                guard kv.count == 2 else { continue }
                if kv[0].lowercased() == "max-age", let n = Double(kv[1]) { expires = Date().addingTimeInterval(n) }
                else if kv[0].lowercased() == "expires", expires == nil { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"; expires = f.date(from: kv[1]) }
            }
            let dead = value.isEmpty || (expires.map { $0 <= .now } ?? false)
            if name == tokenKey { token = dead ? nil : value; continue }
            let host = url.host ?? ""
            HTTPCookieStorage.shared.cookies?.filter { $0.name == name }.forEach { HTTPCookieStorage.shared.deleteCookie($0) }
            if !dead, let c = HTTPCookie(properties: [.name: name, .value: value, .domain: host, .path: "/", .expires: expires ?? Date().addingTimeInterval(86400 * 180)]) { HTTPCookieStorage.shared.setCookie(c) }
        }
    }
    /// Header Cookie gửi kèm mỗi request (kể cả trên http://localhost khi thử, nơi cookie Secure không được URLSession tự gửi).
    static func cookieHeader(for url: URL) -> String? {
        let host = url.host ?? ""
        var parts = (HTTPCookieStorage.shared.cookies ?? []).filter { c in
            c.name != tokenKey && (c.expiresDate ?? .distantFuture) > .now && (host == c.domain || host.hasSuffix(c.domain.hasPrefix(".") ? c.domain : "." + c.domain))
        }.map { "\($0.name)=\($0.value)" }
        if let t = token { parts.append("\(tokenKey)=\(t)") }
        return parts.isEmpty ? nil : parts.joined(separator: "; ")
    }
    /// Cookie cho WKWebView (các trang mở web trong app).
    static func webCookies(for base: URL) -> [HTTPCookie] {
        var out = HTTPCookieStorage.shared.cookies(for: base) ?? []
        if let t = token, let host = base.host,
           let c = HTTPCookie(properties: [.name: tokenKey, .value: t, .domain: host, .path: "/", .secure: base.scheme == "https" ? "TRUE" : "FALSE", .expires: Date().addingTimeInterval(86400 * 30)]) { out.append(c) }
        return out
    }
    static func clear() {
        token = nil
        HTTPCookieStorage.shared.cookies?.filter { $0.name == tokenKey }.forEach { HTTPCookieStorage.shared.deleteCookie($0) }
    }
    /// "vu***@gmail.com": 2 ký tự đầu + *** + @tên miền.
    static func mask(_ email: String) -> String {
        let p = email.split(separator: "@", maxSplits: 1)
        guard p.count == 2 else { return email }
        return String(p[0].prefix(2)) + "***@" + p[1]
    }
}

enum Keychain {
    static func read(service: String, account: String) -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }
    static func write(_ value: String, service: String, account: String) {
        let data = Data(value.utf8)
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        let attrs: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        if SecItemUpdate(q as CFDictionary, attrs as CFDictionary) == errSecItemNotFound {
            SecItemAdd(q.merging(attrs) { $1 } as CFDictionary, nil)
        }
    }
    static func delete(service: String, account: String) {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account] as CFDictionary)
    }
}

/// Tên máy gửi lên máy chủ (X-Megatech-Device) để danh sách thiết bị dễ đọc: "iPhone 15 Pro".
enum DeviceName {
    static let current: String = {
        var id = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] ?? ""
        if id.isEmpty {
            var u = utsname(); uname(&u)
            id = withUnsafeBytes(of: &u.machine) { b in String(decoding: b.prefix { $0 != 0 }, as: UTF8.self) }
        }
        return models[id] ?? UIDevice.current.model
    }()
    private static let models: [String: String] = [
        "iPhone12,1": "iPhone 11", "iPhone12,3": "iPhone 11 Pro", "iPhone12,5": "iPhone 11 Pro Max", "iPhone12,8": "iPhone SE",
        "iPhone13,1": "iPhone 12 mini", "iPhone13,2": "iPhone 12", "iPhone13,3": "iPhone 12 Pro", "iPhone13,4": "iPhone 12 Pro Max",
        "iPhone14,4": "iPhone 13 mini", "iPhone14,5": "iPhone 13", "iPhone14,2": "iPhone 13 Pro", "iPhone14,3": "iPhone 13 Pro Max", "iPhone14,6": "iPhone SE",
        "iPhone14,7": "iPhone 14", "iPhone14,8": "iPhone 14 Plus", "iPhone15,2": "iPhone 14 Pro", "iPhone15,3": "iPhone 14 Pro Max",
        "iPhone15,4": "iPhone 15", "iPhone15,5": "iPhone 15 Plus", "iPhone16,1": "iPhone 15 Pro", "iPhone16,2": "iPhone 15 Pro Max",
        "iPhone17,3": "iPhone 16", "iPhone17,4": "iPhone 16 Plus", "iPhone17,1": "iPhone 16 Pro", "iPhone17,2": "iPhone 16 Pro Max", "iPhone17,5": "iPhone 16e",
        "iPhone18,3": "iPhone 17", "iPhone18,1": "iPhone 17 Pro", "iPhone18,2": "iPhone 17 Pro Max", "iPhone18,4": "iPhone Air",
    ]
}

/// Xác thực sinh trắc học. Chỉ dùng Face ID / Touch ID (không để iOS tự hiện màn nhập mật mã xám);
/// khi không dùng được thì màn của app đưa ra lựa chọn "Nhập mật khẩu MEGATECH" hoặc "Dùng mật mã iPhone".
/// Đang hiện hộp Face ID của chính app (app tạm "inactive") → không phủ màn che đa nhiệm lên trên.
@Observable final class BiometricPrompt { static let shared = BiometricPrompt(); var active = false }

enum Biometric {
    enum Outcome: Equatable { case ok, cancelled, failed(String), unavailable(String) }
    static var name: String {
        let c = LAContext(); _ = c.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch c.biometryType { case .faceID: return "Face ID"; case .touchID: return "Touch ID"; case .opticID: return "Optic ID"; default: return "Face ID" }
    }
    static var icon: String { let c = LAContext(); _ = c.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil); return c.biometryType == .touchID ? "touchid" : "faceid" }
    static var available: Bool { LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) }
    static var hasPasscode: Bool { LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) }

    @MainActor static func check(_ reason: String) async -> Outcome {
        let ctx = LAContext(); ctx.localizedCancelTitle = "Để sau"; ctx.localizedFallbackTitle = ""
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err) else {
            switch LAError.Code(rawValue: err?.code ?? 0) {
            case .biometryNotEnrolled: return .unavailable("Máy chưa cài \(name).")
            case .biometryLockout: return .unavailable("\(name) đang bị khoá do thử sai nhiều lần.")
            default: return .unavailable("Máy không dùng được \(name).")
            }
        }
        BiometricPrompt.shared.active = true
        defer { Task { @MainActor in try? await Task.sleep(for: .milliseconds(600)); BiometricPrompt.shared.active = false } }
        do { return try await ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) ? .ok : .failed("Chưa xác thực được, thử lại.") }
        catch let e as LAError {
            switch e.code {
            case .userCancel, .appCancel, .systemCancel, .userFallback: return .cancelled
            case .biometryLockout: return .unavailable("\(name) đang bị khoá do thử sai nhiều lần.")
            default: return .failed("Chưa xác thực được, thử lại.")
            }
        } catch { return .failed("Chưa xác thực được, thử lại.") }
    }
    @MainActor static func verify(_ reason: String) async -> Bool { await check(reason) == .ok }
    /// Lựa chọn cuối: mật mã iPhone (màn hệ thống).
    @MainActor static func passcode(_ reason: String) async -> Bool {
        let ctx = LAContext(); ctx.localizedCancelTitle = "Để sau"
        BiometricPrompt.shared.active = true
        defer { Task { @MainActor in try? await Task.sleep(for: .milliseconds(600)); BiometricPrompt.shared.active = false } }
        do { return try await ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) } catch { return false }
    }
}
