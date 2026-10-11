import SwiftUI

#if DEBUG
/// Bản Debug: MEGATECH_WIDGETS=1 mở thẳng khung xem widget (không đăng nhập, không mạng) để workflow "iOS preview" quay
/// đoạn 6-widget và lấy ảnh PNG từng thẻ (Documents/widget-gallery). Thẻ bản thử vẽ đúng view của widget (ProbeWidgetView);
/// phần "Bố cục dự kiến" vẽ widget đầy đủ theo plan mục 4.3 với số ảo. Không phải widget thật.
struct WidgetGalleryView: View {
    static let enabled = ProcessInfo.processInfo.environment["MEGATECH_WIDGETS"] == "1"
    static let caption = "Khung xem trước, số ảo. Widget thật kiểm trên máy của anh."

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Widget MEGATECH").font(.system(size: 24, weight: .heavy, design: .rounded)).foregroundStyle(.white)
                        Text(Self.caption).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.lime)
                    }
                    .id("top")
                    ForEach(GallerySection.all) { s in section(s) }
                }
                .padding(16).padding(.bottom, 40)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .task { await autoScroll(proxy) }
        }
        .background(LinearGradient(colors: [Color(red: 0.13, green: 0.42, blue: 0.32), Color(red: 0.36, green: 0.64, blue: 0.5)], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
        .safeAreaInset(edge: .bottom) {
            Text(Self.caption).font(.system(size: 12, weight: .semibold)).foregroundStyle(.white)
                .padding(.vertical, 8).frame(maxWidth: .infinity).background(.black.opacity(0.4))
        }
        .environment(\.colorScheme, .light)
        .task { await exportPNGs() }
    }

    private func section(_ s: GallerySection) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(s.title).font(.system(size: 16, weight: .heavy, design: .rounded)).foregroundStyle(.white)
            if s.pairs {
                ForEach(Array(stride(from: 0, to: s.cards.count, by: 2)), id: \.self) { i in
                    HStack(alignment: .top, spacing: 14) {
                        card(s.cards[i])
                        if i + 1 < s.cards.count { card(s.cards[i + 1]) }
                    }
                }
            } else {
                ForEach(s.cards) { c in card(c) }
            }
        }
        .id(s.id)
    }

    private func card(_ c: GalleryCard) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            GalleryCardView(card: c).shadow(color: .black.opacity(c.lock ? 0 : 0.2), radius: 10, y: 4)
            Text(c.label).font(.system(size: 11, weight: .semibold)).foregroundStyle(.white).shadow(color: .black.opacity(0.3), radius: 2)
                .lineLimit(2).frame(width: c.size.width, alignment: .leading)
        }
        .id(c.id)
    }

    /// Tự cuộn chậm qua mọi mục rồi quay lại đầu (máy ảo không chạm được; video quay khoảng 35 giây).
    @MainActor private func autoScroll(_ proxy: ScrollViewProxy) async {
        let stops = ["top"] + GallerySection.all.dropFirst().map(\.id) + ["du-kien-vua", "du-kien-lon", "du-kien-khoa"]
        try? await Task.sleep(for: .seconds(3))
        while !Task.isCancelled {
            for id in stops {
                withAnimation(.easeInOut(duration: 1.2)) { proxy.scrollTo(id, anchor: .top) }
                try? await Task.sleep(for: .seconds(3.5))
                if Task.isCancelled { return }
            }
        }
    }

    /// Xuất mỗi thẻ ra PNG (scale 3) vào Documents/widget-gallery/<tên>.png để CI lấy ra.
    @MainActor private func exportPNGs() async {
        let fm = FileManager.default
        guard let docs = fm.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let dir = docs.appendingPathComponent("widget-gallery", isDirectory: true)
        try? fm.removeItem(at: dir)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        for s in GallerySection.all {
            for c in s.cards {
                let r = ImageRenderer(content: GalleryCardView(card: c))
                r.scale = 3
                if let png = r.uiImage?.pngData() { try? png.write(to: dir.appendingPathComponent(c.id + ".png")) }
                await Task.yield()
            }
        }
    }
}

/// Một thẻ widget trong khung xem: id cũng là tên file PNG.
private struct GalleryCard: Identifiable {
    let id: String
    let label: String
    let size: CGSize
    /// Kiểu màn khoá: nền tối mờ, chữ sáng (iOS vẽ widget màn khoá đơn sắc).
    var lock = false
    let content: AnyView
}

private struct GallerySection: Identifiable {
    let id: String
    let title: String
    /// Xếp hai thẻ một hàng.
    let pairs: Bool
    let cards: [GalleryCard]

