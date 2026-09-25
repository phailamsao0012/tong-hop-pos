import SwiftUI
import AVFoundation
import VisionKit

// Duyệt đăng nhập máy tính trên app: quét QR trên máy tính, hoặc duyệt bước hai khi ai đó đăng nhập bằng mật khẩu.
// Chọn đúng số đang hiện trên máy tính rồi xác nhận bằng Face ID; chọn sai số = chặn luôn.

@Observable final class ApprovalCenter {
    var current: API.Approval?
    /// Thông báo sau khi duyệt / quét (hiện ở cuối sheet hoặc màn quét).
    var message: String?
    /// Không hiện lại yêu cầu đã xử lý hoặc đã đóng.
    private var handled: Set<String> = []
    #if DEBUG
    private var debugDone = false
    #endif

    @MainActor func check() async {
        guard current == nil, let items = try? await API.approvals() else { return }
        if let next = items.first(where: { !handled.contains($0.id) }) { message = nil; current = next }
    }
    /// Sau khi quét QR: lấy thông tin yêu cầu. Trả lỗi (chuỗi) nếu mã hết hạn / không hợp lệ.
    @MainActor func open(id: String) async -> String? {
        do { let item = try await API.approval(id: id); handled.remove(id); message = nil; current = item; return nil }
        catch { return error.localizedDescription }
    }
    @MainActor func close() { if let c = current { handled.insert(c.id) }; current = nil }
    @MainActor func reset() { current = nil; handled = []; message = nil }

    /// Lấy id từ mã QR dạng <host>/qr/<id>. Mã khác → nil.
    static func qrId(from text: String) -> String? {
        guard let r = text.range(of: "/qr/") else { return nil }
        let id = text[r.upperBound...].prefix { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }
        return id.count >= 6 && id.allSatisfy(\.isASCII) ? String(id) : nil
    }

    #if DEBUG
    /// Bản DEBUG: mở thẳng yêu cầu có id trong biến môi trường MEGATECH_QR (thay cho quét camera trên máy ảo).
    @MainActor func debugOpenFromEnvironment() {
        guard !debugDone, let raw = ProcessInfo.processInfo.environment["MEGATECH_QR"], !raw.isEmpty else { return }
        debugDone = true
        let id = Self.qrId(from: raw) ?? raw
        Task { if let err = await open(id: id) { message = err } }
    }
    #endif
}

