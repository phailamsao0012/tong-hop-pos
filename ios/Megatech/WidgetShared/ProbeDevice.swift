import Foundation
import UIKit
import CryptoKit

/// identifierForVendor ở dạng băm, để so app và widget có cùng giá trị không (đường B, plan 4.5 bước 3).
/// Không bao giờ lưu hay hiện giá trị gốc.
enum ProbeDevice {
    /// 8 ký tự hex đầu của SHA-256(identifierForVendor). nil khi iOS chưa cấp giá trị (máy vừa khởi động, chưa mở khóa).
    @MainActor static func vendorHash() -> String? {
        guard let id = UIDevice.current.identifierForVendor else { return nil }
        let digest = SHA256.hash(data: Data(id.uuidString.utf8))
        return String(digest.map { String(format: "%02x", $0) }.joined().prefix(8))
    }
}