    static let small = CGSize(width: 170, height: 170)
    static let medium = CGSize(width: 364, height: 170)
    static let large = CGSize(width: 364, height: 382)
    static let rect = CGSize(width: 172, height: 76)

    /// Giờ minh hoạ cố định 14:30 hôm nay (giờ Việt Nam).
    static let demoNow = ProbeTime.calendar.date(bySettingHour: 14, minute: 30, second: 0, of: Date()) ?? Date()

    @MainActor static var all: [GallerySection] {
        let ran = demoNow
        let states: [(key: String, label: String, state: ProbeState)] = [
            (key: "a", label: "a. Đã nhận dữ liệu từ app", state: ProbeState.received(ran.addingTimeInterval(-12 * 60))),
            (key: "b", label: "b. Có App Group, app chưa gửi", state: ProbeState.waiting),
            (key: "c", label: "c. Không có App Group", state: ProbeState.noGroup),
            (key: "d", label: "d. Máy đang khóa", state: ProbeState.locked),
        ]
        let smallCards = states.map { s in
            GalleryCard(id: "thu-nho-\(s.key)", label: s.label, size: Self.small,
                        content: AnyView(ProbeWidgetView(state: s.state, ranAt: ran, family: .small, refresh: AnyView(ProbeWidgetView.refreshLabel))))
        }
        let rectCards = states.map { s in
            GalleryCard(id: "thu-khoa-\(s.key)", label: s.label, size: Self.rect, lock: true,
                        content: AnyView(ProbeWidgetView(state: s.state, ranAt: ran, family: .rectangular)))
        }
        let planned = [
            GalleryCard(id: "du-kien-nho", label: "Nhỏ", size: Self.small, content: AnyView(PlanRevenue(now: ran).padding(14))),
            GalleryCard(id: "du-kien-vua", label: "Vừa", size: Self.medium, content: AnyView(PlanMedium(now: ran))),
            GalleryCard(id: "du-kien-lon", label: "Lớn", size: Self.large, content: AnyView(PlanLarge(now: ran))),
            GalleryCard(id: "du-kien-khoa", label: "Màn khóa · máy đang khóa (ẩn số)", size: Self.rect, lock: true, content: AnyView(PlanLockHidden())),
        ]
        return [
            GallerySection(id: "thu-nho", title: "Bản thử · cỡ nhỏ (màn hình chính)", pairs: true, cards: smallCards),
            GallerySection(id: "thu-khoa", title: "Bản thử · màn khóa (chữ nhật)", pairs: true, cards: rectCards),
            GallerySection(id: "du-kien", title: "Bố cục dự kiến (số ảo minh hoạ)", pairs: false, cards: planned),
        ]
    }
}

/// Thẻ bo góc đúng cỡ widget thật: nền sáng cho màn hình chính, nền tối mờ cho màn khoá.
private struct GalleryCardView: View {
    let card: GalleryCard
    var body: some View {
        card.content
            .frame(width: card.size.width, height: card.size.height)
            .background(card.lock ? Color.black.opacity(0.35) : ProbeColors.paper)
            .clipShape(.rect(cornerRadius: card.lock ? 16 : 22, style: .continuous))
            .environment(\.colorScheme, card.lock ? .dark : .light)
    }
}

// MARK: Bố cục dự kiến (plan mục 4.3), số ảo tròn

private struct PlanRow: Identifiable {
    let name: String
    let value: Double
    var id: String { name }
}

private enum PlanDemo {
    static let revenue = 91_700_000.0
    static let teams = [PlanRow(name: "Sale", value: 52_000_000), PlanRow(name: "CSKH", value: 24_000_000), PlanRow(name: "MKT", value: 38_000_000)]
    static let pos = [
        PlanRow(name: "POS 1", value: 24_000_000), PlanRow(name: "POS 2", value: 19_000_000), PlanRow(name: "POS 3", value: 16_000_000),
        PlanRow(name: "POS 4", value: 13_000_000), PlanRow(name: "POS 5", value: 11_000_000), PlanRow(name: "POS 6", value: 8_700_000),
    ]
    /// Vận đơn: không có chữ "doanh thu" hay "chốt".
    static let vanDon = "Vận đơn · 120 đơn chuyển đi · Doanh số chuyển đi \(ProbeTime.money(85_000_000))"
    static let todo = 7
}

