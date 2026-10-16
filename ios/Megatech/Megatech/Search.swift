import SwiftUI

// Ô tìm gọi máy chủ dùng chung (kế hoạch 1.5): nút "Tìm" trên bàn phím, tắt tự sửa chữ và tự viết hoa, có nút xóa; chờ khoảng
// 0,55 giây sau khi ngừng gõ mới gửi; gõ tiếp thì hủy lượt cũ (kết quả cũ không đè kết quả mới); bỏ "%" và "_" trước khi gửi
// (máy chủ tìm bằng LIKE, vẫn phải tự chặn); máy chủ báo 429 thì ghi "Tìm quá nhanh, thử lại sau ít giây".
// Từ khóa được phân loại trước khi gửi, để máy chủ đi đúng chỉ mục, không quét cả bảng đơn:
// - SĐT: 9–11 chữ số sau khi bỏ dấu cách, dấu chấm, gạch ngang, "+"; 84… / +84… đổi thành 0…, 9 số thì thêm 0 ở đầu.
// - Mã đơn: 4–8 chữ số không bắt đầu bằng 0 (mã đơn Pancake là số, không có 0 ở đầu; "0912…" là SĐT đang gõ dở), hoặc "#" rồi
//   chữ số (bỏ dấu #). Máy chủ chưa tra mã theo khóa chính (codesByKey) thì mã đơn chỉ tìm trong kỳ đang xem, có lọc ngày.
// - Tên: còn lại, có từ 3 chữ cái.
// Từ khóa không được lưu trên máy và không ghi vào log: log thời gian của bản Debug ("[MOC] tim …") chỉ ghi loại từ khóa và mili giây.

/// Loại từ khóa (tên dùng trong log của bản Debug).
enum SearchKind: String {
    case phone, code, name
}

/// Từ khóa đã chuẩn hóa, sẵn để gửi.
struct SearchTerm: Equatable {
    let kind: SearchKind
    let value: String
}

/// Chữ trong ô tìm: chưa gõ, gõ chưa đủ để gửi, hoặc đủ (SĐT, mã đơn, tên).
enum SearchInput: Equatable {
    case empty
    case incomplete
    case term(SearchTerm)
    var term: SearchTerm? { if case .term(let t) = self { return t }; return nil }
}

