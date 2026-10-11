import SwiftUI

/// Màn "Cài đặt trên máy này" (tab Thêm › Cài đặt): lựa chọn chỉ lưu trên iPhone này (@AppStorage), không đổi gì trên web
/// hay ở máy khác. Bản đầu có "Màn logo khi mở app" (kế hoạch 1.2a, chờ anh chọn: mặc định "Chỉ lần đầu") và "Mở app vào"
/// (kế hoạch 1.4, mặc định tab cuối cùng đang xem).
struct AppSettingsView: View {
    @AppStorage(IntroPrefs.modeKey) private var introMode: IntroMode = .first
    @AppStorage(NavMemory.openKey) private var openTab: OpenTab = .last

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PageTitle(title: "Cài đặt trên máy này", subtitle: "Chỉ lưu trên iPhone này, không đổi gì trên web")
                HStack(spacing: 6) {
                    MetricIcon("sparkles", size: 12, weight: .bold).foregroundStyle(Color.brand)
                    Text("Màn logo khi mở app").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink)
                }.padding(.top, 4)
                VStack(spacing: 0) {
                    ForEach(Array(IntroMode.allCases.enumerated()), id: \.element) { i, m in
                        let on = m == introMode
                        Button { introMode = m } label: {
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(m.title).font(.system(size: 14, weight: on ? .semibold : .medium)).foregroundStyle(Color.ink)
                                    Text(m.hint).font(.system(size: 11)).foregroundStyle(Color.inkSoft).fixedSize(horizontal: false, vertical: true)
                                }
                                Spacer()
                                Image(systemName: on ? "checkmark.circle.fill" : "circle").font(.system(size: 18)).foregroundStyle(on ? Color.good : Color.inkSoft.opacity(0.5))
                            }.padding(12).contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(on ? .isSelected : [])
                        if i < IntroMode.allCases.count - 1 { Divider().padding(.leading, 12) }
                    }
                }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                HStack(spacing: 6) {
                    MetricIcon("square.grid.2x2.fill", size: 12, weight: .bold).foregroundStyle(Color.brand)
                    Text("Mở app vào").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink)
                }.padding(.top, 4)
                VStack(spacing: 0) {
                    ForEach(Array(OpenTab.allCases.enumerated()), id: \.element) { i, t in
                        let on = t == openTab
                        Button { openTab = t } label: {
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(t.title).font(.system(size: 14, weight: on ? .semibold : .medium)).foregroundStyle(Color.ink)
                                    Text(t.hint).font(.system(size: 11)).foregroundStyle(Color.inkSoft).fixedSize(horizontal: false, vertical: true)
                                }
                                Spacer()
                                Image(systemName: on ? "checkmark.circle.fill" : "circle").font(.system(size: 18)).foregroundStyle(on ? Color.good : Color.inkSoft.opacity(0.5))
                            }.padding(12).contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(on ? .isSelected : [])
                        if i < OpenTab.allCases.count - 1 { Divider().padding(.leading, 12) }
                    }
                }.background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "info.circle.fill").font(.system(size: 15)).foregroundStyle(Color.good)
                    Text("Mở app và mỗi lần quay lại app vẫn luôn phải \(Biometric.name), mật mã iPhone hoặc mật khẩu MEGATECH. Lựa chọn có hiệu lực từ lần mở app sau.")
                        .font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                }.padding(12).frame(maxWidth: .infinity, alignment: .leading).background(Color.brandSoft, in: .rect(cornerRadius: 12))
            }.padding(16).padding(.bottom, 90)
        }
        .navigationTitle("Cài đặt trên máy này").navigationBarTitleDisplayMode(.inline).brandNav()
    }
}