/// Sheet "Đăng nhập trên máy tính?" (theo mẫu đã duyệt): máy nào, ở đâu, chọn số, xác nhận bằng Face ID.
struct ApprovalSheet: View {
    let item: API.Approval
    @Environment(ApprovalCenter.self) private var center
    @State private var pick: Int?
    @State private var busy = false
    @State private var result: (ok: Bool, text: String)?
    /// Face ID không dùng được / bị huỷ → xác nhận bằng mật khẩu MEGATECH (hoặc mật mã iPhone).
    @State private var fallback = false
    @State private var password = ""
    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.28).ignoresSafeArea().onTapGesture { if result == nil && !busy { center.close() } }
            VStack(spacing: 14) {
                Capsule().fill(Color.black.opacity(0.15)).frame(width: 38, height: 5).padding(.top, 2)
                HStack {
                    Text(item.kind == "qr" ? "Đăng nhập trên máy tính?" : "Có người đang đăng nhập?").font(.system(size: 18, weight: .bold)).foregroundStyle(Color.ink)
                    Spacer()
                    Button { center.close() } label: { Image(systemName: "xmark").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.inkSoft).frame(width: 30, height: 30).background(Color.black.opacity(0.05), in: .circle) }.buttonStyle(.plain).disabled(busy)
                }
                HStack(spacing: 12) {
                    Image(systemName: deviceIcon).font(.system(size: 22, weight: .semibold)).foregroundStyle(Color.brand).frame(width: 48, height: 48).background(Color.brandSoft, in: .rect(cornerRadius: 12))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(item.device ?? "Máy không rõ").font(.system(size: 14, weight: .bold)).foregroundStyle(Color.ink).lineLimit(2)
                        Text([item.place, item.ip.map { "IP \($0)" }, Ago.text(item.createdAt)].compactMap { $0 }.joined(separator: " · ")).font(.system(size: 11)).foregroundStyle(Color.inkSoft).lineLimit(2)
                    }
                    Spacer(minLength: 0)
                }.padding(12).background(Color.black.opacity(0.03), in: .rect(cornerRadius: 14))
                if let result {
                    VStack(spacing: 8) {
                        Image(systemName: result.ok ? "checkmark.circle.fill" : "hand.raised.fill").font(.system(size: 40)).foregroundStyle(result.ok ? Color.good : Color.bad)
                        Text(result.text).font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.ink).multilineTextAlignment(.center)
                    }.padding(.vertical, 18).frame(maxWidth: .infinity)
                    PrimaryButton(title: "Xong") { center.close() }
                } else {
                    Text("Chọn số đang hiện trên máy tính").font(.system(size: 13)).foregroundStyle(Color.inkSoft)
                    HStack(spacing: 12) {
                        ForEach(item.choices, id: \.self) { n in
                            Button { withAnimation(.snappy(duration: 0.2)) { pick = n } } label: {
                                Text("\(n)").font(.system(size: 30, weight: .heavy, design: .rounded)).monospacedDigit()
                                    .foregroundStyle(pick == n ? .white : Color.ink).frame(width: 72, height: 72)
                                    .background(pick == n ? Color.brand : Color.card, in: .rect(cornerRadius: 16))
                                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(pick == n ? Color.brand : Color.black.opacity(0.14)))
                            }.buttonStyle(.plain).disabled(busy)
                        }
                    }
                    VStack(spacing: 8) {
                        Button { Task { await approve() } } label: {
                            HStack(spacing: 8) { Image(systemName: Biometric.icon); Text(busy ? "Đang xác nhận…" : "Xác nhận bằng \(Biometric.name)") }
                                .font(.system(size: 15, weight: .bold)).foregroundStyle(.white).frame(maxWidth: .infinity).padding(.vertical, 14)
                                .background(pick == nil ? Color.brand.opacity(0.4) : Color.brand, in: .rect(cornerRadius: 14)).thinkingGlow(busy, radius: 14)
                        }.buttonStyle(.plain).disabled(pick == nil || busy)
                        Button { Task { await deny() } } label: {
                            Text("Không phải tôi · chặn").font(.system(size: 14, weight: .bold)).foregroundStyle(Color.bad).frame(maxWidth: .infinity).padding(.vertical, 13)
                                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.bad.opacity(0.5), lineWidth: 1.5))
                        }.buttonStyle(.plain).disabled(busy)
                    }
                    if fallback {
                        HStack(spacing: 8) {
                            SecureField("Mật khẩu MEGATECH", text: $password).textContentType(.password).font(.system(size: 14))
                                .padding(.horizontal, 12).padding(.vertical, 11).background(Color.black.opacity(0.04), in: .rect(cornerRadius: 12))
                            Button { Task { await approveWithPassword() } } label: { Text("Xác nhận").font(.system(size: 13, weight: .bold)).foregroundStyle(.white).padding(.horizontal, 14).padding(.vertical, 11).background(Color.brand.opacity(pick == nil || password.isEmpty ? 0.4 : 1), in: .rect(cornerRadius: 12)) }
                                .buttonStyle(.plain).disabled(pick == nil || password.isEmpty || busy)
                        }
                        if Biometric.hasPasscode { Button("Dùng mật mã iPhone") { Task { if await Biometric.passcode("Cho máy tính đăng nhập MEGATECH") { await send() } } }.font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.brand).disabled(pick == nil || busy) }
                    }
                    if let m = center.message { Text(m).font(.system(size: 12)).foregroundStyle(Color.bad).multilineTextAlignment(.center) }
                }
            }
            .padding(.horizontal, 18).padding(.top, 10).padding(.bottom, 24)
            .background(Color.card, in: UnevenRoundedRectangle(topLeadingRadius: 26, topTrailingRadius: 26))
            .shadow(color: .black.opacity(0.18), radius: 24, y: -4)
        }
        .ignoresSafeArea(edges: .bottom)
    }
    private var deviceIcon: String {
        let d = (item.device ?? "").lowercased()
        return d.contains("iphone") || d.contains("android") ? "iphone" : d.contains("mac") ? "laptopcomputer" : "desktopcomputer"
    }
    @MainActor private func approve() async {
        guard pick != nil else { return }
        center.message = nil
        switch await Biometric.check("Cho máy tính đăng nhập MEGATECH") {
        case .ok: await send()
        case .cancelled: fallback = true
        case .failed(let m), .unavailable(let m): fallback = true; center.message = m + " Có thể xác nhận bằng mật khẩu MEGATECH."
        }
    }
    @MainActor private func approveWithPassword() async {
        busy = true
        let r = await API.reauth(password: password)
        busy = false
        switch r {
        case .ok: password = ""; await send()
        case .wrong(let m): center.message = m
        case .expired: center.close()
        }
    }
    @MainActor private func send() async {
        guard let pick else { return }
        busy = true; defer { busy = false }
        do {
            let r = try await API.decide(id: item.id, number: pick, approve: true)
            switch r.status {
            case "approved": result = (true, "Đã cho máy tính đăng nhập")
            case "wrong-number": result = (false, "Sai số — đã chặn yêu cầu. Nếu bạn không đăng nhập, hãy đổi mật khẩu.")
            default: result = (false, "Đã chặn")
            }
        } catch { result = (false, error.localizedDescription) }
    }
    @MainActor private func deny() async {
        busy = true; defer { busy = false }
        do { _ = try await API.decide(id: item.id, number: nil, approve: false); result = (false, "Đã chặn") }
        catch { result = (false, error.localizedDescription) }
    }
}