enum SearchText {
    /// Máy chủ đã tra mã đơn theo khóa chính chưa (web, việc 3 của kế hoạch 1.5: `id IN ('pos:mã', …)`). Chưa (false): mã đơn chỉ
    /// tìm trong kỳ đang xem, có lọc ngày, vì câu tìm mã hiện tại của máy chủ (`phone LIKE … OR source_order_id=?`) mà không lọc
    /// ngày là đọc cả bảng đơn (khoảng 5,5 GB). Đổi thành true khi việc 3 đã chạy trên web thật: mã đơn tìm trong mọi ngày, mọi POS.
    static let codesByKey = false
    /// So khớp không dấu: chuẩn hóa NFC, chữ thường, bỏ dấu, đổi "đ" thành "d" ("Nguyễn Đức" → "nguyen duc").
    static func fold(_ s: String) -> String {
        s.precomposedStringWithCanonicalMapping.lowercased()
            .folding(options: .diacriticInsensitive, locale: Locale(identifier: "vi_VN"))
            .replacingOccurrences(of: "đ", with: "d")
    }
    /// Chữ không có dấu tiếng Việt nào ("hoa", không phải "Hòa"): máy chủ chưa tìm tên không dấu, nên gợi ý gõ có dấu.
    static func isPlain(_ s: String) -> Bool { fold(s) == s.precomposedStringWithCanonicalMapping.lowercased() }
    /// Chuẩn hóa NFC, bỏ "%" và "_", gộp khoảng trắng.
    static func clean(_ s: String) -> String {
        let t = s.precomposedStringWithCanonicalMapping.filter { $0 != "%" && $0 != "_" }
        return t.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }
    /// Phân loại chữ trong ô tìm. codes false: ô không tìm mã đơn (Hồ sơ khách), 4–8 chữ số coi là SĐT chưa đủ số.
    static func parse(_ raw: String, codes: Bool = true) -> SearchInput {
        let text = clean(raw)
        if text.isEmpty { return .empty }
        if let p = phone(text) { return .term(SearchTerm(kind: .phone, value: p)) }
        if codes, let c = code(text) { return .term(SearchTerm(kind: .code, value: c)) }
        if text.filter({ $0.isLetter }).count >= 3 { return .term(SearchTerm(kind: .name, value: String(text.prefix(40)))) }
        return .incomplete
    }
    /// SĐT chuẩn hóa (0…), hoặc nil nếu không phải SĐT 9–11 số. Nhận cả "+84 09…" (12 số, bỏ 84).
    static func phone(_ text: String) -> String? {
        var d = ""
        for c in text {
            if isDigit(c) { d.append(c) }
            else if c == "." || c == "-" || c == "+" || c.isWhitespace { continue }
            else { return nil }
        }
        if d.count == 12 && d.hasPrefix("840") { d.removeFirst(2); return d }
        guard (9...11).contains(d.count) else { return nil }
        if d.count == 11 && d.hasPrefix("84") { return "0" + String(d.dropFirst(2)) }
        if d.count == 9 && !d.hasPrefix("0") { return "0" + d }
        return d
    }
    /// Mã đơn (chỉ chữ số), hoặc nil. Không có "#" thì không nhận số bắt đầu bằng 0: đó là SĐT đang gõ dở, không gửi tìm mã.
    static func code(_ text: String) -> String? {
        if text.hasPrefix("#") {
            let rest = text.dropFirst().trimmingCharacters(in: .whitespaces)
            return !rest.isEmpty && rest.count <= 12 && rest.allSatisfy(isDigit) ? rest : nil
        }
        return (4...8).contains(text.count) && !text.hasPrefix("0") && text.allSatisfy(isDigit) ? text : nil
    }
    /// Giá trị tham số q trên đường dẫn: chỉ để nguyên chữ cái, chữ số Latin và "-._~"; còn lại mã hóa (kể cả "+", "&", "#").
    static func urlValue(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: urlAllowed) ?? "" }
    private static let urlAllowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
    private static func isDigit(_ c: Character) -> Bool { c >= "0" && c <= "9" }
}

/// Câu lỗi của một lượt tìm: như LoadError, thêm 429 (giới hạn số lượt tìm) và câu riêng cho 403. nil = lượt tìm bị hủy.
enum SearchError {
    static func text(_ error: Error, forbidden: String? = nil) -> String? {
        if let a = error as? API.APIError {
            if a.status == 429 { return "Tìm quá nhanh, thử lại sau ít giây" }
            if a.status == 403, let forbidden { return forbidden }
        }
        return LoadError.text(error)
    }
}

/// Kết quả một ô tìm gọi máy chủ. Chỉ báo "không thấy" khi một lượt tìm đã xong thật (done), không báo khi lỗi hay đang chờ.
struct SearchState<Row> {
    var input: SearchInput = .empty
    /// Từ khóa của lượt tìm đang chạy hoặc vừa xong.
    var term: SearchTerm?
    var rows: [Row] = []
    var hasMore = false
    /// Tổng số dòng khớp máy chủ đếm được (nếu có).
    var total: Double?
    /// Đang chờ máy chủ.
    var loading = false
    var error: String?
    var done = false

    mutating func reset(_ input: SearchInput) { self = SearchState(); self.input = input }
    mutating func begin(_ t: SearchTerm) {
        input = .term(t); term = t
        rows = []; hasMore = false; total = nil
        loading = true; error = nil; done = false
    }
    mutating func finish(_ rows: [Row], hasMore: Bool, total: Double? = nil) {
        self.rows = rows; self.hasMore = hasMore; self.total = total
        loading = false; error = nil; done = true
    }
    mutating func fail(_ text: String) {
        rows = []; hasMore = false; total = nil
        loading = false; error = text; done = false
    }
    /// Lượt tìm cho t đang chạy hoặc đã xong: chữ trong ô đổi mà từ khóa không đổi (ví dụ thêm dấu cách) thì không gửi lại.
    func covers(_ t: SearchTerm) -> Bool { term == t && (done || loading) }
}

