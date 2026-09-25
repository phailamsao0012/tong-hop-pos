import SwiftUI
import WebKit

/// Các trang chưa làm bản riêng: mở web ngay trong app, dùng chung phiên đăng nhập với phần gốc.
struct WebTab: View {
    let path: String
    var body: some View { WebView(url: URL(string: path, relativeTo: API.base)!).ignoresSafeArea(edges: .bottom) }
}

struct WebView: UIViewRepresentable {
    let url: URL
    func makeUIView(context: Context) -> WKWebView {
        let view = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        view.allowsBackForwardNavigationGestures = true
        let store = view.configuration.websiteDataStore.httpCookieStore
        let cookies = SessionStore.webCookies(for: API.base)
        let group = DispatchGroup()
        for c in cookies { group.enter(); store.setCookie(c) { group.leave() } }
        group.notify(queue: .main) { view.load(URLRequest(url: url)) }
        return view
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