enum Ago {
    /// "vừa xong" / "5 phút trước" / "2 giờ trước" / "3 ngày trước".
    static func text(_ iso: String?) -> String? {
        guard let iso, let d = Fmt.parseISO(iso) else { return nil }
        let m = Int(Date.now.timeIntervalSince(d) / 60)
        return m < 1 ? "vừa xong" : m < 60 ? "\(m) phút trước" : m < 1440 ? "\(m / 60) giờ trước" : "\(m / 1440) ngày trước"
    }
}

/// Che nội dung khi app không active (màn đa nhiệm / chuyển app): nền xanh thương hiệu + logo.
struct PrivacyCover: View {
    var body: some View {
        ZStack {
            Brand.gradient.opacity(0.97).ignoresSafeArea()
            VStack(spacing: 12) {
                MegatechLogo(size: 72)
                Text("MEGATECH").font(.system(size: 20, weight: .heavy, design: .rounded)).foregroundStyle(.white)
            }
        }
    }
}

/// Logo chữ M (hai cột + chữ V) màu vàng chanh trên nền xanh đậm.
struct MegatechLogo: View {
    var size: CGFloat = 44
    var body: some View {
        Canvas { ctx, s in
            let k = s.width / 64
            ctx.fill(Path(roundedRect: CGRect(x: 0, y: 0, width: 64 * k, height: 64 * k), cornerRadius: 16 * k), with: .color(Color(hex: 0x0f3328)))
            ctx.stroke(Path(roundedRect: CGRect(x: 0.5, y: 0.5, width: 63 * k, height: 63 * k), cornerRadius: 16 * k), with: .color(Color(hex: 0x2b5d4e)), lineWidth: 1)
            ctx.fill(Path(roundedRect: CGRect(x: 11 * k, y: 18 * k, width: 9 * k, height: 34 * k), cornerRadius: 3 * k), with: .color(.lime))
            ctx.fill(Path(roundedRect: CGRect(x: 44 * k, y: 18 * k, width: 9 * k, height: 34 * k), cornerRadius: 3 * k), with: .color(.lime))
            var v = Path(); v.move(to: CGPoint(x: 15.5 * k, y: 21.5 * k)); v.addLine(to: CGPoint(x: 32 * k, y: 39 * k)); v.addLine(to: CGPoint(x: 48.5 * k, y: 21.5 * k))
            ctx.stroke(v, with: .color(.lime), style: StrokeStyle(lineWidth: 7 * k, lineCap: .round, lineJoin: .round))
        }
        .frame(width: size, height: size)
        .accessibilityLabel("MEGATECH")
    }
}

