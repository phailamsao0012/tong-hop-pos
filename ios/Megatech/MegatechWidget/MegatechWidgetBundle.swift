import WidgetKit
import SwiftUI

// Widget MEGATECH. Hiện chỉ có bản thăm dò (plan 2.9, mục 4.6): kiểm app gửi được dữ liệu sang widget hay không.
// Widget không dùng mạng và không bao giờ dùng phiên đăng nhập của app.
@main
struct MegatechWidgetBundle: WidgetBundle {
    var body: some Widget {
        ProbeWidget()
    }
}