/// Khối "Doanh thu hôm nay" (cỡ nhỏ, và bên trái cỡ vừa / lớn).
private struct PlanRevenue: View {
    let now: Date
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("MEGATECH").font(.system(size: 10, weight: .heavy, design: .rounded)).foregroundStyle(ProbeColors.green)
            Text("Doanh thu hôm nay").font(.system(size: 12, weight: .semibold)).foregroundStyle(ProbeColors.inkSoft).padding(.top, 6)
            Text(ProbeTime.money(PlanDemo.revenue)).font(.system(size: 26, weight: .bold, design: .rounded)).foregroundStyle(ProbeColors.ink)
                .monospacedDigit().lineLimit(1).minimumScaleFactor(0.6).padding(.top, 1)
            Spacer(minLength: 4)
            Text("Tổng cộng Pancake · Mọi POS · 0h–\(ProbeTime.time(now))").font(.system(size: 10)).foregroundStyle(ProbeColors.inkSoft).lineLimit(2)
            Text("Cập nhật \(ProbeTime.time(now))").font(.system(size: 10, weight: .medium)).foregroundStyle(ProbeColors.green).padding(.top, 3)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// Bên phải cỡ vừa / lớn: mỗi bộ phận một số, xem riêng, không cộng.
private struct PlanTeams: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("Theo bộ phận · xem riêng, không cộng").font(.system(size: 9, weight: .semibold)).foregroundStyle(ProbeColors.inkSoft).lineLimit(2)
            ForEach(PlanDemo.teams) { t in
                HStack {
                    Text(t.name).font(.system(size: 12, weight: .semibold)).foregroundStyle(ProbeColors.ink)
                    Spacer(minLength: 4)
                    Text(ProbeTime.money(t.value)).font(.system(size: 12, weight: .bold, design: .rounded)).foregroundStyle(ProbeColors.ink).monospacedDigit()
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct PlanVanDon: View {
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "shippingbox.fill").font(.system(size: 10, weight: .semibold)).foregroundStyle(ProbeColors.green)
            Text(PlanDemo.vanDon).font(.system(size: 10, weight: .medium)).foregroundStyle(ProbeColors.ink).lineLimit(1).minimumScaleFactor(0.7)
        }
    }
}

private struct PlanMedium: View {
    let now: Date
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                PlanRevenue(now: now)
                Rectangle().fill(ProbeColors.inkSoft.opacity(0.2)).frame(width: 1)
                PlanTeams()
            }
            Rectangle().fill(ProbeColors.inkSoft.opacity(0.2)).frame(height: 1)
            PlanVanDon()
        }
        .padding(14)
    }
}

private struct PlanLarge: View {
    let now: Date
    var body: some View {
        let top = PlanDemo.pos.map(\.value).max() ?? 1
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top, spacing: 12) {
                PlanRevenue(now: now)
                Rectangle().fill(ProbeColors.inkSoft.opacity(0.2)).frame(width: 1)
                PlanTeams()
            }
            .frame(height: 128)
            Rectangle().fill(ProbeColors.inkSoft.opacity(0.2)).frame(height: 1)
            PlanVanDon()
            Rectangle().fill(ProbeColors.inkSoft.opacity(0.2)).frame(height: 1)
            VStack(alignment: .leading, spacing: 5) {
                Text("Theo POS · Tổng cộng Pancake").font(.system(size: 9, weight: .semibold)).foregroundStyle(ProbeColors.inkSoft)
                ForEach(PlanDemo.pos) { p in
                    HStack(spacing: 8) {
                        Text(p.name).font(.system(size: 11, weight: .semibold)).foregroundStyle(ProbeColors.ink).frame(width: 42, alignment: .leading)
                        ZStack(alignment: .leading) {
                            Capsule().fill(ProbeColors.greenSoft).frame(width: 180, height: 8)
                            Capsule().fill(ProbeColors.green).frame(width: 180 * p.value / top, height: 8)
                        }
                        Spacer(minLength: 4)
                        Text(ProbeTime.money(p.value)).font(.system(size: 11, weight: .bold, design: .rounded)).foregroundStyle(ProbeColors.ink).monospacedDigit()
                    }
                }
            }
            Spacer(minLength: 0)
            HStack(spacing: 6) {
                Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 11)).foregroundStyle(ProbeColors.warn)
                Text("Cần xử lý: \(PlanDemo.todo) việc").font(.system(size: 12, weight: .bold)).foregroundStyle(ProbeColors.ink)
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(ProbeColors.inkSoft)
            }
        }
        .padding(14)
    }
}

/// Màn khoá khi máy đang khoá: luôn ẩn số.
private struct PlanLockHidden: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Image(systemName: "lock.fill").font(.system(size: 14, weight: .semibold))
            Text("MEGATECH · mở để xem").font(.system(size: 14, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.8)
        }
        .foregroundStyle(.primary)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}
#endif