// MARK: Quét QR

/// Dòng "Quét đăng nhập máy tính" (tab Thêm và màn Bảo mật).
struct ScanLoginRow: View {
    @State private var scanning = false
    var body: some View {
        Button { scanning = true } label: {
            HStack(spacing: 12) {
                Image(systemName: "qrcode.viewfinder").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.lime).frame(width: 40, height: 40).background(Color.brandDeep, in: .rect(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Quét đăng nhập máy tính").font(.system(size: 14, weight: .bold)).foregroundStyle(Color.ink)
                    Text("Quét mã QR trên màn đăng nhập web, xác nhận bằng \(Biometric.name)").font(.system(size: 11)).foregroundStyle(Color.inkSoft).lineLimit(2)
                }
                Spacer(); Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft)
            }.padding(12).background(Color.card, in: .rect(cornerRadius: 14)).cardShadow().contentShape(.rect)
        }
        .buttonStyle(.plain)
        .fullScreenCover(isPresented: $scanning) { QRScanScreen() }
    }
}

struct QRScanScreen: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(ApprovalCenter.self) private var center
    @State private var error: String?
    @State private var busy = false
    @State private var manual = ""
    @State private var denied = false
    private var dataScanner: Bool { DataScannerViewController.isSupported && DataScannerViewController.isAvailable }
    private var hasCamera: Bool { AVCaptureDevice.default(for: .video) != nil }
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if denied {
                Text("App chưa được dùng camera. Vào Cài đặt → MEGATECH → bật Camera.").font(.system(size: 14)).foregroundStyle(.white).multilineTextAlignment(.center).padding(32)
            } else if dataScanner {
                DataScannerView { handle($0) }.ignoresSafeArea()
            } else if hasCamera {
                AVScannerView { handle($0) }.ignoresSafeArea()
            } else {
                VStack(spacing: 10) {
                    Image(systemName: "camera.fill").font(.system(size: 36)).foregroundStyle(.white.opacity(0.6))
                    Text("Máy này không có camera để quét.").font(.system(size: 14)).foregroundStyle(.white.opacity(0.85))
                }
            }
            // Khung ngắm
            RoundedRectangle(cornerRadius: 24).stroke(Color.lime, lineWidth: 3).frame(width: 240, height: 240).allowsHitTesting(false).opacity(denied ? 0 : 1)
            VStack {
                HStack {
                    Button { dismiss() } label: { Image(systemName: "xmark").font(.system(size: 15, weight: .bold)).foregroundStyle(.white).frame(width: 40, height: 40).background(.white.opacity(0.18), in: .circle) }
                    Spacer()
                }.padding(16)
                Text("Quét đăng nhập máy tính").font(.system(size: 18, weight: .bold)).foregroundStyle(.white)
                Text("Hướng camera vào mã QR trên màn đăng nhập web MEGATECH").font(.system(size: 12)).foregroundStyle(.white.opacity(0.75)).multilineTextAlignment(.center).padding(.horizontal, 40)
                Spacer()
                VStack(spacing: 10) {
                    if busy { Text("Đang mở yêu cầu…").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white).padding(.horizontal, 16).padding(.vertical, 10).overlay(ThinkingBorder(radius: 12)) }
                    if let error { Label(error, systemImage: "exclamationmark.triangle.fill").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white).padding(12).background(Color.bad.opacity(0.9), in: .rect(cornerRadius: 12)) }
                    #if DEBUG
                    // Bản DEBUG trên máy ảo (không có camera): dán đường dẫn / mã QR để thử.
                    HStack(spacing: 8) {
                        TextField("", text: $manual, prompt: Text("Dán mã hoặc link /qr/… (DEBUG)").foregroundStyle(.white.opacity(0.5))).font(.system(size: 13)).foregroundStyle(.white).textInputAutocapitalization(.never).autocorrectionDisabled()
                            .padding(10).background(.white.opacity(0.12), in: .rect(cornerRadius: 10))
                        Button("Mở") { handle(manual.contains("/qr/") ? manual : "http://x/qr/" + manual.trimmingCharacters(in: .whitespaces)) }.font(.system(size: 13, weight: .bold)).foregroundStyle(Color.brandDeep).padding(.horizontal, 14).padding(.vertical, 10).background(Color.lime, in: .rect(cornerRadius: 10)).disabled(manual.isEmpty)
                    }
                    #endif
                }.padding(20)
            }
        }
        .task {
            if hasCamera, AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined { denied = !(await AVCaptureDevice.requestAccess(for: .video)) }
            else if hasCamera { denied = AVCaptureDevice.authorizationStatus(for: .video) == .denied }
        }
    }
    private func handle(_ text: String) {
        guard !busy else { return }
        guard let id = ApprovalCenter.qrId(from: text) else { error = "Đây không phải mã đăng nhập MEGATECH"; return }
        busy = true; error = nil
        Task { @MainActor in
            let err = await center.open(id: id)
            busy = false
            if let err { error = err } else { dismiss() }
        }
    }
}