/// Chờ ngừng gõ rồi mới tìm: gõ tiếp thì bỏ lượt đang chờ; lượt mới bắt đầu thì hủy lượt đang chạy (request cũ bị hủy, kết quả
/// cũ không đè kết quả mới). Dùng Task riêng (không dùng .task(id:)): hộp Face ID làm app tạm "inactive" không hủy lượt tìm.
final class SearchRunner {
    static let pause: Duration = .milliseconds(550)
    private var pending: Task<Void, Never>?
    private var running: Task<Void, Never>?
    func run(after delay: Duration, _ work: @escaping @MainActor () async -> Void) {
        pending?.cancel()
        pending = Task { @MainActor [weak self] in
            if delay > .zero {
                try? await Task.sleep(for: delay)
                if Task.isCancelled { return }
            }
            guard let self else { return }
            self.running?.cancel()
            self.running = Task { @MainActor in await work() }
        }
    }
    /// Bỏ lượt đang chờ ngừng gõ (lượt đang chạy vẫn chạy tiếp).
    func cancelPending() { pending?.cancel(); pending = nil }
    /// Bỏ cả lượt đang chờ lẫn lượt đang chạy.
    func cancel() { cancelPending(); running?.cancel(); running = nil }
}

/// Ô tìm dùng chung: kính lúp, ô chữ (nút "Tìm" trên bàn phím, không tự sửa, không tự viết hoa), nút xóa chữ đã gõ.
struct SearchField: View {
    let prompt: String
    @Binding var text: String
    var submit: () -> Void = {}
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(Color.inkSoft)
            TextField(prompt, text: $text)
                .font(.system(size: 13))
                .submitLabel(.search)
                .autocorrectionDisabled(true)
                .textInputAutocapitalization(.never)
                .onSubmit { submit() }
            if !text.isEmpty {
                Button { text = "" } label: {
                    Image(systemName: "xmark.circle.fill").font(.system(size: 15)).foregroundStyle(Color.inkSoft)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Xóa chữ đã gõ")
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(Color.card, in: .rect(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.08)))
    }
}

/// Thời gian một lượt tìm (chỉ bản Debug): "[MOC] tim <nơi tìm> <phone|code|name> bat-dau|co-ket-qua|khong-thay|loi|huy
/// <mili giây từ lúc mở app> | <mili giây cả lượt>". Không bao giờ ghi từ khóa, SĐT, tên hay số dòng tìm được.
struct SearchTrace {
    enum Outcome: String { case found = "co-ket-qua", empty = "khong-thay", failed = "loi", cancelled = "huy" }
    #if DEBUG
    private let place: String
    private let kind: String
    private let started = Date()
    #endif
    /// kind nil: chữ trong ô chưa đủ dạng SĐT, mã đơn hay tên ("khac").
    init(_ place: String, kind: SearchKind?) {
        #if DEBUG
        self.place = place
        self.kind = kind?.rawValue ?? "khac"
        print("[MOC] tim \(place) \(self.kind) bat-dau \(LaunchClock.elapsedMs())")
        fflush(stdout)
        #endif
    }
    func end(_ outcome: Outcome) {
        #if DEBUG
        let ms = Int((Date().timeIntervalSince(started) * 1000).rounded())
        print("[MOC] tim \(place) \(kind) \(outcome.rawValue) \(LaunchClock.elapsedMs()) | ca luot \(ms) ms")
        fflush(stdout)
        #endif
    }
}

#if DEBUG
/// Bản Debug: lượt tự xem MEGATECH_TOUR_SEARCH=1 "gõ" vào ô tìm của tab Đơn hàng (máy ảo không gõ được).
@Observable final class DebugSearch {
    static let shared = DebugSearch()
    var orders = ""
}
#endif