/// VisionKit: quét mã QR (iPhone có Neural Engine).
struct DataScannerView: UIViewControllerRepresentable {
    let found: (String) -> Void
    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .balanced, isHighlightingEnabled: true)
        vc.delegate = context.coordinator
        try? vc.startScanning()
        return vc
    }
    func updateUIViewController(_ vc: DataScannerViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(found: found) }
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let found: (String) -> Void; private var last = ""
        init(found: @escaping (String) -> Void) { self.found = found }
        func dataScanner(_ s: DataScannerViewController, didAdd items: [RecognizedItem], allItems: [RecognizedItem]) {
            for i in items { if case .barcode(let b) = i, let v = b.payloadStringValue, v != last { last = v; found(v) } }
        }
    }
}

/// AVFoundation: dự phòng khi máy không hỗ trợ VisionKit.
struct AVScannerView: UIViewControllerRepresentable {
    let found: (String) -> Void
    func makeUIViewController(context: Context) -> ScannerVC { let vc = ScannerVC(); vc.found = found; return vc }
    func updateUIViewController(_ vc: ScannerVC, context: Context) {}
    final class ScannerVC: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
        var found: (String) -> Void = { _ in }
        private let session = AVCaptureSession()
        private var preview: AVCaptureVideoPreviewLayer?
        private var last = ""
        override func viewDidLoad() {
            super.viewDidLoad()
            view.backgroundColor = .black
            guard let dev = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: dev), session.canAddInput(input) else { return }
            session.addInput(input)
            let out = AVCaptureMetadataOutput()
            guard session.canAddOutput(out) else { return }
            session.addOutput(out)
            out.setMetadataObjectsDelegate(self, queue: .main)
            out.metadataObjectTypes = [.qr]
            let p = AVCaptureVideoPreviewLayer(session: session); p.videoGravity = .resizeAspectFill
            view.layer.addSublayer(p); preview = p
            let s = session
            DispatchQueue.global(qos: .userInitiated).async { s.startRunning() }
        }
        override func viewDidLayoutSubviews() { super.viewDidLayoutSubviews(); preview?.frame = view.bounds }
        override func viewWillDisappear(_ animated: Bool) { super.viewWillDisappear(animated); let s = session; DispatchQueue.global().async { s.stopRunning() } }
        func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objs: [AVMetadataObject], from connection: AVCaptureConnection) {
            for o in objs { if let r = o as? AVMetadataMachineReadableCodeObject, let v = r.stringValue, v != last { last = v; found(v) } }
        }
    }
}
